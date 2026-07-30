import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DoorayTask } from '@shared/types/dooray'
import type { RepoRegistryEntry, TaskWorkspace, WorkspaceSettings } from '@shared/types/workspace'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import WorkspaceView from './WorkspaceView'

// xterm 은 jsdom 에서 동작하지 않으므로 pane 을 스텁 — TerminalView.test.tsx 선례
vi.mock('../Terminal/TerminalPane', () => ({
  default: ({ sessionId }: { sessionId: string }) => <div data-testid="terminal-pane">{sessionId}</div>
}))

const TASK: DoorayTask = {
  id: 'task-2619',
  projectId: 'proj-1',
  projectCode: 'D-TF',
  subject: '[iOS] 메일 목록 디자인 개선',
  number: 2619,
  workflowClass: 'working',
  tags: [],
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z'
}

const REPO: RepoRegistryEntry = {
  id: 'repo-1',
  path: '/work/ios-dooray',
  name: 'ios-dooray',
  defaultBaseBranch: 'origin/develop'
}

const SETTINGS: WorkspaceSettings = {
  branchTemplate: 'feature/{projectCode}-{taskNumber}',
  maxConcurrentRuns: 4,
  autoApproveDefault: false,
  transitionDoorayDefault: true,
  commentBranchDefault: false
}

function workspaceOf(overrides: Partial<TaskWorkspace> = {}): TaskWorkspace {
  return {
    id: 'proj-1:task-2619',
    projectId: 'proj-1',
    taskId: 'task-2619',
    taskNumber: 2619,
    subject: TASK.subject,
    repoId: REPO.id,
    status: 'active',
    branch: 'feature/D-TF-2619',
    activeRunId: 'run-1',
    runs: [
      {
        runId: 'run-1',
        workspaceId: 'proj-1:task-2619',
        repoId: REPO.id,
        branch: 'feature/D-TF-2619',
        baseBranch: 'origin/develop',
        worktreePath: '/work/.ios-dooray-worktrees/feature-D-TF-2619',
        status: 'running',
        prompt: '',
        autoApprove: false,
        terminalSessionId: 'sess-1',
        startedAt: Date.now()
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  }
}

describe('WorkspaceView', () => {
  beforeEach(() => {
    installMockWindowApi()
    vi.mocked(window.api.dooray.tasks.list).mockResolvedValue([TASK])
    vi.mocked(window.api.workspace.repos.list).mockResolvedValue([REPO])
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue(SETTINGS)
  })
  afterEach(() => resetMockWindowApi())

  it('내 업무 목록을 불러와 표시한다', async () => {
    renderWithDs(<WorkspaceView active />)
    expect(await screen.findByText(TASK.subject)).toBeInTheDocument()
  })

  it('워크스페이스가 없는 태스크는 [작업 시작] 과 설정 요약을 보여준다', async () => {
    renderWithDs(<WorkspaceView active />)
    await userEvent.click(await screen.findByText(TASK.subject))

    expect(await screen.findByRole('button', { name: '작업 시작' })).toBeInTheDocument()
    // 요약 캡션 — 저장소 · base · 브랜치 · 에이전트 1
    expect(await screen.findByText(/ios-dooray · origin\/develop · feature\/D-TF-2619 · 에이전트 1/)).toBeInTheDocument()
  })

  it('원클릭 시작은 마지막 설정을 재사용해 startTask 를 호출한다', async () => {
    const ws = workspaceOf()
    vi.mocked(window.api.workspace.startTask).mockResolvedValue({
      workspace: ws,
      run: ws.runs[0],
      reused: false,
      warnings: []
    })

    renderWithDs(<WorkspaceView active />)
    await userEvent.click(await screen.findByText(TASK.subject))
    await userEvent.click(await screen.findByRole('button', { name: '작업 시작' }))

    await waitFor(() => expect(window.api.workspace.startTask).toHaveBeenCalledTimes(1))
    expect(window.api.workspace.startTask).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        taskId: 'task-2619',
        repoId: 'repo-1',
        autoApprove: false,
        transitionDooray: true
      })
    )
  })

  it('저장소가 없으면 시작하지 않고 안내한다', async () => {
    vi.mocked(window.api.workspace.repos.list).mockResolvedValue([])

    renderWithDs(<WorkspaceView active />)
    await userEvent.click(await screen.findByText(TASK.subject))
    await userEvent.click(await screen.findByRole('button', { name: '작업 시작' }))

    expect(window.api.workspace.startTask).not.toHaveBeenCalled()
    expect(await screen.findByText(/저장소가 등록되어 있지 않습니다/)).toBeInTheDocument()
  })

  it('워크스페이스가 있으면 브랜치 헤더와 터미널을 보여준다', async () => {
    vi.mocked(window.api.workspace.list).mockResolvedValue([workspaceOf()])

    renderWithDs(<WorkspaceView active />)
    await userEvent.click(await screen.findByText(TASK.subject))

    expect(await screen.findByTestId('terminal-pane')).toHaveTextContent('sess-1')
    expect(screen.getAllByText('feature/D-TF-2619').length).toBeGreaterThan(0)
    expect(screen.getByText('작업 중')).toBeInTheDocument()
  })

  it('터미널이 끊긴 run 은 재연결을 제안한다', async () => {
    const ws = workspaceOf()
    ws.runs[0].terminalSessionId = null
    vi.mocked(window.api.workspace.list).mockResolvedValue([ws])

    renderWithDs(<WorkspaceView active />)
    await userEvent.click(await screen.findByText(TASK.subject))

    expect(await screen.findByText(/터미널이 연결되어 있지 않습니다/)).toBeInTheDocument()
    expect(screen.queryByTestId('terminal-pane')).not.toBeInTheDocument()
  })

  it('run 갱신 push 를 받으면 목록에 반영한다', async () => {
    let push: ((p: { workspace: TaskWorkspace; runId: string; reason: 'status' }) => void) | undefined
    vi.mocked(window.api.workspace.onRunUpdated).mockImplementation((cb) => {
      push = cb as typeof push
      return () => undefined
    })

    renderWithDs(<WorkspaceView active />)
    await screen.findByText(TASK.subject)
    expect(screen.queryByText('feature/D-TF-2619')).not.toBeInTheDocument()

    push?.({ workspace: workspaceOf(), runId: 'run-1', reason: 'status' })

    expect(await screen.findByText('feature/D-TF-2619')).toBeInTheDocument()
  })
})
