import { Router } from 'express'

const router = Router()
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_MAP = {
  mon: 'Monday',
  monday: 'Monday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  tuesday: 'Tuesday',
  wed: 'Wednesday',
  wednesday: 'Wednesday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  thursday: 'Thursday',
  fri: 'Friday',
  friday: 'Friday',
  sat: 'Saturday',
  saturday: 'Saturday',
  sun: 'Sunday',
  sunday: 'Sunday',
}

function normalizeDay(dayValue) {
  if (!dayValue) return dayValue
  const key = String(dayValue).trim().toLowerCase()
  return DAY_MAP[key] || dayValue
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

function matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester) {
  const yearMatches = studentYear == null || sectionYear == null || sectionYear === studentYear
  const semesterMatches = studentSemester == null || sectionSemester == null || sectionSemester === studentSemester

  // If both are present, allow either to tolerate stale current_semester.
  if (studentYear != null && studentSemester != null) {
    return yearMatches || semesterMatches
  }

  return yearMatches && semesterMatches
}

function normalizeDepartment(value) {
  if (!value) return ''
  const compact = String(value).trim().toUpperCase().replace(/[^A-Z]/g, '')

  if (compact === 'CSE' || compact.includes('COMPUTERSCIENCE')) return 'CSE'
  if (compact === 'IT' || compact.includes('INFORMATIONTECHNOLOGY')) return 'IT'
  if (compact === 'ECE' || compact.includes('ELECTRONICS') || compact.includes('COMMUNICATION')) return 'ECE'
  if (compact === 'EE' || compact.includes('ELECTRICAL')) return 'EE'
  if (compact === 'ME' || compact.includes('MECHANICAL')) return 'ME'
  if (compact === 'CE' || compact.includes('CIVIL')) return 'CE'

  return compact
}

function normalizeSection(value) {
  if (!value) return ''
  return String(value).trim().toUpperCase()
}

/**
 * Normalize a class_schedule row into a consistent camelCase format
 * for the frontend to consume reliably.
 */
function normalizeSchedule(s) {
  return {
    id: s.id,
    day: normalizeDay(s.day),
    classType: s.class_type || s.classType || null,
    class_type: s.class_type || s.classType || null,
    timeSlot: s.time_slot || '',
    time_slot: s.time_slot || '',          // keep snake_case for backward compat
    roomNumber: s.room_number || 'TBA',
    room_number: s.room_number || 'TBA',   // keep snake_case for backward compat
    classSectionId: s.class_section_id,
    class_section_id: s.class_section_id,
    courseId: s.course_id,
    course_id: s.course_id,
    class_sections: s.class_sections || null,
  }
}

async function getCohortSchedulesDirect(supabase, studentProfile) {
  if (!studentProfile?.department) return []

  const studentYear = normalizeYear(studentProfile.year_of_study) ?? toYearFromSemester(studentProfile.current_semester)
  const studentSemester = studentProfile.current_semester ? parseInt(studentProfile.current_semester, 10) : null
  const studentDepartment = normalizeDepartment(studentProfile.department)
  const studentSection = normalizeSection(studentProfile.section)

  const { data: rows, error } = await supabase
    .from('class_schedules')
    .select(`
      *,
      class_sections!inner (
        section,
        year_of_study,
        department,
        courses (name, code, semester),
        teacher_assignments(teacher_profiles(profiles(full_name)))
      )
    `)
    .order('day', { ascending: true })

  if (error) {
    console.error('[schedule/student] direct cohort query error:', error.message)
    return []
  }

  return (rows || []).filter((row) => {
    const sectionDepartment = normalizeDepartment(row.class_sections?.department)
    const sectionYear = normalizeYear(row.class_sections?.year_of_study)
    const sectionSemester = row.class_sections?.courses?.semester
      ? parseInt(row.class_sections.courses.semester, 10)
      : null

    const departmentMatch = !studentDepartment || !sectionDepartment || sectionDepartment === studentDepartment
    const cohortMatch = matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
    const sectionValue = normalizeSection(row.class_sections?.section)
    const sectionMatch = !studentSection || !sectionValue || sectionValue === studentSection
    return departmentMatch && cohortMatch && sectionMatch
  })
}

