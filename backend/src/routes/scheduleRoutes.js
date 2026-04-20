import { Router } from 'express'

const router = Router()
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * Normalize a class_schedule row into a consistent camelCase format
 * for the frontend to consume reliably.
 */
function normalizeSchedule(s) {
  return {
    id: s.id,
    day: s.day,
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

router.get('/student', async (req, res) => {
  try {
    // Step 1: Get the student profile (with department, year, section info)
    const { data: sp, error: spError } = await req.supabase
      .from('student_profiles')
      .select('id, department, year_of_study, section')
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

    let sectionIds = (enr || []).map(e => e.class_section_id)
    console.log('[schedule/student] Enrollments found:', sectionIds.length)

    // Step 3: If no enrollments, fall back to matching class_sections by
    // the student's department + year_of_study + section
    if (sectionIds.length === 0 && sp.department && sp.year_of_study) {
      console.log('[schedule/student] No enrollments — falling back to profile match:', {
        department: sp.department,
        year_of_study: sp.year_of_study,
        section: sp.section
      })

      let query = req.supabase
        .from('class_sections')
        .select('id')
        .eq('department', sp.department)
        .eq('year_of_study', sp.year_of_study)

      if (sp.section) {
        query = query.eq('section', sp.section)
      }

      const { data: matchedSections, error: matchErr } = await query

      if (matchErr) {
        console.error('[schedule/student] class_sections fallback error:', matchErr.message)
      }

      sectionIds = (matchedSections || []).map(s => s.id)
      console.log('[schedule/student] Matched', sectionIds.length, 'sections by profile attributes')
    }

    if (sectionIds.length === 0) {
      console.log('[schedule/student] No sections found — returning empty')
      return res.json({ data: [] })
    }

    // Step 4: Fetch schedules for the resolved section IDs
    const { data, error } = await req.supabase
      .from('class_schedules')
      .select('*, class_sections (section, courses (name, code), teacher_assignments(teacher_profiles(profiles(full_name))))')
      .in('class_section_id', sectionIds)
      .order('day', { ascending: true })

    if (error) {
      console.error('[schedule/student] class_schedules query error:', error.message)
      return res.status(400).json({ error: error.message })
    }

    console.log('[schedule/student] Found', data?.length || 0, 'schedule entries')

    const normalized = (data || []).map(normalizeSchedule)
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
      const { data: sp } = await req.supabase.from('student_profiles').select('id').eq('profile_id', req.user.id).single()
      if (sp) {
        const { data: enr } = await req.supabase.from('enrollments').select('class_section_id').eq('student_id', sp.id)
        if (enr?.length) {
          const ids = enr.map(e => e.class_section_id)
          const { data } = await req.supabase.from('class_schedules').select('*, class_sections (section, courses (name, code), teacher_assignments(teacher_profiles(profiles(full_name))))').in('class_section_id', ids).order('day', { ascending: true })
          allData = (data || []).map(normalizeSchedule)
        }
      }
    }
    const todayOnly = allData.filter(s => s.day === today)
    return res.json({ data: todayOnly })
  } catch (err) { return res.status(500).json({ error: 'Internal server error' }) }
})

export default router
