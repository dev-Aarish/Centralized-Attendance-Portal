import { useEffect, useMemo, useRef, useState } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import SpiralLoader from '../../components/shared/Loader'
import { getMyAssignedSections } from '../../lib/profile'
import { getMarksForSection, uploadExamMarksJsonFile, uploadExamMarksJsonText } from '../../lib/marks'
import { useToast } from '../../components/shared/ToastProvider'

export default function TeacherMarks() {
  const { addToast } = useToast()
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [examName, setExamName] = useState('')
  const [maxMarks, setMaxMarks] = useState('')
  const [file, setFile] = useState(null)
  const [jsonText, setJsonText] = useState('')
  const [uploadMode, setUploadMode] = useState('file')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [sectionMarks, setSectionMarks] = useState([])
  const [marksLoading, setMarksLoading] = useState(false)
  const [marksError, setMarksError] = useState(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [sortBy, setSortBy] = useState('roll')
  const [sortDir, setSortDir] = useState('asc')
  const jsonTextareaRef = useRef(null)

  useEffect(() => {
    async function load() {
      const { data } = await getMyAssignedSections()
      setSections(data || [])
      setLoading(false)
    }
    load()
  }, [])

  async function loadSectionMarks(sectionId) {
    if (!sectionId) {
      setSectionMarks([])
      setMarksError(null)
      return
    }

    setMarksLoading(true)
    const { data, error } = await getMarksForSection(sectionId)
    if (error) {
      setMarksError(error.message || 'Failed to load previous marks.')
      setSectionMarks([])
    } else {
      setSectionMarks(data || [])
      setMarksError(null)
    }
    setMarksLoading(false)
  }

  useEffect(() => {
    loadSectionMarks(selectedSectionId)
  }, [selectedSectionId])

  const groupedMarks = useMemo(() => {
    const grouped = sectionMarks.reduce((acc, row) => {
      const key = row.exam_name || 'Exam'
      if (!acc[key]) acc[key] = []
      acc[key].push(row)
      return acc
    }, {})

    const byRoll = (a, b) => {
      const rollA = String(a.student_profiles?.roll_number || '')
      const rollB = String(b.student_profiles?.roll_number || '')
      return rollA.localeCompare(rollB)
    }

    const byMarks = (a, b) => (a.marks_obtained ?? 0) - (b.marks_obtained ?? 0)

    const sorter = sortBy === 'marks' ? byMarks : byRoll
    const dir = sortDir === 'desc' ? -1 : 1

    return Object.entries(grouped).map(([exam, rows]) => ({
      exam,
      rows: [...rows].sort((a, b) => sorter(a, b) * dir),
    }))
  }, [sectionMarks, sortBy, sortDir])

  function resolveStudentName(row) {
    const profile = row.student_profiles?.profiles
    if (Array.isArray(profile)) {
      return profile[0]?.full_name || '—'
    }
    return (
      profile?.full_name ||
      row.student_profiles?.full_name ||
      row.student_profiles?.name ||
      row.student_profiles?.profile_name ||
      '—'
    )
  }

  const selectedSection = sections.find(
    (s) => (s.class_section_id || s.id) === selectedSectionId
  )

  function handleFileChange(event) {
    const picked = event.target.files?.[0] || null
    setFile(picked)
  }

  function handleJsonKeyDown(event) {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const textarea = jsonTextareaRef.current
    if (!textarea) return

    const { selectionStart, selectionEnd } = textarea
    const nextValue = `${jsonText.slice(0, selectionStart)}\t${jsonText.slice(selectionEnd)}`
    setJsonText(nextValue)

    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = selectionStart + 1
    })
  }

  function handleFormatJson() {
    if (!jsonText.trim()) {
      addToast({ type: 'error', title: 'Nothing to format', message: 'Paste JSON before formatting.' })
      return
    }
    try {
      const parsed = JSON.parse(jsonText)
      const formatted = JSON.stringify(parsed, null, 2)
      setJsonText(formatted)
    } catch {
      addToast({ type: 'error', title: 'Invalid JSON', message: 'Check JSON formatting.' })
    }
  }

  async function handleUpload() {
    if (!selectedSectionId || !examName.trim()) {
      const msg = 'Select a section and enter exam name.'
      addToast({ type: 'error', title: 'Missing details', message: msg })
      return
    }

    if (uploadMode === 'file' && !file) {
      const msg = 'Choose a JSON file to upload.'
      addToast({ type: 'error', title: 'Missing file', message: msg })
      return
    }

    if (uploadMode === 'text' && !jsonText.trim()) {
      const msg = 'Paste JSON data before uploading.'
      addToast({ type: 'error', title: 'Missing details', message: msg })
      return
    }

    setUploading(true)
    setResult(null)

    let response = { imported: 0, skipped: [], error: null }
    if (uploadMode === 'file') {
      response = await uploadExamMarksJsonFile(
        file,
        selectedSectionId,
        examName.trim(),
        maxMarks ? Number(maxMarks) : null
      )
    } else {
      let parsedRows = null
      try {
        const parsed = JSON.parse(jsonText)
        parsedRows = Array.isArray(parsed) ? parsed : parsed?.rows
      } catch {
        addToast({ type: 'error', title: 'Invalid JSON', message: 'Check JSON formatting.' })
        setUploading(false)
        return
      }

      if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
        addToast({ type: 'error', title: 'Invalid JSON', message: 'JSON must be an array of rows.' })
        setUploading(false)
        return
      }

      response = await uploadExamMarksJsonText(
        selectedSectionId,
        examName.trim(),
        parsedRows,
        maxMarks ? Number(maxMarks) : null
      )
    }

    const { imported, skipped, error } = response

    if (error) {
      const msg = error?.message || 'Failed to upload marks.'
      addToast({ type: 'error', title: 'Upload failed', message: msg })
      setUploading(false)
      return
    }

    setResult({ imported, skipped })
    addToast({ type: 'success', title: 'Upload complete', message: `${imported} rows imported.` })
    setExamName('')
    setMaxMarks('')
    setFile(null)
    setJsonText('')
    setFileInputKey((value) => value + 1)
    await loadSectionMarks(selectedSectionId)
    setUploading(false)
  }

  return (
    <AppLayout title="Marks Upload">
      <div className="flex flex-col gap-6">
        {loading ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <SpiralLoader />
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Upload marks (JSON)</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Provide JSON rows with rollNumber and marksObtained. Use "AB" for absent.
              </p>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Section</label>
                  <select
                    value={selectedSectionId}
                    onChange={(e) => setSelectedSectionId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                  >
                    <option value="">Choose a section</option>
                    {sections.map((s) => (
                      <option key={s.class_section_id || s.id} value={s.class_section_id || s.id}>
                        {`${s.class_sections?.courses?.name || 'Course'} — ${s.class_sections?.section || 'Section'}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Exam name</label>
                  <input
                    type="text"
                    value={examName}
                    onChange={(e) => setExamName(e.target.value)}
                    placeholder="e.g. Surprise Test 1"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Max marks (optional)</label>
                  <input
                    type="number"
                    min="0"
                    value={maxMarks}
                    onChange={(e) => setMaxMarks(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Upload mode</label>
                  <select
                    value={uploadMode}
                    onChange={(e) => setUploadMode(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
                  >
                    <option value="file">JSON file</option>
                    <option value="text">Paste JSON</option>
                  </select>
                </div>

                {uploadMode === 'file' ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">JSON file</label>
                    <input
                      key={fileInputKey}
                      type="file"
                      accept=".json"
                      onChange={handleFileChange}
                      className="w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 dark:file:bg-gray-800 dark:file:text-gray-200"
                    />
                    {file && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Selected: {file.name}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">JSON text</label>
                      <button
                        type="button"
                        onClick={handleFormatJson}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Format JSON
                      </button>
                    </div>
                    <textarea
                      ref={jsonTextareaRef}
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                      onKeyDown={handleJsonKeyDown}
                      rows={8}
                      placeholder='[{"rollNumber":"CSE-2B-05","marksObtained":18},{"rollNumber":"CSE-2B-06","marksObtained":"AB"}]'
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  {uploading ? 'Uploading...' : 'Upload marks'}
                </button>
                {selectedSection && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedSection.class_sections?.courses?.code || 'COURSE'} · Sec {selectedSection.class_sections?.section || '—'}
                  </p>
                )}
              </div>
            </div>

            {result && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Upload summary</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Imported: {result.imported} rows
                </p>
                {result.skipped?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Skipped rows</p>
                    <ul className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                      {result.skipped.map((row, idx) => (
                        <li key={`${row.row}-${idx}`}>
                          Row {row.row}: {row.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Previous uploads</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Previously uploaded marks for the selected section.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <label className="text-gray-500 dark:text-gray-400">Sort by</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-200"
                  >
                    <option value="roll">Roll number</option>
                    <option value="marks">Marks</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSortDir((value) => (value === 'asc' ? 'desc' : 'asc'))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    aria-label={sortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}
                    title={sortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-4 w-4 transition-transform ${sortDir === 'desc' ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 19V5" />
                      <path d="M7 10l5-5 5 5" />
                    </svg>
                  </button>
                </div>
              </div>

              {!selectedSectionId ? (
                <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                  Select a section to view its uploaded marks.
                </div>
              ) : marksLoading ? (
                <div className="mt-4 flex items-center justify-center">
                  <SpiralLoader />
                </div>
              ) : marksError ? (
                <div className="mt-4 rounded-xl border border-red-200/40 bg-red-500/10 p-3 text-xs text-red-400">
                  {marksError}
                </div>
              ) : !sectionMarks.length ? (
                <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                  No marks uploaded yet for this section.
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-6">
                  {groupedMarks.map((group) => (
                    <div key={group.exam} className="rounded-xl border border-gray-100 dark:border-gray-800/80 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                          {group.exam}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {group.rows.length} entries
                        </p>
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                              <th className="pb-2 pr-3">Roll</th>
                              <th className="pb-2 pr-3">Student</th>
                              <th className="pb-2 pr-3">Marks</th>
                              <th className="pb-2 pr-3">Max</th>
                              <th className="pb-2">Recorded</th>
                            </tr>
                          </thead>
                          <tbody className="text-gray-800 dark:text-gray-200">
                            {group.rows.map((row) => (
                              <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
                                <td className="py-2 pr-3">{row.student_profiles?.roll_number || '—'}</td>
                                <td className="py-2 pr-3">{resolveStudentName(row)}</td>
                                <td className="py-2 pr-3">{row.marks_obtained}</td>
                                <td className="py-2 pr-3">{row.max_marks}</td>
                                <td className="py-2 text-xs text-gray-500 dark:text-gray-400">
                                  {row.recorded_at ? new Date(row.recorded_at).toLocaleDateString() : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}