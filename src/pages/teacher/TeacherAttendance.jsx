import { useEffect, useState } from 'react'
import AppLayout from '../../components/shared/AppLayout'
// import { getMyAssignedSections, getStudentsInSection } from '../../lib/profile'
// import { createAttendanceSession, submitAttendanceRecords, getSessionsForSection } from '../../lib/attendance'
import { mockAssignedSections, mockStudentsMap, mockPreviousSessions, simulateDelay } from '../../lib/mockTeacherData'

export default function TeacherAttendance() {
  const [sections, setSections] = useState([])
  const [loadingSections, setLoadingSections] = useState(true)

  // Dashboard state
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [pastSessions, setPastSessions] = useState([])

  // Active session state
  const [isSessionActive, setIsSessionActive] = useState(false)
  const [activeSection, setActiveSection] = useState(null)
  const [students, setStudents] = useState([])
  const [attendance, setAttendance] = useState({})
  const [isBunk, setIsBunk] = useState(false)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      await simulateDelay(500)
      setSections(mockAssignedSections || [])
      setPastSessions(mockPreviousSessions || [])
      setLoadingSections(false)
    }
    load()
  }, [])

  // Group past sessions by class section
  const groupedPastSessions = sections.map(section => {
    return {
      section,
      sessions: pastSessions.filter(s => s.class_section_id === section.class_section_id)
        .sort((a, b) => new Date(b.date) - new Date(a.date)) // newest first
    }
  }).filter(group => group.sessions.length > 0)

  async function handleStartSession() {
    if (!selectedSectionId) return
    const section = sections.find(s => s.class_section_id === selectedSectionId)
    if (!section) return

    setActiveSection(section)
    setIsSessionActive(true)
    setLoadingStudents(true)
    setAttendance({})
    setIsBunk(false)
    setError(null)

    await simulateDelay(500)
    const data = mockStudentsMap[section.class_section_id] || []
    setStudents(data)
    setLoadingStudents(false)
  }

  function handleCancelSession() {
    setIsSessionActive(false)
    setActiveSection(null)
    setStudents([])
    setAttendance({})
    setIsBunk(false)
  }

  function toggle(studentId, status) {
    setAttendance((prev) => ({ ...prev, [studentId]: status }))
  }

  function markAll(status) {
    const all = {}
    students.forEach((s) => { all[s.student_profiles.id] = status })
    setAttendance(all)
    setIsBunk(false)
  }

  function handleMarkBunk() {
    setIsBunk(true)
    const all = {}
    students.forEach((s) => { all[s.student_profiles.id] = 'absent' })
    setAttendance(all)
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)

    // Simulate backend operations
    await simulateDelay(1000)

    const presentCount = Object.values(attendance).filter((v) => v === 'present').length

    // Add new session to past sessions list
    const newSession = {
      id: `session-${Date.now()}`,
      class_section_id: activeSection.class_section_id,
      date: new Date().toISOString().split('T')[0],
      present: presentCount,
      total: students.length,
      isBunk,
    }
    setPastSessions(prev => [newSession, ...prev])

    // End active session
    setSubmitting(false)
    setIsSessionActive(false)
    setActiveSection(null)
    setSelectedSectionId('')
  }

  const presentCount = Object.values(attendance).filter((v) => v === 'present').length
  const absentCount = Object.values(attendance).filter((v) => v === 'absent').length
  const unmarkedCount = students.length - Object.keys(attendance).length
  const allMarked = students.length > 0 && unmarkedCount === 0

  return (
    <AppLayout title="Attendance">
      <div style={{ width: '100%' }} className="flex flex-col gap-6">

        {/* Phase 1: Dashboard View */}
        {!isSessionActive && (
          <div className="flex flex-col gap-8">

            {/* Start Session Form */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Start a New Session</h2>

              {loadingSections ? (
                <div className="h-12 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />
              ) : sections.length === 0 ? (
                <p className="text-sm text-gray-500">You have no assigned courses.</p>
              ) : (
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                      Select Department and Section
                    </label>
                    <select
                      value={selectedSectionId}
                      onChange={(e) => setSelectedSectionId(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                    >
                      <option value="" disabled>Choose a class...</option>
                      {sections.map(s => (
                        <option key={s.id} value={s.class_section_id}>
                          {s.class_sections?.courses?.department} - Section {s.class_sections?.section || 'N/A'} ({s.class_sections?.courses?.name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleStartSession}
                    disabled={!selectedSectionId}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                  >
                    Start Session
                  </button>
                </div>
              )}
            </div>[12:27 PM]{/* Previous Sessions */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Previous Sessions</h2>

              {loadingSections ? (
                <div className="flex flex-col gap-4">
                  {[1, 2].map(i => <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />)}
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
                          {group.section.class_sections?.courses?.department} - Section {group.section.class_sections?.section}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {group.section.class_sections?.courses?.name}
                        </p>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {group.sessions.map(session => (
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
                                    {new Date(session.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                                  </p>
                                  {session.isBunk && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                                      Mass Bunk
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">Session ID: {session.id}</p>
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
        )}[12:28 PM]{/* Phase 2: Active Session Marking */}
        {isSessionActive && activeSection && (
          <div className="flex flex-col gap-4">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {activeSection.class_sections?.courses?.department} - Section {activeSection.class_sections?.section}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {activeSection.class_sections?.courses?.name} · {new Date().toDateString()}
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
              <div className="flex flex-col gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : students.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-10 text-center">
                <p className="text-sm text-gray-500">No students enrolled in this section yet.</p>
              </div>
            ) : (
              <>
                {/* Mark all buttons */}
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

                {/* Student list */}
                <div className="flex flex-col gap-2">
                  {students.map((s) => {
                    const studentId = s.student_profiles.id
                    const status = attendance[studentId]
                    return (
                      <div
                        key={s.id}
                        className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold text-sm">
                            {s.student_profiles.profiles.full_name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              {s.student_profiles.profiles.full_name}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {s.student_profiles.roll_number}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 self-end sm:self-auto">
                          <button
                            onClick={() => { setIsBunk(false); toggle(studentId, 'present'); }}
                            className={`w-12 h-10 rounded-xl flex items-center justify-center font-bold transition-colors border ${status === 'present'
                                ? 'bg-green-500 text-white border-green-600 shadow-md shadow-green-500/20'
                                : 'bg-gray-50 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-800'
                              }`}
                          >
                            P
                          </button>
                          <button
                            onClick={() => { setIsBunk(false); toggle(studentId, 'absent'); }}
                            className={`w-12 h-10 rounded-xl flex items-center justify-center font-bold transition-colors border ${status === 'absent'
                                ? 'bg-red-500 text-white border-red-600 shadow-md shadow-red-500/20'
                                : 'bg-gray-50 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-800'
                              }`}
                          >
                            A
                          </button>
                          <button
                            onClick={() => { setIsBunk(false); toggle(studentId, 'late'); }}
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

                {/* Error */}
                {error && (
                  <p className="text-sm text-red-500 font-medium px-2">{error}</p>
                )}

                {/* Summary + submit floating bar */}
                <div className="sticky bottom-4 mt-6 bg-gray-900/95 dark:bg-white/95 backdrop-blur-md border border-gray-800 dark:border-gray-200 rounded-2xl p-4 flex items-center justify-between shadow-xl shadow-black/10 dark:shadow-white/10 z-10">
                  <div className="flex gap-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-400 dark:text-gray-500">Present</span>
                      <span className="text-lg font-bold text-green-400 dark:text-green-600">{presentCount}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-400 dark:text-gray-500">Absent</span>
                      <span className="text-lg font-bold text-red-400 dark:text-red-600">{absentCount}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-400 dark:text-gray-500">Unmarked</span>
                      <span className="text-lg font-bold text-gray-300 dark:text-gray-700">{unmarkedCount}</span>
                    </div>
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={!allMarked || submitting}
                    className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold transition-colors disabled:cursor-not-allowed shadow-lg shadow-blue-600/30 disabled:shadow-none"
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