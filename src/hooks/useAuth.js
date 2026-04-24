import { useState, useEffect } from 'react'
import { getRole, getUser, onAuthStateChange } from '../lib/auth'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(() => localStorage.getItem('role'))
  const [adminDepartment, setAdminDepartment] = useState(() => localStorage.getItem('adminDepartment'))
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
            if (fresh.role) localStorage.setItem('role', fresh.role)
            else localStorage.removeItem('role')
            if (fresh.adminDepartment) localStorage.setItem('adminDepartment', fresh.adminDepartment)
            else localStorage.removeItem('adminDepartment')
          } else {
            const cachedRole = localStorage.getItem('role')
            const cachedDept = localStorage.getItem('adminDepartment')
            setRole(cachedRole)
            setAdminDepartment(cachedDept)
            if (!cachedRole) localStorage.removeItem('role')
            if (!cachedDept) localStorage.removeItem('adminDepartment')
          }
        } else {
          setUser(null)
          setRole(null)
          localStorage.removeItem('role')
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
          if (fresh.role) localStorage.setItem('role', fresh.role)
          else localStorage.removeItem('role')
          if (fresh.adminDepartment) localStorage.setItem('adminDepartment', fresh.adminDepartment)
          else localStorage.removeItem('adminDepartment')
        } else {
          const cachedRole = localStorage.getItem('role')
          const cachedDept = localStorage.getItem('adminDepartment')
          setRole(cachedRole)
          setAdminDepartment(cachedDept)
          if (!cachedRole) localStorage.removeItem('role')
          if (!cachedDept) localStorage.removeItem('adminDepartment')
        }
      } else {
        setUser(null)
        setRole(null)
        setAdminDepartment(null)
        localStorage.removeItem('role')
        localStorage.removeItem('adminDepartment')
      }
      if (mounted) setLoading(false)
    })

    return () => {
      mounted = false
      listener?.subscription?.unsubscribe()
    }
  }, [])

  return { user, role, adminDepartment, loading }
}