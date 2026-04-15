import { useEffect, useState } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { getMyAssignedSections } from '../../lib/profile'
import { uploadContent, getContentForSection, deleteContent } from '../../lib/content'

export default function TeacherNotes() {
  const [sections, setSections] = useState([])
  const [selectedSection, setSelectedSection] = useState('')
  const [notes, setNotes] = useState([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

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
    loadNotes()
  }, [selectedSection])

  async function loadNotes() {
    const { data } = await getContentForSection(selectedSection, 'note')
    setNotes(data || [])
  }

  async function handleUpload() {
    if (!file || !title.trim() || !selectedSection) {
      setError('Please select a course, enter a title and pick a file.')
      return
    }
    setError(null)
    setUploading(true)
    const { error } = await uploadContent(selectedSection, file, title.trim(), '', 'note')
    if (error) {
      setError(error.message)
    } else {
      setTitle('')
      setFile(null)
      await loadNotes()
    }
    setUploading(false)
  }

  async function handleDelete(note) {
    await deleteContent(note.id, note.file_url, 'note')
    await loadNotes()
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  return (
    <AppLayout title="Notes">
      <div style={{ width: '100%' }} className="flex flex-col gap-6">

        {/* Course selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Select course
          </label>
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

        {/* Upload zone */}
        <div className="flex flex-col gap-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl px-6 py-10 flex flex-col items-center gap-3 transition-colors cursor-pointer ${
              dragging
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950'
                : 'border-gray-200 dark:border-gray-700'
            }`}
            onClick={() => document.getElementById('file-input').click()}
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-lg">
              ↑
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              {file ? file.name : 'Drag and drop or click to browse'}
            </p>
            <p className="text-xs text-gray-300 dark:text-gray-600">
              PDF, DOCX, PPTX up to 20MB
            </p>
            <input
              id="file-input"
              type="file"
              className="hidden"
              accept=".pdf,.docx,.pptx,.ppt,.doc"
              onChange={(e) => setFile(e.target.files[0])}
            />
          </div>

          {/* Title input + upload button */}
          <div className="flex gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title e.g. Lecture 5 — Linked Lists"
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleUpload}
              disabled={uploading || !file || !title.trim() || !selectedSection}
              className="px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Notes list */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Uploaded notes {selectedSection ? '' : '— select a course to view'}
          </h2>
          {!selectedSection ? null : notes.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
              <p className="text-sm text-gray-400">No notes uploaded for this course yet.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-400 text-xs font-mono shrink-0">
                      PDF
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white">
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {new Date(n.created_at).toDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={n.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-500 hover:underline"
                    >
                      View
                    </a>
                    <button
                      onClick={() => handleDelete(n)}
                      className="text-xs text-red-400 hover:text-red-500 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}