import { Router } from 'express'
import multer from 'multer'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })
const LEAVE_BUCKET = 'leave-documents'
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function normalizeDepartment(value) {
  if (!value) return ''
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function safeFileName(name) {
  return String(name || 'attachment')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
}

function normalizeDate(value) {
  if (value == null || value === '') return null
  const text = String(value).trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

async function getCurrentUserProfile(db, userId) {
  const { data, error } = await db
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  return data
}

async function getStudentProfile(db, userId) {
  const { data, error } = await db
    .from('student_profiles')
    .select('id, profile_id, roll_number, department, year_of_study, section, current_semester, profiles ( full_name )')
    .eq('profile_id', userId)
    .single()

  if (error || !data) return null
  return data
}

async function buildRecipientLists(db, studentProfile) {
  const studentDept = normalizeDepartment(studentProfile?.department)

  const [teachersRes, adminsRes, fallbackTeachersRes, fallbackProfilesRes] = await Promise.all([
    db
      .from('teacher_profiles')
      .select('id, profile_id, department, profiles ( id, full_name, role )')
      .order('department', { ascending: true }),
    db
      .from('profiles')
      .select('id, full_name, role')
      .eq('role', 'admin')
      .order('full_name', { ascending: true }),
    db
      .from('profiles')
      .select('id, full_name, role')
      .eq('role', 'teacher')
      .order('full_name', { ascending: true }),
    db
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['teacher', 'admin'])
      .order('full_name', { ascending: true }),
  ])

  let teacherRecipients = (teachersRes.data || []).map((teacher) => ({
    id: teacher.profile_id || teacher.profiles?.id || teacher.id,
    role: 'teacher',
    name: teacher.profiles?.full_name || 'Unknown Professor',
    department: teacher.department || teacher.profiles?.department || null,
    label: teacher.profiles?.full_name || 'Unknown Professor',
  })).filter((item) => item.id)

  if (teacherRecipients.length === 0) {
    teacherRecipients = (fallbackTeachersRes.data || []).map((teacher) => ({
      id: teacher.id,
      role: 'teacher',
      name: teacher.full_name || 'Unknown Professor',
      department: teacher.department || null,
      label: teacher.full_name || 'Unknown Professor',
    }))
  }

  let filteredTeachers = teacherRecipients
  if (studentDept) {
    filteredTeachers = teacherRecipients.filter((teacher) =>
      !teacher.department || normalizeDepartment(teacher.department) === studentDept
    )
  }
  if (filteredTeachers.length > 0) {
    teacherRecipients = filteredTeachers
  }

  let adminRecipients = (adminsRes.data || []).map((admin) => ({
    id: admin.id,
    role: 'admin',
    name: admin.full_name || 'HOD / Admin',
    department: null,
    label: admin.full_name || 'HOD / Admin',
  }))

  let filteredAdmins = adminRecipients
  if (studentDept) {
    filteredAdmins = adminRecipients.filter((admin) =>
      !admin.department || normalizeDepartment(admin.department) === studentDept
    )
  }
  if (filteredAdmins.length > 0) {
    adminRecipients = filteredAdmins
  }

  if (teacherRecipients.length === 0 || adminRecipients.length === 0) {
    const fallbackProfiles = fallbackProfilesRes.data || []
    
    if (teacherRecipients.length === 0) {
      teacherRecipients = fallbackProfiles
        .filter((profile) => profile.role === 'teacher')
        .map((profile) => ({
          id: profile.id,
          role: 'teacher',
          name: profile.full_name || 'Unknown Professor',
          department: null,
          label: profile.full_name || 'Unknown Professor',
        }))
    }

    if (adminRecipients.length === 0) {
      adminRecipients = fallbackProfiles
        .filter((profile) => profile.role === 'admin')
        .map((profile) => ({
          id: profile.id,
          role: 'admin',
          name: profile.full_name || 'HOD / Admin',
          department: null,
          label: profile.full_name || 'HOD / Admin',
        }))
    }
  }

  return {
    teachers: teacherRecipients,
    hods: adminRecipients,
    meta: {
      rawTeachersCount: teachersRes.data?.length || 0,
      rawAdminsCount: adminsRes.data?.length || 0,
      rawFallbackTeachersCount: fallbackTeachersRes.data?.length || 0,
      rawFallbackProfilesCount: fallbackProfilesRes.data?.length || 0,
      teacherError: teachersRes.error?.message || null,
      adminError: adminsRes.error?.message || null,
      fallbackTeacherError: fallbackTeachersRes.error?.message || null,
      fallbackProfilesError: fallbackProfilesRes.error?.message || null,
    },
  }
}

async function enrichLeaveRows(db, rows = []) {
  const studentProfileIds = [...new Set(rows.map((r) => r.student_profile_id).filter(Boolean))]
  const recipientIds = [...new Set(rows.map((r) => r.recipient_profile_id).filter(Boolean))]
  const reviewerIds = [...new Set(rows.map((r) => r.reviewed_by).filter(Boolean))]

  const [studentsRes, profilesRes, teachersRes, reviewersRes] = await Promise.all([
    studentProfileIds.length
      ? db.from('student_profiles').select('id, roll_number, profiles(id, full_name, role, email)').in('id', studentProfileIds)
      : Promise.resolve({ data: [] }),
    recipientIds.length
      ? db.from('profiles').select('id, full_name, role').in('id', recipientIds)
      : Promise.resolve({ data: [] }),
    recipientIds.length
      ? db.from('teacher_profiles').select('id, profile_id, profiles(id, full_name, role)').in('id', recipientIds)
      : Promise.resolve({ data: [] }),
    reviewerIds.length
      ? db.from('profiles').select('id, full_name, role').in('id', reviewerIds)
      : Promise.resolve({ data: [] }),
  ])

  const studentMap = {}
  ;(studentsRes.data || []).forEach(s => { studentMap[s.id] = s })

  // Build a master map of profiles by ID
  const masterProfileMap = {}
  ;(profilesRes.data || []).forEach(p => { masterProfileMap[p.id] = p })
  ;(reviewersRes.data || []).forEach(p => { masterProfileMap[p.id] = p })
  
  // If some recipients are teacher_profiles IDs, resolve their profile info
  const teacherIdToProfileMap = {}
  ;(teachersRes.data || []).forEach(t => {
    if (t.profiles) {
      teacherIdToProfileMap[t.id] = t.profiles
    }
  })

  const getRecipientInfo = (id) => {
    // 1. Check if it's a direct profile ID
    if (masterProfileMap[id]) return masterProfileMap[id]
    // 2. Check if it's a teacher profile ID
    if (teacherIdToProfileMap[id]) return teacherIdToProfileMap[id]
    return null
  }

  const reviewerMap = masterProfileMap

  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    message: row.message,
    fromDate: row.from_date,
    toDate: row.to_date,
    status: row.status,
    documentUrl: row.document_url,
    documentName: row.document_name,
    documentType: row.document_type,
    responseMessage: row.response_message,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    sender: {
      id: row.student_profile_id,
      profileId: studentMap[row.student_profile_id]?.profile_id || null,
      name: studentMap[row.student_profile_id]?.profiles?.full_name || 'Unknown Student',
      rollNumber: studentMap[row.student_profile_id]?.roll_number || null,
      email: studentMap[row.student_profile_id]?.profiles?.email || null,
      role: 'student',
    },
    recipient: {
      id: row.recipient_profile_id,
      name: getRecipientInfo(row.recipient_profile_id)?.full_name || 'Unknown Recipient',
      role: getRecipientInfo(row.recipient_profile_id)?.role || null,
    },
    reviewedBy: row.reviewed_by ? {
      id: row.reviewed_by,
      name: reviewerMap[row.reviewed_by]?.full_name || 'Unknown Reviewer',
      role: reviewerMap[row.reviewed_by]?.role || null,
    } : null,
  }))
}

