import { useState, useEffect, useRef } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import { apiFetch } from '../../lib/api'
import SpiralLoader from '../../components/shared/Loader'
import { useAuth } from '../../hooks/useAuth'

const YEARS = ['1st', '2nd', '3rd', '4th']
const SECTIONS = ['A', 'B', 'C']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const HOURS = Array.from({ length: 9 }, (_, i) => ({ start: 9 + i, label: `${9 + i}:00` }))
const TOTAL_HOURS = HOURS.length
const TEACHER_WEEKLY_HOURS_LIMIT = 15

const COURSE_COLORS = [
  'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/50',
  'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800/50',
  'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/50',
  'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/50',
  'bg-pink-100 dark:bg-pink-900/40 text-pink-800 dark:text-pink-300 border-pink-200 dark:border-pink-800/50',
  'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/50',
]

const SPECIAL_BLOCKS = [
  { id: 'special-library', courseId: 'e5542137-baa2-4a85-beec-e7c146979670', code: 'LIB', name: 'Library', teacherName: '—', isSpecial: true, specialColor: 'bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 border-dashed' },
  { id: 'special-remedial', courseId: '3db4ec75-ef9c-4c26-8e14-249cf44d4253', code: 'REM', name: 'Remedial', teacherName: '—', isSpecial: true, specialColor: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-800 border-dashed' },
  { id: 'special-lunch', courseId: '24caed6e-c24d-4cfc-818d-c1178db9ec90', code: 'LUNCH', name: 'Lunch Break', teacherName: '—', isSpecial: true, specialColor: 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800 border-dashed' },
]

const getCourseColor = (courseId) => {
  if (!courseId) return COURSE_COLORS[0]
  const sum = String(courseId).split('').reduce((a, b) => a + b.charCodeAt(0), 0)
  return COURSE_COLORS[sum % COURSE_COLORS.length]
}

export default function AdminSchedule() {
  const { adminDepartment } = useAuth()
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [allSections, setAllSections] = useState([])
  const [cohort, setCohort] = useState(null)
  const [routines, setRoutines] = useState([])
  const [selectedRoutineId, setSelectedRoutineId] = useState('')
  const [allCourses, setAllCourses] = useState([])
  const [courseSearch, setCourseSearch] = useState('')
  const [defaultRoom, setDefaultRoom] = useState('')
  const [gridSchedules, setGridSchedules] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [resizing, setResizing] = useState(null)
  const [editingBlock, setEditingBlock] = useState(null)
  const [allTeachers, setAllTeachers] = useState([])
  const [teacherBaseWorkloadMap, setTeacherBaseWorkloadMap] = useState({})
  const [teacherBaseWorkloadDetailsMap, setTeacherBaseWorkloadDetailsMap] = useState({})
  const [teacherWorkloadWarning, setTeacherWorkloadWarning] = useState(null)
  const [actionWarning, setActionWarning] = useState(null)
  const editPopoverRef = useRef(null)
  const trackRefs = useRef({})
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalBody, setModalBody] = useState(null)

  function openModal(title, body) {
    setModalTitle(title || '')
    setModalBody(body || null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setModalTitle('')
    setModalBody(null)
  }

  // Fetch all courses and sections on mount
  useEffect(() => {
    fetchAllCourses();
    fetchSections();
    fetchTeachers();
  }, [])

  // Auto-clear toast messages
  useEffect(() => {
    if (error || successMsg || actionWarning) {
      const timer = setTimeout(() => {
        setError(null)
        setSuccessMsg(null)
        setActionWarning(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, successMsg, actionWarning])

  useEffect(() => {
    if (selectedYear && selectedSection) {
      updateCohort();
      fetchRoutines();
      setSuccessMsg(null);
      setError(null);
    } else {
      setCohort(null);
      setRoutines([]);
      setSelectedRoutineId('');
      setGridSchedules([]);
    }
  }, [selectedYear, selectedSection, allSections])

  useEffect(() => {
    // Fetch schedules if a routine is selected, OR if we have Year/Section but no routines yet
    if (selectedRoutineId || (routines.length === 0 && selectedYear && selectedSection)) {
      fetchSchedules(); setSuccessMsg(null); setError(null)
    }
    else { setGridSchedules([]) }
  }, [selectedRoutineId, routines.length, selectedYear, selectedSection])

  useEffect(() => {
    if (!selectedRoutineId || !cohort?.classSections?.length) {
      setTeacherBaseWorkloadMap({})
      setTeacherBaseWorkloadDetailsMap({})
      return
    }

    fetchTeacherBaseWorkloads(cohort.classSections.map((section) => section.id))
  }, [selectedRoutineId, cohort])

  async function fetchAllCourses() {
    try {
      const data = await apiFetch('/api/v1/admin/courses')
      setAllCourses(data.data || [])
    } catch (err) { console.error('Error fetching courses:', err) }
  }

  async function fetchSections() {
    try {
      setLoading(true)
      const data = await apiFetch('/api/v1/admin/sections/all')
      setAllSections(data.data || [])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  async function fetchTeachers() {
    try {
      const data = await apiFetch('/api/v1/admin/users?role=teacher')
      setAllTeachers(data.data || [])
    } catch (err) { console.error('Error fetching teachers:', err) }
  }

  async function fetchTeacherBaseWorkloads(sectionIds = []) {
    try {
      const scopedSectionIds = Array.isArray(sectionIds) ? sectionIds.filter(Boolean) : []
      const querySuffix = scopedSectionIds.length > 0 ? `?excludeSectionIds=${encodeURIComponent(scopedSectionIds.join(','))}` : ''
      const response = await apiFetch(`/api/v1/admin/teachers/workload${querySuffix}`, {
        cache: false,
        forceRefresh: true,
      })

      const map = {}
      const detailsMap = {}
      for (const row of response.data || []) {
        map[row.teacherId] = row.totalHours || 0
        detailsMap[row.teacherId] = {
          name: row.name || 'Unknown Teacher',
          employeeId: row.employeeId || null,
          totalHours: row.totalHours || 0,
        }
      }
      setTeacherBaseWorkloadMap(map)
      setTeacherBaseWorkloadDetailsMap(detailsMap)
      return { map, detailsMap }
    } catch (err) {
      console.error('Error fetching teacher workloads:', err)
      setTeacherBaseWorkloadMap({})
      setTeacherBaseWorkloadDetailsMap({})
      return { map: {}, detailsMap: {} }
    }
  }

  const buildOverloadedTeachersPreview = (baseWorkloadMap, baseWorkloadDetailsMap, schedules) => {
    const loadMap = { ...(baseWorkloadMap || {}) }
    const teacherMetaMap = { ...(baseWorkloadDetailsMap || {}) }

    for (const block of schedules || []) {
      const teacherId = block.teacherId
      if (!teacherId) continue
      const duration = Number.isFinite(block.duration) && block.duration > 0 ? block.duration : 1
      if (!loadMap[teacherId]) loadMap[teacherId] = 0
      loadMap[teacherId] += duration
    }

    const teacherNameMap = Object.fromEntries(
      allTeachers
        .map((t) => [
          t.teacherDetails?.id,
          {
            name: t.fullName || t.full_name || t.name || t.email || 'Unknown Teacher',
            employeeId: t.teacherDetails?.employeeId || t.teacherDetails?.employee_id || null,
          },
        ])
        .filter(([id]) => Boolean(id))
    )

    return Object.entries(loadMap)
      .filter(([, hours]) => hours > TEACHER_WEEKLY_HOURS_LIMIT)
      .map(([teacherId, hours]) => ({
        teacherId,
        name: teacherMetaMap[teacherId]?.name || teacherNameMap[teacherId]?.name || 'Unknown Teacher',
        employeeId: teacherMetaMap[teacherId]?.employeeId || teacherNameMap[teacherId]?.employeeId || null,
        totalHours: Number(hours.toFixed(2)),
      }))
      .sort((a, b) => b.totalHours - a.totalHours)
  }

  const overloadedTeachersPreview = buildOverloadedTeachersPreview(teacherBaseWorkloadMap, teacherBaseWorkloadDetailsMap, gridSchedules)

  useEffect(() => {
    if (overloadedTeachersPreview.length === 0) {
      setTeacherWorkloadWarning(null)
      return
    }

    const details = overloadedTeachersPreview
      .map((t) => `${t.name}${t.employeeId ? ` (${t.employeeId})` : ''}: ${t.totalHours}h`)
      .join(', ')

    setTeacherWorkloadWarning(`Teacher workload threshold exceeded (max ${TEACHER_WEEKLY_HOURS_LIMIT}h/week): ${details}`)
  }, [overloadedTeachersPreview])

  function updateCohort() {
    const matched = allSections.filter(s => {
      const dbYear = String(s.yearOfStudy || '').toLowerCase()
      const selYear = String(selectedYear || '').toLowerCase()

      const yearMatch = dbYear === selYear || (dbYear.startsWith(selYear[0]) && selYear.length > 0)
      const sectionMatch = String(s.section || '').trim().toUpperCase() === String(selectedSection || '').trim().toUpperCase()

      return yearMatch && sectionMatch
    })

    const key = `Year ${selectedYear}-Sec ${selectedSection}`
    // Determine department for this cohort: if all matched sections share a department, use it.
    const departments = Array.from(new Set(matched.map(s => s.department).filter(Boolean)))
    const cohortDept = departments.length === 1 ? departments[0] : null

    setCohort({
      id: key,
      yearOfStudy: parseInt(selectedYear),
      section: selectedSection,
      label: `Section ${selectedSection} (Year ${selectedYear})`,
      department: cohortDept,
      classSections: matched.map(s => ({
        id: s.id,
        courseId: s.courseId,
        code: s.courses?.code,
        name: s.courses?.name,
        teacherName: s.teacherName || 'Unassigned',
        teachers: s.teachers || [],
        department: s.department
      }))
    })
  }

  async function fetchRoutines() {
    if (!selectedYear || !selectedSection) return
    try {
      setLoading(true)
      const data = await apiFetch(`/api/v1/admin/routines?year=${selectedYear}&section=${selectedSection}`)
      const fetchedRoutines = data.data || []
      setRoutines(fetchedRoutines)

      const activeRoutine = fetchedRoutines.find(r => r.is_active)
      if (activeRoutine) {
        setSelectedRoutineId(activeRoutine.id)
      } else if (fetchedRoutines.length > 0) {
        setSelectedRoutineId(fetchedRoutines[0].id)
      } else {
        setSelectedRoutineId('')
        setGridSchedules([])
      }
    } catch (err) { setError('Failed to load routines') } finally { setLoading(false) }
  }

  async function fetchSchedules() {
    // Only return if we have routines but none is selected
    if (routines.length > 0 && !selectedRoutineId) return
    if (!selectedYear || !selectedSection) return
    const yearNum = parseInt(selectedYear)
    try {
      setLoading(true)
      // If we have a cohort with classSections, use them. 
      // Otherwise, we'll just fetch based on Year/Section (for routines that already have schedules)
      const sectionIds = cohort?.classSections?.map(cs => cs.id).join(',')
      const url = `/api/v1/admin/schedules?year=${yearNum}&section=${selectedSection}${sectionIds ? `&sectionIds=${sectionIds}` : ''}${selectedRoutineId ? `&routineId=${selectedRoutineId}` : ''}`
      const data = await apiFetch(url, {
        cache: false,
        forceRefresh: true,
      })
      const formatted = (data.data || []).map(s => {
        const timeParts = s.timeSlot.split('-')
        const startHour = parseInt(timeParts[0].split(':')[0])
        const endHour = timeParts.length > 1 ? parseInt(timeParts[1].split(':')[0]) : startHour + 1
        const sectionInfo = cohort.classSections.find(c => c.id === s.classSectionId) || {}
        const courseCode = (s.courses?.code || s.course?.code || '').trim().toUpperCase()
        const isSpecial = ['LIB', 'REM', 'LUNCH'].includes(courseCode)
        let specialColor = isSpecial ? (SPECIAL_BLOCKS.find(sb => sb.code === courseCode)?.specialColor || null) : null
        return { tempId: Math.random().toString(36).substr(2, 9), classSectionId: s.classSectionId, courseId: s.courseId, day: s.day, startHour, duration: Math.max(1, endHour - startHour), roomNumber: s.roomNumber, courseCode, courseName: s.courses?.name || s.course?.name, teacherName: sectionInfo.teacherName || (isSpecial ? '—' : 'Unknown'), teachers: sectionInfo.teachers || [], teacherId: s.teacherId || null, isSpecial, specialColor }
      })

      // Deduplicate special blocks (they apply to all sections, so backend returns multiple identical blocks)
      const uniqueFormatted = []
      formatted.forEach(f => {
        if (f.isSpecial) {
          const exists = uniqueFormatted.find(u => u.isSpecial && u.courseId === f.courseId && u.day === f.day && u.startHour === f.startHour)
          if (!exists) uniqueFormatted.push(f)
        } else {
          uniqueFormatted.push(f)
        }
      })
      setGridSchedules(uniqueFormatted)
    } catch (err) { setError('Failed to load existing schedule') } finally { setLoading(false) }
  }

  async function handleCreateRoutine(copySource = null) {
    const name = prompt(`Enter a name for the new routine:`)
    if (!name) return
    if (!cohort) return
    try {
      setLoading(true)
      const payload = {
        name,
        department: 'GLOBAL',
        year: cohort.yearOfStudy,
        section: cohort.section,
        sourceRoutineId: copySource
      }
      const data = await apiFetch('/api/v1/admin/routines', { method: 'POST', body: JSON.stringify(payload) })
      await fetchRoutines()
      setSelectedRoutineId(data.data.id)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  async function handleDeleteRoutine() {
    if (!selectedRoutineId) return
    const routine = routines.find(r => r.id === selectedRoutineId)
    if (!routine) return
    if (routine.is_active) {
      setError('Cannot delete the active routine. Please activate another routine first.')
      return
    }
    if (!window.confirm(`Are you sure you want to delete the routine "${routine.name}"? This will permanently delete all its schedule blocks.`)) return

    try {
      setLoading(true)
      await apiFetch(`/api/v1/admin/routines/${selectedRoutineId}`, { method: 'DELETE' })
      setSuccessMsg('Routine deleted successfully.')
      setTimeout(() => setSuccessMsg(null), 3000)
      await fetchRoutines()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  async function handleActivateRoutine() {
    if (!selectedRoutineId) return
    try {
      setLoading(true)
      await apiFetch(`/api/v1/admin/routines/${selectedRoutineId}/activate`, { method: 'PUT' })
      setSuccessMsg('Routine is now active for students and teachers!')
      setTimeout(() => setSuccessMsg(null), 4000)
      await fetchRoutines()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  async function handleSave() {
    if (!cohort) return
    if (!cohort || !selectedRoutineId) return
    const freshWorkloadContext = await fetchTeacherBaseWorkloads(cohort.classSections.map((section) => section.id))
    const freshOverloadedTeachers = buildOverloadedTeachersPreview(freshWorkloadContext.map, freshWorkloadContext.detailsMap, gridSchedules)

    if (freshOverloadedTeachers.length > 0) {
      const details = freshOverloadedTeachers
        .map((t) => `${t.name}${t.employeeId ? ` (${t.employeeId})` : ''}: ${t.totalHours}h`)
        .join(', ')
      setTeacherWorkloadWarning(`Teacher workload threshold exceeded (max ${TEACHER_WEEKLY_HOURS_LIMIT}h/week): ${details}`)
      setError(`Cannot save. Teacher workload limit exceeded (max ${TEACHER_WEEKLY_HOURS_LIMIT}h/week): ${details}`)
      return
    }
    try {
      setSaving(true); setError(null)
      const sectionIds = cohort.classSections.map(cs => cs.id)
      let payload = []
      const missingRoomEntries = []

      const normalizeRoomValue = (value) => String(value || '').trim()
      const isValidRoomValue = (value) => {
        const normalized = normalizeRoomValue(value)
        return normalized.length > 0 && normalized.toLowerCase() !== 'tba'
      }

      gridSchedules.forEach(s => {
        const roomToSave = s.isSpecial ? normalizeRoomValue(s.roomNumber) : normalizeRoomValue(s.roomNumber || defaultRoom)
        if (s.isSpecial) {
          // Special blocks map to ALL sections in the cohort
          cohort.classSections.forEach(cs => {
            payload.push({
              class_section_id: cs.id, course_id: s.courseId, day: s.day,
              time_slot: `${s.startHour}:00-${s.startHour + s.duration}:00`,
              room_number: roomToSave
            })
          })
        } else if (s.classSectionId || s.courseId) {
          // Ensure teacherId is a valid UUID or null (never a name string)
          const validTeacherId = (typeof s.teacherId === 'string' && s.teacherId.length > 20) ? s.teacherId : null;
          payload.push({
            class_section_id: s.classSectionId || null,
            course_id: s.courseId,
            day: s.day,
            time_slot: `${s.startHour}:00-${s.startHour + s.duration}:00`,
            room_number: roomToSave,
            teacher_id: validTeacherId
          })

          if (!isValidRoomValue(roomToSave)) {
            missingRoomEntries.push(`${s.courseCode || 'Course'} on ${s.day} ${s.startHour}:00-${s.startHour + s.duration}:00`)
          }
        }
      })

      if (missingRoomEntries.length > 0) {
        setError(`Cannot save. Assign room numbers for all lectures/labs before saving: ${missingRoomEntries.join(', ')}`)
        return
      }

      const body = {
        sectionIds,
        routineId: selectedRoutineId,
        schedules: payload,
        year: selectedYear,
        section: selectedSection,
        adminDepartment: (cohort && cohort.department) ? cohort.department : adminDepartment
      }
      await apiFetch('/api/v1/admin/schedules/replace', { method: 'PUT', body: JSON.stringify(body) })
      await fetchSchedules()
      setSuccessMsg('Schedule saved successfully!')
      setTimeout(() => setSuccessMsg(null), 3000)
    } catch (err) {
      if (err?.message?.includes('TEACHER_WORKLOAD_EXCEEDED')) {
        setError(err.message || 'Cannot save. Teacher workload threshold exceeded.')
      } else {
        setError(err.message)
      }
    } finally { setSaving(false) }
  }

  function handleRemove(tempId) {
    setGridSchedules(prev => prev.filter(s => s.tempId !== tempId))
    setEditingBlock(null)
  }

  function handleClearGrid() {
    if (!window.confirm('Are you sure you want to clear the entire grid? This will remove all blocks from the current view (you still need to save to persist changes).')) return
    setGridSchedules([])
  }

  const resolveYearFromSemester = (semester) => {
    const semNum = parseInt(semester, 10)
    if (!Number.isFinite(semNum) || semNum <= 0) return null
    return Math.ceil(semNum / 2)
  }

  // Build a courseId -> classSectionId map from the cohort
  const cohortCourseMap = {}
  if (cohort) {
    cohort.classSections.forEach(cs => { cohortCourseMap[cs.courseId] = cs })
  }

  const yearNumber = selectedYear ? parseInt(selectedYear, 10) : null
  const yearCourses = (allCourses || []).filter((c) => {
    if (!yearNumber) return false
    const courseYear = resolveYearFromSemester(c.semester)
    return courseYear === yearNumber
  })

  // Build palette items: year courses + special blocks
  const paletteItems = [
    ...yearCourses
      .filter(c => !['LIB', 'REM', 'LUNCH'].includes((c.code || '').trim().toUpperCase()))
      .map(c => {
        const cohortInfo = cohortCourseMap[c.id]
        return {
          id: cohortInfo?.id || `course-${c.id}`,
          courseId: c.id,
          code: c.code,
          name: c.name,
          teacherName: cohortInfo?.teacherName || '',
          teachers: cohortInfo?.teachers || [],
          isSpecial: false,
          isCohortCourse: !!cohortInfo,
          classSectionId: cohortInfo?.id || null,
        }
      }),
    ...SPECIAL_BLOCKS
  ]

  const searchValue = courseSearch.trim().toLowerCase()
  const filteredPaletteItems = paletteItems.filter((item) => {
    if (item.isSpecial) return true
    if (!searchValue) return true
    const haystack = `${item.code || ''} ${item.name || ''}`.toLowerCase()
    return haystack.includes(searchValue)
  })

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

  const checkWorkloadExceeded = (teacherId, expectedDuration, ignoreTempId = null) => {
    if (!teacherId || typeof teacherId !== 'string' || teacherId.length < 20) return null;
    
    let currentWorkload = teacherBaseWorkloadMap[teacherId] || 0;
    
    for (const block of gridSchedules) {
      if (block.tempId === ignoreTempId) continue;
      if (block.teacherId === teacherId) {
        currentWorkload += (Number.isFinite(block.duration) && block.duration > 0 ? block.duration : 1);
      }
    }
    
    if (currentWorkload + expectedDuration > TEACHER_WEEKLY_HOURS_LIMIT) {
      const teacherObj = teacherBaseWorkloadDetailsMap[teacherId] || null;
      const fallbackTeacherObj = allTeachers.find(t => t.teacherDetails?.id === teacherId);
      let tName = teacherObj?.name || (fallbackTeacherObj ? (fallbackTeacherObj.fullName || fallbackTeacherObj.full_name || fallbackTeacherObj.name) : null);
      if (!tName) {
        const fallbackObj = cohort?.classSections?.find(cs => cs.teachers?.some(t => t.id === teacherId));
        if (fallbackObj) {
          tName = fallbackObj.teachers.find(t => t.id === teacherId)?.name;
        }
      }
      return { exceeded: true, name: tName || 'Unknown Teacher', limit: TEACHER_WEEKLY_HOURS_LIMIT };
    }
    
    return null;
  };

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

      const proposedTeacherId = (item.teachers && item.teachers.length === 1 && typeof item.teachers[0].id === 'string' && item.teachers[0].id.length > 20) ? item.teachers[0].id : null;

      if (source === 'palette') {
        if (proposedTeacherId) {
          const workloadCheck = checkWorkloadExceeded(proposedTeacherId, 1);
          if (workloadCheck) {
            setActionWarning(`Cannot assign: ${workloadCheck.name}'s workload exceeds ${workloadCheck.limit}h/week limit.`);
            return;
          }
        }
        // Dropping is allowed for all items in the palette now
        setGridSchedules(prev => [...prev, {
          tempId: Math.random().toString(36).substr(2, 9),
          classSectionId: item.classSectionId || null,
          courseId: item.courseId, day: dropDay, startHour: dropHour, duration: 1,
          roomNumber: defaultRoom || '', courseCode: item.code, courseName: item.name,
          teacherName: item.teacherName || 'Unassigned',
          teachers: item.teachers || [],
          teacherId: proposedTeacherId,
          isSpecial: !!item.isSpecial,
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
      // Check workload
      const schedule = gridSchedules.find(s => s.tempId === resizing.tempId);
      if (schedule && schedule.teacherId) {
        const workloadCheck = checkWorkloadExceeded(schedule.teacherId, newDuration, resizing.tempId);
        if (workloadCheck) {
          if (!actionWarning) setActionWarning(`Cannot resize: ${workloadCheck.name}'s workload exceeds ${workloadCheck.limit}h/week limit.`);
          return;
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
      <div className="flex flex-col gap-5 w-full max-w-[1500px] mx-auto relative" style={{ height: 'calc(100vh - 100px)' }}>

        {/* Toast Notifications */}
        <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
          {(teacherWorkloadWarning || actionWarning) && (
            <div
              className="animate-slide-in px-4 py-3 rounded-2xl text-sm font-bold shadow-2xl backdrop-blur-md flex items-center gap-3 pointer-events-auto border"
              style={{ backgroundColor: '#FFCB08', color: '#000000', borderColor: '#000000' }}
            >
              <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01" /></svg>
              {actionWarning || teacherWorkloadWarning}
            </div>
          )}
          {error && (
            <div className="animate-slide-in px-4 py-3 rounded-2xl bg-red-500/90 dark:bg-red-600/90 text-white text-sm font-bold shadow-2xl backdrop-blur-md flex items-center gap-3 pointer-events-auto border border-white/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
            </div>
          )}
          {successMsg && (
            <div className="animate-slide-in px-4 py-3 rounded-2xl bg-green-500/90 dark:bg-green-600/90 text-white text-sm font-bold shadow-2xl backdrop-blur-md flex items-center gap-3 pointer-events-auto border border-white/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
              {successMsg}
            </div>
          )}
        </div>

        {/* Centered modal popout with bokeh backdrop */}
        {modalOpen && (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
            <div className="relative z-50 w-[min(92%,900px)] max-h-[85vh] overflow-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 m-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{modalTitle}</h3>
                </div>
                <button onClick={closeModal} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 ml-4">✕</button>
              </div>
              <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">
                {modalBody}
              </div>
            </div>
          </div>
        )}

        {/* Zone 1: Top Control Bar */}
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-3 flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center shrink-0 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            {adminDepartment && (
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Your Dept</label>
                <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700">
                  {adminDepartment}
                </div>
              </div>
            )}
            <div className="flex flex-col">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Year</label>
              <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white min-w-[100px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Year</option>
                {YEARS.map(y => <option key={y} value={y}>{y} Year</option>)}
              </select>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Section</label>
              <select value={selectedSection} onChange={(e) => setSelectedSection(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white min-w-[100px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="" disabled>Select Section</option>
                {SECTIONS.map(s => <option key={s} value={s}>Section {s}</option>)}
              </select>
            </div>

            {cohort && (
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Courses Found</label>
                <div className="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-bold border border-blue-100 dark:border-blue-800/50">
                  {cohort.classSections.length} Courses
                </div>
              </div>
            )}

            {cohort && (
              <div className="flex flex-col">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Routine</label>
                <div className="flex items-center gap-2">
                  <select value={selectedRoutineId} onChange={(e) => setSelectedRoutineId(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium text-gray-900 dark:text-white min-w-[160px] focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="" disabled>Select Routine</option>
                    {routines.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} {r.department !== 'GLOBAL' ? `(${r.department})` : ''} {r.is_active ? '✓ Active' : ''}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => handleCreateRoutine(null)} className="px-2.5 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium transition-colors" title="Create Fresh Routine">New</button>
                  <button onClick={() => handleCreateRoutine(selectedRoutineId)} disabled={!selectedRoutineId} className="px-2.5 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium transition-colors disabled:opacity-50" title="Duplicate Current Routine">Copy</button>
                  {routines.length === 0 && gridSchedules.length > 0 && (
                    <button onClick={() => handleCreateRoutine('original')} className="px-2.5 py-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-800/60 text-blue-800 dark:text-blue-300 text-xs font-medium transition-colors" title="Copy from Legacy Schedules">Copy Original</button>
                  )}
                  {selectedRoutineId && !routines.find(r => r.id === selectedRoutineId)?.is_active && (
                    <button onClick={handleDeleteRoutine} className="px-2.5 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 text-xs font-medium transition-colors" title="Delete Routine">Delete</button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col ml-2">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Default Room</label>
              <input type="text" placeholder="e.g. ICT304" value={defaultRoom} onChange={(e) => setDefaultRoom(e.target.value)} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white w-[110px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs text-gray-400 animate-pulse">Syncing changes...</span>}
            {selectedRoutineId && (
              <button
                onClick={handleActivateRoutine}
                disabled={routines.find(r => r.id === selectedRoutineId)?.is_active || loading || saving}
                className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${routines.find(r => r.id === selectedRoutineId)?.is_active ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 cursor-default' : 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/60'}`}
              >
                {routines.find(r => r.id === selectedRoutineId)?.is_active ? 'Active Routine' : 'Set as Active'}
              </button>
            )}
            <button onClick={handleSave} disabled={!selectedRoutineId || saving || loading || overloadedTeachersPreview.length > 0} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? 'Saving...' : 'Save Schedule'}
            </button>
            <button onClick={handleClearGrid} disabled={gridSchedules.length === 0} className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium transition-colors">
              Clear Grid
            </button>
          </div>
        </div>

        {/* Main builder area */}
        <div className="flex gap-4 flex-1 min-h-0">

          {/* Zone 2: Course Palette */}
          <div className="w-56 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl flex flex-col shrink-0 overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Course Palette</h3>
              <p className="text-xs text-gray-500 mt-1">Drag onto the grid</p>
              <input
                type="text"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder="Search course"
                className="mt-3 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="p-3 overflow-y-auto custom-scrollbar flex-1 space-y-2">
              {/* Special blocks first */}
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold px-1 pt-1">Common</p>
              {SPECIAL_BLOCKS.map(sb => (
                <div key={sb.id} draggable onDragStart={(e) => handleDragStart(e, sb, 'palette')} className={`p-2.5 rounded-xl border-2 cursor-grab active:cursor-grabbing transition-shadow ${sb.specialColor}`}>
                  <div className="font-bold text-xs">{sb.code}</div>
                  <div className="text-[10px] opacity-80">{sb.name}</div>
                </div>
              ))}

              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold px-1 pt-2">Year Courses</p>
              {filteredPaletteItems.filter(p => !p.isSpecial).map(item => (
                <div key={item.id} draggable onDragStart={(e) => handleDragStart(e, item, 'palette')} className={`p-2.5 rounded-xl border transition-shadow cursor-grab active:cursor-grabbing hover:shadow-md ${item.isCohortCourse ? getCourseColor(item.courseId) : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-xs">{item.code}</div>
                    {item.isCohortCourse ? <span className="text-[8px] bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded font-bold uppercase">Assigned</span> : <span className="text-[8px] bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold uppercase">Available</span>}
                  </div>
                  <div className="text-[10px] opacity-90 mt-0.5 leading-tight line-clamp-1">{item.name}</div>
                  {item.teacherName && <div className="text-[10px] mt-1 opacity-70 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    {item.teacherName}
                  </div>}
                </div>
              ))}
              {allCourses.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Loading courses...</p>}
              {yearNumber && filteredPaletteItems.filter(p => !p.isSpecial).length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No courses match this search.</p>
              )}
              {!yearNumber && (
                <p className="text-xs text-gray-400 text-center py-4">Select a year to see courses.</p>
              )}
            </div>
          </div>

          {/* Zone 3: Horizontal Time Grid — days as rows, hours as columns */}
          <div className="flex-1 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-auto custom-scrollbar relative select-none">
            {loading && <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 z-50"><SpiralLoader /></div>}

            <div className="min-w-[900px] min-h-full flex flex-col">
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
                <div key={day} className="flex-1 flex border-b border-gray-100 dark:border-gray-800 last:border-b-0" style={{ minHeight: '90px' }}>
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
                      const leftPct = ((schedule.startHour - 9) / TOTAL_HOURS) * 100
                      const widthPct = (schedule.duration / TOTAL_HOURS) * 100
                      const colorClass = schedule.isSpecial ? (schedule.specialColor || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 border-dashed') : getCourseColor(schedule.courseId)

                      return (
                        <div key={schedule.tempId} draggable onDragStart={(e) => handleDragStart(e, schedule, 'grid')}
                          className={`absolute top-2 bottom-2 rounded-lg border overflow-visible cursor-grab active:cursor-grabbing ${schedule.isSpecial ? '' : 'transition-all'} ${colorClass} ${resizing?.tempId === schedule.tempId ? 'z-40 opacity-90' : 'z-20 hover:z-30'}`}
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
                                {schedule.isSpecial ? (
                                  <div>
                                    <label className="text-xs font-medium text-gray-500 block mb-1">Room</label>
                                    <div className="text-sm text-gray-600 dark:text-gray-400 px-2.5 py-1.5 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 italic">Not applicable for special blocks</div>
                                  </div>
                                ) : (
                                  <div>
                                    <label className="text-xs font-medium text-gray-500 block mb-1">Room</label>
                                    <input type="text" value={schedule.roomNumber} onChange={(e) => setGridSchedules(prev => prev.map(s => s.tempId === schedule.tempId ? { ...s, roomNumber: e.target.value } : s))}
                                      className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:border-blue-500" placeholder="e.g. ICT312" />
                                  </div>
                                )}
                                {!schedule.isSpecial && (
                                  <div>
                                    <label className="text-xs font-medium text-gray-500 block mb-1">Teacher</label>
                                    {(schedule.teachers && schedule.teachers.length > 0) ? (
                                      <select
                                        value={schedule.teacherId || ''}
                                        onChange={(e) => {
                                          const tId = e.target.value;
                                          const workloadCheck = checkWorkloadExceeded(tId, schedule.duration, schedule.tempId);
                                          if (workloadCheck) {
                                            setActionWarning(`Cannot assign: ${workloadCheck.name}'s workload exceeds ${workloadCheck.limit}h/week limit.`);
                                            return;
                                          }
                                          const tObj = schedule.teachers.find(t => t.id === tId);
                                          setGridSchedules(prev => prev.map(s => s.tempId === schedule.tempId ? { ...s, teacherId: tId, teacherName: tObj?.name || '—' } : s));
                                        }}
                                        className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:border-blue-500"
                                      >
                                        <option value="" disabled>Select a teacher</option>
                                        {schedule.teachers.map(t => (
                                          <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <select
                                        value={schedule.teacherId || ''}
                                        onChange={(e) => {
                                          const tId = e.target.value;
                                          if (tId) {
                                            const workloadCheck = checkWorkloadExceeded(tId, schedule.duration, schedule.tempId);
                                            if (workloadCheck) {
                                              setActionWarning(`Cannot assign: ${workloadCheck.name}'s workload exceeds ${workloadCheck.limit}h/week limit.`);
                                              return;
                                            }
                                          }
                                          const tObj = allTeachers.find(t => t.teacherDetails?.id === tId);
                                          const tName = tObj ? (tObj.fullName || tObj.full_name || tObj.name) : '—';
                                          setGridSchedules(prev => prev.map(s => s.tempId === schedule.tempId ? { ...s, teacherId: tId, teacherName: tName } : s));
                                        }}
                                        className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:border-blue-500"
                                      >
                                        <option value="">No teacher assigned</option>
                                        {allTeachers.map(t => (
                                          <option key={t.id} value={t.teacherDetails?.id}>{t.fullName || t.full_name || t.name || t.email}</option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                )}
                                <div>
                                  <label className="text-xs font-medium text-gray-500 block mb-1">Time</label>
                                  <div className="text-sm text-gray-600 dark:text-gray-400">{schedule.startHour}:00 – {schedule.startHour + schedule.duration}:00</div>
                                </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemove(schedule.tempId) }}
                                className="w-full mt-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold border border-red-100 dark:border-red-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                Remove Entry
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
      </div>
    </AppLayout>
  )
}