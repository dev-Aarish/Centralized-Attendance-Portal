import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '../../components/shared/AppLayout'
import { getMyAssignedSections, getMyTeacherStats } from '../../lib/profile'
import { getTodaySchedule } from '../../lib/schedule'
import { formatCohort } from '../../lib/format'

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

function formatTimeDisplay(raw) {
  if (!raw) return ''
  const parts = raw.split(':')
  const h = parseInt(parts[0])
  const m = parts[1] || '00'
  if (isNaN(h)) return raw
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${hour12}:${m} ${ampm}`
}

// Color palette for today's class cards
const CARD_COLORS = [
  { bg: 'bg-gradient-to-br from-indigo-500/5 to-indigo-600/10', border: 'border-indigo-500/20', dot: 'bg-indigo-400', badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  { bg: 'bg-gradient-to-br from-emerald-500/5 to-emerald-600/10', border: 'border-emerald-500/20', dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { bg: 'bg-gradient-to-br from-purple-500/5 to-purple-600/10', border: 'border-purple-500/20', dot: 'bg-purple-400', badge: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  { bg: 'bg-gradient-to-br from-amber-500/5 to-amber-600/10', border: 'border-amber-500/20', dot: 'bg-amber-400', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { bg: 'bg-gradient-to-br from-pink-500/5 to-pink-600/10', border: 'border-pink-500/20', dot: 'bg-pink-400', badge: 'bg-pink-500/10 text-pink-400 border-pink-500/30' },
  { bg: 'bg-gradient-to-br from-cyan-500/5 to-cyan-600/10', border: 'border-cyan-500/20', dot: 'bg-cyan-400', badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
]

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

      // Sort today's classes by time
      const sorted = (scheduleData || []).sort((a, b) => {
        const aTime = getClassTiming(a)
        const bTime = getClassTiming(b)
        const aStart = parseTime(aTime.startRaw)
        const bStart = parseTime(bTime.startRaw)
        if (!aStart || !bStart) return 0
        return (aStart.h * 60 + aStart.m) - (bStart.h * 60 + bStart.m)
      })

      setTodayClasses(sorted)
      if (statsData) setTeacherStats(statsData)
      setLoading(false)
    }
    load()
  }, [])

  // Stats
  const regularClasses = todayClasses.filter(c => {
    const code = (c.courses?.code || c.class_sections?.courses?.code || '').trim().toUpperCase()
    return !['LIB', 'REM', 'LUNCH'].includes(code)
  })

  const stats = [
    { label: 'Assigned courses', value: sections.length, icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-indigo-400"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
    )},
    { label: 'Classes today', value: regularClasses.length, icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-emerald-400"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
    )},
    { label: 'Departments', value: [...new Set(sections.map((s) => s.class_sections?.courses?.department))].filter(Boolean).length, icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-purple-400"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    )},
    { label: 'Total students', value: teacherStats.totalStudents || 0, icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-amber-400"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    )},
  ]

  return (
    <AppLayout title="Dashboard">
      <div style={{ width: '100%' }} className="flex flex-col gap-8">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {loading ? '—' : s.value}
                </p>
                <div className="p-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  {s.icon}
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Today's classes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Today's classes
            </h2>
            {!loading && regularClasses.length > 0 && (
              <button
                onClick={() => navigate('/schedule')}
                className="text-xs text-indigo-500 hover:text-indigo-400 font-medium transition-colors"
              >
                View full schedule →
              </button>
            )}
          </div>
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : regularClasses.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-5 py-8 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
                <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
              </svg>
              <p className="text-sm text-gray-400 dark:text-gray-500">No classes scheduled for today</p>
              <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Enjoy your free day!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {regularClasses.map((cls, idx) => {
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

                const courseName = cls.courses?.name || cls.class_sections?.courses?.name || 'Unknown Course'
                const courseCode = cls.courses?.code || cls.class_sections?.courses?.code || ''
                const section = cls.class_sections?.section || ''
                const yearOfStudy = cls.class_sections?.year_of_study || ''
                const department = cls.class_sections?.department || ''
                const room = cls.room || cls.room_number || cls.roomNumber || 'TBA'
                const color = CARD_COLORS[idx % CARD_COLORS.length]

                return (
                  <div
                    key={cls.id}
                    className={`${color.bg} border ${color.border} rounded-2xl px-5 py-4 flex items-center justify-between transition-all ${isDone ? 'opacity-50' : 'hover:scale-[1.01]'}`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Color dot / timeline indicator */}
                      <div className="flex flex-col items-center gap-1">
                        <div className={`w-3 h-3 rounded-full ${color.dot} ${isOngoing ? 'animate-pulse ring-4 ring-emerald-500/20' : ''}`} />
                        {hasValidTime && (
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono whitespace-nowrap">
                            {formatTimeDisplay(startRaw)}
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium text-gray-800 dark:text-white">
                            {courseName}
                          </p>
                          {courseCode && (
                            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                              {courseCode}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {(department || yearOfStudy || section) && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color.badge}`}>
                              {formatCohort(department, yearOfStudy, section)}
                            </span>
                          )}
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            Room {room}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 font-mono">
                        {startRaw && endRaw
                          ? `${formatTimeDisplay(startRaw)} – ${formatTimeDisplay(endRaw)}`
                          : 'Time TBA'
                        }
                      </span>
                      {isDone && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 font-medium">Done</span>
                      )}
                      {isOngoing && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-950 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-900 font-medium animate-pulse">Live</span>
                      )}
                      {!isDone && !isOngoing && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900 font-medium">Upcoming</span>
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
                    {formatCohort(s.class_sections?.department, s.class_sections?.year_of_study, s.class_sections?.section)}
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