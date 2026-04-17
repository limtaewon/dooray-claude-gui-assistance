import { useEffect, useState } from 'react'
import { Server, Sparkles, BarChart3, Calendar, Terminal, BookOpen, MessageSquare, GitBranch, Settings, Users, Radar } from 'lucide-react'

type View = 'mcp' | 'skills' | 'usage' | 'dooray' | 'terminal' | 'manual' | 'sessions' | 'git' | 'settings' | 'community' | 'monitoring'

interface SidebarProps {
  activeView: View
  onViewChange: (view: View) => void
}

interface NavItem { view: View; icon: typeof Server; label: string }

const NAV_GROUPS: { key: string; label: string; items: NavItem[] }[] = [
  {
    key: 'work',
    label: '작업 영역',
    items: [
      { view: 'dooray', icon: Calendar, label: '두레이' },
      { view: 'monitoring', icon: Radar, label: '모니터링' },
      { view: 'terminal', icon: Terminal, label: '터미널' },
      { view: 'git', icon: GitBranch, label: '브랜치 작업' },
      { view: 'community', icon: Users, label: '커뮤니티' }
    ]
  },
  {
    key: 'tools',
    label: '도구',
    items: [
      { view: 'mcp', icon: Server, label: 'MCP 서버' },
      { view: 'skills', icon: Sparkles, label: 'Claude 스킬' },
      { view: 'sessions', icon: MessageSquare, label: '세션' },
      { view: 'usage', icon: BarChart3, label: '사용량' }
    ]
  }
]

const STANDALONE_ITEMS: NavItem[] = [
  { view: 'manual', icon: BookOpen, label: '매뉴얼' },
  { view: 'settings', icon: Settings, label: '설정' }
]

function NavButton({ view, icon: Icon, label, active, onClick, badge }: NavItem & { active: boolean; onClick: () => void; badge?: number }): JSX.Element {
  return (
    <button
      key={view}
      onClick={onClick}
      title={label}
      className={`relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${
        active
          ? 'bg-gradient-to-br from-clover-blue to-clover-blue/80 text-white shadow-lg shadow-clover-blue/20'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
      }`}
    >
      <Icon size={20} />
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-clover-orange text-white text-[9px] font-bold flex items-center justify-center border-2 border-bg-surface">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function Sidebar({ activeView, onViewChange }: SidebarProps): JSX.Element {
  const [monitoringUnread, setMonitoringUnread] = useState(0)

  // 모니터링 배지 갱신
  useEffect(() => {
    const refresh = async (): Promise<void> => {
      try {
        const counts = await window.api.watcher.unreadCounts()
        const total = Object.values(counts).reduce((a, b) => a + b, 0)
        setMonitoringUnread(total)
      } catch { /* ignore */ }
    }
    refresh()
    const unsub = window.api.watcher.onNewMessages(() => refresh())
    // activeView가 monitoring이면 주기적으로도 갱신(읽음 처리 후 배지 감소 반영)
    const timer = setInterval(refresh, 10_000)
    return () => { unsub(); clearInterval(timer) }
  }, [])

  return (
    <aside className="w-16 bg-bg-surface border-r border-bg-border flex flex-col items-center py-3 gap-1.5">
      {NAV_GROUPS.map((group, i) => (
        <div key={group.key} className="flex flex-col items-center gap-1.5 w-full">
          {group.items.map((item) => (
            <NavButton
              key={item.view}
              {...item}
              active={activeView === item.view}
              onClick={() => onViewChange(item.view)}
              badge={item.view === 'monitoring' ? monitoringUnread : undefined}
            />
          ))}
          {i < NAV_GROUPS.length - 1 && (
            <div className="w-8 h-px bg-bg-border/60 my-1" />
          )}
        </div>
      ))}
      {/* 매뉴얼/설정은 하단에 별도 배치 */}
      <div className="flex-1" />
      <div className="w-8 h-px bg-bg-border/60 my-1" />
      {STANDALONE_ITEMS.map((item) => (
        <NavButton
          key={item.view}
          {...item}
          active={activeView === item.view}
          onClick={() => onViewChange(item.view)}
        />
      ))}
    </aside>
  )
}

export default Sidebar
