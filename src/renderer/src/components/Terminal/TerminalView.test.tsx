/**
 * TerminalView 통합 테스트.
 *
 * - 시작 시 빈 상태 + 새 터미널 버튼
 * - 새 탭 추가 → window.api.terminal.create 호출 + 탭 추가
 * - 탭 닫기 → window.api.terminal.kill 호출 + 탭 제거
 * - 더블클릭 → 인라인 이름 편집 → Enter → rename 호출
 * - v2.0 B-4: split(⌘D/⌘⇧D) · pane 닫기(⌘W) · 다른 뷰에서는 무반응(active=false)
 * - v2.0 B-5: restoreState 기반 스냅샷 복원 · 저장 트리거(debounce/onRequestState) · 탭 상한
 *
 * xterm 의존성을 가진 TerminalPane 은 stub 으로 교체 — forwardRef 로 감싸 SplitLayout 의
 * reattachPaneHost(handle.fit()/disposeWebgl()/attachWebglIfAllowed() 등 호출)가 예외 없이 동작하게 한다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { forwardRef, useImperativeHandle } from 'react'
import { screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import type { TerminalWorkspaceSnapshotV2 } from '@shared/types/terminal'

// TerminalPane 은 xterm 의 native 모듈을 끌어와서 jsdom 에서 무거움 → forwardRef stub 으로 교체.
vi.mock('./TerminalPane', () => ({
  default: forwardRef(function StubTerminalPane(
    {
      sessionId,
      isVisible,
      isFocused,
      exitInfo,
      restore
    }: {
      sessionId: string
      isVisible?: boolean
      isFocused?: boolean
      exitInfo?: { exitCode: number } | null
      restore?: { cols: number; rows: number; serialized: string }
    },
    ref: React.ForwardedRef<unknown>
  ) {
    useImperativeHandle(ref, () => ({
      serialize: () => null,
      focus: () => {},
      fit: () => {},
      captureScrollState: () => null,
      restoreScrollState: () => {},
      disposeWebgl: () => {},
      attachWebglIfAllowed: () => {}
    }), [])
    return (
      <div
        data-testid={`term-pane-${sessionId}`}
        data-visible={String(Boolean(isVisible))}
        data-active={String(Boolean(isFocused))}
        data-exited={String(Boolean(exitInfo))}
        data-exit-code={exitInfo ? String(exitInfo.exitCode) : ''}
        data-restore-serialized={restore?.serialized ?? ''}
      >
        [pane:{sessionId}]
      </div>
    )
  })
}))

// Import 는 mock 등록 이후.
import TerminalView from './TerminalView'

/** 최소 유효 스냅샷 하나(탭 1개, leaf 1개)를 만든다 — 상한/복원 테스트 픽스처용. */
function makeSnapshotWithTabs(count: number): TerminalWorkspaceSnapshotV2 {
  const tabs = Array.from({ length: count }, (_, i) => {
    const leafId = `leaf-${i}`
    return {
      tabId: `tab-${i}`,
      name: `restored-${i}`,
      tree: { type: 'leaf' as const, leafId },
      focusedLeafId: leafId,
      panes: { [leafId]: { cwd: `/repo/${i}`, cols: 80, rows: 24, serialized: `snap-${i}` } }
    }
  })
  return { version: 2, savedAt: Date.now(), activeTabId: tabs[0]?.tabId ?? null, tabs }
}

