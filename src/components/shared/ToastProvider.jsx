import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const ToastContext = createContext(null)

function buildDuration(message, overrideMs) {
  const normalizedOverride = Number(overrideMs)
  if (!Number.isNaN(normalizedOverride) && normalizedOverride > 0) {
    return Math.max(5000, normalizedOverride)
  }

  const length = String(message || '').length
  const extra = Math.min(12000, length * 60)
  return Math.max(5000, 3000 + extra)
}

function buildId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function iconFor(type) {
  if (type === 'success') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    )
  }
  if (type === 'error') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }
  if (type === 'warning') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
    </svg>
  )
}

function toneClasses(type) {
  if (type === 'success') return 'border-emerald-400/40 text-emerald-50'
  if (type === 'error') return 'border-rose-400/40 text-rose-50'
  if (type === 'warning') return 'border-amber-400/40 text-amber-50'
  return 'border-sky-400/40 text-sky-50'
}

function ToastCard({ toast }) {
  const { title, message, type } = toast
  return (
    <div
      className={`rounded-2xl border px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur-2xl bg-white/20 dark:bg-slate-900/55 ${toneClasses(type)}`}
      style={{ fontFamily: 'var(--toast-font)' }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-white/12">
          {iconFor(type)}
        </div>
        <div className="flex-1">
          {title && (
            <p className="text-sm font-semibold text-white">
              {title}
            </p>
          )}
          <p className="text-xs text-white/85">{message}</p>
        </div>
      </div>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef(new Map())
  const containerRef = useRef(null)

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const clearAll = useCallback(() => {
    setToasts([])
    timersRef.current.forEach((timer) => clearTimeout(timer))
    timersRef.current.clear()
  }, [])

  const addToast = useCallback((toast) => {
    const id = toast?.id || buildId()
    const payload = {
      id,
      type: toast?.type || 'info',
      title: toast?.title || '',
      message: toast?.message || '',
      duration: buildDuration(toast?.message || '', toast?.duration),
    }

    setToasts((prev) => [...prev, payload])

    const timer = setTimeout(() => {
      removeToast(id)
    }, payload.duration)
    timersRef.current.set(id, timer)

    return id
  }, [removeToast])

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer))
      timersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!toasts.length) return
    const handleOutside = (event) => {
      if (containerRef.current && containerRef.current.contains(event.target)) {
        return
      }
      clearAll()
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [toasts.length, clearAll])

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div
        ref={containerRef}
        className="fixed right-4 top-4 z-[9999] flex w-[min(360px,92vw)] flex-col gap-3"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
