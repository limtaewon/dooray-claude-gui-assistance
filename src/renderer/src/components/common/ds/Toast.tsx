import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CheckCircle, AlertCircle, AlertTriangle, Info, Sparkles, X } from 'lucide-react'
import type { ReactNode } from 'react'

export type ToastTone = 'default' | 'success' | 'error' | 'warn' | 'ai'

export interface ToastInput {
  title: ReactNode
  body?: ReactNode
  tone?: ToastTone
  duration?: number
}

interface StoredToast extends ToastInput {
  id: string
}

export interface ToastApi {
  push: (t: ToastInput) => void
  success: (title: ReactNode, body?: ReactNode) => void
  error: (title: ReactNode, body?: ReactNode) => void
  warn: (title: ReactNode, body?: ReactNode) => void
  ai: (title: ReactNode, body?: ReactNode) => void
  info: (title: ReactNode, body?: ReactNode) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within <ToastHost>')
  return ctx
}

const ICONS: Record<ToastTone, { Icon: typeof CheckCircle; color: string }> = {
  success: { Icon: CheckCircle, color: '#22C55E' },
  error:   { Icon: AlertCircle, color: '#EF4444' },
  warn:    { Icon: AlertTriangle, color: '#FBBF24' },
  ai:      { Icon: Sparkles, color: 'var(--clover-orange)' as string },
  default: { Icon: Info, color: 'var(--clover-blue)' as string }
}

function ToastHost({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<StoredToast[]>([])

  const push = useCallback((t: ToastInput): void => {
    const id = Math.random().toString(36).slice(2)
    setToasts((s) => [...s, { id, tone: 'default', ...t }])
    const duration = t.duration ?? 3600
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), duration)
  }, [])

  const dismiss = (id: string): void => setToasts((s) => s.filter((x) => x.id !== id))

  const api: ToastApi = useMemo(() => ({
    push,
    success: (title, body) => push({ tone: 'success', title, body }),
    error:   (title, body) => push({ tone: 'error', title, body }),
    warn:    (title, body) => push({ tone: 'warn', title, body }),
    ai:      (title, body) => push({ tone: 'ai', title, body }),
    info:    (title, body) => push({ tone: 'default', title, body })
  }), [push])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="ds-toast-viewport">
        {toasts.map((t) => {
          const tone = t.tone || 'default'
          const { Icon, color } = ICONS[tone]
          return (
            <div key={t.id} className={`ds-toast ${tone === 'default' ? '' : tone}`}>
              <Icon size={14} style={{ color, marginTop: 1, flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-title">{t.title}</div>
                {t.body && <div className="t-body">{t.body}</div>}
              </div>
              <button className="t-close" onClick={() => dismiss(t.id)} aria-label="닫기">
                <X size={11} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export default ToastHost
