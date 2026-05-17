import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'

const router = Router()
const ALLOWED_DOMAINS = ['@heritageit.edu.in', '@heritageit.edu']

function normalizeEmail(rawEmail) {
  return String(rawEmail || '').trim().toLowerCase()
}

function isAllowedEmail(email) {
  const normalized = normalizeEmail(email)
  return ALLOWED_DOMAINS.some((domain) => normalized.endsWith(domain))
}

// POST /api/v1/auth/reject — delete a user that fails domain policy
router.post('/reject', async (req, res) => {
  const email = req.user?.email
  if (!email) {
    return res.status(400).json({ error: 'Missing user email' })
  }

  if (isAllowedEmail(email)) {
    return res.status(400).json({ error: 'User email is allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Missing service role key for user cleanup' })
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(req.user.id)
  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.json({ success: true })
})

export default router
