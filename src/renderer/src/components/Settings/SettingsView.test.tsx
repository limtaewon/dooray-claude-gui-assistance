/**
 * SettingsView 통합 테스트.
 *
 * - 탭 전환 (AI 모델 / 두레이 / CalDAV / 앱 동작)
 * - AI 모델: getModelConfig 호출 + 저장 시 setModelConfig 호출
 * - 두레이 토큰: getToken/validateToken 호출 → 상태 표시
 * - 앱 동작: startupView 라디오 변경 → settings.set("startupView", ...) 호출
 *
 * UsageInsights / ThemePicker 같은 자식 컴포넌트는 그대로 렌더해도 무방
 * (window.api 만 모킹되면 됨).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import SettingsView from './SettingsView'

describe('SettingsView (integration)', () => {
  beforeEach(() => {
    installMockWindowApi()
    // matchMedia 같은 jsdom 비지원 API 가 useTheme 안에서 호출될 수 있어 stub
    if (!window.matchMedia) {
      // @ts-expect-error - jsdom 보강
      window.matchMedia = (query: string) => ({
        matches: false,
        media: query,
        addListener: () => { /* noop */ },
        removeListener: () => { /* noop */ },
        addEventListener: () => { /* noop */ },
        removeEventListener: () => { /* noop */ },
        dispatchEvent: () => false
      })
    }
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  it('renders AI 모델 tab by default and calls getModelConfig', async () => {
    vi.mocked(window.api.ai.getModelConfig).mockResolvedValue({})

    renderWithDs(<SettingsView />)

    expect(screen.getByRole('button', { name: /AI 모델/ })).toBeInTheDocument()
    await waitFor(() => {
      expect(window.api.ai.getModelConfig).toHaveBeenCalled()
    })
    expect(screen.getByText('기능별 AI 모델')).toBeInTheDocument()
  })

  it('saves AI model config when 저장 button is clicked', async () => {
    vi.mocked(window.api.ai.getModelConfig).mockResolvedValue({})
    const setSpy = vi.mocked(window.api.ai.setModelConfig)

    renderWithDs(<SettingsView />)

    await waitFor(() => expect(window.api.ai.getModelConfig).toHaveBeenCalled())

    const saveBtn = screen.getByRole('button', { name: /^저장$/ })
    await userEvent.click(saveBtn)

    await waitFor(() => {
      expect(setSpy).toHaveBeenCalled()
    })
  })

  it('switches to 두레이 연결 tab and shows token validation state', async () => {
    vi.mocked(window.api.dooray.getToken).mockResolvedValue('dooray:xyz')
    vi.mocked(window.api.dooray.validateToken).mockResolvedValue({ valid: true, name: 'Test User' })

    renderWithDs(<SettingsView />)
    await userEvent.click(screen.getByRole('button', { name: /두레이 연결/ }))

    await waitFor(() => {
      expect(window.api.dooray.getToken).toHaveBeenCalled()
      expect(window.api.dooray.validateToken).toHaveBeenCalled()
    })

    // 토큰 검증 성공 → 사용자 이름 표시
    expect(await screen.findByText(/Test User/)).toBeInTheDocument()
  })

  it('switches to 외관 & 동작 tab and persists startupView change', async () => {
    vi.mocked(window.api.settings.get).mockImplementation(async (key: string) => {
      if (key === 'startupView') return 'dooray'
      return null
    })
    const setSpy = vi.mocked(window.api.settings.set)

    renderWithDs(<SettingsView />)
    await userEvent.click(screen.getByRole('button', { name: /외관 & 동작/ }))

    // 라디오: "터미널" 옵션 클릭
    const radio = await screen.findByLabelText(/터미널/, { selector: 'input[type="radio"]' }).catch(() =>
      screen.getByRole('radio', { name: /터미널/ })
    )
    await userEvent.click(radio)

    await waitFor(() => {
      expect(setSpy).toHaveBeenCalledWith('startupView', 'terminal')
    })
  })

  it('switches to 캘린더 연결 tab and queries caldav status', async () => {
    vi.mocked(window.api.caldav.status).mockResolvedValue({ connected: false, username: null })

    renderWithDs(<SettingsView />)
    await userEvent.click(screen.getByRole('button', { name: /캘린더 연결/ }))

    await waitFor(() => {
      expect(window.api.caldav.status).toHaveBeenCalled()
    })
    // 연결되지 않은 상태 메시지
    expect(await screen.findByText(/연결되지 않음/)).toBeInTheDocument()
  })
})
