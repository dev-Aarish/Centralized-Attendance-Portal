import { Routes, Route, Navigate } from 'react-router-dom'

import TeacherDashboard from '../pages/teacher/TeacherDashboard'
import TeacherCourses from '../pages/teacher/TeacherCourses'
import TeacherAttendance from '../pages/teacher/TeacherAttendance'
import TeacherAssignments from '../pages/teacher/TeacherAssignments'
import TeacherNotes from '../pages/teacher/TeacherNotes'
import TeacherSchedule from '../pages/teacher/TeacherSchedule'

export default function TeacherRoutes() {
  return (
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
  )
}