import { useState, useEffect } from 'react'
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

type Tab = 'dashboard' | 'tasks' | 'wiki' | 'calendar' | 'messenger' | 'briefing' | 'report'

const AI_TABS = new Set<Tab>(['dashboard', 'briefing', 'report', 'messenger'])

interface DoorayAssistantProps {
  onDisconnect?: () => void
}

function DoorayAssistant({ onDisconnect }: DoorayAssistantProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')

  // #4 Cmd+E 의 Recent Views 가 두레이 sub-tab 별로 분리되도록 변경 시 알림 + 외부 이동 명령 수신
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('dooray-subtab', { detail: { tab: activeTab } }))
  }, [activeTab])
  useEffect(() => {
    const onGoto = (e: Event): void => {
      const tab = (e as CustomEvent<{ tab?: Tab }>).detail?.tab
      if (tab) setActiveTab(tab)
    }
    window.addEventListener('goto-dooray-subtab', onGoto as EventListener)
    return () => window.removeEventListener('goto-dooray-subtab', onGoto as EventListener)
  }, [])

  const tabs: { id: Tab; icon: typeof Sparkles; label: string }[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: '대시보드' },
    { id: 'tasks', icon: ListTodo, label: '태스크' },
    { id: 'wiki', icon: BookOpen, label: '위키' },
    { id: 'calendar', icon: CalendarIcon, label: '캘린더' },
    { id: 'messenger', icon: MessageCircle, label: '메신저' },
    { id: 'briefing', icon: Sparkles, label: '브리핑' },
    { id: 'report', icon: FileText, label: '보고서' }
  ]

  const vis = (tab: Tab): string =>
    activeTab === tab ? 'z-10' : 'z-0 pointer-events-none invisible'

  return (
    <div className="h-full flex flex-col">
      <div className="ds-tabbar">
        {tabs.map(({ id, icon: Icon, label }) => {
          const active = activeTab === id
          const aiActive = active && AI_TABS.has(id)
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`ds-tab ${aiActive ? 'ai' : ''} ${active ? 'active' : ''}`}
            >
              <Icon size={12} className={aiActive ? 'text-clauday-orange' : ''} />
              {label}
            </button>
          )
        })}
        <div className="ml-auto flex items-center gap-1 pr-1">
          {onDisconnect && (
            <button
              onClick={onDisconnect}
              className="flex items-center gap-1 text-[calc(10px_*_var(--app-font-scale,1))] text-text-secondary hover:text-red-400 transition-colors"
            >
              <LogOut size={11} />
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
      </div>
    </div>
  )
}

export default DoorayAssistant
