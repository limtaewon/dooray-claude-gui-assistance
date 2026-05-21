import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CheckCircle, AlertCircle, AlertTriangle, Info, Sparkles, X } from 'lucide-react'
import type { ReactNode } from 'react'

export type ToastTone = 'default' | 'success' | 'error' | 'warn' | 'ai'

export interface ToastInput {
  title: ReactNode
  body?: ReactNode
  tone?: ToastTone
  duration?: number
  /** 선택적 액션 버튼. 토스트 우측에 작은 버튼으로 표시. 클릭 시 토스트는 닫힘. */
  action?: {
    label: string
    onClick: () => void
  }
}

interface StoredToast extends ToastInput {
  id: string
}

export interface ToastApi {
  push: (t: ToastInput) => void
  success: (title: ReactNode, body?: ReactNode, action?: ToastInput['action']) => void
  error: (title: ReactNode, body?: ReactNode, action?: ToastInput['action']) => void
  warn: (title: ReactNode, body?: ReactNode, action?: ToastInput['action']) => void
  ai: (title: ReactNode, body?: ReactNode, action?: ToastInput['action']) => void
  info: (title: ReactNode, body?: ReactNode, action?: ToastInput['action']) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within <ToastHost>')
  return ctx
}

const ICONS: Record<ToastTone, { Icon: typeof CheckCircle; color: string }> = {
  success: { Icon: CheckCircle, color: 'var(--c-emerald-solid)' },
  error:   { Icon: AlertCircle, color: 'var(--c-red-solid)' },
  warn:    { Icon: AlertTriangle, color: 'var(--c-yellow-solid)' },
  ai:      { Icon: Sparkles, color: 'var(--clauday-orange)' as string },
  default: { Icon: Info, color: 'var(--clauday-blue)' as string }
}

function ToastHost({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<StoredToast[]>([])

  const push = useCallback((t: ToastInput): void => {
    const id = Math.random().toString(36).slice(2)
    setToasts((s) => [...s, { id, tone: 'default', ...t }])
    // 액션 버튼이 있는 토스트는 사용자가 누를 시간을 주기 위해 좀 더 오래 띄움.
    const duration = t.duration ?? (t.action ? 8000 : 3600)
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), duration)
  }, [])

  const dismiss = (id: string): void => setToasts((s) => s.filter((x) => x.id !== id))

  const api: ToastApi = useMemo(() => ({
    push,
    success: (title, body, action) => push({ tone: 'success', title, body, action }),
    error:   (title, body, action) => push({ tone: 'error', title, body, action }),
    warn:    (title, body, action) => push({ tone: 'warn', title, body, action }),
    ai:      (title, body, action) => push({ tone: 'ai', title, body, action }),
    info:    (title, body, action) => push({ tone: 'default', title, body, action })
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
              {t.action && (
                <button
                  className="t-action"
                  onClick={() => { try { t.action!.onClick() } finally { dismiss(t.id) } }}
                >
                  {t.action.label}
                </button>
              )}
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
