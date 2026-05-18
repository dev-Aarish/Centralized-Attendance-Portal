import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()
const MAX_MESSAGE_LENGTH = 1200
const MAX_TITLE_LENGTH = 120

function normalizePinnedUntil(value) {
  if (value == null || value === '') return null
  const text = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const today = new Date()
  const todayKey = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const parsed = new Date(`${text}T00:00:00Z`)
  if (parsed < todayKey) return null
  return text
}

function normalizeDepartment(value) {
  if (!value) return null
  return String(value).trim().toUpperCase()
}

function normalizeSection(value) {
  if (!value) return null
  return String(value).trim().toUpperCase()
}

function normalizeYear(value) {
  if (value == null || value === '') return null
  const parsed = parseInt(String(value).trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function getDepartmentFromEmail(email) {
  if (!email) return null
  const localPart = String(email).split('@')[0]?.toUpperCase()
  const departments = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AEIE', 'CSBS', 'CSDS', 'AIML', 'CHE', 'MATHEMATICS', 'PHYSICS']
  return departments.find((dept) => dept === localPart) || null
}

async function getCurrentUserRole(supabase, user, adminClient) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, department, email')
    .eq('id', user.id)
    .single()

  if (!error && data) return data

  const db = adminClient || supabase
  const { data: teacherProfile } = await db
    .from('teacher_profiles')
    .select('department')
    .eq('profile_id', user.id)
    .single()

  if (teacherProfile) {
    const fullName = user?.user_metadata?.full_name || user?.email || null
    const { error: insertError } = await db
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email,
        full_name: fullName,
        role: 'teacher',
        department: normalizeDepartment(teacherProfile.department),
      })

    if (!insertError) {
      const { data: inserted } = await db
        .from('profiles')
        .select('id, role, full_name, department, email')
        .eq('id', user.id)
        .single()

      if (inserted) return inserted
    }

    return {
      id: user.id,
      role: 'teacher',
      full_name: fullName,
      department: normalizeDepartment(teacherProfile.department),
      email: user.email,
    }
  }

  const metadataRole = String(user?.user_metadata?.role || '').toLowerCase()
  if (metadataRole === 'teacher' || metadataRole === 'admin') {
    const fullName = user?.user_metadata?.full_name || user?.email || null
    const department = metadataRole === 'admin'
      ? normalizeDepartment(getDepartmentFromEmail(user.email))
      : null

    const { error: insertError } = await db
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email,
        full_name: fullName,
        role: metadataRole,
        department,
      })

    if (!insertError) {
      const { data: inserted } = await db
        .from('profiles')
        .select('id, role, full_name, department, email')
        .eq('id', user.id)
        .single()

      if (inserted) return inserted
    }

    return {
      id: user.id,
      role: metadataRole,
      full_name: fullName,
      department,
      email: user.email,
    }
  }

  const inferredAdminDept = normalizeDepartment(getDepartmentFromEmail(user.email))
  if (inferredAdminDept) {
    const fullName = user?.user_metadata?.full_name || user?.email || null
    const { error: insertError } = await db
      .from('profiles')
      .insert({
        id: user.id,
        email: user.email,
        full_name: fullName,
        role: 'admin',
        department: inferredAdminDept,
      })

    if (!insertError) {
      const { data: inserted } = await db
        .from('profiles')
        .select('id, role, full_name, department, email')
        .eq('id', user.id)
        .single()

      if (inserted) return inserted
    }

    return {
      id: user.id,
      role: 'admin',
      full_name: fullName,
      department: inferredAdminDept,
      email: user.email,
    }
  }

  return null
}

