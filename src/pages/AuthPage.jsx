import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithGoogle, handleAuthCallback, signInWithEmail, sendOtpForSignup, verifyOtp, updateUserAfterOtp, sendPasswordResetEmail } from '../lib/auth'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/shared/ToastProvider'

export default function AuthPage() {
  const { user, role, loading } = useAuth()
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [tab, setTab] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [fullName, setFullName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [otpSent, setOtpSent] = useState(false)

  useEffect(() => {
    const isCallback = window.location.pathname === '/auth/callback'
    if (!isCallback) return
    async function processCallback() {
      const { user, error } = await handleAuthCallback()
      if (error) {
        setError(error.message)
        addToast({ type: 'error', title: 'Sign-in failed', message: error.message })
        return
      }
      if (user) {
        addToast({ type: 'success', title: 'Signed in', message: 'Redirecting to onboarding.' })
        navigate('/onboarding', { replace: true })
      }
    }
    processCallback()
  }, [navigate])

  useEffect(() => {
    if (loading) return
    if (user && role) navigate('/dashboard', { replace: true })
  }, [user, role, loading, navigate])

  function toTitleCase(value) {
    return value
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ')
  }

  function extractNameFromEmail(rawEmail) {
    const emailValue = String(rawEmail || '').trim().toLowerCase()
    const local = emailValue.split('@')[0] || ''
    const parts = local.split('.').filter(Boolean)
    if (parts.length < 2) return ''

    const firstName = parts[0]
    const lastName = parts[1]
    return toTitleCase(`${firstName} ${lastName}`)
  }

  function handleEmailChange(e) {
    const nextEmail = e.target.value
    setEmail(nextEmail)
    setError(null)
    setMessage(null)
    if (otpSent) {
      setOtpSent(false)
      setOtp('')
    }
    if (tab === 'signup' && !nameTouched) {
      const derived = extractNameFromEmail(nextEmail)
      if (derived) setFullName(derived)
    }
  }

  useEffect(() => {
    if (tab !== 'signup' || nameTouched) return
    const derived = extractNameFromEmail(email)
    if (derived) setFullName(derived)
  }, [tab, email, nameTouched])

  async function handlePasswordLogin() {
    setError(null)
    setMessage(null)
    if (!email.trim() || !password.trim()) {
      const msg = 'Please fill in all fields.'
      setError(msg)
      addToast({ type: 'error', title: 'Missing details', message: msg })
      return
    }
    setSubmitting(true)

    const { error } = await signInWithEmail(email.trim(), password)
    if (error) {
      setError(error.message)
      addToast({ type: 'error', title: 'Login failed', message: error.message })
      setSubmitting(false)
      return
    }

    addToast({ type: 'success', title: 'Logged in', message: 'Welcome back.' })
    navigate('/dashboard', { replace: true })
    setSubmitting(false)
  }

  async function handleSendSignupOtp() {
    setError(null)
    setMessage(null)
    if (!email.trim() || !fullName.trim() || !password.trim()) {
      const msg = 'Please fill in all fields.'
      setError(msg)
      addToast({ type: 'error', title: 'Missing details', message: msg })
      return
    }

    setSubmitting(true)
    const { error } = await sendOtpForSignup(email.trim(), fullName.trim())
    if (error) {
      setError(error.message || 'Failed to send OTP.')
      addToast({ type: 'error', title: 'OTP failed', message: error.message || 'Failed to send OTP.' })
      setSubmitting(false)
      return
    }

    setOtpSent(true)
    setMessage('OTP sent. Check your email for the 6-digit code.')
    addToast({ type: 'success', title: 'OTP sent', message: 'Check your email for the 6-digit code.' })
    setSubmitting(false)
  }

  async function handleVerifyOtp() {
    setError(null)
    setMessage(null)
    if (!email.trim() || !otp.trim()) {
      const msg = 'Enter your email and the OTP code.'
      setError(msg)
      addToast({ type: 'error', title: 'Missing OTP', message: msg })
      return
    }
    if (otp.trim().length !== 6) {
      const msg = 'OTP must be 6 digits.'
      setError(msg)
      addToast({ type: 'error', title: 'Invalid OTP', message: msg })
      return
    }

    setSubmitting(true)
    const { error } = await verifyOtp(email.trim(), otp.trim())
    if (error) {
      setError(error.message)
      addToast({ type: 'error', title: 'OTP failed', message: error.message })
      setSubmitting(false)
      return
    }
    const { error: updateError } = await updateUserAfterOtp(password, fullName)
    if (updateError) {
      setError(updateError.message || 'Failed to set password.')
      addToast({ type: 'error', title: 'Signup failed', message: updateError.message || 'Failed to set password.' })
      setSubmitting(false)
      return
    }

    addToast({ type: 'success', title: 'Account created', message: 'Welcome! Redirecting to onboarding.' })
    navigate('/onboarding', { replace: true })
    setSubmitting(false)
  }

  async function handleGoogleSignIn() {
    setError(null)
    const { error } = await signInWithGoogle()
    if (error) {
      setError(error.message)
      addToast({ type: 'error', title: 'Google sign-in failed', message: error.message })
    }
  }

  async function handleForgotPassword() {
    setError(null)
    setMessage(null)
    if (!email.trim()) {
      const msg = 'Enter your email to receive a reset link.'
      setError(msg)
      addToast({ type: 'error', title: 'Missing email', message: msg })
      return
    }

    setSubmitting(true)
    const { error } = await sendPasswordResetEmail(email.trim())
    if (error) {
      setError(error.message || 'Failed to send reset email.')
      addToast({ type: 'error', title: 'Reset failed', message: error.message || 'Failed to send reset email.' })
      setSubmitting(false)
      return
    }

    setMessage('Password reset link sent. Check your email.')
    addToast({ type: 'success', title: 'Reset link sent', message: 'Check your email for the password reset link.' })
    setSubmitting(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return

    if (tab === 'login') {
      await handlePasswordLogin()
      return
    }

    if (otpSent) {
      await handleVerifyOtp()
      return
    }

    await handleSendSignupOtp()
  }

  if (loading) return null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 flex flex-col gap-5">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
            Heritage Institute of Technology
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Attendance Portal</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
          {['login', 'signup'].map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                setError(null)
                setMessage(null)
                setPassword('')
                setOtp('')
                setOtpSent(false)
                setNameTouched(false)
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                tab === t
                  ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-white shadow-sm'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {t === 'login' ? 'Log in' : 'Create account'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          {tab === 'signup' && (
            <input
              type="text"
              value={fullName}
              onChange={(e) => {
                setNameTouched(true)
                setFullName(e.target.value)
              }}
              placeholder="Full name"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={handleEmailChange}
            placeholder="you@heritageit.edu.in"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {tab === 'login' && (
            <button
              type="button"
              onClick={handleForgotPassword}
              className="self-end text-[11px] text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Forgot password?
            </button>
          )}

          {otpSent && (
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Enter 6-digit OTP"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-[0.3em] text-center"
            />
          )}

          <div className="flex flex-col gap-2">
            {tab === 'login' ? (
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Please wait...' : 'Log in'}
              </button>
            ) : (
              <>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Please wait...' : otpSent ? 'Resend OTP' : 'Send OTP'}
                </button>
                {otpSent && (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Verifying...' : 'Verify & Create account'}
                  </button>
                )}
              </>
            )}
          </div>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
          <span className="text-xs text-gray-300 dark:text-gray-600">or</span>
          <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
        </div>

        {/* Google */}
        <button
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
          </svg>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Continue with Google
          </span>
        </button>

        <p className="text-xs text-gray-300 dark:text-gray-600 text-center">
          Only heritageit.edu.in / heritageit.edu accounts are permitted
        </p>
      </div>
    </div>
  )
}