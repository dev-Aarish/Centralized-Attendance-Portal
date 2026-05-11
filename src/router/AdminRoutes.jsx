import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoadingScreen from '../components/shared/LoadingScreen'

const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'))
const AdminDepartments = lazy(() => import('../pages/admin/AdminDepartments'))
const AdminCourses = lazy(() => import('../pages/admin/AdminCourses'))
const AdminUsers = lazy(() => import('../pages/admin/AdminUsers'))
const AdminAttendance = lazy(() => import('../pages/admin/AdminAttendance'))
const AdminAlerts = lazy(() => import('../pages/admin/AdminAlerts'))
const AdminSchedule = lazy(() => import('../pages/admin/AdminSchedule'))
const AdminAssignCourses = lazy(() => import('../pages/admin/AdminAssignCourses'))

export default function AdminRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="departments" element={<AdminDepartments />} />
        <Route path="courses" element={<AdminCourses />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="attendance" element={<AdminAttendance />} />
        <Route path="alerts" element={<AdminAlerts />} />
        <Route path="schedule" element={<AdminSchedule />} />
        <Route path="assign-courses" element={<AdminAssignCourses />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}