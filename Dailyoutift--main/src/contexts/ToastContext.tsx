import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastContextValue {
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
  info: (message: string, duration?: number) => void
  warning: (message: string, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const toastStyles: Record<ToastType, { border: string; icon: React.ReactNode; bg: string; text: string }> = {
  success: {
    border: 'border-l-4 border-success',
    bg: 'bg-success-bg',
    text: 'text-success-text',
    icon: <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />,
  },
  error: {
    border: 'border-l-4 border-danger',
    bg: 'bg-danger-bg',
    text: 'text-danger-text',
    icon: <AlertCircle className="w-4 h-4 text-danger flex-shrink-0" />,
  },
  warning: {
    border: 'border-l-4 border-warning',
    bg: 'bg-warning-bg',
    text: 'text-warning-text',
    icon: <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />,
  },
  info: {
    border: 'border-l-4 border-info',
    bg: 'bg-info-bg',
    text: 'text-info-text',
    icon: <Info className="w-4 h-4 text-info flex-shrink-0" />,
  },
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const style = toastStyles[toast.type]
  return (
    <div
      className={[
        'flex items-start gap-3 p-4 rounded-xl shadow-lg border border-[#E8E4DF] animate-toast-in max-w-sm w-full',
        style.border,
        style.bg,
      ].join(' ')}
      role="alert"
    >
      {style.icon}
      <p className={['text-sm font-medium flex-1 leading-snug', style.text].join(' ')}>
        {toast.message}
      </p>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="text-charcoal-muted hover:text-charcoal transition-colors flex-shrink-0 mt-0.5"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timerMap = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timerMap.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timerMap.current.delete(id)
    }
  }, [])

  const add = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = crypto.randomUUID()
    setToasts(prev => {
      // Keep at most 3 toasts
      const next = [...prev, { id, type, message }]
      return next.length > 3 ? next.slice(next.length - 3) : next
    })
    const timer = setTimeout(() => dismiss(id), duration)
    timerMap.current.set(id, timer)
  }, [dismiss])

  const value: ToastContextValue = {
    success: (msg, d) => add('success', msg, d),
    error: (msg, d) => add('error', msg, d),
    info: (msg, d) => add('info', msg, d),
    warning: (msg, d) => add('warning', msg, d),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast stack — bottom-right desktop, bottom-center mobile */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-4 z-[100] flex flex-col gap-2 items-center sm:items-end pointer-events-none"
      >
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
