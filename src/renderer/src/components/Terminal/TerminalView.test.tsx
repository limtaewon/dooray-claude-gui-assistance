/**
 * TerminalView 통합 테스트.
 *
 * - 시작 시 빈 상태 + 새 터미널 버튼
 * - 새 탭 추가 → window.api.terminal.create 호출 + 탭 추가
 * - 탭 닫기 → window.api.terminal.kill 호출 + 탭 제거
 * - 더블클릭 → 인라인 이름 편집 → Enter → rename 호출
 * - v2.0 B-4: split(⌘D/⌘⇧D) · pane 닫기(⌘W) · 다른 뷰에서는 무반응(active=false)
 *
 * xterm 의존성을 가진 TerminalPane 은 stub 으로 교체 — forwardRef 로 감싸 SplitLayout 의
 * reattachPaneHost(handle.fit() 등 호출)가 예외 없이 동작하게 한다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { forwardRef, useImperativeHandle } from 'react'
import { screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'

// TerminalPane 은 xterm 의 native 모듈을 끌어와서 jsdom 에서 무거움 → forwardRef stub 으로 교체.
vi.mock('./TerminalPane', () => ({
  default: forwardRef(function StubTerminalPane(
    {
      sessionId,
      isVisible,
      isFocused,
      exitInfo
    }: {
      sessionId: string
      isVisible?: boolean
      isFocused?: boolean
      exitInfo?: { exitCode: number } | null
    },
    ref: React.ForwardedRef<unknown>
  ) {
    useImperativeHandle(ref, () => ({
      serialize: () => null,
      focus: () => {},
      fit: () => {},
      captureScrollState: () => null,
      restoreScrollState: () => {}
    }), [])
    return (
      <div
        data-testid={`term-pane-${sessionId}`}
        data-visible={String(Boolean(isVisible))}
        data-active={String(Boolean(isFocused))}
        data-exited={String(Boolean(exitInfo))}
        data-exit-code={exitInfo ? String(exitInfo.exitCode) : ''}
      >
        [pane:{sessionId}]
      </div>
    )
  })
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
    // 새 탭 영역에 stub 패널이 마운트되고 유일한 탭이므로 visible+focused 둘 다 true
    await waitFor(() => {
      const pane = screen.getByTestId('term-pane-sess-1')
      expect(pane).toHaveAttribute('data-visible', 'true')
      expect(pane).toHaveAttribute('data-active', 'true')
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

    // 탭의 초기 name 은 '~' (빈 상태 버튼 클릭 → cwd 없음 → base='~')
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

  describe('v2.0 B-4 — split pane', () => {
    // jsdom 의 navigator.platform 은 빈 문자열 — terminalShortcuts 의 mac/win 분기가 결정론적으로
    // 동작하도록 명시 고정한다(CLAUDE.md 플랫폼 분기 테스트 가이드).
    beforeEach(() => {
      Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true })
    })

    async function createTwoTabsFirstActive(): Promise<void> {
      let counter = 0
      vi.mocked(window.api.terminal.restoreSaved).mockResolvedValue([])
      vi.mocked(window.api.terminal.create).mockImplementation(async () => ({
        id: `sess-${++counter}`,
        name: '~',
        cwd: '/tmp',
        pid: counter,
        createdAt: Date.now()
      } as unknown as Awaited<ReturnType<typeof window.api.terminal.create>>))
    }

    it('⌘D 로 오른쪽 분할 — 새 PTY 가 생성되고 pane 수 배지가 뜬다', async () => {
      await createTwoTabsFirstActive()
      renderWithDs(<TerminalView active />)
      await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
      await screen.findByTestId('term-pane-sess-1')

      const createSpy = vi.mocked(window.api.terminal.create)
      createSpy.mockClear()

      fireEvent.keyDown(window, { key: 'd', metaKey: true })

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledTimes(1)
      })
      await screen.findByTestId('term-pane-sess-2')
      expect(await screen.findByTitle('분할된 pane 2개')).toBeInTheDocument()

      // 분할 직후 새 pane 이 focus 를 받는다 — sess-1 은 visible 이지만 focused 는 아니다.
      await waitFor(() => {
        expect(screen.getByTestId('term-pane-sess-1')).toHaveAttribute('data-active', 'false')
        expect(screen.getByTestId('term-pane-sess-2')).toHaveAttribute('data-active', 'true')
      })
      expect(screen.getByTestId('term-pane-sess-1')).toHaveAttribute('data-visible', 'true')
    })

    it('⌘W 로 분할된 pane 을 하나 닫으면 탭은 유지되고 나머지 pane 이 남는다', async () => {
      await createTwoTabsFirstActive()
      renderWithDs(<TerminalView active />)
      await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
      await screen.findByTestId('term-pane-sess-1')
      fireEvent.keyDown(window, { key: 'd', metaKey: true })
      await screen.findByTestId('term-pane-sess-2')

      const killSpy = vi.mocked(window.api.terminal.kill)
      fireEvent.keyDown(window, { key: 'w', metaKey: true })

      await waitFor(() => {
        expect(killSpy).toHaveBeenCalledWith('sess-2')
      })
      // 탭 자체는 살아있다(sess-1 은 남음), pane 배지는 사라진다.
      await screen.findByTestId('term-pane-sess-1')
      expect(screen.queryByTestId('term-pane-sess-2')).not.toBeInTheDocument()
      expect(screen.queryByTitle(/분할된 pane/)).not.toBeInTheDocument()
    })

    it('마지막 pane 에서 ⌘W 를 누르면 탭 자체가 닫힌다', async () => {
      await createTwoTabsFirstActive()
      renderWithDs(<TerminalView active />)
      await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
      await screen.findByTestId('term-pane-sess-1')

      const killSpy = vi.mocked(window.api.terminal.kill)
      fireEvent.keyDown(window, { key: 'w', metaKey: true })

      await waitFor(() => {
        expect(killSpy).toHaveBeenCalledWith('sess-1')
      })
      await waitFor(() => {
        expect(screen.queryByTestId('term-pane-sess-1')).not.toBeInTheDocument()
      })
    })

    it('active=false 면 ⌘D/⌘W/⌘T 가 아무 것도 하지 않는다(다른 뷰에서 PTY 가 죽지 않음)', async () => {
      await createTwoTabsFirstActive()
      const { rerender } = renderWithDs(<TerminalView active />)
      await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
      await screen.findByTestId('term-pane-sess-1')

      rerender(<TerminalView active={false} />)

      const createSpy = vi.mocked(window.api.terminal.create)
      const killSpy = vi.mocked(window.api.terminal.kill)
      createSpy.mockClear()

      fireEvent.keyDown(window, { key: 'd', metaKey: true })
      fireEvent.keyDown(window, { key: 't', metaKey: true })
      fireEvent.keyDown(window, { key: 'w', metaKey: true })

      await new Promise((r) => setTimeout(r, 0))
      expect(createSpy).not.toHaveBeenCalled()
      expect(killSpy).not.toHaveBeenCalled()
      expect(screen.getByTestId('term-pane-sess-1')).toBeInTheDocument()
    })
  })
})