describe('TerminalView (integration)', () => {
  beforeEach(() => {
    installMockWindowApi()
  })

  afterEach(() => {
    // fake timer 테스트가 도중에 실패해도 이후 테스트의 findByRole/waitFor(실시간 polling)가
    // 영원히 멈추지 않도록 항상 실타이머로 되돌린다.
    vi.useRealTimers()
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  it('renders empty state when no saved sessions exist', async () => {
    renderWithDs(<TerminalView />)

    expect(await screen.findByText('터미널')).toBeInTheDocument()
    expect(screen.getByText('셸 세션을 시작하세요')).toBeInTheDocument()
    // 빈 상태의 "새 터미널" 버튼이 존재함
    expect(screen.getByRole('button', { name: "새 터미널" })).toBeInTheDocument()
  })

  it('creates a new tab when 새 터미널 버튼 is clicked', async () => {
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

  it('v2.0 B-5: restoreState 스냅샷으로 탭·pane 을 복원하고 각 pane 에 restore 스냅샷을 전달한다', async () => {
    vi.mocked(window.api.terminal.restoreState).mockResolvedValue(makeSnapshotWithTabs(1))
    vi.mocked(window.api.terminal.create).mockResolvedValue({
      id: 'new-after-restore',
      name: '~',
      cwd: '/repo/0',
      pid: 7,
      createdAt: Date.now()
    } as unknown as Awaited<ReturnType<typeof window.api.terminal.create>>)

    renderWithDs(<TerminalView />)

    await waitFor(() => {
      expect(window.api.terminal.create).toHaveBeenCalledWith({ cwd: '/repo/0' })
    })
    expect(await screen.findByText('restored-0')).toBeInTheDocument()
    const pane = await screen.findByTestId('term-pane-new-after-restore')
    expect(pane).toHaveAttribute('data-restore-serialized', 'snap-0')
    expect(pane).toHaveAttribute('data-active', 'true')
    // v2 복원은 이름을 스냅샷에서 직접 쓴다 — 레거시처럼 rename IPC 를 다시 왕복하지 않는다.
    expect(window.api.terminal.rename).not.toHaveBeenCalled()
  })

  it('v2.0 B-5: 빈 스냅샷(null)이면 빈 상태로 시작하고 복원 관련 create 호출이 없다', async () => {
    vi.mocked(window.api.terminal.restoreState).mockResolvedValue(null)

    renderWithDs(<TerminalView />)

    expect(await screen.findByText('터미널')).toBeInTheDocument()
    expect(window.api.terminal.create).not.toHaveBeenCalled()
  })

  it('v2.0 B-5: 탭 상한(20) 초과 시 최근 20개만 복원하고 warn 을 남긴다', async () => {
    vi.mocked(window.api.terminal.restoreState).mockResolvedValue(makeSnapshotWithTabs(21))
    let counter = 0
    vi.mocked(window.api.terminal.create).mockImplementation(async () => ({
      id: `restored-sess-${++counter}`,
      name: '~',
      cwd: '/tmp',
      pid: counter,
      createdAt: Date.now()
    } as unknown as Awaited<ReturnType<typeof window.api.terminal.create>>))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderWithDs(<TerminalView />)

    await waitFor(() => {
      expect(window.api.terminal.create).toHaveBeenCalledTimes(20)
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('20'))
    // 오래된 탭(restored-0)은 버려지고 최근 탭(restored-20)만 남는다.
    expect(screen.queryByText('restored-0')).not.toBeInTheDocument()
    expect(await screen.findByText('restored-20')).toBeInTheDocument()
    warnSpy.mockRestore()
  })

  it('v2.0 B-5: 복원 진행 중에는 30초 autosave 가 발화하지 않는다', async () => {
    vi.useFakeTimers()
    let resolveRestore: ((v: TerminalWorkspaceSnapshotV2 | null) => void) | null = null
    vi.mocked(window.api.terminal.restoreState).mockReturnValue(
      new Promise((resolve) => { resolveRestore = resolve })
    )

    renderWithDs(<TerminalView />)

    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(window.api.terminal.saveState).not.toHaveBeenCalled()

    // 정리 — pending 프라미스를 해소해 다음 테스트에 영향이 남지 않게 한다.
    await act(async () => { resolveRestore?.(null) })
    vi.useRealTimers()
  })

  it('v2.0 B-5: onRequestState(before-quit flush) 수신 시 saveState 를 1회 호출한다', async () => {
    vi.mocked(window.api.terminal.restoreState).mockResolvedValue(null)
    renderWithDs(<TerminalView />)
    await screen.findByText('터미널')
    // restorePhase 가 'ready' 로 넘어갈 시간을 준다(마이크로태스크 1틱).
    await act(async () => { await Promise.resolve() })

    const onRequestState = vi.mocked(window.api.terminal.onRequestState)
    const flush = onRequestState.mock.calls.at(-1)?.[0] as (() => void) | undefined
    expect(flush).toBeTypeOf('function')

    act(() => flush?.())

    await waitFor(() => {
      expect(window.api.terminal.saveState).toHaveBeenCalledTimes(1)
    })
  })

  it('v2.0 B-5: 탭 생성 후 1초가 지나면 debounce 저장이 발화한다', async () => {
    vi.useFakeTimers()
    vi.mocked(window.api.terminal.restoreState).mockResolvedValue(null)
    vi.mocked(window.api.terminal.create).mockResolvedValue({
      id: 'sess-debounce',
      name: '~',
      cwd: '/tmp',
      pid: 1,
      createdAt: Date.now()
    } as unknown as Awaited<ReturnType<typeof window.api.terminal.create>>)

    renderWithDs(<TerminalView />)
    await act(async () => { await Promise.resolve() }) // restorePhase → 'ready'

    // fake timer 구간에선 findByRole(내부 polling 이 실타이머 기반)을 쓰지 않는다 — 빈 상태 버튼은
    // restorePhase 와 무관하게 첫 렌더부터 동기로 존재한다.
    const startBtn = screen.getByRole('button', { name: '새 터미널' })
    await act(async () => {
      fireEvent.click(startBtn)
      await Promise.resolve()
    })

    expect(window.api.terminal.saveState).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(window.api.terminal.saveState).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('v2.0 B-1: onExit 으로 받은 종료 정보가 해당 pane/탭 배지에만 반영된다', async () => {
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
