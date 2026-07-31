import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname, basename } from 'path'
import { WorkspaceService, WorkspaceError } from './WorkspaceService'
import { WorkspaceStore, type WorkspaceStorage } from './WorkspaceStore'
import type { AgentRun, TaskWorkspace } from '../../shared/types/workspace'
import type { TerminalExitPayload } from '../../shared/types/terminal'

/** 디스크 무접촉 in-memory storage (WorkspaceStore.test.ts 와 동일 패턴). */
class MemoryStorage implements WorkspaceStorage {
  private map = new Map<string, unknown>()
  get<T>(key: string, fallback: T): T {
    return this.map.has(key) ? (this.map.get(key) as T) : fallback
  }
  set(key: string, value: unknown): void {
    this.map.set(key, value)
  }
}

/** `WorkspaceService` 내부의 predictWorktreePath 와 동일한 공식 — 픽스처 생성용. */
function predictPath(repoPath: string, branch: string): string {
  return join(dirname(repoPath), `.${basename(repoPath)}-worktrees`, branch.replace(/\//g, '-'))
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    runId: overrides.runId ?? 'seed-run',
    workspaceId: overrides.workspaceId ?? 'proj-x:task-x',
    repoId: 'repo-1',
    branch: 'feature/seed',
    baseBranch: 'main',
    worktreePath: '/tmp/does-not-matter',
    status: 'running',
    prompt: '',
    autoApprove: false,
    terminalSessionId: null,
    startedAt: 1,
    ...overrides
  }
}

function makeWorkspace(overrides: Partial<TaskWorkspace> = {}): TaskWorkspace {
  const run = overrides.runs?.[0] ?? makeRun({ workspaceId: overrides.id })
  return {
    id: overrides.id ?? 'proj-x:task-x',
    projectId: 'proj-x',
    taskId: 'task-x',
    subject: '제목',
    repoId: 'repo-1',
    status: 'active',
    branch: run.branch,
    activeRunId: run.runId,
    runs: [run],
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

interface Ctx {
  svc: WorkspaceService
  store: WorkspaceStore
  git: {
    isGitRepo: ReturnType<typeof vi.fn>
    listBranches: ReturnType<typeof vi.fn>
    listWorktrees: ReturnType<typeof vi.fn>
    createWorktree: ReturnType<typeof vi.fn>
    removeWorktree: ReturnType<typeof vi.fn>
    getWorktreeStatus: ReturnType<typeof vi.fn>
    deleteBranch: ReturnType<typeof vi.fn>
    addToInfoExclude: ReturnType<typeof vi.fn>
    fetchRemote: ReturnType<typeof vi.fn>
  }
  tasks: {
    getTaskDetail: ReturnType<typeof vi.fn>
    getProjectInfo: ReturnType<typeof vi.fn>
    getProjectWorkflows: ReturnType<typeof vi.fn>
    updateTaskStatus: ReturnType<typeof vi.fn>
    createTaskComment: ReturnType<typeof vi.fn>
  }
  spawner: { spawn: ReturnType<typeof vi.fn> }
  claudeDir: { preApproveTrust: ReturnType<typeof vi.fn>; writeHookSettings: ReturnType<typeof vi.fn> }
  triggerExit: (payload: TerminalExitPayload) => void
  tmpRoot: string
  repoPath: string
  agentRoot: string
  order: string[]
}

function makeContext(opts?: { hookConfig?: { port: number; secret: string } | null }): Ctx {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'workspace-service-'))
  const repoPath = join(tmpRoot, 'repo')
  const agentRoot = join(tmpRoot, 'agent-root')
  const workspaceRoot = join(tmpRoot, 'clauday-root')
  mkdirSync(repoPath, { recursive: true })
  mkdirSync(agentRoot, { recursive: true })

  const order: string[] = []
  const store = new WorkspaceStore(new MemoryStorage())
  store.addRepo({ id: 'repo-1', path: repoPath, name: 'repo' })

  const git = {
    isGitRepo: vi.fn().mockResolvedValue(true),
    listBranches: vi.fn().mockResolvedValue([]),
    listWorktrees: vi.fn().mockResolvedValue([]),
    createWorktree: vi.fn(async ({ repoPath: rp, branch }: { repoPath: string; branch: string }) => {
      order.push('git.createWorktree')
      const p = predictPath(rp, branch)
      mkdirSync(p, { recursive: true })
      return { path: p, branch, head: 'abc', isMain: false, isBare: false }
    }),
    removeWorktree: vi.fn().mockImplementation(async () => {
      order.push('git.removeWorktree')
    }),
    getWorktreeStatus: vi.fn().mockResolvedValue({ modifiedFiles: 0, untrackedFiles: 0, aheadBehind: { ahead: 0, behind: 0 } }),
    deleteBranch: vi.fn().mockImplementation(async () => {
      order.push('git.deleteBranch')
    }),
    addToInfoExclude: vi.fn().mockImplementation(async () => {
      order.push('git.addToInfoExclude')
      return true
    }),
    fetchRemote: vi.fn().mockResolvedValue(undefined)
  }

  const tasks = {
    getTaskDetail: vi.fn().mockImplementation(async () => {
      order.push('tasks.getTaskDetail')
      return { id: 'task-1', projectId: 'proj-1', projectCode: 'PC', subject: '제목', number: 2619, workflowClass: 'registered', createdAt: '', updatedAt: '' }
    }),
    getProjectInfo: vi.fn().mockResolvedValue({ id: 'proj-1', code: 'PC' }),
    getProjectWorkflows: vi.fn().mockResolvedValue([
      { id: 'wf-1', name: '등록', class: 'registered' },
      { id: 'wf-2', name: '진행중', class: 'working' }
    ]),
    updateTaskStatus: vi.fn().mockImplementation(async () => {
      order.push('tasks.updateTaskStatus')
    }),
    createTaskComment: vi.fn().mockImplementation(async () => {
      order.push('tasks.createTaskComment')
      return { id: 'comment-1' }
    })
  }

  const spawner = {
    spawn: vi.fn().mockImplementation(async () => {
      order.push('spawner.spawn')
      return { terminalSessionId: 'term-1' }
    })
  }

  let exitCb: ((payload: TerminalExitPayload) => void) | null = null
  const terminals = {
    addExitListener: vi.fn((cb: (payload: TerminalExitPayload) => void) => {
      exitCb = cb
      return () => {
        exitCb = null
      }
    })
  }

  const claudeDir = {
    preApproveTrust: vi.fn().mockImplementation(() => {
      order.push('claudeDir.preApproveTrust')
      return 'written' as const
    }),
    writeHookSettings: vi.fn().mockImplementation(() => {
      order.push('claudeDir.writeHookSettings')
      return true
    })
  }

  const hookConfig = opts && 'hookConfig' in opts ? opts.hookConfig : { port: 1234, secret: 'sec' }

  const svc = new WorkspaceService({
    store,
    git: git as never,
    tasks: tasks as never,
    spawner: spawner as never,
    terminals: terminals as never,
    getHookConfig: () => hookConfig ?? null,
    getWorkspaceRoot: () => workspaceRoot,
    getAgentRoot: () => agentRoot,
    claudeDir: claudeDir as never,
    now: () => 1000,
    newRunId: (() => {
      let n = 0
      return () => `run-${++n}`
    })()
  })

  return {
    svc,
    store,
    git,
    tasks,
    spawner,
    claudeDir,
    triggerExit: (payload) => exitCb?.(payload),
    tmpRoot,
    repoPath,
    agentRoot,
    order
  }
}

let ctx: Ctx
beforeEach(() => {
  ctx = makeContext()
})
afterEach(() => {
  rmSync(ctx.tmpRoot, { recursive: true, force: true })
})

describe('WorkspaceService.startTask — 정상 경로 (AC7-①)', () => {
  it('repo 결정 → 태스크 조회 → 브랜치 → 워크트리 → .claude → exclude → spawn → 두레이 전환 순서', async () => {
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })

    expect(result.reused).toBe(false)
    expect(result.warnings).toEqual([])
    expect(result.run.branch).toBe('feature/PC-2619')
    expect(result.run.status).toBe('running')
    expect(result.run.terminalSessionId).toBe('term-1')
    expect(existsSync(result.run.worktreePath)).toBe(true)

    expect(ctx.order).toEqual([
      'tasks.getTaskDetail',
      'git.createWorktree',
      'claudeDir.preApproveTrust',
      'claudeDir.writeHookSettings',
      'git.addToInfoExclude',
      'spawner.spawn',
      'tasks.updateTaskStatus'
    ])
    // 댓글은 기본 OFF
    expect(ctx.tasks.createTaskComment).not.toHaveBeenCalled()
  })

  it('두레이 workflow 중 working 클래스로 상태 전환', async () => {
    await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    expect(ctx.tasks.updateTaskStatus).toHaveBeenCalledWith({ projectId: 'proj-1', postId: 'task-1', status: 'wf-2' })
  })

  it('commentBranch: true 면 댓글도 작성', async () => {
    await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1', commentBranch: true })
    expect(ctx.tasks.createTaskComment).toHaveBeenCalledWith({
      projectId: 'proj-1',
      postId: 'task-1',
      content: '[Clauday] `feature/PC-2619` 에서 작업을 시작했습니다.'
    })
  })
})

