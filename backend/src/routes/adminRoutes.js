import { Router } from 'express'

const router = Router()

/**
 * GET /api/v1/admin/stats
 * Get overall system statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const supabase = req.supabase

    // Get counts
    const [studentsData, teachersData, coursesData, sectionsData, profilesData] = await Promise.all([
      supabase.from('student_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('teacher_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('courses').select('id', { count: 'exact', head: true }),
      supabase.from('class_sections').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('role', { count: 'exact' }),
    ])

    // Get attendance sessions today
    const today = new Date().toISOString().split('T')[0]
    const { data: todaySessions } = await supabase
      .from('attendance_sessions')
      .select('id')
      .eq('session_date', today)

    // Get low attendance students (< 75%)
    const { data: students } = await supabase
      .from('student_profiles')
      .select('id')

    let lowAttendanceCount = 0
    for (const student of students || []) {
      const { data: records } = await supabase
        .from('attendance_records')
        .select('status')
        .eq('student_id', student.id)

      if (records && records.length > 0) {
        const presentCount = records.filter((r) => r.status === 'present').length
        const attendancePercent = (presentCount / records.length) * 100
        if (attendancePercent < 75) lowAttendanceCount++
      }
    }

    return res.json({
      data: {
        totalStudents: studentsData.count || 0,
        totalTeachers: teachersData.count || 0,
        totalCourses: coursesData.count || 0,
        totalSections: sectionsData.count || 0,
        sessionsToday: todaySessions?.length || 0,
        lowAttendanceAlerts: lowAttendanceCount,
        roleDistribution: {
          students: profilesData.data?.filter((p) => p.role === 'student').length || 0,
          teachers: profilesData.data?.filter((p) => p.role === 'teacher').length || 0,
          admins: profilesData.data?.filter((p) => p.role === 'admin').length || 0,
        },
      },
    })
  } catch (err) {
    console.error('GET /admin/stats error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/admin/users
 * List all users with optional filters
 * Query: ?role=student|teacher|admin&search=name|email
 */
