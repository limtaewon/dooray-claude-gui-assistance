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
    await userEvent.click(await screen.findByText(/프로젝트별 규칙 정하기/))

    await waitFor(() => expect(listener).toHaveBeenCalled())
    const event = listener.mock.calls[0][0] as CustomEvent<{ tab: string }>
    expect(event.detail.tab).toBe('workspace')
    window.removeEventListener('goto-settings', listener)
  })

  it('링크를 켜지 않으면 나오지 않는다', async () => {
    renderWithDs(<ProjectFilter />)
    await userEvent.click(screen.getByRole('button', { name: /프로젝트 선택/ }))
    await screen.findByPlaceholderText('프로젝트 검색...')
    expect(screen.queryByText(/프로젝트별 규칙 정하기/)).not.toBeInTheDocument()
  })
})
