import { useState, useEffect } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { apiFetch } from '../../lib/api'
import SpiralLoader from '../../components/shared/Loader'
import { useAuth } from '../../hooks/useAuth'

export default function AdminCourses() {
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ code: '', name: '', department: '', semester: '', type: 'Lecture' })
  const [submitting, setSubmitting] = useState(false)
  const [filterDepartment, setFilterDepartment] = useState('All')
  const [filterSemester, setFilterSemester] = useState('All')
  const { adminDepartment } = useAuth()

  // Expandable teacher details
  const [expandedCourseId, setExpandedCourseId] = useState(null)
  const [teacherData, setTeacherData] = useState({}) // { [courseId]: sectionData[] }
  const [loadingTeachers, setLoadingTeachers] = useState(null)

  useEffect(() => {
    fetchCourses()
  }, [])

  async function fetchCourses() {
    try {
      setLoading(true)
      const data = await apiFetch('/api/v1/admin/courses')
      const COMMON_CODES = ['LIB', 'REM', 'LUNCH', 'LIBRARY', 'REMEDIAL']
      const filtered = (data.data || []).filter(
        (c) => !COMMON_CODES.includes((c.code || '').trim().toUpperCase())
      )
      setCourses(filtered)
    } catch (err) {
      setError(err.message)
      console.error('Error fetching courses:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateCourse() {
    const submitDept = (!adminDepartment || adminDepartment === 'GLOBAL') ? formData.department : adminDepartment
    if (!formData.code || !formData.name || !submitDept || !formData.semester) {
      setError('All fields are required')
      return
    }

    try {
      setSubmitting(true)
      await apiFetch('/api/v1/admin/courses', {
        method: 'POST',
        body: JSON.stringify({ ...formData, department: submitDept }),
      })
      setFormData({ code: '', name: '', department: '', semester: '', type: 'Lecture' })
      setShowForm(false)
      setError(null)
      await fetchCourses()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemoveCourse(courseId) {
    if (!window.confirm('Are you sure you want to delete this course? This action cannot be undone.')) {
      return
    }

    // Optimistic UI update: instantly remove it from view
    setCourses((prev) => prev.filter((c) => c.id !== courseId))
    if (expandedCourseId === courseId) setExpandedCourseId(null)

    try {
      await apiFetch(`/api/v1/admin/courses/${courseId}`, {
        method: 'DELETE',
      })
      setError(null)
      
      const newTeacherData = { ...teacherData }
      delete newTeacherData[courseId]
      setTeacherData(newTeacherData)
      
      // Sync in background without blocking
      fetchCourses()
    } catch (err) {
      setError(err.message || 'Failed to delete course. It may be in use.')
      console.error('Error removing course:', err)
      // Revert state if deletion fails
      await fetchCourses()
    }
  }

  async function handleToggleExpand(courseId) {
    if (expandedCourseId === courseId) {
      setExpandedCourseId(null)
      return
    }

    setExpandedCourseId(courseId)

    // Fetch teacher data if not already cached
    if (!teacherData[courseId]) {
      try {
        setLoadingTeachers(courseId)
        const resp = await apiFetch(`/api/v1/admin/courses/${courseId}/teachers`)
        setTeacherData((prev) => ({ ...prev, [courseId]: resp.data || [] }))
      } catch (err) {
        console.error('Error fetching teachers for course:', err)
        setTeacherData((prev) => ({ ...prev, [courseId]: [] }))
      } finally {
        setLoadingTeachers(null)
      }
    }
  }

  if (loading) {
    return (
      <AppLayout title="Course Management">
        <div style={{ width: '100%' }} className="flex items-center justify-center min-h-[60vh]">
          <SpiralLoader />
        </div>
      </AppLayout>
    )
  }

  const filteredCourses = courses.filter(c => {
    if (filterDepartment !== 'All' && c.department !== filterDepartment) return false;
    if (filterSemester !== 'All' && c.semester !== parseInt(filterSemester)) return false;
    return true;
  }).sort((a, b) => {
    if (a.department !== b.department) return (a.department || '').localeCompare(b.department || '');
    if (a.semester !== b.semester) return (a.semester || 0) - (b.semester || 0);
    return (a.name || '').localeCompare(b.name || '');
  });

  return (
    <AppLayout title="Course Management">
      <div style={{ width: '100%' }} className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Manage Courses</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">View and create courses · Click a row to see assigned teachers</p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <button
            onClick={() => setShowForm(!showForm)}
            className="w-fit px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
          >
            {showForm ? 'Cancel' : '+ Create Course'}
          </button>
          
          <div className="flex items-center gap-3">
            {(!adminDepartment || adminDepartment === 'GLOBAL') && (
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="All">All Departments</option>
                {Array.from(new Set(courses.map(c => c.department))).filter(Boolean).sort().map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            )}
            
            <select
              value={filterSemester}
              onChange={(e) => setFilterSemester(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Semesters</option>
              {Array.from(new Set(courses.map(c => c.semester))).filter(Boolean).sort((a,b)=>a-b).map(sem => (
                <option key={sem} value={sem}>Semester {sem}</option>
              ))}
            </select>
          </div>
        </div>

        {showForm && (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Course Code (e.g., CS101)"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Course Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Lecture">Lecture</option>
                <option value="Lab">Lab</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(!adminDepartment || adminDepartment === 'GLOBAL') && (
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Department</option>
                  <option value="CSE">CSE</option>
                  <option value="IT">IT</option>
                  <option value="ECE">ECE</option>
                  <option value="EE">EE</option>
                  <option value="ME">ME</option>
                  <option value="CE">CE</option>
                  <option value="AEIE">AEIE</option>
                  <option value="CSBS">CSBS</option>
                  <option value="CSDS">CSDS</option>
                  <option value="AIML">AIML</option>
                  <option value="ChE">ChE</option>
                  <option value="Mathematics">Mathematics</option>
                  <option value="Physics">Physics</option>
                </select>
              )}
              <input
                type="number"
                min="1"
                max="8"
                placeholder="Semester"
                value={formData.semester}
                onChange={(e) => setFormData({ ...formData, semester: e.target.value ? parseInt(e.target.value) : '' })}
                className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              onClick={handleCreateCourse}
              disabled={submitting}
              className="w-full px-4 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Course'}
            </button>
          </div>
        )}

        {courses.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">No courses found.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400" style={{ width: '28px' }}></th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Code</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Department</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Semester</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCourses.map((course) => {
                    const isExpanded = expandedCourseId === course.id
                    const sections = teacherData[course.id] || []
                    const isLoadingThis = loadingTeachers === course.id

                    return (
                      <CourseRow
                        key={course.id}
                        course={course}
                        isExpanded={isExpanded}
                        sections={sections}
                        isLoading={isLoadingThis}
                        onToggle={() => handleToggleExpand(course.id)}
                        onRemove={() => handleRemoveCourse(course.id)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function CourseRow({ course, isExpanded, sections, isLoading, onToggle, onRemove }) {
  // Count total teachers across all sections
  const totalTeachers = sections.reduce((acc, s) => acc + (s.teachers?.length || 0), 0)

  return (
    <>
      <tr
        className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-gray-400 dark:text-gray-500">
          <span
            style={{
              display: 'inline-block',
              transition: 'transform 0.2s ease',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              fontSize: '10px',
            }}
          >
            ▶
          </span>
        </td>
        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{course.code}</td>
        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{course.name}</td>
        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{course.department}</td>
        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{course.semester}</td>
        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${course.type === 'Lab' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
            {course.type || 'Lecture'}
          </span>
        </td>
        <td className="px-4 py-3">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium"
          >
            Remove
          </button>
        </td>
      </tr>

      {/* Expanded detail row */}
      {isExpanded && (
        <tr className="border-b border-gray-100 dark:border-gray-800">
          <td colSpan={7} className="px-0 py-0">
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,0.04) 0%, rgba(139,92,246,0.04) 100%)',
                borderLeft: '3px solid rgba(59,130,246,0.5)',
              }}
              className="px-6 py-4"
            >
              {isLoading ? (
                <div className="flex items-center gap-2 py-3">
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      border: '2px solid rgba(59,130,246,0.3)',
                      borderTopColor: 'rgb(59,130,246)',
                      borderRadius: '50%',
                      animation: 'spin 0.6s linear infinite',
                    }}
                  />
                  <span className="text-xs text-gray-400">Loading teacher assignments…</span>
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </div>
              ) : sections.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
                  No sections or teacher assignments found for this course.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                      Teacher Assignments
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-semibold">
                      {totalTeachers} teacher{totalTeachers !== 1 ? 's' : ''} · {sections.length} section{sections.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {sections.map((sec) => (
                    <div
                      key={sec.sectionId}
                      className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4 py-3"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          Section {sec.section}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          {sec.department} · {sec.yearOfStudy} year
                        </span>
                      </div>

                      {sec.teachers.length === 0 ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                          No teacher assigned
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {sec.teachers.map((t) => (
                            <div
                              key={t.assignmentId}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
                            >
                              <div
                                style={{
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '50%',
                                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: '#fff',
                                  flexShrink: 0,
                                }}
                              >
                                {(t.name || '?')[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-tight">
                                  {t.name}
                                </p>
                                {t.employeeId && (
                                  <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">
                                    ID: {t.employeeId}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}