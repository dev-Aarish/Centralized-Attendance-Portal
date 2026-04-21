import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const VALID_SESSION_TYPES = ['regular', 'randomized', 'lecture', 'lab', 'tutorial']

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [hours, minutes] = timeStr.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  if (minutes > 0) return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`
  return `${displayHours} ${period}`
}

// Did the student attend? present + late both count. Only absent does not.
function wasAttended(status) {
  return status === 'present' || status === 'late'
}

// Enrich a teacher group with aggregate stats
function enrichTeacher(teacher) {
  const total = teacher.records.length
  const attended = teacher.records.filter(r => wasAttended(r.status)).length
  const percentage = total > 0 ? Math.round((attended / total) * 100) : 0
  return { ...teacher, attended, total, percentage }
}

// Enrich a subject with per-teacher stats + overall rollup
function enrichSubject(subject) {
  const teachers = subject.teachers.map(enrichTeacher)
  const totalRecords = teachers.reduce((acc, t) => acc + t.total, 0)
  const totalAttended = teachers.reduce((acc, t) => acc + t.attended, 0)
  const overallPercentage = totalRecords > 0
    ? Math.round((totalAttended / totalRecords) * 100)
    : 0
  return { ...subject, teachers, overallPercentage }
}

function normalizeYear(value) {
  if (value == null) return null
  const raw = String(value).trim().toLowerCase()
  const numeric = parseInt(raw, 10)
  if (!Number.isNaN(numeric)) return numeric
  if (raw.startsWith('1')) return 1
  if (raw.startsWith('2')) return 2
  if (raw.startsWith('3')) return 3
  if (raw.startsWith('4')) return 4
  return null
}

function toYearFromSemester(semester) {
  const sem = parseInt(semester, 10)
  if (Number.isNaN(sem) || sem <= 0) return null
  return Math.ceil(sem / 2)
}

function normalizeDepartment(value) {
  if (!value) return ''
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester) {
  const yearMatches = studentYear == null || sectionYear == null || sectionYear === studentYear
  const semesterMatches = studentSemester == null || sectionSemester == null || sectionSemester === studentSemester

  // If both are available, allow either match so stale semester values
  // do not hide all sections for a valid year cohort.
  if (studentYear != null && studentSemester != null) {
    return yearMatches || semesterMatches
  }

  return yearMatches && semesterMatches
}

async function resolveTeacherNameMap(supabase, teacherIds = []) {
  const ids = Array.from(new Set((teacherIds || []).filter(Boolean)))
  if (!ids.length) return {}

  const db = supabaseAdmin || supabase
  const { data, error } = await db
    .from('teacher_profiles')
    .select('id, profiles ( full_name )')
    .in('id', ids)

  if (error) {
    console.warn('[attendance] teacher name map lookup skipped:', error.message)
    return {}
  }

  const map = {}
  for (const row of data || []) {
    map[row.id] = row.profiles?.full_name || null
  }
  return map
}

async function getCourseScopedSectionFallbacks(supabase, studentProfile) {
  const studentYear = normalizeYear(studentProfile.year_of_study) ?? toYearFromSemester(studentProfile.current_semester)
  const studentSemester = studentProfile.current_semester ? parseInt(studentProfile.current_semester, 10) : null
  const studentDept = normalizeDepartment(studentProfile.department)

  const { data, error } = await supabase
    .from('class_sections')
    .select(`
      id,
      section,
      year_of_study,
      department,
      courses!inner ( id, name, code, semester, department )
    `)

  if (error) {
    console.error('[attendance] course-scoped section fallback error:', error.message)
    return []
  }

  const byCohort = (data || []).filter((row) => {
    const rowDept = normalizeDepartment(row.department || row.courses?.department)
    if (studentDept && rowDept && rowDept !== studentDept) return false

    const sectionYear = normalizeYear(row.year_of_study)
    const sectionSemester = row.courses?.semester ? parseInt(row.courses.semester, 10) : null
    return matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
  })

  if (!studentProfile.section) return byCohort

  const strictSection = byCohort.filter((row) => row.section === studentProfile.section)
  return strictSection.length ? strictSection : byCohort
}

// Shared helper: get the logged-in student's profile row, or null
async function getStudentProfile(supabase, userId) {
  const { data } = await supabase
    .from('student_profiles')
    .select('id, department, year_of_study, section, current_semester')
    .eq('profile_id', userId)
    .single()
  return data ?? null
}

// Ensure enrollments include all sections matching student's cohort
// so newly offered courses show up without manual per-student enrollment.
async function syncStudentEnrollments(supabase, studentProfile) {
  const { data: existingEnrollments } = await supabase
    .from('enrollments')
    .select('class_section_id')
    .eq('student_id', studentProfile.id)

  const existingSectionIds = new Set((existingEnrollments || []).map((e) => e.class_section_id))

  let candidateQuery = supabase
    .from('class_sections')
    .select(`
      id,
      year_of_study,
      section,
      department,
      courses (semester)
    `)
    .eq('department', studentProfile.department)

  if (studentProfile.section) {
    candidateQuery = candidateQuery.eq('section', studentProfile.section)
  }

  const { data: candidates } = await candidateQuery

  const studentYear = normalizeYear(studentProfile.year_of_study) ?? toYearFromSemester(studentProfile.current_semester)
  const studentSemester = studentProfile.current_semester ? parseInt(studentProfile.current_semester, 10) : null

  let matchedSections = (candidates || [])
    .filter((c) => {
      const sectionYear = normalizeYear(c.year_of_study)
      const sectionSemester = c.courses?.semester ? parseInt(c.courses.semester, 10) : null

      return matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
    })

  if (matchedSections.length === 0 && studentProfile.section) {
    const fallback = await supabase
      .from('class_sections')
      .select(`
        id,
        section,
        year_of_study,
        department,
        courses ( id, name, code, semester )
      `)
      .eq('department', studentProfile.department)

    matchedSections = (fallback.data || []).filter((c) => {
      const sectionYear = normalizeYear(c.year_of_study)
      const sectionSemester = c.courses?.semester ? parseInt(c.courses.semester, 10) : null
      return matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
    })
  }

  const matchedSectionIds = matchedSections.map((c) => c.id)

  const missingSectionIds = matchedSectionIds.filter((id) => !existingSectionIds.has(id))
  if (missingSectionIds.length > 0) {
    await supabase
      .from('enrollments')
      .upsert(
        missingSectionIds.map((classSectionId) => ({
          student_id: studentProfile.id,
          class_section_id: classSectionId,
        })),
        { onConflict: 'student_id,class_section_id' }
      )
  }
}

async function getEffectiveEnrollmentsForStudent(supabase, studentProfile) {
  const { data: rawEnrollments, error: enrollError } = await supabase
    .from('enrollments')
    .select(`
      class_section_id,
      class_sections (
        id,
        section,
        year_of_study,
        department,
        courses ( id, name, code, semester )
      )
    `)
    .eq('student_id', studentProfile.id)

  if (enrollError) return []

  const enrollmentMap = new Map()
  for (const e of rawEnrollments || []) {
    enrollmentMap.set(e.class_section_id, e)
  }

  let candidateQuery = supabase
    .from('class_sections')
    .select(`
      id,
      section,
      year_of_study,
      department,
      courses ( id, name, code, semester )
    `)
    .eq('department', studentProfile.department)

  if (studentProfile.section) {
    candidateQuery = candidateQuery.eq('section', studentProfile.section)
  }

  let { data: candidates } = await candidateQuery

  // If strict section match returns nothing, fall back to dept-level cohort matching.
  if ((!candidates || candidates.length === 0) && studentProfile.section) {
    const fallback = await supabase
      .from('class_sections')
      .select(`
        id,
        section,
        year_of_study,
        department,
        courses ( id, name, code, semester )
      `)
      .eq('department', studentProfile.department)
    candidates = fallback.data || []
  }

  const studentYear = normalizeYear(studentProfile.year_of_study) ?? toYearFromSemester(studentProfile.current_semester)
  const studentSemester = studentProfile.current_semester ? parseInt(studentProfile.current_semester, 10) : null

  const matchedSections = (candidates || []).filter((c) => {
    const sectionYear = normalizeYear(c.year_of_study)
    const sectionSemester = c.courses?.semester ? parseInt(c.courses.semester, 10) : null

    return matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
  })

  const finalSections = matchedSections.length
    ? matchedSections
    : await getCourseScopedSectionFallbacks(supabase, studentProfile)

  for (const section of finalSections) {
    if (!enrollmentMap.has(section.id)) {
      enrollmentMap.set(section.id, {
        class_section_id: section.id,
        class_sections: section,
      })
    }
  }

  return Array.from(enrollmentMap.values())
}

// Shared core: build full attendance detail per subject + teacher for a session type.
// Used by both /details/:type and /summary/:type to avoid duplicated logic.
async function buildAttendanceDetails(supabase, studentId, sessionType) {
  const { data: studentProfile } = await supabase
    .from('student_profiles')
    .select('id, department, year_of_study, section, current_semester')
    .eq('id', studentId)
    .single()

  if (!studentProfile) return []

  // Get effective enrollments as union of actual enrollments + inferred
  // cohort sections to avoid dropping newly offered courses.
  const enrollments = await getEffectiveEnrollmentsForStudent(supabase, studentProfile)
  if (!enrollments?.length) return []

  // Initialize subject map from enrollments so subjects appear even when
  // there are no sessions recorded yet for the requested type.
  const subjectMap = {}
  for (const enrollment of enrollments) {
    const sectionId = enrollment.class_section_id
    const course = enrollment.class_sections?.courses
    if (!sectionId || !course) continue

    if (!subjectMap[sectionId]) {
      subjectMap[sectionId] = {
        subjectCode: course.code,
        subjectName: course.name,
        teachers: {},
      }
    }
  }

  const classSectionIds = enrollments.map(e => e.class_section_id)

  // ── Single query: all sessions of the requested type across all enrolled sections ──
  const { data: sessions, error: sessionError } = await supabase
    .from('attendance_sessions')
    .select(`
      id,
      class_section_id,
      session_date,
      session_type,
      teacher_id,
      teacher_profiles (
        id,
        profiles ( full_name )
      )
    `)
    .in('class_section_id', classSectionIds)
    .eq('session_type', sessionType)
    .order('session_date', { ascending: false })

  if (sessionError) return []
  if (!sessions?.length) {
    return Object.values(subjectMap)
      .map((subject) => enrichSubject({
        ...subject,
        teachers: Object.values(subject.teachers),
      }))
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName))
  }

  const teacherNameMap = await resolveTeacherNameMap(
    supabase,
    sessions.map((s) => s.teacher_id)
  )

  const sessionIds = sessions.map((s) => s.id)

  // Single query: student's attendance records for the fetched sessions.
  const { data: records } = await supabase
    .from('attendance_records')
    .select('session_id, status')
    .eq('student_id', studentId)
    .in('session_id', sessionIds)

  // Build O(1) lookup: session_id → status
  const recordMap = {}
  records?.forEach(r => { recordMap[r.session_id] = r.status })

  // Primary schedule source: class_schedules (new schema).
  const { data: classSchedules } = await supabase
    .from('class_schedules')
    .select('class_section_id, day, start_time, end_time')
    .in('class_section_id', classSectionIds)

  // Legacy fallback for older deployments still using schedules.
  let schedules = classSchedules || []
  if (!schedules.length) {
    const { data: legacySchedules } = await supabase
      .from('schedules')
      .select('class_section_id, day_of_week, start_time, end_time')
      .in('class_section_id', classSectionIds)
    schedules = legacySchedules || []
  }

  // Build O(1) lookup: class_section_id + day → { start, end }
  const scheduleMap = {}
  schedules?.forEach(s => {
    const day = (s.day || s.day_of_week || '').slice(0, 3)
    const key = `${s.class_section_id}__${day}`
    scheduleMap[key] = { start: s.start_time, end: s.end_time }
  })

  // Build O(1) lookup: class_section_id → course info
  const courseMap = {}
  enrollments.forEach(e => {
    courseMap[e.class_section_id] = e.class_sections?.courses ?? null
  })

  // Group sessions by class_section, then by teacher
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  for (const session of sessions) {
    const { class_section_id, teacher_id } = session
    const course = courseMap[class_section_id]
    if (!course) continue

    if (!subjectMap[class_section_id]) {
      subjectMap[class_section_id] = {
        subjectCode: course.code,
        subjectName: course.name,
        teachers: {},
      }
    }

    const teacherKey = teacher_id || 'unassigned'
    const teacherName = session.teacher_profiles?.profiles?.full_name
      || teacherNameMap[teacher_id]
      || (teacher_id ? 'Assigned Teacher' : 'Unassigned')

    if (!subjectMap[class_section_id].teachers[teacherKey]) {
      const nameParts = teacherName.split(' ').filter(Boolean)
      const initials = nameParts.map(p => p[0]).join('').toUpperCase().slice(0, 2)
      subjectMap[class_section_id].teachers[teacherKey] = {
        name: teacherName,
        initials,
        records: [],
      }
    }

    const dateObj = new Date(session.session_date + 'T00:00:00')
    const dayOfWeek = DAY_NAMES[dateObj.getDay()]
    const dateStr = `${MONTH_NAMES[dateObj.getMonth()]} ${dateObj.getDate()}`

    const scheduleKey = `${class_section_id}__${dayOfWeek}`
    const schedule = scheduleMap[scheduleKey]
    const timeStr = schedule
      ? `${formatTime(schedule.start)}–${formatTime(schedule.end)}`
      : ''

    subjectMap[class_section_id].teachers[teacherKey].records.push({
      date: dateStr,
      time: timeStr,
      status: recordMap[session.id] ?? 'absent',
    })
  }

  // Convert nested maps → arrays and enrich with stats
  return Object.values(subjectMap)
    .map(subject => enrichSubject({
      ...subject,
      teachers: Object.values(subject.teachers),
    }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName))
}

// ─── TEACHER: SESSION MANAGEMENT ─────────────────────────────────────────────

// POST /api/v1/attendance/sessions — create a new attendance session
router.post('/sessions', async (req, res) => {
  try {
    const { classSectionId, sessionType = 'regular' } = req.body

    // Validate session type
    if (!VALID_SESSION_TYPES.includes(sessionType)) {
      return res.status(400).json({ error: `Invalid session type. Must be one of: ${VALID_SESSION_TYPES.join(', ')}` })
    }

    // Get teacher profile
    const { data: teacherProfile } = await req.supabase
      .from('teacher_profiles')
      .select('id')
      .eq('profile_id', req.user.id)
      .single()

    if (!teacherProfile) return res.status(403).json({ error: 'No teacher profile found' })

    // Verify this teacher is assigned to the class section
    const { data: assignment } = await req.supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_id', teacherProfile.id)
      .eq('class_section_id', classSectionId)
      .single()

    if (!assignment) {
      return res.status(403).json({ error: 'You are not assigned to this class section' })
    }

    // Block duplicate sessions for the same date
    const today = new Date().toISOString().split('T')[0]
    const { data: existing } = await req.supabase
      .from('attendance_sessions')
      .select('id')
      .eq('class_section_id', classSectionId)
      .eq('session_date', today)
      .single()

    if (existing) {
      return res.status(409).json({ data: existing, error: 'Session already exists for today' })
    }

    const { data, error } = await req.supabase
      .from('attendance_sessions')
      .insert({
        class_section_id: classSectionId,
        teacher_id: teacherProfile.id,
        session_date: today,
        session_type: sessionType,
      })
      .select()
      .single()

    if (error) return res.status(400).json({ error: error.message })
    return res.status(201).json({ data })
  } catch (err) {
    console.error('POST /attendance/sessions error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/v1/attendance/sessions/:id/records — submit attendance records
router.post('/sessions/:id/records', async (req, res) => {
  try {
    const { attendanceMap } = req.body
    const sessionId = req.params.id

    // Validate statuses
    const VALID_STATUSES = ['present', 'absent', 'late']
    const invalid = Object.entries(attendanceMap ?? {})
      .find(([, status]) => !VALID_STATUSES.includes(status))
    if (invalid) {
      return res.status(400).json({ error: `Invalid status "${invalid[1]}" for student ${invalid[0]}` })
    }

    // Verify the session belongs to this teacher
    const { data: teacherProfile } = await req.supabase
      .from('teacher_profiles')
      .select('id')
      .eq('profile_id', req.user.id)
      .single()

    if (!teacherProfile) return res.status(403).json({ error: 'No teacher profile found' })

    const { data: session } = await req.supabase
      .from('attendance_sessions')
      .select('teacher_id')
      .eq('id', sessionId)
      .single()

    if (!session) return res.status(404).json({ error: 'Session not found' })
    if (session.teacher_id !== teacherProfile.id) {
      return res.status(403).json({ error: 'You do not own this session' })
    }

    const records = Object.entries(attendanceMap).map(([studentId, status]) => ({
      session_id: sessionId,
      student_id: studentId,
      status,
    }))

    const { data, error } = await req.supabase
      .from('attendance_records')
      .upsert(records, { onConflict: 'session_id,student_id' })
      .select()

    if (error) return res.status(400).json({ error: error.message })
    return res.json({ data })
  } catch (err) {
    console.error('POST /attendance/sessions/:id/records error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── TEACHER: VIEWING DATA ────────────────────────────────────────────────────

// GET /api/v1/attendance/sections/:id/sessions — all sessions for a section
router.get('/sections/:id/sessions', async (req, res) => {
  try {
    // Verify requester is a teacher assigned to this section
    const { data: teacherProfile } = await req.supabase
      .from('teacher_profiles')
      .select('id')
      .eq('profile_id', req.user.id)
      .single()

    if (!teacherProfile) return res.status(403).json({ error: 'No teacher profile found' })

    const { data: assignment } = await req.supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_id', teacherProfile.id)
      .eq('class_section_id', req.params.id)
      .single()

    if (!assignment) {
      return res.status(403).json({ error: 'You are not assigned to this class section' })
    }

    const { data, error } = await req.supabase
      .from('attendance_sessions')
      .select('*')
      .eq('class_section_id', req.params.id)
      .order('session_date', { ascending: false })

    if (error) return res.status(400).json({ error: error.message })
    return res.json({ data })
  } catch (err) {
    console.error('GET /attendance/sections/:id/sessions error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/attendance/sessions/:id/records — full roster for a session
router.get('/sessions/:id/records', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('attendance_records')
      .select(`
        *,
        student_profiles (
          id,
          roll_number,
          profiles ( full_name )
        )
      `)
      .eq('session_id', req.params.id)
      .order('student_profiles(roll_number)', { ascending: true })

    if (error) return res.status(400).json({ error: error.message })
    return res.json({ data })
  } catch (err) {
    console.error('GET /attendance/sessions/:id/records error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── STUDENT: ATTENDANCE DATA ─────────────────────────────────────────────────

// GET /api/v1/attendance/summary — overall summary across all enrolled sections
// Fixed: single join query instead of N+1, counts 'late' as attended
router.get('/summary', async (req, res) => {
  try {
    const studentProfile = await getStudentProfile(req.supabase, req.user.id)
    if (!studentProfile) return res.json({ data: [] })

    // Single query — join records → sessions → class_sections → courses
    const { data: records, error } = await req.supabase
      .from('attendance_records')
      .select(`
        status,
        attendance_sessions (
          class_section_id,
          class_sections (
            courses ( name, code )
          )
        )
      `)
      .eq('student_id', studentProfile.id)

    if (error) return res.status(400).json({ error: error.message })

    // Aggregate in JS — zero extra round-trips
    const map = {}
    for (const record of records ?? []) {
      const session = record.attendance_sessions
      const key = session?.class_section_id
      const course = session?.class_sections?.courses
      if (!key || !course) continue

      if (!map[key]) {
        map[key] = {
          classSectionId: key,
          courseName: course.name,
          courseCode: course.code,
          total: 0,
          attended: 0,
        }
      }

      map[key].total++
      // Fix: late counts as attended, consistent with lib/attendance.js
      if (wasAttended(record.status)) map[key].attended++
    }

    const data = Object.values(map).map(s => ({
      ...s,
      percentage: s.total > 0 ? Math.round((s.attended / s.total) * 100) : 0,
    }))

    return res.json({ data })
  } catch (err) {
    console.error('GET /attendance/summary error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/attendance/details/:type — full details grouped by subject + teacher
// Fixed: single batch query, no N+1, type validated, late counted
router.get('/details/:type', async (req, res) => {
  try {
    const sessionType = req.params.type

    // Validate session type
    if (!VALID_SESSION_TYPES.includes(sessionType)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_SESSION_TYPES.join(', ')}` })
    }

    const studentProfile = await getStudentProfile(req.supabase, req.user.id)
    if (!studentProfile) return res.json({ data: [] })

    const data = await buildAttendanceDetails(req.supabase, studentProfile.id, sessionType)
    return res.json({ data })
  } catch (err) {
    console.error('GET /attendance/details/:type error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/attendance/summary/:type — compact summary for dashboard rings
// Fixed: reuses buildAttendanceDetails, no duplicated logic
router.get('/summary/:type', async (req, res) => {
  try {
    const sessionType = req.params.type

    // Validate session type
    if (!VALID_SESSION_TYPES.includes(sessionType)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_SESSION_TYPES.join(', ')}` })
    }

    const studentProfile = await getStudentProfile(req.supabase, req.user.id)
    if (!studentProfile) return res.json({ data: [] })

    const details = await buildAttendanceDetails(req.supabase, studentProfile.id, sessionType)

    // Strip down to just what the dashboard rings need
    const data = details.map(s => ({
      name: s.subjectName,
      code: s.subjectCode,
      percentage: s.overallPercentage,
    }))

    return res.json({ data })
  } catch (err) {
    console.error('GET /attendance/summary/:type error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router