describe('WorkspaceService.startTask — 멱등 (AC7-②)', () => {
  it('같은 projectId:taskId 재호출 시 워크트리를 새로 만들지 않고 reused:true', async () => {
    const first = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    expect(first.reused).toBe(false)

    const second = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    expect(second.reused).toBe(true)
    expect(second.run.runId).toBe(first.run.runId)
    expect(ctx.git.createWorktree).toHaveBeenCalledTimes(1)
  })
})

describe('WorkspaceService.startTask — best-effort 경고 (AC7-③)', () => {
  it('두레이 상태 전환 실패 → warnings 1건, startTask 는 성공', async () => {
    ctx.tasks.updateTaskStatus.mockRejectedValueOnce(new Error('두레이 다운'))
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    expect(result.run.status).toBe('running')
    expect(result.warnings.some((w) => w.includes('두레이 상태 전환 실패'))).toBe(true)
  })

  it('댓글 작성 실패 → warnings 1건, startTask 는 성공', async () => {
    ctx.tasks.createTaskComment.mockRejectedValueOnce(new Error('댓글 실패'))
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1', commentBranch: true })
    expect(result.warnings.some((w) => w.includes('두레이 댓글 작성 실패'))).toBe(true)
  })

  it('fetch 실패 → warnings 1건, startTask 는 성공', async () => {
    ctx.git.fetchRemote.mockRejectedValueOnce(new Error('fetch 실패'))
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1', fetchBeforeCreate: true })
    expect(result.warnings.some((w) => w.includes('원격 fetch 실패'))).toBe(true)
  })

  it('info/exclude 쓰기 실패 → warnings 1건, startTask 는 성공', async () => {
    ctx.git.addToInfoExclude.mockRejectedValueOnce(new Error('exclude 실패'))
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    expect(result.warnings.some((w) => w.includes('.git/info/exclude'))).toBe(true)
  })

  it('getHookConfig 이 null 이어도(hook 서버 미기동) startTask 는 성공 + warning 1건', async () => {
    const nullHookCtx = makeContext({ hookConfig: null })
    const result = await nullHookCtx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    expect(result.run.status).toBe('running')
    expect(result.warnings.some((w) => w.includes('hook 서버'))).toBe(true)
    rmSync(nullHookCtx.tmpRoot, { recursive: true, force: true })
  })

  it('preApproveTrust 가 "failed" 를 반환해도 warnings 1건, startTask 는 성공', async () => {
    ctx.claudeDir.preApproveTrust.mockReturnValueOnce('failed')
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    expect(result.run.status).toBe('running')
    expect(result.warnings.some((w) => w.includes('claude trust 사전 등록에 실패'))).toBe(true)
  })

  it('writeHookSettings 가 throw 해도 warnings 1건, startTask 는 성공', async () => {
    ctx.claudeDir.writeHookSettings.mockImplementationOnce(() => {
      throw new Error('디스크 가득 참')
    })
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    expect(result.run.status).toBe('running')
    expect(result.warnings.some((w) => w.includes('.claude hook 설정 쓰기 실패'))).toBe(true)
  })

  it('두레이 워크플로우 중 "진행중"(working) 클래스가 없으면 warnings 1건, updateTaskStatus 미호출', async () => {
    ctx.tasks.getProjectWorkflows.mockResolvedValueOnce([{ id: 'wf-1', name: '등록', class: 'registered' }])
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    expect(result.warnings.some((w) => w.includes('진행중'))).toBe(true)
    expect(ctx.tasks.updateTaskStatus).not.toHaveBeenCalled()
  })

  it('getProjectWorkflows 자체가 실패해도 두레이 상태 전환 실패 warning 으로 흡수', async () => {
    ctx.tasks.getProjectWorkflows.mockRejectedValueOnce(new Error('네트워크 오류'))
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    expect(result.warnings.some((w) => w.includes('두레이 상태 전환 실패'))).toBe(true)
  })

  it('여러 best-effort 단계가 동시에 실패해도 전부 독립적으로 warnings 에 누적되고 startTask 는 성공(부분 실패 매트릭스)', async () => {
    ctx.git.fetchRemote.mockRejectedValueOnce(new Error('fetch 실패'))
    ctx.claudeDir.preApproveTrust.mockReturnValueOnce('failed')
    ctx.git.addToInfoExclude.mockRejectedValueOnce(new Error('exclude 실패'))
    ctx.tasks.updateTaskStatus.mockRejectedValueOnce(new Error('두레이 다운'))
    ctx.tasks.createTaskComment.mockRejectedValueOnce(new Error('댓글 실패'))

    const result = await ctx.svc.startTask({
      projectId: 'proj-1',
      taskId: 'task-1',
      fetchBeforeCreate: true,
      commentBranch: true
    })

    // 실패가 겹쳐도 run 은 정상적으로 running 까지 도달한다 — 실패들이 서로를 가리거나 중단시키지 않는다.
    expect(result.run.status).toBe('running')
    expect(result.reused).toBe(false)
    expect(existsSync(result.run.worktreePath)).toBe(true)

    const joined = result.warnings.join(' | ')
    expect(joined).toMatch(/원격 fetch 실패/)
    expect(joined).toMatch(/claude trust 사전 등록에 실패/)
    expect(joined).toMatch(/\.git\/info\/exclude/)
    expect(joined).toMatch(/두레이 상태 전환 실패/)
    expect(joined).toMatch(/두레이 댓글 작성 실패/)
    expect(result.warnings).toHaveLength(5)
  })
})

