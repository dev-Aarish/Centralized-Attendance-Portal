import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoadingScreen from '../components/shared/LoadingScreen'

const TeacherDashboard = lazy(() => import('../pages/teacher/TeacherDashboard'))
const TeacherCourses = lazy(() => import('../pages/teacher/TeacherCourses'))
const TeacherAttendance = lazy(() => import('../pages/teacher/TeacherAttendance'))
const TeacherAssignments = lazy(() => import('../pages/teacher/TeacherAssignments'))
const TeacherNotes = lazy(() => import('../pages/teacher/TeacherNotes'))
const TeacherSchedule = lazy(() => import('../pages/teacher/TeacherSchedule'))

export default function TeacherRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<TeacherDashboard />} />
        <Route path="courses" element={<TeacherCourses />} />
        <Route path="attendance" element={<TeacherAttendance />} />
        <Route path="assignments" element={<TeacherAssignments />} />
        <Route path="notes" element={<TeacherNotes />} />
        <Route path="schedule" element={<TeacherSchedule />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}