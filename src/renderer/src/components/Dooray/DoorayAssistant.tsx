import { useState } from 'react'
import {
  LogOut, Sparkles, ListTodo, BookOpen, Calendar as CalendarIcon, FileText
} from 'lucide-react'
import ProjectTaskView from './ProjectTaskView'
import BriefingPanel from './BriefingPanel'
import WikiManager from './WikiManager'
import CalendarAssistant from './CalendarAssistant'
import ReportGenerator from './ReportGenerator'

type Tab = 'tasks' | 'briefing' | 'report' | 'wiki' | 'calendar'

const AI_TABS = new Set<Tab>(['briefing', 'report'])

interface DoorayAssistantProps {
  onDisconnect?: () => void
}

function DoorayAssistant({ onDisconnect }: DoorayAssistantProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>('tasks')

  const tabs: { id: Tab; icon: typeof Sparkles; label: string }[] = [
    { id: 'tasks', icon: ListTodo, label: '태스크' },
    { id: 'briefing', icon: Sparkles, label: '브리핑' },
    { id: 'report', icon: FileText, label: '보고서' },
    { id: 'wiki', icon: BookOpen, label: '위키' },
    { id: 'calendar', icon: CalendarIcon, label: '캘린더' }
  ]

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

      <div className="flex-1 overflow-hidden">
        {activeTab === 'tasks' && <ProjectTaskView />}
        {activeTab === 'briefing' && <BriefingPanel />}
        {activeTab === 'report' && <ReportGenerator />}
        {activeTab === 'wiki' && <WikiManager />}
        {activeTab === 'calendar' && <CalendarAssistant />}
      </div>
    </div>
  )
}

export default DoorayAssistant
