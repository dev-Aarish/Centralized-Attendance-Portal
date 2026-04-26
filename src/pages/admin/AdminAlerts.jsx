import { useState, useEffect } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { apiFetch } from '../../lib/api'
import { formatCohort } from '../../lib/format'

export default function AdminAlerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [department, setDepartment] = useState('')

  useEffect(() => {
    fetchAlerts()
  }, [])

  async function fetchAlerts() {
    try {
      setLoading(true)
      const query = department ? `?department=${department}` : ''
      const data = await apiFetch(`/api/v1/admin/alerts/low-attendance${query}`)
      setAlerts(data.data || [])
    } catch (err) {
      setError(err.message)
      console.error('Error fetching alerts:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <AppLayout title="Low Attendance Alerts">
        <div style={{ width: '100%' }} className="flex flex-col gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </AppLayout>
    )
  }

  const getAttendanceColor = (percent) => {
    if (percent >= 75) return 'green'
    if (percent >= 50) return 'amber'
    return 'red'
  }

  return (
    <AppLayout title="Low Attendance Alerts">
      <div style={{ width: '100%' }} className="flex flex-col gap-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Low Attendance Alerts</h2>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Students with attendance below 75%</p>
        </div>

        {/* Filter */}
        <div className="flex gap-3">
          <select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value)
            }}
            onChangeCapture={() => fetchAlerts()}
            className="flex-1 max-w-xs px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Departments</option>
            <option value="CSE">CSE</option>
            <option value="IT">IT</option>
            <option value="ECE">ECE</option>
            <option value="EE">EE</option>
            <option value="ME">ME</option>
            <option value="CE">CE</option>
          </select>
          <button
            onClick={fetchAlerts}
            className="px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-2xl px-5 py-4">
            <p className="text-xs text-red-600 dark:text-red-400">Critical Alerts</p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-1">
              {alerts.filter((a) => a.attendancePercent < 50).length}
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl px-5 py-4">
            <p className="text-xs text-amber-600 dark:text-amber-400">Warning Alerts</p>
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {alerts.filter((a) => a.attendancePercent >= 50 && a.attendancePercent < 75).length}
            </p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl px-5 py-4">
            <p className="text-xs text-blue-600 dark:text-blue-400">Total Alerts</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1">{alerts.length}</p>
          </div>
        </div>

        {/* Alerts List */}
        {alerts.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">✨ No alerts. All students are doing well!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const color = getAttendanceColor(alert.attendancePercent)
              const colorClasses = {
                green: 'border-green-100 dark:border-green-900/30 bg-green-50 dark:bg-green-950/20',
                amber: 'border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20',
                red: 'border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-950/20',
              }
              const textClasses = {
                green: 'text-green-600 dark:text-green-400',
                amber: 'text-amber-600 dark:text-amber-400',
                red: 'text-red-600 dark:text-red-400',
              }

              return (
                <div
                  key={alert.studentId}
                  className={`border rounded-2xl px-5 py-4 ${colorClasses[color]}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className={`font-semibold ${textClasses[color]}`}>{alert.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Roll: {alert.rollNumber} • {formatCohort(alert.department, alert.yearOfStudy)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{alert.email}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${textClasses[color]}`}>{alert.attendancePercent}%</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {alert.sessionsAttended}/{alert.totalSessions} sessions
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}