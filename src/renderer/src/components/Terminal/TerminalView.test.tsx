/**
 * TerminalView 통합 테스트.
 *
 * - 시작 시 빈 상태 + 새 터미널 버튼
 * - 새 탭 추가 → window.api.terminal.create 호출 + 탭 추가
 * - 탭 닫기 → window.api.terminal.kill 호출 + 탭 제거
 * - 더블클릭 → 인라인 이름 편집 → Enter → rename 호출
 *
 * xterm 의존성을 가진 TerminalPane 은 stub 으로 교체.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'

// TerminalPane 은 xterm 의 native 모듈을 끌어와서 jsdom 에서 무거움 → 단순 stub.
vi.mock('./TerminalPane', () => ({
  default: ({
    sessionId,
    isActive,
    exitInfo
  }: {
    sessionId: string
    isActive: boolean
    exitInfo?: { exitCode: number } | null
  }): JSX.Element => (
    <div
      data-testid={`term-pane-${sessionId}`}
      data-active={String(isActive)}
      data-exited={String(Boolean(exitInfo))}
      data-exit-code={exitInfo ? String(exitInfo.exitCode) : ''}
    >
      [pane:{sessionId}]
    </div>
  )
}))

// Import 는 mock 등록 이후.
import TerminalView from './TerminalView'

describe('TerminalView (integration)', () => {
  beforeEach(() => {
    installMockWindowApi()
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  it('renders empty state when no saved sessions exist', async () => {
    vi.mocked(window.api.terminal.restoreSaved).mockResolvedValue([])

    renderWithDs(<TerminalView />)

    expect(await screen.findByText('터미널')).toBeInTheDocument()
    expect(screen.getByText('셸 세션을 시작하세요')).toBeInTheDocument()
    // 빈 상태의 "새 터미널" 버튼이 존재함
    expect(screen.getByRole('button', { name: "새 터미널" })).toBeInTheDocument()
  })

  it('creates a new tab when 새 터미널 버튼 is clicked', async () => {
    vi.mocked(window.api.terminal.restoreSaved).mockResolvedValue([])
    const createSpy = vi.mocked(window.api.terminal.create)
    createSpy.mockResolvedValue({
      id: 'sess-1',
      name: '~',
      cwd: '/Users/me',
      pid: 12345,
      createdAt: Date.now()
    } as unknown as Awaited<ReturnType<typeof window.api.terminal.create>>)

    renderWithDs(<TerminalView />)

    const startBtn = await screen.findByRole('button', { name: "새 터미널" })
    await userEvent.click(startBtn)

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(1)
    })
    // 새 탭 영역에 stub 패널이 마운트
    await waitFor(() => {
      expect(screen.getByTestId('term-pane-sess-1')).toBeInTheDocument()
    })
  })

  it('closes a session through window.api.terminal.kill', async () => {
    vi.mocked(window.api.terminal.restoreSaved).mockResolvedValue([])
    vi.mocked(window.api.terminal.create).mockResolvedValue({
      id: 'sess-x',
      name: '~',
      cwd: '/x',
      pid: 1,
      createdAt: Date.now()
    } as unknown as Awaited<ReturnType<typeof window.api.terminal.create>>)
    const killSpy = vi.mocked(window.api.terminal.kill)

    renderWithDs(<TerminalView />)
    await userEvent.click(await screen.findByRole('button', { name: "새 터미널" }))

    // 탭이 만들어진 뒤 우측 X 버튼 (탭 라벨의 닫기) — title="탭 닫기"
    const closeBtn = await screen.findByRole('button', { name: '탭 닫기' })
    await userEvent.click(closeBtn)

    await waitFor(() => {
      expect(killSpy).toHaveBeenCalledWith('sess-x')
    })
    // 다시 빈 상태로 돌아갔는지
    await waitFor(() => {
      expect(screen.queryByTestId('term-pane-sess-x')).not.toBeInTheDocument()
    })
  })

  it('renames a tab via inline edit (Enter commits → terminal.rename)', async () => {
    vi.mocked(window.api.terminal.restoreSaved).mockResolvedValue([])
    vi.mocked(window.api.terminal.create).mockResolvedValue({
      id: 'sess-r',
      name: '~',
      cwd: '/work',
      pid: 99,
      createdAt: Date.now()
    } as unknown as Awaited<ReturnType<typeof window.api.terminal.create>>)
    const renameSpy = vi.mocked(window.api.terminal.rename)

    renderWithDs(<TerminalView />)
    await userEvent.click(await screen.findByRole('button', { name: "새 터미널" }))

    // 탭 라벨의 ✏️ 버튼 — title="이름 변경"
    const editBtn = await screen.findByRole('button', { name: '이름 변경' })
    await userEvent.click(editBtn)

    // session 의 초기 name 은 '~' (빈 상태 버튼 클릭 → cwd 없음 → base='~')
    const input = await screen.findByDisplayValue('~')
    await userEvent.clear(input)
    await userEvent.type(input, 'my-tab{Enter}')

    await waitFor(() => {
      expect(renameSpy).toHaveBeenCalledWith('sess-r', 'my-tab')
    })
  })

  it('restores saved sessions on mount', async () => {
    vi.mocked(window.api.terminal.restoreSaved).mockResolvedValue([
      { meta: { id: 'old', name: 'project-a', cwd: '/repo/a' }, output: 'hello' }
    ])
    vi.mocked(window.api.terminal.create).mockResolvedValue({
      id: 'new-after-restore',
      name: '~',
      cwd: '/repo/a',
      pid: 7,
      createdAt: Date.now()
    } as unknown as Awaited<ReturnType<typeof window.api.terminal.create>>)

    renderWithDs(<TerminalView />)

    await waitFor(() => {
      // 복원 시 create 한 번 + rename(저장됐던 이름 복구) 한 번 이상
      expect(window.api.terminal.create).toHaveBeenCalled()
      expect(window.api.terminal.rename).toHaveBeenCalledWith('new-after-restore', 'project-a')
    })
  })

  it('v2.0 B-1: onExit 으로 받은 종료 정보가 해당 pane/탭 배지에만 반영된다', async () => {
    vi.mocked(window.api.terminal.restoreSaved).mockResolvedValue([])
    vi.mocked(window.api.terminal.create).mockResolvedValue({
      id: 'sess-exit',
      name: '~',
      cwd: '/x',
      pid: 1,
      createdAt: Date.now()
    } as unknown as Awaited<ReturnType<typeof window.api.terminal.create>>)

    renderWithDs(<TerminalView />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    await screen.findByTestId('term-pane-sess-exit')

    const onExit = vi.mocked(window.api.terminal.onExit)
    const emit = onExit.mock.calls.at(-1)?.[0] as ((payload: { id: string; exitCode: number; signal: number | null }) => void) | undefined
    expect(emit).toBeTypeOf('function')

    // 다른 세션의 exit 은 무시된다
    act(() => emit?.({ id: 'other-session', exitCode: 1, signal: null }))
    expect(screen.queryByText('종료됨')).not.toBeInTheDocument()

    act(() => emit?.({ id: 'sess-exit', exitCode: 0, signal: null }))

    expect(await screen.findByText('종료됨')).toBeInTheDocument()
    expect(screen.getByTestId('term-pane-sess-exit')).toHaveAttribute('data-exited', 'true')
  })

  it('v2.0 B-1: at-most-once — 같은 세션에 두 번째 exit 이 와도 최초 payload 를 덮지 않는다', async () => {
    vi.mocked(window.api.terminal.restoreSaved).mockResolvedValue([])
    vi.mocked(window.api.terminal.create).mockResolvedValue({
      id: 'sess-exit-2',
      name: '~',
      cwd: '/x',
      pid: 1,
      createdAt: Date.now()
    } as unknown as Awaited<ReturnType<typeof window.api.terminal.create>>)

    renderWithDs(<TerminalView />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    await screen.findByTestId('term-pane-sess-exit-2')

    const onExit = vi.mocked(window.api.terminal.onExit)
    const emit = onExit.mock.calls.at(-1)?.[0] as ((payload: { id: string; exitCode: number; signal: number | null }) => void) | undefined

    act(() => emit?.({ id: 'sess-exit-2', exitCode: 0, signal: null }))
    await screen.findByText('종료됨')
    act(() => emit?.({ id: 'sess-exit-2', exitCode: 9, signal: null }))

    expect(screen.getAllByText('종료됨')).toHaveLength(1)
    expect(screen.getByTestId('term-pane-sess-exit-2')).toHaveAttribute('data-exit-code', '0')
  })

  it('v2.0 B-8: 탭을 닫으면 MRU 스택 기준으로 다음 탭이 활성화된다', async () => {
    let counter = 0
    vi.mocked(window.api.terminal.restoreSaved).mockResolvedValue([])
    vi.mocked(window.api.terminal.create).mockImplementation(async () => ({
      id: `sess-${++counter}`,
      name: '~',
      cwd: '/tmp',
      pid: counter,
      createdAt: Date.now()
    } as unknown as Awaited<ReturnType<typeof window.api.terminal.create>>))

    renderWithDs(<TerminalView />)

    // a(sess-1) → b(sess-2) → c(sess-3) 순서로 생성. 각 생성이 곧 활성화이므로 mru = [c, b, a]
    act(() => { window.dispatchEvent(new CustomEvent('create-terminal', { detail: { cwd: '/repo/a' } })) })
    await screen.findByText('a')
    act(() => { window.dispatchEvent(new CustomEvent('create-terminal', { detail: { cwd: '/repo/b' } })) })
    await screen.findByText('b')
    act(() => { window.dispatchEvent(new CustomEvent('create-terminal', { detail: { cwd: '/repo/c' } })) })
    await screen.findByText('c')

    // a 를 다시 활성화 → mru = [a, c, b]
    await userEvent.click(screen.getByText('a'))
    expect(screen.getByTestId('term-pane-sess-1')).toHaveAttribute('data-active', 'true')

    // 활성 탭(a)을 닫는다 — 오른쪽 이웃은 b 지만 MRU 상 c 가 우선이어야 한다
    const closeButtons = screen.getAllByRole('button', { name: '탭 닫기' })
    await userEvent.click(closeButtons[0])

    await waitFor(() => {
      expect(window.api.terminal.kill).toHaveBeenCalledWith('sess-1')
    })
    await waitFor(() => {
      expect(screen.getByTestId('term-pane-sess-3')).toHaveAttribute('data-active', 'true')
    })
  })
})
