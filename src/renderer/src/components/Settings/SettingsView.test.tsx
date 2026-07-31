/**
 * SettingsView 통합 테스트.
 *
 * - 좌측 네비 전환 (두레이 / 캘린더 / 모델 / 동작)
 * - AI 모델: getModelConfig 호출 + 저장 시 setModelConfig 호출
 * - 두레이 토큰: getToken/validateToken 호출 → 상태 표시
 * - 동작: 시작 화면 세그먼트 변경 → settings.set("startupView", ...) 호출
 * - 설정 검색: 질의에 맞는 섹션만 네비에 남는다
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

  it('두레이 연결을 기본으로 열고, 모델 섹션으로 이동하면 getModelConfig 를 부른다', async () => {
    vi.mocked(window.api.ai.getModelConfig).mockResolvedValue({})

    renderWithDs(<SettingsView />)

    // 기본 섹션은 '두레이 연결' — 연결부터 하는 것이 첫 사용 흐름이라서
    expect(await screen.findByRole('heading', { name: '두레이 연결' })).toBeInTheDocument()
    // 한 번에 한 섹션만 마운트한다 — 안 보이는 섹션은 IPC 를 때리지 않는다
    expect(window.api.ai.getModelConfig).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /^모델$/ }))

    await waitFor(() => {
      expect(window.api.ai.getModelConfig).toHaveBeenCalled()
    })
    expect(screen.getByText('기능별 AI 모델')).toBeInTheDocument()
  })

  it('saves AI model config when 저장 button is clicked', async () => {
    vi.mocked(window.api.ai.getModelConfig).mockResolvedValue({})
    const setSpy = vi.mocked(window.api.ai.setModelConfig)

    renderWithDs(<SettingsView />)
    await userEvent.click(screen.getByRole('button', { name: /^모델$/ }))

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
    await userEvent.click(screen.getByRole('button', { name: /^두레이$/ }))

    await waitFor(() => {
      expect(window.api.dooray.getToken).toHaveBeenCalled()
      expect(window.api.dooray.validateToken).toHaveBeenCalled()
    })

    // 토큰 검증 성공 → 사용자 이름 표시
    expect(await screen.findByText(/Test User/)).toBeInTheDocument()
  })

  it('동작 섹션에서 시작 화면을 바꾸면 즉시 저장한다 (저장 버튼 없음)', async () => {
    vi.mocked(window.api.settings.get).mockImplementation(async (key: string) => {
      if (key === 'startupView') return 'dooray'
      return null
    })
    const setSpy = vi.mocked(window.api.settings.set)

    renderWithDs(<SettingsView />)
    await userEvent.click(screen.getByRole('button', { name: /^동작$/ }))

    await userEvent.click(await screen.findByRole('radio', { name: '터미널' }))

    await waitFor(() => {
      expect(setSpy).toHaveBeenCalledWith('startupView', 'terminal')
    })
  })

  it('설정 검색은 걸리는 섹션만 네비에 남긴다', async () => {
    renderWithDs(<SettingsView />)

    await userEvent.type(screen.getByLabelText('설정 검색'), '글꼴')

    // 디바운스 후 적용
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^외관$/ })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^단축키$/ })).not.toBeInTheDocument()
    })
  })

  it('검색 결과가 없으면 안내를 보여준다', async () => {
    renderWithDs(<SettingsView />)
    await userEvent.type(screen.getByLabelText('설정 검색'), 'zzzz없는설정zzzz')
    expect(await screen.findByText('검색 결과가 없습니다')).toBeInTheDocument()
  })

  it('switches to 캘린더 연결 tab and queries caldav status', async () => {
    vi.mocked(window.api.caldav.status).mockResolvedValue({ connected: false, username: null })

    renderWithDs(<SettingsView />)
    await userEvent.click(screen.getByRole('button', { name: /^캘린더$/ }))

    await waitFor(() => {
      expect(window.api.caldav.status).toHaveBeenCalled()
    })
    // 연결되지 않은 상태 메시지
    expect(await screen.findByText(/연결되지 않음/)).toBeInTheDocument()
  })
})
