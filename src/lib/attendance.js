// lib/attendanceApi.js
// Frontend API client for the Attendance Portal
// All functions return { data, error } — never throw.

import { apiFetch } from './api'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

export const SESSION_TYPES = ['all', 'regular', 'randomized', 'lecture', 'lab', 'tutorial']
export const ATTENDANCE_THRESHOLD = 75  // default % required

// ─── TEACHER: SESSION MANAGEMENT ─────────────────────────────────────────────

/**
 * Create a new attendance session for a class.
 * The backend blocks duplicate sessions for the same date automatically.
 *
 * @param {string} classSectionId
 * @param {'regular'|'randomized'|'lecture'|'lab'|'tutorial'} sessionType
 * @returns {{ data: { id: string, session_date: string, session_type: string } | null, error: Error | null }}
 */
export async function createAttendanceSession(classSectionId, sessionType = 'regular') {
  if (!SESSION_TYPES.includes(sessionType)) {
    return { data: null, error: new Error(`Invalid session type: "${sessionType}"`) }
  }
  return apiFetch('/api/v1/attendance/sessions', {
    method: 'POST',
    body: JSON.stringify({ classSectionId, sessionType }),
  }).then(r => ({ data: r.data, error: null }))
    .catch(err => ({ data: null, error: err }))
}

/**
 * Submit (or re-submit) attendance records for a session.
 * Safe to call multiple times — backend upserts on (session_id, student_id).
 *
 * @param {string} sessionId
 * @param {Record<string, 'present'|'absent'|'late'>} attendanceMap  — { studentProfileId: status }
 * @returns {{ data: Array | null, error: Error | null }}
 */
export async function submitAttendanceRecords(sessionId, attendanceMap) {
  const validStatuses = ['present', 'absent', 'late']
  const invalid = Object.entries(attendanceMap).find(([, s]) => !validStatuses.includes(s))
  if (invalid) {
    return { data: null, error: new Error(`Invalid status "${invalid[1]}" for student ${invalid[0]}`) }
  }
  return apiFetch(`/api/v1/attendance/sessions/${sessionId}/records`, {
    method: 'POST',
    body: JSON.stringify({ attendanceMap }),
  }).then(r => ({ data: r.data, error: null }))
    .catch(err => ({ data: null, error: err }))
}

// ─── TEACHER: VIEWING DATA ────────────────────────────────────────────────────

/**
 * Get all sessions for a class section, newest first.
 *
 * @param {string} classSectionId
 * @returns {{ data: Array | null, error: Error | null }}
 */
export async function getSessionsForSection(classSectionId) {
  return apiFetch(`/api/v1/attendance/sections/${classSectionId}/sessions`)
    .then(r => ({ data: r.data, error: null }))
    .catch(err => ({ data: null, error: err }))
}

export async function getRecordsForSession(sessionId) {
  return apiFetch(`/api/v1/attendance/sessions/${sessionId}/records`)
    .then(r => {
      const formatted = (r.data ?? [])
        .map(rec => ({
          id: rec.id,
          status: rec.status,
          studentId: rec.student_profiles?.id ?? null,
          rollNumber: rec.student_profiles?.roll_number ?? '—',
          fullName: rec.student_profiles?.profiles?.full_name ?? 'Unknown',
        }))
        .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }))
      return { data: formatted, error: null }
    })
    .catch(err => ({ data: null, error: err }))
}

// ─── STUDENT: ATTENDANCE DATA ─────────────────────────────────────────────────

/**
 * Get a student's attendance summary across all enrolled sections.
 * Uses the fast single-query backend route.
 *
 * @returns {{
 *   data: Array<{
 *     courseName: string,
 *     courseCode: string,
 *     total: number,
 *     attended: number,
 *     percentage: number
 *   }> | null,
 *   error: Error | null
 * }}
 */
export async function getMyAttendanceSummary() {
  return apiFetch('/api/v1/attendance/summary')
    .then(r => ({ data: r.data, error: null }))
    .catch(err => ({ data: [], error: err }))
}

/**
 * Get full attendance details grouped by subject and teacher.
 * Use session_type = 'lecture' or 'lab' to match the dashboard tabs.
 *
 * @param {'lecture'|'lab'|'regular'|'tutorial'|'randomized'} sessionType
 * @returns {{ data: Array | null, error: Error | null }}
 */
