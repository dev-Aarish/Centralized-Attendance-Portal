import { apiFetch } from './api'

const CACHE_TTL_MS = 2 * 60 * 1000
const STALE_WINDOW_MS = 5 * 60 * 1000

export async function getMyStudentProfile() {
  try {
    const result = await apiFetch('/api/v1/profiles/student')
    return { data: result.data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function getMyProfile() {
  try {
    const result = await apiFetch('/api/v1/profiles/me', { 
      cache: true,
      cacheTtlMs: CACHE_TTL_MS,
      staleWindowMs: STALE_WINDOW_MS,
      staleWhileRevalidate: true
    })
    return { data: result.data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function uploadMyAvatar(file) {
  try {
    const formData = new FormData()
    formData.append('avatar', file)

    const result = await apiFetch('/api/v1/profiles/avatar', {
      method: 'POST',
      body: formData,
      cache: false,
    })

    return { data: result.data || null, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function getMyTeacherProfile() {
  try {
    const result = await apiFetch('/api/v1/profiles/teacher')
    return { data: result.data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// Get all class sections assigned to the current teacher
export async function getMyAssignedSections() {
  try {
    const result = await apiFetch('/api/v1/profiles/assigned-sections', {
      cache: true,
      cacheTtlMs: CACHE_TTL_MS,
      staleWindowMs: STALE_WINDOW_MS,
      staleWhileRevalidate: true,
    })
    return { data: result.data, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

// Get all class sections a student is enrolled in
export async function getMyEnrolledSections() {
  try {
    const result = await apiFetch('/api/v1/profiles/enrolled-sections')
    return { data: result.data, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

// Get all students enrolled in a specific class section
export async function getStudentsInSection(classSectionId) {
  try {
    const result = await apiFetch(`/api/v1/profiles/sections/${classSectionId}/students`, {
      cache: true,
      cacheTtlMs: CACHE_TTL_MS,
      staleWindowMs: STALE_WINDOW_MS,
      staleWhileRevalidate: true,
    })
    return { data: result.data, meta: result.meta ?? null, error: null }
  } catch (err) {
    return { data: [], meta: null, error: err }
  }
}

// Get aggregate stats for the current teacher
export async function getMyTeacherStats() {
  try {
    const result = await apiFetch('/api/v1/profiles/teacher/stats', {
      cache: true,
      cacheTtlMs: CACHE_TTL_MS,
      staleWindowMs: STALE_WINDOW_MS,
      staleWhileRevalidate: true,
    })
    return { data: result.data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}