async function getCourseScopedSchedulesFallback(supabase, studentProfile) {
  if (!studentProfile?.department) return []

  const studentDepartment = normalizeDepartment(studentProfile.department)
  const studentSemester = studentProfile.current_semester ? parseInt(studentProfile.current_semester, 10) : null
  const studentYear = normalizeYear(studentProfile.year_of_study)

  let query = supabase
    .from('class_schedules')
    .select(`
      id,
      day,
      time_slot,
      room_number,
      class_section_id,
      course_id,
      courses!inner (id, code, name, department, semester),
      class_sections (section, teacher_assignments(teacher_profiles(profiles(full_name))))
    `)
    .order('day', { ascending: true })

  if (studentSemester) {
    query = query.eq('courses.semester', studentSemester)
  }

  const { data, error } = await query
  if (error) {
    console.error('[schedule/student] course-scoped fallback error:', error.message)
    return []
  }

  const byCourse = (data || []).filter((row) => {
    const rowDept = normalizeDepartment(row.courses?.department)
    if (studentDepartment && rowDept && rowDept !== studentDepartment) return false

    // If semester is missing on profile, use year band as fallback.
    if (!studentSemester && studentYear && row.courses?.semester) {
      const sem = parseInt(row.courses.semester, 10)
      const min = (studentYear * 2) - 1
      const max = studentYear * 2
      if (!Number.isNaN(sem) && (sem < min || sem > max)) return false
    }

    return true
  })

  return byCourse.map((row) => ({
    id: row.id,
    day: row.day,
    time_slot: row.time_slot,
    room_number: row.room_number,
    class_section_id: row.class_section_id,
    course_id: row.course_id,
    class_sections: {
      ...(row.class_sections || {}),
      courses: row.courses || null,
    },
  }))
}