router.get('/recipients', async (req, res) => {
  try {
    const userDb = req.supabase
    const adminDb = supabaseAdmin || req.supabase
    const currentProfile =
      (await getCurrentUserProfile(userDb, req.user.id)) ||
      (supabaseAdmin ? await getCurrentUserProfile(supabaseAdmin, req.user.id) : null)
    const studentProfile =
      (await getStudentProfile(userDb, req.user.id)) ||
      (supabaseAdmin ? await getStudentProfile(supabaseAdmin, req.user.id) : null)

    if ((!currentProfile || currentProfile.role !== 'student') && !studentProfile) {
      return res.status(403).json({
        error: 'Leave recipients are available for student accounts only.',
        debug: {
          serviceRoleEnabled: Boolean(supabaseAdmin),
          profileFound: Boolean(currentProfile),
          role: currentProfile?.role || null,
          studentProfileFound: Boolean(studentProfile),
          userId: req.user?.id || null,
        },
      })
    }

    const { teachers, hods, meta: recipientMeta } = await buildRecipientLists(adminDb, studentProfile)
    const meta = {
      serviceRoleEnabled: Boolean(supabaseAdmin),
      profileRole: currentProfile?.role || null,
      studentProfileFound: Boolean(studentProfile),
      teacherCount: teachers?.length || 0,
      hodCount: hods?.length || 0,
      ...recipientMeta,
    }
    return res.json({ data: { teachers, hods }, meta })
  } catch (err) {
    console.error('GET /leave/recipients error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/applications', async (req, res) => {
  try {
    const userDb = req.supabase
    const adminDb = supabaseAdmin || req.supabase
    const currentProfile =
      (await getCurrentUserProfile(userDb, req.user.id)) ||
      (supabaseAdmin ? await getCurrentUserProfile(supabaseAdmin, req.user.id) : null)
    const studentProfile =
      (await getStudentProfile(userDb, req.user.id)) ||
      (supabaseAdmin ? await getStudentProfile(supabaseAdmin, req.user.id) : null)

    if (!currentProfile && !studentProfile) {
      return res.status(403).json({
        error: 'Profile not found',
        debug: {
          serviceRoleEnabled: Boolean(supabaseAdmin),
          userId: req.user?.id || null,
          profileFound: Boolean(currentProfile),
          studentProfileFound: Boolean(studentProfile),
        },
      })
    }

    const query = adminDb
      .from('leave_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (currentProfile?.role === 'student' || studentProfile) {
      if (!studentProfile) return res.json({ data: [] })
      query.eq('student_profile_id', studentProfile.id)
    } else {
      query.eq('recipient_profile_id', currentProfile.id)
    }

    const { data: rows, error } = await query
    if (error) return res.status(400).json({ error: error.message })

    const data = await enrichLeaveRows(adminDb, rows || [])
    return res.json({ data })
  } catch (err) {
    console.error('GET /leave/applications error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/applications', upload.single('attachment'), async (req, res) => {
  try {
    const db = supabaseAdmin || req.supabase
    const currentProfile = await getCurrentUserProfile(db, req.user.id)

    if (!currentProfile || currentProfile.role !== 'student') {
      return res.status(403).json({ error: 'Only students can submit leave requests' })
    }

    const studentProfile = await getStudentProfile(db, req.user.id)
    if (!studentProfile) {
      return res.status(403).json({ error: 'Student profile not found' })
    }

    const recipientProfileId = String(req.body?.recipientProfileId || '').trim()
    const subject = String(req.body?.subject || '').trim()
    const message = String(req.body?.message || '').trim()
    const fromDate = normalizeDate(req.body?.fromDate)
    const toDate = normalizeDate(req.body?.toDate || req.body?.fromDate)
    const file = req.file

    if (!recipientProfileId) return res.status(400).json({ error: 'recipientProfileId is required' })
    if (!subject) return res.status(400).json({ error: 'subject is required' })
    if (!message) return res.status(400).json({ error: 'message is required' })
    if (!fromDate || !toDate) return res.status(400).json({ error: 'fromDate and toDate are required' })
    
    // Check if fromDate is at least tomorrow
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    
    const selectedFromDate = new Date(fromDate)
    selectedFromDate.setHours(0, 0, 0, 0)
    
    if (selectedFromDate.getTime() < tomorrow.getTime()) {
      return res.status(400).json({ error: 'Leave must start at least from tomorrow. Same-day or previous-day leave is not allowed.' })
    }

    if (new Date(fromDate).getTime() > new Date(toDate).getTime()) {
      return res.status(400).json({ error: 'fromDate cannot be after toDate' })
    }

    const { data: recipientProfile, error: recipientError } = await db
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', recipientProfileId)
      .single()

    if (recipientError || !recipientProfile) {
      return res.status(400).json({ error: 'Invalid recipient' })
    }

    if (recipientProfile.role !== 'teacher' && recipientProfile.role !== 'admin') {
      return res.status(400).json({ error: 'Recipient must be a professor or HOD/admin' })
    }

    let attachmentUrl = null
    let attachmentName = null
    let attachmentType = null

    if (file) {
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: 'Unsupported attachment type' })
      }

      const filePath = `leave-applications/${studentProfile.id}/${Date.now()}_${safeFileName(file.originalname)}`
      const { error: uploadError } = await db.storage.from(LEAVE_BUCKET).upload(filePath, file.buffer, {
        contentType: file.mimetype,
      })

      if (uploadError) {
        return res.status(400).json({ error: uploadError.message })
      }

      const { data: { publicUrl } } = db.storage.from(LEAVE_BUCKET).getPublicUrl(filePath)
      attachmentUrl = publicUrl
      attachmentName = file.originalname
      attachmentType = file.mimetype
    }

    const { data: createdRow, error } = await db
      .from('leave_requests')
      .insert({
        student_profile_id: studentProfile.id,
        recipient_profile_id: recipientProfileId,
        subject,
        message,
        from_date: fromDate,
        to_date: toDate,
        document_url: attachmentUrl,
        document_name: attachmentName,
        document_type: attachmentType,
      })
      .select('*')
      .single()

    if (error || !createdRow) {
      return res.status(400).json({ error: error?.message || 'Failed to create leave request' })
    }

    const [enriched] = await enrichLeaveRows(db, [createdRow])
    return res.status(201).json({ data: enriched })
  } catch (err) {
    console.error('POST /leave/applications error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.patch('/applications/:id/status', async (req, res) => {
  try {
    const db = supabaseAdmin || req.supabase
    const currentProfile = await getCurrentUserProfile(db, req.user.id)

    if (!currentProfile) {
      return res.status(403).json({ error: 'Profile not found' })
    }

    const status = String(req.body?.status || '').trim().toLowerCase()
    const responseMessage = String(req.body?.responseMessage || '').trim() || null

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved or rejected' })
    }

    const { data: existingRow, error: fetchError } = await db
      .from('leave_requests')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (fetchError || !existingRow) {
      return res.status(404).json({ error: 'Leave request not found' })
    }

    if (existingRow.recipient_profile_id !== currentProfile.id && currentProfile.role !== 'admin') {
      return res.status(403).json({ error: 'You are not allowed to update this request' })
    }

    const { data: updatedRow, error } = await db
      .from('leave_requests')
      .update({
        status,
        response_message: responseMessage,
        reviewed_by: currentProfile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select('*')
      .single()

    if (error || !updatedRow) {
      return res.status(400).json({ error: error?.message || 'Failed to update leave request' })
    }

    const [enriched] = await enrichLeaveRows(db, [updatedRow])
    return res.json({ data: enriched })
  } catch (err) {
    console.error('PATCH /leave/applications/:id/status error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
