import { useState, useEffect } from 'react'
import { getMyAttendanceDetails } from '../../lib/attendance'
import AppLayout from '../../components/shared/AppLayout'

export default function StudentCanISkip() {
  const [expandedSubject, setExpandedSubject] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let isMounted = true
    const fetchData = async () => {
      setLoading(true)
      const { data, error } = await getMyAttendanceDetails('all')
      if (isMounted) {
        if (error) {
          setError(error.message || 'Failed to fetch attendance data')
        } else {
          setSubjects(data || [])
        }
        setLoading(false)
      }
    }
    fetchData()
    return () => { isMounted = false }
  }, [])

  // Logic to calculate safe skips or needed classes
  const calculateSkips = (attended, total) => {
    if (total === 0) return { status: 'safe', value: 0, percentage: 0 }
    const percentage = (attended / total) * 100

    if (percentage >= 75) {
      const safeSkips = Math.floor((attended / 0.75) - total)
      return { status: 'safe', value: safeSkips, percentage }
    } else {
      const needed = (3 * total) - (4 * attended)
      return { status: 'danger', value: needed, percentage }
    }
  }

  const overallTotal = subjects.reduce((acc, sub) => acc + (sub.totalClasses || 0), 0)
  const overallAttended = subjects.reduce((acc, sub) => acc + (sub.attendedClasses || 0), 0)

  const overallStats = calculateSkips(overallAttended, overallTotal)

  const toggleSubject = (id) => {
    if (expandedSubject === id) {
      setExpandedSubject(null)
    } else {
      setExpandedSubject(id)
    }
  }

  return (
    <AppLayout title="Can I Skip?">
      <div className="p-4 md:p-8 max-w-4xl mx-auto pb-24 md:pb-8">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Can I Skip?</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Calculate how many classes you can safely miss without dropping below 75%.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Loading attendance data…</p>
          </div>
        ) : error ? (
          <div className="py-10 px-6 text-center rounded-2xl bg-red-50 border border-red-100">
            <p className="text-sm font-medium text-red-500">{error}</p>
          </div>
        ) : subjects.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-slate-600">No attendance data found.</p>
          </div>
        ) : (
          <>
            {/* Overall Status Card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-8 flex flex-col md:flex-row items-center gap-6">
              <div className="relative w-32 h-32 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-gray-100 dark:text-gray-700"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (251.2 * overallStats.percentage) / 100}
                    className={`transition-all duration-1000 ${
                      overallStats.status === 'safe' ? 'text-green-500' : 'text-red-500'
                    }`}
                  />
                </svg>
                <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white">
                    {overallStats.percentage.toFixed(1)}%
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Overall</span>
                </div>
              </div>

              <div className="flex-1 text-center md:text-left">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Overall Verdict</h2>
                {overallStats.status === 'safe' ? (
                  <div className="bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 p-4 rounded-xl inline-block w-full">
                    <p className="font-medium text-lg">You can safely skip <span className="font-bold text-2xl">{overallStats.value}</span> more classes</p>
                    <p className="text-sm mt-1 opacity-80">Based on your overall attendance of {overallAttended}/{overallTotal}.</p>
                  </div>
                ) : (
                  <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 p-4 rounded-xl inline-block w-full">
                    <p className="font-medium text-lg">You need to attend <span className="font-bold text-2xl">{overallStats.value}</span> more classes</p>
                    <p className="text-sm mt-1 opacity-80">To get your overall attendance back to 75%.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Subject Breakdown */}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Subject Breakdown</h2>
            <div className="space-y-4">
              {subjects.map((subject, idx) => {
                const stats = calculateSkips(subject.attendedClasses || 0, subject.totalClasses || 0)
                const subjectId = subject.subjectCode || String(idx)
                const isExpanded = expandedSubject === subjectId

                return (
                  <div
                    key={subjectId}
                    className={`bg-white dark:bg-gray-800 rounded-2xl border transition-all duration-300 overflow-hidden ${
                      isExpanded ? 'border-blue-300 dark:border-blue-700 shadow-md' : 'border-gray-100 dark:border-gray-700 shadow-sm hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {/* Subject Header */}
                    <div
                      className="p-5 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                      onClick={() => toggleSubject(subjectId)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            {subject.subjectCode}
                          </span>
                          <h3 className="font-semibold text-gray-900 dark:text-white">{subject.subjectName}</h3>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full mt-3 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ${
                              stats.status === 'safe' ? 'bg-green-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${stats.percentage}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs mt-1 text-gray-500 dark:text-gray-400">
                          <span>{stats.percentage.toFixed(1)}%</span>
                          <span>{subject.attendedClasses || 0} / {subject.totalClasses || 0} Attended</span>
                        </div>
                      </div>

                      {/* Verdict Badge */}
                      <div className="flex-shrink-0 md:w-48">
                        {stats.status === 'safe' ? (
                          <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-800/30 text-center">
                            <span className="text-xs uppercase tracking-wider font-semibold opacity-80 mb-1">Safe to skip</span>
                            <span className="text-2xl font-bold leading-none">{stats.value}</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-800/30 text-center">
                            <span className="text-xs uppercase tracking-wider font-semibold opacity-80 mb-1">Need to attend</span>
                            <span className="text-2xl font-bold leading-none">{stats.value}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded Teacher Details */}
                    {isExpanded && subject.teachers && subject.teachers.length > 0 && (
                      <div className="border-t border-gray-100 dark:border-gray-700 p-5 bg-gray-50 dark:bg-gray-800/50">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Teacher Contribution</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {subject.teachers.map((teacher, tIdx) => {
                            const teacherPct = teacher.total > 0 ? ((teacher.attended / teacher.total) * 100).toFixed(1) : 0;
                            return (
                              <div key={tIdx} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                                <div className="flex justify-between items-start mb-2">
                                  <span className="font-medium text-sm text-gray-900 dark:text-white">{teacher.name}</span>
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    teacherPct >= 75 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  }`}>
                                    {teacherPct}%
                                  </span>
                                </div>
                                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                  <span>Attended: {teacher.attended || 0}</span>
                                  <span>Total: {teacher.total || 0}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}