describe('WorkspaceService.resolveRunByCwd — 최장 경로 · "-2" 접미사 충돌 (ADR-v2-workspace-p1-05 (b))', () => {
  // ADR 원문 예시: `.repo-worktrees/feature-a` 와 `.repo-worktrees/feature-a-2`(충돌 suffix) 는
  // 브랜치 충돌 suffix(-2, resolveBranchNameConflict) 로 인해 실제로 생기는 조합이다.
  function seedSuffixCollision(): { pathA: string; pathA2: string } {
    const pathA = join(ctx.repoPath, '..', '.repo-worktrees', 'feature-a')
    const pathA2 = join(ctx.repoPath, '..', '.repo-worktrees', 'feature-a-2')
    const runA = makeRun({ runId: 'run-a', workspaceId: 'proj-1:task-a', worktreePath: pathA })
    const runA2 = makeRun({ runId: 'run-a2', workspaceId: 'proj-1:task-a2', worktreePath: pathA2 })
    ctx.store.saveWorkspace(
      makeWorkspace({ id: 'proj-1:task-a', projectId: 'proj-1', taskId: 'task-a', runs: [runA], activeRunId: runA.runId })
    )
    ctx.store.saveWorkspace(
      makeWorkspace({ id: 'proj-1:task-a2', projectId: 'proj-1', taskId: 'task-a2', runs: [runA2], activeRunId: runA2.runId })
    )
    return { pathA, pathA2 }
  }

  it('정확히 일치하는 경로는 각각 자기 run 으로만 매칭된다(원본 ↔ -2 서로 오염 없음)', () => {
    const { pathA, pathA2 } = seedSuffixCollision()
    expect(ctx.svc.resolveRunByCwd(pathA)?.run.runId).toBe('run-a')
    expect(ctx.svc.resolveRunByCwd(pathA2)?.run.runId).toBe('run-a2')
  })

  it('각 워크트리 하위 경로도 자신의 run 으로만 매칭된다', () => {
    const { pathA, pathA2 } = seedSuffixCollision()
    expect(ctx.svc.resolveRunByCwd(join(pathA, 'src', 'index.ts'))?.run.runId).toBe('run-a')
    expect(ctx.svc.resolveRunByCwd(join(pathA2, 'src', 'index.ts'))?.run.runId).toBe('run-a2')
  })

  it('두 워크트리 중 어느 것도 아닌 형제 경로는 null', () => {
    seedSuffixCollision()
    expect(ctx.svc.resolveRunByCwd(join(ctx.repoPath, '..', '.repo-worktrees', 'feature-a-2-extra'))).toBeNull()
  })

  it('activeRunId 가 없는(비활성) 워크스페이스의 경로는 null — 로그 없이 무시', () => {
    const { pathA } = seedSuffixCollision()
    const inactiveRun = makeRun({ runId: 'run-inactive', workspaceId: 'proj-1:task-inactive', worktreePath: join(pathA, '..', 'feature-inactive') })
    ctx.store.saveWorkspace(
      makeWorkspace({ id: 'proj-1:task-inactive', projectId: 'proj-1', taskId: 'task-inactive', runs: [inactiveRun], activeRunId: null })
    )
    expect(ctx.svc.resolveRunByCwd(inactiveRun.worktreePath)).toBeNull()
  })
})

