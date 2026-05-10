import { apiFetch } from './api'

export async function getAnnouncements() {
  try {
    const result = await apiFetch('/api/v1/announcements', {
      cache: true,
      cacheTtlMs: 60 * 1000,
      staleWindowMs: 2 * 60 * 1000,
      staleWhileRevalidate: true
    })
    return { data: result.data || [], error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

export async function createAnnouncement(payload) {
  try {
    const result = await apiFetch('/api/v1/announcements', {
      method: 'POST',
      body: JSON.stringify(payload),
      cache: false,
    })
    return { data: result.data || null, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}
