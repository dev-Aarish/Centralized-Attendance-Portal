import { useState, useEffect } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { apiFetch } from '../../lib/api'
import { formatCohort } from '../../lib/format'

export default function AdminAssignCourses() {
  const TEACHER_WEEKLY_HOURS_LIMIT = 15
  const [teachers, setTeachers] = useState([])
  const [sections, setSections] = useState([])
  const [allCohorts, setAllCohorts] = useState([])
  const [assignments, setAssignments] = useState([])
  const [selectedAssignments, setSelectedAssignments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [courses, setCourses] = useState([])
  const [selectedCourse, setSelectedCourse] = useState('')
  const [selectedTeacherHours, setSelectedTeacherHours] = useState(0)
  const [selectedTeacherOverloaded, setSelectedTeacherOverloaded] = useState(false)

  useEffect(() => {
    fetchTeachers()
    fetchCourses()
    fetchCohorts()
  }, [])

  // Auto-clear toast messages
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null)
        setSuccess(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, success])

  useEffect(() => {
    if (selectedTeacher) {
      fetchTeacherAssignments()
      fetchSelectedTeacherWorkload()
    }
  }, [selectedTeacher])

  useEffect(() => {
    if (selectedCourse) {
      fetchSections()
    }
  }, [selectedCourse])

  async function fetchTeachers() {
    try {
      const data = await apiFetch('/api/v1/admin/users?role=teacher')
      setTeachers(data.data || [])
    } catch (err) {
      setError(err.message)
    }
  }

  async function fetchCohorts() {
    try {
      const data = await apiFetch('/api/v1/admin/cohorts')
      const formatted = (data.data || []).map(c => ({
        ...c,
        label: formatCohort(c.department, c.yearOfStudy, c.section)
      }))
      setAllCohorts(formatted)
    } catch (err) {
      console.error('Error fetching cohorts:', err)
    }
  }

  async function fetchCourses() {
    try {
      const data = await apiFetch('/api/v1/admin/courses')
      const filtered = (data.data || []).filter(c => !['LIB', 'REM', 'LUNCH'].includes((c.code || '').trim().toUpperCase()))
      setCourses(filtered)
    } catch (err) {
      console.error('Error fetching courses:', err)
    }
  }

  async function fetchSections() {
    try {
      if (selectedCourse) {
        const data = await apiFetch(`/api/v1/admin/courses/${selectedCourse}/sections`)
        setSections(data.data || [])
      }
    } catch (err) {
      console.error('Error fetching sections:', err)
    }
  }

  async function fetchTeacherAssignments() {
    try {
      const data = await apiFetch(
        `/api/v1/admin/teacher-assignments?teacherId=${selectedTeacher}`
      )
      setAssignments(data.data || [])
      setSelectedAssignments([])
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  async function fetchSelectedTeacherWorkload() {
    if (!selectedTeacher) {
      setSelectedTeacherHours(0)
      setSelectedTeacherOverloaded(false)
      return
    }
    try {
      const resp = await apiFetch(`/api/v1/admin/teachers/workload`)
      const rows = resp.data || []
      const row = rows.find(r => String(r.teacherId) === String(selectedTeacher))
      const hours = row?.totalHours || 0
      setSelectedTeacherHours(hours)
      setSelectedTeacherOverloaded(hours > TEACHER_WEEKLY_HOURS_LIMIT)
    } catch (err) {
      console.error('Failed to fetch teacher workload:', err)
      setSelectedTeacherHours(0)
      setSelectedTeacherOverloaded(false)
    }
  }

  async function handleAssignCourse() {
    if (!selectedTeacher || !selectedSection) return

    if (selectedTeacherOverloaded) {
      setError(`Cannot assign: teacher's current workload is ${selectedTeacherHours}h which exceeds the ${TEACHER_WEEKLY_HOURS_LIMIT}h/week limit.`)
      return
    }

    try {
      setLoading(true)

      const isCohort = selectedSection.startsWith('cohort-')
      const payload = {
        teacherId: selectedTeacher,
      }

      if (isCohort) {
        const cohortIndex = parseInt(selectedSection.replace('cohort-', ''), 10)
        payload.cohort = allCohorts[cohortIndex]
        payload.courseId = selectedCourse
      } else {
        payload.sectionId = selectedSection
      }

      await apiFetch(`/api/v1/admin/teacher-assignments`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      setSelectedSection('')
      setSelectedCourse('')
      setError(null)
      setSuccess('Course assigned to teacher successfully!')
      setTimeout(() => setSuccess(null), 3000)

      await fetchTeacherAssignments()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveAssignment(assignmentId) {
    if (!window.confirm('Remove this assignment?')) return

    try {
      await apiFetch(`/api/v1/admin/teacher-assignments/${assignmentId}`, {
        method: 'DELETE',
      })
      await fetchTeacherAssignments()
    } catch (err) {
      setError(err.message)
      console.error('Error removing assignment:', err)
    }
  }

  async function handleRemoveSelected() {
    if (!selectedAssignments || selectedAssignments.length === 0) return
    if (!window.confirm(`Remove ${selectedAssignments.length} selected assignment(s)?`)) return

    try {
      setLoading(true)
      await Promise.all(
        selectedAssignments.map(id => apiFetch(`/api/v1/admin/teacher-assignments/${id}`, { method: 'DELETE' }))
      )
      setSuccess('Selected assignments removed')
      setError(null)
      setSelectedAssignments([])
      await fetchTeacherAssignments()
    } catch (err) {
      setError(err.message)
      console.error('Error removing selected assignments:', err)
    } finally {
      setLoading(false)
    }
  }

  function toggleSelectAssignment(id) {
    setSelectedAssignments(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      return [...prev, id]
    })
  }

  function selectAllAssignments() {
    if (selectedAssignments.length === assignments.length) {
      setSelectedAssignments([])
    } else {
      setSelectedAssignments(assignments.map(a => a.id))
    }
  }

  return (
    <AppLayout title="Assign Courses to Teachers">
      <div style={{ width: '100%' }} className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Assign Courses to Teachers
          </h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Link teachers to course sections
          </p>
        </div>

        {success && (
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30 rounded-xl px-4 py-3">
            <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Teacher Selection */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Step 1: Select Teacher
          </h3>
          <select
            value={selectedTeacher}
            onChange={(e) => setSelectedTeacher(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- Select Teacher --</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.fullName} ({teacher.email})
              </option>
            ))}
          </select>
          {selectedTeacher && selectedTeacherOverloaded && (
            <div className="mt-2 px-3 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: '#FFCB08', color: '#000000', border: '1px solid #000000' }}>
              Cannot assign: this teacher already has {selectedTeacherHours}h scheduled (limit {TEACHER_WEEKLY_HOURS_LIMIT}h/week).
            </div>
          )}
        </div>

        {selectedTeacher && (
          <>
            {/* Course & Section Selection */}
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Step 2: Select Course & Section
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Course
                  </label>
                  <select
                    value={selectedCourse}
                    onChange={(e) => setSelectedCourse(e.target.value)}
                    className="w-full mt-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Course</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.code} - {course.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Section
                  </label>
                  <select
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    disabled={!selectedCourse}
                    className="w-full mt-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="">Select Offering</option>

                    {sections.length > 0 && (
                      <optgroup label="Existing Offerings">
                        {sections.map((section) => (
                          <option key={section.id} value={section.id}>
                            {formatCohort(section.department, section.yearOfStudy, section.section)}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    <optgroup label="Available Cohorts (New Offering)">
                      {allCohorts
                        .filter(c => {
                          if (!selectedCourse) return false
                          const course = courses.find(cc => cc.id === selectedCourse)
                          if (!course) return false

                          const targetYear = Math.ceil((course.semester || 1) / 2)
                          const deptMatch = c.department.trim().toUpperCase() === course.department.trim().toUpperCase()
                          const yearMatch = parseInt(c.yearOfStudy, 10) === targetYear

                          if (!deptMatch || !yearMatch) return false

                          // Also check if already in existing offerings
                          return !sections.some(s =>
                            s.section === c.section &&
                            s.yearOfStudy === c.yearOfStudy &&
                            s.department === c.department
                          )
                        })
                        .map((cohort, idx) => {
                          // Find original index in allCohorts for the value
                          const originalIdx = allCohorts.findIndex(ac => ac === cohort)
                          return (
                            <option key={`cohort-${originalIdx}`} value={`cohort-${originalIdx}`}>
                              {cohort.label}
                            </option>
                          )
                        })}
                    </optgroup>
                  </select>
                </div>
              </div>
              <button
                onClick={handleAssignCourse}
                disabled={loading || !selectedSection}
                className="w-full px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Assigning...' : 'Assign Course'}
              </button>
            </div>

            {/* Current Assignments */}
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                Current Assignments
              </h3>

              {assignments.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  No assignments for this teacher yet.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center text-sm text-gray-700 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={selectedAssignments.length === assignments.length}
                          onChange={selectAllAssignments}
                          className="mr-2"
                        />
                        Select All
                      </label>
                      <span className="text-xs text-gray-500">({assignments.length} assignment{assignments.length > 1 ? 's' : ''})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRemoveSelected}
                        disabled={selectedAssignments.length === 0 || loading}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                      >
                        Remove Selected
                      </button>
                    </div>
                  </div>

                  {assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-start justify-between bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-700"
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedAssignments.includes(assignment.id)}
                          onChange={() => toggleSelectAssignment(assignment.id)}
                          className="mt-1"
                        />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {assignment.course?.code} - {assignment.course?.name}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {formatCohort(assignment.department, assignment.yearOfStudy, assignment.section)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                            Students: {assignment.studentsEnrolled}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveAssignment(assignment.id)}
                        className="text-xs text-red-600 dark:text-red-400 hover:underline"
                      >
                        Remove
                      </button>
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