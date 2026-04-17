import { useState, useEffect, useRef } from 'react'
import Sidebar from './components/Layout/Sidebar'
import TitleBar from './components/Layout/TitleBar'
import MCPManager from './components/MCP/MCPManager'
import SkillsManager from './components/Skills/SkillsManager'
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

type View = 'mcp' | 'skills' | 'usage' | 'dooray' | 'terminal' | 'manual' | 'sessions' | 'git' | 'settings' | 'community' | 'monitoring'

function App(): JSX.Element {
  const [activeView, setActiveView] = useState<View>('dooray')
  const [doorayConfigured, setDoorayConfigured] = useState(false)

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

  // 뷰별 visibility 클래스 — 모든 뷰를 항상 마운트해서 AI 작업 등이 백그라운드에서도 유지되게 함
  const vis = (view: View): string =>
    activeView === view ? 'z-10' : 'z-0 pointer-events-none invisible'

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <main className="flex-1 overflow-hidden relative">
          {/* 모든 뷰는 항상 마운트 (탭 전환 시 작업·상태 유지).
              보이지 않을 때는 pointer-events/invisible로 숨김. */}
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
          <div className={`absolute inset-0 ${vis('mcp')}`}>
            <MCPManager />
          </div>
          <div className={`absolute inset-0 ${vis('skills')}`}>
            <SkillsManager />
          </div>
          <div className={`absolute inset-0 ${vis('community')}`}>
            <CommunityView />
          </div>
          <div className={`absolute inset-0 ${vis('monitoring')}`}>
            <MonitoringView />
          </div>
          <div className={`absolute inset-0 ${vis('sessions')}`}>
            <SessionExplorer />
          </div>
          <div className={`absolute inset-0 ${vis('usage')}`}>
            <UsageDashboard />
          </div>
          <div className={`absolute inset-0 ${vis('manual')}`}>
            <ClaudeManual />
          </div>
          <div className={`absolute inset-0 ${vis('settings')}`}>
            <SettingsView />
          </div>
        </main>
      </div>
      {/* 이미지 클릭 시 전체화면 라이트박스 (최상단 렌더) */}
      <ImageLightbox />
    </div>
  )
}

export default App
