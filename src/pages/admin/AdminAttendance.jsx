import { useState, useEffect } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { apiFetch } from '../../lib/api'
import SpiralLoader from '../../components/shared/Loader'
import { useAuth } from '../../hooks/useAuth'

export default function AdminAttendance() {
  const [report, setReport] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [department, setDepartment] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const { adminDepartment } = useAuth()

  useEffect(() => {
    fetchReport()
  }, [])

  async function fetchReport() {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (department) params.append('department', department)
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)

      const query = params.toString() ? `?${params.toString()}` : ''
      const data = await apiFetch(`/api/v1/admin/attendance/report${query}`)
      setReport(data.data || [])
    } catch (err) {
      setError(err.message)
      console.error('Error fetching report:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <AppLayout title="Attendance Report">
        <div style={{ width: '100%' }} className="flex items-center justify-center min-h-[60vh]">
          <SpiralLoader />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Attendance Report">
      <div style={{ width: '100%' }} className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Attendance Report</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">View attendance statistics by course</p>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(!adminDepartment || adminDepartment === 'GLOBAL') && (
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Departments</option>
              <option value="CSE">CSE</option>
              <option value="IT">IT</option>
              <option value="ECE">ECE</option>
              <option value="EE">EE</option>
              <option value="ME">ME</option>
              <option value="CE">CE</option>
            </select>
          )}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={fetchReport}
          className="w-fit px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
        >
          Apply Filters
        </button>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {report.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">No attendance data found.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Course</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Section</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Department</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Sessions</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Present</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Absent</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Late</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{row.code}</p>
                          <p className="text-xs text-gray-400">{row.name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{row.section}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{row.department}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-medium">{row.sessions}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400">
                          {row.presentCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
                          {row.absentCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400">
                          {row.lateCount}
                        </span>
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
