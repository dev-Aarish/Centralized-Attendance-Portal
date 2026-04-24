import { Router } from 'express'
import multer from 'multer'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

// POST /api/v1/content/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { classSectionId, title, description, type } = req.body
    const file = req.file
    if (!file) return res.status(400).json({ error: 'No file provided' })

    const { data: tp } = await supabaseAdmin.from('teacher_profiles').select('id').eq('profile_id', req.user.id).single()
    if (!tp) return res.status(403).json({ error: 'No teacher profile' })

    const filePath = `${classSectionId}/${Date.now()}_${file.originalname}`
    const bucket = type === 'note' ? 'notes' : 'assignments'

    const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(filePath, file.buffer, {
      contentType: file.mimetype,
    })
    if (uploadError) return res.status(400).json({ error: uploadError.message })

    const { data: { publicUrl } } = supabaseAdmin.storage.from(bucket).getPublicUrl(filePath)

    const { data, error } = await supabaseAdmin
      .from('content_items')
      .insert({ class_section_id: classSectionId, uploaded_by: tp.id, type, title, description, file_url: publicUrl })
      .select()
      .single()

    if (error) return res.status(400).json({ error: error.message })
    return res.json({ data })
  } catch (err) {
    console.error('POST /content/upload error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/v1/content/sections/:id?type=note|assignment
router.get('/sections/:id', async (req, res) => {
  try {
    let query = supabaseAdmin.from('content_items').select('*').eq('class_section_id', req.params.id).order('created_at', { ascending: false })
    if (req.query.type) query = query.eq('type', req.query.type)
    const { data, error } = await query
    if (error) return res.status(400).json({ error: error.message })
    return res.json({ data })
  } catch (err) { return res.status(500).json({ error: 'Internal server error' }) }
})

// GET /api/v1/content/student?type=note|assignment
router.get('/student', async (req, res) => {
  try {
    const { data: sp } = await supabaseAdmin.from('student_profiles').select('id, year_of_study, current_semester, section').eq('profile_id', req.user.id).single()
    if (!sp) return res.json({ data: [] })
    
    // 1. Get explicit enrollments
    const { data: enr } = await supabaseAdmin.from('enrollments').select('class_section_id').eq('student_id', sp.id)
    const enrollmentIds = (enr || []).map(e => e.class_section_id)
    
    // 2. Get active routine schedules for cross-dept courses
    let routineSectionIds = []
    const studentYear = parseInt(sp.year_of_study, 10) || Math.ceil(parseInt(sp.current_semester, 10) / 2)
    if (studentYear && sp.section) {
      const { data: activeRoutine } = await supabaseAdmin
        .from('class_routines')
        .select('id')
        .eq('year_of_study', studentYear)
        .eq('section', sp.section)
        .eq('is_active', true)
        .single()
        
      if (activeRoutine) {
        const { data: routineSchedules } = await supabaseAdmin
          .from('class_schedules')
          .select('class_section_id')
          .eq('routine_id', activeRoutine.id)
        routineSectionIds = (routineSchedules || []).map(s => s.class_section_id).filter(Boolean)
      }
    }
    
    const ids = Array.from(new Set([...enrollmentIds, ...routineSectionIds]))
    if (!ids.length) return res.json({ data: [] })
    
    let query = supabaseAdmin.from('content_items').select('*, class_sections ( courses ( name, code ) )').in('class_section_id', ids).order('created_at', { ascending: false })
    if (req.query.type) query = query.eq('type', req.query.type)
    const { data, error } = await query
    if (error) return res.status(400).json({ error: error.message })
    return res.json({ data })
  } catch (err) { return res.status(500).json({ error: 'Internal server error' }) }
})

// DELETE /api/v1/content/:id
router.delete('/:id', async (req, res) => {
  try {
    const { fileUrl, type } = req.body
    if (fileUrl) {
      const filePath = fileUrl.split('/').slice(-2).join('/')
      const bucket = type === 'note' ? 'notes' : 'assignments'
      await supabaseAdmin.storage.from(bucket).remove([filePath])
    }
    const { error } = await supabaseAdmin.from('content_items').delete().eq('id', req.params.id)
    if (error) return res.status(400).json({ error: error.message })
    return res.json({ success: true })
  } catch (err) { return res.status(500).json({ error: 'Internal server error' }) }
})

export default router
