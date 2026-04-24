'use client'

// pages/student/dashboard.jsx  (or app/student/dashboard/page.jsx)

import { useState, useEffect, useRef } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import AttendanceRings from '../../components/student/AttendanceRings'
import SpiralLoader from '../../components/shared/Loader'

// ✅ Fix 1: correct import path — attendanceApi, not attendance
import { getMyAttendanceSummaryByType } from '../../lib/attendance'
import { getMyStudentSchedule } from '../../lib/schedule'

// ✅ Fix 3: import profile so we can show the student's real name
import { getMyStudentProfile } from '../../lib/profile'

// Helper to link Lab to Lecture by name (Fuzzy matching)
function isMatchingLecture(lectureName, labName) {
  const norm = (s) => (s || '').toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace('lab', '')
    .trim()
  
  const nl = norm(lectureName)
  const nb = norm(labName)
  
  // Direct match or one contains the other
  return nl === nb || (nl.length > 5 && nb.includes(nl)) || (nb.length > 5 && nl.includes(nb))
}

export default function StudentDashboard() {
  const [lectureData, setLectureData] = useState([])
  const [labData, setLabData] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // ✅ Fix 2: error is now actually set in the catch block
  const [error, setError] = useState(null)

  // ✅ Fix 5: AbortController so we don't set state on an unmounted component
  const abortRef = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    abortRef.current = controller

    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        const [profileRes, lectureRes, labRes, scheduleRes] = await Promise.all([
          getMyStudentProfile(),
          getMyAttendanceSummaryByType('lecture'),
          getMyAttendanceSummaryByType('lab'),
          getMyStudentSchedule(),
        ])

        if (controller.signal.aborted) return

        // Surface per-fetch errors as warnings, not hard failures
        if (profileRes.error) console.warn('Profile fetch:', profileRes.error)
        if (lectureRes.error) console.warn('Lecture fetch:', lectureRes.error)
        if (labRes.error) console.warn('Lab fetch:', labRes.error)
        if (scheduleRes.error) console.warn('Schedule fetch:', scheduleRes.error)

        const lectureSummary = lectureRes.data ?? []
        const labSummary = labRes.data ?? []
        const scheduleItems = scheduleRes.data ?? []

        // Always build the base lists from the schedule.
        // This ensures all courses are shown and properly categorized into lecture/lab.
        const baseFromSchedule = buildZeroAttendanceFromSchedule(scheduleItems)

        // Convert attendance summaries into maps for quick lookup
        const lectureMap = new Map(lectureSummary.map(s => [s.code, s.percentage]))
        const labMap = new Map(labSummary.map(s => [s.code, s.percentage]))

        // Merge actual percentages into the base schedule items
        const finalLectureData = baseFromSchedule.lecture.map(subject => ({
          ...subject,
          percentage: lectureMap.has(subject.code) ? lectureMap.get(subject.code) : 0
        }))

        const finalLabData = baseFromSchedule.lab.map(subject => {
          const percentage = labMap.has(subject.code) ? labMap.get(subject.code) : 0
          
          // Check for matching lecture
          const matchingLecture = finalLectureData.find(l => isMatchingLecture(l.name, subject.name))
          const hasMatchingLecture = !!matchingLecture
          const isEligibleByLecture = matchingLecture ? matchingLecture.percentage >= 75 : false

          return {
            ...subject,
            percentage,
            hasMatchingLecture,
            isEligibleByLecture
          }
        })

        // Schedule is the source of truth for what courses belong to this student.
        // Only fall back to attendance summaries when schedule data is unavailable.
        if (scheduleItems.length > 0) {
          setLectureData(finalLectureData)
          setLabData(finalLabData)
        } else {
          setLectureData(lectureSummary)
          setLabData(labSummary)
        }

        setProfile(profileRes.data ?? null)
      } catch (err) {
        if (controller.signal.aborted) return
        // ✅ Fix 2: actually call setError so the error UI renders
        setError(err?.message ?? 'Failed to load attendance data.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    fetchData()

    // Cleanup: abort in-flight requests when component unmounts
    return () => controller.abort()
  }, [])

  const hasData = lectureData.length > 0 || labData.length > 0

  // Derive display name — fall back gracefully if profile hasn't loaded
  const firstName = profile
    ? profile.profiles?.full_name?.split(' ')[0] ?? 'Student'
    : 'Student'

  return (
    <AppLayout title="Student Dashboard">
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-8">

        {/* Header card — ✅ Fix 3: shows real name */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-800 mb-1">
            Welcome back, {firstName}!
          </h2>
          <p className="text-gray-500 text-sm">
            {profile
              ? `${profile.department} · Year ${profile.year_of_study}${profile.section ? ` · Section ${profile.section}` : ''} · ${profile.roll_number}`
              : 'Here is an overview of your current attendance status across all subjects.'
            }
          </p>
        </div>

        {/* ✅ Fix 4: all states now use consistent Tailwind classes */}

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <SpiralLoader />
            <p className="text-sm text-slate-400 font-medium tracking-wide">Loading attendance data…</p>
          </div>
        )}

        {!loading && error && (
          <div className="py-10 px-6 text-center rounded-2xl bg-red-50 border border-red-100">
            <p className="text-sm font-medium text-red-500">{error}</p>
            <p className="text-xs text-red-400 mt-1">Please refresh the page or try again later.</p>
          </div>
        )}

        {!loading && !error && !hasData && (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-slate-600">No attendance data yet.</p>
            <p className="text-xs text-slate-400 mt-1">
              Records will appear here once your instructors start marking sessions.
            </p>
          </div>
        )}

        {!loading && !error && hasData && (
          <div className="flex flex-col gap-8 items-start">
            {lectureData.length > 0 && (
              <AttendanceRings
                title="Lecture Attendance"
                subjects={lectureData}
                detailsPath="/lectures"
              />
            )}
            {labData.length > 0 && (
              <AttendanceRings
                title="Lab Attendance"
                subjects={labData}
                detailsPath="/labs"
                showIneligible={true}
              />
            )}
          </div>
        )}

      </div>
    </AppLayout>
  )
}

function buildZeroAttendanceFromSchedule(scheduleItems) {
  const lectureMap = new Map()
  const labMap = new Map()

  for (const item of scheduleItems || []) {
    // Highly defensive resolution of the course object
    const rawCourse = item?.class_sections?.courses || item?.courses
    const courseObj = Array.isArray(rawCourse) ? rawCourse[0] : rawCourse
    
    const code = (courseObj?.code || '').trim()
    const name = (courseObj?.name || '').trim()
    
    // Skip special blocks that don't have attendance
    if (['LIB', 'REM', 'LUNCH'].includes(code.toUpperCase())) continue

    const courseType = (courseObj?.type || '').toLowerCase().trim()
    const classType = String(item?.class_type || item?.classType || '').toLowerCase().trim()
    const key = `${code}__${name}`
    const subject = {
      name: name || code || 'Unnamed Subject',
      code: code || '',
      percentage: 0,
    }

    // Comprehensive Lab Detection
    const isLab = 
      courseType === 'lab' || 
      classType === 'lab' || 
      code.toUpperCase().endsWith('L') ||
      code.toUpperCase().includes('LAB') ||
      /\blab\b/i.test(name)
    
    if (isLab) {
      if (!labMap.has(key)) labMap.set(key, subject)
    } else {
      if (!lectureMap.has(key)) lectureMap.set(key, subject)
    }
  }

  return {
    lecture: Array.from(lectureMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    lab: Array.from(labMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
  }
}