async function getAnnouncementFilters(db) {
  const [studentRes, teacherRes] = await Promise.all([
    db.from('student_profiles').select('department, year_of_study, section'),
    db.from('teacher_profiles').select('department'),
  ])

  const studentDepartments = new Set()
  const studentYears = new Set()
  const studentSections = new Set()
  const teacherDepartments = new Set()

  ;(studentRes.data || []).forEach((row) => {
    const dept = normalizeDepartment(row?.department)
    if (dept) studentDepartments.add(dept)
    const year = normalizeYear(row?.year_of_study)
    if (year != null) studentYears.add(year)
    const section = normalizeSection(row?.section)
    if (section) studentSections.add(section)
  })

  ;(teacherRes.data || []).forEach((row) => {
    const dept = normalizeDepartment(row?.department)
    if (dept) teacherDepartments.add(dept)
  })

  return {
    student: {
      departments: Array.from(studentDepartments).sort(),
      years: Array.from(studentYears).sort((a, b) => a - b),
      sections: Array.from(studentSections).sort(),
    },
    teacher: {
      departments: Array.from(teacherDepartments).sort(),
    },
  }
}

async function getUserAnnouncementContext(supabase, userProfile, user) {
  const role = userProfile?.role

  if (role === 'student') {
    const { data: studentProfile } = await supabase
      .from('student_profiles')
      .select('department, year_of_study, section')
      .eq('profile_id', userProfile.id)
      .single()

    return {
      role: 'student',
      department: normalizeDepartment(studentProfile?.department),
      year: normalizeYear(studentProfile?.year_of_study),
      section: normalizeSection(studentProfile?.section),
    }
  }

  if (role === 'teacher') {
    const { data: teacherProfile } = await supabase
      .from('teacher_profiles')
      .select('department')
      .eq('profile_id', userProfile.id)
      .single()

    return {
      role: 'teacher',
      department: normalizeDepartment(teacherProfile?.department),
    }
  }

  if (role === 'admin') {
    const dept = normalizeDepartment(userProfile.department) || normalizeDepartment(getDepartmentFromEmail(userProfile.email))
    return {
      role: 'admin',
      department: dept,
    }
  }

  const fallbackUserId = userProfile?.id || user?.id
  if (!fallbackUserId) return null

  const { data: studentProfile } = await supabase
    .from('student_profiles')
    .select('department, year_of_study, section')
    .eq('profile_id', fallbackUserId)
    .single()

  if (studentProfile) {
    return {
      role: 'student',
      department: normalizeDepartment(studentProfile?.department),
      year: normalizeYear(studentProfile?.year_of_study),
      section: normalizeSection(studentProfile?.section),
    }
  }

  const { data: teacherProfile } = await supabase
    .from('teacher_profiles')
    .select('department')
    .eq('profile_id', fallbackUserId)
    .single()

  if (teacherProfile) {
    return {
      role: 'teacher',
      department: normalizeDepartment(teacherProfile?.department),
    }
  }

  if (user?.email) {
    return {
      role: 'admin',
      department: normalizeDepartment(getDepartmentFromEmail(user.email)),
    }
  }

  return null
}

function matchesTarget(target, context) {
  if (!target || !context) return false

  if (context.role === 'student') {
    if (target.target_role !== 'student') return false
    if (target.department && normalizeDepartment(target.department) !== context.department) return false
    if (target.year_of_study != null && normalizeYear(target.year_of_study) !== context.year) return false
    if (target.section && normalizeSection(target.section) !== context.section) return false
    return true
  }

  if (context.role === 'teacher') {
    if (target.target_role !== 'teacher') return false
    if (target.department && normalizeDepartment(target.department) !== context.department) return false
    return true
  }

  if (context.role === 'admin') {
    if (target.target_role === 'teacher') {
      if (!context.department) return true
      if (target.department && normalizeDepartment(target.department) !== context.department) return false
      return true
    }

    if (target.target_role === 'student') {
      if (!context.department) return true
      if (target.department && normalizeDepartment(target.department) !== context.department) return false
      return true
    }
  }

  return false
}

