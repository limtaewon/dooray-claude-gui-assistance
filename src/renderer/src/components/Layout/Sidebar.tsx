import { useEffect, useState } from 'react'
import { Server, Sparkles, BarChart3, Calendar, Terminal, BookOpen, MessageSquare, GitBranch, Settings, Users, Radar, Lightbulb } from 'lucide-react'

type View = 'mcp' | 'skills' | 'usage' | 'dooray' | 'terminal' | 'manual' | 'sessions' | 'git' | 'settings' | 'community' | 'monitoring' | 'ai-recommend'

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
      { view: 'ai-recommend', icon: Lightbulb, label: 'AI 추천' },
      { view: 'sessions', icon: MessageSquare, label: '세션' },
      { view: 'usage', icon: BarChart3, label: '사용량' }
    ]
  }
]

const STANDALONE_ITEMS: NavItem[] = [
  { view: 'manual', icon: BookOpen, label: '매뉴얼' },
  { view: 'settings', icon: Settings, label: '설정' }
]

/** Design System v1 Sidebar (56px). 36×36 버튼, 20px 아이콘, 활성 상태 blue 그라디언트.
 *  불투명도 낮은 분리선으로 그룹 구분. */
function NavButton({
  view, icon: Icon, label, active, onClick, badge, pulse
}: NavItem & { active: boolean; onClick: () => void; badge?: number; pulse?: boolean }): JSX.Element {
  return (
    <button
      key={view}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`relative w-9 h-9 rounded-[7px] flex items-center justify-center transition-all duration-150 ${
        active
          ? 'bg-gradient-to-br from-clover-blue to-clover-blue/80 text-white shadow-md shadow-clover-blue/20'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
      }`}
    >
      <Icon size={20} />
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-clover-orange text-white text-[9px] font-bold flex items-center justify-center border-2 border-bg-surface">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {pulse && (!badge || badge === 0) && (
        <span className="absolute top-0.5 right-0.5 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-clover-orange opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-clover-orange" />
        </span>
      )}
    </button>
  )
}

function Sidebar({ activeView, onViewChange }: SidebarProps): JSX.Element {
  const [monitoringUnread, setMonitoringUnread] = useState(0)
  const [monitoringPulse, setMonitoringPulse] = useState(false)

  useEffect(() => {
    const refresh = async (): Promise<void> => {
      try {
        const counts = await window.api.watcher.unreadCounts()
        const total = Object.values(counts).reduce((a, b) => a + b, 0)
        setMonitoringUnread(total)
      } catch { /* ignore */ }
    }
    refresh()
    const unsub = window.api.watcher.onNewMessages(({ messages }) => {
      refresh()
      if (messages && messages.length > 0) setMonitoringPulse(true)
    })
    const timer = setInterval(refresh, 10_000)
    return () => { unsub(); clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (activeView === 'monitoring') setMonitoringPulse(false)
  }, [activeView])

  return (
    <aside className="w-14 bg-bg-surface border-r border-bg-border flex flex-col items-center py-2 gap-0.5 flex-shrink-0">
      {NAV_GROUPS.map((group, i) => (
        <div key={group.key} className="flex flex-col items-center gap-0.5 w-full">
          {group.items.map((item) => (
            <NavButton
              key={item.view}
              {...item}
              active={activeView === item.view}
              onClick={() => onViewChange(item.view)}
              badge={item.view === 'monitoring' ? monitoringUnread : undefined}
              pulse={item.view === 'monitoring' ? monitoringPulse : undefined}
            />
          ))}
          {i < NAV_GROUPS.length - 1 && (
            <div className="w-7 h-px bg-bg-border/60 my-1" />
          )}
        </div>
      ))}
      <div className="flex-1" />
      <div className="w-7 h-px bg-bg-border/60 my-1" />
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
