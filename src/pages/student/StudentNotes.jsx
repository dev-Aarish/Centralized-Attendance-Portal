import { useEffect, useState } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { getContentForStudent } from '../../lib/content'

export default function StudentNotes() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await getContentForStudent('note')
      setNotes(data || [])
      setLoading(false)
    }
    load()
  }, [])

  // Group notes by course
  const groupedNotes = notes.reduce((acc, note) => {
    const courseName = note.class_sections?.courses?.name || 'Unknown Course'
    const courseCode = note.class_sections?.courses?.code || ''
    const key = courseCode ? `${courseCode} — ${courseName}` : courseName
    if (!acc[key]) acc[key] = []
    acc[key].push(note)
    return acc
  }, {})

  const getDownloadUrl = (url) => {
    try {
      // url looks like: https://.../171000000_Math_Notes.pdf
      const rawFileName = url.split('/').pop()
      const cleanFileName = decodeURIComponent(rawFileName).replace(/^\d+_/, '')
      return `${url}?download=${encodeURIComponent(cleanFileName)}`
    } catch {
      return `${url}?download=`
    }
  }

  const handleView = (e, note) => {
    e.preventDefault()
    const url = note.file_url
    if (!url) return
    const ext = url.split('.').pop().toLowerCase()
    
    let finalUrl = url
    if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) {
      finalUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`
    }

    // Open a new blank tab and inject an iframe. This allows us to set a custom clean title.
    const win = window.open('', '_blank')
    if (win) {
      win.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${note.title || 'View Document'}</title>
            <style>
              body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background-color: #f3f4f6; }
              iframe { width: 100%; height: 100%; border: none; }
            </style>
          </head>
          <body>
            <iframe src="${finalUrl}"></iframe>
          </body>
        </html>
      `)
      win.document.close()
    } else {
      // Fallback if popup blocker stops the blank window
      window.open(finalUrl, '_blank')
    }
  }

  return (
    <AppLayout title="Notes">
      <div className="flex flex-col gap-8 w-full max-w-6xl mx-auto p-2">
        {loading ? (
          <div className="flex justify-center py-20 text-sm text-gray-500 dark:text-gray-400">Loading notes...</div>
        ) : Object.keys(groupedNotes).length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-12 text-center shadow-sm mt-4">
            <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400 text-2xl">
              📄
            </div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No notes available yet.</p>
            <p className="text-xs text-gray-400 mt-1">Check back later when your teachers upload materials.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-10 mt-2">
            {Object.entries(groupedNotes).map(([courseName, courseNotes]) => (
              <div key={courseName} className="flex flex-col gap-4">
                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider pl-1">
                  {courseName}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {courseNotes.map(note => (
                    <div key={note.id} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                      {/* Decorative top border */}
                      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/40 border border-blue-100 dark:border-blue-800 flex items-center justify-center text-blue-500 font-bold shrink-0 text-xs uppercase">
                          {note.file_url.split('.').pop() || 'DOC'}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={note.title}>
                            {note.title}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                            <span>📅</span> {new Date(note.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-auto pt-2">
                        <button 
                          onClick={(e) => handleView(e, note)}
                          className="flex-1 py-2.5 text-center text-xs font-semibold rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                        >
                          View File
                        </button>
                        <a 
                          href={getDownloadUrl(note.file_url)} 
                          className="flex-1 py-2.5 text-center text-xs font-semibold rounded-xl border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          Download
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
