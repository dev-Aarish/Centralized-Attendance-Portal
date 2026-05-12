import { useEffect, useMemo, useState } from 'react'
import { formatCohort } from '../../lib/format'
import { apiFetch } from '../../lib/api'
import AppLayout from '../../components/shared/AppLayout'
import { getMyAssignedSections, getStudentsInSection } from '../../lib/profile'
import {
  createAttendanceSession,
  submitAttendanceRecords,
  getSessionsForSection,
  getRecordsForSession,
  getSessionSlots,
} from '../../lib/attendance'
import SpiralLoader from '../../components/shared/Loader'

// Removed inferSessionTypeFromSection because lecture and lab are now separate subjects

function formatSessionDate(session) {
  const rawDate = session?.session_date || session?.date
  if (!rawDate) return 'Unknown date'
  return new Date(rawDate).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function buildSessionStats(records = []) {
  const total = records.length
  const present = records.filter((r) => r.status === 'present' || r.status === 'late').length
  const absent = records.filter((r) => r.status === 'absent').length
  return {
    present,
    total,
    isBunk: total > 0 && absent === total,
  }
}

const PLACEHOLDER_SLOT_RE = /^session\s+\d+$/i

function parseTimeSlotStart(slot) {
  const cleaned = String(slot || '').trim()
  if (!cleaned) return null
  const parts = cleaned.split(/-|–/)
  if (!parts.length) return null
  const start = parts[0].trim()
  const [hh, mm] = start.split(':').map((v) => parseInt(v, 10))
  if (Number.isNaN(hh)) return null
  return hh * 60 + (Number.isNaN(mm) ? 0 : mm)
}

function buildScheduleSlotMap(schedules = []) {
  const map = {}
  schedules.forEach((s) => {
    const sectionId = s.classSectionId || s.class_section_id
    const day = s.day
    const timeSlot = s.timeSlot || s.time_slot
    if (!sectionId || !day || !timeSlot) return
    const key = `${sectionId}__${day}`
    if (!map[key]) map[key] = []
    map[key].push(timeSlot)
  })

  Object.keys(map).forEach((key) => {
    map[key] = map[key]
      .slice()
      .sort((a, b) => {
        const aStart = parseTimeSlotStart(a)
        const bStart = parseTimeSlotStart(b)
        if (aStart == null && bStart == null) return 0
        if (aStart == null) return 1
        if (bStart == null) return -1
        return aStart - bStart
      })
  })

  return map
}

function resolveSessionTimeSlot(session, scheduleSlotMap) {
  const raw = String(session.time_slot || '').trim()
  if (raw && !PLACEHOLDER_SLOT_RE.test(raw)) return raw

  const rawDate = session.session_date || session.date
  if (!rawDate) return raw

  const dateObj = new Date(`${rawDate}T00:00:00`)
  if (Number.isNaN(dateObj.getTime())) return raw

  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' })
  const key = `${session.class_section_id}__${dayName}`
  const slots = scheduleSlotMap[key] || []
  if (!slots.length) return raw

  const index = Math.max(0, (session.session_number || 1) - 1)
  return slots[index] || slots[0] || raw
}

export default function TeacherAttendance() {
  const [sections, setSections] = useState([])
  const [loadingSections, setLoadingSections] = useState(true)

  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [pastSessions, setPastSessions] = useState([])

  const [isSessionActive, setIsSessionActive] = useState(false)
  const [activeSection, setActiveSection] = useState(null)
  const [students, setStudents] = useState([])
  const [attendance, setAttendance] = useState({})
  const [isBunk, setIsBunk] = useState(false)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const [todaySchedules, setTodaySchedules] = useState([])
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('')
  const [loadingSchedule, setLoadingSchedule] = useState(false)

  // Session slot availability (period-aware limits)
  const [sessionSlots, setSessionSlots] = useState(null)
  const [loadingSlots, setLoadingSlots] = useState(false)

  // Today's scheduled section IDs — used to filter the dropdown
  const [todaySectionIds, setTodaySectionIds] = useState(null) // null = loading

  useEffect(() => {
    async function loadSectionsAndHistory() {
      setLoadingSections(true)
      setError(null)

      const sectionsRes = await getMyAssignedSections()
      if (sectionsRes.error) {
        setError(sectionsRes.error.message || 'Failed to load assigned sections.')
        setSections([])
        setPastSessions([])
        setLoadingSections(false)
        return
      }

      const assigned = sectionsRes.data || []
      setSections(assigned)

      // Fetch today's schedule to know which sections have classes today
      try {
        const todayRes = await apiFetch('/api/v1/schedules/today?role=teacher')
        const todayData = todayRes.data || []
        const ids = new Set(todayData.map(s => s.classSectionId || s.class_section_id).filter(Boolean))
        setTodaySectionIds(ids)
      } catch (err) {
        console.error('Failed to load today schedule for filtering:', err)
        setTodaySectionIds(new Set())
      }

      if (assigned.length) {
        await refreshPastSessions(assigned)
      } else {
        setPastSessions([])
      }

      setLoadingSections(false)
    }

    loadSectionsAndHistory()
  }, [])

  // Fetch session slot availability whenever section or session type changes
  useEffect(() => {
    async function loadSlotsAndSchedule() {
      if (!selectedSectionId) {
        setTodaySchedules([])
        setSelectedTimeSlot('')
        setSessionSlots(null)
        return
      }

      setLoadingSchedule(true)
      setLoadingSlots(true)
      try {
        // Load today's schedule for time-slot context
        const res = await apiFetch('/api/v1/schedules/today?role=teacher')
        const myToday = (res.data || []).filter(s => s.classSectionId === selectedSectionId || s.class_section_id === selectedSectionId)
        setTodaySchedules(myToday)

        if (myToday.length === 1) {
          setSelectedTimeSlot(myToday[0].timeSlot || myToday[0].time_slot || '')
        } else {
          setSelectedTimeSlot('')
        }

        // Load session slot availability
        console.log('[slots-ui] Fetching slots for section:', selectedSectionId)
        const slotsRes = await getSessionSlots(selectedSectionId)
        console.log('[slots-ui] Response:', JSON.stringify(slotsRes))
        if (!slotsRes.error && slotsRes.data?.length > 0) {
          setSessionSlots(slotsRes.data[0])
          console.log('[slots-ui] Set sessionSlots:', JSON.stringify(slotsRes.data[0]))
        } else {
          setSessionSlots(null)
          console.log('[slots-ui] No slots data, error:', slotsRes.error?.message)
        }
      } catch (err) {
        console.error('Failed to load today schedule/slots:', err)
      } finally {
        setLoadingSchedule(false)
        setLoadingSlots(false)
      }
    }
    loadSlotsAndSchedule()
  }, [selectedSectionId])

  async function refreshPastSessions(sectionList) {
    let scheduleSlotMap = {}
    try {
      const scheduleRes = await apiFetch('/api/v1/schedules/teacher')
      scheduleSlotMap = buildScheduleSlotMap(scheduleRes.data || [])
    } catch (err) {
      console.warn('Failed to load teacher schedule for session times:', err)
    }

    const sessionLists = await Promise.all(
      (sectionList || []).map(async (section) => {
        const sessionsRes = await getSessionsForSection(section.class_section_id)
        if (sessionsRes.error || !sessionsRes.data?.length) return []

        const enrichedSessions = await Promise.all(
          sessionsRes.data.map(async (session) => {
            const recordsRes = await getRecordsForSession(session.id)
            const stats = buildSessionStats(recordsRes.data || [])
            return {
              ...session,
              class_section_id: session.class_section_id,
              date: session.session_date,
              time_slot: resolveSessionTimeSlot(session, scheduleSlotMap),
              ...stats,
            }
          })
        )

        return enrichedSessions
      })
    )

    const flattened = sessionLists
      .flat()
      .sort((a, b) => new Date(b.session_date || b.date) - new Date(a.session_date || a.date))

    setPastSessions(flattened)
  }

  const groupedPastSessions = useMemo(() => {
    return sections
      .map((section) => ({
        section,
        sessions: pastSessions
          .filter((s) => s.class_section_id === section.class_section_id)
          .sort((a, b) => new Date(b.session_date || b.date) - new Date(a.session_date || a.date)),
      }))
      .filter((group) => group.sessions.length > 0)
  }, [sections, pastSessions])

  async function handleStartSession() {
    if (!selectedSectionId) return
    const section = sections.find((s) => s.class_section_id === selectedSectionId)
    if (!section) return

    setActiveSection(section)
    setIsSessionActive(true)
    setLoadingStudents(true)
    setAttendance({})
    setIsBunk(false)
    setError(null)

    const studentsRes = await getStudentsInSection(section.class_section_id)
    if (studentsRes.error) {
      setError(studentsRes.error.message || 'Failed to load students for section.')
      setStudents([])
      setLoadingStudents(false)
      return
    }

    const nextStudents = studentsRes.data || []
    setStudents(nextStudents)

    if (nextStudents.length === 0) {
      const hint = studentsRes.meta?.hint
      setError(hint || 'No students resolved for this section. Check section/student cohort mapping.')
    }

    setLoadingStudents(false)
  }

  function handleCancelSession() {
    setIsSessionActive(false)
    setActiveSection(null)
    setStudents([])
    setAttendance({})
    setIsBunk(false)
    setError(null)
  }

  function toggle(studentId, status) {
    setAttendance((prev) => ({ ...prev, [studentId]: status }))
  }

  function markAll(status) {
    const all = {}
    students.forEach((s) => {
      all[s.student_profiles.id] = status
    })
    setAttendance(all)
    setIsBunk(false)
  }

  function handleMarkBunk() {
    setIsBunk(true)
    const all = {}
    students.forEach((s) => {
      all[s.student_profiles.id] = 'absent'
    })
    setAttendance(all)
  }

  async function resolveSessionIdForSubmit() {
    const createRes = await createAttendanceSession(activeSection.class_section_id, 'regular', selectedTimeSlot)

    if (!createRes.error && createRes.data?.id) {
      return createRes.data.id
    }

    // If all sessions are used, show a clear error
    const createErrorMsg = createRes.error?.message || ''
    throw new Error(createErrorMsg || 'Failed to create attendance session.')
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)

    try {
      const sessionId = await resolveSessionIdForSubmit()
      const submitRes = await submitAttendanceRecords(sessionId, attendance)

      if (submitRes.error) {
        throw new Error(submitRes.error.message || 'Failed to submit attendance records.')
      }

      await refreshPastSessions(sections)

      setIsSessionActive(false)
      setActiveSection(null)
      setSelectedSectionId('')
      setAttendance({})
      setStudents([])
      setIsBunk(false)
    } catch (err) {
      setError(err?.message || 'Something went wrong while submitting attendance.')
    } finally {
      setSubmitting(false)
    }
  }

  const presentCount = Object.values(attendance).filter((v) => v === 'present' || v === 'late').length
  const absentCount = Object.values(attendance).filter((v) => v === 'absent').length
  const unmarkedCount = students.length - Object.keys(attendance).length
  const allMarked = students.length > 0 && unmarkedCount === 0

  // Filter sections to only those scheduled for today
  const todaySections = todaySectionIds
    ? sections.filter(s => todaySectionIds.has(s.class_section_id))
    : sections

  return (
    <AppLayout title="Attendance">
      <div style={{ width: '100%' }} className="flex flex-col gap-6">
        {!isSessionActive && (
          <div className="flex flex-col gap-8">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Start a New Session</h2>

              {loadingSections ? (
                <div className="flex items-center justify-center min-h-[30vh]">
                  <SpiralLoader />
                </div>
              ) : sections.length === 0 ? (
                <p className="text-sm text-gray-500">You have no assigned courses.</p>
              ) : todaySections.length === 0 ? (
                <div className="text-center py-6">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3">
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                    <line x1="16" x2="16" y1="2" y2="6" />
                    <line x1="8" x2="8" y1="2" y2="6" />
                    <line x1="3" x2="21" y1="10" y2="10" />
                  </svg>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">No classes scheduled for today</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">You can only start sessions for subjects scheduled on your timetable today.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                      Select Today's Class
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <select
                        value={selectedSectionId}
                        onChange={(e) => {
                          const nextSectionId = e.target.value
                          setSelectedSectionId(nextSectionId)
                        }}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                      >
                        <option value="" disabled>Choose a class...</option>
                        {todaySections.map((s) => (
                          <option key={s.id} value={s.class_section_id}>
                            {formatCohort(s.class_sections?.department, s.class_sections?.year_of_study, s.class_sections?.section)} ({s.class_sections?.courses?.name})
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={handleStartSession}
                        disabled={
                          !selectedSectionId ||
                          loadingSlots ||
                          (sessionSlots && sessionSlots.total?.remaining <= 0)
                        }
                        className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors whitespace-nowrap"
                      >
                        {loadingSlots ? 'Checking availability...' : (
                          sessionSlots && sessionSlots.total?.remaining <= 0
                            ? 'No Sessions Available'
                            : `Start Session`
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Session Slot Availability Badge */}
                  {selectedSectionId && sessionSlots && (() => {
                    const slotInfo = sessionSlots.total
                    if (!slotInfo) return null
                    const isExhausted = slotInfo.remaining <= 0
                    return (
                      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium ${
                        isExhausted
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                          : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                      }`}>
                        <span className={`inline-block w-2 h-2 rounded-full ${isExhausted ? 'bg-red-500' : 'bg-emerald-500'}`} />
                        {isExhausted
                          ? `All ${slotInfo.max} session(s) used for today`
                          : `Session ${slotInfo.used + 1} of ${slotInfo.max} — ${slotInfo.remaining} session(s) remaining today`
                        }
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Previous Sessions</h2>

              {loadingSections ? (
                <div className="flex items-center justify-center min-h-[40vh]">
                  <SpiralLoader />
                </div>
              ) : groupedPastSessions.length === 0 ? (
                <div className="bg-white dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-2xl px-6 py-10 text-center">
                  <p className="text-sm text-gray-500">No previous sessions found.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {groupedPastSessions.map((group, idx) => (
                    <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
                      <div className="bg-gray-50 dark:bg-gray-800/80 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          {formatCohort(group.section.class_sections?.department, group.section.class_sections?.year_of_study, group.section.class_sections?.section)}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {group.section.class_sections?.courses?.name}
                        </p>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {group.sessions.map((session) => (
                          <div key={session.id} className={`px-5 py-4 flex items-center justify-between transition-colors ${session.isBunk ? 'bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${session.isBunk ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-50 dark:bg-blue-900/30'}`}>
                                {session.isBunk ? (
                                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                  </svg>
                                ) : (
                                  <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {formatSessionDate(session)}
                                  </p>
                                  {session.isBunk && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                                      Mass Bunk
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {session.session_number ? `Session ${session.session_number}` : `#${session.id?.slice(0, 8)}`}
                                  {session.time_slot && !/^session\s+\d+$/i.test(String(session.time_slot).trim())
                                    ? ` · ${session.time_slot}`
                                    : ''}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-bold ${session.isBunk ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                                {session.present} / {session.total}
                              </p>
                              <p className={`text-xs font-medium mt-0.5 ${session.isBunk ? 'text-red-500/80 dark:text-red-500/70' : 'text-green-500'}`}>
                                Present
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {isSessionActive && activeSection && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCohort(activeSection.class_sections?.department, activeSection.class_sections?.year_of_study, activeSection.class_sections?.section)}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {activeSection.class_sections?.courses?.name} · {new Date().toDateString()} {selectedTimeSlot && `· ${selectedTimeSlot}`}
                </p>
              </div>
              <button
                onClick={handleCancelSession}
                className="text-sm px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors border border-gray-200 dark:border-gray-700"
              >
                Cancel Session
              </button>
            </div>

            {loadingStudents ? (
              <div className="flex items-center justify-center min-h-[40vh]">
                <SpiralLoader />
              </div>
            ) : students.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-10 text-center">
                <p className="text-sm text-gray-500">No students enrolled in this section yet.</p>
                {error && (
                  <p className="text-xs text-red-500 mt-2">{error}</p>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-3 mt-2 mb-2">
                  <button
                    onClick={() => markAll('present')}
                    className="flex-1 sm:flex-none text-sm px-4 py-2 rounded-xl bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 font-medium transition-colors border border-green-200 dark:border-green-800/30"
                  >
                    Mark All Present
                  </button>
                  <button
                    onClick={() => markAll('absent')}
                    className="flex-1 sm:flex-none text-sm px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 font-medium transition-colors border border-red-200 dark:border-red-800/30"
                  >
                    Mark All Absent
                  </button>
                  <button
                    onClick={handleMarkBunk}
                    className={`flex-1 sm:flex-none text-sm px-4 py-2 rounded-xl font-medium transition-colors border ${isBunk
                      ? 'bg-red-500 text-white border-red-600 shadow-md shadow-red-500/20'
                      : 'bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/30'
                    }`}
                  >
                    {isBunk ? 'Marked as Bunk' : 'Mark as Mass Bunk'}
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {students.map((s) => {
                    const studentId = s.student_profiles.id
                    const status = attendance[studentId]
                    const fullName = s.student_profiles?.profiles?.full_name || 'Unknown Student'
                    const initial = fullName.charAt(0)

                    return (
                      <div
                        key={s.id}
                        className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold text-sm">
                            {initial}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{fullName}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-gray-500 mt-0.5">{s.student_profiles?.roll_number || 'N/A'}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 self-end sm:self-auto">
                          <button
                            onClick={() => { setIsBunk(false); toggle(studentId, 'present') }}
                            className={`w-12 h-10 rounded-xl flex items-center justify-center font-bold transition-colors border ${status === 'present'
                              ? 'bg-green-500 text-white border-green-600 shadow-md shadow-green-500/20'
                              : 'bg-gray-50 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-800'
                            }`}
                          >
                            P
                          </button>
                          <button
                            onClick={() => { setIsBunk(false); toggle(studentId, 'absent') }}
                            className={`w-12 h-10 rounded-xl flex items-center justify-center font-bold transition-colors border ${status === 'absent'
                              ? 'bg-red-500 text-white border-red-600 shadow-md shadow-red-500/20'
                              : 'bg-gray-50 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800'
                            }`}
                          >
                            A
                          </button>
                          <button
                            onClick={() => { setIsBunk(false); toggle(studentId, 'late') }}
                            className={`w-12 h-10 rounded-xl flex items-center justify-center font-bold transition-colors border ${status === 'late'
                              ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/20'
                              : 'bg-gray-50 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-800'
                            }`}
                          >
                            L
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {error && (
                  <p className="text-sm text-red-500 font-medium px-2">{error}</p>
                )}

                {/* Spacer to prevent content from being hidden behind the fixed bar */}
                <div className="h-28 sm:h-20" />

                {/* Fixed submission bar — sits above BottomNav on mobile */}
                <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-gray-900/95 dark:bg-white/95 backdrop-blur-md border-t border-gray-800 dark:border-gray-200 px-4 py-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0 shadow-xl shadow-black/10 dark:shadow-white/10 z-40">
                  <div className="flex gap-5 sm:gap-4">
                    <div className="flex flex-col items-center sm:items-start">
                      <span className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500">Present</span>
                      <span className="text-base sm:text-lg font-bold text-green-400 dark:text-green-600">{presentCount}</span>
                    </div>
                    <div className="flex flex-col items-center sm:items-start">
                      <span className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500">Absent</span>
                      <span className="text-base sm:text-lg font-bold text-red-400 dark:text-red-600">{absentCount}</span>
                    </div>
                    <div className="flex flex-col items-center sm:items-start">
                      <span className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-500">Unmarked</span>
                      <span className="text-base sm:text-lg font-bold text-gray-300 dark:text-gray-700">{unmarkedCount}</span>
                    </div>
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={!allMarked || submitting}
                    className="w-full sm:w-auto px-6 py-2.5 sm:py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm sm:text-base font-semibold transition-colors disabled:cursor-not-allowed shadow-lg shadow-blue-600/30 disabled:shadow-none"
                  >
                    {submitting ? 'Submitting...' : 'Submit Records'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}