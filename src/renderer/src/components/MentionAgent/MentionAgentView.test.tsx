/**
 * MentionAgentView — v2.0 B-1 onExit 구독 회귀 테스트.
 *
 * ADR-v2-terminal-p1-02 §결정 5: 호스트는 자기 entries 에 있는 id 만 반영하고,
 * 이미 exitInfo 가 채워진 세션에는 두 번째 exit 이 와도 덮어쓰지 않는다(렌더러측 at-most-once).
 *
 * TerminalPane 은 xterm 의존이 커 stub 으로 교체 (TerminalView.test.tsx 와 동일 패턴).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, act } from '@testing-library/react'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'

vi.mock('../Terminal/TerminalPane', () => ({
  default: ({
    sessionId,
    exitInfo
  }: {
    sessionId: string
    exitInfo?: { exitCode: number } | null
  }): JSX.Element => (
    <div data-testid={`term-pane-${sessionId}`} data-exit-code={exitInfo ? String(exitInfo.exitCode) : ''} />
  )
}))

import MentionAgentView from './MentionAgentView'

interface MentionMeta {
  id: string
  name: string
  cwd: string
  pid: number
  createdAt: number
}
interface ExitPayload {
  id: string
  exitCode: number
  signal: number | null
}

function emitMentionOpened(meta: MentionMeta): void {
  const cb = vi.mocked(window.api.terminal.onMentionOpened).mock.calls.at(-1)?.[0] as
    | ((meta: MentionMeta) => void)
    | undefined
  act(() => cb?.(meta))
}

function emitExit(payload: ExitPayload): void {
  const cb = vi.mocked(window.api.terminal.onExit).mock.calls.at(-1)?.[0] as
    | ((payload: ExitPayload) => void)
    | undefined
  act(() => cb?.(payload))
}

describe('MentionAgentView — v2.0 B-1 onExit 구독', () => {
  beforeEach(() => {
    installMockWindowApi()
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  it('자기 entries 에 있는 세션의 exit 만 반영하고 다른 세션 id 는 무시한다', async () => {
    renderWithDs(<MentionAgentView />)
    emitMentionOpened({ id: 'agent-1', name: 'ch-1', cwd: '/a', pid: 1, createdAt: Date.now() })

    await screen.findByTestId('term-pane-agent-1')
    expect(screen.queryByText('종료됨')).not.toBeInTheDocument()

    emitExit({ id: 'other-channel-session', exitCode: 1, signal: null })
    expect(screen.queryByText('종료됨')).not.toBeInTheDocument()

    emitExit({ id: 'agent-1', exitCode: 0, signal: null })
    expect(await screen.findByText('종료됨')).toBeInTheDocument()
    expect(screen.getByTestId('term-pane-agent-1')).toHaveAttribute('data-exit-code', '0')
  })

  it('at-most-once — 같은 세션에 두 번째 exit 이 와도 최초 payload 를 덮지 않는다', async () => {
    renderWithDs(<MentionAgentView />)
    emitMentionOpened({ id: 'agent-2', name: 'ch-2', cwd: '/b', pid: 2, createdAt: Date.now() })
    await screen.findByTestId('term-pane-agent-2')

    emitExit({ id: 'agent-2', exitCode: 0, signal: null })
    await screen.findByText('종료됨')

    emitExit({ id: 'agent-2', exitCode: 9, signal: null })

    expect(screen.getAllByText('종료됨')).toHaveLength(1)
    expect(screen.getByTestId('term-pane-agent-2')).toHaveAttribute('data-exit-code', '0')
  })
})
