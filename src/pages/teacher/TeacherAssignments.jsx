import { useEffect, useState } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { getMyAssignedSections, getStudentsInSection } from '../../lib/profile'
import { supabase } from '../../lib/supabase'

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
    const { data } = await supabase
      .from('assignments')
      .select('*')
      .eq('class_section_id', selectedSection)
      .order('created_at', { ascending: false })
    setAssignments(data || [])
  }

  async function loadQuestions() {
    const { data } = await supabase
      .from('question_bank')
      .select('*')
      .eq('class_section_id', selectedSection)
      .order('created_at', { ascending: false })
    setQuestions(data || [])
  }

  async function handleCreateAssignment() {
    if (!formTitle.trim()) return setError('Title is required.')
    if (questions.length < formCount) return setError(`Not enough questions in bank. Add at least ${formCount}.`)
    setError(null)
    setSubmitting(true)

    // Get teacher profile id
    const { data: { user } } = await supabase.auth.getUser()
    const { data: tp } = await supabase
      .from('teacher_profiles')
      .select('id')
      .eq('profile_id', user.id)
      .single()

    // Create assignment
    const { data: assignment, error: aErr } = await supabase
      .from('assignments')
      .insert({
        class_section_id: selectedSection,
        created_by: tp.id,
        title: formTitle.trim(),
        description: formDesc.trim(),
        question_count: formCount,
        due_at: formDue || null,
      })
      .select()
      .single()

    if (aErr) { setError(aErr.message); setSubmitting(false); return }

    // Randomly select questions
    const shuffled = [...questions].sort(() => Math.random() - 0.5).slice(0, formCount)
    const qRecords = shuffled.map((q) => ({ assignment_id: assignment.id, question_id: q.id }))
    await supabase.from('assignment_questions').insert(qRecords)

    setFormTitle(''); setFormDesc(''); setFormDue(''); setFormCount(5)
    setShowForm(false)
    setSubmitting(false)
    await loadAssignments()
  }

  async function handleAddQuestion() {
    if (!qText.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    const { data: tp } = await supabase
      .from('teacher_profiles')
      .select('id')
      .eq('profile_id', user.id)
      .single()

    await supabase.from('question_bank').insert({
      class_section_id: selectedSection,
      created_by: tp.id,
      question_text: qText.trim(),
      topic: qTopic.trim() || null,
      difficulty: qDifficulty,
    })
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
                      <div key={a.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 flex flex-col gap-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-white">{a.title}</p>
                            {a.description && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{a.description}</p>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 shrink-0 ml-4">
                            {a.due_at ? `Due ${new Date(a.due_at).toLocaleDateString()}` : 'No due date'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">
                          {a.question_count} questions · Created {new Date(a.created_at).toDateString()}
                        </p>
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