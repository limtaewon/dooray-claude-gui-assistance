import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Settings2 } from 'lucide-react'
import {
  CLEANUP_PERIOD_PRESETS,
  DEFAULT_CLEANUP_PERIOD_DAYS,
  MAX_CLEANUP_PERIOD_DAYS,
  MIN_CLEANUP_PERIOD_DAYS,
  type ClaudeRetentionState
} from '@shared/types/claude-retention'
import { anchoredMenuPosition, type AnchoredMenuPosition } from '../common/anchoredMenu'
import { useToast } from '../common/ds'

const MENU_WIDTH = 268

/**
 * 세션 보관 기간 설정 — `~/.claude/settings.json` 의 `cleanupPeriodDays` 를 직접 고친다.
 *
 * claude 가 이 기간이 지난 세션 jsonl 을 지우기 때문에, 즐겨찾기해둔 세션도 목록에서 사라진다.
 * Clauday 가 가진 이름·별표는 원본이 사라지면 띄울 대상이 없으므로 여기서 기간을 늘려야 한다.
 */
function SessionRetentionMenu(): JSX.Element {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<AnchoredMenuPosition | null>(null)
  const [state, setState] = useState<ClaudeRetentionState | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)

  const load = async (): Promise<void> => {
    try {
      const next = await window.api.claude.retentionGet()
      setState(next)
      setDraft(String(next.days))
    } catch (err) {
      console.warn('[SessionRetentionMenu] 보관 기간 조회 실패:', err)
      setState(null)
    }
  }

  useEffect(() => {
    if (!open) return
    setError(null)
    void load()
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const place = (): void => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setPos(
        anchoredMenuPosition(rect, { width: MENU_WIDTH }, {
          width: window.innerWidth,
          height: window.innerHeight
        })
      )
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const save = async (days: number | null): Promise<void> => {
    setSaving(true)
    setError(null)
    try {
      const next = await window.api.claude.retentionSet(days)
      setState(next)
      setDraft(String(next.days))
      toast.success(
        days === null
          ? `보관 기간을 기본값(${DEFAULT_CLEANUP_PERIOD_DAYS}일)으로 되돌렸습니다`
          : `보관 기간을 ${days}일로 바꿨습니다`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = (): void => {
    const parsed = Number(draft.trim())
    if (!Number.isInteger(parsed)) {
      setError('보관 기간은 정수(일)여야 합니다')
      return
    }
    void save(parsed)
  }

  const unreadable = state?.source === 'unreadable'

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="세션 보관 기간 설정"
        title="세션 보관 기간 — claude 가 오래된 기록을 지웁니다"
        data-tour="session-retention"
        className="hover:text-text-secondary"
      >
        <Settings2 size={10} />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
            <div
              role="dialog"
              aria-label="세션 보관 기간"
              className="fixed z-[71] flex flex-col rounded-md border border-bg-border bg-bg-surface-raised shadow-xl overflow-hidden"
              style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }}
            >
              <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2.5">
                <div>
                  <p className="text-[calc(11.5px_*_var(--app-font-scale,1))] font-semibold text-text-primary">
                    세션 보관 기간
                  </p>
                  <p className="mt-1 text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary leading-relaxed">
                    Claude Code 가 이 기간이 지난 세션 기록을 지웁니다. 지워지면 즐겨찾기해둔
                    세션도 목록에서 사라집니다.
                  </p>
                </div>

                {unreadable ? (
                  <div className="flex items-start gap-1.5 rounded-md bg-c-red-bg px-2 py-1.5">
                    <AlertTriangle size={11} className="flex-none mt-0.5 text-c-red-fg" />
                    <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-c-red-fg leading-relaxed">
                      설정 파일을 읽지 못했습니다. 덮어쓰면 다른 설정이 날아가므로 저장을
                      막았습니다 — 파일을 고친 뒤 다시 열어주세요.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-secondary">
                      지금{' '}
                      <span className="font-semibold text-text-primary">{state?.days ?? '…'}일</span>
                      {state?.source === 'default' && (
                        <span className="text-text-tertiary"> (claude 기본값)</span>
                      )}
                    </p>

                    <div className="flex flex-wrap gap-1">
                      {CLEANUP_PERIOD_PRESETS.map((days) => (
                        <button
                          key={days}
                          type="button"
                          disabled={saving}
                          onClick={() => void save(days)}
                          className={`ds-chip ${
                            state?.source === 'settings' && state.days === days
                              ? 'selected'
                              : 'neutral'
                          } cursor-pointer disabled:opacity-50`}
                        >
                          {days}일
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={draft}
                        min={MIN_CLEANUP_PERIOD_DAYS}
                        max={MAX_CLEANUP_PERIOD_DAYS}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            saveDraft()
                          }
                        }}
                        aria-label="보관 기간(일)"
                        className="ds-input flex-1 min-w-0 text-[calc(11px_*_var(--app-font-scale,1))]"
                      />
                      <span className="flex-none text-[calc(10.5px_*_var(--app-font-scale,1))] text-text-tertiary">
                        일
                      </span>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={saveDraft}
                        className="ds-btn secondary xs flex-none"
                      >
                        저장
                      </button>
                    </div>

                    {state?.source === 'settings' && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void save(null)}
                        className="self-start text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary hover:text-text-primary"
                      >
                        기본값({DEFAULT_CLEANUP_PERIOD_DAYS}일)으로 되돌리기
                      </button>
                    )}
                  </>
                )}

                {error && (
                  <p className="text-[calc(11px_*_var(--app-font-scale,1))] text-c-red-fg leading-relaxed">
                    {error}
                  </p>
                )}

                {state?.settingsPath && (
                  <p className="font-mono text-[calc(11px_*_var(--app-font-scale,1))] text-text-tertiary truncate">
                    {state.settingsPath}
                  </p>
                )}
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  )
}

export default SessionRetentionMenu
