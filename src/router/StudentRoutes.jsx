import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoadingScreen from '../components/shared/LoadingScreen'

const StudentDashboard = lazy(() => import('../pages/student/StudentDashboard'))
const StudentSchedule = lazy(() => import('../pages/student/StudentSchedule'))
const StudentAssignments = lazy(() => import('../pages/student/StudentAssignments'))
const StudentNotes = lazy(() => import('../pages/student/StudentNotes'))
const StudentLectureDetails = lazy(() => import('../pages/student/StudentLectureDetails'))
const StudentLabDetails = lazy(() => import('../pages/student/StudentLabDetails'))
const StudentAttendanceHeatmap = lazy(() => import('../pages/student/StudentAttendanceHeatmap'))
const StudentContacts = lazy(() => import('../pages/student/StudentContacts'))
const StudentCanISkip = lazy(() => import('../pages/student/StudentCanISkip'))
const StudentLeaves = lazy(() => import('../pages/student/StudentLeaves'))

export default function StudentRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<StudentDashboard />} />
        <Route path="schedule" element={<StudentSchedule />} />
        <Route path="leaves" element={<StudentLeaves />} />
        <Route path="assignments" element={<StudentAssignments />} />
        <Route path="notes" element={<StudentNotes />} />
        <Route path="lectures" element={<StudentLectureDetails />} />
        <Route path="labs" element={<StudentLabDetails />} />
        <Route path="attendance/heatmap/:type/:courseCode" element={<StudentAttendanceHeatmap />} />
        <Route path="contacts" element={<StudentContacts />} />
        <Route path="can-i-skip" element={<StudentCanISkip />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}
