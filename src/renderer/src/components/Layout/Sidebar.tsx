import { Server, Sparkles, BarChart3, Calendar, Terminal, BookOpen, MessageSquare, GitBranch, Settings } from 'lucide-react'

type View = 'mcp' | 'skills' | 'usage' | 'dooray' | 'terminal' | 'manual' | 'sessions' | 'git' | 'settings'

interface SidebarProps {
  activeView: View
  onViewChange: (view: View) => void
}

const NAV_ITEMS: { view: View; icon: typeof Server; label: string }[] = [
  { view: 'dooray', icon: Calendar, label: '두레이' },
  { view: 'terminal', icon: Terminal, label: '터미널' },
  { view: 'mcp', icon: Server, label: 'MCP 서버' },
  { view: 'skills', icon: Sparkles, label: '스킬' },
  { view: 'git', icon: GitBranch, label: '브랜치 작업' },
  { view: 'sessions', icon: MessageSquare, label: '세션' },
  { view: 'usage', icon: BarChart3, label: '사용량' },
  { view: 'manual', icon: BookOpen, label: '매뉴얼' },
  { view: 'settings', icon: Settings, label: '설정' }
]

function Sidebar({ activeView, onViewChange }: SidebarProps): JSX.Element {
  return (
    <aside className="w-16 bg-bg-surface border-r border-bg-border flex flex-col items-center py-4 gap-2">
      {NAV_ITEMS.map(({ view, icon: Icon, label }) => (
        <button
          key={view}
          onClick={() => onViewChange(view)}
          title={label}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${
            activeView === view
              ? 'bg-gradient-to-br from-clover-blue to-clover-blue/80 text-white shadow-lg shadow-clover-blue/20'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
          }`}
        >
          <Icon size={20} />
        </button>
      ))}
    </aside>
  )
}

export default Sidebar
