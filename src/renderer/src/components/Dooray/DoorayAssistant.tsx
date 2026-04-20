import { useState } from 'react'
import {
  LogOut, Sparkles, ListTodo, BookOpen, Calendar as CalendarIcon, FileText, MessageCircle, LayoutDashboard
} from 'lucide-react'
import ProjectTaskView from './ProjectTaskView'
import BriefingPanel from './BriefingPanel'
import WikiManager from './WikiManager'
import CalendarAssistant from './CalendarAssistant'
import ReportGenerator from './ReportGenerator'
import MessengerAssistant from './MessengerAssistant'
import DashboardView from './DashboardView'
import TeamInsights from './TeamInsights'

type Tab = 'dashboard' | 'tasks' | 'wiki' | 'calendar' | 'messenger' | 'briefing' | 'report' | 'insights'

const AI_TABS = new Set<Tab>(['dashboard', 'briefing', 'report', 'messenger', 'insights'])

interface DoorayAssistantProps {
  onDisconnect?: () => void
}

function DoorayAssistant({ onDisconnect }: DoorayAssistantProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')

  const tabs: { id: Tab; icon: typeof Sparkles; label: string }[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: '대시보드' },
    { id: 'tasks', icon: ListTodo, label: '태스크' },
    { id: 'wiki', icon: BookOpen, label: '위키' },
    { id: 'calendar', icon: CalendarIcon, label: '캘린더' },
    { id: 'messenger', icon: MessageCircle, label: '메신저' },
    { id: 'briefing', icon: Sparkles, label: '브리핑' },
    { id: 'report', icon: FileText, label: '보고서' },
    { id: 'insights', icon: Sparkles, label: '인사이트' }
  ]

  const vis = (tab: Tab): string =>
    activeTab === tab ? 'z-10' : 'z-0 pointer-events-none invisible'

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center h-10 bg-bg-surface border-b border-bg-border px-3 gap-0.5 flex-shrink-0">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition-all ${
              activeTab === id
                ? AI_TABS.has(id)
                  ? 'bg-gradient-to-r from-clover-orange/20 to-clover-blue/20 text-text-primary'
                  : 'bg-clover-blue/10 text-clover-blue'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
            }`}
          >
            <Icon size={13} className={activeTab === id && AI_TABS.has(id) ? 'text-clover-orange' : ''} />
            {label}
          </button>
        ))}
        <div className="ml-auto">
          {onDisconnect && (
            <button
              onClick={onDisconnect}
              className="flex items-center gap-1 text-[10px] text-text-secondary hover:text-red-400 transition-colors"
            >
              <LogOut size={12} />
              연결 해제
            </button>
          )}
        </div>
      </div>

      {/* 모든 탭 항상 마운트 — AI 작업 백그라운드 유지 */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${vis('dashboard')}`}><DashboardView /></div>
        <div className={`absolute inset-0 ${vis('tasks')}`}><ProjectTaskView /></div>
        <div className={`absolute inset-0 ${vis('wiki')}`}><WikiManager /></div>
        <div className={`absolute inset-0 ${vis('calendar')}`}><CalendarAssistant /></div>
        <div className={`absolute inset-0 ${vis('messenger')}`}><MessengerAssistant /></div>
        <div className={`absolute inset-0 ${vis('briefing')}`}><BriefingPanel /></div>
        <div className={`absolute inset-0 ${vis('report')}`}><ReportGenerator /></div>
        <div className={`absolute inset-0 ${vis('insights')}`}><TeamInsights /></div>
      </div>
    </div>
  )
}

export default DoorayAssistant
