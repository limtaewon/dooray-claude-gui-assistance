import { ChevronsRight, ClipboardList, FileDiff, GitBranch, History, type LucideIcon } from 'lucide-react'

export type DrawerTab = 'tasks' | 'changes' | 'history' | 'branches'

export const DRAWER_TABS: {
  id: DrawerTab
  icon: LucideIcon
  label: string
  /** 도메인 식별색 — 두레이 기능은 파랑, 나머지(git)는 무채색 크롬 */
  accent?: string
}[] = [
  { id: 'tasks', icon: ClipboardList, label: '두레이 업무', accent: 'var(--brand-dooray)' },
  { id: 'changes', icon: FileDiff, label: '변경사항' },
  { id: 'history', icon: History, label: '히스토리' },
  { id: 'branches', icon: GitBranch, label: '브랜치' }
]

interface SideDrawerProps {
  tab: DrawerTab
  onTabChange: (tab: DrawerTab) => void
  onClose: () => void
  children: React.ReactNode
}

/**
 * 터미널 우측 드로어 셸. 상단 아이콘 탭 바 + 내용.
 * 폭 320px 고정 — 아이콘 4개(40px)는 여유롭게 들어가므로 오버플로 처리는 두지 않는다.
 */
function SideDrawer({ tab, onTabChange, onClose, children }: SideDrawerProps): JSX.Element {
  return (
    <div className="w-[320px] flex-none flex flex-col min-h-0 border-l border-bg-border bg-bg-surface">
      <div className="flex items-center gap-0.5 px-1.5 h-9 flex-none border-b border-bg-border">
        {DRAWER_TABS.map(({ id, icon: Icon, label, accent }) => {
          const active = tab === id
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
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
      {children}
    </div>
  )
}

export default SideDrawer
