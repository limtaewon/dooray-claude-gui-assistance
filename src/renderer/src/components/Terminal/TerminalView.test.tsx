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
import { collectLeafIds, isValidTree } from './splitTree'

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

vi.mock('@monaco-editor/react', () => ({
  DiffEditor: ({ original, modified }: { original: string; modified: string }) => (
    <div data-testid="diff-editor" data-original={original} data-modified={modified} />
  )
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

describe('TerminalView — 업무 드래그&드롭', () => {
  beforeEach(() => {
    installMockWindowApi()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  /** 업무 카드가 만드는 것과 같은 형태의 드래그 페이로드. */
  function taskTransfer(): DataTransfer {
    const payload = JSON.stringify({
      projectId: 'p1',
      taskId: 't1',
      subject: '유의어 사전 개발',
      linked: false
    })
    return {
      types: ['application/x-clauday-task'],
      getData: (type: string) => (type === 'application/x-clauday-task' ? payload : ''),
      setData: () => {},
      dropEffect: 'copy',
      effectAllowed: 'copy',
      files: []
    } as unknown as DataTransfer
  }

  it('터미널 위에 놓아도 드롭이 처리된다 — xterm 은 포털이라 React 이벤트가 탭 div 로 오지 않는다', async () => {
    vi.mocked(window.api.workspace.taskDrop.resolve).mockResolvedValue({
      cwd: '/repo',
      repoName: 'repo'
    })
    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    const pane = await screen.findByTestId(/^term-pane-/)

    fireEvent.dragOver(pane, { dataTransfer: taskTransfer() })
    fireEvent.drop(pane, { dataTransfer: taskTransfer() })

    // 드롭이 처리되면 PTY 에 claude 실행이 들어간다
    await waitFor(() => {
      const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
      expect(sent).toContain('claude')
    })
  })

  it('기본값은 지금 터미널이 있는 폴더에서 시작한다 — cd 로 옮기지 않는다', async () => {
    // 1 업무 N 저장소가 현실이라 폴더는 사용자가 정한다. 미리 지정한 곳으로 cd 하면 그 선택을 덮는다.
    vi.mocked(window.api.terminal.sessionCwd).mockResolvedValue('/Users/me/Desktop/neon-ai')
    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    const pane = await screen.findByTestId(/^term-pane-/)

    fireEvent.drop(pane, { dataTransfer: taskTransfer() })

    await waitFor(() => {
      const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
      expect(sent).toContain('claude')
    })
    const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
    expect(sent).not.toContain('cd ')
    // 매핑된 저장소를 찾는 경로는 타지 않는다
    expect(window.api.workspace.taskDrop.resolve).not.toHaveBeenCalled()
  })

  it("'매핑된 저장소' 설정이면 지정 폴더로 이동한다", async () => {
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue({
      taskDropStartIn: 'mapped'
    } as never)
    vi.mocked(window.api.terminal.sessionCwd).mockResolvedValue('/Users/me/Desktop/neon-ai')
    vi.mocked(window.api.workspace.taskDrop.resolve).mockResolvedValue({
      cwd: '/Users/me/Desktop/2NEON',
      repoName: '2NEON'
    })
    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    const pane = await screen.findByTestId(/^term-pane-/)

    fireEvent.drop(pane, { dataTransfer: taskTransfer() })

    await waitFor(() => {
      const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
      expect(sent).toContain("cd '/Users/me/Desktop/2NEON'")
    })
  })
})

describe('TerminalView — diff 탭 (v2.0 소스 제어)', () => {
  beforeEach(() => {
    installMockWindowApi()
    // 드로어를 '변경사항' 탭으로 열어둔 상태에서 시작한다.
    vi.mocked(window.api.settings.get).mockImplementation(async (key: string) =>
      key === 'terminalDrawerTab' ? 'changes' : null
    )
    vi.mocked(window.api.terminal.sessionCwd).mockResolvedValue('/repo')
    vi.mocked(window.api.git.repoRoot).mockResolvedValue('/repo')
    vi.mocked(window.api.git.scm.status).mockResolvedValue({
      entries: [{ path: 'src/a.ts', status: 'modified', area: 'unstaged' }],
      conflictOperation: 'none',
      branch: 'refs/heads/main'
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  /** 터미널 탭 하나를 만들고 드로어의 변경 파일 행이 나타날 때까지 기다린다. */
  async function openChangesWithOneFile(): Promise<void> {
    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    await screen.findByTitle('src/a.ts')
  }

  it('변경 파일을 클릭하면 오버레이가 아니라 터미널 탭으로 열린다', async () => {
    await openChangesWithOneFile()

    // 클릭 전에는 diff 에디터가 없다
    expect(screen.queryByTestId('diff-editor')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTitle('src/a.ts'))

    // 탭이 하나 늘고, 그 탭 안에 diff 가 그려진다
    await waitFor(() => expect(screen.getByTestId('diff-editor')).toBeInTheDocument())
    expect(window.api.git.scm.fileDiff).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: '/repo', path: 'src/a.ts' })
    )
    // 전체 화면 오버레이(포털)로 body 에 붙지 않는다 — 타이틀바를 덮던 버그의 회귀 방지
    expect(document.body.querySelector(':scope > [class*="fixed"]')).toBeNull()
  })

  it('같은 파일을 다시 클릭해도 탭이 늘지 않는다', async () => {
    await openChangesWithOneFile()

    await userEvent.click(screen.getByTitle('src/a.ts'))
    await waitFor(() => expect(screen.getByTestId('diff-editor')).toBeInTheDocument())
    const tabsAfterFirst = screen.getAllByTitle('탭 닫기').length

    await userEvent.click(screen.getByTitle('src/a.ts'))
    await waitFor(() => expect(screen.getAllByTitle('탭 닫기')).toHaveLength(tabsAfterFirst))
  })

  it('diff 탭은 스냅샷에 저장하지 않는다 — PTY 가 없어 복원 대상이 아니다', async () => {
    await openChangesWithOneFile()
    await userEvent.click(screen.getByTitle('src/a.ts'))
    await waitFor(() => expect(screen.getByTestId('diff-editor')).toBeInTheDocument())

    // beforeunload 는 즉시 flush 한다
    act(() => { window.dispatchEvent(new Event('beforeunload')) })

    await waitFor(() => expect(window.api.terminal.saveState).toHaveBeenCalled())
    const calls = vi.mocked(window.api.terminal.saveState).mock.calls
    const snapshot = calls[calls.length - 1][0] as TerminalWorkspaceSnapshotV2
    expect(snapshot.tabs.every((t) => !t.tabId.startsWith('diff '))).toBe(true)
  })
})

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
    expect(
      screen.getByText(/셸 세션을 열어 작업을 시작하세요/)
    ).toBeInTheDocument()
    // 빈 상태의 "새 터미널" 버튼 + 단축키 가이드
    expect(screen.getByRole('button', { name: '새 터미널' })).toBeInTheDocument()
    expect(screen.getByText('오른쪽으로 분할')).toBeInTheDocument()
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

  describe('v2.0 B-5 보강 — 스냅샷 저장→복원 왕복 (트리 불변식·leafId 매핑)', () => {
    // jsdom 의 navigator.platform 은 빈 문자열 — ⌘D/⌘⇧D 판정에 필요(B-4 섹션과 동일한 이유).
    beforeEach(() => {
      Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true })
    })

    /** onRequestState 로 등록된 마지막 flush 콜백을 발화시키고, saveState 에 전달된 스냅샷을 꺼낸다. */
    async function flushAndCaptureSnapshot(): Promise<TerminalWorkspaceSnapshotV2> {
      const saveStateSpy = vi.mocked(window.api.terminal.saveState)
      const before = saveStateSpy.mock.calls.length
      const flush = vi.mocked(window.api.terminal.onRequestState).mock.calls.at(-1)?.[0] as (() => void) | undefined
      expect(flush).toBeTypeOf('function')
      act(() => flush?.())
      await waitFor(() => expect(saveStateSpy.mock.calls.length).toBeGreaterThan(before))
      return saveStateSpy.mock.calls.at(-1)![0] as TerminalWorkspaceSnapshotV2
    }

    it('3분할 트리를 만들어 저장한 스냅샷은 트리 불변식을 만족하고, 그 스냅샷을 새 인스턴스가 복원하면 pane 수·트리 모양·포커스가 그대로 재현된다', async () => {
      // ---- 1단계: 저장 — 탭 1개 안에 row(A, column(B, C)) 3leaf 트리를 만든다 ----
      let saveCounter = 0
      vi.mocked(window.api.terminal.create).mockImplementation(async () => ({
        id: `orig-${++saveCounter}`,
        name: '~',
        cwd: '/tmp',
        pid: saveCounter,
        createdAt: Date.now()
      } as unknown as Awaited<ReturnType<typeof window.api.terminal.create>>))

      const first = renderWithDs(<TerminalView active />)
      await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
      await screen.findByTestId('term-pane-orig-1')

      fireEvent.keyDown(window, { key: 'd', metaKey: true }) // ⌘D — row(A, B), B 가 focused
      await screen.findByTestId('term-pane-orig-2')
      fireEvent.keyDown(window, { key: 'd', metaKey: true, shiftKey: true }) // ⌘⇧D — B 를 column(B, C) 로, C 가 focused
      await screen.findByTestId('term-pane-orig-3')
      expect(await screen.findByTitle('분할된 pane 3개')).toBeInTheDocument()

      const snap = await flushAndCaptureSnapshot()

      // ---- 트리 불변식 ----
      expect(snap.tabs).toHaveLength(1)
      const savedTab = snap.tabs[0]
      expect(isValidTree(savedTab.tree)).toBe(true)
      const savedLeafIds = collectLeafIds(savedTab.tree)
      expect(savedLeafIds).toHaveLength(3)
      expect(new Set(savedLeafIds).size).toBe(3)
      // leafId 매핑 — panes 키 집합이 트리의 leaf 집합과 정확히 일치(orphan/누락 없음).
      expect(Object.keys(savedTab.panes).sort()).toEqual([...savedLeafIds].sort())
      // 포커스는 항상 leaf 집합 안에 있어야 한다.
      expect(savedLeafIds).toContain(savedTab.focusedLeafId)
      const focusedIndex = savedLeafIds.indexOf(savedTab.focusedLeafId)

      // notifyLayoutChanged() 의 1초 debounce 는 실타이머라 unmount 후에도 살아있으면 그대로 발화해
      // 다음 테스트로 새는 위험이 있다(TerminalView 는 실제 앱에서 항상 마운트 상태라 unmount cleanup
      // 이 없다 — App.tsx "뷰별 visibility — 항상 마운트" 참조) — 언마운트 전에 자연 소멸을 기다린다.
      await new Promise((r) => setTimeout(r, 1050))
      first.unmount()
      resetMockWindowApi()

      // ---- 2단계: 복원 — 방금 저장한 스냅샷을 그대로 새 TerminalView 인스턴스에 먹인다 ----
      vi.mocked(window.api.terminal.restoreState).mockResolvedValue(snap)
      let restoreCounter = 0
      vi.mocked(window.api.terminal.create).mockImplementation(async () => ({
        id: `restored-${restoreCounter++}`,
        name: '~',
        cwd: '/tmp',
        pid: restoreCounter,
        createdAt: Date.now()
      } as unknown as Awaited<ReturnType<typeof window.api.terminal.create>>))

      renderWithDs(<TerminalView active />)

      // 복원 effect 는 collectLeafIds(tree) 순서로 leaf 마다 create() 를 순차 호출한다 —
      // 호출 횟수(=leaf 개수)와 순서(=leafId 순서)가 곧 leafId↔세션 매핑의 증거다.
      await waitFor(() => expect(window.api.terminal.create).toHaveBeenCalledTimes(3))
      expect(await screen.findByTitle('분할된 pane 3개')).toBeInTheDocument()
      for (let i = 0; i < 3; i++) {
        expect(await screen.findByTestId(`term-pane-restored-${i}`)).toBeInTheDocument()
      }

      // 원래 focusedLeafId 가 savedLeafIds 에서 몇 번째였는지 == 복원 후 몇 번째 create() 호출로
      // 태어난 세션이 focused 여야 하는지. 트리 모양(row(A, column(B,C)))이 보존됐다는 방증이다.
      for (let i = 0; i < 3; i++) {
        const pane = screen.getByTestId(`term-pane-restored-${i}`)
        expect(pane).toHaveAttribute('data-active', String(i === focusedIndex))
      }
    })
  })
})
