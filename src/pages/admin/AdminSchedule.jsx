import { useState, useEffect } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { apiFetch } from '../../lib/api'

const DEPARTMENTS = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HOURS = Array.from({ length: 10 }, (_, i) => `${8 + i}:00-${9 + i}:00`)

export default function AdminSchedule() {
  const [department, setDepartment] = useState('')
  const [sections, setSections] = useState([])
  const [selectedSection, setSelectedSection] = useState('')
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    day: 'Monday',
    timeSlot: '8:00-9:00',
    courseId: '',
    roomNumber: '',
  })
  const [courses, setCourses] = useState([])

  // Fetch sections when department changes
  useEffect(() => {
    if (department) {
      fetchSections()
    }
  }, [department])

  // Fetch schedules when section changes
  useEffect(() => {
    if (selectedSection) {
      fetchSchedules()
      fetchCourses()
    }
  }, [selectedSection])

  async function fetchSections() {
    try {
      setLoading(true)
      const data = await apiFetch(
        `/api/v1/admin/departments/${department}/sections`
      )
      setSections(data.data || [])
      setSelectedSection('')
      setSchedules([])
    } catch (err) {
      setError(err.message)
      console.error('Error fetching sections:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchSchedules() {
    try {
      const data = await apiFetch(
        `/api/v1/admin/schedules?sectionId=${selectedSection}`
      )
      setSchedules(data.data || [])
    } catch (err) {
      console.error('Error fetching schedules:', err)
    }
  }

  async function fetchCourses() {
    try {
      const data = await apiFetch(`/api/v1/admin/courses`)
      setCourses(data.data || [])
    } catch (err) {
      console.error('Error fetching courses:', err)
    }
  }

  async function handleAddSchedule() {
    if (!formData.courseId || !formData.roomNumber) {
      setError('Please fill in all fields')
      return
    }

    try {
      setLoading(true)
      await apiFetch(`/api/v1/admin/schedules`, {
        method: 'POST',
        body: JSON.stringify({
          classSectionId: selectedSection,
          courseId: formData.courseId,
          day: formData.day,
          timeSlot: formData.timeSlot,
          roomNumber: formData.roomNumber,
        }),
      })

      setFormData({ day: 'Monday', timeSlot: '8:00-9:00', courseId: '', roomNumber: '' })
      setShowForm(false)
      setError(null)
      await fetchSchedules()
    } catch (err) {
      setError(err.message)
      console.error('Error adding schedule:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteSchedule(scheduleId) {
    if (!window.confirm('Delete this schedule entry?')) return

    try {
      await apiFetch(`/api/v1/admin/schedules/${scheduleId}`, {
        method: 'DELETE',
      })
      await fetchSchedules()
    } catch (err) {
      setError(err.message)
      console.error('Error deleting schedule:', err)
    }
  }

  return (
    <AppLayout title="Schedule Management">
      <div style={{ width: '100%' }} className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Manual Schedule Management
          </h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Create and manage class schedules for sections
          </p>
        </div>

        {/* Department Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Department
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full mt-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Department</option>
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
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
              disabled={!department}
              className="w-full mt-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="">Select Section</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.courses?.code} - Section {section.section} (Year {section.yearOfStudy})
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {selectedSection && (
          <>
            <button
              onClick={() => setShowForm(!showForm)}
              className="w-fit px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
            >
              {showForm ? 'Cancel' : '+ Add Schedule'}
            </button>

            {showForm && (
              <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      Day
                    </label>
                    <select
                      value={formData.day}
                      onChange={(e) =>
                        setFormData({ ...formData, day: e.target.value })
                      }
                      className="w-full mt-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {DAYS.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      Time Slot
                    </label>
                    <select
                      value={formData.timeSlot}
                      onChange={(e) =>
                        setFormData({ ...formData, timeSlot: e.target.value })
                      }
                      className="w-full mt-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {HOURS.map((hour) => (
                        <option key={hour} value={hour}>
                          {hour}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      Course
                    </label>
                    <select
                      value={formData.courseId}
                      onChange={(e) =>
                        setFormData({ ...formData, courseId: e.target.value })
                      }
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
                      Room Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., A101"
                      value={formData.roomNumber}
                      onChange={(e) =>
                        setFormData({ ...formData, roomNumber: e.target.value })
                      }
                      className="w-full mt-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAddSchedule}
                  disabled={loading}
                  className="w-full px-4 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? 'Adding...' : 'Add to Schedule'}
                </button>
              </div>
            )}

            {/* Schedule Table */}
            {schedules.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  No schedule entries yet. Add one to get started.
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                        <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                          Day
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                          Time
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                          Course
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                          Room
                        </th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedules.map((schedule) => (
                        <tr
                          key={schedule.id}
                          className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                        >
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                            {schedule.day}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {schedule.timeSlot}
                          </td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {schedule.course?.code}
                              </p>
                              <p className="text-xs text-gray-400">
                                {schedule.course?.name}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {schedule.roomNumber}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() =>
                                handleDeleteSchedule(schedule.id)
                              }
                              className="text-xs text-red-600 dark:text-red-400 hover:underline"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}