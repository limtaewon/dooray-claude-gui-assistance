import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import ProjectFilter from './ProjectFilter'

describe('ProjectFilter', () => {
  beforeEach(() => {
    installMockWindowApi()
    vi.mocked(window.api.dooray.projects.list).mockResolvedValue([
      { id: 'p1', code: 'NEON' },
      { id: 'p2', code: 'Clauday' }
    ] as never)
    vi.mocked(window.api.settings.get).mockImplementation(async (key: string) =>
      key === 'pinnedProjects' ? ['p1'] : []
    )
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  it('열어보기 전에도 고른 개수를 보여준다 — 버튼의 정보다', async () => {
    renderWithDs(<ProjectFilter />)
    expect(await screen.findByText('1')).toBeInTheDocument()
  })

  it('설정 링크는 업무 목록에서만 — 누르면 워크스페이스 설정으로 보낸다', async () => {
    const listener = vi.fn()
    window.addEventListener('goto-settings', listener)
    renderWithDs(<ProjectFilter showSettingsLink />)

    await userEvent.click(screen.getByRole('button', { name: /프로젝트 선택/ }))
    await userEvent.click(await screen.findByText(/설정에서 프로젝트 고르기/))

    await waitFor(() => expect(listener).toHaveBeenCalled())
    const event = listener.mock.calls[0][0] as CustomEvent<{ tab: string }>
    expect(event.detail.tab).toBe('workspace')
    window.removeEventListener('goto-settings', listener)
  })

  it('조회 전용이면 고를 수 없고 켜진 것만 보여준다', async () => {
    renderWithDs(<ProjectFilter readOnly />)
    await userEvent.click(screen.getByRole('button', { name: /표시 중인 프로젝트/ }))

    // 고른 것만 나오고, 그 행은 눌러도 바뀌지 않는다
    expect(await screen.findByText('NEON')).toBeInTheDocument()
    expect(screen.queryByText('Clauday')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /NEON/ })).toBeDisabled()
    expect(screen.queryByPlaceholderText('프로젝트 검색...')).not.toBeInTheDocument()
    expect(screen.queryByText(/프로젝트 수동 추가/)).not.toBeInTheDocument()
  })

  it('링크를 켜지 않으면 나오지 않는다', async () => {
    renderWithDs(<ProjectFilter />)
    await userEvent.click(screen.getByRole('button', { name: /프로젝트 선택/ }))
    await screen.findByPlaceholderText('프로젝트 검색...')
    expect(screen.queryByText(/설정에서 프로젝트 고르기/)).not.toBeInTheDocument()
  })
})
