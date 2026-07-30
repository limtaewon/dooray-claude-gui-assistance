import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'
import { WorkspaceHookHandler, WORKSPACE_HOOK_KIND } from './WorkspaceHookHandler'
import { WorkspaceService } from './WorkspaceService'
import { WorkspaceStore, type WorkspaceStorage } from './WorkspaceStore'
import type { AgentRun, TaskWorkspace } from '../../shared/types/workspace'
import type { HookEventPayload } from '../dooray/mention/HookServer'

class MemoryStorage implements WorkspaceStorage {
  private map = new Map<string, unknown>()
  get<T>(key: string, fallback: T): T {
    return this.map.has(key) ? (this.map.get(key) as T) : fallback
  }
  set(key: string, value: unknown): void {
    this.map.set(key, value)
  }
}

/** hook 관련 테스트는 resolveRunByCwd/recordStop/recordToolActivity 외 아무것도 안 쓰므로 나머지 deps 는 최소 스텁. */
function makeService(store: WorkspaceStore): WorkspaceService {
  return new WorkspaceService({
    store,
    git: {} as never,
    tasks: {} as never,
    spawner: {} as never,
    terminals: { addExitListener: vi.fn(() => () => {}) } as never,
    getHookConfig: () => null,
    getWorkspaceRoot: () => '/tmp/workspace-root',
    getAgentRoot: () => '/tmp/agent-root',
    claudeDir: { preApproveTrust: vi.fn(), writeHookSettings: vi.fn() } as never
  })
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    runId: 'run-1',
    workspaceId: 'proj-1:task-1',
    repoId: 'repo-1',
    branch: 'feature/a',
    baseBranch: 'main',
    worktreePath: '/repo/.x-worktrees/feature-a',
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
    id: overrides.id ?? 'proj-1:task-1',
    projectId: 'proj-1',
    taskId: 'task-1',
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

function makeEvent(partial: Partial<HookEventPayload> & { event: string; raw?: Record<string, unknown> }): HookEventPayload {
  return { cwd: '', raw: {}, ...partial }
}

describe('WorkspaceHookHandler.resolve', () => {
  it('빈 cwd → null', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const handler = new WorkspaceHookHandler({ workspaceService: makeService(store) })
    expect(handler.resolve('')).toBeNull()
  })

  it('워크트리 정확 일치 → { kind, id: runId }', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const ws = makeWorkspace()
    store.saveWorkspace(ws)
    const handler = new WorkspaceHookHandler({ workspaceService: makeService(store) })
    expect(handler.resolve(ws.runs[0].worktreePath)).toEqual({
      kind: WORKSPACE_HOOK_KIND,
      id: ws.runs[0].runId,
      meta: { workspaceId: ws.id, worktreePath: ws.runs[0].worktreePath }
    })
  })

  it('워크트리 하위 3단계 경로도 매칭', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const ws = makeWorkspace()
    store.saveWorkspace(ws)
    const handler = new WorkspaceHookHandler({ workspaceService: makeService(store) })
    const deep = join(ws.runs[0].worktreePath, 'src', 'main', 'index.ts')
    expect(handler.resolve(deep)?.id).toBe(ws.runs[0].runId)
  })

  it('형제 경로(<worktree>-2) 는 매칭되지 않는다', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const ws = makeWorkspace()
    store.saveWorkspace(ws)
    const handler = new WorkspaceHookHandler({ workspaceService: makeService(store) })
    expect(handler.resolve(`${ws.runs[0].worktreePath}-2`)).toBeNull()
  })

  it('활성 run 이 없으면 null (무로그 무시)', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const handler = new WorkspaceHookHandler({ workspaceService: makeService(store) })
    expect(handler.resolve('/repo/.x-worktrees/feature-a')).toBeNull()
  })

  it('중첩된 워크트리 2개 중 더 긴 경로를 선택', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const outerRun = makeRun({ runId: 'run-outer', workspaceId: 'proj-1:task-outer', worktreePath: '/repo/.x-worktrees/feature-a' })
    const innerRun = makeRun({
      runId: 'run-inner',
      workspaceId: 'proj-1:task-inner',
      worktreePath: '/repo/.x-worktrees/feature-a/nested'
    })
    store.saveWorkspace(makeWorkspace({ id: 'proj-1:task-outer', taskId: 'task-outer', runs: [outerRun], activeRunId: outerRun.runId }))
    store.saveWorkspace(makeWorkspace({ id: 'proj-1:task-inner', taskId: 'task-inner', runs: [innerRun], activeRunId: innerRun.runId }))

    const handler = new WorkspaceHookHandler({ workspaceService: makeService(store) })
    const cwd = join('/repo/.x-worktrees/feature-a/nested', 'src')
    expect(handler.resolve(cwd)?.id).toBe('run-inner')
  })
})