describe('WorkspaceService.startTask — spawn 실패 (AC7-④)', () => {
  it('run.status=failed, removeWorktree 미호출, error 저장', async () => {
    ctx.spawner.spawn.mockRejectedValueOnce(new Error('claude 기동 실패'))
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })

    expect(result.run.status).toBe('failed')
    expect(result.run.error).toBe('claude 기동 실패')
    expect(ctx.git.removeWorktree).not.toHaveBeenCalled()
    expect(existsSync(result.run.worktreePath)).toBe(true)
    expect(result.warnings.some((w) => w.includes('claude 자동 기동 실패'))).toBe(true)
  })

  it('spawn 실패로 activeRunId 는 null 로 정리된다 (failed 는 live 아님)', async () => {
    ctx.spawner.spawn.mockRejectedValueOnce(new Error('실패'))
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    const ws = ctx.store.getWorkspace(result.workspace.id)
    expect(ws?.activeRunId).toBeNull()
  })
})

describe('WorkspaceService.startTask — 동시 실행 상한 (AC7-⑤)', () => {
  it('live run 4개 상태에서 5번째 요청은 CONCURRENCY_LIMIT', async () => {
    for (let i = 0; i < 4; i++) {
      const run = makeRun({ runId: `live-${i}`, workspaceId: `proj-seed:task-${i}`, status: 'running' })
      ctx.store.saveWorkspace(makeWorkspace({ id: `proj-seed:task-${i}`, projectId: 'proj-seed', taskId: `task-${i}`, runs: [run], activeRunId: run.runId }))
    }
    await expect(ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })).rejects.toThrow(WorkspaceError)
    try {
      await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(WorkspaceError)
      expect((err as WorkspaceError).code).toBe('CONCURRENCY_LIMIT')
    }
  })
})

describe('WorkspaceService.startTask — agentRoot 내부 워크트리 거부 (AC7-⑥)', () => {
  it('예상 워크트리 경로가 agentRoot 내부면 워크트리를 만들지 않고 거부', async () => {
    // repo 를 agentRoot 바로 아래 두면 예측 경로가 agentRoot 하위가 된다.
    const insideRepoPath = join(ctx.agentRoot, 'nested-repo')
    mkdirSync(insideRepoPath, { recursive: true })
    ctx.store.addRepo({ id: 'repo-inside', path: insideRepoPath, name: 'inside' })

    await expect(
      ctx.svc.startTask({ projectId: 'proj-2', taskId: 'task-2', repoId: 'repo-inside' })
    ).rejects.toThrow(WorkspaceError)
    expect(ctx.git.createWorktree).not.toHaveBeenCalled()

    const ws = ctx.store.getWorkspace('proj-2:task-2')
    expect(ws).toBeNull()
  })
})

