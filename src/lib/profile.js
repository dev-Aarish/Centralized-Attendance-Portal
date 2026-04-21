import { apiFetch } from './api'

export async function getMyStudentProfile() {
  try {
    const result = await apiFetch('/api/v1/profile/student')
    return { data: result.data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function getMyTeacherProfile() {
  try {
    const result = await apiFetch('/api/v1/profile/teacher')
    return { data: result.data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// Get all class sections assigned to the current teacher
export async function getMyAssignedSections() {
  try {
    const result = await apiFetch('/api/v1/profile/assigned-sections', { cache: false, forceRefresh: true })
    return { data: result.data, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

// Get all class sections a student is enrolled in
export async function getMyEnrolledSections() {
  try {
    const result = await apiFetch('/api/v1/profile/enrolled-sections')
    return { data: result.data, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

// Get all students enrolled in a specific class section
export async function getStudentsInSection(classSectionId) {
  try {
    const result = await apiFetch(`/api/v1/profile/sections/${classSectionId}/students`, { cache: false, forceRefresh: true })
    return { data: result.data, meta: result.meta ?? null, error: null }
  } catch (err) {
    return { data: [], meta: null, error: err }
  }
}