router.get('/student', async (req, res) => {
  try {
    // Step 1: Get the student profile (with department, year, section info)
    const { data: sp, error: spError } = await req.supabase
      .from('student_profiles')
      .select('id, department, year_of_study, section, current_semester')
      .eq('profile_id', req.user.id)
      .single()

    if (spError) {
      console.error('[schedule/student] student_profiles lookup error:', spError.message)
    }
    if (!sp) {
      console.log('[schedule/student] No student profile found for user:', req.user.id)
      return res.json({ data: [] })
    }

    // Step 2: Try enrollments first
    const { data: enr, error: enrError } = await req.supabase
      .from('enrollments')
      .select('class_section_id')
      .eq('student_id', sp.id)

    if (enrError) {
      console.error('[schedule/student] enrollments lookup error:', enrError.message)
    }

    const enrolledSectionIds = (enr || []).map(e => e.class_section_id)
    const sectionIdSet = new Set(enrolledSectionIds)
    console.log('[schedule/student] Enrollments found:', enrolledSectionIds.length)

    // Step 3: Always include cohort-matched sections by
    // department + year + optional section + current semester.
    if (sp.department) {
      const studentDepartment = normalizeDepartment(sp.department)
      const studentSection = normalizeSection(sp.section)

      let query = req.supabase
        .from('class_sections')
        .select(`
          id,
          year_of_study,
          department,
          section,
          courses (semester)
        `)

      if (sp.section) {
        query = query.eq('section', sp.section)
      }

      let { data: candidates, error: matchErr } = await query

      // If strict section filtering yields no candidates, retry without section
      // so mismatched section naming does not hide all student courses.
      if ((!candidates || candidates.length === 0) && sp.section) {
        const fallback = await req.supabase
          .from('class_sections')
          .select(`
            id,
            year_of_study,
            department,
            section,
            courses (semester)
          `)

        candidates = fallback.data || []
        if (fallback.error) {
          matchErr = fallback.error
        }
      }

      if (matchErr) {
        console.error('[schedule/student] class_sections fallback error:', matchErr.message)
      }

      const studentYear = normalizeYear(sp.year_of_study) ?? toYearFromSemester(sp.current_semester)
      const studentSemester = sp.current_semester ? parseInt(sp.current_semester, 10) : null

      let matchedSections = (candidates || [])
        .filter((c) => {
          const sectionDepartment = normalizeDepartment(c.department)
          const sectionYear = normalizeYear(c.year_of_study)
          const sectionSemester = c.courses?.semester ? parseInt(c.courses.semester, 10) : null
          const sectionValue = normalizeSection(c.section)

          const departmentMatch = !studentDepartment || !sectionDepartment || sectionDepartment === studentDepartment
          const cohortMatch = matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
          const sectionMatch = !studentSection || !sectionValue || sectionValue === studentSection
          return departmentMatch && cohortMatch && sectionMatch
        })

      // Second-pass fallback without section constraint if still empty.
      if (matchedSections.length === 0 && sp.section) {
        const deptWide = await req.supabase
          .from('class_sections')
          .select(`
            id,
            year_of_study,
            department,
            section,
            courses (semester)
          `)

        matchedSections = (deptWide.data || []).filter((c) => {
          const sectionDepartment = normalizeDepartment(c.department)
          const sectionYear = normalizeYear(c.year_of_study)
          const sectionSemester = c.courses?.semester ? parseInt(c.courses.semester, 10) : null
          const sectionValue = normalizeSection(c.section)
          const departmentMatch = !studentDepartment || !sectionDepartment || sectionDepartment === studentDepartment
          const cohortMatch = matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
          const sectionMatch = !studentSection || !sectionValue || sectionValue === studentSection
          return departmentMatch && cohortMatch && sectionMatch
        })

        if (matchedSections.length === 0) {
          matchedSections = (deptWide.data || []).filter((c) => {
            const sectionDepartment = normalizeDepartment(c.department)
            const sectionYear = normalizeYear(c.year_of_study)
            const sectionSemester = c.courses?.semester ? parseInt(c.courses.semester, 10) : null
            const departmentMatch = !studentDepartment || !sectionDepartment || sectionDepartment === studentDepartment
            return departmentMatch && matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
          })
        }
      }

      const matchedIds = matchedSections.map((s) => s.id)
      matchedIds.forEach((id) => sectionIdSet.add(id))

      // Persist missing enrollments so all student APIs see the same sections.
      const missingSectionIds = matchedIds.filter((id) => !enrolledSectionIds.includes(id))
      if (missingSectionIds.length > 0) {
        const { error: enrollSyncError } = await req.supabase
          .from('enrollments')
          .upsert(
            missingSectionIds.map((classSectionId) => ({
              student_id: sp.id,
              class_section_id: classSectionId,
            })),
            { onConflict: 'student_id,class_section_id' }
          )

        // Do not fail schedule rendering if enrollment sync is blocked by RLS
        // or missing unique constraints; sectionIds already include matched data.
        if (enrollSyncError) {
          console.warn('[schedule/student] enrollment sync skipped:', enrollSyncError.message)
        }
      }

      console.log('[schedule/student] Matched', matchedIds.length, 'sections by profile attributes')
    }

    const sectionIds = Array.from(sectionIdSet)

    // Step 4: Fetch schedules for the resolved section IDs.
    // Primary source: class_schedules. Fallback: legacy schedules table.
    let normalized = []

    let classSchedules = []
    let error = null

    if (sectionIds.length > 0) {
      const result = await req.supabase
        .from('class_schedules')
        .select('*, class_sections (section, year_of_study, department, courses (name, code, semester), teacher_assignments(teacher_profiles(profiles(full_name))))')
        .in('class_section_id', sectionIds)
        .order('day', { ascending: true })
      classSchedules = result.data || []
      error = result.error || null
    }

    if (error) {
      console.error('[schedule/student] class_schedules query error:', error.message)
    }

    // Hard fallback: query class_schedules directly by student cohort if
    // section-id resolution yields nothing.
    if ((classSchedules || []).length === 0) {
      classSchedules = await getCohortSchedulesDirect(req.supabase, sp)
    }

    // Final fallback: query by course department/semester from class_schedules
    // to avoid section-resolution failures blocking schedule display.
    if ((classSchedules || []).length === 0) {
      classSchedules = await getCourseScopedSchedulesFallback(req.supabase, sp)
    }

    if ((classSchedules || []).length > 0) {
      normalized = (classSchedules || []).map(normalizeSchedule)
    } else {
      const { data: legacySchedules, error: legacyError } = await req.supabase
        .from('schedules')
        .select('id, class_section_id, day_of_week, start_time, end_time, room, class_sections (course_id, section, courses (id, name, code), teacher_assignments(teacher_profiles(profiles(full_name))))')
        .in('class_section_id', sectionIds)

      if (legacyError) {
        console.error('[schedule/student] schedules fallback query error:', legacyError.message)
      }

      normalized = (legacySchedules || []).map((s) => ({
        id: s.id,
        day: normalizeDay(s.day_of_week),
        time_slot: `${String(s.start_time).slice(0, 5)}-${String(s.end_time).slice(0, 5)}`,
        room_number: s.room || 'TBA',
        class_section_id: s.class_section_id,
        course_id: s.class_sections?.course_id || s.class_sections?.courses?.id || null,
        class_sections: s.class_sections || null,
      }))
    }

    console.log('[schedule/student] Found', normalized.length || 0, 'schedule entries')

    const sorted = normalized.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day))
    return res.json({ data: sorted })
  } catch (err) {
    console.error('[schedule/student] Internal error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/teacher', async (req, res) => {
  try {
    const { data: tp } = await req.supabase.from('teacher_profiles').select('id').eq('profile_id', req.user.id).single()
    if (!tp) return res.json({ data: [] })
    const { data: asgn } = await req.supabase.from('teacher_assignments').select('class_section_id').eq('teacher_id', tp.id)
    if (!asgn?.length) return res.json({ data: [] })
    const ids = asgn.map(a => a.class_section_id)
    const { data, error } = await req.supabase
      .from('class_schedules')
      .select('*, class_sections (section, courses (name, code), teacher_assignments(teacher_profiles(profiles(full_name))))')
      .in('class_section_id', ids)
      .order('day', { ascending: true })
    if (error) return res.status(400).json({ error: error.message })
    const normalized = (data || []).map(normalizeSchedule)
    const sorted = normalized.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day))
    return res.json({ data: sorted })
  } catch (err) { return res.status(500).json({ error: 'Internal server error' }) }
})

