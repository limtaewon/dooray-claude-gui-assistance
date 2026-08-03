/**
 * MCPManager 통합 테스트.
 *
 * - window.api.mcp.list 호출 후 카드 렌더링
 * - 토글 시 window.api.mcp.update 가 disabled 플립으로 호출됨
 * - 빈 상태 / 새로고침 흐름
 *
 * MCPCard / MCPForm / WikiStoragePicker 는 실제 구현을 그대로 두고,
 * 외부 의존성은 window.api 만 모킹한다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import MCPManager from './MCPManager'

describe('MCPManager (integration)', () => {
  beforeEach(() => {
    installMockWindowApi()
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  it('renders existing MCP servers from window.api.mcp.list', async () => {
    vi.mocked(window.api.mcp.list).mockResolvedValue({
      'filesystem': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
      'github': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] }
    })

    renderWithDs(<MCPManager />)

    expect(window.api.mcp.list).toHaveBeenCalled()

    await waitFor(() => {
      expect(screen.getByText('filesystem')).toBeInTheDocument()
      expect(screen.getByText('github')).toBeInTheDocument()
    })

    // 활성 카운트 — 2개 등록 + 모두 enabled
    // 헤더 카운트는 지금 보고 있는 탭(로컬)의 개수를 센다
    expect(screen.getByText(/2개 · 활성 2/)).toBeInTheDocument()
  })

  it('shows onboarding when no servers are registered', async () => {
    vi.mocked(window.api.mcp.list).mockResolvedValue({})

    renderWithDs(<MCPManager />)

    // 비어 있을 때는 '없음'이 아니라 무엇을 할 수 있는지를 안내한다
    await waitFor(() => {
      expect(
        screen.getByText('Claude Code 가 쓸 도구 서버를 등록하고 켜고 끕니다.')
      ).toBeInTheDocument()
    })
    expect(screen.getAllByRole('button', { name: /서버 추가/ }).length).toBeGreaterThan(0)
  })

  it('reloads list when 새로고침 버튼 is clicked', async () => {
    vi.mocked(window.api.mcp.list).mockResolvedValue({})

    renderWithDs(<MCPManager />)

    await waitFor(() => {
      expect(window.api.mcp.list).toHaveBeenCalledTimes(1)
    })

    const refresh = screen.getByRole('button', { name: /새로고침/ })
    await userEvent.click(refresh)

    await waitFor(() => {
      expect(window.api.mcp.list).toHaveBeenCalledTimes(2)
    })
  })

  it('enters and exits 선택 모드', async () => {
    vi.mocked(window.api.mcp.list).mockResolvedValue({
      'foo': { command: 'echo', args: ['hi'] }
    })

    renderWithDs(<MCPManager />)

    await waitFor(() => expect(screen.getByText('foo')).toBeInTheDocument())

    const selectBtn = screen.getByRole('button', { name: /^선택$/ })
    await userEvent.click(selectBtn)

    // 선택 모드 액션바 표시
    expect(await screen.findByText('0개 선택됨')).toBeInTheDocument()

    // 종료
    const exitBtn = screen.getByRole('button', { name: /선택 종료/ })
    await userEvent.click(exitBtn)

    await waitFor(() => {
      expect(screen.queryByText('0개 선택됨')).not.toBeInTheDocument()
    })
  })

  it('switches to 공유 tab and triggers storageList', async () => {
    vi.mocked(window.api.mcp.list).mockResolvedValue({})
    // 기본 위키 자동 주입 흐름이 동작하도록 settings.get 은 기본 null 응답을 그대로 둠.
    // → DEFAULT_WIKIS 가 활성화돼 storageList 가 호출됨.
    vi.mocked(window.api.dooray.wiki.storageList).mockResolvedValue([])

    renderWithDs(<MCPManager />)

    // 헤더 렌더 대기
    await waitFor(() => expect(screen.getByText('MCP 서버')).toBeInTheDocument())

    // 공유 탭으로 이동
    const wikiTab = screen.getByRole('button', { name: /공유/ })
    await userEvent.click(wikiTab)

    await waitFor(() => {
      // 공유 탭 진입 시 storageList 가 호출돼야 함 (기본 위키 자동 주입 흐름)
      expect(window.api.dooray.wiki.storageList).toHaveBeenCalled()
    })

    // 공유 탭에서는 등록된 항목이 없을 때 안내가 떠야 함
    await waitFor(() => {
      // EmptyView body 텍스트 확인
      const empty = screen.queryByText(/저장된 MCP가 없습니다|위키를 등록하세요/)
      expect(empty).toBeTruthy()
    })
  })

  it('toggles server disabled flag through window.api.mcp.update', async () => {
    vi.mocked(window.api.mcp.list)
      .mockResolvedValueOnce({
        'demo': { command: 'echo', args: ['hi'] }
      })
      .mockResolvedValueOnce({
        'demo': { command: 'echo', args: ['hi'], disabled: true }
      })

    renderWithDs(<MCPManager />)

    await screen.findByText('demo')
    // 전원·삭제는 되돌리기 어려워서 ⋯ 메뉴 안에 있다 — 메뉴를 먼저 연다
    await userEvent.click(await screen.findByRole('button', { name: 'demo 추가 작업' }))
    // 활성 상태(disabled=false) → 메뉴에 「비활성화」 항목 노출
    await userEvent.click(await screen.findByText('비활성화'))

    await waitFor(() => {
      expect(window.api.mcp.update).toHaveBeenCalledWith(
        'demo',
        expect.objectContaining({ disabled: true })
      )
    })
  })
})
