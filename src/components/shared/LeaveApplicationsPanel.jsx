import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { createLeaveApplication, getLeaveRecipients, getMyLeaveApplications, updateLeaveApplicationStatus } from '../../lib/leaves'
import { useToast } from './ToastProvider'

function formatDateLabel(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString()
}

function formatDateRange(item) {
  if (!item?.fromDate) return '—'
  if (item.toDate && item.toDate !== item.fromDate) {
    return `${formatDateLabel(item.fromDate)} → ${formatDateLabel(item.toDate)}`
  }
  return formatDateLabel(item.fromDate)
}

function statusStyles(status) {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/30'
  if (status === 'rejected') return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/30'
  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/30'
}

function LeaveRequestCard({ item, mode, onAction, busyId }) {
  const isPending = item.status === 'pending'
  return (
    <article className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900/80 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-white">{item.subject}</p>
          <p className="text-[11px] text-gray-400 mt-1">
            {mode === 'student'
              ? `To ${item.recipient?.name || 'Recipient'}`
              : `From ${item.sender?.name || 'Student'}${item.sender?.rollNumber ? ` · ${item.sender.rollNumber}` : ''}`}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusStyles(item.status)}`}>
          {item.status}
        </span>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{item.message}</p>

      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-500 dark:text-gray-400">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-2">
          <p className="uppercase tracking-[0.18em] font-semibold text-gray-400 dark:text-gray-500">Leave dates</p>
          <p className="mt-1 font-medium text-gray-700 dark:text-gray-200">{formatDateRange(item)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-2">
          <p className="uppercase tracking-[0.18em] font-semibold text-gray-400 dark:text-gray-500">Created</p>
          <p className="mt-1 font-medium text-gray-700 dark:text-gray-200">
            {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
          </p>
        </div>
      </div>

      {item.documentUrl && (
        <a
          href={item.documentUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          View attachment{item.documentName ? ` · ${item.documentName}` : ''}
        </a>
      )}

      {item.responseMessage && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 p-2 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
          {item.responseMessage}
        </div>
      )}

      {mode !== 'student' && isPending && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onAction(item.id, 'approved')}
            disabled={busyId === item.id}
            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onAction(item.id, 'rejected')}
            disabled={busyId === item.id}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </article>
  )
}

export default function LeaveApplicationsPanel({ open, onClose }) {
  const { role } = useAuth()
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [recipients, setRecipients] = useState({ teachers: [], hods: [] })
  const [requests, setRequests] = useState([])
  const [recipientProfileId, setRecipientProfileId] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [attachment, setAttachment] = useState(null)

  const isStudent = role === 'student'

  const combinedRecipients = useMemo(() => {
    return [
      ...recipients.teachers.map((item) => ({ ...item, group: 'Professors' })),
      ...recipients.hods.map((item) => ({ ...item, group: 'HOD / Admin' })),
    ]
  }, [recipients])

  const hasRecipients = combinedRecipients.length > 0

  useEffect(() => {
    if (!open) return

    let active = true

    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const [requestsRes, recipientsRes] = await Promise.all([
          getMyLeaveApplications(),
          isStudent ? getLeaveRecipients() : Promise.resolve({ data: { teachers: [], hods: [] }, error: null }),
        ])

        if (!active) return

        if (requestsRes.error) {
          setError(requestsRes.error.message || 'Failed to load leave applications.')
          addToast({
            type: 'error',
            title: 'Load failed',
            message: requestsRes.error.message || 'Failed to load leave applications.'
          })
        }

        if (isStudent && recipientsRes.error) {
          setError(recipientsRes.error.message || 'Failed to load leave recipients.')
          addToast({
            type: 'error',
            title: 'Load failed',
            message: recipientsRes.error.message || 'Failed to load leave recipients.'
          })
        }

        setRequests(requestsRes.data || [])
        setRecipients(recipientsRes.data || { teachers: [], hods: [] })

        if (isStudent && (recipientsRes.data?.teachers?.length || recipientsRes.data?.hods?.length)) {
          const firstRecipient = recipientsRes.data.teachers?.[0] || recipientsRes.data.hods?.[0]
          setRecipientProfileId((current) => current || firstRecipient?.id || '')
        }
      } catch (err) {
        if (!active) return
        setError(err?.message || 'Failed to load leave applications.')
        addToast({
          type: 'error',
          title: 'Load failed',
          message: err?.message || 'Failed to load leave applications.'
        })
      } finally {
        if (active) setLoading(false)
      }
    }

    loadData()

    return () => {
      active = false
    }
  }, [open, isStudent])

  useEffect(() => {
    if (!open) return
    if (!isStudent) return
    const today = new Date().toISOString().slice(0, 10)
    setFromDate((current) => current || today)
    setToDate((current) => current || today)
  }, [open, isStudent])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!hasRecipients) {
      const msg = 'No recipients available yet. Please contact support or try again later.'
      setError(msg)
      addToast({ type: 'error', title: 'Cannot submit', message: msg })
      return
    }

    if (!recipientProfileId || !subject.trim() || !message.trim() || !fromDate) {
      const msg = 'Recipient, subject, message, and leave date are required.'
      setError(msg)
      addToast({ type: 'error', title: 'Missing details', message: msg })
      return
    }

    setSubmitting(true)
    setError(null)

    const { data, error: submitError } = await createLeaveApplication({
      recipientProfileId,
      subject: subject.trim(),
      message: message.trim(),
      fromDate,
      toDate: toDate || fromDate,
      attachment,
    })

    if (submitError || !data) {
      setError(submitError?.message || 'Failed to submit leave request.')
      addToast({
        type: 'error',
        title: 'Submission failed',
        message: submitError?.message || 'Failed to submit leave request.'
      })
      setSubmitting(false)
      return
    }

    setRequests((prev) => [data, ...prev])
    setSubject('')
    setMessage('')
    setAttachment(null)
    setFromDate(new Date().toISOString().slice(0, 10))
    setToDate(new Date().toISOString().slice(0, 10))
    addToast({ type: 'success', title: 'Request submitted', message: 'Leave request sent successfully.' })
    setSubmitting(false)
  }

  async function handleStatusChange(requestId, status) {
    setBusyId(requestId)
    setError(null)

    const { data, error: updateError } = await updateLeaveApplicationStatus(requestId, {
      status,
      responseMessage: '',
    })

    if (updateError || !data) {
      setError(updateError?.message || 'Failed to update leave request.')
      addToast({
        type: 'error',
        title: 'Update failed',
        message: updateError?.message || 'Failed to update leave request.'
      })
      setBusyId(null)
      return
    }

    setRequests((prev) => prev.map((item) => (item.id === requestId ? data : item)))
    addToast({
      type: 'success',
      title: `Request ${status}`,
      message: `Leave request has been ${status}.`
    })
    setBusyId(null)
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute top-12 right-0 z-40 w-[min(32rem,92vw)] max-h-[75vh] overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800 dark:text-white">Leave Applications</p>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

      {isStudent && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50 flex flex-col gap-3">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">New leave request</p>
          <div>
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Send to</label>
            <select
              value={recipientProfileId}
              onChange={(e) => setRecipientProfileId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
            >
              {combinedRecipients.length === 0 ? (
                <option value="">No recipients available</option>
              ) : (
                <>
                  {recipients.teachers?.length > 0 && (
                    <optgroup label="Professors">
                      {recipients.teachers.map((recipient) => (
                        <option key={recipient.id} value={recipient.id}>{recipient.label}</option>
                      ))}
                    </optgroup>
                  )}
                  {recipients.hods?.length > 0 && (
                    <optgroup label="HOD / Admin">
                      {recipients.hods.map((recipient) => (
                        <option key={recipient.id} value={recipient.id}>{recipient.label}</option>
                      ))}
                    </optgroup>
                  )}
                </>
              )}
            </select>
          </div>
          {!loading && !hasRecipients && (
            <p className="text-[11px] text-amber-500">No eligible teachers or HODs found for your department.</p>
          )}
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your leave message..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm resize-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Supporting document</label>
            <input
              type="file"
              onChange={(e) => setAttachment(e.target.files?.[0] || null)}
              className="mt-1 w-full text-sm text-gray-600 dark:text-gray-300"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            {error ? <p className="text-xs text-red-500">{error}</p> : <span className="text-[11px] text-gray-400">PDF, image, or document file up to 5MB.</span>}
            <button
              type="submit"
              disabled={submitting || !hasRecipients}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              {submitting ? 'Sending...' : 'Send request'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">Loading leave applications...</p>
      ) : requests.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {isStudent ? 'You have not submitted any leave requests yet.' : 'No leave requests received yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((item) => (
            <LeaveRequestCard
              key={item.id}
              item={item}
              mode={isStudent ? 'student' : 'staff'}
              onAction={handleStatusChange}
              busyId={busyId}
            />
          ))}
        </div>
      )}
    </div>
    </>
  )
}
