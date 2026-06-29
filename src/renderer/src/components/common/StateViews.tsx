import { Loader2, AlertCircle, Inbox, RefreshCw, Bug } from 'lucide-react'

interface LoadingViewProps {
  message?: string
  className?: string
}

/** 로딩 상태 (스피너 + 메시지) */
export function LoadingView({ message = '불러오는 중...', className = '' }: LoadingViewProps): JSX.Element {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-10 ${className}`}>
      <Loader2 size={20} className="animate-spin text-clauday-blue" />
      <p className="text-xs text-text-secondary">{message}</p>
    </div>
  )
}

interface ErrorViewProps {
  message: string
  onRetry?: () => void
  /** 오류 리포트 버튼 — 클릭 시 ErrorReportProvider 의 open() 등을 호출하도록 호출자가 주입 */
  onReport?: () => void
  className?: string
}

/** 에러 상태 (아이콘 + 메시지 + 재시도 / 리포트 버튼) */
export function ErrorView({ message, onRetry, onReport, className = '' }: ErrorViewProps): JSX.Element {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-10 ${className}`}>
      <AlertCircle size={24} className="text-red-400" />
      <p className="text-xs text-red-400 text-center max-w-md px-4 whitespace-pre-wrap">{message}</p>
      <div className="flex items-center gap-2 mt-1">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-surface border border-bg-border text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary hover:border-clauday-blue/50 transition-colors"
          >
            <RefreshCw size={11} /> 다시 시도
          </button>
        )}
        {onReport && (
          <button
            onClick={onReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-surface border border-bg-border text-[calc(11px_*_var(--app-font-scale,1))] text-text-primary hover:border-clauday-blue/50 transition-colors"
            title="진단 정보와 함께 오류를 제보합니다"
          >
            <Bug size={11} /> 오류 리포트
          </button>
        )}
      </div>
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
          <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary mt-1 max-w-md whitespace-pre-wrap">{description}</p>
        )}
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-1 flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-clauday-blue text-white text-xs font-medium hover:bg-clauday-blue/80 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
