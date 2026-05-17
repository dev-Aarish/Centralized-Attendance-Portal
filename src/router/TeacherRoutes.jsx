import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoadingScreen from '../components/shared/LoadingScreen'

const TeacherDashboard = lazy(() => import('../pages/teacher/TeacherDashboard'))
const TeacherCourses = lazy(() => import('../pages/teacher/TeacherCourses'))
const TeacherAttendance = lazy(() => import('../pages/teacher/TeacherAttendance'))
const TeacherAssignments = lazy(() => import('../pages/teacher/TeacherAssignments'))
const TeacherQuestionSelector = lazy(() => import('../pages/teacher/TeacherQuestionSelector'))
const TeacherNotes = lazy(() => import('../pages/teacher/TeacherNotes'))
const TeacherSchedule = lazy(() => import('../pages/teacher/TeacherSchedule'))
const TeacherLeaves = lazy(() => import('../pages/teacher/TeacherLeaves'))
const TeacherPerformance = lazy(() => import('../pages/teacher/TeacherPerformance'))

export default function TeacherRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<TeacherDashboard />} />
        <Route path="courses" element={<TeacherCourses />} />
        <Route path="attendance" element={<TeacherAttendance />} />
        <Route path="leaves" element={<TeacherLeaves />} />
        <Route path="assignments" element={<TeacherAssignments />} />
        <Route path="assignments/questions" element={<TeacherQuestionSelector />} />
        <Route path="notes" element={<TeacherNotes />} />
        <Route path="schedule" element={<TeacherSchedule />} />
        <Route path="performance" element={<TeacherPerformance />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}