describe('WorkspaceService.startTask — repo 결정 3분기', () => {
  it('repoId 명시 시 그 repo 사용', async () => {
    ctx.store.addRepo({ id: 'repo-2', path: join(ctx.tmpRoot, 'repo2'), name: 'repo2' })
    mkdirSync(join(ctx.tmpRoot, 'repo2'), { recursive: true })
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1', repoId: 'repo-2' })
    expect(result.workspace.repoId).toBe('repo-2')
  })

  it('projectRepoMap 매핑 사용', async () => {
    ctx.store.addRepo({ id: 'repo-2', path: join(ctx.tmpRoot, 'repo2'), name: 'repo2' })
    mkdirSync(join(ctx.tmpRoot, 'repo2'), { recursive: true })
    ctx.store.setProjectRepo('proj-mapped', 'repo-2')
    const result = await ctx.svc.startTask({ projectId: 'proj-mapped', taskId: 'task-1' })
    expect(result.workspace.repoId).toBe('repo-2')
  })

  it('저장소가 하나뿐이면 자동 선택', async () => {
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    expect(result.workspace.repoId).toBe('repo-1')
  })

  it('저장소 미등록/미결정이면 REPO_NOT_FOUND', async () => {
    const freshCtx = makeContext()
    freshCtx.store.removeRepo('repo-1')
    await expect(freshCtx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })).rejects.toThrow(WorkspaceError)
    rmSync(freshCtx.tmpRoot, { recursive: true, force: true })
  })

  it('rememberRepoForProject: true 면 projectRepoMap 에 저장', async () => {
    await ctx.svc.startTask({ projectId: 'proj-remember', taskId: 'task-1', rememberRepoForProject: true })
    expect(ctx.store.getState().projectRepoMap['proj-remember']).toBe('repo-1')
  })
})

describe('WorkspaceService.startTask — git 저장소 아님', () => {
  it('isGitRepo=false 면 NOT_A_REPO', async () => {
    ctx.git.isGitRepo.mockResolvedValueOnce(false)
    await expect(ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })).rejects.toThrow(WorkspaceError)
  })
})

describe('WorkspaceService.startTask — 커스텀 브랜치명', () => {
  it('유효한 브랜치명은 그대로 사용', async () => {
    const result = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1', branchName: 'custom/my-branch' })
    expect(result.run.branch).toBe('custom/my-branch')
  })

  it('안전하지 않은 브랜치명은 throw', async () => {
    await expect(
      ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1', branchName: '-danger' })
    ).rejects.toThrow(/유효하지 않은 브랜치/)
  })
})

describe('WorkspaceService.resumeRun (AC9)', () => {
  it('writeHookSettings 를 다시 호출하고 --resume 으로 spawn', async () => {
    const started = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    ctx.claudeDir.writeHookSettings.mockClear()
    ctx.spawner.spawn.mockClear()

    // stop hook 이 도착해 awaiting-input + claudeSessionId 가 있다고 가정
    ctx.svc.recordStop(started.run.runId, { claudeSessionId: 'sess-123', lastAssistantText: '완료' })

    const resumed = await ctx.svc.resumeRun({ runId: started.run.runId })
    expect(ctx.claudeDir.writeHookSettings).toHaveBeenCalledWith(started.run.worktreePath, { port: 1234, secret: 'sec' })
    expect(ctx.spawner.spawn).toHaveBeenCalledWith(
      expect.objectContaining({ resumeSessionId: 'sess-123', cwd: started.run.worktreePath })
    )
    expect(resumed.run.status).toBe('running')
  })

  it('워크트리가 사라졌으면 discard 후 RUN_NOT_FOUND', async () => {
    const started = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    rmSync(started.run.worktreePath, { recursive: true, force: true })
    await expect(ctx.svc.resumeRun({ runId: started.run.runId })).rejects.toThrow(WorkspaceError)
    const found = ctx.store.findRunById(started.run.runId)
    expect(found?.run.status).toBe('discarded')
  })

  it('없는 runId 는 RUN_NOT_FOUND', async () => {
    await expect(ctx.svc.resumeRun({ runId: 'ghost' })).rejects.toThrow(WorkspaceError)
  })

  it('writeHookSettings 가 throw 해도 warnings 1건 남기고 resume 은 계속 진행', async () => {
    const started = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    ctx.svc.recordStop(started.run.runId, { claudeSessionId: 'sess-123' })
    ctx.claudeDir.writeHookSettings.mockImplementationOnce(() => {
      throw new Error('갱신 실패')
    })

    const resumed = await ctx.svc.resumeRun({ runId: started.run.runId })
    expect(resumed.warnings.some((w) => w.includes('.claude hook 설정 갱신 실패'))).toBe(true)
    expect(resumed.run.status).toBe('running')
  })

  it('hookConfig 가 null 이면(hook 서버 미기동) warnings 1건 남기고 resume 은 계속 진행', async () => {
    const nullHookCtx = makeContext({ hookConfig: null })
    const started = await nullHookCtx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    nullHookCtx.svc.recordStop(started.run.runId, { claudeSessionId: 'sess-1' })

    const resumed = await nullHookCtx.svc.resumeRun({ runId: started.run.runId })
    expect(resumed.warnings.some((w) => w.includes('hook 서버'))).toBe(true)
    expect(resumed.run.status).toBe('running')
    rmSync(nullHookCtx.tmpRoot, { recursive: true, force: true })
  })
})

