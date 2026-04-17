import { useState } from 'react'
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

type View = 'mcp' | 'skills' | 'usage' | 'dooray' | 'terminal' | 'manual' | 'sessions' | 'git' | 'settings'

function App(): JSX.Element {
  const [activeView, setActiveView] = useState<View>('dooray')
  const [doorayConfigured, setDoorayConfigured] = useState(false)

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
        <main className="flex-1 overflow-hidden relative">
          {/* 터미널은 항상 마운트 (탭 전환 시 세션 유지) */}
          <div className={`absolute inset-0 ${activeView === 'terminal' ? 'z-10' : 'z-0 pointer-events-none invisible'}`}>
            <TerminalView />
          </div>

          {/* 브랜치 작업도 항상 마운트 (워크트리 상태 유지) */}
          <div className={`absolute inset-0 ${activeView === 'git' ? 'z-10' : 'z-0 pointer-events-none invisible'}`}>
            <BranchWorkspace onOpenTerminal={() => setActiveView('terminal')} />
          </div>

          {/* 나머지 뷰는 조건부 렌더링 */}
          {activeView === 'dooray' && (
            doorayConfigured ? (
              <DoorayAssistant onDisconnect={async () => { await window.api.dooray.deleteToken(); setDoorayConfigured(false) }} />
            ) : (
              <DooraySetup onConfigured={() => setDoorayConfigured(true)} />
            )
          )}
          {activeView === 'mcp' && <MCPManager />}
          {activeView === 'skills' && <SkillsManager />}
          {activeView === 'usage' && <UsageDashboard />}
          {activeView === 'manual' && <ClaudeManual />}
          {activeView === 'sessions' && <SessionExplorer />}
          {activeView === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  )
}

export default App
