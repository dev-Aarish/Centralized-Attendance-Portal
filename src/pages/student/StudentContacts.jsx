import { useState, useEffect, useRef } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { getStudentContacts } from '../../lib/contacts'

export default function StudentContacts() {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    abortRef.current = controller

    async function fetchContacts() {
      try {
        setLoading(true)
        setError(null)
        const res = await getStudentContacts()
        
        if (controller.signal.aborted) return

        if (res.error) {
          setError(res.error.message || res.error || 'Failed to load contacts')
        } else {
          const normalizedContacts = (res.data || []).map((subject) => {
            const teachers = Array.isArray(subject?.teachers) ? subject.teachers.filter(Boolean) : []
            if (teachers.length > 0) {
              return { ...subject, teachers }
            }

            return {
              ...subject,
              teachers: [
                {
                  id: `unassigned-${subject?.subjectId || 'unknown'}`,
                  name: 'Unassigned',
                  role: 'Lecturer',
                  email: null,
                  phone: null,
                  otherDetails: null,
                },
              ],
            }
          })

          setContacts(normalizedContacts)
        }
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err.message || 'Failed to load contacts')
        console.error(err)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    fetchContacts()

    return () => controller.abort()
  }, [])

  return (
    <AppLayout title="Instructor Contacts">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-8">
        <div className="bg-gray-50 dark:bg-gray-800/60 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700/50">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Instructor Contacts</h2>
          <p className="text-gray-600 dark:text-gray-400">Find contact information for all your lecture instructors.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-blue-100 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl border border-red-100 dark:border-red-800/30 text-center text-sm font-medium">
            {error}
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400 font-medium bg-gray-50 dark:bg-gray-800/30 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
            No contacts available at the moment.
          </div>
        ) : (
          <div className="space-y-10">
            {contacts.map((subject) => (
              <div key={subject.subjectId} className="space-y-4">
                <div className="border-b border-gray-200 dark:border-gray-800 pb-2">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    {subject.subjectName}
                    <span className="text-xs font-semibold px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-md">
                      {subject.type}
                    </span>
                  </h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {subject.teachers.map((teacher) => (
                    <div 
                      key={teacher.id} 
                      className="bg-gray-50 dark:bg-gray-800/80 rounded-2xl p-6 border border-gray-200 dark:border-gray-700/60 shadow-md hover:shadow-lg dark:hover:border-gray-600 transition-all flex flex-col gap-5 relative overflow-hidden group"
                    >
                      {/* Decorative sidebar accent */}
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500 rounded-l-2xl opacity-80 group-hover:opacity-100 transition-opacity"></div>
                      
                      <div>
                        <h4 className="font-bold text-gray-900 dark:text-white text-lg tracking-tight">{teacher.name}</h4>
                        <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-1">{teacher.role}</p>
                      </div>

                      <div className="flex flex-col gap-3.5 text-sm mt-auto">
                        {teacher.email && (
                          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                            <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center shrink-0 border border-gray-200 dark:border-gray-700 shadow-sm">
                              <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <a 
                              href={`mailto:${teacher.email}`} 
                              className="hover:text-blue-600 dark:hover:text-blue-400 font-medium truncate transition-colors"
                            >
                              {teacher.email}
                            </a>
                          </div>
                        )}
                        
                        {teacher.phone && (
                          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
                            <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center shrink-0 border border-gray-200 dark:border-gray-700 shadow-sm">
                              <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                            </div>
                            <a href={`tel:${teacher.phone}`} className="hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors">
                              {teacher.phone}
                            </a>
                          </div>
                        )}

                        {teacher.otherDetails && (
                          <div className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                            <div className="w-8 h-8 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center shrink-0 border border-gray-200 dark:border-gray-700 shadow-sm mt-0.5">
                              <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <span className="text-sm font-medium leading-relaxed">{teacher.otherDetails}</span>
                          </div>
                        )}
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
