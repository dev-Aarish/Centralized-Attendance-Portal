import { Router } from 'express'
import multer from 'multer'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

function hashString(input) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededShuffle(items, seedInput) {
  const arr = [...items]
  let seed = hashString(String(seedInput || 'seed'))

  const nextRand = () => {
    // LCG params from Numerical Recipes, stable across runs.
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRand() * (i + 1))
    const temp = arr[i]
    arr[i] = arr[j]
    arr[j] = temp
  }

  return arr
}

async function getTeacherProfileId(supabase, profileId) {
  const { data: teacherProfile, error } = await supabase
    .from('teacher_profiles')
    .select('id')
    .eq('profile_id', profileId)
    .single()

  if (error || !teacherProfile) return null
  return teacherProfile.id
}

/**
 * POST /api/v1/assignments
 * Create a new assignment for a class section
 * Body: { classSectionId, title, questionCount, dueAt?, description? }
 */
router.post('/', async (req, res) => {
  try {
    const { classSectionId, title, questionCount, dueAt, description } = req.body
    const user = req.user
    const teacherId = await getTeacherProfileId(req.supabase, user.id)

    if (!classSectionId || !title || !questionCount) {
      return res.status(400).json({
        error: 'classSectionId, title, and questionCount are required'
      })
    }

    if (!teacherId) {
      return res.status(403).json({ error: 'Teacher profile not found' })
    }

    // Verify user is a teacher assigned to this section
    const { data: assignment } = await req.supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('class_section_id', classSectionId)
      .single()

    if (!assignment) {
      return res.status(403).json({
        error: 'You are not assigned to this class section'
      })
    }

    // Create assignment
    const { data, error } = await req.supabase
      .from('assignments')
      .insert({
        class_section_id: classSectionId,
        created_by: teacherId,
        title: title.trim(),
        question_count: questionCount,
        due_at: dueAt || null,
        description: description?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.status(201).json({ data })
  } catch (err) {
    console.error('POST /assignments error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/assignments/student
 * Get all assignments for the logged-in student across all enrolled sections
 */
router.get('/student', async (req, res) => {
  try {
    const user = req.user
    const db = supabaseAdmin || req.supabase

    // Get student profile
    const { data: studentProfile, error: spError } = await req.supabase
      .from('student_profiles')
      .select('id')
      .eq('profile_id', user.id)
      .single()

    if (spError || !studentProfile) {
      return res.status(404).json({ error: 'Student profile not found' })
    }

    // Get student enrollments and section metadata
    const { data: enrollments, error: enrollError } = await req.supabase
      .from('enrollments')
      .select(`
        class_section_id,
        class_sections (
          id,
          courses (
            id,
            name,
            code
          )
        )
      `)
      .eq('student_id', studentProfile.id)

    if (enrollError) {
      return res.status(500).json({ error: 'Failed to fetch enrollments' })
    }

    const sectionRows = enrollments || []
    const sectionIds = sectionRows.map((e) => e.class_section_id).filter(Boolean)

    if (sectionIds.length === 0) {
      return res.json({ data: [] })
    }

    const sectionMap = Object.fromEntries(
      sectionRows.map((row) => [row.class_section_id, row.class_sections])
    )

    const { data: assignmentRows, error: assignmentError } = await db
      .from('assignments')
      .select(`
        id,
        class_section_id,
        title,
        description,
        question_count,
        due_at,
        created_at,
        created_by
      `)
      .in('class_section_id', sectionIds)
      .order('created_at', { ascending: false })

    if (assignmentError) {
      return res.status(500).json({ error: assignmentError.message })
    }

    const assignments = assignmentRows || []
    if (assignments.length === 0) {
      return res.json({ data: [] })
    }

    const teacherIds = [...new Set(assignments.map((a) => a.created_by).filter(Boolean))]
    let teacherMap = {}
    if (teacherIds.length > 0) {
      const { data: teacherRows, error: teacherError } = await db
        .from('teacher_profiles')
        .select(`
          id,
          employee_id,
          profiles (
            full_name,
            email
          )
        `)
        .in('id', teacherIds)

      if (teacherError) {
        return res.status(500).json({ error: teacherError.message })
      }

      teacherMap = Object.fromEntries(
        (teacherRows || []).map((t) => [
          t.id,
          {
            id: t.id,
            name: t.profiles?.full_name || 'Assigned Teacher',
            email: t.profiles?.email || null,
            employeeId: t.employee_id || null,
          },
        ])
      )
    }

    const assignmentIds = assignments.map((a) => a.id)
    let questionMap = {}
    if (assignmentIds.length > 0) {
      const { data: linkRows, error: linkError } = await db
        .from('assignment_questions')
        .select(`
          assignment_id,
          question_bank (
            id,
            question_text,
            topic,
            difficulty
          )
        `)
        .in('assignment_id', assignmentIds)

      if (linkError) {
        return res.status(500).json({ error: linkError.message })
      }

      questionMap = (linkRows || []).reduce((acc, row) => {
        const assignmentId = row.assignment_id
        const question = row.question_bank
        if (!assignmentId || !question?.id) return acc
        if (!acc[assignmentId]) acc[assignmentId] = []
        acc[assignmentId].push({
          id: question.id,
          text: question.question_text,
          topic: question.topic,
          difficulty: question.difficulty,
        })
        return acc
      }, {})
    }

    let submittedAssignmentIds = new Set()
    if (assignmentIds.length > 0) {
      const { data: submissionRows } = await supabaseAdmin
        .from('assignment_submissions')
        .select('assignment_id')
        .eq('student_id', studentProfile.id)
        .in('assignment_id', assignmentIds)
        
      submittedAssignmentIds = new Set((submissionRows || []).map(r => r.assignment_id))
    }

    let sectionQuestionMap = {}
    if (sectionIds.length > 0) {
      const { data: sectionQuestionRows, error: sectionQuestionError } = await db
        .from('question_bank')
        .select('id, class_section_id, question_text, topic, difficulty')
        .in('class_section_id', sectionIds)

      if (sectionQuestionError) {
        return res.status(500).json({ error: sectionQuestionError.message })
      }

      sectionQuestionMap = (sectionQuestionRows || []).reduce((acc, row) => {
        if (!row?.class_section_id || !row?.id) return acc
        if (!acc[row.class_section_id]) acc[row.class_section_id] = []
        acc[row.class_section_id].push({
          id: row.id,
          text: row.question_text,
          topic: row.topic,
          difficulty: row.difficulty,
        })
        return acc
      }, {})
    }

    // Build deterministic student rank within each section so different
    // students in the same assignment section receive different offsets.
    let sectionStudentRankMap = {}
    if (sectionIds.length > 0) {
      const { data: sectionEnrollmentRows, error: sectionEnrollmentError } = await db
        .from('enrollments')
        .select('class_section_id, student_id')
        .in('class_section_id', sectionIds)

      if (sectionEnrollmentError) {
        return res.status(500).json({ error: sectionEnrollmentError.message })
      }

      const groupedBySection = (sectionEnrollmentRows || []).reduce((acc, row) => {
        const sectionId = row.class_section_id
        const sid = row.student_id
        if (!sectionId || !sid) return acc
        if (!acc[sectionId]) acc[sectionId] = []
        acc[sectionId].push(sid)
        return acc
      }, {})

      sectionStudentRankMap = Object.fromEntries(
        Object.entries(groupedBySection).map(([sectionId, studentIds]) => {
          const ranked = [...new Set(studentIds)].sort((a, b) => String(a).localeCompare(String(b)))
          const rankMap = Object.fromEntries(ranked.map((sid, idx) => [sid, idx]))
          return [sectionId, rankMap]
        })
      )
    }

    const sectionToCourseId = Object.fromEntries(
      sectionRows.map((row) => [row.class_section_id, row.class_sections?.courses?.id || null])
    )

    const sectionToCourseType = Object.fromEntries(
      sectionRows.map((row) => [
        row.class_section_id,
        String(row.class_sections?.courses?.type || '').toLowerCase() || null,
      ])
    )

    const { data: sessionRows, error: sessionError } = await db
      .from('attendance_sessions')
      .select('id, class_section_id, session_type')
      .in('class_section_id', sectionIds)

    if (sessionError) {
      return res.status(500).json({ error: sessionError.message })
    }

    const sessionIds = (sessionRows || []).map((s) => s.id)

    let recordMap = {}
    if (sessionIds.length > 0) {
      const { data: attendanceRecordRows, error: attendanceRecordError } = await db
        .from('attendance_records')
        .select('session_id, status')
        .eq('student_id', studentProfile.id)
        .in('session_id', sessionIds)

      if (attendanceRecordError) {
        return res.status(500).json({ error: attendanceRecordError.message })
      }

      recordMap = Object.fromEntries(
        (attendanceRecordRows || []).map((r) => [r.session_id, r.status])
      )
    }

    // Attendance gate must be per-course (not per-section), and missing
    // records count as absent (same model used in attendance dashboard).
    const attendanceByCourse = (sessionRows || []).reduce((acc, session) => {
      const sectionId = session.class_section_id
      if (!sectionId) return acc

      const courseId = sectionToCourseId[sectionId]
      if (!courseId) return acc

      const courseType = sectionToCourseType[sectionId]
      const sessionType = String(session.session_type || '').toLowerCase()

      // Keep gate calculation aligned with dashboard subject buckets.
      if (courseType && courseType !== 'all' && sessionType && sessionType !== courseType) {
        return acc
      }

      if (!acc[courseId]) {
        acc[courseId] = { attended: 0, total: 0 }
      }

      acc[courseId].total += 1

      const status = recordMap[session.id] || 'absent'
      if (status === 'present' || status === 'late') {
        acc[courseId].attended += 1
      }

      return acc
    }, {})

    const responseData = assignments.map((a) => {
      const section = sectionMap[a.class_section_id]
      const course = section?.courses || {}
      const teacher = teacherMap[a.created_by] || {
        id: a.created_by,
        name: 'Assigned Teacher',
        email: null,
        employeeId: null,
      }

      const attendance = attendanceByCourse[course.id] || { attended: 0, total: 0 }
      const percentage = attendance.total > 0
        ? Math.round((attendance.attended / attendance.total) * 100)
        : 0
      const canAccess = percentage >= 75

      const linkedPool = questionMap[a.id] || []
      const sectionPool = sectionQuestionMap[a.class_section_id] || []
      const pool = sectionPool.length > 0 ? sectionPool : linkedPool

      // Keep assignment-level randomization, then offset by student rank so
      // different students do not all receive the same leading subset.
      const randomizedPool = seededShuffle(pool, `assignment:${a.id}`)
      const requestedCount = Number.isFinite(Number(a.question_count))
        ? Number(a.question_count)
        : randomizedPool.length
      const effectiveCount = Math.max(0, Math.min(requestedCount, randomizedPool.length))

      const rankMapForSection = sectionStudentRankMap[a.class_section_id] || {}
      const studentRank = Number.isInteger(rankMapForSection[studentProfile.id])
        ? rankMapForSection[studentProfile.id]
        : 0

      const randomizedQuestions = []
      if (effectiveCount > 0) {
        for (let i = 0; i < effectiveCount; i += 1) {
          const index = (studentRank + i) % randomizedPool.length
          randomizedQuestions.push(randomizedPool[index])
        }
      }

      return {
        id: a.id,
        title: a.title,
        description: a.description,
        questionCount: a.question_count,
        dueAt: a.due_at,
        createdAt: a.created_at,
        sectionId: a.class_section_id,
        course: {
          id: course.id,
          name: course.name,
          code: course.code,
        },
        teacher,
        attendance: {
          attended: attendance.attended,
          total: attendance.total,
          percentage,
          required: 75,
        },
        isAccessible: canAccess,
        hasSubmitted: submittedAssignmentIds.has(a.id),
        blockedReason: canAccess
          ? null
          : 'Minimum 75% attendance required in this course to access assignment questions.',
        questions: randomizedQuestions,
      }
    })

    return res.json({ data: responseData })
  } catch (err) {
    console.error('GET /assignments/student error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/assignments/sections/:id
 * Get all assignments for a specific class section (teacher view)
 */
router.get('/sections/:id', async (req, res) => {
  try {
    const { id: classSectionId } = req.params
    const user = req.user
    const teacherId = await getTeacherProfileId(req.supabase, user.id)

    if (!teacherId) {
      return res.status(403).json({ error: 'Teacher profile not found' })
    }

    // Verify teacher is assigned to this section
    const { data: assignment } = await req.supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('class_section_id', classSectionId)
      .single()

    if (!assignment) {
      return res.status(403).json({
        error: 'You are not assigned to this class section'
      })
    }

    // Get assignments for this section
    const { data: assignments, error } = await req.supabase
      .from('assignments')
      .select(`
        id,
        title,
        question_count,
        due_at,
        description,
        created_at,
        assignment_questions (count)
      `)
      .eq('class_section_id', classSectionId)
      .order('created_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    const data = assignments.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      questionCount: a.question_count,
      dueAt: a.due_at,
      createdAt: a.created_at,
      questionsLinked: a.assignment_questions?.[0]?.count || 0,
    }))

    return res.json({ data })
  } catch (err) {
    console.error('GET /assignments/sections/:id error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/v1/assignments/questions
 * Add a question to the question bank for a class section
 * Body: { classSectionId, questionText, topic?, difficulty?, assignmentIds? }
 */
router.post('/questions', async (req, res) => {
  try {
    const { classSectionId, questionText, topic, difficulty, assignmentIds } = req.body
    const user = req.user
    const teacherId = await getTeacherProfileId(req.supabase, user.id)

    if (!classSectionId || !questionText) {
      return res.status(400).json({
        error: 'classSectionId and questionText are required'
      })
    }

    if (!teacherId) {
      return res.status(403).json({ error: 'Teacher profile not found' })
    }

    // Verify user is a teacher assigned to this section
    const { data: assignment } = await req.supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('class_section_id', classSectionId)
      .single()

    if (!assignment) {
      return res.status(403).json({
        error: 'You are not assigned to this class section'
      })
    }

    // Create question in bank
    const { data: question, error: qError } = await req.supabase
      .from('question_bank')
      .insert({
        class_section_id: classSectionId,
        created_by: teacherId,
        question_text: questionText.trim(),
        topic: topic?.trim() || null,
        difficulty: difficulty || 'medium',
      })
      .select()
      .single()

    if (qError) {
      return res.status(400).json({ error: qError.message })
    }

    // Link to assignments if specified
    if (assignmentIds && Array.isArray(assignmentIds) && assignmentIds.length > 0) {
      const links = assignmentIds.map((assignmentId) => ({
        assignment_id: assignmentId,
        question_id: question.id,
      }))

      const { error: linkError } = await req.supabase
        .from('assignment_questions')
        .insert(links)

      if (linkError) {
        console.error('Failed to link questions to assignments:', linkError)
        // Don't fail the whole request, just warn
      }
    }

    return res.status(201).json({ data: question })
  } catch (err) {
    console.error('POST /assignments/questions error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/assignments/questions/:sectionId
 * Get all questions in the question bank for a class section
 */
router.get('/questions/:sectionId', async (req, res) => {
  try {
    const { sectionId } = req.params
    const user = req.user
    const teacherId = await getTeacherProfileId(req.supabase, user.id)

    if (!teacherId) {
      return res.status(403).json({ error: 'Teacher profile not found' })
    }

    // Verify user is a teacher assigned to this section
    const { data: assignment } = await req.supabase
      .from('teacher_assignments')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('class_section_id', sectionId)
      .single()

    if (!assignment) {
      return res.status(403).json({
        error: 'You are not assigned to this class section'
      })
    }

    // Get questions
    const { data: questions, error } = await req.supabase
      .from('question_bank')
      .select(`
        id,
        question_text,
        topic,
        difficulty,
        created_at,
        assignment_questions (assignment_id)
      `)
      .eq('class_section_id', sectionId)
      .order('created_at', { ascending: false })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    const data = questions.map((q) => ({
      id: q.id,
      text: q.question_text,
      topic: q.topic,
      difficulty: q.difficulty,
      createdAt: q.created_at,
      usedInAssignments: q.assignment_questions?.map((aq) => aq.assignment_id) || [],
    }))

    return res.json({ data })
  } catch (err) {
    console.error('GET /assignments/questions/:sectionId error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/v1/assignments/:id/link-questions
 * Link existing question bank items to an assignment
 * Body: { questionIds: string[] }
 */
router.post('/:id/link-questions', async (req, res) => {
  try {
    const { id: assignmentId } = req.params
    const { questionIds } = req.body
    const user = req.user
    const teacherId = await getTeacherProfileId(req.supabase, user.id)

    if (!teacherId) {
      return res.status(403).json({ error: 'Teacher profile not found' })
    }

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return res.status(400).json({ error: 'questionIds must be a non-empty array' })
    }

    const uniqueQuestionIds = [...new Set(questionIds.filter(Boolean))]
    if (uniqueQuestionIds.length === 0) {
      return res.status(400).json({ error: 'No valid question IDs provided' })
    }

    const { data: assignment, error: assignmentError } = await req.supabase
      .from('assignments')
      .select('id, class_section_id, created_by')
      .eq('id', assignmentId)
      .single()

    if (assignmentError || !assignment) {
      return res.status(404).json({ error: 'Assignment not found' })
    }

    if (assignment.created_by !== teacherId) {
      return res.status(403).json({ error: 'You can only update your own assignments' })
    }

    const { data: validQuestions, error: questionsError } = await req.supabase
      .from('question_bank')
      .select('id')
      .in('id', uniqueQuestionIds)
      .eq('class_section_id', assignment.class_section_id)

    if (questionsError) {
      return res.status(400).json({ error: questionsError.message })
    }

    const validIds = (validQuestions || []).map((q) => q.id)
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No matching questions found for this assignment section' })
    }

    const links = validIds.map((questionId) => ({
      assignment_id: assignmentId,
      question_id: questionId,
    }))

    const { data, error } = await req.supabase
      .from('assignment_questions')
      .upsert(links, { onConflict: 'assignment_id,question_id' })
      .select('assignment_id, question_id')

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    return res.json({
      data: {
        assignmentId,
        linkedCount: data?.length || 0,
      },
    })
  } catch (err) {
    console.error('POST /assignments/:id/link-questions error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * DELETE /api/v1/assignments/:id
 * Delete an assignment (teacher only)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id: assignmentId } = req.params
    const user = req.user
    const teacherId = await getTeacherProfileId(req.supabase, user.id)

    if (!teacherId) {
      return res.status(403).json({ error: 'Teacher profile not found' })
    }

    // Get assignment and verify ownership
    const { data: assignment, error: getError } = await req.supabase
      .from('assignments')
      .select('id, class_section_id, created_by')
      .eq('id', assignmentId)
      .single()

    if (getError || !assignment) {
      return res.status(404).json({ error: 'Assignment not found' })
    }

    if (assignment.created_by !== teacherId) {
      return res.status(403).json({
        error: 'You can only delete your own assignments'
      })
    }

    // Delete assignment (cascade will handle assignment_questions)
    const { error: deleteError } = await req.supabase
      .from('assignments')
      .delete()
      .eq('id', assignmentId)

    if (deleteError) {
      return res.status(400).json({ error: deleteError.message })
    }

    return res.json({ success: true })
  } catch (err) {
    console.error('DELETE /assignments/:id error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/v1/assignments/:id/submit
 * Upload an assignment submission
 */
router.post('/:id/submit', upload.single('file'), async (req, res) => {
  try {
    const { id: assignmentId } = req.params
    const file = req.file
    const user = req.user

    if (!file) return res.status(400).json({ error: 'No file provided' })
    if (file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Only PDF files are allowed' })
    if (file.size > 200 * 1024) return res.status(400).json({ error: 'File size must not exceed 200KB' })

    const { data: studentProfile } = await req.supabase
      .from('student_profiles')
      .select('id')
      .eq('profile_id', user.id)
      .single()

    if (!studentProfile) return res.status(403).json({ error: 'Student profile not found' })

    const { data: existingSubmission } = await supabaseAdmin
      .from('assignment_submissions')
      .select('id')
      .eq('student_id', studentProfile.id)
      .eq('assignment_id', assignmentId)
      .single()

    if (existingSubmission) {
      return res.status(400).json({ error: 'You have already submitted an answer for this assignment.' })
    }

    const filePath = `${assignmentId}/${studentProfile.id}/${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('submissions')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
      })

    if (uploadError) return res.status(400).json({ error: uploadError.message })

    const { error: insertError } = await supabaseAdmin
      .from('assignment_submissions')
      .insert({
        student_id: studentProfile.id,
        assignment_id: assignmentId,
        file_url: filePath
      })

    if (insertError) {
      return res.status(400).json({ error: 'Failed to record submission in database' })
    }

    return res.json({ success: true, message: 'Assignment submitted successfully!' })
  } catch (err) {
    console.error('POST /assignments/:id/submit error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/v1/assignments/:id/submissions
 * Get submissions for an assignment
 */
router.get('/:id/submissions', async (req, res) => {
  try {
    const { id: assignmentId } = req.params
    const user = req.user
    const teacherId = await getTeacherProfileId(req.supabase, user.id)

    if (!teacherId) {
      return res.status(403).json({ error: 'Teacher profile not found' })
    }

    const { data: assignment, error: getError } = await req.supabase
      .from('assignments')
      .select('id, created_by')
      .eq('id', assignmentId)
      .single()

    if (getError || !assignment || assignment.created_by !== teacherId) {
      return res.status(403).json({ error: 'Not authorized to view submissions for this assignment' })
    }

    const { data: submissions, error: subError } = await supabaseAdmin
      .from('assignment_submissions')
      .select(`
        student_id,
        file_url,
        submitted_at,
        student_profiles (
          id,
          roll_number,
          year_of_study,
          department,
          section,
          profiles ( full_name )
        )
      `)
      .eq('assignment_id', assignmentId)

    if (subError) return res.status(400).json({ error: subError.message })
    if (!submissions || submissions.length === 0) return res.json({ data: [] })

    const data = await Promise.all(submissions.map(async (sub) => {
      const { data: urlData } = await supabaseAdmin.storage
        .from('submissions')
        .createSignedUrl(sub.file_url, 3600)
        
      const info = sub.student_profiles
      return {
        student_id: sub.student_id,
        file_name: sub.file_url.split('/').pop(),
        submitted_at: sub.submitted_at,
        file_url: urlData?.signedUrl,
        student_name: info?.profiles?.full_name || 'Unknown Student',
        roll_number: info?.roll_number || 'N/A',
        department: info?.department || 'N/A',
        year: info?.year_of_study || 'N/A',
        section: info?.section || 'N/A'
      }
    }))

    return res.json({ data })
  } catch (err) {
    console.error('GET /assignments/:id/submissions error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router