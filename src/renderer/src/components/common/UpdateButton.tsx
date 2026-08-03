import { ArrowDownToLine, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { useAppUpdate } from '../../hooks/useAppUpdate'

/**
 * 새 버전이 있을 때만 타이틀바에 나타나는 버튼. 평소에는 아무것도 그리지 않는다.
 * 점 하나만 색을 갖는다 — "받을 게 있다"는 알림이라 배지 토큰을 쓴다.
 */
function UpdateButton(): JSX.Element | null {
  const { state, hasNews, actionLabel, act, openReleasePage } = useAppUpdate()

  if (!hasNews) return null

  const busy = state.stage === 'downloading'
  const failed = state.stage === 'error'

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={act}
        disabled={busy}
        title={failed ? (state.message ?? '다시 시도') : `현재 ${state.currentVersion} → ${state.latestVersion ?? ''}`}
        aria-label={actionLabel}
        className="ds-btn ghost sm flex items-center gap-1.5"
      >
        {busy
          ? <Loader2 size={12} className="animate-spin" />
          : failed
            ? <AlertTriangle size={12} className="text-c-red-fg" />
            : state.stage === 'downloaded'
              ? <RefreshCw size={12} />
              : <ArrowDownToLine size={12} />}
        {!busy && !failed && state.stage === 'available' && (
          <span className="w-1.5 h-1.5 rounded-full bg-badge-bg flex-none" />
        )}
        <span>{actionLabel}</span>
      </button>
      {state.releaseUrl && (
        <button
          onClick={openReleasePage}
          title="릴리즈 노트 보기"
          aria-label="릴리즈 노트 보기"
          className="ds-btn ghost icon"
        >
          <span className="text-[calc(11px_*_var(--app-font-scale,1))]">···</span>
        </button>
      )}
    </div>
  )
}

export default UpdateButton
