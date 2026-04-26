import { useEffect, useState } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { getMyAssignedSections } from '../../lib/profile'
import {
  getAssignmentsForSection,
  createAssignment,
  getQuestionBank,
  addQuestion,
  linkQuestionsToAssignment,
} from '../../lib/assignments'
import { apiFetch } from '../../lib/api'

export default function TeacherAssignments() {
  const [sections, setSections] = useState([])
  const [selectedSection, setSelectedSection] = useState('')
  const [assignments, setAssignments] = useState([])
  const [questions, setQuestions] = useState([])
  const [tab, setTab] = useState('assignments')
  const [loading, setLoading] = useState(true)

  // New assignment form
  const [showForm, setShowForm] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formDue, setFormDue] = useState('')
  const [formCount, setFormCount] = useState(5)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Submissions viewing
  const [viewSubmissionsId, setViewSubmissionsId] = useState(null)
  const [submissionsData, setSubmissionsData] = useState({})
  const [loadingSubmissions, setLoadingSubmissions] = useState({})

  // New question form
  const [showQForm, setShowQForm] = useState(false)
  const [qText, setQText] = useState('')
  const [qTopic, setQTopic] = useState('')
  const [qDifficulty, setQDifficulty] = useState('medium')

  useEffect(() => {
    async function load() {
      const { data } = await getMyAssignedSections()
      setSections(data || [])
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!selectedSection) return
    loadAssignments()
    loadQuestions()
  }, [selectedSection])

  async function loadAssignments() {
    const { data, error: fetchError } = await getAssignmentsForSection(selectedSection)
    if (fetchError) {
      setError(fetchError.message || 'Failed to load assignments.')
      return
    }
    setAssignments(data || [])
  }

  async function loadQuestions() {
    const { data, error: fetchError } = await getQuestionBank(selectedSection)
    if (fetchError) {
      setError(fetchError.message || 'Failed to load question bank.')
      return
    }
    setQuestions(data || [])
  }

  async function handleCreateAssignment() {
    if (!formTitle.trim()) return setError('Title is required.')
    if (questions.length < formCount) return setError(`Not enough questions in bank. Add at least ${formCount}.`)
    setError(null)
    setSubmitting(true)

    const { data: assignment, error: assignmentError } = await createAssignment({
      classSectionId: selectedSection,
      title: formTitle.trim(),
      description: formDesc.trim(),
      questionCount: formCount,
      dueAt: formDue ? new Date(formDue).toISOString() : null,
    })

    if (assignmentError || !assignment?.id) {
      setError(assignmentError?.message || 'Failed to create assignment.')
      setSubmitting(false)
      return
    }

    // Randomly select questions
    const shuffledQuestionIds = [...questions]
      .sort(() => Math.random() - 0.5)
      .slice(0, formCount)
      .map((q) => q.id)

    if (shuffledQuestionIds.length > 0) {
      const { error: linkError } = await linkQuestionsToAssignment(assignment.id, shuffledQuestionIds)
      if (linkError) {
        setError(linkError.message || 'Assignment created, but linking questions failed.')
      }
    }

    setFormTitle(''); setFormDesc(''); setFormDue(''); setFormCount(5)
    setShowForm(false)
    setSubmitting(false)
    await loadAssignments()
  }

  async function loadSubmissions(assignmentId) {
    if (viewSubmissionsId === assignmentId) {
      setViewSubmissionsId(null)
      return
    }
    setViewSubmissionsId(assignmentId)
    if (!submissionsData[assignmentId]) {
      setLoadingSubmissions(prev => ({ ...prev, [assignmentId]: true }))
      try {
        const data = await apiFetch(`/api/v1/assignments/${assignmentId}/submissions`)
        setSubmissionsData(prev => ({ ...prev, [assignmentId]: data.data || [] }))
      } catch (err) {
        console.error(err)
        setError(err.message)
      } finally {
        setLoadingSubmissions(prev => ({ ...prev, [assignmentId]: false }))
      }
    }
  }

  async function handleAddQuestion() {
    if (!qText.trim()) return
    setError(null)
    const { error: addError } = await addQuestion({
      classSectionId: selectedSection,
      questionText: qText.trim(),
      topic: qTopic.trim() || null,
      difficulty: qDifficulty,
    })

    if (addError) {
      setError(addError.message || 'Failed to add question.')
      return
    }

    setQText(''); setQTopic(''); setQDifficulty('medium')
    setShowQForm(false)
    await loadQuestions()
  }

  return (
    <AppLayout title="Assignments">
      <div style={{ width: '100%' }} className="flex flex-col gap-6">

        {/* Course selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Select course</label>
          <select
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
            className="w-full md:w-72 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Choose a course</option>
            {sections.map((s) => (
              <option key={s.id} value={s.class_section_id}>
                {s.class_sections?.courses?.name} — {s.class_sections?.section || 'No section'}
              </option>
            ))}
          </select>
        </div>

        {selectedSection && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
              {['assignments', 'question bank'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                    tab === t
                      ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-white shadow-sm'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Assignments tab */}
            {tab === 'assignments' && (
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => setShowForm(!showForm)}
                  className="self-start text-sm px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
                >
                  {showForm ? 'Cancel' : '+ New assignment'}
                </button>

                {/* Create form */}
                {showForm && (
                  <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 flex flex-col gap-4">
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Assignment title"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <textarea
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      placeholder="Description (optional)"
                      rows={2}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <div className="flex gap-3">
                      <div className="flex flex-col gap-1.5 flex-1">
                        <label className="text-xs text-gray-500 dark:text-gray-400">Due date</label>
                        <input
                          type="datetime-local"
                          value={formDue}
                          onChange={(e) => setFormDue(e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-500 dark:text-gray-400">No. of questions</label>
                        <input
                          type="number"
                          value={formCount}
                          onChange={(e) => setFormCount(Number(e.target.value))}
                          min={1}
                          max={questions.length}
                          className="w-24 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      {questions.length} questions available in bank · {formCount} will be randomly selected
                    </p>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <button
                      onClick={handleCreateAssignment}
                      disabled={submitting}
                      className="self-end text-sm px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors disabled:opacity-40"
                    >
                      {submitting ? 'Creating...' : 'Create assignment'}
                    </button>
                  </div>
                )}

                {/* Assignment list */}
                {assignments.length === 0 ? (
                  <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
                    <p className="text-sm text-gray-400">No assignments created yet.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {assignments.map((a) => (
                      <div key={a.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 flex flex-col gap-2 transition-all">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-white">{a.title}</p>
                            {a.description && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{a.description}</p>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 shrink-0 ml-4">
                            {(a.dueAt || a.due_at)
                              ? `Due ${new Date(a.dueAt || a.due_at).toLocaleDateString()}`
                              : 'No due date'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-xs text-gray-400">
                            {(a.questionCount ?? a.question_count ?? 0)} questions · Created {new Date(a.createdAt || a.created_at).toDateString()}
                          </p>
                          <button
                            onClick={() => loadSubmissions(a.id)}
                            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors shrink-0"
                          >
                            {viewSubmissionsId === a.id ? 'Hide Submissions' : 'View Submissions'}
                          </button>
                        </div>
                        
                        {viewSubmissionsId === a.id && (
                          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                            {loadingSubmissions[a.id] ? (
                              <div className="flex justify-center py-4"><p className="text-xs text-gray-400">Loading submissions...</p></div>
                            ) : (
                              <div className="flex flex-col gap-3">
                                {(!submissionsData[a.id] || submissionsData[a.id].length === 0) ? (
                                  <p className="text-xs text-gray-500 italic">No submissions yet.</p>
                                ) : (
                                  submissionsData[a.id].map(sub => (
                                    <div key={sub.student_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                                      <div>
                                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{sub.student_name}</p>
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-0.5">
                                          {sub.roll_number} • {sub.department} • Year {sub.year} • Sec {sub.section}
                                        </p>
                                      </div>
                                      <div className="flex flex-col sm:items-end gap-1 shrink-0">
                                        <a 
                                          href={sub.file_url} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors text-center"
                                        >
                                          Download PDF
                                        </a>
                                        <span className="text-[10px] text-gray-400">
                                          {new Date(sub.submitted_at).toLocaleString()}
                                        </span>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Question bank tab */}
            {tab === 'question bank' && (
              <div className="flex flex-col gap-4">
                <button
                  onClick={() => setShowQForm(!showQForm)}
                  className="self-start text-sm px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
                >
                  {showQForm ? 'Cancel' : '+ Add question'}
                </button>

                {showQForm && (
                  <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 flex flex-col gap-4">
                    <textarea
                      value={qText}
                      onChange={(e) => setQText(e.target.value)}
                      placeholder="Question text"
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={qTopic}
                        onChange={(e) => setQTopic(e.target.value)}
                        placeholder="Topic (optional)"
                        className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <select
                        value={qDifficulty}
                        onChange={(e) => setQDifficulty(e.target.value)}
                        className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                    <button
                      onClick={handleAddQuestion}
                      className="self-end text-sm px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
                    >
                      Add question
                    </button>
                  </div>
                )}

                {questions.length === 0 ? (
                  <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
                    <p className="text-sm text-gray-400">No questions in bank yet. Add some above.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {questions.map((q, i) => (
                      <div key={q.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4 flex items-start gap-4">
                        <span className="text-xs text-gray-300 dark:text-gray-600 mt-0.5 shrink-0">{i + 1}</span>
                        <div className="flex-1">
                          <p className="text-sm text-gray-800 dark:text-white">{q.question_text}</p>
                          <div className="flex gap-2 mt-1.5">
                            {q.topic && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">
                                {q.topic}
                              </span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              q.difficulty === 'easy'
                                ? 'bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400'
                                : q.difficulty === 'hard'
                                ? 'bg-red-50 dark:bg-red-950 text-red-500 dark:text-red-400'
                                : 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                            }`}>
                              {q.difficulty}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}