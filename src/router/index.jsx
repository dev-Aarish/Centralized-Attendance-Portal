import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { apiFetch } from '../lib/api'

import AuthPage from '../pages/AuthPage'
import OnboardingPage from '../pages/OnboardingPage'
import LoadingScreen from '../components/shared/LoadingScreen'
import ResetPassword from '../pages/ResetPassword'

import StudentRoutes from './StudentRoutes'
import TeacherRoutes from './TeacherRoutes'
import AdminRoutes from './AdminRoutes'

function RoleRouter() {
  const { user, role, requiresOnboarding, loading } = useAuth()
  const prefetchedRef = useRef(false)

  useEffect(() => {
    if (loading || !user || !role || requiresOnboarding) return
    if (prefetchedRef.current) return
    prefetchedRef.current = true

    const cacheOptions = {
      cache: true,
      cacheTtlMs: 2 * 60 * 1000,
      staleWindowMs: 5 * 60 * 1000,
      staleWhileRevalidate: true,
    }

    const requests = []

    if (role === 'student') {
      requests.push(
        apiFetch('/api/v1/profiles/student', cacheOptions),
        apiFetch('/api/v1/attendance/dashboard-summary', cacheOptions),
      )
    }

    if (role === 'teacher') {
      requests.push(
        apiFetch('/api/v1/profiles/assigned-sections', cacheOptions),
        apiFetch('/api/v1/schedules/today?role=teacher', cacheOptions),
        apiFetch('/api/v1/profiles/teacher/stats', cacheOptions),
      )
    }

    if (role === 'admin') {
      requests.push(
        apiFetch('/api/v1/admin/stats', cacheOptions),
        apiFetch('/api/v1/admin/sections/all', cacheOptions),
        apiFetch('/api/v1/admin/courses', cacheOptions),
      )
    }

    Promise.allSettled(requests).catch(() => null)
  }, [loading, user, role, requiresOnboarding])

  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/auth" replace />
  if (requiresOnboarding) return <Navigate to="/onboarding" replace />
  if (!role) return <Navigate to="/onboarding" replace />
  if (role === 'student') return <StudentRoutes />
  if (role === 'teacher') return <TeacherRoutes />
  if (role === 'admin') return <AdminRoutes />

  return <Navigate to="/auth" replace />
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/auth/callback" element={<AuthPage />} />
        <Route path="/auth/reset" element={<ResetPassword />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/*" element={<RoleRouter />} />
      </Routes>
    </BrowserRouter>
  )
}