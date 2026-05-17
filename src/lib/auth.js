// src/lib/auth.js
import { supabase } from './supabase'
import { apiFetch } from './api'

const ALLOWED_DOMAINS = ['@heritageit.edu.in', '@heritageit.edu']

function normalizeEmail(rawEmail) {
  return String(rawEmail || '').trim().toLowerCase()
}

function isAllowedEmail(email) {
  const normalized = normalizeEmail(email)
  return ALLOWED_DOMAINS.some((domain) => normalized.endsWith(domain))
}

async function rejectUnauthorizedUser() {
  try {
    await apiFetch('/api/v1/auth/reject', { method: 'POST', cache: false })
  } catch (err) {
    console.warn('Failed to reject unauthorized user:', err)
  }
}

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

  if (!isAllowedEmail(email)) {
    await rejectUnauthorizedUser()
    await supabase.auth.signOut()
    return {
      user: null,
      error: new Error('Only heritageit.edu.in / heritageit.edu accounts are allowed.')
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
      adminDepartment: result.data?.adminDepartment || null,
      requiresOnboarding: Boolean(result.data?.requiresOnboarding),
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
  if (!isAllowedEmail(email)) {
    return { data: null, error: new Error('Only heritageit.edu.in / heritageit.edu accounts are allowed.') }
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function sendOtpForSignup(email, fullName = null) {
  if (!isAllowedEmail(email)) {
    return { data: null, error: new Error('Only heritageit.edu.in / heritageit.edu accounts are allowed.') }
  }

  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: fullName ? { full_name: fullName } : undefined,
    },
  })

  return { data, error }
}

export async function sendOtpForLogin(email) {
  if (!isAllowedEmail(email)) {
    return { data: null, error: new Error('Only heritageit.edu.in / heritageit.edu accounts are allowed.') }
  }

  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
    },
  })

  return { data, error }
}

export async function verifyOtp(email, token) {
  if (!isAllowedEmail(email)) {
    return { data: null, error: new Error('Only heritageit.edu.in / heritageit.edu accounts are allowed.') }
  }

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  return { data, error }
}

export async function updateUserAfterOtp(password, fullName = null) {
  const updatePayload = {
    password: String(password || '').trim(),
  }

  if (fullName) {
    updatePayload.data = { full_name: fullName.trim() }
  }

  const { data, error } = await supabase.auth.updateUser(updatePayload)
  return { data, error }
}

export async function sendPasswordResetEmail(email) {
  if (!isAllowedEmail(email)) {
    return { data: null, error: new Error('Only heritageit.edu.in / heritageit.edu accounts are allowed.') }
  }

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset`,
  })

  return { data, error }
}

export async function updatePassword(newPassword) {
  const password = String(newPassword || '').trim()
  if (!password) {
    return { data: null, error: new Error('Password is required.') }
  }

  const { data, error } = await supabase.auth.updateUser({ password })
  return { data, error }
}
