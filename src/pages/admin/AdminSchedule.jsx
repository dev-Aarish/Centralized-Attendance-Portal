import { useState, useEffect, useRef } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { apiFetch } from '../../lib/api'

const DEPARTMENTS = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HOURS = Array.from({ length: 10 }, (_, i) => ({ start: 8 + i, label: `${8 + i}:00` }))
const TOTAL_HOURS = HOURS.length

const COURSE_COLORS = [
  'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/50',
  'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800/50',
  'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/50',
  'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/50',
  'bg-pink-100 dark:bg-pink-900/40 text-pink-800 dark:text-pink-300 border-pink-200 dark:border-pink-800/50',
  'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/50',
]

const SPECIAL_BLOCKS = [
  { id: 'special-library', code: 'LIB', name: 'Library', teacherName: '—', isSpecial: true, specialColor: 'bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 border-dashed' },
  { id: 'special-remedial', code: 'REM', name: 'Remedial', teacherName: '—', isSpecial: true, specialColor: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-800 border-dashed' },
  { id: 'special-lunch', code: 'LUNCH', name: 'Lunch Break', teacherName: '—', isSpecial: true, specialColor: 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800 border-dashed' },
]

const getCourseColor = (courseId) => {
  if (!courseId) return COURSE_COLORS[0]
  const sum = String(courseId).split('').reduce((a, b) => a + b.charCodeAt(0), 0)
  return COURSE_COLORS[sum % COURSE_COLORS.length]
}

export default function AdminSchedule() {
  const [department, setDepartment] = useState('')
  const [cohorts, setCohorts] = useState([])
  const [selectedCohortId, setSelectedCohortId] = useState('')
  const [allCourses, setAllCourses] = useState([])
  const [defaultRoom, setDefaultRoom] = useState('')
  const [gridSchedules, setGridSchedules] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [resizing, setResizing] = useState(null)
  const [editingBlock, setEditingBlock] = useState(null)
  const editPopoverRef = useRef(null)
  const trackRefs = useRef({})

  // Fetch all courses on mount
  useEffect(() => { fetchAllCourses() }, [])

  useEffect(() => { if (department) fetchCohorts() }, [department])

  useEffect(() => {
    if (selectedCohortId) { fetchSchedules(); setSuccessMsg(null); setError(null) }
    else { setGridSchedules([]) }
  }, [selectedCohortId, cohorts])

  async function fetchAllCourses() {
    try {
      const data = await apiFetch('/api/v1/admin/courses')
      setAllCourses(data.data || [])
    } catch (err) { console.error('Error fetching courses:', err) }
  }

  async function fetchCohorts() {
    try {
      setLoading(true)
      const data = await apiFetch(`/api/v1/admin/departments/${department}/sections`)
      const grouped = {}
      ;(data.data || []).forEach(s => {
        const key = `Year ${s.yearOfStudy}-Sec ${s.section}`
        if (!grouped[key]) {
          grouped[key] = { id: key, yearOfStudy: s.yearOfStudy, section: s.section, label: `Section ${s.section} (Year ${s.yearOfStudy})`, classSections: [] }
        }
        grouped[key].classSections.push({ id: s.id, courseId: s.courseId, code: s.courses?.code, name: s.courses?.name, teacherName: s.teacherName || 'Unassigned' })
      })
      setCohorts(Object.values(grouped))
      setSelectedCohortId('')
      setGridSchedules([])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  async function fetchSchedules() {
    const cohort = cohorts.find(c => c.id === selectedCohortId)
    if (!cohort || cohort.classSections.length === 0) return
    try {
      setLoading(true)
      const sectionIds = cohort.classSections.map(cs => cs.id).join(',')
      const data = await apiFetch(`/api/v1/admin/schedules?sectionIds=${sectionIds}`)
      const formatted = (data.data || []).map(s => {
        const timeParts = s.timeSlot.split('-')
        const startHour = parseInt(timeParts[0].split(':')[0])
        const endHour = timeParts.length > 1 ? parseInt(timeParts[1].split(':')[0]) : startHour + 1
        const sectionInfo = cohort.classSections.find(c => c.id === s.classSectionId) || {}
        return { tempId: Math.random().toString(36).substr(2, 9), classSectionId: s.classSectionId, courseId: s.courseId, day: s.day, startHour, duration: Math.max(1, endHour - startHour), roomNumber: s.roomNumber, courseCode: s.course?.code, courseName: s.course?.name, teacherName: sectionInfo.teacherName || 'Unknown', isSpecial: false }
      })
      setGridSchedules(formatted)
    } catch (err) { setError('Failed to load existing schedule') } finally { setLoading(false) }
  }

  async function handleSave() {
    const cohort = cohorts.find(c => c.id === selectedCohortId)
    if (!cohort) return
    try {
      setSaving(true); setError(null)
      const sectionIds = cohort.classSections.map(cs => cs.id)
      const payload = gridSchedules.filter(s => !s.isSpecial && s.classSectionId).map(s => ({
        class_section_id: s.classSectionId, course_id: s.courseId, day: s.day,
        time_slot: `${s.startHour}:00-${s.startHour + s.duration}:00`,
        room_number: s.roomNumber || defaultRoom || 'TBA'
      }))
      await apiFetch('/api/v1/admin/schedules/replace', { method: 'PUT', body: JSON.stringify({ sectionIds, schedules: payload }) })
      setSuccessMsg('Schedule saved successfully!')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  // Build a courseId -> classSectionId map from the cohort
  const currentCohort = cohorts.find(c => c.id === selectedCohortId)
  const cohortCourseMap = {}
  if (currentCohort) {
    currentCohort.classSections.forEach(cs => { cohortCourseMap[cs.courseId] = cs })
  }

  // Build palette items: all courses + special blocks
  const paletteItems = [
    ...allCourses.map(c => {
      const cohortInfo = cohortCourseMap[c.id]
      return { id: cohortInfo?.id || `course-${c.id}`, courseId: c.id, code: c.code, name: c.name, teacherName: cohortInfo?.teacherName || '', isSpecial: false, isCohortCourse: !!cohortInfo, classSectionId: cohortInfo?.id || null }
    }),
    ...SPECIAL_BLOCKS
  ]

  const handleDragStart = (e, item, source) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ item, source }))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }

  const checkConflict = (day, startHour, duration, ignoreTempId = null) => {
    return gridSchedules.some(s => {
      if (s.tempId === ignoreTempId || s.day !== day) return false
      return (startHour < s.startHour + s.duration && startHour + duration > s.startHour)
    })
  }

  const handleDrop = (e, dropDay, dropHour) => {
    e.preventDefault()
    try {
      const raw = e.dataTransfer.getData('application/json')
      if (!raw) return
      const { item, source } = JSON.parse(raw)
      const duration = item.duration || 1
      if (dropHour + duration > 18) return
      if (checkConflict(dropDay, dropHour, duration, source === 'grid' ? item.tempId : null)) {
        setError('Conflict: Overlapping classes'); setTimeout(() => setError(null), 3000); return
      }
      if (source === 'palette') {
        // Block non-cohort, non-special courses from being dropped
        if (!item.isSpecial && !item.classSectionId) {
          setError('This course is not assigned to this cohort. Assign it first via Department Management.')
          setTimeout(() => setError(null), 4000)
          return
        }
        setGridSchedules(prev => [...prev, {
          tempId: Math.random().toString(36).substr(2, 9),
          classSectionId: item.classSectionId || null,
          courseId: item.courseId, day: dropDay, startHour: dropHour, duration: 1,
          roomNumber: defaultRoom || '', courseCode: item.code, courseName: item.name,
          teacherName: item.teacherName, isSpecial: !!item.isSpecial,
          specialColor: item.specialColor || null
        }])
      } else if (source === 'grid') {
        setGridSchedules(prev => prev.map(s => s.tempId === item.tempId ? { ...s, day: dropDay, startHour: dropHour } : s))
      }
    } catch (err) { console.error('Drop error:', err) }
  }

  // Horizontal resize (right edge)
  const handleResizeStart = (e, schedule) => {
    e.preventDefault(); e.stopPropagation()
    const trackEl = trackRefs.current[schedule.day]
    const colWidth = trackEl ? trackEl.offsetWidth / TOTAL_HOURS : 80
    setResizing({ tempId: schedule.tempId, startX: e.clientX, initialDuration: schedule.duration, startHour: schedule.startHour, day: schedule.day, colWidth })
  }

  useEffect(() => {
    if (!resizing) return
    const handleMouseMove = (e) => {
      const deltaX = e.clientX - resizing.startX
      const deltaHours = Math.round(deltaX / resizing.colWidth)
      let newDuration = Math.max(1, resizing.initialDuration + deltaHours)
      if (resizing.startHour + newDuration > 18) newDuration = 18 - resizing.startHour
      // Check conflicts
      for (const s of gridSchedules) {
        if (s.tempId === resizing.tempId || s.day !== resizing.day) continue
        if (resizing.startHour < s.startHour + s.duration && resizing.startHour + newDuration > s.startHour) {
          if (resizing.startHour < s.startHour) newDuration = Math.min(newDuration, s.startHour - resizing.startHour)
          else return
        }
      }
      setGridSchedules(prev => prev.map(s => s.tempId === resizing.tempId ? { ...s, duration: newDuration } : s))
    }
    const handleMouseUp = () => setResizing(null)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp) }
  }, [resizing, gridSchedules])

  // Close popover on outside click
  useEffect(() => {
    const handler = (e) => { if (editPopoverRef.current && !editPopoverRef.current.contains(e.target)) setEditingBlock(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <AppLayout title="Schedule Builder">
      <div className="flex flex-col gap-5 w-full max-w-[1500px] mx-auto" style={{ height: 'calc(100vh - 100px)' }}>

        {/* Zone 1: Header */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 flex flex-wrap items-end justify-between gap-4 shrink-0">
          <div className="flex flex-wrap items-end gap-4 flex-1">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Department</label>
              <select value={department} onChange={(e) => setDepartment(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white min-w-[140px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select Dept</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Cohort</label>
              <select value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)} disabled={!department || cohorts.length === 0} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white min-w-[200px] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
                <option value="">Select Cohort</option>
                {cohorts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Default Room</label>
              <input type="text" placeholder="e.g. ICT304" value={defaultRoom} onChange={(e) => setDefaultRoom(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white min-w-[140px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {error && <span className="text-sm text-red-500">{error}</span>}
            {successMsg && <span className="text-sm text-green-500 font-medium">{successMsg}</span>}
            <button onClick={handleSave} disabled={!selectedCohortId || saving || loading} className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </div>

        {/* Main builder area */}
        <div className="flex gap-5 flex-1 min-h-0">

          {/* Zone 2: Course Palette */}
          <div className="w-64 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl flex flex-col shrink-0 overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Course Palette</h3>
              <p className="text-xs text-gray-500 mt-1">Drag onto the grid</p>
            </div>
            <div className="p-3 overflow-y-auto custom-scrollbar flex-1 space-y-2">
              {/* Special blocks first */}
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold px-1 pt-1">Common</p>
              {SPECIAL_BLOCKS.map(sb => (
                <div key={sb.id} draggable onDragStart={(e) => handleDragStart(e, sb, 'palette')} className={`p-2.5 rounded-xl border-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${sb.specialColor}`}>
                  <div className="font-bold text-xs">{sb.code}</div>
                  <div className="text-[10px] opacity-80">{sb.name}</div>
                </div>
              ))}

              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold px-1 pt-2">All Courses</p>
              {paletteItems.filter(p => !p.isSpecial).map(item => (
                <div key={item.id} draggable={item.isCohortCourse} onDragStart={(e) => item.isCohortCourse ? handleDragStart(e, item, 'palette') : e.preventDefault()} className={`p-2.5 rounded-xl border transition-shadow ${item.isCohortCourse ? `cursor-grab active:cursor-grabbing hover:shadow-md ${getCourseColor(item.courseId)}` : 'opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-600'}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-xs">{item.code}</div>
                    {item.isCohortCourse ? <span className="text-[8px] bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded font-bold">ASSIGNED</span> : <span className="text-[8px] px-1.5 py-0.5 rounded font-bold">NOT IN COHORT</span>}
                  </div>
                  <div className="text-[10px] opacity-90 mt-0.5 leading-tight line-clamp-1">{item.name}</div>
                  {item.teacherName && <div className="text-[10px] mt-1 opacity-70 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    {item.teacherName}
                  </div>}
                </div>
              ))}
              {allCourses.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Loading courses...</p>}
            </div>
          </div>

          {/* Zone 3: Horizontal Time Grid — days as rows, hours as columns */}
          <div className="flex-1 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-auto custom-scrollbar relative select-none">
            {loading && <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 z-50"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>}

            <div className="min-w-[900px]">
              {/* Hour headers */}
              <div className="flex border-b border-gray-100 dark:border-gray-800 bg-gray-50/90 dark:bg-gray-800/90 sticky top-0 z-30">
                <div className="w-20 shrink-0 p-2 text-center text-xs font-medium text-gray-500 border-r border-gray-100 dark:border-gray-800">Day</div>
                <div className="flex-1 flex">
                  {HOURS.map(h => (
                    <div key={h.start} className="flex-1 p-2 text-center text-xs font-medium text-gray-500 border-r border-gray-100 dark:border-gray-800 last:border-r-0">{h.label}</div>
                  ))}
                </div>
              </div>

              {/* Day rows */}
              {DAYS.map(day => (
                <div key={day} className="flex border-b border-gray-100 dark:border-gray-800 last:border-b-0" style={{ minHeight: '90px' }}>
                  {/* Day label */}
                  <div className="w-20 shrink-0 flex items-center justify-center text-sm font-bold text-gray-700 dark:text-gray-300 border-r border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
                    {day.substring(0, 3)}
                  </div>

                  {/* Time track */}
                  <div ref={el => { trackRefs.current[day] = el }} className="flex-1 relative" style={{ minHeight: '90px' }}>
                    {/* Drop target cells */}
                    <div className="absolute inset-0 flex">
                      {HOURS.map(h => (
                        <div key={`drop-${day}-${h.start}`} className="flex-1 border-r border-gray-50 dark:border-gray-800/50 last:border-r-0 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors"
                          onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, day, h.start)} />
                      ))}
                    </div>

                    {/* Placed blocks */}
                    {gridSchedules.filter(s => s.day === day).map(schedule => {
                      const leftPct = ((schedule.startHour - 8) / TOTAL_HOURS) * 100
                      const widthPct = (schedule.duration / TOTAL_HOURS) * 100
                      const colorClass = schedule.isSpecial ? (schedule.specialColor || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 border-dashed') : getCourseColor(schedule.courseId)

                      return (
                        <div key={schedule.tempId} draggable onDragStart={(e) => handleDragStart(e, schedule, 'grid')}
                          className={`absolute top-2 bottom-2 rounded-lg border shadow-sm overflow-visible cursor-grab active:cursor-grabbing transition-all ${colorClass} ${resizing?.tempId === schedule.tempId ? 'z-40 opacity-90' : 'z-20 hover:z-30'}`}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          onClick={() => setEditingBlock(schedule.tempId)}
                        >
                          {/* Block content — absolutely centered so it never distorts */}
                          <div className="absolute inset-0 flex items-center justify-center text-center px-2 py-1.5 pointer-events-none" style={{ right: '8px' }}>
                            <div className="min-w-0 w-full">
                              <div className="font-bold text-xs truncate">{schedule.courseCode}</div>
                              {schedule.duration >= 2 && <div className="text-[10px] opacity-80 truncate">{schedule.courseName}</div>}
                              <div className="text-[10px] opacity-70 truncate">{schedule.roomNumber || 'No Room'}</div>
                            </div>
                          </div>

                          {/* RIGHT-edge resize handle */}
                          <div className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 rounded-r-lg transition-colors"
                            onMouseDown={(e) => handleResizeStart(e, schedule)}>
                            <div className="w-0.5 h-5 rounded-full bg-current opacity-30"></div>
                          </div>

                          {/* Popover on click */}
                          {editingBlock === schedule.tempId && (
                            <div ref={editPopoverRef} className="absolute z-50 bg-white dark:bg-gray-800 shadow-xl rounded-xl border border-gray-200 dark:border-gray-700 p-4 w-56 text-gray-900 dark:text-white"
                              style={{ top: '110%', left: '0' }} onClick={e => e.stopPropagation()}>
                              <h4 className="font-bold text-sm mb-0.5">{schedule.courseCode}</h4>
                              <p className="text-xs text-gray-500 mb-3">{schedule.courseName}</p>
                              <div className="space-y-2">
                                <div>
                                  <label className="text-xs font-medium text-gray-500 block mb-1">Room</label>
                                  <input type="text" value={schedule.roomNumber} onChange={(e) => setGridSchedules(prev => prev.map(s => s.tempId === schedule.tempId ? { ...s, roomNumber: e.target.value } : s))}
                                    className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:border-blue-500" placeholder="e.g. ICT312" />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-gray-500 block mb-1">Teacher</label>
                                  <div className="text-sm text-gray-600 dark:text-gray-400">{schedule.teacherName || '—'}</div>
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-gray-500 block mb-1">Time</label>
                                  <div className="text-sm text-gray-600 dark:text-gray-400">{schedule.startHour}:00 – {schedule.startHour + schedule.duration}:00</div>
                                </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); setGridSchedules(prev => prev.filter(s => s.tempId !== schedule.tempId)); setEditingBlock(null) }}
                                className="w-full mt-3 px-3 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-medium transition-colors"
                              >
                                Remove from Schedule
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="text-xs text-gray-400 text-center shrink-0 pb-2">
          Library, Remedial & Lunch Break blocks are for visual planning — only assigned courses are saved to the database.
        </div>
      </div>
    </AppLayout>
  )
}