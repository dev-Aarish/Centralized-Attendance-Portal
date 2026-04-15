import { useEffect, useState } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { getMyAssignedSections, getStudentsInSection } from '../../lib/profile'
import { getSessionsForSection } from '../../lib/attendance'

export default function TeacherCourses() {
  const [sections, setSections] = useState([])
  const [selected, setSelected] = useState(null)
  const [students, setStudents] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await getMyAssignedSections()
      setSections(data || [])
      setLoading(false)
    }
    load()
  }, [])

  async function handleSelect(section) {
    setSelected(section)
    setLoadingDetail(true)
    const [{ data: studentData }, { data: sessionData }] = await Promise.all([
      getStudentsInSection(section.class_section_id),
      getSessionsForSection(section.class_section_id),
    ])
    setStudents(studentData || [])
    setSessions(sessionData || [])
    setLoadingDetail(false)
  }

  return (
    <AppLayout title="My Courses">
      <div style={{ width: '100%' }} className="flex flex-col gap-6">

        {!selected ? (
          <>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {loading ? 'Loading...' : `${sections.length} course${sections.length !== 1 ? 's' : ''} assigned this semester`}
            </p>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-28 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : sections.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-12 text-center">
                <p className="text-sm text-gray-400">No courses assigned yet. Contact your admin.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelect(s)}
                    className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 text-left hover:border-gray-200 dark:hover:border-gray-700 transition-colors flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                          {s.class_sections?.courses?.code}
                        </span>
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-white mt-0.5">
                          {s.class_sections?.courses?.name}
                        </h3>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {s.class_sections?.department} · {s.class_sections?.year_of_study} year
                          {s.class_sections?.section ? ` · Section ${s.class_sections.section}` : ''}
                        </p>
                      </div>
                      <span className="text-xs text-blue-500 dark:text-blue-400">View →</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-6">

            {/* Back + header */}
            <div className="flex items-center justify-between">
              <div>
                <button
                  onClick={() => { setSelected(null); setStudents([]); setSessions([]) }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 mb-2 transition-colors"
                >
                  ← Back to courses
                </button>
                <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
                  {selected.class_sections?.courses?.name}
                </h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {selected.class_sections?.courses?.code} · {selected.class_sections?.department}
                  {selected.class_sections?.section ? ` · Section ${selected.class_sections.section}` : ''}
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Students', value: loadingDetail ? '—' : students.length },
                { label: 'Sessions held', value: loadingDetail ? '—' : sessions.length },
                { label: 'Semester', value: selected.class_sections?.courses?.semester || '—' },
              ].map((s) => (
                <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-4 py-3">
                  <p className="text-xl font-semibold text-gray-900 dark:text-white">{s.value}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Student list */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Enrolled students
              </h3>
              {loadingDetail ? (
                <div className="flex flex-col gap-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : students.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
                  <p className="text-sm text-gray-400">No students enrolled yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {students.map((s, i) => (
                    <div
                      key={s.id}
                      className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-300 dark:text-gray-600 w-5">{i + 1}</span>
                        <div>
                          <p className="text-sm text-gray-800 dark:text-white font-medium">
                            {s.student_profiles.profiles.full_name}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {s.student_profiles.roll_number}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {s.student_profiles.year_of_study} yr
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent sessions */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Recent sessions
              </h3>
              {loadingDetail ? (
                <div className="flex flex-col gap-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : sessions.length === 0 ? (
                <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
                  <p className="text-sm text-gray-400">No sessions held yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sessions.slice(0, 5).map((s) => (
                    <div
                      key={s.id}
                      className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between"
                    >
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {new Date(s.session_date).toDateString()}
                      </p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 capitalize">
                        {s.session_type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}