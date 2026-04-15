import { useEffect, useState } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { getMyAssignedSections, getStudentsInSection } from '../../lib/profile'
import { createAttendanceSession, submitAttendanceRecords } from '../../lib/attendance'

export default function TeacherAttendance() {
  const [sections, setSections] = useState([])
  const [selectedSection, setSelectedSection] = useState(null)
  const [students, setStudents] = useState([])
  const [attendance, setAttendance] = useState({})
  const [loadingSections, setLoadingSections] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      const { data } = await getMyAssignedSections()
      setSections(data || [])
      setLoadingSections(false)
    }
    load()
  }, [])

  async function handleSelectSection(section) {
    setSelectedSection(section)
    setLoadingStudents(true)
    setAttendance({})
    setError(null)
    const { data } = await getStudentsInSection(section.class_section_id)
    setStudents(data || [])
    setLoadingStudents(false)
  }

  function toggle(studentId, status) {
    setAttendance((prev) => ({ ...prev, [studentId]: status }))
  }

  function markAll(status) {
    const all = {}
    students.forEach((s) => { all[s.student_profiles.id] = status })
    setAttendance(all)
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)

    const { data: session, error: sessionError } = await createAttendanceSession(
      selectedSection.class_section_id
    )

    if (sessionError) {
      setError(sessionError.message)
      setSubmitting(false)
      return
    }

    const { error: recordError } = await submitAttendanceRecords(session.id, attendance)

    if (recordError) {
      setError(recordError.message)
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  const presentCount = Object.values(attendance).filter((v) => v === 'present').length
  const absentCount = Object.values(attendance).filter((v) => v === 'absent').length
  const unmarkedCount = students.length - Object.keys(attendance).length
  const allMarked = students.length > 0 && unmarkedCount === 0

  return (
    <AppLayout title="Attendance">
      <div style={{ width: '100%' }} className="flex flex-col gap-6">

        {/* Section selector */}
        {!selectedSection && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Select a course to take attendance
            </p>
            {loadingSections ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : sections.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
                <p className="text-sm text-gray-400">No courses assigned yet.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectSection(s)}
                    className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4 text-left hover:border-blue-200 dark:hover:border-blue-800 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-800 dark:text-white">
                      {s.class_sections?.courses?.name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {s.class_sections?.courses?.code} · {s.class_sections?.section || 'No section'} · {s.class_sections?.department}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Attendance marking */}
        {selectedSection && !submitted && (
          <div className="flex flex-col gap-4">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
                  {selectedSection.class_sections?.courses?.name}
                </h2>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {selectedSection.class_sections?.section} · {new Date().toDateString()}
                </p>
              </div>
              <button
                onClick={() => { setSelectedSection(null); setAttendance({}); setError(null) }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                Change
              </button>
            </div>

            {loadingStudents ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : students.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
                <p className="text-sm text-gray-400">No students enrolled in this section yet.</p>
              </div>
            ) : (
              <>
                {/* Mark all buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => markAll('present')}
                    className="text-xs px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900"
                  >
                    Mark all present
                  </button>
                  <button
                    onClick={() => markAll('absent')}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950 text-red-500 dark:text-red-400 border border-red-100 dark:border-red-900"
                  >
                    Mark all absent
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
                        className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-3 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm text-gray-800 dark:text-white font-medium">
                            {s.student_profiles.profiles.full_name}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {s.student_profiles.roll_number}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => toggle(studentId, 'present')}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                              status === 'present'
                                ? 'bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800'
                                : 'border-gray-100 dark:border-gray-700 text-gray-400 hover:border-green-200'
                            }`}
                          >
                            P
                          </button>
                          <button
                            onClick={() => toggle(studentId, 'absent')}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                              status === 'absent'
                                ? 'bg-red-50 dark:bg-red-950 text-red-500 dark:text-red-400 border-red-200 dark:border-red-800'
                                : 'border-gray-100 dark:border-gray-700 text-gray-400 hover:border-red-200'
                            }`}
                          >
                            A
                          </button>
                          <button
                            onClick={() => toggle(studentId, 'late')}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                              status === 'late'
                                ? 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                                : 'border-gray-100 dark:border-gray-700 text-gray-400 hover:border-amber-200'
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
                  <p className="text-xs text-red-500">{error}</p>
                )}

                {/* Summary + submit */}
                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4 flex items-center justify-between">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    <span className="text-green-500 font-semibold">{presentCount}P</span>
                    {' · '}
                    <span className="text-red-400 font-semibold">{absentCount}A</span>
                    {' · '}
                    <span className="text-gray-400">{unmarkedCount} unmarked</span>
                  </p>
                  <button
                    onClick={handleSubmit}
                    disabled={!allMarked || submitting}
                    className="text-sm px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Success state */}
        {submitted && (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-6 py-12 flex flex-col items-center gap-3 text-center">
            <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-950 border border-green-100 dark:border-green-900 flex items-center justify-center text-green-500 text-lg">
              ✓
            </div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white">
              Attendance submitted
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {presentCount} present · {absentCount} absent · {new Date().toDateString()}
            </p>
            <button
              onClick={() => { setSubmitted(false); setSelectedSection(null); setAttendance({}) }}
              className="mt-2 text-xs text-blue-500 hover:underline"
            >
              
              Take another class
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}