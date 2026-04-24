import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../../components/shared/AppLayout'
import { getMyAssignedSections, getMyTeacherStats } from '../../lib/profile'
import { getTodaySchedule } from '../../lib/schedule'

function parseTime(value) {
  if (!value || typeof value !== 'string') return null
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return { h, m }
}

function getClassTiming(cls) {
  const startRaw = cls.start_time || cls.startTime || null
  const endRaw = cls.end_time || cls.endTime || null

  if (startRaw && endRaw) {
    return { startRaw, endRaw }
  }

  const slot = cls.time_slot || cls.timeSlot || ''
  if (!slot || typeof slot !== 'string' || !slot.includes('-')) {
    return { startRaw: null, endRaw: null }
  }

  const [slotStart, slotEnd] = slot.split('-').map((t) => t.trim())
  return { startRaw: slotStart || null, endRaw: slotEnd || null }
}

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const [sections, setSections] = useState([])
  const [todayClasses, setTodayClasses] = useState([])
  const [teacherStats, setTeacherStats] = useState({ totalStudents: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: sectionData }, { data: scheduleData }, { data: statsData }] = await Promise.all([
        getMyAssignedSections(),
        getTodaySchedule('teacher'),
        getMyTeacherStats()
      ])
      setSections(sectionData || [])
      setTodayClasses(scheduleData || [])
      if (statsData) setTeacherStats(statsData)
      setLoading(false)
    }
    load()
  }, [])

  const stats = [
    { label: 'Assigned courses', value: sections.length },
    { label: 'Classes today', value: todayClasses.length },
    { label: 'Departments', value: [...new Set(sections.map((s) => s.class_sections?.courses?.department))].filter(Boolean).length },
    { label: 'Total students', value: teacherStats.totalStudents || 0 },
  ]

  return (
    <AppLayout title="Dashboard">
      <div style={{ width: '100%' }} className="flex flex-col gap-8">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4">
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {loading ? '—' : s.value}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Today's classes */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Today's classes
          </h2>
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : todayClasses.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">No classes scheduled for today</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {todayClasses.map((cls) => {
                const now = new Date()
                const { startRaw, endRaw } = getClassTiming(cls)
                const startParsed = parseTime(startRaw)
                const endParsed = parseTime(endRaw)

                const hasValidTime = Boolean(startParsed && endParsed)
                let isDone = false
                let isOngoing = false

                if (hasValidTime) {
                  const start = new Date()
                  start.setHours(startParsed.h, startParsed.m, 0)
                  const end = new Date()
                  end.setHours(endParsed.h, endParsed.m, 0)
                  isDone = now > end
                  isOngoing = now >= start && now <= end
                }

                return (
                  <div
                    key={cls.id}
                    className={`bg-white dark:bg-gray-900 border rounded-2xl px-5 py-4 flex items-center justify-between transition-opacity ${isDone ? 'opacity-50 border-gray-100 dark:border-gray-800' : 'border-gray-100 dark:border-gray-800'}`}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white">
                        {cls.class_sections?.courses?.name}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {cls.class_sections?.section || 'No section'} · {cls.room || cls.room_number || cls.roomNumber || 'No room'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">
                        {startRaw && endRaw ? `${startRaw.slice(0, 5)} – ${endRaw.slice(0, 5)}` : 'Time TBA'}
                      </span>
                      {isDone && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400">Done</span>
                      )}
                      {isOngoing && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900">Ongoing</span>
                      )}
                      {!isDone && !isOngoing && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900">Upcoming</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Assigned sections */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Your courses
          </h2>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : sections.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">No courses assigned yet. Contact your admin.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sections.map((s) => (
                <div
                  key={s.id}
                  onClick={() => navigate('/courses')}
                  className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4 cursor-pointer hover:border-gray-200 dark:hover:border-gray-700 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-800 dark:text-white">
                    {s.class_sections?.courses?.name}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {s.class_sections?.courses?.code} · {s.class_sections?.section || 'No section'} · {s.class_sections?.department}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Quick actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: 'Take attendance', desc: 'Mark today\'s class', path: '/attendance' },
              { label: 'Upload notes', desc: 'Share with students', path: '/notes' },
              { label: 'Create assignment', desc: 'From question bank', path: '/assignments' },
            ].map((a) => (
              <button
                key={a.label}
                onClick={() => navigate(a.path)}
                className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4 text-left hover:border-gray-200 dark:hover:border-gray-700 transition-colors"
              >
                <p className="text-sm font-medium text-gray-800 dark:text-white">{a.label}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{a.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}