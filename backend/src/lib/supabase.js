import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in backend/.env')
  process.exit(1)
}

// Server-side Supabase client (anonymous/admin)
export const supabase = createClient(supabaseUrl, supabaseKey)

// Optional privileged client for backend-only trusted flows.
// If the service role key is missing, fallback logic uses user-scoped clients.
export const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  : null

if (!serviceRoleKey) {
  console.warn('[supabase] SUPABASE_SERVICE_ROLE_KEY is missing. Privileged roster fallbacks are disabled.')
}

/**
 * Create a Supabase client authenticated as a specific user.
 * This ensures RLS policies are evaluated against the user's JWT.
 */
export function createUserClient(accessToken) {
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return [] },
      setAll() { }
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}
