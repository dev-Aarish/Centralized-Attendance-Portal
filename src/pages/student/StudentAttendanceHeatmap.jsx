import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppLayout from '../../components/shared/AppLayout'
import { getMyAttendanceDetails } from '../../lib/attendance'

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function getLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toLocalDate(dateKey) {
  return new Date(`${dateKey}T00:00:00`)
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

function getMonthLabel(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date).toUpperCase()
}

function getCalendarMonthDates(monthDate) {
  const firstDay = startOfMonth(monthDate)
  const startWeekday = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  const cells = []

  for (let i = 0; i < startWeekday; i += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day))
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

function getDayStatus(day) {
  if (!day) return 'no-class'
  if (day.sessions === 0) return 'no-class'
  if (day.absent >= day.sessions) return 'missed'
  if (day.late > 0 && day.attended === 0) return 'late'
  if (day.late > 0 && day.absent > 0) return 'late'
  if (day.attended >= day.sessions) return 'attended'
  return day.attended >= day.absent ? 'attended' : 'missed'
}

function getStatusStyles(status) {
  switch (status) {
    case 'attended':
      return {
        cell: 'bg-[#10251c] border-[#23513d] text-[#d8f7e8]',
        accent: 'bg-[#22c55e]',
        ring: 'ring-[#22c55e]',
      }
    case 'late':
      return {
        cell: 'bg-[#2b2112] border-[#6b5421] text-[#f8e7b1]',
        accent: 'bg-[#e0a21a]',
        ring: 'ring-[#d89b1d]',
      }
    case 'missed':
      return {
        cell: 'bg-[#241317] border-[#5b1c28] text-[#f6c1cb]',
        accent: 'bg-[#c61a43]',
        ring: 'ring-[#aa1433]',
      }
    default:
      return {
        cell: 'bg-[#1a1a1a] border-[#2a2a2a] text-[#7b7b7b]',
        accent: 'bg-[#3a3a3a]',
        ring: 'ring-[#64748b]',
      }
  }
}

function aggregateHeatmap(subject) {
  const records = (subject?.teachers || []).flatMap((teacher) =>
    (teacher.records || []).map((record) => ({
      ...record,
      teacherName: teacher.name,
    }))
  )

  const byDate = new Map()

  for (const record of records) {
    const key = record.sessionDate || record.date
    if (!key) continue

    const current = byDate.get(key) || {
      date: key,
      label: record.date,
      sessions: 0,
      attended: 0,
      late: 0,
      absent: 0,
      entries: [],
    }

    current.sessions += 1
    if (record.status === 'present') current.attended += 1
    if (record.status === 'late') {
      current.attended += 1
      current.late += 1
    }
    if (record.status === 'absent') current.absent += 1
    current.entries.push(record)
    byDate.set(key, current)
  }

  const heatmap = Array.from(byDate.values())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((day) => ({
      ...day,
      percentage: day.sessions > 0 ? Math.round((day.attended / day.sessions) * 100) : 0,
      status: getDayStatus(day),
    }))

  return heatmap
}