router.get('/filters', async (req, res) => {
  try {
    const db = supabaseAdmin || req.supabase
    const data = await getAnnouncementFilters(db)
    return res.json({ data })
  } catch (err) {
    console.error('GET /announcements/filters error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.get('/', async (req, res) => {
  try {
    const db = supabaseAdmin || req.supabase
    const userProfile = await getCurrentUserRole(req.supabase, req.user, supabaseAdmin)
    const context = await getUserAnnouncementContext(req.supabase, userProfile, req.user)

    const { data: clearState } = await db
      .from('announcement_clear_state')
      .select('cleared_at')
      .eq('user_id', req.user.id)
      .maybeSingle()

    const { data: dismissedRows } = await db
      .from('announcement_dismissals')
      .select('announcement_id')
      .eq('user_id', req.user.id)

    const dismissedIds = new Set((dismissedRows || []).map((row) => row.announcement_id))

    const { data: announcementRows, error } = await db
      .from('announcements')
      .select('id, title, message, created_at, created_by, pinned_until')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    const announcementIds = (announcementRows || []).map((row) => row.id).filter(Boolean)
    const { data: targetRows, error: targetError } = announcementIds.length
      ? await db
        .from('announcement_targets')
        .select('announcement_id, target_role, department, year_of_study, section')
        .in('announcement_id', announcementIds)
      : { data: [] }

    if (targetError) {
      return res.status(500).json({ error: targetError.message || 'Failed to load announcement targets' })
    }

    const targetsByAnnouncement = (targetRows || []).reduce((acc, row) => {
      if (!row?.announcement_id) return acc
      if (!acc[row.announcement_id]) acc[row.announcement_id] = []
      acc[row.announcement_id].push(row)
      return acc
    }, {})

    const createdByIds = [...new Set((announcementRows || []).map((a) => a.created_by).filter(Boolean))]

    let profileMap = {}
    if (createdByIds.length > 0) {
      const { data: profileRows } = await db
        .from('profiles')
        .select('id, full_name, role')
        .in('id', createdByIds)

      profileMap = Object.fromEntries(
        (profileRows || []).map((profile) => [profile.id, profile])
      )
    }

    const data = (announcementRows || [])
      .filter((row) => {
        if (row.created_by === req.user.id) return true
        const targets = targetsByAnnouncement[row.id] || []
        if (!targets.length) return true
        return targets.some((target) => matchesTarget(target, context))
      })
      .filter((row) => {
        if (!clearState?.cleared_at) return true
        const createdAt = row.created_at ? new Date(row.created_at) : null
        if (!createdAt) return true
        return createdAt > new Date(clearState.cleared_at)
      })
      .filter((row) => !dismissedIds.has(row.id))
      .map((row) => ({
      id: row.id,
      title: row.title,
      message: row.message,
      createdAt: row.created_at,
      pinnedUntil: row.pinned_until,
      createdBy: {
        id: row.created_by,
        name: profileMap[row.created_by]?.full_name || 'Staff Member',
        role: profileMap[row.created_by]?.role || null,
      },
    }))

    return res.json({ data })
  } catch (err) {
    console.error('GET /announcements error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/', async (req, res) => {
  try {
    const userProfile = await getCurrentUserRole(req.supabase, req.user, supabaseAdmin)

    if (!userProfile) {
      return res.status(403).json({ error: 'Profile not found' })
    }

    if (userProfile.role !== 'teacher' && userProfile.role !== 'admin') {
      return res.status(403).json({ error: 'Only teachers and admins can create announcements' })
    }

    const title = String(req.body?.title || '').trim()
    const message = String(req.body?.message || '').trim()
    const pinnedUntil = normalizePinnedUntil(req.body?.pinnedUntil)
    const targetRoles = Array.isArray(req.body?.targetRoles) ? req.body.targetRoles : []
    const studentTarget = req.body?.studentTarget || {}
    const teacherTarget = req.body?.teacherTarget || {}

    if (!title || !message) {
      return res.status(400).json({ error: 'title and message are required' })
    }

    if (title.length > MAX_TITLE_LENGTH) {
      return res.status(400).json({ error: `Title can be at most ${MAX_TITLE_LENGTH} characters` })
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message can be at most ${MAX_MESSAGE_LENGTH} characters` })
    }

    if (req.body?.pinnedUntil && !pinnedUntil) {
      return res.status(400).json({ error: 'Pinned until must be today or a future date.' })
    }

    const db = supabaseAdmin || req.supabase

    let resolvedRoles = targetRoles
      .map((role) => String(role || '').toLowerCase())
      .filter((role) => role === 'student' || role === 'teacher')

    if (userProfile.role === 'teacher') {
      resolvedRoles = ['student']
    } else if (userProfile.role === 'admin' && resolvedRoles.length === 0) {
      resolvedRoles = ['student', 'teacher']
    }

    const { data: createdRow, error } = await db
      .from('announcements')
      .insert({
        title,
        message,
        created_by: req.user.id,
        pinned_until: pinnedUntil,
      })
      .select('id, title, message, created_at, created_by, pinned_until')
      .single()

    if (error || !createdRow) {
      return res.status(400).json({ error: error?.message || 'Failed to create announcement' })
    }

    const targetRows = resolvedRoles.map((role) => {
      if (role === 'teacher') {
        return {
          announcement_id: createdRow.id,
          target_role: 'teacher',
          department: normalizeDepartment(teacherTarget?.department),
          year_of_study: null,
          section: null,
        }
      }

      return {
        announcement_id: createdRow.id,
        target_role: 'student',
        department: normalizeDepartment(studentTarget?.department),
        year_of_study: normalizeYear(studentTarget?.yearOfStudy ?? studentTarget?.year_of_study),
        section: normalizeSection(studentTarget?.section),
      }
    })

    if (targetRows.length > 0) {
      const { error: targetError } = await db
        .from('announcement_targets')
        .insert(targetRows)

      if (targetError) {
        await db
          .from('announcements')
          .delete()
          .eq('id', createdRow.id)
        return res.status(400).json({ error: targetError.message || 'Failed to save announcement targets' })
      }
    }

    return res.status(201).json({
      data: {
        id: createdRow.id,
        title: createdRow.title,
        message: createdRow.message,
        createdAt: createdRow.created_at,
        pinnedUntil: createdRow.pinned_until,
        createdBy: {
          id: createdRow.created_by,
          name: userProfile.full_name || 'Staff Member',
          role: userProfile.role,
        },
      },
    })
  } catch (err) {
    console.error('POST /announcements error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/clear', async (req, res) => {
  try {
    const db = supabaseAdmin || req.supabase
    const { error } = await db
      .from('announcement_clear_state')
      .upsert({
        user_id: req.user.id,
        cleared_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) {
      return res.status(400).json({ error: error.message || 'Failed to clear announcements' })
    }

    return res.json({ data: { cleared: true } })
  } catch (err) {
    console.error('POST /announcements/clear error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/dismiss', async (req, res) => {
  try {
    const announcementId = String(req.body?.announcementId || '').trim()
    if (!announcementId) {
      return res.status(400).json({ error: 'announcementId is required' })
    }

    const db = supabaseAdmin || req.supabase
    const { error } = await db
      .from('announcement_dismissals')
      .upsert({
        user_id: req.user.id,
        announcement_id: announcementId,
        dismissed_at: new Date().toISOString(),
      }, { onConflict: 'user_id,announcement_id' })

    if (error) {
      return res.status(400).json({ error: error.message || 'Failed to dismiss announcement' })
    }

    return res.json({ data: { dismissed: true } })
  } catch (err) {
    console.error('POST /announcements/dismiss error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const db = supabaseAdmin || req.supabase
    const userProfile = await getCurrentUserRole(req.supabase, req.user, supabaseAdmin)
    if (!userProfile) {
      return res.status(403).json({ error: 'Profile not found' })
    }

    const { data: announcement } = await db
      .from('announcements')
      .select('id, created_by')
      .eq('id', req.params.id)
      .single()

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' })
    }

    const isOwner = announcement.created_by === req.user.id
    if (!isOwner && userProfile.role !== 'admin') {
      return res.status(403).json({ error: 'Not allowed to delete this announcement' })
    }

    const { error } = await db
      .from('announcements')
      .delete()
      .eq('id', announcement.id)

    if (error) {
      return res.status(400).json({ error: error.message || 'Failed to delete announcement' })
    }

    return res.json({ data: { deleted: true } })
  } catch (err) {
    console.error('DELETE /announcements/:id error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router