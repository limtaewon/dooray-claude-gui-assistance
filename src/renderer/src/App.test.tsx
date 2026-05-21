/**
 * App.tsx 통합 테스트 — view 라우팅(activeView) 검증.
 *
 * App 은 너무 많은 무거운 컴포넌트(BranchWorkspace, DoorayAssistant, TerminalView,
 * Monaco/xterm 의존)를 끌어들이므로 각 view 컴포넌트는 가벼운 stub 으로 교체한다.
 * App 자체의 책임은:
 *  - settings('startupView') → 초기 activeView 결정
 *  - Sidebar 항목 클릭 시 view 전환
 *  - view 전환 시 analytics.track 호출
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockWindowApi, resetMockWindowApi } from '../../../test/helpers/mockWindowApi'

// 무거운 자식 컴포넌트 stub — view 별로 식별 가능한 텍스트만 노출.
// vi.mock 은 파일 최상단으로 호이스트되므로 factory 안에서만 식별자 사용 가능.
vi.mock('./components/MCP/MCPManager', () => ({
  default: (): JSX.Element => <div data-testid="view-mcp">mcp</div>
}))
vi.mock('./components/Skills/SkillsManager', () => ({
  default: (): JSX.Element => <div data-testid="view-skills">skills</div>
}))
vi.mock('./components/Usage/UsageDashboard', () => ({
  default: (): JSX.Element => <div data-testid="view-usage">usage</div>
}))
vi.mock('./components/Dooray/DooraySetup', () => ({
  default: ({ onConfigured }: { onConfigured: () => void }): JSX.Element => (
    <div data-testid="view-dooray-setup">
      <button type="button" onClick={onConfigured}>setup-done</button>
    </div>
  )
}))
vi.mock('./components/Dooray/DoorayAssistant', () => ({
  default: (): JSX.Element => <div data-testid="view-dooray-assistant">dooray-assistant</div>
}))
vi.mock('./components/Terminal/TerminalView', () => ({
  default: (): JSX.Element => <div data-testid="view-terminal">terminal</div>
}))
vi.mock('./components/MentionAgent/MentionAgentView', () => ({
  default: (): JSX.Element => <div data-testid="view-agent">agent</div>
}))
vi.mock('./components/ClaudeManual/ClaudeManual', () => ({
  default: (): JSX.Element => <div data-testid="view-manual">manual</div>
}))
vi.mock('./components/Sessions/ClaudeCodeSessionsView', () => ({
  default: (): JSX.Element => <div data-testid="view-sessions">sessions</div>
}))
vi.mock('./components/Git/BranchWorkspace', () => ({
  default: (): JSX.Element => <div data-testid="view-git">git</div>
}))
vi.mock('./components/Settings/SettingsView', () => ({
  default: (): JSX.Element => <div data-testid="view-settings">settings</div>
}))
vi.mock('./components/Community/CommunityView', () => ({
  default: (): JSX.Element => <div data-testid="view-community">community</div>
}))
vi.mock('./components/Monitoring/MonitoringView', () => ({
  default: (): JSX.Element => <div data-testid="view-monitoring">monitoring</div>
}))
vi.mock('./components/AIRecommend/AIRecommendView', () => ({
  default: (): JSX.Element => <div data-testid="view-ai-recommend">ai-recommend</div>
}))
vi.mock('./components/common/ImageLightbox', () => ({
  default: (): JSX.Element => <div data-testid="image-lightbox" />
}))
vi.mock('./components/Layout/TitleBar', () => ({
  default: ({ onOpenCommandPalette }: { onOpenCommandPalette: () => void }): JSX.Element => (
    <div data-testid="title-bar">
      <button onClick={onOpenCommandPalette}>cmd-k</button>
    </div>
  )
}))

import App from './App'

describe('App (integration: view routing)', () => {
  beforeEach(() => {
    installMockWindowApi()
    if (!window.matchMedia) {
      // @ts-expect-error - jsdom 보강 (useTheme 가 호출)
      window.matchMedia = (query: string) => ({
        matches: false, media: query,
        addListener: () => { /* noop */ }, removeListener: () => { /* noop */ },
        addEventListener: () => { /* noop */ }, removeEventListener: () => { /* noop */ },
        dispatchEvent: () => false
      })
    }
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  it('starts on 두레이 setup view when no token is configured', async () => {
    vi.mocked(window.api.settings.get).mockResolvedValue(null)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('view-dooray-setup')).toBeInTheDocument()
    })
    // 두레이가 default view → analytics.view.open 트래킹
    await waitFor(() => {
      const calls = vi.mocked(window.api.analytics.track).mock.calls
      const opens = calls.filter((c) => c[0] === 'view.open')
      expect(opens.length).toBeGreaterThan(0)
      // 첫 view.open 은 dooray
      expect((opens[0][1] as { meta?: { view: string } })?.meta?.view).toBe('dooray')
    })
  })

  it('switches to 터미널 view when sidebar 터미널 button is clicked', async () => {
    vi.mocked(window.api.settings.get).mockResolvedValue(null)

    render(<App />)
    await screen.findByTestId('view-dooray-setup')

    const terminalNavBtn = screen.getByRole('button', { name: '터미널' })
    await userEvent.click(terminalNavBtn)

    await waitFor(() => {
      // settings.set('lastView', 'terminal')
      expect(window.api.settings.set).toHaveBeenCalledWith('lastView', 'terminal')
    })
  })

  it('honors startupView=terminal from settings', async () => {
    vi.mocked(window.api.settings.get).mockImplementation(async (key: string) => {
      if (key === 'startupView') return 'terminal'
      return null
    })

    render(<App />)

    // 일단 default(dooray)로 마운트되었다가 startupView 적용 후 terminal 로 전환
    await waitFor(() => {
      expect(window.api.settings.set).toHaveBeenCalledWith('lastView', 'terminal')
    })
  })

  it('opens DoorayAssistant after setup is confirmed', async () => {
    vi.mocked(window.api.settings.get).mockResolvedValue(null)

    render(<App />)
    const setupDone = await screen.findByText('setup-done')
    await userEvent.click(setupDone)

    await waitFor(() => {
      expect(screen.getByTestId('view-dooray-assistant')).toBeInTheDocument()
    })
  })

  it('switches to MCP view via sidebar', async () => {
    vi.mocked(window.api.settings.get).mockResolvedValue(null)

    render(<App />)
    await screen.findByTestId('view-dooray-setup')

    await userEvent.click(screen.getByRole('button', { name: 'MCP 서버' }))

    await waitFor(() => {
      expect(window.api.settings.set).toHaveBeenCalledWith('lastView', 'mcp')
    })
  })
})