router.get('/today', async (req, res) => {
  try {
    const role = req.query.role || 'student'
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const today = days[new Date().getDay()]
    let allData = []
    if (role === 'teacher') {
      const { data: tp } = await req.supabase.from('teacher_profiles').select('id').eq('profile_id', req.user.id).single()
      if (tp) {
        const { data: asgn } = await req.supabase.from('teacher_assignments').select('class_section_id').eq('teacher_id', tp.id)
        if (asgn?.length) {
          const ids = asgn.map(a => a.class_section_id)
          const { data } = await req.supabase.from('class_schedules').select('*, class_sections (section, courses (name, code), teacher_assignments(teacher_profiles(profiles(full_name))))').in('class_section_id', ids).order('day', { ascending: true })
          allData = (data || []).map(normalizeSchedule)
        }
      }
    } else {
      const { data: sp } = await req.supabase
        .from('student_profiles')
        .select('id, department, year_of_study, section, current_semester')
        .eq('profile_id', req.user.id)
        .single()

      if (sp) {
        const { data: enr } = await req.supabase
          .from('enrollments')
          .select('class_section_id')
          .eq('student_id', sp.id)

        const idSet = new Set((enr || []).map((e) => e.class_section_id))

        if (sp.department) {
          const studentDepartment = normalizeDepartment(sp.department)
          const studentSection = normalizeSection(sp.section)
          const studentYear = normalizeYear(sp.year_of_study) ?? toYearFromSemester(sp.current_semester)
          const studentSemester = sp.current_semester ? parseInt(sp.current_semester, 10) : null

          const { data: candidates } = await req.supabase
            .from('class_sections')
            .select('id, year_of_study, department, section, courses (semester)')

          ;(candidates || []).forEach((c) => {
            const sectionDepartment = normalizeDepartment(c.department)
            const sectionYear = normalizeYear(c.year_of_study)
            const sectionSemester = c.courses?.semester ? parseInt(c.courses.semester, 10) : null
            const sectionValue = normalizeSection(c.section)
            const departmentMatch = !studentDepartment || !sectionDepartment || sectionDepartment === studentDepartment
            const cohortMatch = matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
            const sectionMatch = !studentSection || !sectionValue || sectionValue === studentSection
            if (departmentMatch && cohortMatch && sectionMatch) {
              idSet.add(c.id)
            }
          })
        }

        const ids = Array.from(idSet)
        if (ids.length) {
          const { data } = await req.supabase
            .from('class_schedules')
            .select('*, class_sections (section, courses (name, code), teacher_assignments(teacher_profiles(profiles(full_name))))')
            .in('class_section_id', ids)
            .order('day', { ascending: true })
          allData = (data || []).map(normalizeSchedule)
        }

        if (!allData.length) {
          const fallbackRows = await getCourseScopedSchedulesFallback(req.supabase, sp)
          allData = (fallbackRows || []).map(normalizeSchedule)
        }
      }
    }
    const todayOnly = allData.filter(s => s.day === today)
    return res.json({ data: todayOnly })
  } catch (err) { return res.status(500).json({ error: 'Internal server error' }) }
})

export default router
