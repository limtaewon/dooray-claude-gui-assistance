import { Loader2, AlertCircle, Inbox, RefreshCw } from 'lucide-react'

interface LoadingViewProps {
  message?: string
  className?: string
}

/** 로딩 상태 (스피너 + 메시지) */
export function LoadingView({ message = '불러오는 중...', className = '' }: LoadingViewProps): JSX.Element {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-10 ${className}`}>
      <Loader2 size={20} className="animate-spin text-clover-blue" />
      <p className="text-xs text-text-secondary">{message}</p>
    </div>
  )
}

interface ErrorViewProps {
  message: string
  onRetry?: () => void
  className?: string
}

/** 에러 상태 (아이콘 + 메시지 + 재시도 버튼) */
export function ErrorView({ message, onRetry, className = '' }: ErrorViewProps): JSX.Element {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-10 ${className}`}>
      <AlertCircle size={24} className="text-red-400" />
      <p className="text-xs text-red-400 text-center max-w-md px-4 whitespace-pre-wrap">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-surface border border-bg-border text-[11px] text-text-primary hover:border-clover-blue/50 transition-colors"
        >
          <RefreshCw size={11} /> 다시 시도
        </button>
      )}
    </div>
  )
}

interface EmptyViewProps {
  icon?: typeof Inbox
  title: string
  description?: string
  /** 다음 액션 CTA 버튼 */
  actionLabel?: string
  onAction?: () => void
  className?: string
}

/** 빈 상태 (아이콘 + 제목 + 설명 + CTA 버튼) */
export function EmptyView({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  className = ''
}: EmptyViewProps): JSX.Element {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-bg-surface border border-bg-border flex items-center justify-center">
        <Icon size={20} className="text-text-tertiary" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {description && (
          <p className="text-[11px] text-text-tertiary mt-1 max-w-md whitespace-pre-wrap">{description}</p>
        )}
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-1 flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-clover-blue text-white text-xs font-medium hover:bg-clover-blue/80 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
