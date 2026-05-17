import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { updatePassword } from '../lib/auth'
import { useToast } from '../components/shared/ToastProvider'

export default function ResetPassword() {
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let mounted = true
    async function loadSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (mounted && session) {
        setReady(true)
      }
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        setReady(true)
      }
    })

    loadSession()

    return () => {
      mounted = false
      subscription?.subscription?.unsubscribe?.()
    }
  }, [])

  async function handleSubmit() {
    setError(null)
    setMessage(null)
    if (!ready) {
      const msg = 'Open the password reset link from your email in this browser.'
      setError(msg)
      addToast({ type: 'error', title: 'Reset link missing', message: msg })
      return
    }
    if (!password.trim() || !confirm.trim()) {
      const msg = 'Please fill in both password fields.'
      setError(msg)
      addToast({ type: 'error', title: 'Missing details', message: msg })
      return
    }
    if (password.trim() !== confirm.trim()) {
      const msg = 'Passwords do not match.'
      setError(msg)
      addToast({ type: 'error', title: 'Password mismatch', message: msg })
      return
    }

    setSubmitting(true)
    const { error: updateError } = await updatePassword(password.trim())
    if (updateError) {
      setError(updateError.message || 'Failed to update password.')
      addToast({ type: 'error', title: 'Update failed', message: updateError.message || 'Failed to update password.' })
      setSubmitting(false)
      return
    }

    setMessage('Password updated. Redirecting to login...')
    addToast({ type: 'success', title: 'Password updated', message: 'Redirecting to login.' })
    setTimeout(() => navigate('/auth', { replace: true }), 1200)
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 flex flex-col gap-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Reset password</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Set a new password for your account.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Updating...' : 'Update password'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  )
}
