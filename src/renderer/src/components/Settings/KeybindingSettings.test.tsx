import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import { KEYBINDINGS_SETTINGS_KEY } from '@shared/keybindings/registry'
import { resetKeybindingCache } from '../../hooks/useKeybindings'
import KeybindingSettings from './KeybindingSettings'

describe('KeybindingSettings', () => {
  beforeEach(() => {
    installMockWindowApi()
    resetKeybindingCache()
    window.api.system = { platform: 'darwin', osRelease: '23.0.0' }
    vi.mocked(window.api.settings.get).mockResolvedValue(null)
  })
  afterEach(() => {
    resetMockWindowApi()
    resetKeybindingCache()
  })

  it('전체 단축키 목록을 그룹별로 보여준다', async () => {
    renderWithDs(<KeybindingSettings />)

    expect(await screen.findByText('커맨드 팔레트 열기')).toBeInTheDocument()
    expect(screen.getByText('새 터미널 탭')).toBeInTheDocument()
    expect(screen.getByText('전역')).toBeInTheDocument()
    expect(screen.getByText('터미널')).toBeInTheDocument()
  })

  it('mac 에서는 글리프로 표기한다', async () => {
    renderWithDs(<KeybindingSettings />)
    const button = await screen.findByRole('button', { name: '커맨드 팔레트 열기 단축키 변경' })
    expect(button).toHaveTextContent('⌘K')
  })

  it('검색으로 목록을 좁힌다', async () => {
    renderWithDs(<KeybindingSettings />)
    await screen.findByText('커맨드 팔레트 열기')

    await userEvent.type(screen.getByLabelText('단축키 검색'), '분할')

    expect(screen.getByText('오른쪽으로 분할')).toBeInTheDocument()
    expect(screen.queryByText('커맨드 팔레트 열기')).not.toBeInTheDocument()
  })

  it('키 캡처로 리바인딩하면 설정에 저장된다', async () => {
    renderWithDs(<KeybindingSettings />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널 탭 단축키 변경' }))

    expect(screen.getByText(/새 조합을 누르세요/)).toBeInTheDocument()
    await userEvent.keyboard('{Meta>}{Shift>}J{/Shift}{/Meta}')

    await waitFor(() =>
      expect(window.api.settings.set).toHaveBeenCalledWith(
        KEYBINDINGS_SETTINGS_KEY,
        expect.objectContaining({ 'terminal.newTab': ['Mod+Shift+J'] })
      )
    )
  })

  it('Esc 로 캡처를 취소하면 저장하지 않는다', async () => {
    renderWithDs(<KeybindingSettings />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널 탭 단축키 변경' }))
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByText(/새 조합을 누르세요/)).not.toBeInTheDocument()
    expect(window.api.settings.set).not.toHaveBeenCalled()
  })

  it('저장된 오버라이드를 표시하고 충돌을 경고한다', async () => {
    // ⌘D 는 "오른쪽으로 분할" 이 이미 쓰는 조합
    vi.mocked(window.api.settings.get).mockResolvedValue({ 'terminal.newTab': ['Mod+D'] })

    renderWithDs(<KeybindingSettings />)

    expect(await screen.findByText(/오른쪽으로 분할 와\(과\) 같은 조합입니다/)).toBeInTheDocument()
    expect(screen.getAllByText('변경됨').length).toBeGreaterThan(0)
  })

  it('고정 항목은 변경 버튼이 비활성이다', async () => {
    renderWithDs(<KeybindingSettings />)
    const fixed = await screen.findByRole('button', { name: '실행 취소 단축키 변경' })
    expect(fixed).toBeDisabled()
  })

  it('기본값 복원으로 오버라이드를 지운다', async () => {
    vi.mocked(window.api.settings.get).mockResolvedValue({ 'terminal.newTab': ['Mod+Shift+J'] })
    renderWithDs(<KeybindingSettings />)

    await userEvent.click(await screen.findByRole('button', { name: '새 터미널 탭 기본값 복원' }))

    await waitFor(() => expect(window.api.settings.set).toHaveBeenCalledWith(KEYBINDINGS_SETTINGS_KEY, {}))
  })
})
