import React, { useState, useEffect, createContext, useContext } from 'react'
import { getRole, getUser, onAuthStateChange } from '../lib/auth'

const AuthContext = createContext({
  user: null,
  role: null,
  adminDepartment: null,
  requiresOnboarding: false,
  loading: true
})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(() => localStorage.getItem('role'))
  const [adminDepartment, setAdminDepartment] = useState(() => localStorage.getItem('adminDepartment'))
  const [requiresOnboarding, setRequiresOnboarding] = useState(() => localStorage.getItem('requiresOnboarding') === 'true')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    let initDone = false

    async function init() {
      try {
        const { user } = await getUser()
        if (!mounted) return

        if (user) {
          setUser(user)
          const fresh = await getRole()
          if (!mounted) return
          if (fresh) {
            setRole(fresh.role)
            setAdminDepartment(fresh.adminDepartment)
            setRequiresOnboarding(Boolean(fresh.requiresOnboarding))
            if (fresh.role) localStorage.setItem('role', fresh.role)
            else localStorage.removeItem('role')
            if (fresh.adminDepartment) localStorage.setItem('adminDepartment', fresh.adminDepartment)
            else localStorage.removeItem('adminDepartment')
            localStorage.setItem('requiresOnboarding', String(Boolean(fresh.requiresOnboarding)))
          } else {
            const cachedRole = localStorage.getItem('role')
            const cachedDept = localStorage.getItem('adminDepartment')
            const cachedOnboarding = localStorage.getItem('requiresOnboarding') === 'true'
            setRole(cachedRole)
            setAdminDepartment(cachedDept)
            setRequiresOnboarding(cachedOnboarding)
            if (!cachedRole) localStorage.removeItem('role')
            if (!cachedDept) localStorage.removeItem('adminDepartment')
          }
        } else {
          setUser(null)
          setRole(null)
          setRequiresOnboarding(false)
          localStorage.removeItem('role')
          localStorage.removeItem('requiresOnboarding')
        }
      } catch (err) {
        console.error('useAuth init error:', err)
      } finally {
        initDone = true
        if (mounted) setLoading(false)
      }
    }

    init()

    const { data: listener } = onAuthStateChange(async (session) => {
      // Don't let the listener interfere while init() is still running
      if (!initDone) return
      if (!mounted) return

      if (session?.user) {
        setUser(session.user)
        const fresh = await getRole()
        if (!mounted) return
        if (fresh) {
          setRole(fresh.role)
          setAdminDepartment(fresh.adminDepartment)
          setRequiresOnboarding(Boolean(fresh.requiresOnboarding))
          if (fresh.role) localStorage.setItem('role', fresh.role)
          else localStorage.removeItem('role')
          if (fresh.adminDepartment) localStorage.setItem('adminDepartment', fresh.adminDepartment)
          else localStorage.removeItem('adminDepartment')
          localStorage.setItem('requiresOnboarding', String(Boolean(fresh.requiresOnboarding)))
        } else {
          const cachedRole = localStorage.getItem('role')
          const cachedDept = localStorage.getItem('adminDepartment')
          const cachedOnboarding = localStorage.getItem('requiresOnboarding') === 'true'
          setRole(cachedRole)
          setAdminDepartment(cachedDept)
          setRequiresOnboarding(cachedOnboarding)
          if (!cachedRole) localStorage.removeItem('role')
          if (!cachedDept) localStorage.removeItem('adminDepartment')
        }
      } else {
        setUser(null)
        setRole(null)
        setAdminDepartment(null)
        setRequiresOnboarding(false)
        localStorage.removeItem('role')
        localStorage.removeItem('adminDepartment')
        localStorage.removeItem('requiresOnboarding')
      }
      if (mounted) setLoading(false)
    })

    return () => {
      mounted = false
      listener?.subscription?.unsubscribe()
    }
  }, [])

  return React.createElement(
    AuthContext.Provider,
    { value: { user, role, adminDepartment, requiresOnboarding, loading } },
    children
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
