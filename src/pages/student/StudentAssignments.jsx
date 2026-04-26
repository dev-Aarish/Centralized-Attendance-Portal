import AppLayout from '../../components/shared/AppLayout'
import { useEffect, useMemo, useState } from 'react'
import { getMyAssignments } from '../../lib/assignments'
import SpiralLoader from '../../components/shared/Loader'
import { apiFetch } from '../../lib/api'

export default function StudentAssignments() {
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [uploadingId, setUploadingId] = useState(null)
  const [uploadMessages, setUploadMessages] = useState({})

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await getMyAssignments()
      if (fetchError) {
        setError(fetchError.message || 'Failed to load assignments.')
        setAssignments([])
      } else {
        setAssignments(data || [])
      }

      setLoading(false)
    }

    load()
  }, [])

  const groupedByCourse = useMemo(() => {
    const map = {}
    for (const assignment of assignments) {
      const courseCode = assignment.course?.code || 'N/A'
      const courseName = assignment.course?.name || 'Unknown Course'
      const key = `${courseCode}__${courseName}`
      if (!map[key]) {
        map[key] = {
          courseCode,
          courseName,
          items: [],
        }
      }
      map[key].items.push(assignment)
    }

    return Object.values(map).sort((a, b) =>
      `${a.courseCode}${a.courseName}`.localeCompare(`${b.courseCode}${b.courseName}`)
    )
  }, [assignments])

  function toggleQuestions(assignmentId) {
    setExpanded((prev) => ({
      ...prev,
      [assignmentId]: !prev[assignmentId],
    }))
  }

  async function handleFileUpload(e, assignmentId) {
    const file = e.target.files[0]
    if (!file) return

    const updateMsg = (type, text) => {
      setUploadMessages(prev => ({ ...prev, [assignmentId]: { type, text } }))
    }

    if (file.type !== 'application/pdf') {
      updateMsg('error', 'Only PDF files are allowed.')
      e.target.value = null
      return
    }

    if (file.size > 200 * 1024) {
      updateMsg('error', 'File size must not exceed 200KB.')
      e.target.value = null
      return
    }

    try {
      setUploadingId(assignmentId)
      updateMsg('info', 'Uploading...')
      
      const formData = new FormData()
      formData.append('file', file)
      
      await apiFetch(`/api/v1/assignments/${assignmentId}/submit`, {
        method: 'POST',
        body: formData,
        cache: false
      })
      
      updateMsg('success', 'Assignment submitted successfully!')
      
      setAssignments(prev => prev.map(a => 
        a.id === assignmentId ? { ...a, hasSubmitted: true } : a
      ))
    } catch (err) {
      updateMsg('error', err.message || 'Upload failed.')
    } finally {
      setUploadingId(null)
      e.target.value = null
    }
  }

  return (
    <AppLayout title="Assignments">
      <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto p-2">
        <div className="bg-gray-50 dark:bg-gray-800/60 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700/50">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Course Assignments</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Read-only view: you can open assignment questions and submit answers only when your attendance in that course is at least 75%.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <SpiralLoader />
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl border border-red-100 dark:border-red-800/30 text-center text-sm font-medium">
            {error}
          </div>
        ) : groupedByCourse.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-12 text-center shadow-sm mt-2">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No assignments available yet.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {groupedByCourse.map((group) => (
              <section key={`${group.courseCode}-${group.courseName}`} className="space-y-4">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider pl-1">
                  {group.courseCode} — {group.courseName}
                </h3>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {group.items
                    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                    .map((assignment) => {
                      const isOpen = !!expanded[assignment.id]
                      const isLocked = !assignment.isAccessible
                      const attendancePercent = assignment.attendance?.percentage ?? 0

                      return (
                        <article
                          key={assignment.id}
                          className={`rounded-2xl p-5 border transition-all duration-300 ${
                            isLocked
                              ? 'bg-gray-50 dark:bg-gray-800/70 border-gray-200 dark:border-gray-700'
                              : assignment.hasSubmitted
                                ? 'bg-gray-50 dark:bg-gray-800/30 border-gray-100 dark:border-gray-800/50 opacity-60 hover:opacity-80'
                                : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">{assignment.title}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Assigned by {assignment.teacher?.name || 'Assigned Teacher'}
                              </p>
                            </div>

                            {isLocked ? (
                              <span
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/40"
                                title="Locked due to attendance below 75%"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                Blocked
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900/40">
                                Accessible
                              </span>
                            )}
                          </div>

                          {assignment.description ? (
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
                              {assignment.description}
                            </p>
                          ) : (
                            <p className="text-sm text-gray-400 dark:text-gray-500 mt-3 italic">No description provided.</p>
                          )}

                          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 bg-white/60 dark:bg-gray-900/50">
                              <p className="text-gray-500 dark:text-gray-400">Questions</p>
                              <p className="text-gray-900 dark:text-white font-semibold mt-0.5">
                                {assignment.questions?.length ?? assignment.questionCount ?? 0}
                              </p>
                            </div>
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2 bg-white/60 dark:bg-gray-900/50">
                              <p className="text-gray-500 dark:text-gray-400">Attendance</p>
                              <p className={`font-semibold mt-0.5 ${isLocked ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                {attendancePercent}%
                              </p>
                            </div>
                          </div>

                          {isLocked ? (
                            <div className="mt-4 rounded-xl border border-red-100 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/20 px-3 py-2">
                              <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                                {assignment.blockedReason || 'Minimum 75% attendance required in this course to access this assignment.'}
                              </p>
                            </div>
                          ) : (
                            <div className="mt-4">
                              <div className="flex flex-col gap-4 border-t border-gray-100 dark:border-gray-800 pt-4">
                                <div className="flex items-center justify-between">
                                  <button
                                    onClick={() => toggleQuestions(assignment.id)}
                                    className="text-xs px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors shrink-0"
                                  >
                                    {isOpen ? 'Hide Questions' : 'View Questions'}
                                  </button>
                                  
                                  <div className="flex flex-col items-end gap-1.5 w-full max-w-[200px]">
                                    {assignment.hasSubmitted ? (
                                      <div className="px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-medium text-[11px] border border-green-200 dark:border-green-800/50 flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        Answer Submitted
                                      </div>
                                    ) : (
                                      <>
                                        <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                          Submit Answers <span className="text-gray-400 font-normal lowercase ml-0.5">(PDF &lt; 200KB)</span>
                                        </label>
                                        <div className="relative w-full">
                                          <input 
                                            type="file" 
                                            accept=".pdf,application/pdf"
                                            onChange={(e) => handleFileUpload(e, assignment.id)}
                                            disabled={uploadingId === assignment.id}
                                            className="block w-full text-xs text-gray-500 dark:text-gray-400
                                              file:mr-2 file:py-1 file:px-2.5
                                              file:rounded-lg file:border-0
                                              file:text-[11px] file:font-semibold
                                              file:bg-indigo-50 file:text-indigo-600
                                              hover:file:bg-indigo-100
                                              dark:file:bg-indigo-900/30 dark:file:text-indigo-400
                                              cursor-pointer disabled:opacity-50 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800"
                                          />
                                          {uploadingId === assignment.id && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 rounded-lg backdrop-blur-sm">
                                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-600 dark:text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                              </svg>
                                              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Uploading...</span>
                                            </div>
                                          )}
                                        </div>
                                        {uploadMessages[assignment.id] && (
                                          <p className={`text-[10px] font-medium leading-tight text-right ${
                                            uploadMessages[assignment.id].type === 'error' ? 'text-red-500 dark:text-red-400' : 
                                            uploadMessages[assignment.id].type === 'success' ? 'text-green-500 dark:text-green-400' : 'text-blue-500 dark:text-blue-400'
                                          }`}>
                                            {uploadMessages[assignment.id].text}
                                          </p>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {isOpen && (
                                <div className="mt-4 space-y-2">
                                  {assignment.questions?.length ? (
                                    assignment.questions.map((q, idx) => (
                                      <div
                                        key={q.id || `${assignment.id}-${idx}`}
                                        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2"
                                      >
                                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Q{idx + 1}</p>
                                        <p className="text-sm text-gray-800 dark:text-gray-200 mt-1">{q.text}</p>
                                        {(q.topic || q.difficulty) && (
                                          <div className="flex gap-2 mt-2">
                                            {q.topic && (
                                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">
                                                {q.topic}
                                              </span>
                                            )}
                                            {q.difficulty && (
                                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300">
                                                {q.difficulty}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-3">
                                      <p className="text-xs text-gray-500 dark:text-gray-400">No questions linked to this assignment yet.</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      )
                    })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}