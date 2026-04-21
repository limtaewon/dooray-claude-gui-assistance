import { Inbox, AlertCircle, RotateCcw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import Button from './Button'

export interface EmptyViewProps {
  icon?: LucideIcon
  title: ReactNode
  body?: ReactNode
  action?: ReactNode
}

/** 데이터가 없을 때의 빈 상태 화면 */
export function EmptyView({ icon: Icon = Inbox, title, body, action }: EmptyViewProps): JSX.Element {
  return (
    <div className="ds-state-view">
      <div className="ds-state-icon"><Icon size={20} /></div>
      <div className="ds-state-title">{title}</div>
      {body && <div className="ds-state-body">{body}</div>}
      {action}
    </div>
  )
}

export function LoadingView({ label = '불러오는 중...' }: { label?: ReactNode }): JSX.Element {
  return (
    <div className="ds-state-view">
      <div className="ds-spinner" />
      <div className="ds-state-body">{label}</div>
    </div>
  )
}

export interface ErrorViewProps {
  title?: ReactNode
  body?: ReactNode
  onRetry?: () => void
}

export function ErrorView({ title = '문제가 발생했어요', body, onRetry }: ErrorViewProps): JSX.Element {
  return (
    <div className="ds-state-view">
      <div className="ds-state-icon" style={{ color: '#F87171' }}>
        <AlertCircle size={20} />
      </div>
      <div className="ds-state-title">{title}</div>
      {body && <div className="ds-state-body">{body}</div>}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<RotateCcw size={11} />}>
          다시 시도
        </Button>
      )}
    </div>
  )
}
