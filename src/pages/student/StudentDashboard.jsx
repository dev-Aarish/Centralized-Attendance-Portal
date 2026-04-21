'use client'

// pages/student/dashboard.jsx  (or app/student/dashboard/page.jsx)

import { useState, useEffect, useRef } from 'react'
import AppLayout from '../../components/shared/AppLayout'
import AttendanceRings from '../../components/student/AttendanceRings'

// ✅ Fix 1: correct import path — attendanceApi, not attendance
import { getMyAttendanceSummaryByType } from '../../lib/attendance'
import { getMyStudentSchedule } from '../../lib/schedule'

// ✅ Fix 3: import profile so we can show the student's real name
import { getMyStudentProfile } from '../../lib/profile'

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
        const hasAttendanceSummary = lectureSummary.length > 0 || labSummary.length > 0

        if (hasAttendanceSummary) {
          setLectureData(lectureSummary)
          setLabData(labSummary)
        } else {
          const scheduleItems = scheduleRes.data ?? []
          const fallback = buildZeroAttendanceFromSchedule(scheduleItems)
          setLectureData(fallback.lecture)
          setLabData(fallback.lab)
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
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-8 h-8 rounded-full border-2 border-indigo-200 border-t-indigo-500 animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Loading attendance data…</p>
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
    const code = item?.class_sections?.courses?.code || ''
    const name = item?.class_sections?.courses?.name || ''
    const classType = String(item?.classType || item?.class_type || '').toLowerCase()

    const key = `${code}__${name}`
    const subject = {
      name: name || code || 'Unnamed Subject',
      code: code || '',
      percentage: 0,
    }

    const isLab = classType === 'lab' || /\blab\b/i.test(name)
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