export default function StudentAttendanceHeatmap() {
  const navigate = useNavigate()
  const { type, courseCode } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [subject, setSubject] = useState(null)
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()))
  const [selectedDateKey, setSelectedDateKey] = useState(null)
  const initializedRef = useRef(false)

  const courseLabel = useMemo(() => decodeURIComponent(courseCode || ''), [courseCode])

  useEffect(() => {
    let active = true

    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        // Fetch 'all' instead of 'type' to ensure we include 'regular', 'randomized', etc.
        // This guarantees the heatmap data perfectly matches the overall dashboard data.
        const { data, error: fetchError } = await getMyAttendanceDetails('all')

        if (!active) return

        if (fetchError) {
          setError(fetchError.message || 'Failed to load attendance heatmap.')
          setSubject(null)
          return
        }

        const subjects = data || []
        const matched = subjects.find((item) => {
          return normalize(item.subjectCode) === normalize(courseLabel) || normalize(item.subjectName) === normalize(courseLabel)
        })

        setSubject(matched || null)
      } catch (err) {
        if (!active) return
        setError(err?.message || 'Failed to load attendance heatmap.')
        setSubject(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadData()

    return () => {
      active = false
    }
  }, [type, courseLabel])

  const heatmap = useMemo(() => aggregateHeatmap(subject), [subject])
  const dayMap = useMemo(() => new Map(heatmap.map((day) => [day.date, day])), [heatmap])
  const calendarCells = useMemo(() => getCalendarMonthDates(viewDate), [viewDate])
  const totalSessions = heatmap.reduce((sum, day) => sum + day.sessions, 0)
  const attendedSessions = heatmap.reduce((sum, day) => sum + day.attended, 0)
  const averagePercentage = totalSessions > 0 ? Math.round((attendedSessions / totalSessions) * 100) : 0
  const latestDate = heatmap.length ? heatmap[heatmap.length - 1] : null
  const firstDate = heatmap.length ? heatmap[0] : null

  useEffect(() => {
    if (initializedRef.current || !heatmap.length) return

    const todayKey = getLocalDateKey(new Date())
    const preferred = dayMap.get(todayKey) || heatmap[heatmap.length - 1] || heatmap[0]

    if (preferred?.date) {
      setSelectedDateKey(preferred.date)
      setViewDate(startOfMonth(toLocalDate(preferred.date)))
    }

    initializedRef.current = true
  }, [heatmap, dayMap])

  const selectedDay = selectedDateKey ? dayMap.get(selectedDateKey) : null
  const monthTitle = getMonthLabel(viewDate)
  const weekdayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  const monthStats = useMemo(() => {
    const currentMonthKey = `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, '0')}`
    const days = heatmap.filter((day) => day.date.startsWith(currentMonthKey))
    return {
      attended: days.filter((day) => day.status === 'attended').length,
      missed: days.filter((day) => day.status === 'missed').length,
      late: days.filter((day) => day.status === 'late').length,
      noClass: calendarCells.filter((cell) => !cell || !dayMap.get(getLocalDateKey(cell))).length,
    }
  }, [calendarCells, dayMap, heatmap, viewDate])

  return (
    <AppLayout title="Attendance Heatmap">
      <div className="min-h-full bg-[#101114] p-3 md:p-5">
        <div className="mx-auto max-w-4xl space-y-4 text-white">
        <div className="rounded-[2rem] bg-[#151515] p-4 md:p-5 border border-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.38)] flex flex-col gap-4 md:flex-row md:items-end md:justify-between relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#8fa8ff]/70 to-transparent" />
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-white/55 hover:text-white transition-colors"
            >
              <span className="text-base leading-none">←</span>
              Back
            </button>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/35">{type} attendance</p>
              <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-white mt-1">
                {subject ? subject.subjectName : courseLabel || 'Course'}
              </h1>
              <p className="text-xs text-white/45 mt-1">
                Attendance history by month and session date.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 md:min-w-[290px]">
            <div className="rounded-2xl bg-white/5 border border-white/5 p-2.5">
              <p className="text-[9px] uppercase tracking-widest text-white/35 font-semibold">Sessions</p>
              <p className="text-xl font-black text-white mt-1">{totalSessions}</p>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/5 p-2.5">
              <p className="text-[9px] uppercase tracking-widest text-white/35 font-semibold">Average</p>
              <p className="text-xl font-black text-white mt-1">{averagePercentage}%</p>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/5 p-2.5">
              <p className="text-[9px] uppercase tracking-widest text-white/35 font-semibold">Range</p>
              <p className="text-xs font-bold text-white mt-1 leading-tight">
                {firstDate && latestDate ? `${firstDate.label} → ${latestDate.label}` : '—'}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[2rem] bg-[#151515] p-8 text-center border border-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <p className="text-sm text-white/55">Loading heatmap...</p>
          </div>
        ) : error ? (
          <div className="rounded-[2rem] bg-[#2a1418] p-8 text-center border border-red-900/30 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <p className="text-sm font-medium text-red-300">{error}</p>
          </div>
        ) : !subject ? (
          <div className="rounded-[2rem] bg-[#151515] p-8 text-center border border-white/5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <p className="text-sm font-medium text-white/65">No attendance records found for this course.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.55fr_0.9fr]">
            <div className="rounded-[2rem] bg-[#151515] p-4 md:p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] border border-white/5">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl font-extrabold tracking-tight text-white">Attendance History</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/55">
                    <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-[#22c55e]" /> {monthStats.attended} present</span>
                    <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-[#aa1433]" /> {monthStats.missed} absent</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setViewDate((current) => addMonths(current, -1))}
                    className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center"
                    aria-label="Previous month"
                  >
                    ‹
                  </button>
                  <div className="min-w-[96px] text-center text-xs font-extrabold tracking-[0.28em] text-white/80">
                    {monthTitle}
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewDate((current) => addMonths(current, 1))}
                    className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors flex items-center justify-center"
                    aria-label="Next month"
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-white/5 bg-[#1b1b1b] p-3.5 md:p-4">
                <div className="grid grid-cols-7 gap-1.5 md:gap-2 mb-3 text-center text-[10px] font-semibold tracking-[0.28em] text-white/30">
                  {weekdayLabels.map((label) => (
                    <div key={label}>{label}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5 md:gap-2">
                  {calendarCells.map((date, index) => {
                    if (!date) {
                      return <div key={`empty-${index}`} className="aspect-square rounded-xl bg-[#242424] border border-white/5" />
                    }

                    const dateKey = getLocalDateKey(date)
                    const day = dayMap.get(dateKey)
                    const status = getDayStatus(day)
                    const styles = getStatusStyles(status)
                    const isSelected = selectedDateKey === dateKey
                    const hasClass = !!day && day.sessions > 0
                    const dayNumber = date.getDate()

                    return (
                      <button
                        key={dateKey}
                        type="button"
                        onClick={() => setSelectedDateKey(dateKey)}
                        className={`aspect-square rounded-xl border transition-all duration-200 flex flex-col items-center justify-center gap-1 relative overflow-hidden ${styles.cell} ${isSelected ? `ring-4 ${styles.ring} ring-offset-0 scale-[1.03]` : 'hover:border-white/15 hover:bg-white/7'}`}
                        title={hasClass ? `${day.label}: ${day.percentage}% attendance` : 'No class'}
                      >
                        <span className={`text-[11px] font-medium ${hasClass ? 'text-white/85' : 'text-white/18'}`}>{dayNumber}</span>
                        <span className={`text-[0.62rem] leading-none font-bold ${hasClass ? 'text-white/85' : 'text-white/18'}`}>
                          {hasClass ? `${day.percentage}%` : ' '}
                        </span>
                        {hasClass && selectedDateKey !== dateKey && (
                          <span className={`absolute bottom-2 h-1.5 w-1.5 rounded-full ${styles.accent}`} />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[11px] text-white/45 text-center">
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-[#22c55e]" /> Attended</span>
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-[#aa1433]" /> Missed</span>
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-[#343434]" /> No class</span>
              </div>
            </div>

            <div className="rounded-[2rem] bg-[#151515] p-4 md:p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)] border border-white/5 self-start">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base font-bold text-white">Selected day</h3>
                  <p className="text-xs text-white/45">
                    {selectedDay ? selectedDay.label : 'Pick a day to see session details'}
                  </p>
                </div>
                {selectedDay && (
                  <div className="rounded-2xl bg-white/5 border border-white/5 px-3 py-2 text-right">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-white/30 font-semibold">Attendance</p>
                    <p className="text-lg font-black text-white">{selectedDay.percentage}%</p>
                  </div>
                )}
              </div>

              {selectedDay ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-2xl bg-white/5 border border-white/5 px-3 py-3">
                      <p className="text-white/35 text-[10px] uppercase tracking-[0.22em] font-semibold">Sessions</p>
                      <p className="text-white text-lg font-black mt-1">{selectedDay.sessions}</p>
                    </div>
                    <div className="rounded-2xl bg-white/5 border border-white/5 px-3 py-3">
                      <p className="text-white/35 text-[10px] uppercase tracking-[0.22em] font-semibold">Present</p>
                      <p className="text-white text-lg font-black mt-1">{selectedDay.attended}</p>
                    </div>
                    <div className="rounded-2xl bg-white/5 border border-white/5 px-3 py-3">
                      <p className="text-white/35 text-[10px] uppercase tracking-[0.22em] font-semibold">Late</p>
                      <p className="text-white text-lg font-black mt-1">{selectedDay.late}</p>
                    </div>
                    <div className="rounded-2xl bg-white/5 border border-white/5 px-3 py-3">
                      <p className="text-white/35 text-[10px] uppercase tracking-[0.22em] font-semibold">Missed</p>
                      <p className="text-white text-lg font-black mt-1">{selectedDay.absent}</p>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {selectedDay.entries.map((entry, index) => (
                      <div key={`${selectedDay.date}-${index}`} className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-[#1b1b1b] px-3 py-2.5">
                        <div>
                          <p className="font-semibold text-white text-sm">{entry.teacherName || 'Teacher'}</p>
                          <p className="text-[11px] text-white/45">{entry.time || 'Time not recorded'}</p>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-[0.18em] px-3 py-1.5 rounded-full ${entry.status === 'present' ? 'bg-[#162a25] text-[#9cb4ff]' : entry.status === 'late' ? 'bg-[#2c2311] text-[#d89b1d]' : 'bg-[#2c1418] text-[#aa1433]'}`}>
                          {entry.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/5 bg-[#1b1b1b] px-4 py-7 text-center text-sm text-white/45">
                  No day selected.
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </AppLayout>
  )
}
