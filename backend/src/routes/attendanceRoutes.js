import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { getCachedResponse, setCachedResponse, invalidateUserResponses, devLog } from '../lib/cache.js'
import { sendEmail } from '../lib/email.js'

const router = Router()

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const VALID_SESSION_TYPES = ['all', 'regular', 'randomized', 'lecture', 'lab', 'tutorial']

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
  return { 
    ...subject, 
    teachers, 
    overallPercentage,
    totalClasses: totalRecords,
    attendedClasses: totalAttended
  }
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
      courses!inner ( id, name, code, semester, department, type )
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
        courses ( id, name, code, semester, type )
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
        courses ( id, name, code, semester, type )
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
      courses ( id, name, code, semester, type )
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
        courses ( id, name, code, semester, type )
      `)
      .eq('department', studentProfile.department)
    candidates = fallback.data || []
  }

  const studentYear = normalizeYear(studentProfile.year_of_study) ?? toYearFromSemester(studentProfile.current_semester)
  const studentSemester = studentProfile.current_semester ? parseInt(studentProfile.current_semester, 10) : null

  // Fetch active routine + filter candidates in parallel
  const [routineResult, matchedSections] = await Promise.all([
    supabase
      .from('class_routines')
      .select('id')
      .eq('year_of_study', studentYear)
      .eq('section', studentProfile.section)
      .eq('is_active', true)
      .maybeSingle(),
    Promise.resolve(
      (candidates || []).filter((c) => {
        const sectionYear = normalizeYear(c.year_of_study)
        const sectionSemester = c.courses?.semester ? parseInt(c.courses.semester, 10) : null
        return matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
      })
    ),
  ])

  const activeRoutine = routineResult.data
  let routineSectionIds = []
  if (activeRoutine) {
    const { data: routineSchedules } = await supabase
      .from('class_schedules')
      .select('class_section_id')
      .eq('routine_id', activeRoutine.id)

    routineSectionIds = (routineSchedules || []).map(s => s.class_section_id).filter(Boolean)
  }

  // Merge in sections from the active routine (cross-dept support)
  if (routineSectionIds.length > 0) {
    const { data: routineSections } = await supabase
      .from('class_sections')
      .select(`
        id,
        section,
        year_of_study,
        department,
        courses ( id, name, code, semester, type )
      `)
      .in('id', routineSectionIds)
    
    if (routineSections) {
      routineSections.forEach(rs => {
        if (!matchedSections.find(ms => ms.id === rs.id)) {
          matchedSections.push(rs)
        }
      })
    }
  }

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
    
    // Filter by type if a specific sessionType is requested
    const cType = (course.type || 'Lecture').toLowerCase()
    if (sessionType !== 'all' && sessionType !== cType) continue

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
  let sessionQuery = supabase
    .from('attendance_sessions')
    .select(`
      id,
      class_section_id,
      session_date,
      session_type,
      time_slot,
      teacher_id,
      teacher_profiles (
        id,
        profiles ( full_name )
      )
    `)
    .in('class_section_id', classSectionIds)
    .order('session_date', { ascending: false })

  if (sessionType !== 'all') {
    sessionQuery = sessionQuery.eq('session_type', sessionType)
  }

  const { data: sessions, error: sessionError } = await sessionQuery

  if (sessionError) return []
  if (!sessions?.length) {
    return Object.values(subjectMap)
      .map((subject) => enrichSubject({
        ...subject,
        teachers: Object.values(subject.teachers),
      }))
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName))
  }

  // Fire teacher name resolution, student records, and schedule lookup in parallel
  const [teacherNameMap, recordsResult, classSchedulesResult] = await Promise.all([
    resolveTeacherNameMap(supabase, sessions.map((s) => s.teacher_id)),
    supabase
      .from('attendance_records')
      .select('session_id, status')
      .eq('student_id', studentId)
      .in('session_id', sessions.map((s) => s.id)),
    supabase
      .from('class_schedules')
      .select('class_section_id, day, start_time, end_time')
      .in('class_section_id', classSectionIds),
  ])

  const records = recordsResult.data

  // Build O(1) lookup: session_id → status
  const recordMap = {}
  records?.forEach(r => { recordMap[r.session_id] = r.status })

  // Primary schedule source: class_schedules (new schema).
  let schedules = classSchedulesResult.data || []
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

    const rawTimeSlot = session.time_slot || ''
    const isPlaceholderSlot = /^session\s+\d+$/i.test(rawTimeSlot.trim())
    const sessionTimeStr = !rawTimeSlot || isPlaceholderSlot ? timeStr : rawTimeSlot

    subjectMap[class_section_id].teachers[teacherKey].records.push({
      sessionDate: session.session_date,
      date: dateStr,
      time: sessionTimeStr,
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

const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Compute how many periods a given class_section has on a specific day,
 * broken down by session type (lecture vs lab), based on the active routine.
 *
 * Returns { lecture: N, lab: N, total: N }
 */
async function getMaxSessionsForDay(supabase, classSectionId, dayName) {
  // Find the class_section to resolve its cohort (year + section)
  const { data: section } = await supabase
    .from('class_sections')
    .select('year_of_study, section, department, courses ( type )')
    .eq('id', classSectionId)
    .single()

  if (!section) return { lecture: 0, lab: 0, total: 0 }

  const yearNum = normalizeYear(section.year_of_study)

  // Find the active routine for this cohort
  let routineQuery = supabase
    .from('class_routines')
    .select('id')
    .eq('is_active', true)

  if (yearNum) routineQuery = routineQuery.eq('year_of_study', yearNum)
  if (section.section) routineQuery = routineQuery.eq('section', section.section)

  const { data: activeRoutine } = await routineQuery.maybeSingle()

  if (!activeRoutine) {
    // No routine configured — no sessions allowed until schedule is set up
    return { lecture: 0, lab: 0, total: 0 }
  }

  // Count how many schedule blocks exist for this class_section on this day
  const { data: scheduleBlocks } = await supabase
    .from('class_schedules')
    .select('id, class_section_id, course_id, courses (code)')
    .eq('routine_id', activeRoutine.id)
    .eq('class_section_id', classSectionId)
    .eq('day', dayName)

  // Filter out special/common blocks — they aren't attendable sessions
  const SPECIAL_CODES = ['LIB', 'REM', 'LUNCH']
  const realBlocks = (scheduleBlocks || []).filter(b => {
    const code = (b.courses?.code || '').trim().toUpperCase()
    return !SPECIAL_CODES.includes(code)
  })

  if (realBlocks.length === 0) {
    // No real schedule blocks for this day — no sessions allowed
    return { total: 0 }
  }

  return { total: realBlocks.length }
}

/**
 * Count how many attendance sessions already exist today for a class_section,
 * broken down by session type.
 */
async function getUsedSessionsForDay(supabase, classSectionId, today) {
  const { data: sessions } = await supabase
    .from('attendance_sessions')
    .select('id')
    .eq('class_section_id', classSectionId)
    .eq('session_date', today)

  return { total: sessions ? sessions.length : 0 }
}

// GET /api/v1/attendance/sessions/slots — how many sessions can still be created today
// Query: ?classSectionId=xxx  (optional, if omitted returns for all assigned sections)
router.get('/sessions/slots', async (req, res) => {
  try {
    const { classSectionId } = req.query
    devLog('[slots] Request received, classSectionId:', classSectionId)

    // Get teacher profile
    const { data: teacherProfile, error: tpError } = await req.supabase
      .from('teacher_profiles')
      .select('id')
      .eq('profile_id', req.user.id)
      .single()

    if (tpError) console.error('[slots] teacher_profiles error:', tpError.message)
    if (!teacherProfile) return res.status(403).json({ error: 'No teacher profile found' })

    const today = new Date().toISOString().split('T')[0]
    const todayDay = DAY_NAMES_FULL[new Date().getDay()]
    devLog('[slots] today:', today, 'dayName:', todayDay)

    // Resolve which sections to report on
    let sectionIds = []
    if (classSectionId) {
      sectionIds = [classSectionId]
    } else {
      // Get all assigned sections
      const { data: assignments } = await req.supabase
        .from('teacher_assignments')
        .select('class_section_id')
        .eq('teacher_id', teacherProfile.id)

      sectionIds = (assignments || []).map(a => a.class_section_id)

      // Also include sections where they're the assigned schedule teacher
      const { data: scheduleAssignments } = await req.supabase
        .from('class_schedules')
        .select('class_section_id')
        .eq('teacher_id', teacherProfile.id)

      const scheduleIds = (scheduleAssignments || []).map(s => s.class_section_id)
      sectionIds = Array.from(new Set([...sectionIds, ...scheduleIds]))
    }

    devLog('[slots] sectionIds:', sectionIds)

    if (sectionIds.length === 0) {
      return res.json({ data: [] })
    }

    // Compute slots for each section
    const db = supabaseAdmin || req.supabase
    const results = []

    for (const secId of sectionIds) {
      const max = await getMaxSessionsForDay(db, secId, todayDay)
      const used = await getUsedSessionsForDay(db, secId, today)
      devLog('[slots] section:', secId, 'max:', max, 'used:', used)

      results.push({
        classSectionId: secId,
        day: todayDay,
        date: today,
        total: {
          max: max.total,
          used: used.total,
          remaining: Math.max(0, max.total - used.total),
        },
      })
    }

    devLog('[slots] returning', results.length, 'results')
    return res.json({ data: results })
  } catch (err) {
    console.error('GET /attendance/sessions/slots error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/v1/attendance/sessions — create a new attendance session
router.post('/sessions', async (req, res) => {
  try {
    const { classSectionId, sessionType = 'lecture', timeSlot = '' } = req.body

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
      // Check if they are assigned as a specific teacher for a block in class_schedules
      const { data: scheduleAsgn } = await req.supabase
        .from('class_schedules')
        .select('id')
        .eq('teacher_id', teacherProfile.id)
        .eq('class_section_id', classSectionId)
        .limit(1)

      if (!scheduleAsgn || scheduleAsgn.length === 0) {
        return res.status(403).json({ error: 'You are not assigned to this class section' })
      }
    }

    // ── Period-count-based session limiting ──────────────────────────────
    const today = new Date().toISOString().split('T')[0]
    const todayDay = DAY_NAMES_FULL[new Date().getDay()]
    const db = supabaseAdmin || req.supabase

    // Get max allowed sessions from the schedule
    const max = await getMaxSessionsForDay(db, classSectionId, todayDay)
    const used = await getUsedSessionsForDay(db, classSectionId, today)

    if (used.total >= max.total) {
      return res.status(409).json({
        error: `All ${max.total} session(s) for today have been used. (${used.total}/${max.total})`,
        maxSessions: max.total,
        usedSessions: used.total,
      })
    }

    // Assign sequential session_number within (class_section_id, date)
    const sessionNumber = used.total + 1

    let resolvedTimeSlot = (timeSlot || '').trim()

    if (!resolvedTimeSlot) {
      const { data: scheduleRows } = await req.supabase
        .from('class_schedules')
        .select('start_time, end_time, day, day_of_week, teacher_id')
        .eq('class_section_id', classSectionId)

      const dayKey = todayDay.slice(0, 3).toLowerCase()
      const sameDay = (scheduleRows || []).filter((row) => {
        const rawDay = String(row.day || row.day_of_week || '')
        return rawDay.slice(0, 3).toLowerCase() === dayKey
      })

      const teacherRows = sameDay.filter((row) => row.teacher_id === teacherProfile.id)
      const candidates = teacherRows.length ? teacherRows : sameDay
      const ordered = candidates
        .slice()
        .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))

      const slot = ordered[sessionNumber - 1]
      if (slot?.start_time && slot?.end_time) {
        resolvedTimeSlot = `${String(slot.start_time).slice(0, 5)}-${String(slot.end_time).slice(0, 5)}`
      }
    }

    const { data, error } = await req.supabase
      .from('attendance_sessions')
      .insert({
        class_section_id: classSectionId,
        teacher_id: teacherProfile.id,
        session_date: today,
        session_type: sessionType,
        session_number: sessionNumber,
        time_slot: resolvedTimeSlot || `Session ${sessionNumber}`
      })
      .select()
      .single()

    if (error) {
      const message = error.message || ''
      if (message.includes('attendance_sessions_class_section_id_session_date_key')) {
        return res.status(409).json({
          error: 'Attendance sessions are limited to one per class per day by a legacy DB constraint. Update the constraint to include session_number to allow multiple periods.',
          hint: 'Run backend/migrations/002_update_attendance_sessions_unique.sql',
        })
      }
      return res.status(400).json({ error: message })
    }
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
      .select('teacher_id, created_at')
      .eq('id', sessionId)
      .single()

    if (!session) return res.status(404).json({ error: 'Session not found' })
    if (session.teacher_id !== teacherProfile.id) {
      return res.status(403).json({ error: 'You do not own this session' })
    }

    // 24-hour edit limit check
    if (session.created_at) {
      const hoursSinceCreation = (Date.now() - new Date(session.created_at).getTime()) / (1000 * 60 * 60)
      if (hoursSinceCreation > 24) {
        return res.status(403).json({ error: 'Editing attendance is only allowed within 24 hours of session creation' })
      }
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

    // ─── LOW ATTENDANCE NOTIFICATION LOGIC ──────────────────────────────────────
    // After successfully saving records, check if any student's attendance
    // just crossed the 60% threshold downwards.
    try {
      const studentIds = records.map(r => r.student_id)
      const { data: sessionData } = await req.supabase
        .from('attendance_sessions')
        .select(`
          class_section_id,
          teacher_id,
          teacher_profiles ( profiles ( full_name ) ),
          class_sections (
            courses ( id, name, code )
          )
        `)
        .eq('id', sessionId)
        .single()

      if (sessionData) {
        const sectionId = sessionData.class_section_id
        const course = sessionData.class_sections?.courses
        const teacherName = sessionData.teacher_profiles?.profiles?.full_name || 'Your Teacher'

        for (const studentId of studentIds) {
          // 1. Get ALL sessions for this section
          const { data: allSessions } = await req.supabase
            .from('attendance_sessions')
            .select('id')
            .eq('class_section_id', sectionId)

          if (!allSessions?.length) continue
          const allSessionIds = allSessions.map(s => s.id)

          // 2. Get student's records for all these sessions
          const { data: studentRecords } = await req.supabase
            .from('attendance_records')
            .select('session_id, status')
            .eq('student_id', studentId)
            .in('session_id', allSessionIds)

          const total = allSessionIds.length
          const attended = (studentRecords || []).filter(r => wasAttended(r.status)).length
          const newPercentage = total > 0 ? (attended / total) * 100 : 100

          // 3. Check if they were >= 60% BEFORE this update
          // We can approximate this by checking the percentage WITHOUT the current session's record
          const currentStatus = attendanceMap[studentId]
          const attendedThisSession = wasAttended(currentStatus)
          
          const prevTotal = total - 1
          const prevAttended = attended - (attendedThisSession ? 1 : 0)
          const prevPercentage = prevTotal > 0 ? (prevAttended / prevTotal) * 100 : 100

          if (prevPercentage >= 60 && newPercentage < 60) {
            const notificationDb = supabaseAdmin || req.supabase
            const notificationType = 'low_attendance_60'
            let alreadyNotified = false

            if (notificationDb) {
              const { data: existingLog, error: logError } = await notificationDb
                .from('attendance_notification_logs')
                .select('id')
                .eq('student_id', studentId)
                .eq('class_section_id', sectionId)
                .eq('notification_type', notificationType)
                .maybeSingle()

              if (logError) {
                console.error('[notification] Log lookup failed:', logError)
              } else if (existingLog) {
                alreadyNotified = true
              }
            }

            if (alreadyNotified) continue

            const { data: profile } = await req.supabase
              .from('profiles')
              .select('email, full_name')
              .eq('id', studentId)
              .single()

            if (profile?.email) {
              const emailResult = await sendEmail({
                to: profile.email,
                subject: `Low Attendance Alert: ${course.name}`,
                html: `
                  <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
                    <h2>Attendance Alert</h2>
                    <p>Hello <strong>${profile.full_name || 'Student'}</strong>,</p>
                    <p>Your attendance in <strong>${course.name} (${course.code})</strong> has fallen below the required <strong>60%</strong> threshold.</p>
                    <div style="background: #fff5f5; border: 1px solid #feb2b2; padding: 15px; border-radius: 8px; margin: 20px 0;">
                      <p style="margin: 0;">Current Attendance: <strong style="color: #c53030;">${Math.round(newPercentage)}%</strong></p>
                      <p style="margin: 5px 0 0 0;">Subject Teacher: <strong>${teacherName}</strong></p>
                    </div>
                    <p>Regular attendance is crucial for your academic performance. Please ensure you attend future classes to improve your percentage.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #777;">This is an automated notification from the Centralized Attendance Portal.</p>
                  </div>
                `
              })

              if (emailResult?.success && notificationDb) {
                const { error: insertError } = await notificationDb
                  .from('attendance_notification_logs')
                  .insert({
                    student_id: studentId,
                    class_section_id: sectionId,
                    course_id: course?.id || null,
                    teacher_id: sessionData.teacher_id || null,
                    notification_type: notificationType,
                    attendance_percent: Math.round(newPercentage),
                  })

                if (insertError) {
                  console.error('[notification] Log insert failed:', insertError)
                }
              }
            }
          }
        }
      }
    } catch (notifErr) {
      console.error('[notification] Error checking attendance threshold:', notifErr)
      // Don't fail the request if notification fails
    }

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
    const db = supabaseAdmin || req.supabase
    const { data, error } = await db
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
            courses ( name, code, type )
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

    // Server-side response cache
    const cachePath = `/details/${sessionType}`
    const cached = getCachedResponse(req.user.id, cachePath)
    if (cached) return res.json({ data: cached })

    const studentProfile = await getStudentProfile(req.supabase, req.user.id)
    if (!studentProfile) return res.json({ data: [] })

    const data = await buildAttendanceDetails(req.supabase, studentProfile.id, sessionType)
    setCachedResponse(req.user.id, cachePath, data)
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

    // Server-side response cache
    const cachePath = `/summary/${sessionType}`
    const cached = getCachedResponse(req.user.id, cachePath)
    if (cached) return res.json({ data: cached })

    const studentProfile = await getStudentProfile(req.supabase, req.user.id)
    if (!studentProfile) return res.json({ data: [] })

    const details = await buildAttendanceDetails(req.supabase, studentProfile.id, sessionType)

    // Strip down to just what the dashboard rings need
    const data = details.map(s => ({
      name: s.subjectName,
      code: s.subjectCode,
      percentage: s.overallPercentage,
    }))

    setCachedResponse(req.user.id, cachePath, data)
    return res.json({ data })
  } catch (err) {
    console.error('GET /attendance/summary/:type error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── STUDENT: DASHBOARD SUMMARY (Pre-aggregated) ─────────────────────────────
router.get('/dashboard-summary', async (req, res) => {
  try {
    const cachePath = '/dashboard-summary'
    const cached = getCachedResponse(req.user.id, cachePath)
    if (cached) return res.json({ data: cached })

    const studentProfile = await getStudentProfile(req.supabase, req.user.id)
    if (!studentProfile) return res.json({ data: null })

    const allDetails = await buildAttendanceDetails(req.supabase, studentProfile.id, 'all')

    let lecTotal = 0, lecAttended = 0
    let labTotal = 0, labAttended = 0
    let totalSessions = 0, totalAttended = 0
    let bestSubject = null

    const subjects = allDetails.map(sub => {
      const t = sub.totalClasses || 0
      const a = sub.attendedClasses || 0
      const pct = sub.overallPercentage || 0
      const code = sub.subjectCode || ''
      const name = sub.subjectName || ''
      totalSessions += t
      totalAttended += a

      const nameStr = String(name).toUpperCase()
      const codeStr = String(code).toUpperCase()
      const isLab = codeStr.endsWith('L') || codeStr.includes('LAB') ||
        /\bLAB\b/.test(nameStr)

      if (isLab) { labTotal += t; labAttended += a }
      else { lecTotal += t; lecAttended += a }

      if (t > 0 && (!bestSubject || pct > bestSubject.pct)) {
        bestSubject = { name, pct, code }
      }

      return { id: sub.classSectionId || code, name, code, total: t, attended: a, percentage: pct, isLab }
    }).sort((a, b) => b.percentage - a.percentage)

    const overall = totalSessions > 0 ? Math.round((totalAttended / totalSessions) * 100) : 0
    const lecture = lecTotal > 0 ? Math.round((lecAttended / lecTotal) * 100) : 0
    const lab = labTotal > 0 ? Math.round((labAttended / labTotal) * 100) : 0

    const byDate = {}
    allDetails.forEach(sub => {
      (sub.teachers || []).forEach(t => {
        (t.records || []).forEach(r => {
          if (r.sessionDate) {
            if (!byDate[r.sessionDate]) byDate[r.sessionDate] = { date: r.sessionDate, present: 0, absent: 0, late: 0, total: 0 }
            byDate[r.sessionDate].total++
            if (r.status === 'present') byDate[r.sessionDate].present++
            if (r.status === 'late') byDate[r.sessionDate].late++
            if (r.status === 'absent') byDate[r.sessionDate].absent++
          }
        })
      })
    })
    const dailyData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))

    let streak = 0
    const DAY_MS = 24 * 60 * 60 * 1000
    const today = new Date()
    for (let i = 0; i < 60; i++) {
      const d = new Date(today.getTime() - i * DAY_MS)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const day = byDate[key]
      if (day) {
        if (day.absent > 0) break
        if (day.present > 0 || day.late > 0) streak++
      }
    }

    const result = { overall, lecture, lab, subjects, dailyData, stats: { totalClasses: totalSessions, attendedClasses: totalAttended, streak, bestSubject } }
    setCachedResponse(req.user.id, cachePath, result)
    return res.json({ data: result })
  } catch (err) {
    console.error('GET /attendance/dashboard-summary error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// --- TEACHER PERFORMANCE ROUTES ---

// GET /api/v1/attendance/teacher/performance
router.get('/teacher/performance', async (req, res) => {
  try {
    const db = supabaseAdmin || req.supabase
    const { data: teacherProfile } = await req.supabase
      .from('teacher_profiles')
      .select('id')
      .eq('profile_id', req.user.id)
      .single()

    if (!teacherProfile) return res.status(404).json({ error: 'Teacher profile not found' })

    const { data: assignments, error: assignErr } = await db
      .from('teacher_assignments')
      .select(`
        class_section_id,
        class_sections (
          id, year_of_study, section, department,
          courses ( code, name )
        )
      `)
      .eq('teacher_id', teacherProfile.id)

    if (assignErr) throw assignErr
    const sectionIds = assignments.map(a => a.class_section_id)

    if (sectionIds.length === 0) return res.json({ data: [] })

    const { data: sessions, error: sessErr } = await db
      .from('attendance_sessions')
      .select('id, class_section_id')
      .in('class_section_id', sectionIds)

    if (sessErr) throw sessErr

    const sessionIds = sessions.map(s => s.id)
    let records = []
    if (sessionIds.length > 0) {
      const { data: recs, error: recErr } = await db
        .from('attendance_records')
        .select('session_id, status')
        .in('session_id', sessionIds)
      if (recErr) throw recErr
      records = recs || []
    }

    const performanceData = assignments.map(assignment => {
      const secId = assignment.class_section_id
      const secSessions = sessions.filter(s => s.class_section_id === secId)
      const secRecs = records.filter(r => secSessions.some(s => s.id === r.session_id))
      
      const totalStudentsPresent = secRecs.filter(r => r.status === 'present').length
      const totalRecords = secRecs.length
      const overallPercentage = totalRecords > 0 ? Math.round((totalStudentsPresent / totalRecords) * 100) : 0

      return {
        sectionId: secId,
        subjectName: assignment.class_sections?.courses?.name || 'Unknown Subject',
        subjectCode: assignment.class_sections?.courses?.code || '???',
        department: assignment.class_sections?.department,
        section: assignment.class_sections?.section,
        year: assignment.class_sections?.year_of_study,
        totalSessions: secSessions.length,
        overallPercentage
      }
    }).sort((a, b) => b.overallPercentage - a.overallPercentage)

    return res.json({ data: performanceData })
  } catch (err) {
    console.error('GET /attendance/teacher/performance error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/attendance/teacher/performance/sections/:id
router.get('/teacher/performance/sections/:id', async (req, res) => {
  try {
    const db = supabaseAdmin || req.supabase
    const sectionId = req.params.id

    const { data: sessions, error: sessErr } = await db
      .from('attendance_sessions')
      .select('id')
      .eq('class_section_id', sectionId)

    if (sessErr) throw sessErr
    
    const sessionIds = sessions.map(s => s.id)
    let records = []
    if (sessionIds.length > 0) {
      const { data: recs, error: recErr } = await db
        .from('attendance_records')
        .select(`
          status,
          student_id,
          student_profiles!inner (
            id,
            roll_number,
            profiles ( full_name )
          )
        `)
        .in('session_id', sessionIds)
      if (recErr) throw recErr
      records = recs || []
    }

    const studentMap = {}
    records.forEach(r => {
      const sid = r.student_id
      if (!studentMap[sid]) {
        studentMap[sid] = {
          studentId: sid,
          rollNumber: r.student_profiles?.roll_number,
          fullName: r.student_profiles?.profiles?.full_name || 'Unknown',
          attendedClasses: 0,
          totalClasses: 0
        }
      }
      studentMap[sid].totalClasses++
      if (r.status === 'present') studentMap[sid].attendedClasses++
    })

    const data = Object.values(studentMap).map(s => {
      s.percentage = s.totalClasses > 0 ? Math.round((s.attendedClasses / s.totalClasses) * 100) : 0
      return s
    }).sort((a, b) => b.percentage - a.percentage)

    return res.json({ data })
  } catch (err) {
    console.error('GET /attendance/teacher/performance/sections/:id error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router