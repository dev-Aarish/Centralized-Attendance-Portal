import { useState, useEffect } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { apiFetch } from '../../lib/api'
import SpiralLoader from '../../components/shared/Loader'

const DEPARTMENTS = [
 { code: 'CSE', name: 'Computer Science & Engineering' },
 { code: 'IT', name: 'Information Technology' },
 { code: 'ECE', name: 'Electronics & Communication' },
 { code: 'EE', name: 'Electrical Engineering' },
 { code: 'ME', name: 'Mechanical Engineering' },
 { code: 'CE', name: 'Civil Engineering' },
]

export default function AdminDepartments() {
 const [stats, setStats] = useState(null)
 const [departmentSummary, setDepartmentSummary] = useState({})
 const [loading, setLoading] = useState(true)
 const [error, setError] = useState(null)
 const [selectedDept, setSelectedDept] = useState(null)
 const [viewType, setViewType] = useState(null) // 'teachers' or 'students'
 const [detailsLoading, setDetailsLoading] = useState(false)
 const [detailsData, setDetailsData] = useState(null)

 useEffect(() => {
  fetchStats()
 }, [])

 async function fetchStats() {
  try {
   setLoading(true)
   const [statsRes, summaryRes] = await Promise.all([
    apiFetch('/api/v1/admin/stats'),
    apiFetch('/api/v1/admin/departments/summary'),
   ])

   setStats(statsRes.data)
   const summaryMap = {}
   for (const item of summaryRes.data || []) {
    if (!item?.code) continue
    summaryMap[item.code] = {
     students: item.students || 0,
     teachers: item.teachers || 0,
     courses: item.courses || 0,
    }
   }
   setDepartmentSummary(summaryMap)
  } catch (err) {
   setError(err.message)
   console.error('Error fetching stats:', err)
  } finally {
   setLoading(false)
  }
 }

 async function fetchDepartmentTeachers(deptCode) {
  try {
   setViewType('teachers')
   setDetailsLoading(true)
   setDetailsData([])
   const data = await apiFetch(`/api/v1/admin/departments/${deptCode}/teachers`, {
    cache: false,
    forceRefresh: true,
   })
   setDetailsData(data.data || [])
  } catch (err) {
   setError(err.message)
   setDetailsData([])
   console.error('Error fetching teachers:', err)
  } finally {
   setDetailsLoading(false)
  }
 }

 async function fetchDepartmentStudents(deptCode) {
  try {
   setViewType('students')
   setDetailsLoading(true)
   setDetailsData({})
   const data = await apiFetch(`/api/v1/admin/departments/${deptCode}/students`, {
    cache: false,
    forceRefresh: true,
   })
   setDetailsData(data.data || {})
  } catch (err) {
   setError(err.message)
   setDetailsData({})
   console.error('Error fetching students:', err)
  } finally {
   setDetailsLoading(false)
  }
 }

 function handleViewDetails(dept) {
  setSelectedDept(dept)
  setViewType(null)
  setDetailsData(null)
 }

 function closeDetails() {
  setSelectedDept(null)
  setViewType(null)
  setDetailsData(null)
 }

 if (loading) {
  return (
   <AppLayout title="Departments">
    <div style={{ width: '100%' }} className="flex flex-col gap-6">
     {[1, 2, 3].map((i) => (
      <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
     ))}
    </div>
   </AppLayout>
  )
 }
return (
  <AppLayout title="Departments">
   <div style={{ width: '100%' }} className="flex flex-col gap-6">
    <div>
     <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Department Overview</h2>
     <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Departmental statistics and distribution</p>
    </div>

    {error && (
     <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl px-4 py-3">
      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
     </div>
    )}

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
     {DEPARTMENTS.map((dept) => {
        const deptCounts =
            departmentSummary[dept.code] || { students: 0, teachers: 0, courses: 0 }

        return (
            <div
            key={dept.code}
            className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4"
            >
            <div className="flex items-start justify-between">
                <div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {dept.code}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {dept.name}
                </p>
                </div>
                <span className="text-2xl font-bold text-blue-500"></span>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 text-center text-xs">
                <div>
                <p className="font-bold text-gray-900 dark:text-white">
                    {deptCounts.students}
                </p>
                <p className="text-gray-400 dark:text-gray-500">Students</p>
                </div>
                <div>
                <p className="font-bold text-gray-900 dark:text-white">
                    {deptCounts.teachers}
                </p>
                <p className="text-gray-400 dark:text-gray-500">Teachers</p>
                </div>
                <div>
                <p className="font-bold text-gray-900 dark:text-white">
                    {deptCounts.courses}
                </p>
                <p className="text-gray-400 dark:text-gray-500">Courses</p>
                </div>
            </div>

            <button
                onClick={() => handleViewDetails(dept)}
                className="w-full mt-4 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium transition-colors"
            >
                View Details
            </button>
            </div>
        )
        })}
    </div>

    {/* Overall Stats */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
     <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl px-5 py-4">
      <p className="text-xs text-blue-600 dark:text-blue-400">Total Students</p>
      <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">{stats?.totalStudents || 0}</p>
     </div>
     <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30 rounded-2xl px-5 py-4">
      <p className="text-xs text-green-600 dark:text-green-400">Total Teachers</p>
      <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1">{stats?.totalTeachers || 0}</p>
     </div>
     <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl px-5 py-4">
      <p className="text-xs text-amber-600 dark:text-amber-400">Total Courses</p>
      <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">{stats?.totalCourses || 0}</p>
     </div>
    </div>

    {/* Department Details Modal */}
    {selectedDept && (
     <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
       {/* Header */}
       <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
         <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedDept.code}</h3>
         <p className="text-sm text-gray-600 dark:text-gray-400">{selectedDept.name}</p>
        </div>
        <button
         onClick={closeDetails}
         className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
        >
         ×
        </button>
       </div>

       {/* View Type Selection */}
       {!viewType ? (
        <div className="px-6 py-8 flex flex-col gap-4 items-center justify-center min-h-[300px]">
         <p className="text-gray-600 dark:text-gray-400 text-center mb-4">
          Select what you want to view:
         </p>
         <div className="flex gap-4 flex-wrap justify-center">
          <button
           onClick={() => fetchDepartmentTeachers(selectedDept.code)}
           className="px-6 py-3 rounded-xl bg-green-500 hover:bg-green-600 text-white font-medium transition-colors"
          >
            View Teachers
          </button>
          <button
           onClick={() => fetchDepartmentStudents(selectedDept.code)}
           className="px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
          >
            View Students
          </button>
         </div>
        </div>
       ) : detailsLoading ? (
        <div className="px-6 py-12 text-center flex flex-col items-center justify-center gap-4">
         <SpiralLoader />
         <p className="text-gray-600 dark:text-gray-400 font-medium text-sm tracking-wide">Loading {viewType}...</p>
        </div>
       ) : (
        <div className="px-6 py-6">
         {/* View Type Buttons */}
         <div className="flex gap-2 mb-6">
          <button
           onClick={() => fetchDepartmentTeachers(selectedDept.code)}
           className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewType === 'teachers'
             ? 'bg-green-500 text-white'
             : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
           }`}
          >
            Teachers
          </button>
          <button
           onClick={() => fetchDepartmentStudents(selectedDept.code)}
           className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            viewType === 'students'
             ? 'bg-blue-500 text-white'
             : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
           }`}
          >
            Students
          </button>
         </div>

         {/* Teachers List */}
         {viewType === 'teachers' && (
          <div className="space-y-3">
           {!Array.isArray(detailsData) || detailsData.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
             No teachers found in this department.
            </p>
           ) : (
            <>
             <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Total Teachers: {detailsData.length}
             </p>
             {detailsData.map((teacher) => (
              <div
               key={teacher.id}
               className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 border border-gray-200 dark:border-gray-700"
              >
               <div className="flex items-start justify-between">
                <div className="flex-1">
                 <p className="font-medium text-gray-900 dark:text-white">
                  {teacher.fullName}
                 </p>
                 <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Email: {teacher.email}
                 </p>
                 <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Employee ID: {teacher.employeeId}
                 </p>
                </div>
               </div>
              </div>
             ))}
            </>
           )}
          </div>
         )}

         {/* Students List by Year */}
         {viewType === 'students' && (
          <div className="space-y-6">
           {!detailsData || Object.keys(detailsData).length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
             No students found in this department.
            </p>
           ) : (
            Object.entries(detailsData)
             .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
             .map(([year, students]) => (
              <div key={year}>
               <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
                Year {year} ({students.length} students)
               </h4>
               <div className="space-y-2">
                {students.map((student) => (
                 <div
                  key={student.id}
                  className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-3 border border-gray-200 dark:border-gray-700"
                 >
                  <div className="flex items-start justify-between">
                   <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                     {student.fullName}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                     Email: {student.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                     Roll No: {student.rollNumber}
                    </p>
                   </div>
                  </div>
                 </div>
                ))}
               </div>
              </div>
             ))
           )}
          </div>
         )}
        </div>
       )}
      </div>
     </div>
    )}
   </div>
  </AppLayout>
 )
}