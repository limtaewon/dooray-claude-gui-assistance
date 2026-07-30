/**
 * 탭바 우측 렌더러 전환 드롭다운 (v2.0 B-6, ADR-v2-terminal-p2-04 §4) — 목업 `.rbtn`/`.rmenu` 매핑.
 * 현재 렌더러 상태(dot + 라벨)를 보여주고 WebGL/DOM 을 수동 전환한다. 실제 attach 판정은
 * `webglPolicy.shouldAttachWebgl` 이 pane 별로 하고, 이 컴포넌트는 사용자 설정값만 들고 있다.
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type TerminalRendererSetting = 'webgl' | 'dom'

interface RendererToggleProps {
  setting: TerminalRendererSetting
  /** true 면 setting==='webgl' 이라도 실제로는 DOM 으로 폴백 중임을 라벨에 표시한다("DOM (폴백)"). */
  fellBack: boolean
  onChange: (next: TerminalRendererSetting) => void
}

export default function RendererToggle({ setting, fellBack, onChange }: RendererToggleProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const label = setting === 'dom' ? 'DOM' : (fellBack ? 'DOM (폴백)' : 'WebGL')
  const dotClass = setting === 'dom' || fellBack ? 'bg-text-tertiary' : 'bg-[var(--c-emerald-solid)]'

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[calc(10px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover"
        title="터미널 렌더러 전환"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        렌더러: <b className="text-text-secondary font-medium">{label}</b>
        <ChevronDown size={10} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-52 rounded-lg shadow-lg overflow-hidden"
          style={{ background: 'var(--bg-surface-raised)', border: '1px solid var(--bg-border)' }}
        >
          {(['webgl', 'dom'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-bg-surface-hover ${
                setting === opt ? 'bg-clauday-blue/10' : ''
              }`}
            >
              <span className="w-3.5 text-clauday-blue text-[calc(11px_*_var(--app-font-scale,1))]">
                {setting === opt ? '✓' : ''}
              </span>
              <span className="flex-1 min-w-0">
                <p className="text-[calc(11px_*_var(--app-font-scale,1))] font-semibold text-text-primary">
                  {opt === 'webgl' ? 'WebGL' : 'DOM'}
                </p>
                <p className="text-[calc(9.5px_*_var(--app-font-scale,1))] text-text-tertiary mt-0.5">
                  {opt === 'webgl' ? 'GPU 가속 · 기본값' : '호환 모드 · GPU 문제 시 폴백'}
                </p>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