describe('WorkspaceHookHandler.handle — stop', () => {
  it('running → awaiting-input, claudeSessionId 추출, lastAssistantText 저장, push 1회', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const ws = makeWorkspace()
    store.saveWorkspace(ws)
    const svc = makeService(store)
    const pushed = vi.fn()
    svc.addChangeListener(pushed)
    const handler = new WorkspaceHookHandler({ workspaceService: svc })

    const route = handler.resolve(ws.runs[0].worktreePath)!
    handler.handle(
      makeEvent({
        event: 'stop',
        cwd: ws.runs[0].worktreePath,
        raw: {
          transcript_path: '/home/u/.claude/projects/x/abc123.jsonl',
          last_assistant_message: '작업 완료했습니다.'
        }
      }),
      route
    )

    const found = store.findRunById(ws.runs[0].runId)!
    expect(found.run.status).toBe('awaiting-input')
    expect(found.run.claudeSessionId).toBe('abc123')
    expect(found.run.lastAssistantText).toBe('작업 완료했습니다.')
    expect(pushed).toHaveBeenCalledTimes(1)
    expect(pushed.mock.calls[0][0].reason).toBe('status')
  })

  it('last_assistant_message 비어있고 transcript_path 있으면 fallback reader 사용', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const ws = makeWorkspace()
    store.saveWorkspace(ws)
    const svc = makeService(store)
    const readTranscript = vi.fn().mockReturnValue('fallback 텍스트')
    const handler = new WorkspaceHookHandler({ workspaceService: svc, readTranscript })

    const route = handler.resolve(ws.runs[0].worktreePath)!
    handler.handle(
      makeEvent({ event: 'stop', raw: { transcript_path: '/x/sess1.jsonl' } }),
      route
    )

    expect(readTranscript).toHaveBeenCalledWith('/x/sess1.jsonl')
    const found = store.findRunById(ws.runs[0].runId)!
    expect(found.run.lastAssistantText).toBe('fallback 텍스트')
  })

  it('terminal 상태(adopted) run 에 늦은 stop → 변화 없음(push 0)', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const adoptedRun = makeRun({ status: 'adopted' })
    // adopted 는 activeRunId 대상이 아니므로 resolve 는 원래 null 이지만,
    // handle() 은 resolve 를 거치지 않고 route.id 로 직접 호출될 수 있어(레이스) 별도로 검증한다.
    store.saveWorkspace(makeWorkspace({ runs: [adoptedRun], activeRunId: null }))
    const svc = makeService(store)
    const saveSpy = vi.spyOn(store, 'saveWorkspace')
    const pushed = vi.fn()
    svc.addChangeListener(pushed)
    const handler = new WorkspaceHookHandler({ workspaceService: svc })

    handler.handle(
      makeEvent({ event: 'stop', raw: { transcript_path: '/x/late.jsonl', last_assistant_message: '늦은 응답' } }),
      { kind: WORKSPACE_HOOK_KIND, id: adoptedRun.runId }
    )

    expect(saveSpy).not.toHaveBeenCalled()
    expect(pushed).not.toHaveBeenCalled()
    const found = store.findRunById(adoptedRun.runId)!
    expect(found.run.status).toBe('adopted')
  })
})

describe('WorkspaceHookHandler.handle — post_tool_use', () => {
  it('awaiting-input → running + push 1회', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const run = makeRun({ status: 'awaiting-input' })
    store.saveWorkspace(makeWorkspace({ runs: [run], activeRunId: run.runId }))
    const svc = makeService(store)
    const pushed = vi.fn()
    svc.addChangeListener(pushed)
    const handler = new WorkspaceHookHandler({ workspaceService: svc })

    handler.handle(makeEvent({ event: 'post_tool_use' }), { kind: WORKSPACE_HOOK_KIND, id: run.runId })

    const found = store.findRunById(run.runId)!
    expect(found.run.status).toBe('running')
    expect(pushed).toHaveBeenCalledTimes(1)
  })

  it('running 상태에서는 store.set 0회, push 0회 (전이 없으면 쓰기 없음)', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const run = makeRun({ status: 'running' })
    store.saveWorkspace(makeWorkspace({ runs: [run], activeRunId: run.runId }))
    const svc = makeService(store)
    const saveSpy = vi.spyOn(store, 'saveWorkspace')
    const pushed = vi.fn()
    svc.addChangeListener(pushed)
    const handler = new WorkspaceHookHandler({ workspaceService: svc })

    handler.handle(makeEvent({ event: 'post_tool_use' }), { kind: WORKSPACE_HOOK_KIND, id: run.runId })

    expect(saveSpy).not.toHaveBeenCalled()
    expect(pushed).not.toHaveBeenCalled()
  })
})

describe('WorkspaceHookHandler.handle — 그 외 이벤트', () => {
  it('알 수 없는 이벤트는 무시(throw 없음)', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const run = makeRun()
    store.saveWorkspace(makeWorkspace({ runs: [run], activeRunId: run.runId }))
    const handler = new WorkspaceHookHandler({ workspaceService: makeService(store) })
    expect(() => handler.handle(makeEvent({ event: 'session_start' }), { kind: WORKSPACE_HOOK_KIND, id: run.runId })).not.toThrow()
  })
})
