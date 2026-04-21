import { useState, useEffect } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { apiFetch } from '../../lib/api'

export default function AdminCourses() {
 const [courses, setCourses] = useState([])
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState(null)
 const [showForm, setShowForm] = useState(false)
 const [formData, setFormData] = useState({ code: '', name: '', department: '', semester: 1 })
 const [submitting, setSubmitting] = useState(false)

 useEffect(() => {
  fetchCourses()
 }, [])

 async function fetchCourses() {
  try {
   setLoading(true)
   const data = await apiFetch('/api/v1/admin/courses')
   setCourses(data.data || [])
  } catch (err) {
   setError(err.message)
   console.error('Error fetching courses:', err)
  } finally {
   setLoading(false)
  }
 }

 async function handleCreateCourse() {
  if (!formData.code || !formData.name || !formData.department) {
   setError('All fields are required')
   return
  }

  try {
   setSubmitting(true)
   await apiFetch('/api/v1/admin/courses', {
    method: 'POST',
    body: JSON.stringify(formData),
   })
   setFormData({ code: '', name: '', department: '', semester: 1 })
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

  try {
   await apiFetch(`/api/v1/admin/courses/${courseId}`, {
    method: 'DELETE',
   })
   setError(null)
   await fetchCourses()
  } catch (err) {
   setError(err.message)
   console.error('Error removing course:', err)
  }
 }

 if (loading) {
  return (
   <AppLayout title="Course Management">
    <div style={{ width: '100%' }} className="flex flex-col gap-6">
     {[1, 2, 3].map((i) => (
      <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
     ))}
    </div>
   </AppLayout>
  )
 }

 return (
  <AppLayout title="Course Management">
   <div style={{ width: '100%' }} className="flex flex-col gap-6">
    <div>
     <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Manage Courses</h2>
     <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">View and create courses</p>
    </div>

    {error && (
     <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl px-4 py-3">
      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
     </div>
    )}

    <button
     onClick={() => setShowForm(!showForm)}
     className="w-fit px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
    >
     {showForm ? 'Cancel' : '+ Create Course'}
    </button>

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
       </select>
       <input
        type="number"
        min="1"
        max="8"
        placeholder="Semester"
        value={formData.semester}
        onChange={(e) => setFormData({ ...formData, semester: parseInt(e.target.value) })}
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
    )}{courses.length === 0 ? (
     <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
      <p className="text-sm text-gray-400 dark:text-gray-500">No courses found.</p>
     </div>
    ) : (
     <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
       <table className="w-full text-sm">
        <thead>
         <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Code</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Name</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Department</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Semester</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Sections</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
         </tr>
        </thead>
        <tbody>
         {courses.map((course) => (
          <tr key={course.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
           <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{course.code}</td>
           <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{course.name}</td>
           <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{course.department}</td>
           <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{course.semester}</td>
           <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{course.sectionsCount}</td>
           <td className="px-4 py-3">
            <button
             onClick={() => handleRemoveCourse(course.id)}
             className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium"
            >
             Remove
            </button>
           </td>
          </tr>
         ))}
        </tbody>
       </table>
      </div>
     </div>
    )}
   </div>
  </AppLayout>
 )
}