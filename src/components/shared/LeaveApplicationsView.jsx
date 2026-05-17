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
    <article className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900/80 flex flex-col gap-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-gray-800 dark:text-white">{item.subject}</p>
          <p className="text-xs text-gray-400 mt-1">
            {mode === 'student'
              ? `To ${item.recipient?.name || 'Recipient'}`
              : `From ${item.sender?.name || 'Student'}${item.sender?.rollNumber ? ` · ${item.sender.rollNumber}` : ''}${item.sender?.email ? ` · ${item.sender.email}` : ''}`}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusStyles(item.status)}`}>
          {item.status}
        </span>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{item.message}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-gray-500 dark:text-gray-400">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-2.5 border border-gray-100 dark:border-gray-700/50">
          <p className="uppercase tracking-[0.18em] font-semibold text-gray-400 dark:text-gray-500">Leave dates</p>
          <p className="mt-1 font-medium text-gray-700 dark:text-gray-200">{formatDateRange(item)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-2.5 border border-gray-100 dark:border-gray-700/50">
          <p className="uppercase tracking-[0.18em] font-semibold text-gray-400 dark:text-gray-500">Created</p>
          <p className="mt-1 font-medium text-gray-700 dark:text-gray-200">
            {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
          </p>
        </div>
      </div>

      {item.documentUrl && (
        <div className="flex items-center gap-2">
           <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
           </svg>
          <a
            href={item.documentUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            {item.documentName || 'View attachment'}
          </a>
        </div>
      )}

      {item.responseMessage && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/70 p-3 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
          <p className="font-semibold mb-1 text-gray-400 uppercase tracking-wider text-[10px]">Response</p>
          {item.responseMessage}
        </div>
      )}

      {mode !== 'student' && isPending && (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={() => onAction(item.id, 'approved')}
            disabled={busyId === item.id}
            className="text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 font-medium transition-colors"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onAction(item.id, 'rejected')}
            disabled={busyId === item.id}
            className="text-xs px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 font-medium transition-colors"
          >
            Reject
          </button>
        </div>
      )}
    </article>
  )
}

export default function LeaveApplicationsView() {
  const { role } = useAuth()
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [recipients, setRecipients] = useState({ teachers: [], hods: [] })
  const [requests, setRequests] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  
  // Form state
  const [recipientProfileId, setRecipientProfileId] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const isStudent = role === 'student'

  const combinedRecipients = useMemo(() => {
    return [
      ...recipients.teachers.map((item) => ({ ...item, group: 'Professors' })),
      ...recipients.hods.map((item) => ({ ...item, group: 'HOD / Admin' })),
    ]
  }, [recipients])

  const hasRecipients = combinedRecipients.length > 0

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const [requestsRes, recipientsRes] = await Promise.all([
          getMyLeaveApplications(),
          isStudent ? getLeaveRecipients() : Promise.resolve({ data: { teachers: [], hods: [] }, error: null }),
        ])

        if (requestsRes.error) {
          setError(requestsRes.error.message || 'Failed to load leave applications.')
        }

        setRequests(requestsRes.data || [])
        setRecipients(recipientsRes.data || { teachers: [], hods: [] })

        if (isStudent && (recipientsRes.data?.teachers?.length || recipientsRes.data?.hods?.length)) {
          const firstRecipient = recipientsRes.data.teachers?.[0] || recipientsRes.data.hods?.[0]
          setRecipientProfileId(firstRecipient?.id || '')
        }
      } catch (err) {
        setError(err?.message || 'Failed to load data.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [role, isStudent])

  useEffect(() => {
    if (isStudent && !recipientProfileId && combinedRecipients.length > 0) {
      setRecipientProfileId(combinedRecipients[0].id)
    }
  }, [isStudent, recipientProfileId, combinedRecipients])

  useEffect(() => {
    if (isStudent) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateStr = tomorrow.toISOString().slice(0, 10)
      setFromDate(dateStr)
      setToDate(dateStr)
    }
  }, [isStudent])

  const filteredRequests = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return requests

    return requests.filter((item) => {
      if (isStudent) {
        // Students: name or description
        const recipientName = (item.recipient?.name || '').toLowerCase()
        const subject = (item.subject || '').toLowerCase()
        const message = (item.message || '').toLowerCase()
        return recipientName.includes(query) || subject.includes(query) || message.includes(query)
      } else {
        // Teacher/Admin: email or name
        const senderName = (item.sender?.name || '').toLowerCase()
        const senderEmail = (item.sender?.email || '').toLowerCase()
        const senderRoll = (item.sender?.rollNumber || '').toLowerCase()
        return senderName.includes(query) || senderEmail.includes(query) || senderRoll.includes(query)
      }
    })
  }, [requests, searchQuery, isStudent])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!recipientProfileId || !subject.trim() || !message.trim() || !fromDate) {
      addToast({ type: 'error', title: 'Missing details', message: 'Please fill in all required fields.' })
      return
    }

    setSubmitting(true)
    const { data, error: submitError } = await createLeaveApplication({
      recipientProfileId,
      subject: subject.trim(),
      message: message.trim(),
      fromDate,
      toDate: toDate || fromDate,
      attachment,
    })

    if (submitError || !data) {
      addToast({ type: 'error', title: 'Submission failed', message: submitError?.message || 'Failed to submit request.' })
      setSubmitting(false)
      return
    }

    setRequests((prev) => [data, ...prev])
    setSubject('')
    setMessage('')
    setAttachment(null)
    setShowForm(false)
    addToast({ type: 'success', title: 'Request submitted', message: 'Your leave request has been sent.' })
    setSubmitting(false)
  }

  async function handleStatusChange(requestId, status) {
    setBusyId(requestId)
    const { data, error: updateError } = await updateLeaveApplicationStatus(requestId, {
      status,
      responseMessage: '',
    })

    if (updateError || !data) {
      addToast({ type: 'error', title: 'Update failed', message: updateError?.message || 'Failed to update status.' })
      setBusyId(null)
      return
    }

    setRequests((prev) => prev.map((item) => (item.id === requestId ? data : item)))
    addToast({ type: 'success', title: `Request ${status}`, message: `Leave request has been ${status}.` })
    setBusyId(null)
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto py-4">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Leave Applications</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">View and manage leave requests.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
             <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
               </svg>
             </span>
             <input
               type="text"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               placeholder={isStudent ? "Search by recipient or subject..." : "Search by student name or email..."}
               className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
             />
          </div>
          
          {isStudent && (
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shrink-0"
            >
              {showForm ? 'Cancel' : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Apply Leave
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Application Form (Student Only) */}
      {showForm && (
        <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 animate-in fade-in slide-in-from-top-4 duration-300">
           <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Recipient</label>
                  <select
                    value={recipientProfileId}
                    onChange={(e) => setRecipientProfileId(e.target.value)}
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {loading && combinedRecipients.length === 0 ? (
                      <option value="">Loading recipients...</option>
                    ) : combinedRecipients.length === 0 ? (
                      <option value="">No recipients available</option>
                    ) : (
                      <>
                        {recipients.teachers?.length > 0 && (
                          <optgroup label="Professors">
                            {recipients.teachers.map((r) => (
                              <option key={r.id} value={r.id}>{r.label}</option>
                            ))}
                          </optgroup>
                        )}
                        {recipients.hods?.length > 0 && (
                          <optgroup label="HOD / Admin">
                            {recipients.hods.map((r) => (
                              <option key={r.id} value={r.id}>{r.label}</option>
                            ))}
                          </optgroup>
                        )}
                      </>
                    )}
                  </select>
                </div>
                
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Brief reason for leave"
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">From Date</label>
                    <input
                      type="date"
                      value={fromDate}
                      min={(() => {
                        const tomorrow = new Date()
                        tomorrow.setDate(tomorrow.getDate() + 1)
                        return tomorrow.toISOString().slice(0, 10)
                      })()}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">To Date</label>
                    <input
                      type="date"
                      value={toDate}
                      min={fromDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Detailed Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Provide details about your leave..."
                    rows={4}
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                  />
                </div>
                
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Supporting Document (Optional)</label>
                  <input
                    type="file"
                    onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                    className="mt-1.5 w-full text-xs text-gray-500 dark:text-gray-400"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                  />
                </div>

                <div className="flex justify-end gap-3 mt-auto">
                   <button
                     type="submit"
                     disabled={submitting || !hasRecipients}
                     className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                   >
                     {submitting ? 'Sending...' : 'Submit Request'}
                   </button>
                </div>
              </div>
           </form>
        </div>
      )}

      {/* Applications List */}
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="py-20 text-center text-gray-500">Loading leave applications...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="py-20 text-center bg-gray-50 dark:bg-gray-800/20 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400">
              {searchQuery ? 'No applications match your search.' : 'No leave applications found.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredRequests.map((item) => (
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
    </div>
  )
}
