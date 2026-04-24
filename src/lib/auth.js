// src/lib/auth.js
import { supabase } from './supabase'
import { apiFetch } from './api'

const ALLOWED_DOMAIN = '@heritageit.edu.in'

// Sign in with Google OAuth — stays client-side
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    }
  })
  return { data, error }
}

// Called in your auth callback route after Google redirects back
// Validates domain and returns the user
export async function handleAuthCallback() {
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session) {
    return { user: null, error: error || new Error('No session found') }
  }

  const email = session.user.email

  if (!email.endsWith(ALLOWED_DOMAIN)) {
    await supabase.auth.signOut()
    return {
      user: null,
      error: new Error('Only @heritageit.edu.in accounts are allowed.')
    }
  }

  return { user: session.user, error: null }
}

// Get current logged-in user — stays client-side (Supabase session)
export async function getUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}

// Get current user's role from backend API
export async function getRole() {
  const { user } = await getUser()
  if (!user) return null

  try {
    const result = await apiFetch('/api/v1/profiles/role')
    return {
      role: result.data?.role || null,
      adminDepartment: result.data?.adminDepartment || null
    }
  } catch {
    return null
  }
}

// Get full profile of current user via backend API
export async function getMyProfile() {
  const { user } = await getUser()
  if (!user) return { data: null, error: new Error('Not logged in') }

  try {
    const result = await apiFetch('/api/v1/profiles/me')
    return { data: result.data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}



// Sign out — stays client-side
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

// Listen to auth state changes (used in useAuth.js hook) — stays client-side
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
}

export async function signInWithEmail(email, password) {
  if (!email.endsWith(ALLOWED_DOMAIN)) {
    return { data: null, error: new Error('Only @heritageit.edu.in accounts are allowed.') }
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signUpWithEmail(email, password, fullName) {
  if (!email.endsWith(ALLOWED_DOMAIN)) {
    return { data: null, error: new Error('Only @heritageit.edu.in accounts are allowed.') }
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  })
  return { data, error }
}