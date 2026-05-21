/**
 * Sidebar 통합 테스트.
 *
 * - 네비 항목 클릭 → onViewChange 콜백
 * - 모니터링 unread 배지 (watcher.unreadCounts 합산) 표시
 * - 새 mention 도착 시 agent 펄스 + 배지 1 표시
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import Sidebar from './Sidebar'

describe('Sidebar (integration)', () => {
  beforeEach(() => {
    installMockWindowApi()
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  it('renders nav items and invokes onViewChange on click', async () => {
    const onChange = vi.fn()
    render(<Sidebar activeView="dooray" onViewChange={onChange} />)

    // 핵심 nav 항목들 노출
    expect(screen.getByRole('button', { name: '두레이' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '터미널' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MCP 서버' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '설정' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '터미널' }))
    expect(onChange).toHaveBeenCalledWith('terminal')
  })

  it('shows monitoring unread badge from watcher.unreadCounts', async () => {
    vi.mocked(window.api.watcher.unreadCounts).mockResolvedValue({
      'w1': 3, 'w2': 2
    })

    render(<Sidebar activeView="dooray" onViewChange={vi.fn()} />)

    await waitFor(() => {
      // 모니터링 nav 버튼 안에 5 가 표시됨 (3+2)
      const monitoringBtn = screen.getByRole('button', { name: '모니터링' })
      expect(monitoringBtn.textContent).toContain('5')
    })
  })

  it('subscribes to mention.onReceived and watcher.onNewMessages on mount', async () => {
    render(<Sidebar activeView="dooray" onViewChange={vi.fn()} />)

    await waitFor(() => {
      expect(window.api.mention.onReceived).toHaveBeenCalled()
      expect(window.api.watcher.onNewMessages).toHaveBeenCalled()
    })
  })

  it('shows agent badge after a mention is received', async () => {
    // onReceived 콜백을 즉시 트리거하도록 mock 구현
    let mentionCb: ((p: { channelId: string; channelName: string; text: string; logId: string }) => void) | null = null
    vi.mocked(window.api.mention.onReceived).mockImplementation((cb) => {
      mentionCb = cb
      return () => { mentionCb = null }
    })

    render(<Sidebar activeView="dooray" onViewChange={vi.fn()} />)

    // mount 후 콜백 등록 확인
    await waitFor(() => expect(mentionCb).not.toBeNull())

    // 강제로 mention 도착시켜 배지 1 만들기
    mentionCb!({ channelId: 'c1', channelName: 'ch', text: '@clauday hi', logId: 'L1' })

    await waitFor(() => {
      const agentBtn = screen.getByRole('button', { name: '에이전트' })
      expect(agentBtn.textContent).toContain('1')
    })
  })
})
