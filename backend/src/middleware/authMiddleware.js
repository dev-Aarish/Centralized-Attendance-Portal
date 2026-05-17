import { supabase, supabaseAdmin, createUserClient } from '../lib/supabase.js'

const ALLOWED_DOMAINS = ['@heritageit.edu.in', '@heritageit.edu']

function normalizeEmail(rawEmail) {
  return String(rawEmail || '').trim().toLowerCase()
}

function isAllowedEmail(email) {
  const normalized = normalizeEmail(email)
  return ALLOWED_DOMAINS.some((domain) => normalized.endsWith(domain))
}

/**
 * Express middleware that verifies the Supabase JWT from the Authorization header.
 * Attaches req.user and req.supabase (user-scoped client) for downstream handlers.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    if (!isAllowedEmail(user.email)) {
      if (supabaseAdmin) {
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id)
        if (deleteError) {
          console.error('Failed to delete disallowed user:', deleteError)
        }
      }
      return res.status(403).json({ error: 'Only heritageit.edu.in / heritageit.edu accounts are allowed.' })
    }

    // Attach user info and a user-scoped Supabase client to the request
    req.user = user
    req.accessToken = token
    req.supabase = createUserClient(token)

    next()
  } catch (err) {
    console.error('Auth middleware error:', err)
    return res.status(500).json({ error: 'Authentication failed' })
  }
}
