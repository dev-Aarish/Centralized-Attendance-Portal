import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()

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

function getDepartmentFromEmail(email) {
  if (!email) return null
  const localPart = email.split('@')[0].toUpperCase()
  const DEPARTMENTS = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE']
  return DEPARTMENTS.find(d => d === localPart) || null
}

function matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester) {
  const yearMatches = studentYear == null || sectionYear == null || sectionYear === studentYear
  const semesterMatches = studentSemester == null || sectionSemester == null || sectionSemester === studentSemester

  // If both are available, accept either to avoid over-filtering due to stale semester values.
  if (studentYear != null && studentSemester != null) {
    return yearMatches || semesterMatches
  }

  return yearMatches && semesterMatches
}

async function findCohortSectionsForStudent(supabase, studentProfile) {
  if (!studentProfile?.department) return []

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

  let matched = (candidates || []).filter((c) => {
    const sectionYear = normalizeYear(c.year_of_study)
    const sectionSemester = c.courses?.semester ? parseInt(c.courses.semester, 10) : null
    return matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
  })

  if (matched.length === 0 && studentProfile.section) {
    const { data: deptWide } = await supabase
      .from('class_sections')
      .select(`
        id,
        year_of_study,
        section,
        department,
        courses (semester)
      `)
      .eq('department', studentProfile.department)

    matched = (deptWide || []).filter((c) => {
      const sectionYear = normalizeYear(c.year_of_study)
      const sectionSemester = c.courses?.semester ? parseInt(c.courses.semester, 10) : null
      return matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
    })
  }

  return matched
}

