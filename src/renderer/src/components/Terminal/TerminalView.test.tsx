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
import { resetEditorCache } from '../common/OpenInEditorButton'

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

  /**
   * 이슈 #35 — QA 업무는 재현 스크린샷이 본문의 절반이라, 글자만 넘기면 claude 가 반쪽만 본다.
   * 기본 템플릿은 그대로 두었으므로(기본값을 바꾸면 신규 설치에만 닿는다) `{images}` 를 넣은
   * 사용자를 재현한다.
   */
  it('템플릿에 {images} 를 넣으면 첨부 이미지를 내려받아 첫 지시에 로컬 경로로 붙인다', async () => {
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue({
      taskDropPromptTemplate: '{title} {images}'
    } as never)
    vi.mocked(window.api.dooray.tasks.images).mockResolvedValue({
      files: [{ fileId: '111', path: '/tmp/task-images/p1-t1/재현화면-111.png' }],
      omitted: 0
    })
    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    const pane = await screen.findByTestId(/^term-pane-/)

    fireEvent.drop(pane, { dataTransfer: taskTransfer() })

    // 첫 지시는 claude 가 뜨기를 기다렸다 들어간다(기본 3초) — 그 뒤까지 봐야 경로가 보인다.
    await waitFor(
      () => {
        const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
        expect(sent).toContain('/tmp/task-images/p1-t1/재현화면-111.png')
      },
      { timeout: 6000 }
    )
    expect(window.api.dooray.tasks.images).toHaveBeenCalledWith('p1', 't1')
  })

  it('이미지 조회가 실패해도 업무는 그대로 시작된다', async () => {
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue({
      taskDropPromptTemplate: '{title} {images}'
    } as never)
    vi.mocked(window.api.dooray.tasks.images).mockRejectedValue(new Error('두레이 API 실패'))
    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    const pane = await screen.findByTestId(/^term-pane-/)

    fireEvent.drop(pane, { dataTransfer: taskTransfer() })

    await waitFor(() => {
      const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
      expect(sent).toContain('claude')
    })
    expect(window.api.dooray.tasks.images).toHaveBeenCalled()
  })

  /**
   * 기본 드롭은 API 호출 없이 시작한다 — 그게 이 동선의 값어치다.
   * 기본 템플릿에 {images} 를 넣으면 이미지가 없는 업무도 매번 본문·댓글을 조회하게 된다.
   */
  it('기본 템플릿에서는 이미지를 받아오지 않는다 — 드롭이 느려지면 안 된다', async () => {
    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    const pane = await screen.findByTestId(/^term-pane-/)

    fireEvent.drop(pane, { dataTransfer: taskTransfer() })

    await waitFor(() => {
      const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
      expect(sent).toContain('claude')
    })
    expect(window.api.dooray.tasks.images).not.toHaveBeenCalled()
    expect(window.api.dooray.tasks.detail).not.toHaveBeenCalled()
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

  it('탭이 하나도 없는 안내 화면에 놓아도 터미널을 만들어 시작한다', async () => {
    // 여기서 삼키면 '드롭이 안 된다' 로 보인다 — 처음 앱을 켠 사용자가 가장 먼저 만나는 화면이다.
    vi.mocked(window.api.terminal.sessionCwd).mockResolvedValue('/Users/me/Desktop/neon-ai')
    renderWithDs(<TerminalView active />)
    await screen.findByText('터미널')

    const zone = document.querySelector('.flex-1.relative') as HTMLElement
    fireEvent.dragOver(zone, { dataTransfer: taskTransfer() })
    expect(screen.getByText('여기에 놓으면 이 업무로 claude 를 시작합니다')).toBeInTheDocument()

    fireEvent.drop(zone, { dataTransfer: taskTransfer() })

    await waitFor(() => {
      const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
      expect(sent).toContain('claude')
    }, { timeout: 4000 })
  })

  it('매핑된 저장소가 하나면 묻지 않고 그 업무의 워크트리로 이동한다', async () => {
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue({
      projectOverrides: { p1: { repoIds: ['r1'] } }
    } as never)
    vi.mocked(window.api.workspace.repos.list).mockResolvedValue([
      { id: 'r1', path: '/Users/me/Desktop/2NEON', name: '2NEON' }
    ])
    vi.mocked(window.api.terminal.sessionCwd).mockResolvedValue('/Users/me/Desktop/neon-ai')

    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    fireEvent.drop(await screen.findByTestId(/^term-pane-/), { dataTransfer: taskTransfer() })

    await waitFor(() => {
      const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
      expect(sent).toContain("cd '/Users/me/Desktop/2NEON-worktrees/feature-task-t1'")
    })
    expect(window.api.workspace.taskWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: '/Users/me/Desktop/2NEON', branch: 'feature/task-t1' })
    )
  })

  it('매핑된 저장소가 여럿이고 지금 자리가 그중 아니면 어디서 할지 묻는다', async () => {
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue({
      projectOverrides: { p1: { repoIds: ['r1', 'r2'] } }
    } as never)
    vi.mocked(window.api.workspace.repos.list).mockResolvedValue([
      { id: 'r1', path: '/Users/me/Desktop/2NEON', name: '2NEON' },
      { id: 'r2', path: '/Users/me/Desktop/neon-ai', name: 'neon-ai' }
    ])
    vi.mocked(window.api.terminal.sessionCwd).mockResolvedValue('/tmp/elsewhere')

    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    fireEvent.drop(await screen.findByTestId(/^term-pane-/), { dataTransfer: taskTransfer() })

    expect(await screen.findByText('어느 저장소에서 시작할까요?')).toBeInTheDocument()
    // 고르기 전에는 아무것도 실행하지 않는다
    expect(vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')).not.toContain('claude')

    await userEvent.click(screen.getByText('neon-ai'))

    await waitFor(() => {
      const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
      expect(sent).toContain("cd '/Users/me/Desktop/neon-ai-worktrees/feature-task-t1'")
    })
  })

  it('저장소 폴더에 있을 때도 그 업무의 워크트리로 옮겨 시작한다', async () => {
    // 사용자가 실제로 겪은 배치 — 저장소를 지정해두고 그 폴더에서 드롭한다.
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue({
      projectOverrides: { p1: { repoIds: ['r1'] } }
    } as never)
    vi.mocked(window.api.workspace.repos.list).mockResolvedValue([
      { id: 'r1', path: '/Users/me/Desktop/2NEON', name: '2NEON' }
    ])
    vi.mocked(window.api.terminal.sessionCwd).mockResolvedValue('/Users/me/Desktop/2NEON')
    vi.mocked(window.api.git.mainRepoRoot).mockResolvedValue('/Users/me/Desktop/2NEON')

    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    fireEvent.drop(await screen.findByTestId(/^term-pane-/), { dataTransfer: taskTransfer() })

    await waitFor(() => {
      const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
      expect(sent).toContain("cd '/Users/me/Desktop/2NEON-worktrees/feature-task-t1'")
    })
  })

  it('워크트리 API 가 없는 구버전 preload 에서도 저장소 폴더에서 시작한다', async () => {
    // 앱을 다시 켜기 전에는 새 채널이 없다 — 여기서 죽으면 드롭이 아무 반응 없이 사라진다.
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue({
      projectOverrides: { p1: { repoIds: ['r1'] } }
    } as never)
    vi.mocked(window.api.workspace.repos.list).mockResolvedValue([
      { id: 'r1', path: '/Users/me/Desktop/2NEON', name: '2NEON' }
    ])
    vi.mocked(window.api.terminal.sessionCwd).mockResolvedValue('/Users/me/Desktop/2NEON')
    const api = window.api as unknown as Record<string, Record<string, unknown>>
    api.workspace.taskWorktree = undefined
    api.git.mainRepoRoot = undefined
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    fireEvent.drop(await screen.findByTestId(/^term-pane-/), { dataTransfer: taskTransfer() })

    await waitFor(() => {
      const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
      expect(sent).toContain('claude')
    })
    warn.mockRestore()
  })

  it('드롭이 실패하면 조용히 사라지지 않고 이유를 알린다', async () => {
    vi.mocked(window.api.workspace.settings.get).mockRejectedValue(new Error('boom'))
    vi.mocked(window.api.workspace.repos.list).mockRejectedValue(new Error('boom'))
    vi.mocked(window.api.terminal.sessionCwd).mockRejectedValue(new Error('probe 실패'))
    vi.mocked(window.api.workspace.taskDrop.linked).mockImplementation(() => {
      throw new Error('링크를 읽지 못했습니다')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    fireEvent.drop(await screen.findByTestId(/^term-pane-/), { dataTransfer: taskTransfer() })

    expect(await screen.findByText('업무를 시작하지 못했습니다')).toBeInTheDocument()
    error.mockRestore()
  })

  it('claude 가 돌고 있는 pane 에는 타이핑하지 않고 새 탭에서 시작한다', async () => {
    // 실행 중인 TUI 에 명령을 보내면 그 프로그램 입력으로 먹혀 진행 중인 대화가 오염된다.
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue({
      projectOverrides: { p1: { repoIds: ['r1'] } }
    } as never)
    vi.mocked(window.api.workspace.repos.list).mockResolvedValue([
      { id: 'r1', path: '/Users/me/Desktop/2NEON', name: '2NEON' }
    ])
    // 다른 업무의 워크트리에서 claude 를 돌리는 중
    vi.mocked(window.api.terminal.sessionCwd).mockResolvedValue(
      '/Users/me/Desktop/.2NEON-worktrees/feature-NEON-6460'
    )
    vi.mocked(window.api.git.mainRepoRoot).mockResolvedValue('/Users/me/Desktop/2NEON')
    vi.mocked(window.api.terminal.foreground).mockResolvedValue('claude')

    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    const before = vi.mocked(window.api.terminal.create).mock.calls.length
    fireEvent.drop(await screen.findByTestId(/^term-pane-/), { dataTransfer: taskTransfer() })

    await waitFor(() => {
      expect(vi.mocked(window.api.terminal.create).mock.calls.length).toBe(before + 1)
    })
    // 새 탭은 목적지 워크트리에서 바로 열고, 거기에 다시 cd 하지 않는다
    expect(vi.mocked(window.api.terminal.create).mock.calls.at(-1)?.[0]).toEqual({
      cwd: '/Users/me/Desktop/2NEON-worktrees/feature-task-t1'
    })
    await waitFor(() => {
      const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
      expect(sent).toContain('claude')
    })
    expect(vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')).not.toContain('cd ')
  })

  it('이미 그 업무의 워크트리 안이면 묻지도 cd 하지도 않는다', async () => {
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue({
      projectOverrides: { p1: { repoIds: ['r1', 'r2'] } }
    } as never)
    vi.mocked(window.api.workspace.repos.list).mockResolvedValue([
      { id: 'r1', path: '/Users/me/Desktop/2NEON', name: '2NEON' },
      { id: 'r2', path: '/Users/me/Desktop/neon-ai', name: 'neon-ai' }
    ])
    // 터미널이 2NEON 의 워크트리 안에 있다 — 경로는 저장소와 다르지만 같은 저장소로 쳐야 한다.
    const worktree = '/Users/me/Desktop/.2NEON-worktrees/feature-task-t1'
    vi.mocked(window.api.terminal.sessionCwd).mockResolvedValue(worktree)
    vi.mocked(window.api.git.mainRepoRoot).mockResolvedValue('/Users/me/Desktop/2NEON')
    vi.mocked(window.api.workspace.taskWorktree).mockResolvedValue({
      path: worktree,
      branch: 'feature/task-t1',
      created: false,
      isMainRepo: false
    })

    renderWithDs(<TerminalView active />)
    await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
    fireEvent.drop(await screen.findByTestId(/^term-pane-/), { dataTransfer: taskTransfer() })

    await waitFor(() => {
      const sent = vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')
      expect(sent).toContain('claude')
    })
    expect(vi.mocked(window.api.terminal.input).mock.calls.map((c) => c[1]).join('')).not.toContain('cd ')
    expect(screen.queryByText('어느 저장소에서 시작할까요?')).not.toBeInTheDocument()
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

  /**
   * 화면이 좁고 탭이 많으면 탭바 전체가 스크롤돼 오른쪽 액션(분할·작업 패널 토글)이 스크롤 밖으로
   * 밀려 누를 수 없었다. 탭 목록만 스크롤되고 액션은 탭바에 고정돼야 한다.
   */
  it('탭이 늘어나도 오른쪽 액션은 탭 스크롤 영역 밖에 남는다', async () => {
    renderWithDs(<TerminalView />)
    await screen.findByText('터미널')

    const drawerToggle = screen.getByTitle('작업 패널 (⌘⇧T)')
    const scroller = document.querySelector('.ds-tabbar-scroll')

    expect(scroller).not.toBeNull()
    // 액션이 스크롤 영역 안에 있으면 탭이 늘어날 때 함께 밀려난다.
    expect(scroller!.contains(drawerToggle)).toBe(false)
    expect(drawerToggle.closest('.ds-tabbar')).not.toBeNull()

    // 새 탭 버튼은 반대로 탭들과 함께 스크롤돼야 한다.
    expect(scroller!.contains(screen.getByTitle('새 터미널 (⌘T)'))).toBe(true)
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
      await screen.findByTestId('term-pane-orig-1', {}, { timeout: 5000 })

      fireEvent.keyDown(window, { key: 'd', metaKey: true }) // ⌘D — row(A, B), B 가 focused
      await screen.findByTestId('term-pane-orig-2', {}, { timeout: 5000 })
      fireEvent.keyDown(window, { key: 'd', metaKey: true, shiftKey: true }) // ⌘⇧D — B 를 column(B, C) 로, C 가 focused
      await screen.findByTestId('term-pane-orig-3', {}, { timeout: 5000 })
      expect(await screen.findByTitle('분할된 pane 3개', {}, { timeout: 5000 })).toBeInTheDocument()

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
      expect(await screen.findByTitle('분할된 pane 3개', {}, { timeout: 5000 })).toBeInTheDocument()
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

  // 탭바 오른쪽 액션이 아이콘만이라 무슨 버튼인지 못 알아보겠다는 제보 → 글자로 드러낸다.
  // 아이콘만 남으면 다시 같은 문제가 되므로 라벨 존재를 계약으로 고정한다.
  describe('탭바 오른쪽 액션 — 글자로 드러내기', () => {
    // 에디터 감지 결과는 모듈 전역에 캐시된다 — 테스트끼리 새지 않게 매번 비운다.
    beforeEach(() => {
      resetEditorCache()
      // 에디터 버튼은 포커스된 pane 의 cwd 가 있어야 나온다. cwd 없이 연 탭은 pane.cwd 가
      // undefined 라 sessionCwd 프로브 결과가 유일한 출처다.
      vi.mocked(window.api.terminal.sessionCwd).mockResolvedValue('/repo/work')
    })
    afterEach(() => { resetEditorCache() })

    /** 탭이 하나 있어야 focusedCwd 가 잡힌다. */
    async function openOneTab(): Promise<void> {
      await userEvent.click(await screen.findByRole('button', { name: '새 터미널' }))
      await waitFor(() => expect(window.api.terminal.create).toHaveBeenCalled())
    }

    it('분할은 묶음 라벨 아래에 두 방향 버튼을 둔다', async () => {
      renderWithDs(<TerminalView />)
      await screen.findByText('터미널')

      const group = document.querySelector('[data-tour="terminal-split"]')
      expect(group).not.toBeNull()
      expect(group).toHaveTextContent('분할')
      // 방향은 아이콘이 맡되, 스크린리더·툴팁으로는 방향이 드러나야 한다.
      expect(screen.getByLabelText('오른쪽으로 분할')).toBeInTheDocument()
      expect(screen.getByLabelText('아래로 분할')).toBeInTheDocument()
    })

    it('에디터 열기 버튼은 감지된 에디터 이름을 글자로 보여준다', async () => {
      vi.mocked(window.api.editor.list).mockResolvedValue([
        { id: 'vscode', name: 'VS Code', target: '/x', kind: 'app' }
      ] as never)

      renderWithDs(<TerminalView active />)
      await openOneTab()

      expect(await screen.findByText('VS Code 로 열기')).toBeInTheDocument()
    })

    it('에디터가 여러 개면 고르는 버튼임을 글자로 알린다', async () => {
      vi.mocked(window.api.editor.list).mockResolvedValue([
        { id: 'vscode', name: 'VS Code', target: '/x', kind: 'app' },
        { id: 'cursor', name: 'Cursor', target: '/y', kind: 'app' }
      ] as never)

      renderWithDs(<TerminalView active />)
      await openOneTab()

      expect(await screen.findByText('에디터로 열기')).toBeInTheDocument()
    })

    it('설치된 에디터가 없으면 버튼을 그리지 않는다 (눌러도 소용없는 버튼 금지)', async () => {
      renderWithDs(<TerminalView active />)
      await openOneTab()

      await waitFor(() =>
        expect(document.querySelector('[data-tour="terminal-open-editor"]')).not.toBeNull()
      )
      expect(document.querySelector('[data-tour="terminal-open-editor"] button')).toBeNull()
    })
  })
})
