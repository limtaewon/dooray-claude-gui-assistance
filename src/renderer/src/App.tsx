import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Calendar as CalendarIcon, Terminal as TerminalIcon, GitBranch, Users, Server, Sparkles,
  MessageSquare, BarChart3, BookOpen, Settings as SettingsIcon, Radar, Moon, Sun, Lightbulb
} from 'lucide-react'
import Sidebar from './components/Layout/Sidebar'
import TitleBar from './components/Layout/TitleBar'
import MCPManager from './components/MCP/MCPManager'
import SkillsManager from './components/Skills/SkillsManager'
import ErrorBoundary from './components/common/ErrorBoundary'
import UsageDashboard from './components/Usage/UsageDashboard'
import DooraySetup from './components/Dooray/DooraySetup'
import DoorayAssistant from './components/Dooray/DoorayAssistant'
import TerminalView from './components/Terminal/TerminalView'
import ClaudeManual from './components/ClaudeManual/ClaudeManual'
import SessionExplorer from './components/Sessions/SessionExplorer'
import BranchWorkspace from './components/Git/BranchWorkspace'
import SettingsView from './components/Settings/SettingsView'
import ImageLightbox from './components/common/ImageLightbox'
import CommunityView from './components/Community/CommunityView'
import MonitoringView from './components/Monitoring/MonitoringView'
import AIRecommendView from './components/AIRecommend/AIRecommendView'
import { ToastHost, CommandPalette, type CommandGroup, type CommandItem } from './components/common/ds'
import { useTheme } from './hooks/useTheme'

type View = 'mcp' | 'skills' | 'usage' | 'dooray' | 'terminal' | 'manual' | 'sessions' | 'git' | 'settings' | 'community' | 'monitoring' | 'ai-recommend'

function App(): JSX.Element {
  const [activeView, setActiveView] = useState<View>('dooray')
  const [doorayConfigured, setDoorayConfigured] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const { theme, toggle: toggleTheme } = useTheme()

  // 앱 시작 시 startupView 설정 적용
  useEffect(() => {
    (async () => {
      const v = await window.api.settings.get('startupView') as string | null
      if (v === 'last') {
        const last = await window.api.settings.get('lastView') as View | null
        if (last) setActiveView(last)
      } else if (v && ['dooray', 'terminal', 'git'].includes(v)) {
        setActiveView(v as View)
      }
    })()
  }, [])

  // 뷰 변경 시 lastView 기록 + analytics
  const dwellStartRef = useRef<{ view: View; at: number } | null>(null)
  useEffect(() => {
    window.api.settings.set('lastView', activeView)
    const prev = dwellStartRef.current
    if (prev && prev.view !== activeView) {
      window.api.analytics.track('view.dwell', {
        durationMs: Date.now() - prev.at,
        meta: { view: prev.view }
      })
    }
    window.api.analytics.track('view.open', { meta: { view: activeView } })
    dwellStartRef.current = { view: activeView, at: Date.now() }
  }, [activeView])

  // ⌘K 글로벌 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 커맨드 팔레트 그룹 구성
  const commandGroups = useMemo<CommandGroup[]>(() => [
    {
      label: '이동',
      items: [
        { id: 'go-dooray', label: '두레이 대시보드', icon: <CalendarIcon size={13} />, hint: '⌘1' },
        { id: 'go-monitoring', label: '모니터링', icon: <Radar size={13} />, hint: '⌘2' },
        { id: 'go-terminal', label: '터미널', icon: <TerminalIcon size={13} />, hint: '⌘3' },
        { id: 'go-git', label: '브랜치 작업', icon: <GitBranch size={13} />, hint: '⌘4' },
        { id: 'go-community', label: '커뮤니티', icon: <Users size={13} /> },
        { id: 'go-mcp', label: 'MCP 서버', icon: <Server size={13} /> },
        { id: 'go-skills', label: 'Claude 스킬', icon: <Sparkles size={13} /> },
        { id: 'go-ai-recommend', label: 'AI 추천', icon: <Lightbulb size={13} /> },
        { id: 'go-sessions', label: '세션', icon: <MessageSquare size={13} /> },
        { id: 'go-usage', label: '사용량', icon: <BarChart3 size={13} /> },
        { id: 'go-manual', label: '매뉴얼', icon: <BookOpen size={13} /> },
        { id: 'go-settings', label: '설정', icon: <SettingsIcon size={13} /> }
      ]
    },
    {
      label: '명령',
      items: [
        {
          id: 'toggle-theme',
          label: theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환',
          icon: theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />,
          hint: ''
        }
      ]
    }
  ], [theme])

  const runCommand = (item: CommandItem): void => {
    if (item.id.startsWith('go-')) {
      const view = item.id.slice(3) as View
      setActiveView(view)
      return
    }
    if (item.id === 'toggle-theme') toggleTheme()
  }

  // 뷰별 visibility — 항상 마운트
  const vis = (view: View): string =>
    activeView === view ? 'z-10' : 'z-0 pointer-events-none invisible'

  return (
    <ToastHost>
      <div className="flex flex-col h-full bg-bg-primary">
        <TitleBar onOpenCommandPalette={() => setCmdOpen(true)} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar activeView={activeView} onViewChange={setActiveView} />
          <main className="flex-1 overflow-hidden relative">
            <div className={`absolute inset-0 ${vis('dooray')}`}>
              {doorayConfigured ? (
                <DoorayAssistant onDisconnect={async () => {
                  if (!window.confirm('두레이 연결을 해제할까요?\n저장된 API 토큰이 제거되고 다시 로그인해야 합니다.')) return
                  await window.api.dooray.deleteToken()
                  setDoorayConfigured(false)
                }} />
              ) : (
                <DooraySetup onConfigured={() => setDoorayConfigured(true)} />
              )}
            </div>
            <div className={`absolute inset-0 ${vis('terminal')}`}>
              <TerminalView />
            </div>
            <div className={`absolute inset-0 ${vis('git')}`}>
              <BranchWorkspace onOpenTerminal={() => setActiveView('terminal')} />
            </div>
            <div className={`absolute inset-0 ${vis('mcp')}`}><MCPManager /></div>
            <div className={`absolute inset-0 ${vis('skills')}`}>
              <ErrorBoundary label="Skills"><SkillsManager /></ErrorBoundary>
            </div>
            <div className={`absolute inset-0 ${vis('ai-recommend')}`}>
              <ErrorBoundary label="AI Recommend"><AIRecommendView /></ErrorBoundary>
            </div>
            <div className={`absolute inset-0 ${vis('community')}`}><CommunityView /></div>
            <div className={`absolute inset-0 ${vis('monitoring')}`}><MonitoringView /></div>
            <div className={`absolute inset-0 ${vis('sessions')}`}><SessionExplorer /></div>
            <div className={`absolute inset-0 ${vis('usage')}`}><UsageDashboard /></div>
            <div className={`absolute inset-0 ${vis('manual')}`}><ClaudeManual /></div>
            <div className={`absolute inset-0 ${vis('settings')}`}><SettingsView /></div>
          </main>
        </div>
        <ImageLightbox />
        <CommandPalette
          open={cmdOpen}
          onClose={() => setCmdOpen(false)}
          groups={commandGroups}
          onRun={runCommand}
        />
      </div>
    </ToastHost>
  )
}

export default App
