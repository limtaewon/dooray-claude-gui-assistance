import { useCallback, useEffect, useRef } from 'react'
import { ChevronsRight, ClipboardList, FileDiff, GitBranch, GitCompare, History, type LucideIcon } from 'lucide-react'
import { clampDrawerWidth } from './drawerWidth'

export type DrawerTab = 'tasks' | 'changes' | 'branchDiff' | 'history' | 'branches'

export const DRAWER_TABS: {
  id: DrawerTab
  icon: LucideIcon
  label: string
  /** 도메인 식별색 — 두레이 기능은 파랑, 나머지(git)는 무채색 크롬 */
  accent?: string
}[] = [
  { id: 'tasks', icon: ClipboardList, label: '업무', accent: 'var(--brand-dooray)' },
  { id: 'changes', icon: FileDiff, label: '변경사항' },
  { id: 'branchDiff', icon: GitCompare, label: '브랜치 변경' },
  { id: 'history', icon: History, label: '히스토리' },
  { id: 'branches', icon: GitBranch, label: '브랜치' }
]

interface SideDrawerProps {
  tab: DrawerTab
  onTabChange: (tab: DrawerTab) => void
  onClose: () => void
  width: number
  onWidthChange: (width: number) => void
  /** 폭 드래그가 끝났을 때 — 호스트가 이때만 영속화한다(드래그 중 저장 폭주 방지) */
  onWidthCommit?: (width: number) => void
  /** 탭 바 아래 고정 영역 — 저장소 선택 등 */
  subheader?: React.ReactNode
  children: React.ReactNode
}

/**
 * 터미널 우측 작업 패널 셸. 상단 아이콘 탭 바 + (선택) 서브헤더 + 내용.
 * 왼쪽 모서리를 끌어 폭을 조절한다.
 */
function SideDrawer({
  tab,
  onTabChange,
  onClose,
  width,
  onWidthChange,
  onWidthCommit,
  subheader,
  children
}: SideDrawerProps): JSX.Element {
  const dragRef = useRef<{ startX: number; startWidth: number; latest: number } | null>(null)
  const frameRef = useRef<number | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = { startX: e.clientX, startWidth: width, latest: width }
    },
    [width]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      // 패널은 오른쪽에 있으므로 왼쪽으로 끌면(dx < 0) 넓어진다.
      const next = clampDrawerWidth(drag.startWidth - (e.clientX - drag.startX), window.innerWidth)
      drag.latest = next
      // rAF 로 합쳐 pointermove 폭주에도 리렌더가 프레임당 한 번만 일어나게 한다.
      if (frameRef.current !== null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        if (dragRef.current) onWidthChange(dragRef.current.latest)
      })
    },
    [onWidthChange]
  )

  const endDrag = useCallback(() => {
    const drag = dragRef.current
    dragRef.current = null
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    if (!drag) return
    onWidthChange(drag.latest)
    // 저장은 드래그가 끝날 때 한 번만 — 이동 중에 매번 쓰면 store 가 요동친다.
    onWidthCommit?.(drag.latest)
  }, [onWidthChange, onWidthCommit])

  // 창을 줄이면 터미널이 사라지지 않게 패널 폭을 따라 줄인다.
  useEffect(() => {
    const onResize = (): void => {
      const next = clampDrawerWidth(width, window.innerWidth)
      if (next !== width) onWidthChange(next)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [width, onWidthChange])

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
  }, [])

  return (
    <div
      className="relative flex-none flex flex-col min-h-0 border-l border-bg-border bg-bg-surface"
      style={{ width }}
    >
      {/* 리사이즈 핸들 — 히트박스는 넓게(6px), 시각선은 테두리에만 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="패널 폭 조절"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => { onWidthChange(320); onWidthCommit?.(320) }}
        className="absolute left-0 top-0 bottom-0 -ml-[3px] w-1.5 z-20 cursor-col-resize group"
      >
        <div className="absolute inset-y-0 left-[3px] w-px bg-transparent group-hover:bg-bg-border-strong transition-colors" />
      </div>

      <div className="flex items-center gap-0.5 px-1.5 h-9 flex-none border-b border-bg-border">
        {DRAWER_TABS.map(({ id, icon: Icon, label, accent }) => {
          const active = tab === id
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              data-tour={`drawer-tab-${id}`}
              aria-pressed={active}
              title={label}
              aria-label={label}
              className={`relative w-8 h-7 rounded-[6px] flex items-center justify-center transition-colors ${
                active ? 'bg-bg-active text-text-primary' : 'text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover'
              }`}
            >
              <Icon size={14} style={accent ? { color: accent } : undefined} />
            </button>
          )
        })}
        <button
          onClick={onClose}
          className="ml-auto w-7 h-7 rounded-[6px] flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover flex-none"
          title="패널 닫기 (⌘⇧T)"
          aria-label="패널 닫기"
        >
          <ChevronsRight size={13} />
        </button>
      </div>

      {subheader}
      {children}
    </div>
  )
}

export default SideDrawer
