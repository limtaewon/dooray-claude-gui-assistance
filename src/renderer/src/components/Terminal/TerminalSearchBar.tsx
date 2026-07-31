import { useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import type { SearchToggles } from './terminalSearch'

interface TerminalSearchBarProps {
  query: string
  toggles: SearchToggles
  countLabel: string
  hasError: boolean
  onQueryChange: (value: string) => void
  onCompositionStart: () => void
  onCompositionEnd: (value: string) => void
  onToggle: (key: keyof SearchToggles) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

/**
 * 터미널 검색바 뷰 — 입력 · 매치 카운트 · 대소문자/정규식/단어단위 토글 · 이전/다음/닫기.
 * 상태는 모두 useTerminalSearch 가 소유하고 이 컴포넌트는 렌더만 담당한다 (ADR-03).
 */
function TerminalSearchBar({
  query,
  toggles,
  countLabel,
  hasError,
  onQueryChange,
  onCompositionStart,
  onCompositionEnd,
  onToggle,
  onNext,
  onPrev,
  onClose
}: TerminalSearchBarProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  // 검색바는 open===true 일 때만 마운트되므로, 마운트 시점에 자동 포커스하면 된다.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div
      className="absolute top-2 right-3 z-20 flex items-center gap-1 px-2 py-1 rounded-md shadow-lg bg-[var(--bg-surface-raised)] border border-[var(--bg-border)]"
      role="search"
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={(e) => onCompositionEnd(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter') {
            e.preventDefault()
            e.shiftKey ? onPrev() : onNext()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        placeholder="터미널 검색"
        aria-label="터미널 검색"
        className="text-xs bg-transparent border-none outline-none text-text-primary placeholder-text-tertiary"
        style={{ width: 150 }}
      />
      <span
        className={`text-[calc(10px_*_var(--app-font-scale,1))] font-mono min-w-[36px] text-center ${hasError ? 'text-red-400' : 'text-text-tertiary'}`}
        aria-live="polite"
        title={hasError ? '정규식이 올바르지 않습니다' : undefined}
      >
        {countLabel}
      </span>
      <div className="flex items-center gap-0.5 px-1 border-l border-r border-bg-border">
        <ToggleButton label="Aa" title="대소문자 구분" active={toggles.caseSensitive} onClick={() => onToggle('caseSensitive')} />
        <ToggleButton label=".*" title="정규식" active={toggles.regex} onClick={() => onToggle('regex')} />
        <ToggleButton label="\b" title="단어 단위" active={toggles.wholeWord} onClick={() => onToggle('wholeWord')} />
      </div>
      <button
        onClick={onPrev}
        className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary hover:text-text-primary"
        title="이전 매치 (Shift+Enter)"
      >
        <ChevronUp size={12} />
      </button>
      <button
        onClick={onNext}
        className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary hover:text-text-primary"
        title="다음 매치 (Enter)"
      >
        <ChevronDown size={12} />
      </button>
      <button
        onClick={onClose}
        className="p-1 rounded hover:bg-bg-surface-hover text-text-tertiary hover:text-text-primary"
        title="검색 닫기 (Esc)"
      >
        <X size={12} />
      </button>
    </div>
  )
}

function ToggleButton({
  label,
  title,
  active,
  onClick
}: {
  label: string
  title: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`px-1.5 py-0.5 rounded text-[calc(10px_*_var(--app-font-scale,1))] font-mono font-bold border ${
        active
          ? 'text-clauday-blue bg-bg-active border-bg-border-light'
          : 'text-text-tertiary border-transparent hover:bg-bg-surface-hover hover:text-text-secondary'
      }`}
    >
      {label}
    </button>
  )
}

export default TerminalSearchBar