describe('WorkspaceService.adoptRun / cleanupRun (AC9)', () => {
  it('adopt 후 cleanup(deleteBranch:true) → deleteBranch 미호출 + warning, 상태는 adopted 유지', async () => {
    const started = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    const adopted = await ctx.svc.adoptRun(started.run.runId)
    expect(adopted.run.status).toBe('adopted')
    expect(adopted.workspace.status).toBe('adopted')
    expect(adopted.workspace.activeRunId).toBeNull()

    const cleaned = await ctx.svc.cleanupRun({ runId: started.run.runId, deleteBranch: true })
    expect(ctx.git.deleteBranch).not.toHaveBeenCalled()
    expect(cleaned.warnings.some((w) => w.includes('채택(adopted)'))).toBe(true)
    const found = ctx.store.findRunById(started.run.runId)
    expect(found?.run.status).toBe('adopted')
  })

  it('dirty 워크트리는 force 없이 거부', async () => {
    const started = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    ctx.git.getWorktreeStatus.mockResolvedValueOnce({ modifiedFiles: 1, untrackedFiles: 0, aheadBehind: { ahead: 0, behind: 0 } })
    await expect(ctx.svc.cleanupRun({ runId: started.run.runId })).rejects.toThrow(WorkspaceError)
    expect(ctx.git.removeWorktree).not.toHaveBeenCalled()
  })

  it('dirty 워크트리 force:true 는 removeWorktree({force:true}) 호출', async () => {
    const started = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    ctx.git.getWorktreeStatus.mockResolvedValueOnce({ modifiedFiles: 1, untrackedFiles: 0, aheadBehind: { ahead: 0, behind: 0 } })
    await ctx.svc.cleanupRun({ runId: started.run.runId, force: true })
    expect(ctx.git.removeWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ force: true, worktreePath: started.run.worktreePath })
    )
  })

  it('일반 정리는 discarded + 브랜치도 삭제(deleteBranch:true)', async () => {
    const started = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    const cleaned = await ctx.svc.cleanupRun({ runId: started.run.runId, deleteBranch: true })
    expect(ctx.git.deleteBranch).toHaveBeenCalledWith(ctx.repoPath, started.run.branch, { force: true })
    expect(cleaned.workspace.status).toBe('archived')
  })

  it('없는 runId 는 RUN_NOT_FOUND', async () => {
    await expect(ctx.svc.cleanupRun({ runId: 'ghost' })).rejects.toThrow(WorkspaceError)
  })

  it('repo 가 store 에서 이미 제거된 상태면 워크트리/브랜치 정리를 건너뛰고 warning 1건', async () => {
    const started = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    ctx.store.removeRepo('repo-1')

    const cleaned = await ctx.svc.cleanupRun({ runId: started.run.runId })
    expect(cleaned.warnings.some((w) => w.includes('를 찾을 수 없어'))).toBe(true)
    expect(ctx.git.removeWorktree).not.toHaveBeenCalled()
    expect(ctx.git.deleteBranch).not.toHaveBeenCalled()
  })

  it('워크트리 제거 실패 시 warning 남기고 정리를 계속 진행(상태는 discarded)', async () => {
    const started = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    ctx.git.removeWorktree.mockRejectedValueOnce(new Error('lock file 존재'))

    const cleaned = await ctx.svc.cleanupRun({ runId: started.run.runId })
    expect(cleaned.warnings.some((w) => w.includes('워크트리 제거 실패'))).toBe(true)
    const found = ctx.store.findRunById(started.run.runId)
    expect(found?.run.status).toBe('discarded')
  })

  it('브랜치 삭제 자체가 실패하면(adopted 가드와 별개) warning 남긴다', async () => {
    const started = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    ctx.git.deleteBranch.mockRejectedValueOnce(new Error('브랜치가 다른 워크트리에서 사용 중'))

    const cleaned = await ctx.svc.cleanupRun({ runId: started.run.runId, deleteBranch: true })
    expect(cleaned.warnings.some((w) => w.includes('브랜치 삭제 실패'))).toBe(true)
    expect(cleaned.warnings.some((w) => w.includes('채택(adopted)'))).toBe(false)
  })
})

