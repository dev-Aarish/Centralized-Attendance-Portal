import { apiFetch } from './api'

export async function getAnnouncements() {
  try {
    const result = await apiFetch('/api/v1/announcements', {
      cache: false
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

export async function clearAnnouncements() {
  try {
    const result = await apiFetch('/api/v1/announcements/clear', {
      method: 'POST',
      cache: false,
    })
    return { data: result.data || null, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function deleteAnnouncement(announcementId) {
  try {
    const result = await apiFetch(`/api/v1/announcements/${announcementId}`, {
      method: 'DELETE',
      cache: false,
    })
    return { data: result.data || null, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function dismissAnnouncement(announcementId) {
  try {
    const result = await apiFetch('/api/v1/announcements/dismiss', {
      method: 'POST',
      body: JSON.stringify({ announcementId }),
      cache: false,
    })
    return { data: result.data || null, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function getAnnouncementFilters() {
  try {
    const result = await apiFetch('/api/v1/announcements/filters', {
      cache: true,
      cacheTtlMs: 5 * 60 * 1000,
      staleWindowMs: 10 * 60 * 1000,
      staleWhileRevalidate: true,
    })
    return { data: result.data || null, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}
