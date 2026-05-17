import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppLayout from '../../components/shared/AppLayout'
import { getQuestionBank } from '../../lib/assignments'
import { useToast } from '../../components/shared/ToastProvider'

export default function TeacherQuestionSelector() {
  const QUESTION_SELECTION_KEY = 'teacher-assignment-question-selection'
  const { addToast } = useToast()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sectionId = searchParams.get('sectionId') || ''

  const [questions, setQuestions] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ selectedTopics: [], includeUntagged: false })

  useEffect(() => {
    if (!sectionId) return

    async function load() {
      const { data, error } = await getQuestionBank(sectionId)
      if (error) return
      setQuestions(data || [])
    }

    load()
  }, [sectionId])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(QUESTION_SELECTION_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      if (parsed?.sectionId === sectionId) {
        setSelectedIds(parsed.selectedQuestionIds || [])
        setFilters({
          selectedTopics: parsed.selectedTopics || [],
          includeUntagged: Boolean(parsed.includeUntagged),
        })
      }
    } catch {
      // ignore storage errors
    }
  }, [sectionId])

  const autoSelectedIds = useMemo(() => {
    if (!filters.selectedTopics.length && !filters.includeUntagged) return []
    return questions
      .filter((q) => {
        const topic = (q.topic || '').trim()
        if (!topic && filters.includeUntagged) return true
        return topic && filters.selectedTopics.includes(topic)
      })
      .map((q) => q.id)
  }, [questions, filters])

  const mergedSelectedIds = useMemo(() => {
    const set = new Set([...(selectedIds || []), ...(autoSelectedIds || [])])
    return Array.from(set)
  }, [selectedIds, autoSelectedIds])

  useEffect(() => {
    if (mergedSelectedIds.length === selectedIds.length) return
    setSelectedIds(mergedSelectedIds)
  }, [mergedSelectedIds, selectedIds.length])

  const filteredQuestions = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return questions
    return questions.filter((q) => {
      const text = (q.questionText || q.question_text || '').toLowerCase()
      const topic = (q.topic || '').toLowerCase()
      return text.includes(term) || topic.includes(term)
    })
  }, [questions, search])

  function normalizeDifficultyValue(value) {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'locq') return 'locq'
    if (normalized === 'iocq') return 'iocq'
    if (normalized === 'hocq') return 'hocq'
    if (normalized === 'easy') return 'locq'
    if (normalized === 'medium' || normalized === 'intermediate') return 'iocq'
    if (normalized === 'hard') return 'hocq'
    return 'iocq'
  }

  function getDifficultyLabel(value) {
    const normalized = normalizeDifficultyValue(value)
    if (normalized === 'locq') return 'LOCQ'
    if (normalized === 'hocq') return 'HOCQ'
    return 'IOCQ'
  }

  function toggleQuestion(questionId) {
    setSelectedIds((prev) => (
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
    ))
  }

  function resetToFiltered() {
    setSelectedIds(autoSelectedIds)
  }

  function clearAll() {
    setSelectedIds([])
  }

  function handleSave() {
    try {
      const raw = sessionStorage.getItem(QUESTION_SELECTION_KEY)
      const parsed = raw ? JSON.parse(raw) : {}
      sessionStorage.setItem(QUESTION_SELECTION_KEY, JSON.stringify({
        ...parsed,
        sectionId,
        selectedQuestionIds: selectedIds,
        selectedTopics: filters.selectedTopics,
        includeUntagged: filters.includeUntagged,
      }))
      addToast({ type: 'success', title: 'Selection saved', message: 'Question selection updated.' })
    } catch {
      addToast({ type: 'error', title: 'Save failed', message: 'Unable to save the selection. Try again.' })
      // ignore storage errors
    }
    navigate('/assignments')
  }

  return (
    <AppLayout title="Question Bank">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Select questions</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Topics from the assignment filters are auto-checked. Adjust the selection as needed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetToFiltered}
              className="text-xs px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700"
            >
              Reset to filtered
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700"
            >
              Clear all
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="text-xs px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium"
            >
              Save selection
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="lg:w-1/3">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Active filters</p>
              <div className="flex flex-col gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-200">Topics:</span>{' '}
                  {filters.selectedTopics.length ? filters.selectedTopics.join(', ') : 'None'}
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-200">Include untagged:</span>{' '}
                  {filters.includeUntagged ? 'Yes' : 'No'}
                </div>
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-200">Auto-selected:</span>{' '}
                  {autoSelectedIds.length}
                </div>
              </div>
            </div>

            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedIds.length} selected • {questions.length} total
                </p>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search questions or topics"
                  className="w-full sm:w-64 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto custom-scrollbar pr-1">
                {filteredQuestions.length === 0 && (
                  <p className="text-xs text-gray-400">No questions match this search.</p>
                )}
                {filteredQuestions.map((q) => (
                  <label key={q.id} className="flex items-start gap-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(q.id)}
                      onChange={() => toggleQuestion(q.id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-700"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {q.question_text || q.text || 'Untitled question'}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {q.topic && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">
                            {q.topic}
                          </span>
                        )}
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                          normalizeDifficultyValue(q.difficulty) === 'locq'
                            ? 'bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400'
                            : normalizeDifficultyValue(q.difficulty) === 'hocq'
                            ? 'bg-red-50 dark:bg-red-950 text-red-500 dark:text-red-400'
                            : 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                        }`}>
                          {getDifficultyLabel(q.difficulty)}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