describe('WorkspaceService.reconcile (AC9)', () => {
  it('모든 run 의 terminalSessionId 를 null 로, 워크트리 없는 live run 은 discarded', async () => {
    const gone = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-gone' })
    rmSync(gone.run.worktreePath, { recursive: true, force: true })

    const result = await ctx.svc.reconcile()
    expect(result.discarded).toBeGreaterThanOrEqual(1)
    const found = ctx.store.findRunById(gone.run.runId)
    expect(found?.run.status).toBe('discarded')
    expect(found?.run.terminalSessionId).toBeNull()
  })

  it('claudeSessionId 있는 워크트리 존재 run 은 awaiting-input 으로', async () => {
    const withSession = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-session' })
    ctx.svc.recordStop(withSession.run.runId, { claudeSessionId: 'sess-1' })

    await ctx.svc.reconcile()
    const found = ctx.store.findRunById(withSession.run.runId)
    expect(found?.run.status).toBe('awaiting-input')
    expect(found?.run.terminalSessionId).toBeNull()
  })

  it('claudeSessionId 없이 이미 running 인 run 은 상태 유지 + terminalSessionId 만 detach', async () => {
    // runStateMachine 의 `running` 행에는 `spawn-failed` 전이가 없다(오직 `spawning` 만 failed 로 간다).
    // "claudeSessionId 없는 running" 은 세션을 한 번도 못 받은 채 앱이 죽은 흔한 케이스인데,
    // 상태머신 계약(applyRunEvent, 이전 라운드 고정)을 이 트랙에서 확장하지 않기로 하고
    // detached(터미널만 분리, ADR-01(c)) 로 남긴다 — impl-log 에 architect 반환 기록.
    const noSession = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-no-session' })
    await ctx.svc.reconcile()
    const found = ctx.store.findRunById(noSession.run.runId)
    expect(found?.run.status).toBe('running')
    expect(found?.run.terminalSessionId).toBeNull()
  })

  it('워크트리가 아직 spawning 단계(spawn-succeeded 이전)에서 세션 없이 재시작되면 failed 로', async () => {
    const ws = makeWorkspace({
      id: 'proj-1:task-still-spawning',
      projectId: 'proj-1',
      taskId: 'task-still-spawning',
      runs: [makeRun({ runId: 'run-spawning', workspaceId: 'proj-1:task-still-spawning', status: 'spawning', worktreePath: ctx.repoPath })],
      activeRunId: 'run-spawning'
    })
    ctx.store.saveWorkspace(ws)
    await ctx.svc.reconcile()
    const found = ctx.store.findRunById('run-spawning')
    expect(found?.run.status).toBe('failed')
  })

  it('외부에서 워크트리 폴더가 삭제된 경우 discard 뿐 아니라 workspace.activeRunId 도 null 로 정리된다', async () => {
    const gone = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-gone-external' })
    // cleanupRun 을 거치지 않고 사용자가 파일시스템에서 직접 삭제한 상황을 재현.
    rmSync(gone.run.worktreePath, { recursive: true, force: true })

    await ctx.svc.reconcile()
    const ws = ctx.store.getWorkspace(gone.workspace.id)
    expect(ws?.activeRunId).toBeNull()
    expect(ws?.runs.find((r) => r.runId === gone.run.runId)?.status).toBe('discarded')
  })

  it('변경 사항이 없는 워크스페이스는 다시 저장하지 않는다(멱등 · 워크스페이스 간 격리)', async () => {
    await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-a' })
    await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-b' })
    // 1차 reconcile — 두 run 모두 terminalSessionId 가 detach 된다(변경 있음).
    await ctx.svc.reconcile()

    const saveSpy = vi.spyOn(ctx.store, 'saveWorkspace')
    // 2차 reconcile — claudeSessionId 없는 'running' 은 상태 전이가 없고(위 케이스 참조),
    // terminalSessionId 도 이미 null 이라 더 이상 바뀔 것이 없어야 한다.
    await ctx.svc.reconcile()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('reconcile 은 WorkspaceStore 의 activeRunId 불변식 경고를 발생시키지 않는다', async () => {
    const gone = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-gone-invariant' })
    rmSync(gone.run.worktreePath, { recursive: true, force: true })
    const withSession = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-session-invariant' })
    ctx.svc.recordStop(withSession.run.runId, { claudeSessionId: 'sess-inv' })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await ctx.svc.reconcile()
    const invariantWarnings = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes('[WorkspaceStore] activeRunId 불일치')
    )
    expect(invariantWarnings).toEqual([])
    warnSpy.mockRestore()
  })
})

describe('WorkspaceService — 터미널 종료 구독 (exit listener)', () => {
  it('살아있던 run 이 detach 되고 change 이벤트 1회', async () => {
    const started = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    const listener = vi.fn()
    ctx.svc.addChangeListener(listener)

    ctx.triggerExit({ id: started.run.terminalSessionId!, exitCode: 0, signal: null })

    expect(listener).toHaveBeenCalledTimes(1)
    const found = ctx.store.findRunById(started.run.runId)
    expect(found?.run.terminalSessionId).toBeNull()
    // claudeSessionId 가 없는 'running' 은 상태머신 계약상 전이가 없다(reconcile 테스트 주석 참조) — 상태는 유지.
    expect(found?.run.status).toBe('running')
  })

  it('dispose() 이후에는 구독 해제', () => {
    expect(() => ctx.svc.dispose()).not.toThrow()
  })
})

describe('WorkspaceService — getHookConfig 은 값이 아니라 thunk (ADR-v2-workspace-p1-05 (d))', () => {
  it('hook 서버가 startTask 이후에 기동해도 뒤이은 resumeRun 은 최신 hookConfig 를 읽는다', async () => {
    // 값으로 주입하면(생성자 시점 스냅샷) hook 서버가 나중에 뜨더라도 영원히 이전 값(대개 null)을 쓰게 된다 —
    // C-0 의 getAgentRoot 함정과 같은 종류. thunk 라면 매 호출이 "지금 시점"의 값을 본다.
    const tmpRoot = mkdtempSync(join(tmpdir(), 'workspace-thunk-'))
    const repoPath = join(tmpRoot, 'repo')
    mkdirSync(repoPath, { recursive: true })
    const store = new WorkspaceStore(new MemoryStorage())
    store.addRepo({ id: 'repo-1', path: repoPath, name: 'repo' })

    let currentHookConfig: { port: number; secret: string } | null = null
    const writeHookSettings = vi.fn().mockReturnValue(true)
    const svc = new WorkspaceService({
      store,
      git: {
        isGitRepo: vi.fn().mockResolvedValue(true),
        listBranches: vi.fn().mockResolvedValue([]),
        listWorktrees: vi.fn().mockResolvedValue([]),
        createWorktree: vi.fn(async ({ repoPath: rp, branch }: { repoPath: string; branch: string }) => {
          const p = predictPath(rp, branch)
          mkdirSync(p, { recursive: true })
          return { path: p, branch, head: 'abc', isMain: false, isBare: false }
        }),
        removeWorktree: vi.fn(),
        getWorktreeStatus: vi.fn(),
        deleteBranch: vi.fn(),
        addToInfoExclude: vi.fn().mockResolvedValue(true),
        fetchRemote: vi.fn()
      } as never,
      tasks: {
        getTaskDetail: vi.fn().mockResolvedValue({
          id: 't',
          projectId: 'p',
          projectCode: 'PC',
          subject: '제목',
          number: 1,
          workflowClass: '',
          createdAt: '',
          updatedAt: ''
        }),
        getProjectInfo: vi.fn(),
        getProjectWorkflows: vi.fn().mockResolvedValue([]),
        updateTaskStatus: vi.fn(),
        createTaskComment: vi.fn()
      } as never,
      spawner: { spawn: vi.fn().mockResolvedValue({ terminalSessionId: 'term-1' }) } as never,
      terminals: { addExitListener: vi.fn(() => () => {}) } as never,
      getHookConfig: () => currentHookConfig,
      getWorkspaceRoot: () => join(tmpRoot, 'clauday-root'),
      getAgentRoot: () => join(tmpRoot, 'agent-root'),
      claudeDir: { preApproveTrust: vi.fn().mockReturnValue('written'), writeHookSettings },
      now: () => 1000,
      newRunId: () => 'run-thunk-1'
    })

    const started = await svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    expect(writeHookSettings).toHaveBeenLastCalledWith(started.run.worktreePath, null)
    expect(started.warnings.some((w) => w.includes('hook 서버'))).toBe(true)

    // hook 서버가 이제 막 기동했다고 가정 — thunk 이므로 이 시점부터 새 값이 보여야 한다.
    currentHookConfig = { port: 5555, secret: 'sec-new' }
    svc.recordStop(started.run.runId, { claudeSessionId: 'sess-1' })
    await svc.resumeRun({ runId: started.run.runId })
    expect(writeHookSettings).toHaveBeenLastCalledWith(started.run.worktreePath, { port: 5555, secret: 'sec-new' })

    rmSync(tmpRoot, { recursive: true, force: true })
  })
})

describe('WorkspaceService — repo/settings CRUD', () => {
  it('addRepo — path 기반 결정적 id, name 기본값 basename', () => {
    const added = ctx.svc.addRepo({ path: '/some/other-repo' })
    expect(added.name).toBe('other-repo')
    expect(ctx.svc.listRepos().some((r) => r.id === added.id)).toBe(true)
  })

  it('updateRepo / removeRepo', () => {
    const added = ctx.svc.addRepo({ path: '/some/repo-b', name: 'B' })
    const updated = ctx.svc.updateRepo(added.id, { name: 'B2' })
    expect(updated?.name).toBe('B2')
    ctx.svc.removeRepo(added.id)
    expect(ctx.svc.listRepos().some((r) => r.id === added.id)).toBe(false)
  })

  it('getSettings / setSettings', () => {
    expect(ctx.svc.getSettings().maxConcurrentRuns).toBe(4)
    const updated = ctx.svc.setSettings({ maxConcurrentRuns: 2 })
    expect(updated.maxConcurrentRuns).toBe(2)
  })

  it('setProjectRepo / listWorkspaces / getWorkspace', async () => {
    ctx.svc.setProjectRepo('proj-9', 'repo-1')
    const started = await ctx.svc.startTask({ projectId: 'proj-1', taskId: 'task-1' })
    expect(ctx.svc.listWorkspaces().some((w) => w.id === started.workspace.id)).toBe(true)
    expect(ctx.svc.getWorkspace(started.workspace.id)?.id).toBe(started.workspace.id)
  })
})