router.get('/users', async (req, res) => {
  try {
    const { role, search } = req.query
    const supabase = req.supabase

    let query = supabase.from('profiles').select(`
      id,
      email,
      full_name,
      role,
      college_name,
      created_at,
      student_profiles (id, roll_number, department),
      teacher_profiles (id, employee_id, department)
    `)

    if (role) {
      query = query.eq('role', role)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    // Filter by search if provided
    let filtered = data || []
    if (search) {
      const term = search.toLowerCase()
      filtered = filtered.filter(
        (u) =>
          u.full_name?.toLowerCase().includes(term) ||
          u.email?.toLowerCase().includes(term)
      )
    }

    // Enrich with profile details
    const enriched = filtered.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      collegeName: u.college_name,
      createdAt: u.created_at,
      studentDetails: u.student_profiles?.[0] || null,
      teacherDetails: u.teacher_profiles?.[0] || null,
    }))

    return res.json({ data: enriched })
  } catch (err) {
    console.error('GET /admin/users error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/admin/users/:id
 * Get a specific user's details
 */
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = req.supabase

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        role,
        college_name,
        created_at,
        student_profiles (
          id,
          roll_number,
          department,
          year_of_study,
          section,
          enrollments (count)
        ),
        teacher_profiles (
          id,
          employee_id,
          department,
          teacher_assignments (count)
        )
      `)
      .eq('id', id)
      .single()

    if (error || !data) {
      return res.status(404).json({ error: 'User not found' })
    }

    const enriched = {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      role: data.role,
      collegeName: data.college_name,
      createdAt: data.created_at,
      studentDetails: data.student_profiles?.[0]
        ? {
          rollNumber: data.student_profiles[0].roll_number,
          department: data.student_profiles[0].department,
          yearOfStudy: data.student_profiles[0].year_of_study,
          section: data.student_profiles[0].section,
          enrollmentsCount: data.student_profiles[0].enrollments?.[0]?.count || 0,
        }
        : null,
      teacherDetails: data.teacher_profiles?.[0]
        ? {
          employeeId: data.teacher_profiles[0].employee_id,
          department: data.teacher_profiles[0].department,
          assignmentsCount: data.teacher_profiles[0].teacher_assignments?.[0]?.count || 0,
        }
        : null,
    }

    return res.json({ data: enriched })
  } catch (err) {
    console.error('GET /admin/users/:id error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/v1/admin/users/:id/role
 * Change a user's role
 * Body: { newRole: "student" | "teacher" | "admin" }
 */
router.put('/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params
    const { newRole } = req.body
    const supabase = req.supabase

    if (!['student', 'teacher', 'admin'].includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role' })
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.json({ data })
  } catch (err) {
    console.error('PUT /admin/users/:id/role error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/v1/admin/users/:id
 * Delete a user (soft or hard delete)
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = req.supabase

    // For safety, we only soft-delete by removing role
    const { error } = await supabase
      .from('profiles')
      .update({ role: null })
      .eq('id', id)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.json({ success: true })
  } catch (err) {
    console.error('DELETE /admin/users/:id error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/admin/courses
 * List all courses
 */
router.get('/courses', async (req, res) => {
  try {
    const supabase = req.supabase

    const { data, error } = await supabase
      .from('courses')
      .select(`
        id,
        code,
        name,
        department,
        semester,
        class_sections (count)
      `)
      .order('department, code')

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    const enriched = (data || []).map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      department: c.department,
      semester: c.semester,
      sectionsCount: c.class_sections?.[0]?.count || 0,
    }))

    return res.json({ data: enriched })
  } catch (err) {
    console.error('GET /admin/courses error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/v1/admin/courses
 * Create a new course
 * Body: { code, name, department, semester }
 */
router.post('/courses', async (req, res) => {
  try {
    const { code, name, department, semester } = req.body
    const supabase = req.supabase

    if (!code || !name || !department) {
      return res.status(400).json({
        error: 'code, name, and department are required',
      })
    }

    const { data, error } = await supabase
      .from('courses')
      .insert({
        code: code.toUpperCase(),
        name: name.trim(),
        department: department.toUpperCase(),
        semester: semester || 1,
      })
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.status(201).json({ data })
  } catch (err) {
    console.error('POST /admin/courses error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/v1/admin/courses/:id
 * Delete a course by ID along with all related data (sections, enrollments, attendance, assignments, notes)
 */
router.delete('/courses/:id', async (req, res) => {
  try {
    const { id: courseId } = req.params
    const supabase = req.supabase

    // Get all sections for this course
    const { data: sections, error: sectionsError } = await supabase
      .from('class_sections')
      .select('id')
      .eq('course_id', courseId)

    if (sectionsError) {
      return res.status(500).json({ error: sectionsError.message })
    }

    const sectionIds = (sections || []).map(s => s.id)

    // Delete related data for each section
    if (sectionIds.length > 0) {
      // Delete attendance records
      await supabase
        .from('attendance_records')
        .delete()
        .in('session_id', (
          await supabase
            .from('attendance_sessions')
            .select('id')
            .in('section_id', sectionIds)
        ).data?.map(s => s.id) || [])

      // Delete attendance sessions
      const { error: attendanceError } = await supabase
        .from('attendance_sessions')
        .delete()
        .in('section_id', sectionIds)
      if (attendanceError) console.error('Error deleting attendance sessions:', attendanceError)

      // Delete content/notes
      const { error: contentError } = await supabase
        .from('course_content')
        .delete()
        .eq('course_id', courseId)
      if (contentError) console.error('Error deleting content:', contentError)

      // Delete teacher assignments
      const { error: assignmentError } = await supabase
        .from('teacher_assignments')
        .delete()
        .in('section_id', sectionIds)
      if (assignmentError) console.error('Error deleting assignments:', assignmentError)

      // Delete enrollments
      const { error: enrollmentError } = await supabase
        .from('enrollments')
        .delete()
        .in('section_id', sectionIds)
      if (enrollmentError) console.error('Error deleting enrollments:', enrollmentError)

      // Delete marks
      const { error: marksError } = await supabase
        .from('marks')
        .delete()
        .in('section_id', sectionIds)
      if (marksError) console.error('Error deleting marks:', marksError)

      // Delete class schedules
      const { error: scheduleError } = await supabase
        .from('class_schedules')
        .delete()
        .in('class_section_id', sectionIds)
      if (scheduleError) console.error('Error deleting schedules:', scheduleError)

      // Delete the sections themselves
      const { error: sectionDeleteError } = await supabase
        .from('class_sections')
        .delete()
        .in('id', sectionIds)
      if (sectionDeleteError) console.error('Error deleting sections:', sectionDeleteError)
    }

    // Delete the course
    const { error: deleteError } = await supabase
      .from('courses')
      .delete()
      .eq('id', courseId)

    if (deleteError) {
      return res.status(400).json({ error: deleteError.message })
    }

    return res.json({ message: 'Course and all related resources deleted successfully' })
  } catch (err) {
    console.error('DELETE /admin/courses/:id error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/admin/courses/:id/sections
 * Get all class sections for a course
 */
router.get('/courses/:id/sections', async (req, res) => {
  try {
    const { id: courseId } = req.params
    const supabase = req.supabase

    const { data, error } = await supabase
      .from('class_sections')
      .select(`
        id,
        section,
        year_of_study,
        department,
        course_id,
        courses (code, name),
        enrollments (count),
        teacher_assignments (count)
      `)
      .eq('course_id', courseId)
      .order('year_of_study, section')

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    const enriched = (data || []).map((s) => ({
      id: s.id,
      section: s.section,
      yearOfStudy: s.year_of_study,
      department: s.department,
      courseCode: s.courses?.code || 'N/A',
      courseName: s.courses?.name || 'Unknown',
      course: s.courses,
      studentsEnrolled: s.enrollments?.[0]?.count || 0,
      teachersAssigned: s.teacher_assignments?.[0]?.count || 0,
    }))

    return res.json({ data: enriched })
  } catch (err) {
    console.error('GET /admin/courses/:id/sections error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/v1/admin/sections/:id/assign-teacher
 * Assign a teacher to a class section
 * Body: { teacherId }
 */
router.post('/sections/:id/assign-teacher', async (req, res) => {
  try {
    const { id: sectionId } = req.params
    const { teacherId } = req.body
    const supabase = req.supabase

    if (!teacherId) {
      return res.status(400).json({ error: 'teacherId is required' })
    }

    // Verify teacher exists
    const { data: teacher } = await supabase
      .from('teacher_profiles')
      .select('id')
      .eq('profile_id', teacherId)
      .single()

    if (!teacher) {
      return res.status(400).json({ error: 'Teacher not found' })
    }

    // Create assignment
    const { data, error } = await supabase
      .from('teacher_assignments')
      .insert({
        teacher_id: teacher.id,
        class_section_id: sectionId,
      })
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.status(201).json({ data })
  } catch (err) {
    console.error('POST /admin/sections/:id/assign-teacher error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/v1/admin/sections/:id/enroll-student
 * Enroll a student in a class section
 * Body: { studentId }
 */
router.post('/sections/:id/enroll-student', async (req, res) => {
  try {
    const { id: sectionId } = req.params
    const { studentId } = req.body
    const supabase = req.supabase

    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required' })
    }

    // Verify student exists
    const { data: student } = await supabase
      .from('student_profiles')
      .select('id')
      .eq('profile_id', studentId)
      .single()

    if (!student) {
      return res.status(400).json({ error: 'Student not found' })
    }

    // Create enrollment
    const { data, error } = await supabase
      .from('enrollments')
      .insert({
        student_id: student.id,
        class_section_id: sectionId,
      })
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.status(201).json({ data })
  } catch (err) {
    console.error('POST /admin/sections/:id/enroll-student error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/admin/attendance/report
 * Get attendance summary by course/department/date
 * Query: ?department=CSE&startDate=2024-01-01&endDate=2024-01-31
 */
router.get('/attendance/report', async (req, res) => {
  try {
    const { department, startDate, endDate } = req.query
    const supabase = req.supabase

    // Get attendance sessions within date range
    let query = supabase
      .from('attendance_sessions')
      .select(`
        id,
        session_date,
        session_type,
        class_section_id,
        attendance_records (status)
      `)

    if (startDate) query = query.gte('session_date', startDate)
    if (endDate) query = query.lte('session_date', endDate)

    const { data: sessions, error: sessError } = await query.order('session_date', { ascending: false })

    if (sessError) {
      return res.status(500).json({ error: sessError.message })
    }

    // Get all sections with their courses
    const { data: sections, error: sectError } = await supabase
      .from('class_sections')
      .select(`
        id,
        section,
        department,
        courses (code, name)
      `)

    if (sectError) {
      return res.status(500).json({ error: sectError.message })
    }

    // Create a map of section IDs to section data
    const sectionMap = {}
    sections.forEach((s) => {
      sectionMap[s.id] = s
    })

    // Aggregate by course
    const report = {}
    for (const session of sessions || []) {
      const sectionData = sectionMap[session.class_section_id]
      if (!sectionData) continue

      const courseKey = `${sectionData.courses?.code}-${sectionData.section}`

      if (!report[courseKey]) {
        report[courseKey] = {
          code: sectionData.courses?.code,
          name: sectionData.courses?.name,
          section: sectionData.section,
          department: sectionData.department,
          sessions: 0,
          presentCount: 0,
          absentCount: 0,
          lateCount: 0,
        }
      }

      report[courseKey].sessions++
      const records = session.attendance_records || []
      report[courseKey].presentCount += records.filter((r) => r.status === 'present').length
      report[courseKey].absentCount += records.filter((r) => r.status === 'absent').length
      report[courseKey].lateCount += records.filter((r) => r.status === 'late').length
    }

    // Filter by department if provided
    let filtered = Object.values(report)
    if (department) {
      filtered = filtered.filter((r) => r.department === department)
    }

    return res.json({ data: filtered })
  } catch (err) {
    console.error('GET /admin/attendance/report error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/admin/alerts/low-attendance
 * Get all students with attendance < 75%
 * Query: ?department=CSE (optional filter)
 */
router.get('/alerts/low-attendance', async (req, res) => {
  try {
    const { department } = req.query
    const supabase = req.supabase

    // Get all students
    let query = supabase.from('student_profiles').select(`
      id,
      profile_id,
      department,
      roll_number,
      year_of_study,
      profiles (full_name, email),
      enrollments (
        class_sections (id),
        student_id
      )
    `)

    if (department) query = query.eq('department', department)

    const { data: students, error } = await query

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    // Calculate attendance for each student
    const alerts = []
    for (const student of students || []) {
      const { data: records } = await supabase
        .from('attendance_records')
        .select('status')
        .eq('student_id', student.id)

      if (records && records.length > 0) {
        const presentCount = records.filter((r) => r.status === 'present').length
        const attendancePercent = (presentCount / records.length) * 100

        if (attendancePercent < 75) {
          alerts.push({
            studentId: student.profile_id,
            name: student.profiles?.full_name,
            email: student.profiles?.email,
            rollNumber: student.roll_number,
            department: student.department,
            yearOfStudy: student.year_of_study,
            attendancePercent: Math.round(attendancePercent),
            sessionsAttended: presentCount,
            totalSessions: records.length,
          })
        }
      }
    }

    return res.json({ data: alerts })
  } catch (err) {
    console.error('GET /admin/alerts/low-attendance error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/admin/departments/:department/sections
 * Get all sections in a department
 */
router.get('/departments/:department/sections', async (req, res) => {
  try {
    const { department } = req.params
    const supabase = req.supabase

    const { data, error } = await supabase
      .from('class_sections')
      .select(`
        id,
        section,
        year_of_study,
        department,
        course_id,
        courses (id, code, name),
        enrollments (count),
        teacher_assignments (
          teacher_profiles (
            profiles (full_name)
          )
        )
      `)
      .eq('department', department.toUpperCase())
      .order('year_of_study, section')

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    const enriched = (data || []).map((s) => ({
      id: s.id,
      section: s.section,
      yearOfStudy: s.year_of_study,
      department: s.department,
      courseId: s.course_id,
      courses: s.courses,
      studentsEnrolled: s.enrollments?.[0]?.count || 0,
      teacherName: s.teacher_assignments?.[0]?.teacher_profiles?.profiles?.full_name || 'Unassigned',
    }))

    return res.json({ data: enriched })
  } catch (err) {
    console.error('GET /admin/departments/:department/sections error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/admin/schedules
 * Get schedules for class sections
 * Query: ?sectionIds=1,2,3 or ?sectionId=1
 */
router.get('/schedules', async (req, res) => {
  try {
    const { sectionId, sectionIds } = req.query
    const supabase = req.supabase

    if (!sectionId && !sectionIds) {
      return res.status(400).json({ error: 'sectionId or sectionIds is required' })
    }

    const ids = sectionIds ? sectionIds.split(',') : [sectionId]

    const { data, error } = await supabase
      .from('class_schedules')
      .select(`
        id,
        day,
        time_slot,
        room_number,
        class_section_id,
        course_id,
        courses (id, code, name)
      `)
      .in('class_section_id', ids)
      .order('day')

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    const enriched = (data || []).map((s) => ({
      id: s.id,
      day: s.day,
      timeSlot: s.time_slot,
      roomNumber: s.room_number,
      classSectionId: s.class_section_id,
      courseId: s.course_id,
      course: s.courses,
    }))

    return res.json({ data: enriched })
  } catch (err) {
    console.error('GET /admin/schedules error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/v1/admin/schedules
 * Create a schedule entry for a class section
 * Body: { classSectionId, courseId, day, timeSlot, roomNumber }
 */
router.post('/schedules', async (req, res) => {
  try {
    const { classSectionId, courseId, day, timeSlot, roomNumber } = req.body
    const supabase = req.supabase

    if (!classSectionId || !courseId || !day || !timeSlot || !roomNumber) {
      return res.status(400).json({
        error: 'All fields are required',
      })
    }

    // Verify the course exists
    const { data: course } = await supabase
      .from('courses')
      .select('id')
      .eq('id', courseId)
      .single()

    if (!course) {
      return res.status(400).json({ error: 'Course not found' })
    }

    // Create schedule entry
    const { data, error } = await supabase
      .from('class_schedules')
      .insert({
        class_section_id: classSectionId,
        course_id: courseId,
        day,
        time_slot: timeSlot,
        room_number: roomNumber,
      })
      .select(`
        id,
        day,
        time_slot,
        room_number,
        courses (id, code, name)
      `)
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    const enriched = {
      id: data.id,
      day: data.day,
      timeSlot: data.time_slot,
      roomNumber: data.room_number,
      course: data.courses,
    }

    return res.status(201).json({ data: enriched })
  } catch (err) {
    console.error('POST /admin/schedules error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/v1/admin/schedules/:id
 * Delete a schedule entry
 */
router.delete('/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = req.supabase

    const { error } = await supabase
      .from('class_schedules')
      .delete()
      .eq('id', id)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.json({ success: true })
  } catch (err) {
    console.error('DELETE /admin/schedules/:id error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/v1/admin/schedules/replace
 * Replace schedules for multiple class sections
 * Body: { sectionIds: [...], schedules: [{class_section_id, course_id, day, time_slot, room_number}] }
 */
router.put('/schedules/replace', async (req, res) => {
  try {
    const { sectionIds, schedules } = req.body
    const supabase = req.supabase

    if (!sectionIds || !Array.isArray(sectionIds) || !schedules || !Array.isArray(schedules)) {
      return res.status(400).json({ error: 'sectionIds and schedules arrays are required' })
    }

    if (sectionIds.length > 0) {
      // 1. Delete existing schedules for these sections
      const { error: deleteError } = await supabase
        .from('class_schedules')
        .delete()
        .in('class_section_id', sectionIds)

      if (deleteError) {
        return res.status(400).json({ error: deleteError.message })
      }
    }

    // 2. Insert new schedules
    if (schedules.length > 0) {
      const { data, error: insertError } = await supabase
        .from('class_schedules')
        .insert(schedules)
        .select()

      if (insertError) {
        return res.status(400).json({ error: insertError.message })
      }

      return res.status(200).json({ data, success: true })
    }

    return res.status(200).json({ data: [], success: true })
  } catch (err) {
    console.error('PUT /admin/schedules/replace error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/admin/teacher-assignments
 * Get all assignments for a teacher
 * Query: ?teacherId=xxx
 */
router.get('/teacher-assignments', async (req, res) => {
  try {
    const { teacherId } = req.query
    const supabase = req.supabase

    if (!teacherId) {
      return res.status(400).json({ error: 'teacherId is required' })
    }

    // Get teacher profile
    const { data: teacherProfile } = await supabase
      .from('teacher_profiles')
      .select('id')
      .eq('profile_id', teacherId)
      .single()

    if (!teacherProfile) {
      return res.status(404).json({ error: 'Teacher not found' })
    }

    const { data, error } = await supabase
      .from('teacher_assignments')
      .select(`
        id,
        class_sections (
          id,
          section,
          year_of_study,
          department,
          courses (id, code, name),
          enrollments (count)
        )
      `)
      .eq('teacher_id', teacherProfile.id)
      .order('assigned_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    const enriched = (data || []).map((a) => {
      const section = a.class_sections
      return {
        id: a.id,
        section: section?.section,
        yearOfStudy: section?.year_of_study,
        department: section?.department,
        course: section?.courses,
        studentsEnrolled: section?.enrollments?.[0]?.count || 0,
      }
    })

    return res.json({ data: enriched })
  } catch (err) {
    console.error('GET /admin/teacher-assignments error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/v1/admin/teacher-assignments
 * Assign a course section to a teacher
 * Body: { teacherId, sectionId }
 */
router.post('/teacher-assignments', async (req, res) => {
  try {
    const { teacherId, sectionId } = req.body
    const supabase = req.supabase

    if (!teacherId || !sectionId) {
      return res.status(400).json({
        error: 'teacherId and sectionId are required',
      })
    }

    // Get teacher profile
    const { data: teacherProfile } = await supabase
      .from('teacher_profiles')
      .select('id')
      .eq('profile_id', teacherId)
      .single()

    if (!teacherProfile) {
      return res.status(400).json({ error: 'Teacher not found' })
    }

    // Check if already assigned
    const { data: existing } = await supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_id', teacherProfile.id)
      .eq('class_section_id', sectionId)
      .single()

    if (existing) {
      return res.status(400).json({ error: 'Teacher already assigned to this section' })
    }

    // Create assignment
    const { data, error } = await supabase
      .from('teacher_assignments')
      .insert({
        teacher_id: teacherProfile.id,
        class_section_id: sectionId,
      })
      .select(`
        id,
        class_sections (
          id,
          section,
          year_of_study,
          department,
          courses (id, code, name),
          enrollments (count)
        )
      `)
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    const section = data.class_sections
    const enriched = {
      id: data.id,
      section: section?.section,
      yearOfStudy: section?.year_of_study,
      department: section?.department,
      course: section?.courses,
      studentsEnrolled: section?.enrollments?.[0]?.count || 0,
    }

    return res.status(201).json({ data: enriched })
  } catch (err) {
    console.error('POST /admin/teacher-assignments error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/v1/admin/teacher-assignments/:id
 * Remove a teacher assignment
 */
router.delete('/teacher-assignments/:id', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = req.supabase

    const { error } = await supabase
      .from('teacher_assignments')
      .delete()
      .eq('id', id)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.json({ success: true })
  } catch (err) {
    console.error('DELETE /admin/teacher-assignments/:id error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/admin/departments/:code/teachers
 * Get all teachers in a specific department
 */
router.get('/departments/:code/teachers', async (req, res) => {
  try {
    const { code } = req.params
    const supabase = req.supabase

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        college_name,
        created_at,
        teacher_profiles (id, employee_id, department)
      `)
      .eq('role', 'teacher')

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    // Filter by department on the backend
    const filtered = (data || []).filter(
      (teacher) => teacher.teacher_profiles?.[0]?.department === code.toUpperCase()
    )

    const enriched = filtered.map((teacher) => ({
      id: teacher.id,
      fullName: teacher.full_name,
      email: teacher.email,
      employeeId: teacher.teacher_profiles?.[0]?.employee_id || 'N/A',
      department: teacher.teacher_profiles?.[0]?.department,
      collegeName: teacher.college_name,
      createdAt: teacher.created_at,
    }))

    return res.json({ data: enriched })
  } catch (err) {
    console.error('GET /admin/departments/:code/teachers error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/admin/departments/:code/students
 * Get all students in a specific department, grouped by year of study
 */
router.get('/departments/:code/students', async (req, res) => {
  try {
    const { code } = req.params
    const supabase = req.supabase

    const { data, error } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        full_name,
        college_name,
        created_at,
        student_profiles (id, roll_number, department, year_of_study)
      `)
      .eq('role', 'student')

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    // Filter by department and group students by year of study
    const groupedByYear = {}
      ; (data || []).forEach((student) => {
        const studentProfile = student.student_profiles?.[0]

        // Only include students from the requested department
        if (studentProfile?.department !== code.toUpperCase()) {
          return
        }

        const yearOfStudy = studentProfile?.year_of_study || 'Unknown'

        if (!groupedByYear[yearOfStudy]) {
          groupedByYear[yearOfStudy] = []
        }

        groupedByYear[yearOfStudy].push({
          id: student.id,
          fullName: student.full_name,
          email: student.email,
          rollNumber: studentProfile?.roll_number || 'N/A',
          department: studentProfile?.department,
          yearOfStudy: yearOfStudy,
          collegeName: student.college_name,
          createdAt: student.created_at,
        })
      })

    return res.json({ data: groupedByYear })
  } catch (err) {
    console.error('GET /admin/departments/:code/students error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router