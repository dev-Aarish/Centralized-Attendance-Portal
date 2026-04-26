import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { apiFetch } from '../lib/api'
import { getRole } from '../lib/auth'
import SpiralLoader from '../components/shared/Loader'

const DEPARTMENTS = [
  { value: 'CSE', label: 'Computer Science & Engineering' },
  { value: 'IT', label: 'Information Technology' },
  { value: 'ECE', label: 'Electronics & Communication Engineering' },
  { value: 'EE', label: 'Electrical Engineering' },
  { value: 'ME', label: 'Mechanical Engineering' },
  { value: 'CE', label: 'Civil Engineering' },
  { value: 'AEIE', label: 'Applied Electronics & Instrumentation Engineering' },
  { value: 'CSBS', label: 'Computer Science & Business Systems' },
  { value: 'CSDS', label: 'Computer Science & Data Science' },
  { value: 'AIML', label: 'Artificial Intelligence & Machine Learning' },
  { value: 'ChE', label: 'Chemical Engineering' },
  { value: 'Mathematics', label: 'Mathematics' },
  { value: 'Physics', label: 'Physics' },
]

const YEARS = ['1st', '2nd', '3rd', '4th']
const SECTIONS = ['A', 'B', 'C', 'D']

export default function OnboardingPage() {
  const { user, loading } = useAuth()

  const [checking, setChecking] = useState(true)
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [selectedRole, setSelectedRole] = useState(null)
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('')
  const [year, setYear] = useState('')
  const [section, setSection] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [currentSemester, setCurrentSemester] = useState('')
  const [employeeId, setEmployeeId] = useState('')

  useEffect(() => {
    if (loading) return
    if (!user) {
      window.location.href = '/auth'
      return
    }

    async function checkExistingProfile() {
      const roleInfo = await getRole()

      if (roleInfo?.role && !roleInfo.requiresOnboarding) {
        localStorage.setItem('role', roleInfo.role)
        if (roleInfo.adminDepartment) {
          localStorage.setItem('adminDepartment', roleInfo.adminDepartment)
        } else {
          localStorage.removeItem('adminDepartment')
        }
        localStorage.setItem('requiresOnboarding', 'false')

        window.location.href = '/dashboard'
        return
      }

      if (roleInfo?.role && roleInfo.requiresOnboarding) {
        setSelectedRole(roleInfo.role)
        setStep(2)
      }

      if (user?.user_metadata?.full_name) {
        setFullName(user.user_metadata.full_name)
      }
      setChecking(false)
    }

    checkExistingProfile()
  }, [user, loading])

  async function handleSubmit() {
    if (submitting) return
    setError(null)

    if (!selectedRole) return setError('Please select your role first.')
    if (!fullName.trim()) return setError('Please enter your full name.')
    if (!department) return setError('Please select your department.')

    if (selectedRole === 'student') {
      if (!year) return setError('Please select your year.')
      if (!currentSemester) return setError('Please select your current semester.')
      if (!rollNumber.trim()) return setError('Please enter your roll number.')
    }

    if (selectedRole === 'teacher') {
      if (!employeeId.trim()) return setError('Please enter your employee ID.')
    }

    setSubmitting(true)

    try {
      await apiFetch('/api/v1/profiles/onboard', {
        method: 'POST',
        body: JSON.stringify({
          role: selectedRole,
          fullName: fullName.trim(),
          department,
          year: selectedRole === 'student' ? year : undefined,
          section: selectedRole === 'student' ? section || null : undefined,
          rollNumber: selectedRole === 'student' ? rollNumber.trim() : undefined,
          currentSemester: selectedRole === 'student' ? currentSemester : undefined,
          employeeId: selectedRole === 'teacher' ? employeeId.trim() : undefined,
        }),
        cache: false,
        forceRefresh: true,
      })

      localStorage.setItem('role', selectedRole)
      localStorage.removeItem('adminDepartment')
      localStorage.setItem('requiresOnboarding', 'false')
      window.location.href = '/dashboard'
    } catch (err) {
      console.error('Onboarding error:', err)
      setError(err.message || 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  if (loading || checking) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <SpiralLoader />
          <p className="text-sm text-gray-400 dark:text-gray-500 font-medium tracking-wide">Checking account...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 flex flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {step === 1 ? 'Welcome! Who are you?' : 'Fill in your details'}
          </h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            {step === 1
              ? 'This helps us show you the right dashboard.'
              : `Setting up your ${selectedRole} profile.`}
          </p>
        </div>

        <div className="flex gap-2">
          <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
          <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-3">
            {[
              { value: 'student', label: 'Student', desc: 'View attendance, notes and assignments' },
              { value: 'teacher', label: 'Teacher', desc: 'Take attendance, upload notes and assignments' },
            ].map((r) => (
              <button
                key={r.value}
                onClick={() => setSelectedRole(r.value)}
                className={`w-full text-left px-4 py-4 rounded-xl border transition-colors ${
                  selectedRole === r.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <p className={`text-sm font-medium ${
                  selectedRole === r.value
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-800 dark:text-gray-200'
                }`}>
                  {r.label}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{r.desc}</p>
              </button>
            ))}
            <button
              onClick={() => setStep(2)}
              disabled={!selectedRole}
              className="mt-2 w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Full name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Department</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select department</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            {selectedRole === 'student' && (
              <>
                <div className="flex gap-3">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Year</label>
                    <select
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Year</option>
                      {YEARS.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Section (optional)</label>
                    <select
                      value={section}
                      onChange={(e) => setSection(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">None</option>
                      {SECTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Current Semester</label>
                    <select
                      value={currentSemester}
                      onChange={(e) => setCurrentSemester(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Semester</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Roll number</label>
                    <input
                      type="text"
                      value={rollNumber}
                      onChange={(e) => setRollNumber(e.target.value)}
                      placeholder="e.g. 22052026"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </>
            )}

            {selectedRole === 'teacher' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Employee ID</label>
                <input
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="e.g. TCH2024001"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => {
                  setStep(1)
                  setError(null)
                }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving...' : 'Finish setup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}