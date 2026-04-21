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

function matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester) {
  const yearMatches = studentYear == null || sectionYear == null || sectionYear === studentYear
  const semesterMatches = studentSemester == null || sectionSemester == null || sectionSemester === studentSemester

  if (studentYear != null && studentSemester != null) {
    return yearMatches || semesterMatches
  }

  return yearMatches && semesterMatches
}

// GET /api/v1/contacts/student
router.get('/student', async (req, res) => {
  try {
    const supabase = req.supabase
    const user = req.user
    const db = supabaseAdmin || supabase
    const diagnostics = {
      serviceRoleEnabled: Boolean(supabaseAdmin),
      enrollmentSections: 0,
      cohortSections: 0,
      resolvedSections: 0,
      assignmentRows: 0,
      sessionTeacherRows: 0,
      teacherProfilesResolved: 0,
    }

    // Get student profile
    const { data: studentProfile, error: spError } = await supabase
      .from('student_profiles')
      .select('id, department, year_of_study, section, current_semester')
      .eq('profile_id', user.id)
      .single()

    if (spError || !studentProfile) {
      return res.status(404).json({ error: 'Student profile not found' })
    }

    // Section ids from enrollments.
    const { data: enrollments, error: enrollError } = await supabase
      .from('enrollments')
      .select('class_section_id')
      .eq('student_id', studentProfile.id)

    if (enrollError) {
      return res.status(500).json({ error: 'Failed to fetch enrollments' })
    }

    const sectionIdSet = new Set((enrollments || []).map((e) => e.class_section_id))
    diagnostics.enrollmentSections = sectionIdSet.size

    // Cohort fallback so contacts still work if enrollment rows are missing.
    if (studentProfile.department) {
      let candidateQuery = supabase
        .from('class_sections')
        .select('id, year_of_study, section, department, courses (semester)')
        .eq('department', studentProfile.department)

      if (studentProfile.section) {
        candidateQuery = candidateQuery.eq('section', studentProfile.section)
      }

      const { data: candidates } = await candidateQuery
      const studentYear = normalizeYear(studentProfile.year_of_study) ?? toYearFromSemester(studentProfile.current_semester)
      const studentSemester = studentProfile.current_semester ? parseInt(studentProfile.current_semester, 10) : null

      let matchedSections = (candidates || []).filter((c) => {
        const sectionYear = normalizeYear(c.year_of_study)
        const sectionSemester = c.courses?.semester ? parseInt(c.courses.semester, 10) : null
        return matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
      })

      if (matchedSections.length === 0 && studentProfile.section) {
        const { data: deptWide } = await supabase
          .from('class_sections')
          .select('id, year_of_study, section, department, courses (semester)')
          .eq('department', studentProfile.department)

        matchedSections = (deptWide || []).filter((c) => {
          const sectionYear = normalizeYear(c.year_of_study)
          const sectionSemester = c.courses?.semester ? parseInt(c.courses.semester, 10) : null
          return matchesStudentCohort(studentYear, studentSemester, sectionYear, sectionSemester)
        })
      }

      for (const ms of matchedSections) {
        sectionIdSet.add(ms.id)
      }
      diagnostics.cohortSections = matchedSections.length
    }

    const sectionIds = Array.from(sectionIdSet)
    diagnostics.resolvedSections = sectionIds.length
    if (sectionIds.length === 0) return res.json({ data: [], meta: diagnostics })

    // Load sections + assignments first (teacher_id only), then resolve teacher profile details.
    const { data: sections, error: sectionsError } = await supabase
      .from('class_sections')
      .select(`
        id,
        section,
        courses (
          id,
          name,
          code
        ),
        teacher_assignments (
          teacher_id
        )
      `)
      .in('id', sectionIds)

    if (sectionsError) {
      return res.status(500).json({ error: 'Failed to fetch class sections for contacts' })
    }

    const { data: assignmentRows } = await db
      .from('teacher_assignments')
      .select('class_section_id, teacher_id')
      .in('class_section_id', sectionIds)

    diagnostics.assignmentRows = (assignmentRows || []).length

    const { data: sessionTeacherRows } = await db
      .from('attendance_sessions')
      .select('class_section_id, teacher_id')
      .in('class_section_id', sectionIds)
      .not('teacher_id', 'is', null)

    diagnostics.sessionTeacherRows = (sessionTeacherRows || []).length

    const teachersBySection = new Map()
    for (const row of assignmentRows || []) {
      if (!row?.class_section_id || !row?.teacher_id) continue
      const current = teachersBySection.get(row.class_section_id) || new Set()
      current.add(row.teacher_id)
      teachersBySection.set(row.class_section_id, current)
    }
    for (const row of sessionTeacherRows || []) {
      if (!row?.class_section_id || !row?.teacher_id) continue
      const current = teachersBySection.get(row.class_section_id) || new Set()
      current.add(row.teacher_id)
      teachersBySection.set(row.class_section_id, current)
    }

    const teacherIds = Array.from(new Set(
      Array.from(teachersBySection.values())
        .flatMap((idSet) => Array.from(idSet))
        .filter(Boolean)
    ))

    let teacherMap = {}
    if (teacherIds.length) {
      const { data: teachers, error: teacherError } = await db
        .from('teacher_profiles')
        .select(`
          id,
          employee_id,
          department,
          profiles (
            full_name,
            email
          )
        `)
        .in('id', teacherIds)

      if (!teacherError) {
        teacherMap = Object.fromEntries(
          (teachers || []).map((tp) => [
            tp.id,
            {
              id: tp.id,
              name: tp.profiles?.full_name || 'Assigned Teacher',
              email: tp.profiles?.email || null,
              employeeId: tp.employee_id,
              department: tp.department,
              role: 'Lecturer',
            },
          ])
        )
        diagnostics.teacherProfilesResolved = Object.keys(teacherMap).length
      }
    }

    // Shape the response
    const contacts = (sections || [])
      .map((section) => {
        if (!section) return null

        const sectionTeacherIds = Array.from(teachersBySection.get(section.id) || [])
        const teachers = sectionTeacherIds
          .map((teacherId) => teacherMap[teacherId] || {
            id: teacherId,
            name: teacherId ? 'Assigned Teacher' : 'Unassigned',
            email: null,
            employeeId: null,
            department: null,
            role: 'Lecturer',
          })
          .filter(Boolean)

        if (teachers.length === 0) {
          teachers.push({
            id: `unassigned-${section.id}`,
            name: 'Unassigned',
            email: null,
            employeeId: null,
            department: null,
            role: 'Lecturer',
          })
        }

        return {
          subjectId: section.courses?.id || section.id,
          subjectName: section.courses?.name || 'Unnamed Subject',
          subjectCode: section.courses?.code || 'N/A',
          section: section.section,
          type: 'Lecture',
          teachers,
        }
      })
      .filter(Boolean)

    return res.json({ data: contacts, meta: diagnostics })
  } catch (err) {
    console.error('contactRoutes /student error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router