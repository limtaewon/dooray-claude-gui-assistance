import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Loader2, Play, Settings2, TerminalSquare } from 'lucide-react'

interface StartWorkButtonProps {
  /** 버튼 아래 요약 캡션 — `저장소 · base · 브랜치 · 에이전트 1` */
  summary: string
  busy?: boolean
  busyLabel?: string
  disabled?: boolean
  /** 마지막 설정 재사용 원클릭 시작 */
  onQuickStart: () => void
  /** 설정 후 시작 — 모달 */
  onConfigure: () => void
  /** 프롬프트 없이 터미널만 */
  onTerminalOnly: () => void
}

/**
 * [▶ 작업 시작 | ▾] split button. 메인 클릭은 마지막 설정을 재사용한 원클릭 시작이고,
 * 모달은 ▾ 또는 ⌥클릭의 예외 경로다.
 */
function StartWorkButton({
  summary,
  busy = false,
  busyLabel,
  disabled = false,
  onQuickStart,
  onConfigure,
  onTerminalOnly
}: StartWorkButtonProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  return (
    <div ref={wrapRef} className="relative flex flex-col items-end gap-1">
      <div className="flex items-stretch rounded-[7px] overflow-hidden shadow-sm">
        <button
          type="button"
          disabled={disabled || busy}
          // ⌥클릭 = 설정 후 시작 (모달) — 마우스만으로도 ▾ 없이 도달 가능하게
          onClick={(e) => (e.altKey ? onConfigure() : onQuickStart())}
          className="flex items-center gap-1.5 h-8 px-3.5 text-[calc(12.5px_*_var(--app-font-scale,1))] font-medium text-white bg-gradient-to-r from-clauday-orange to-clauday-blue disabled:opacity-45 disabled:cursor-not-allowed hover:brightness-110 transition"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {busy ? busyLabel || '시작 중…' : '작업 시작'}
        </button>
        <button
          type="button"
          aria-label="작업 시작 옵션"
          disabled={disabled || busy}
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center px-1.5 text-white bg-clauday-blue border-l border-white/25 disabled:opacity-45 disabled:cursor-not-allowed hover:brightness-110 transition"
        >
          <ChevronDown size={13} />
        </button>
      </div>
      <p className="text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary font-mono">{summary}</p>

      {menuOpen && (
        <div className="ds-menu right-0 top-9">
          <button
            type="button"
            className="ds-menu-item w-full"
            onClick={() => {
              setMenuOpen(false)
              onConfigure()
            }}
          >
            <Settings2 size={13} /> 설정 후 시작…
            <span className="mi-hint">⌥클릭</span>
          </button>
          <button
            type="button"
            className="ds-menu-item w-full"
            onClick={() => {
              setMenuOpen(false)
              onTerminalOnly()
            }}
          >
            <TerminalSquare size={13} /> 프롬프트 없이 터미널만 열기
          </button>
        </div>
      )}
    </div>
  )
}

export default StartWorkButton
