import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'
import { ClaudeHookRouter } from '../hooks/ClaudeHookRouter'
import { MentionHookHandler, MENTION_HOOK_KIND } from '../dooray/mention/MentionHookHandler'
import { WorkspaceHookHandler, WORKSPACE_HOOK_KIND } from './WorkspaceHookHandler'
import { WorkspaceService } from './WorkspaceService'
import { WorkspaceStore, type WorkspaceStorage } from './WorkspaceStore'
import type { AgentRun, TaskWorkspace } from '../../shared/types/workspace'
import type { HookEventPayload } from '../dooray/mention/HookServer'

/**
 * 우선순위 회귀 테스트 (ADR-v2-workspace-p1-05 (a)) — 멘션 resolver 가 1순위,
 * workspace resolver 가 2순위로 등록된 실제 조합에서 각 cwd 가 올바른 kind 로만 라우팅되는지 검증.
 * 이 테스트가 깨지면 C-0 이 약속한 "멘션 동작 100% 보존" 이 위반된 것이다.
 */

const AGENT_ROOT = join('/tmp', 'clauday-agent-root')

class MemoryStorage implements WorkspaceStorage {
  private map = new Map<string, unknown>()
  get<T>(key: string, fallback: T): T {
    return this.map.has(key) ? (this.map.get(key) as T) : fallback
  }
  set(key: string, value: unknown): void {
    this.map.set(key, value)
  }
}

function makeEvent(partial: Partial<HookEventPayload> & { event: string }): HookEventPayload {
  return { cwd: '', raw: {}, ...partial }
}

function setup(): {
  router: ClaudeHookRouter
  mentionHandle: ReturnType<typeof vi.fn>
  workspaceHandle: ReturnType<typeof vi.fn>
  worktreePath: string
} {
  const mentionHandler = new MentionHookHandler({
    getAgentRoot: () => AGENT_ROOT,
    sessions: { get: vi.fn(), setClaudeSessionId: vi.fn(), markIdle: vi.fn() },
    responder: { send: vi.fn(async () => {}) }
  })

  const store = new WorkspaceStore(new MemoryStorage())
  const worktreePath = '/repo/.x-worktrees/feature-a'
  const run: AgentRun = {
    runId: 'run-1',
    workspaceId: 'proj-1:task-1',
    repoId: 'repo-1',
    branch: 'feature/a',
    baseBranch: 'main',
    worktreePath,
    status: 'running',
    prompt: '',
    autoApprove: false,
    terminalSessionId: null,
    startedAt: 1
  }
  const ws: TaskWorkspace = {
    id: 'proj-1:task-1',
    projectId: 'proj-1',
    taskId: 'task-1',
    subject: '제목',
    repoId: 'repo-1',
    status: 'active',
    branch: 'feature/a',
    activeRunId: 'run-1',
    runs: [run],
    createdAt: 1,
    updatedAt: 1
  }
  store.saveWorkspace(ws)

  const workspaceService = new WorkspaceService({
    store,
    git: {} as never,
    tasks: {} as never,
    spawner: {} as never,
    terminals: { addExitListener: vi.fn(() => () => {}) } as never,
    getHookConfig: () => null,
    getWorkspaceRoot: () => '/tmp/workspace-root',
    getAgentRoot: () => AGENT_ROOT,
    claudeDir: { preApproveTrust: vi.fn(), writeHookSettings: vi.fn() } as never
  })
  const workspaceHandler = new WorkspaceHookHandler({ workspaceService })

  const router = new ClaudeHookRouter()
  // 조립 순서 = index.ts 의 실제 등록 순서(멘션 → 워크스페이스) 재현
  router.addResolver((cwd) => mentionHandler.resolve(cwd))
  router.addResolver((cwd) => workspaceHandler.resolve(cwd))

  const mentionHandle = vi.fn((ev: HookEventPayload, route) => mentionHandler.handle(ev, route))
  const workspaceHandle = vi.fn((ev: HookEventPayload, route) => workspaceHandler.handle(ev, route))
  router.setHandler(MENTION_HOOK_KIND, mentionHandle)
  router.setHandler(WORKSPACE_HOOK_KIND, workspaceHandle)

  return { router, mentionHandle, workspaceHandle, worktreePath }
}

describe('hook resolver 우선순위 — 멘션 1순위, 워크스페이스 2순위 (AC8-①)', () => {
  it('멘션 채널 cwd 는 mention 핸들러로만 간다', async () => {
    const { router, mentionHandle, workspaceHandle } = setup()
    await router.dispatch(makeEvent({ event: 'post_tool_use', cwd: join(AGENT_ROOT, '123', 'tasks') }))
    expect(mentionHandle).toHaveBeenCalledTimes(1)
    expect(workspaceHandle).not.toHaveBeenCalled()
  })

  it('워크트리 cwd 는 workspace 핸들러로만 간다', async () => {
    const { router, mentionHandle, workspaceHandle, worktreePath } = setup()
    await router.dispatch(makeEvent({ event: 'post_tool_use', cwd: worktreePath }))
    expect(workspaceHandle).toHaveBeenCalledTimes(1)
    expect(mentionHandle).not.toHaveBeenCalled()
  })

  it('둘 다 아닌 cwd 는 아무 핸들러도 호출되지 않고 warn 도 없다', async () => {
    const { router, mentionHandle, workspaceHandle } = setup()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await router.dispatch(makeEvent({ event: 'post_tool_use', cwd: '/completely/unrelated/path' }))
    expect(mentionHandle).not.toHaveBeenCalled()
    expect(workspaceHandle).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
