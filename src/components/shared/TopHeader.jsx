import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { signOut } from '../../lib/auth'
import { createAnnouncement, getAnnouncements, getAnnouncementFilters, clearAnnouncements, deleteAnnouncement, dismissAnnouncement } from '../../lib/announcements'
import { getMyProfile, getMyStudentProfile, getMyTeacherProfile, uploadMyAvatar } from '../../lib/profile'
import { useToast } from './ToastProvider'

function formatLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isAnnouncementPinned(item) {
  if (!item?.pinnedUntil) return false
  return item.pinnedUntil >= formatLocalDateKey()
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(text, query) {
  const source = String(text || '')
  const trimmedQuery = query.trim()

  if (!trimmedQuery) return source

  const parts = trimmedQuery.split(/\s+/).filter(Boolean)
  if (!parts.length) return source

  const pattern = new RegExp(`(${parts.map(escapeRegExp).join('|')})`, 'ig')
  const segments = source.split(pattern)
  const lowerParts = parts.map((part) => part.toLowerCase())

  return segments.map((segment, index) => {
    if (!segment) return null
    if (lowerParts.includes(segment.toLowerCase())) {
      return (
        <mark
          key={`${segment}-${index}`}
          className="rounded bg-amber-200/80 px-0.5 text-inherit dark:bg-amber-400/30"
        >
          {segment}
        </mark>
      )
    }

    return segment
  })
}

export default function TopHeader({ title }) {
  const { user, role, adminDepartment } = useAuth()
  const { addToast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [newTitle, setNewTitle] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [newPinnedUntil, setNewPinnedUntil] = useState('')
  const [announcementSearch, setAnnouncementSearch] = useState('')
  const [posting, setPosting] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [announcementFilters, setAnnouncementFilters] = useState({
    student: { departments: [], years: [], sections: [] },
    teacher: { departments: [] },
  })
  const [studentTarget, setStudentTarget] = useState({ department: '', yearOfStudy: '', section: '' })
  const [teacherTarget, setTeacherTarget] = useState({ department: '' })
  const [targetRoles, setTargetRoles] = useState({ students: true, teachers: false })
  const [studentLastSeenAt, setStudentLastSeenAt] = useState(null)
  const [profileFullName, setProfileFullName] = useState(null)
  const [profileData, setProfileData] = useState(() => {
    if (!user?.id) return null
    try { return JSON.parse(localStorage.getItem(`cachedProfileData:${user.id}`)) || null } catch { return null }
  })
  const [roleProfile, setRoleProfile] = useState(() => {
    if (!user?.id) return null
    try { return JSON.parse(localStorage.getItem(`cachedRoleProfile:${user.id}`)) || null } catch { return null }
  })
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  const sortedAnnouncements = useMemo(() => {
    return [...announcements].sort((a, b) => {
      const aPinned = isAnnouncementPinned(a)
      const bPinned = isAnnouncementPinned(b)
      if (aPinned !== bPinned) return aPinned ? -1 : 1

      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    })
  }, [announcements])

  const visibleAnnouncements = useMemo(() => {
    const query = announcementSearch.trim().toLowerCase()
    if (!query) return sortedAnnouncements

    return sortedAnnouncements.filter((item) => {
      const title = String(item?.title || '').toLowerCase()
      const message = String(item?.message || '').toLowerCase()
      return title.includes(query) || message.includes(query)
    })
  }, [announcementSearch, sortedAnnouncements])

  const latestAnnouncementTime = useMemo(() => {
    if (!announcements.length) return null
    return announcements.reduce((latest, current) => {
      if (!current?.createdAt) return latest
      if (!latest) return current.createdAt
      return new Date(current.createdAt).getTime() > new Date(latest).getTime() ? current.createdAt : latest
    }, null)
  }, [announcements])

  const studentLastSeenKey = useMemo(() => {
    if (!user?.id) return null
    return `announcement:last-seen:${user.id}`
  }, [user?.id])

  const hasUnreadForStudent = useMemo(() => {
    if (role !== 'student') return false
    if (!latestAnnouncementTime) return false
    if (!studentLastSeenAt) return true
    return new Date(latestAnnouncementTime).getTime() > new Date(studentLastSeenAt).getTime()
  }, [role, latestAnnouncementTime, studentLastSeenAt])

  useEffect(() => {
    if (!user?.id) return

    if (studentLastSeenKey) {
      setStudentLastSeenAt(localStorage.getItem(studentLastSeenKey))
    }

    async function loadAnnouncements() {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await getAnnouncements()
      if (fetchError) {
        setError(fetchError.message || 'Failed to load announcements.')
        addToast({
          type: 'error',
          title: 'Load failed',
          message: fetchError.message || 'Failed to load announcements.'
        })
      }
      setAnnouncements(data || [])
      setLoading(false)
    }

    async function loadAnnouncementFilters() {
      const { data, error: filtersError } = await getAnnouncementFilters()
      if (filtersError) {
        return
      }
      if (data) setAnnouncementFilters(data)
    }

    async function loadProfileDetails() {
      setProfileLoading(true)
      setProfileError(null)

      try {
        const profileRes = await getMyProfile()
        if (profileRes.error) {
          throw profileRes.error
        }

        const baseProfile = profileRes.data || null
        setProfileData(baseProfile)
        if (baseProfile) localStorage.setItem(`cachedProfileData:${user.id}`, JSON.stringify(baseProfile))
        if (baseProfile?.full_name) setProfileFullName(baseProfile.full_name)

        if (role === 'student') {
          const studentRes = await getMyStudentProfile()
          if (!studentRes.error && studentRes.data) {
            setRoleProfile(studentRes.data)
            localStorage.setItem(`cachedRoleProfile:${user.id}`, JSON.stringify(studentRes.data))
          }
        } else if (role === 'teacher') {
          const teacherRes = await getMyTeacherProfile()
          if (!teacherRes.error && teacherRes.data) {
            setRoleProfile(teacherRes.data)
            localStorage.setItem(`cachedRoleProfile:${user.id}`, JSON.stringify(teacherRes.data))
          }
        } else {
          setRoleProfile(null)
          localStorage.removeItem(`cachedRoleProfile:${user.id}`)
        }
      } catch (err) {
        const msg = err?.message || 'Failed to load profile.'
        setProfileError(msg)
        addToast({ type: 'error', title: 'Profile failed', message: msg })
      } finally {
        setProfileLoading(false)
      }
    }

    loadAnnouncements()
    loadAnnouncementFilters()
    loadProfileDetails()
  }, [user?.id, studentLastSeenKey, role])

  useEffect(() => {
    if (role === 'admin') {
      setTargetRoles({ students: true, teachers: true })
      return
    }
    if (role === 'teacher') {
      setTargetRoles({ students: true, teachers: false })
    }
  }, [role])

  async function handleSignOut() {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out error:', err)
    }
    localStorage.clear()
    sessionStorage.clear()
    window.location.href = '/auth'
  }

  const effectiveName = profileFullName || user?.user_metadata?.full_name || user?.email || ''

  const initials = (effectiveName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)) || '??'

  const avatarUrl = roleProfile?.profiles?.avatar_url || profileData?.avatar_url || null
  const profileEmail = profileData?.email || user?.email || ''

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setAvatarUploading(true)
    setProfileError(null)

    const { data, error: uploadError } = await uploadMyAvatar(file)
    if (uploadError || !data) {
      const msg = uploadError?.message || 'Failed to upload avatar.'
      setProfileError(msg)
      addToast({ type: 'error', title: 'Upload failed', message: msg })
      setAvatarUploading(false)
      return
    }

    setProfileData((current) => {
      const updated = { ...(current || {}), avatar_url: data.avatarUrl }
      localStorage.setItem(`cachedProfileData:${user.id}`, JSON.stringify(updated))
      return updated
    })
    setRoleProfile((current) => {
      if (!current) return current
      const updated = {
        ...current,
        profiles: {
          ...(current.profiles || {}),
          avatar_url: data.avatarUrl,
        },
      }
      localStorage.setItem(`cachedRoleProfile:${user.id}`, JSON.stringify(updated))
      return updated
    })
    addToast({ type: 'success', title: 'Avatar updated', message: 'Your profile photo has been updated.' })
    setAvatarUploading(false)
  }

  const detailItems = useMemo(() => {
    const items = []

    if (role === 'student' && roleProfile) {
      items.push(
        { label: 'Department', value: roleProfile.department || '—' },
        { label: 'Roll number', value: roleProfile.roll_number || '—' },
        { label: 'Year', value: roleProfile.year_of_study || '—' },
        { label: 'Section', value: roleProfile.section || '—' },
        { label: 'Semester', value: roleProfile.current_semester || '—' }
      )
    }

    if (role === 'teacher' && roleProfile) {
      items.push(
        { label: 'Department', value: roleProfile.department || '—' },
        { label: 'Employee ID', value: roleProfile.employee_id || '—' }
      )
    }

    if (role === 'admin') {
      items.push({ label: 'Department', value: adminDepartment || '—' })
    }

    return items
  }, [role, roleProfile, adminDepartment])

  async function handleCreateAnnouncement() {
    if (!newTitle.trim() || !newMessage.trim()) {
      const msg = 'Title and message are required.'
      setError(msg)
      addToast({ type: 'error', title: 'Missing details', message: msg })
      return
    }

    if (newPinnedUntil && !/^\d{4}-\d{2}-\d{2}$/.test(newPinnedUntil)) {
      const msg = 'Pinned until must be a valid date.'
      setError(msg)
      addToast({ type: 'error', title: 'Invalid date', message: msg })
      return
    }

    if (newPinnedUntil) {
      const today = new Date()
      const todayKey = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
      const picked = new Date(`${newPinnedUntil}T00:00:00Z`)
      if (picked < todayKey) {
        const msg = 'Pinned until must be today or a future date.'
        setError(msg)
        addToast({ type: 'error', title: 'Invalid date', message: msg })
        return
      }
    }

    setPosting(true)
    setError(null)

    const selectedRoles = []
    if (role === 'teacher') {
      selectedRoles.push('student')
    } else {
      if (targetRoles.students) selectedRoles.push('student')
      if (targetRoles.teachers) selectedRoles.push('teacher')
    }

    const { data, error: createError } = await createAnnouncement({
      title: newTitle.trim(),
      message: newMessage.trim(),
      pinnedUntil: newPinnedUntil || null,
      targetRoles: selectedRoles,
      studentTarget: {
        department: studentTarget.department || null,
        yearOfStudy: studentTarget.yearOfStudy || null,
        section: studentTarget.section || null,
      },
      teacherTarget: {
        department: teacherTarget.department || null,
      },
    })

    if (createError || !data) {
      const msg = createError?.message || 'Failed to publish announcement.'
      setError(msg)
      addToast({ type: 'error', title: 'Publish failed', message: msg })
      setPosting(false)
      return
    }

    setAnnouncements((prev) => [data, ...prev])
    setNewTitle('')
    setNewMessage('')
    setNewPinnedUntil('')
    setStudentTarget({ department: '', yearOfStudy: '', section: '' })
    setTeacherTarget({ department: '' })
    setPosting(false)
    addToast({ type: 'success', title: 'Announcement posted', message: 'Announcement published successfully.' })
  }

  async function handleClearAnnouncements() {
    const { error: clearError } = await clearAnnouncements()
    if (clearError) {
      const msg = clearError?.message || 'Failed to clear announcements.'
      addToast({ type: 'error', title: 'Clear failed', message: msg })
      return
    }
    setAnnouncements([])
    setShowClearConfirm(false)
  }

  async function handleDeleteAnnouncement(announcementId) {
    const { error: deleteError } = await deleteAnnouncement(announcementId)
    if (deleteError) {
      const msg = deleteError?.message || 'Failed to delete announcement.'
      addToast({ type: 'error', title: 'Delete failed', message: msg })
      return
    }
    setAnnouncements((prev) => prev.filter((item) => item.id !== announcementId))
  }

  async function handleDismissAnnouncement(announcementId) {
    const { error: dismissError } = await dismissAnnouncement(announcementId)
    if (dismissError) {
      const msg = dismissError?.message || 'Failed to hide announcement.'
      addToast({ type: 'error', title: 'Dismiss failed', message: msg })
      return
    }
    setAnnouncements((prev) => prev.filter((item) => item.id !== announcementId))
  }

  function toggleAnnouncements() {
    const next = !isOpen
    setIsOpen(next)
    if (next) setIsProfileOpen(false)

    if (next && role === 'student' && studentLastSeenKey && latestAnnouncementTime) {
      localStorage.setItem(studentLastSeenKey, latestAnnouncementTime)
      setStudentLastSeenAt(latestAnnouncementTime)
    }
  }

  return (
    <header className="min-h-16 md:min-h-20 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between px-6 shrink-0">
      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
        {title}
      </h1>
      <div className="flex items-center gap-3 relative">
        <button
          type="button"
          onClick={toggleAnnouncements}
          className="relative h-9 w-9 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
          title="Announcements"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path d="M3 10v4a1 1 0 0 0 1 1h3l6 3V6L7 9H4a1 1 0 0 0-1 1z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 8c1 1 1 3 0 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M18.5 6.5c2 2 2 5 0 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {hasUnreadForStudent && (
            <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
          )}
        </button>
        
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIsProfileOpen((current) => !current)
              setIsOpen(false)
            }}
            className="relative w-9 h-9 rounded-full border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center justify-center overflow-hidden"
            title="Profile"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </button>
        </div>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
            <div className="fixed top-16 left-4 right-4 md:absolute md:top-12 md:left-auto md:right-0 z-40 md:w-[28rem] max-h-[70vh] md:max-h-[80vh] overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800 dark:text-white">Announcements</p>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="h-7 w-7 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Close"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

            {(role === 'teacher' || role === 'admin') && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50 flex flex-col gap-2">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Create announcement</p>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
                />
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Write announcement..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm resize-none"
                />
                <div className="flex flex-col gap-2">
                  {role === 'admin' && (
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={targetRoles.students}
                          onChange={() => setTargetRoles((prev) => ({ ...prev, students: !prev.students }))}
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-700"
                        />
                        Students
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={targetRoles.teachers}
                          onChange={() => setTargetRoles((prev) => ({ ...prev, teachers: !prev.teachers }))}
                          className="h-4 w-4 rounded border-gray-300 dark:border-gray-700"
                        />
                        Teachers
                      </label>
                    </div>
                  )}

                  {(role === 'teacher' || targetRoles.students) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={studentTarget.department}
                        onChange={(e) => setStudentTarget((prev) => ({ ...prev, department: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs"
                      >
                        <option value="">All departments</option>
                        {announcementFilters.student.departments.map((dept) => (
                          <option key={`dept-${dept}`} value={dept}>{dept}</option>
                        ))}
                      </select>
                      <select
                        value={studentTarget.yearOfStudy}
                        onChange={(e) => setStudentTarget((prev) => ({ ...prev, yearOfStudy: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs"
                      >
                        <option value="">All years</option>
                        {announcementFilters.student.years.map((year) => (
                          <option key={`year-${year}`} value={year}>{year}</option>
                        ))}
                      </select>
                      <select
                        value={studentTarget.section}
                        onChange={(e) => setStudentTarget((prev) => ({ ...prev, section: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs"
                      >
                        <option value="">All sections</option>
                        {announcementFilters.student.sections.map((section) => (
                          <option key={`section-${section}`} value={section}>{section}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {role === 'admin' && targetRoles.teachers && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={teacherTarget.department}
                        onChange={(e) => setTeacherTarget((prev) => ({ ...prev, department: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs"
                      >
                        <option value="">All departments (teachers)</option>
                        {announcementFilters.teacher.departments.map((dept) => (
                          <option key={`tdept-${dept}`} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    Extra class date / pin until
                  </label>
                  <input
                    type="date"
                    value={newPinnedUntil}
                    onChange={(e) => setNewPinnedUntil(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
                  />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    Use this to pin an extra-class notice until the class date passes.
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  {error ? <p className="text-xs text-red-500">{error}</p> : <span />}
                  <button
                    type="button"
                    onClick={handleCreateAnnouncement}
                    disabled={posting}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                  >
                    {posting ? 'Publishing...' : 'Publish'}
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                Search announcements
              </label>
              <input
                type="text"
                value={announcementSearch}
                onChange={(e) => setAnnouncementSearch(e.target.value)}
                placeholder="Search by title or description"
                className="mt-1 w-full bg-transparent text-sm text-gray-800 dark:text-white placeholder:text-gray-400 outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Clear all announcements
            </button>

            {loading ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Loading announcements...</p>
            ) : visibleAnnouncements.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {announcementSearch.trim() ? 'No matching announcements.' : 'No announcements yet.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {visibleAnnouncements.map((item) => (
                  <article key={item.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900/80">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">
                          {highlightText(item.title, announcementSearch)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isAnnouncementPinned(item) && (
                          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                            Pinned
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDismissAnnouncement(item.id)}
                          className="text-[10px] px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          Hide
                        </button>
                        {(item.createdBy?.id === user?.id || role === 'admin') && (
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(item.id)}
                            className="text-[10px] px-2 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/30"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">
                      {highlightText(item.message, announcementSearch)}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-2">
                      {item.createdBy?.name || 'Staff'}
                      {item.createdBy?.role ? ` (${item.createdBy.role})` : ''}
                      {' · '}
                      {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                      {item.pinnedUntil ? ` · pinned until ${new Date(`${item.pinnedUntil}T00:00:00`).toLocaleDateString()}` : ''}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>
          </>
        )}

        {showClearConfirm && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowClearConfirm(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl p-4 flex flex-col gap-3">
                <p className="text-sm font-semibold text-gray-800 dark:text-white">Clear all announcements?</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  This will hide all announcements for you. Others will still see them.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAnnouncements}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                  >
                    Clear all
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {pendingDeleteId && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPendingDeleteId(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl p-4 flex flex-col gap-3">
                <p className="text-sm font-semibold text-gray-800 dark:text-white">Delete this announcement?</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  This will remove it for everyone, including students and teachers.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(null)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const targetId = pendingDeleteId
                      setPendingDeleteId(null)
                      handleDeleteAnnouncement(targetId)
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {isProfileOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setIsProfileOpen(false)} />
            <div className="fixed top-16 left-4 right-4 md:absolute md:top-12 md:left-auto md:right-0 z-40 md:w-[26rem] max-h-[70vh] md:max-h-[80vh] overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800 dark:text-white">Profile</p>
                <button
                  type="button"
                  onClick={() => setIsProfileOpen(false)}
                  className="h-7 w-7 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Close"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-full border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold">{initials}</span>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">{effectiveName || 'User'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{profileEmail || '—'}</p>
                <p className="text-[11px] text-gray-400 mt-1">Role: {role || '—'}</p>
              </div>
            </div>

            {profileLoading ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Loading profile details...</p>
            ) : detailItems.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                {detailItems.map((item) => (
                  <div key={item.label} className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-2">
                    <p className="uppercase tracking-[0.18em] font-semibold text-gray-400 dark:text-gray-500">{item.label}</p>
                    <p className="mt-1 font-medium text-gray-700 dark:text-gray-200">{item.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">No additional details available.</p>
            )}

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50 flex flex-col gap-2">
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Update avatar</label>
              <input
                type="file"
                onChange={handleAvatarChange}
                accept=".png,.jpg,.jpeg,.webp"
                className="text-xs text-gray-600 dark:text-gray-300"
              />
              {avatarUploading && (
                <p className="text-[11px] text-gray-400">Uploading...</p>
              )}
              {profileError && (
                <p className="text-[11px] text-red-500">{profileError}</p>
              )}
            </div>

            <button
              onClick={handleSignOut}
              className="w-full mt-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 py-2 rounded-lg font-semibold transition-colors border border-red-100 dark:border-red-900/30 flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Sign out
            </button>
          </div>
          </>
        )}

      </div>
    </header>
  )
}