// GET /api/v1/profile/me — full profile from profiles table
router.get('/me', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single()

    if (error) return res.status(400).json({ error: error.message })
    return res.json({ data })
  } catch (err) {
    console.error('GET /profile/me error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/profile/role — current user's role and admin department
router.get('/role', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single()

    if (error || !data) {
      // If error is just missing column, we still want the role
      console.warn('GET /profile/role fetch warning:', error?.message)
      return res.json({ data: { role: data?.role || null, adminDepartment: data?.department || null } })
    }
    
    // If admin, infer department from email if column is empty
    let adminDept = data.department || null
    if (data.role === 'admin' && !adminDept) {
      adminDept = getDepartmentFromEmail(data.email)
    }

    return res.json({ data: { role: data.role, adminDepartment: adminDept } })
  } catch (err) {
    console.error('GET /profile/role error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/profile/student — student profile with joined profile info
router.get('/student', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('student_profiles')
      .select(`
        *,
        profiles (
          full_name,
          email,
          college_name
        )
      `)
      .eq('profile_id', req.user.id)
      .single()

    if (error) return res.status(400).json({ error: error.message })
    return res.json({ data })
  } catch (err) {
    console.error('GET /profile/student error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/profile/teacher — teacher profile with joined profile info
router.get('/teacher', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('teacher_profiles')
      .select(`
        *,
        profiles (
          full_name,
          email,
          college_name
        )
      `)
      .eq('profile_id', req.user.id)
      .single()

    if (error) return res.status(400).json({ error: error.message })
    return res.json({ data })
  } catch (err) {
    console.error('GET /profile/teacher error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/profile/assigned-sections — teacher's assigned sections
router.get('/assigned-sections', async (req, res) => {
  try {
    const { data: teacherProfile } = await req.supabase
      .from('teacher_profiles')
      .select('id')
      .eq('profile_id', req.user.id)
      .single()

    if (!teacherProfile) return res.json({ data: [] })

    const { data, error } = await req.supabase
      .from('teacher_assignments')
      .select(`
        *,
        class_sections (
          *,
          courses (
            id, code, name, department, semester
          )
        )
      `)
      .eq('teacher_id', teacherProfile.id)

    if (error) return res.status(400).json({ error: error.message })
    return res.json({ data })
  } catch (err) {
    console.error('GET /profile/assigned-sections error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/profile/teacher/stats — teacher's aggregate stats
router.get('/teacher/stats', async (req, res) => {
  try {
    const db = supabaseAdmin || req.supabase
    const { data: teacherProfile } = await req.supabase
      .from('teacher_profiles')
      .select('id')
      .eq('profile_id', req.user.id)
      .single()

    if (!teacherProfile) return res.status(404).json({ error: 'Teacher profile not found' })

    // 1. Get all assigned class_section_ids
    const { data: assignments } = await req.supabase
      .from('teacher_assignments')
      .select('class_section_id')
      .eq('teacher_id', teacherProfile.id)

    const sectionIds = (assignments || []).map(a => a.class_section_id)

    if (sectionIds.length === 0) {
      return res.json({
        data: {
          totalStudents: 0,
          totalSections: 0
        }
      })
    }

    // 2. Count unique students across these sections
    const { data: enrollments, error: enrollmentError } = await db
      .from('enrollments')
      .select('student_id')
      .in('class_section_id', sectionIds)

    if (enrollmentError) throw enrollmentError

    const uniqueStudents = new Set((enrollments || []).map(e => e.student_id))

    return res.json({
      data: {
        totalStudents: uniqueStudents.size,
        totalSections: sectionIds.length
      }
    })
  } catch (err) {
    console.error('GET /profile/teacher/stats error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/profile/enrolled-sections — student's enrolled sections
router.get('/enrolled-sections', async (req, res) => {
  try {
    const { data: studentProfile } = await req.supabase
      .from('student_profiles')
      .select('id, department, year_of_study, section, current_semester')
      .eq('profile_id', req.user.id)
      .single()

    if (!studentProfile) return res.json({ data: [] })

    // Get existing enrollment rows first.
    const { data: existingEnrollments } = await req.supabase
      .from('enrollments')
      .select('class_section_id')
      .eq('student_id', studentProfile.id)

    const existingSectionIds = new Set((existingEnrollments || []).map((e) => e.class_section_id))

    // Find sections that should belong to this student's cohort by
    // department + year + section + current semester.
    let candidateQuery = req.supabase
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

    // If strict section filter yields no cohort sections, retry without section constraint.
    if (matchedSections.length === 0 && studentProfile.section) {
      const { data: deptWideCandidates } = await req.supabase
        .from('class_sections')
        .select(`
          id,
          year_of_study,
          section,
          department,
          courses (semester)
        `)
        .eq('department', studentProfile.department)

      matchedSections = (deptWideCandidates || []).filter((c) => {
        const sectionYear = normalizeYear(c.year_of_study)
        const sectionSemester = c.courses?.semester ? parseInt(c.courses.semester, 10) : null
        return matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
      })
    }

    const matchedSectionIds = matchedSections.map((c) => c.id)

    const missingSectionIds = matchedSectionIds.filter((id) => !existingSectionIds.has(id))

    // Auto-enroll missing cohort sections so newly offered courses appear
    // without requiring manual enrollment one-by-one.
    if (missingSectionIds.length > 0) {
      const { error: enrollSyncError } = await req.supabase
        .from('enrollments')
        .upsert(
          missingSectionIds.map((classSectionId) => ({
            student_id: studentProfile.id,
            class_section_id: classSectionId,
          })),
          { onConflict: 'student_id,class_section_id' }
        )

      if (enrollSyncError) {
        console.warn('[profile/enrolled-sections] enrollment sync skipped:', enrollSyncError.message)
      }
    }

    const { data, error } = await req.supabase
      .from('enrollments')
      .select(`
        *,
        class_sections (
          *,
          courses (
            id, code, name, department, semester
          )
        )
      `)
      .eq('student_id', studentProfile.id)

    if (error) return res.status(400).json({ error: error.message })

    // Even if enrollments upsert was blocked (e.g., RLS/constraints), expose
    // inferred cohort sections in response so student pages still render.
    let finalData = data || []
    const returnedIds = new Set(finalData.map((e) => e.class_section_id))
    const unresolvedIds = matchedSectionIds.filter((id) => !returnedIds.has(id))

    if (unresolvedIds.length > 0) {
      const { data: inferredSections } = await req.supabase
        .from('class_sections')
        .select(`
          *,
          courses (
            id, code, name, department, semester
          )
        `)
        .in('id', unresolvedIds)

      finalData = [
        ...finalData,
        ...(inferredSections || []).map((section) => ({
          id: `inferred-${studentProfile.id}-${section.id}`,
          student_id: studentProfile.id,
          class_section_id: section.id,
          enrolled_at: null,
          class_sections: section,
        })),
      ]
    }

    return res.json({ data: finalData })
  } catch (err) {
    console.error('GET /profile/enrolled-sections error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/profile/sections/:id/students — students in a section
router.get('/sections/:id/students', async (req, res) => {
  try {
    const db = supabaseAdmin || req.supabase
    const diagnostics = {
      serviceRoleEnabled: Boolean(supabaseAdmin),
      source: 'enrollments',
      sectionId: req.params.id,
      enrollmentsCount: 0,
      candidateStudentsCount: 0,
      matchedStudentsCount: 0,
    }

    // Authorization: teachers can only view sections they are assigned to.
    // Admins are allowed for operational visibility.
    const { data: roleRow } = await req.supabase
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single()

    const role = roleRow?.role || null
    if (role === 'teacher') {
      const { data: teacherProfile } = await req.supabase
        .from('teacher_profiles')
        .select('id')
        .eq('profile_id', req.user.id)
        .single()

      if (!teacherProfile) {
        return res.status(403).json({ error: 'No teacher profile found' })
      }

      const { data: assignment } = await req.supabase
        .from('teacher_assignments')
        .select('id')
        .eq('teacher_id', teacherProfile.id)
        .eq('class_section_id', req.params.id)
        .single()

      if (!assignment) {
        return res.status(403).json({ error: 'You are not assigned to this section' })
      }
    } else if (role !== 'admin') {
      return res.status(403).json({ error: 'Only teachers/admins can view section students' })
    }

    const { data, error } = await db
      .from('enrollments')
      .select(`
        *,
        student_profiles (
          id, roll_number, year_of_study, section, department,
          profiles ( full_name, email )
        )
      `)
      .eq('class_section_id', req.params.id)
      .order('student_profiles(roll_number)', { ascending: true })

    if (error) return res.status(400).json({ error: error.message })
    diagnostics.enrollmentsCount = (data || []).length
    if ((data || []).length > 0) return res.json({ data, meta: diagnostics })

    // Fallback: resolve students by section cohort when explicit enrollment rows
    // are missing, then try backfilling enrollments.
    const { data: targetSection } = await db
      .from('class_sections')
      .select('id, year_of_study, section, department, courses (semester)')
      .eq('id', req.params.id)
      .single()

    if (!targetSection) {
      diagnostics.source = 'none'
      diagnostics.hint = 'Target section was not found in class_sections.'
      return res.json({ data: [], meta: diagnostics })
    }

    const { data: candidateStudents, error: studentsError } = await db
      .from('student_profiles')
      .select(`
        id,
        roll_number,
        year_of_study,
        current_semester,
        section,
        department,
        profiles ( full_name, email )
      `)

    if (studentsError) return res.status(400).json({ error: studentsError.message })
    diagnostics.source = 'cohort-fallback'
    diagnostics.candidateStudentsCount = (candidateStudents || []).length

    const sectionYear = normalizeYear(targetSection.year_of_study)
    const sectionSemester = targetSection.courses?.semester ? parseInt(targetSection.courses.semester, 10) : null
    const targetDepartment = normalizeDepartment(targetSection.department)
    const targetSectionName = normalizeSection(targetSection.section)

    const matchedStudents = (candidateStudents || []).filter((sp) => {
      const studentDepartment = normalizeDepartment(sp.department)
      if (targetDepartment && studentDepartment && studentDepartment !== targetDepartment) return false

      const studentYear = normalizeYear(sp.year_of_study) ?? toYearFromSemester(sp.current_semester)
      const studentSemester = sp.current_semester ? parseInt(sp.current_semester, 10) : null
      const cohortMatch = matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
      const sectionMatch = !targetSectionName || !normalizeSection(sp.section) || normalizeSection(sp.section) === targetSectionName
      return cohortMatch && sectionMatch
    })

    diagnostics.matchedStudentsCount = matchedStudents.length
    if (matchedStudents.length === 0) {
      diagnostics.source = 'none'
      diagnostics.hint = diagnostics.serviceRoleEnabled
        ? 'No cohort-matched students found for this section. Verify student department/year/semester/section values.'
        : 'No students resolved. If RLS is strict, add SUPABASE_SERVICE_ROLE_KEY to backend .env or allow teachers to read student_profiles via policy.'
      return res.json({ data: [], meta: diagnostics })
    }

    const { error: backfillError } = await db
      .from('enrollments')
      .upsert(
        matchedStudents.map((sp) => ({
          student_id: sp.id,
          class_section_id: req.params.id,
        })),
        { onConflict: 'student_id,class_section_id' }
      )

    if (backfillError) {
      console.warn('[profile/sections/:id/students] enrollment backfill skipped:', backfillError.message)
    }

    const { data: backfilled } = await db
      .from('enrollments')
      .select(`
        *,
        student_profiles (
          id, roll_number, year_of_study, section, department,
          profiles ( full_name, email )
        )
      `)
      .eq('class_section_id', req.params.id)
      .order('student_profiles(roll_number)', { ascending: true })

    if ((backfilled || []).length > 0) {
      diagnostics.source = 'backfilled-enrollments'
      diagnostics.enrollmentsCount = backfilled.length
      return res.json({ data: backfilled, meta: diagnostics })
    }

    const inferred = matchedStudents
      .sort((a, b) => String(a.roll_number || '').localeCompare(String(b.roll_number || ''), undefined, { numeric: true }))
      .map((sp) => ({
        id: `inferred-${req.params.id}-${sp.id}`,
        class_section_id: req.params.id,
        student_id: sp.id,
        created_at: null,
        student_profiles: {
          id: sp.id,
          roll_number: sp.roll_number,
          year_of_study: sp.year_of_study,
          section: sp.section,
          department: sp.department,
          profiles: sp.profiles,
        },
      }))

    diagnostics.source = 'inferred'
    diagnostics.hint = 'Returned inferred cohort students because enrollment backfill could not be confirmed.'
    return res.json({ data: inferred, meta: diagnostics })
  } catch (err) {
    console.error('GET /profile/sections/:id/students error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})



/**
 * POST /api/v1/profile/onboard
 * Complete user onboarding after authentication
 * Body: { role, fullName, department, year?, section?, rollNumber?, employeeId? }
 */
router.post('/onboard', async (req, res) => {
  try {
    const { role, fullName, department, year, section, rollNumber, employeeId, currentSemester } = req.body
    const user = req.user

    // Validation
    if (!role || !fullName || !department) {
      return res.status(400).json({
        error: 'role, fullName, and department are required',
      })
    }

    if (!['student', 'teacher'].includes(role)) {
      return res.status(400).json({ error: 'role must be student or teacher' })
    }

    // Step 1: Update profiles table
    const { error: profileError } = await req.supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        role,
        college_name: 'Heritage Institute of Technology',
      })
      .eq('id', user.id)

    if (profileError) {
      return res.status(400).json({ error: profileError.message })
    }

    // Step 2: Insert into role-specific table
    if (role === 'student') {
      if (!year || !rollNumber) {
        return res.status(400).json({
          error: 'For students, year and rollNumber are required',
        })
      }

      const { error: studentError } = await req.supabase
        .from('student_profiles')
        .upsert(
          {
            profile_id: user.id,
            year_of_study: year,
            current_semester: currentSemester ? parseInt(currentSemester, 10) : null,
            department: department.toUpperCase(),
            section: section || null,
            roll_number: rollNumber.trim().toUpperCase(),
          },
          { onConflict: 'profile_id' }
        )

      if (studentError) {
        return res.status(400).json({ error: studentError.message })
      }

      // Auto-link the student to all cohort sections so teacher rosters,
      // schedule, and attendance work without manual enrollment.
      const { data: studentProfile } = await req.supabase
        .from('student_profiles')
        .select('id, department, year_of_study, section, current_semester')
        .eq('profile_id', user.id)
        .single()

      if (studentProfile) {
        const matchedSections = await findCohortSectionsForStudent(req.supabase, studentProfile)
        if (matchedSections.length > 0) {
          const { error: enrollmentSeedError } = await req.supabase
            .from('enrollments')
            .upsert(
              matchedSections.map((s) => ({
                student_id: studentProfile.id,
                class_section_id: s.id,
              })),
              { onConflict: 'student_id,class_section_id' }
            )

          if (enrollmentSeedError) {
            console.warn('[profile/onboard] enrollment seed skipped:', enrollmentSeedError.message)
          }
        }
      }
    }

    if (role === 'teacher') {
      if (!employeeId) {
        return res.status(400).json({
          error: 'For teachers, employeeId is required',
        })
      }

      const { error: teacherError } = await req.supabase
        .from('teacher_profiles')
        .upsert(
          {
            profile_id: user.id,
            department: department.toUpperCase(),
            employee_id: employeeId.trim().toUpperCase(),
          },
          { onConflict: 'profile_id' }
        )

      if (teacherError) {
        return res.status(400).json({ error: teacherError.message })
      }
    }

    return res.json({ success: true, role })
  } catch (err) {
    console.error('POST /profile/onboard error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router