export async function getMyAttendanceDetails(sessionType) {
  if (!SESSION_TYPES.includes(sessionType)) {
    return { data: [], error: new Error(`Invalid session type: "${sessionType}"`) }
  }
  return apiFetch(`/api/v1/attendance/details/${sessionType}`)
    .then(r => ({ data: r.data, error: null }))
    .catch(err => ({ data: [], error: err }))
}

/**
 * Get compact subject summary (name + percentage) for dashboard rings.
 * Prefer this over getMyAttendanceSummary() for charts — less data transfer.
 *
 * @param {'lecture'|'lab'|'regular'|'tutorial'|'randomized'} sessionType
 * @returns {{
 *   data: Array<{ name: string, percentage: number }> | null,
 *   error: Error | null
 * }}
 */
export async function getMyAttendanceSummaryByType(sessionType) {
  if (!SESSION_TYPES.includes(sessionType)) {
    return { data: [], error: new Error(`Invalid session type: "${sessionType}"`) }
  }
  return apiFetch(`/api/v1/attendance/summary/${sessionType}`)
    .then(r => ({ data: r.data, error: null }))
    .catch(err => ({ data: [], error: err }))
}

// ─── PROJECTION UTILITIES ─────────────────────────────────────────────────────

/**
 * Closed-form calculation of how many classes a student can still miss
 * and remain above the threshold — or how many they must attend to recover.
 *
 * Replaces the old while-loop which capped arbitrarily at 50.
 *
 * Formula derivation:
 *   To stay above T%: (attended) / (total + x) >= T/100
 *   Solving for x:    x <= attended/(T/100) - total
 *
 *   To recover to T%: (attended + x) / (total + x) >= T/100
 *   Solving for x:    x >= (T/100 * total - attended) / (1 - T/100)
 *
 * @param {number} totalClasses     — sessions held so far
 * @param {number} attendedCount    — present + late
 * @param {number} threshold        — target %, default 75
 * @returns {{
 *   percentage: number,            — current attendance %
 *   status: 'safe'|'on-track'|'at-risk',
 *   canMiss: number | null,        — classes they can still skip (null if at-risk)
 *   mustAttend: number | null,     — classes needed to recover (null if safe)
 * }}
 */
export function computeAttendanceProjection(totalClasses, attendedCount, threshold = ATTENDANCE_THRESHOLD) {
  if (totalClasses === 0) {
    return { percentage: 0, status: 'on-track', canMiss: null, mustAttend: null }
  }

  const percentage = Math.round((attendedCount / totalClasses) * 100)
  const t = threshold / 100

  if (percentage >= threshold) {
    // How many can they miss? attended/(total + x) >= t → x <= attended/t - total
    const canMiss = Math.max(0, Math.floor(attendedCount / t - totalClasses))
    const status = percentage >= 85 ? 'safe' : 'on-track'
    return { percentage, status, canMiss, mustAttend: null }
  } else {
    // How many must they attend? (attended + x)/(total + x) >= t
    // x >= (t*total - attended) / (1 - t)
    const mustAttend = Math.max(0, Math.ceil((t * totalClasses - attendedCount) / (1 - t)))
    return { percentage, status: 'at-risk', canMiss: null, mustAttend }
  }
}

/**
 * Predict attendance % after N future presences and absences.
 *
 * @param {number} totalClasses
 * @param {number} attendedCount
 * @param {number} futurePresent  — planned classes to attend
 * @param {number} futureAbsent   — planned classes to skip
 * @returns {number} predicted percentage (0–100)
 */
export function predictAttendance(totalClasses, attendedCount, futurePresent, futureAbsent) {
  const newTotal = totalClasses + futurePresent + futureAbsent
  if (newTotal === 0) return 0
  return Math.round(((attendedCount + futurePresent) / newTotal) * 100)
}

/**
 * Build a "what-if" table showing projected % after 1..N more classes,
 * given a mix of attendance patterns. Useful for a forecast chart.
 *
 * @param {number} totalClasses
 * @param {number} attendedCount
 * @param {number} futureSessions  — how many upcoming classes to model
 * @returns {Array<{ session: number, ifAllPresent: number, ifAllAbsent: number, threshold: number }>}
 */
export function buildForecastTable(totalClasses, attendedCount, futureSessions = 10) {
  return Array.from({ length: futureSessions }, (_, i) => ({
    session: i + 1,
    ifAllPresent: predictAttendance(totalClasses, attendedCount, i + 1, 0),
    ifAllAbsent: predictAttendance(totalClasses, attendedCount, 0, i + 1),
    threshold: ATTENDANCE_THRESHOLD,
  }))
}