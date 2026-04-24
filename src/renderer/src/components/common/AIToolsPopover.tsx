import { useEffect, useRef, useState } from 'react'
import { Wrench, Check } from 'lucide-react'

interface AIToolsPopoverProps {
  /** AI 기능 식별자 — `settings.json`에 `aiMcpSelection[feature]`로 저장됨 */
  feature: string
  /** 버튼 크기 */
  size?: 'sm' | 'md'
  /** 선택된 MCP 서버 변경 콜백 (부모가 AI 호출 시 사용할 수 있게) */
  onChange?: (selected: string[]) => void
}

const SETTINGS_KEY = 'aiMcpSelection'

async function readSelectionMap(): Promise<Record<string, string[]>> {
  const raw = await window.api.settings.get(SETTINGS_KEY)
  const map: Record<string, string[]> = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(v)) map[k] = v.filter((x): x is string => typeof x === 'string')
    }
  }
  return map
}

async function writeSelectionMap(map: Record<string, string[]>): Promise<void> {
  await window.api.settings.set(SETTINGS_KEY, map)
}

/**
 * AI 호출 시 사용할 MCP 서버를 선택하는 popover.
 * - 각 AI 기능(feature)별로 별도 선택 저장 (settings.json)
 * - `loadSelected(feature)` 정적 메서드로 부모가 현재 저장된 목록을 읽어 AI 호출에 전달
 */
function AIToolsPopover({ feature, size = 'sm', onChange }: AIToolsPopoverProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [servers, setServers] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const popRef = useRef<HTMLDivElement>(null)

  // 초기 로드
  useEffect(() => {
    (async () => {
      const [mcpMap, selMap] = await Promise.all([
        window.api.mcp.list().catch(() => ({} as Record<string, unknown>)),
        readSelectionMap().catch(() => ({} as Record<string, string[]>))
      ])
      const names = Object.keys(mcpMap || {}).sort()
      setServers(names)
      const sel = selMap[feature] || []
      // 저장된 선택 중 현재 존재하지 않는 서버는 제거
      const valid = sel.filter((n) => names.includes(n))
      setSelected(new Set(valid))
      onChange?.(valid)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature])

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const toggle = async (name: string): Promise<void> => {
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelected(next)
    const arr = Array.from(next)
    onChange?.(arr)
    const map = await readSelectionMap()
    map[feature] = arr
    await writeSelectionMap(map)
  }

  const count = selected.size
  const tooltip = count > 0
    ? `AI 도구 (${count}개 활성)`
    : 'AI가 사용할 MCP 도구 선택'

  return (
    <div className="relative" ref={popRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`ds-btn ${size === 'md' ? 'sm' : 'xs'} icon relative`}
        title={tooltip}
        aria-label={tooltip}
      >
        <Wrench size={size === 'md' ? 13 : 12} />
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-[3px] rounded-full bg-clover-blue text-white text-[9px] font-bold flex items-center justify-center border-2 border-bg-primary"
            style={{ lineHeight: 1 }}
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="ds-menu absolute right-0 top-full mt-1 z-40"
          style={{ minWidth: 240, maxHeight: 320, overflowY: 'auto' }}
        >
          <div className="px-3 pt-2 pb-1.5 text-[10px] font-semibold text-text-tertiary border-b border-bg-border">
            AI에게 허용할 MCP 서버
          </div>
          {servers.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-text-tertiary">
              설치된 MCP 서버가 없습니다
            </div>
          ) : (
            <div className="py-1">
              {servers.map((name) => {
                const checked = selected.has(name)
                return (
                  <button
                    key={name}
                    onClick={() => toggle(name)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-surface-hover transition-colors"
                  >
                    <span
                      className={`w-[14px] h-[14px] rounded-[4px] flex items-center justify-center flex-none ${
                        checked ? 'bg-clover-blue' : 'bg-bg-border'
                      }`}
                    >
                      {checked && <Check size={10} className="text-white" />}
                    </span>
                    <span className="text-[12px] text-text-primary font-medium flex-1 truncate">{name}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="px-3 py-2 border-t border-bg-border text-[10px] text-text-tertiary leading-snug">
            선택한 MCP만 AI가 호출 가능. 아무것도 선택하지 않으면 MCP 없이 실행됨.
          </div>
        </div>
      )}
    </div>
  )
}

/** 부모가 AI 호출 직전에 최신 선택값을 읽을 때 사용 */
AIToolsPopover.loadSelected = async (feature: string): Promise<string[]> => {
  try {
    const map = await readSelectionMap()
    return map[feature] || []
  } catch {
    return []
  }
}

export default AIToolsPopover
