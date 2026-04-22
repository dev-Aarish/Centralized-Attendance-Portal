import { apiFetch } from './api'

export async function getMyStudentSchedule() {
  try {
    const result = await apiFetch('/api/v1/schedule/student', {
      cache: false,
      forceRefresh: true,
    })
    return { data: result.data, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

export async function getMyTeacherSchedule() {
  try {
    const result = await apiFetch('/api/v1/schedule/teacher', {
      cache: false,
      forceRefresh: true,
    })
    return { data: result.data, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}

export async function getTodaySchedule(role) {
  try {
    const result = await apiFetch(`/api/v1/schedule/today?role=${role}`, {
      cache: false,
      forceRefresh: true,
    })
    return { data: result.data, error: null }
  } catch (err) {
    return { data: [], error: err }
  }
}