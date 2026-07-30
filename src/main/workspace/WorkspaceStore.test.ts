import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkspaceStore, type WorkspaceStorage } from './WorkspaceStore'
import type { AgentRun, TaskWorkspace } from '../../shared/types/workspace'

/** 디스크 무접촉 in-memory storage — WorkspaceStorage 계약만 만족. */
class MemoryStorage implements WorkspaceStorage {
  private map = new Map<string, unknown>()

  get<T>(key: string, fallback: T): T {
    return this.map.has(key) ? (this.map.get(key) as T) : fallback
  }

  set(key: string, value: unknown): void {
    this.map.set(key, value)
  }
}

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    runId: 'run-1',
    workspaceId: 'proj-1:task-1',
    repoId: 'repo-1',
    branch: 'feature/x',
    baseBranch: 'main',
    worktreePath: '/repo/.x-worktrees/feature-x',
    status: 'running',
    prompt: '',
    autoApprove: false,
    terminalSessionId: 'term-1',
    startedAt: Date.now(),
    ...overrides
  }
}

function makeWorkspace(overrides: Partial<TaskWorkspace> = {}): TaskWorkspace {
  const run = makeRun()
  return {
    id: 'proj-1:task-1',
    projectId: 'proj-1',
    taskId: 'task-1',
    subject: '제목',
    repoId: 'repo-1',
    status: 'active',
    branch: run.branch,
    activeRunId: run.runId,
    runs: [run],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  }
}

describe('WorkspaceStore — 생성 시 디스크(실제 electron-store) 무접촉', () => {
  it('MemoryStorage 만으로 생성 가능', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    expect(store.listRepos()).toEqual([])
    expect(store.listWorkspaces()).toEqual([])
  })

  it('taskSessionLinks 기본값은 {}', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    expect(store.getState().taskSessionLinks).toEqual({})
  })

  it('legacyGitRepoPath 주입 시 첫 저장소로 승격', () => {
    const store = new WorkspaceStore(new MemoryStorage(), { legacyGitRepoPath: '/Users/nhn/repo' })
    expect(store.listRepos()).toHaveLength(1)
    expect(store.listRepos()[0].path).toBe('/Users/nhn/repo')
  })
})

describe('WorkspaceStore — repos CRUD', () => {
  let store: WorkspaceStore

  beforeEach(() => {
    store = new WorkspaceStore(new MemoryStorage())
  })

  it('addRepo 후 listRepos 에 반영', () => {
    store.addRepo({ id: 'r1', path: '/a', name: 'a' })
    expect(store.listRepos()).toHaveLength(1)
  })

  it('addRepo — 같은 id 재추가는 no-op', () => {
    store.addRepo({ id: 'r1', path: '/a', name: 'a' })
    store.addRepo({ id: 'r1', path: '/a', name: 'a' })
    expect(store.listRepos()).toHaveLength(1)
  })

  it('updateRepo — patch 반영', () => {
    store.addRepo({ id: 'r1', path: '/a', name: 'a' })
    const updated = store.updateRepo('r1', { name: 'renamed' })
    expect(updated?.name).toBe('renamed')
    expect(store.listRepos()[0].name).toBe('renamed')
  })

  it('updateRepo — 없는 id 는 null', () => {
    expect(store.updateRepo('nope', { name: 'x' })).toBeNull()
  })

  it('removeRepo', () => {
    store.addRepo({ id: 'r1', path: '/a', name: 'a' })
    store.removeRepo('r1')
    expect(store.listRepos()).toEqual([])
  })
})

describe('WorkspaceStore — settings / projectRepoMap', () => {
  it('getSettings 는 기본값을 반환', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    expect(store.getSettings().maxConcurrentRuns).toBe(4)
  })

  it('setSettings 는 부분 patch', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    store.setSettings({ maxConcurrentRuns: 8 })
    expect(store.getSettings().maxConcurrentRuns).toBe(8)
    expect(store.getSettings().transitionDoorayDefault).toBe(true)
  })

  it('setProjectRepo', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    store.setProjectRepo('proj-1', 'repo-1')
    expect(store.getState().projectRepoMap['proj-1']).toBe('repo-1')
  })
})

describe('WorkspaceStore — workspace / run 조회', () => {
  let store: WorkspaceStore

  beforeEach(() => {
    store = new WorkspaceStore(new MemoryStorage())
  })

  it('saveWorkspace 후 getWorkspace 로 조회', () => {
    const ws = makeWorkspace()
    store.saveWorkspace(ws)
    expect(store.getWorkspace(ws.id)?.id).toBe(ws.id)
  })

  it('getWorkspace — 없으면 null', () => {
    expect(store.getWorkspace('none:none')).toBeNull()
  })

  it('findRunById', () => {
    const ws = makeWorkspace()
    store.saveWorkspace(ws)
    const found = store.findRunById(ws.runs[0].runId)
    expect(found?.workspace.id).toBe(ws.id)
    expect(found?.run.runId).toBe(ws.runs[0].runId)
  })

  it('findRunById — 없으면 null', () => {
    expect(store.findRunById('nope')).toBeNull()
  })

  it('findWorkspaceByWorktree', () => {
    const ws = makeWorkspace()
    store.saveWorkspace(ws)
    expect(store.findWorkspaceByWorktree(ws.runs[0].worktreePath)?.id).toBe(ws.id)
  })

  it('saveWorkspace 는 updatedAt 을 갱신한다', () => {
    const ws = makeWorkspace({ updatedAt: 1 })
    const saved = store.saveWorkspace(ws)
    expect(saved.updatedAt).toBeGreaterThan(1)
  })
})

describe('WorkspaceStore — taskSessionLinks', () => {
  it('setTaskSessionLink 후 getTaskSessionLink 로 조회', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    store.setTaskSessionLink('proj-1:task-1', { cwd: '/wt', claudeSessionId: 'sid', lastUsedAt: 1 })
    expect(store.getTaskSessionLink('proj-1:task-1')?.claudeSessionId).toBe('sid')
  })

  it('없는 키는 null', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    expect(store.getTaskSessionLink('none:none')).toBeNull()
  })
})

describe('WorkspaceStore — activeRunId 불변식 교정 (ADR-03 (e))', () => {
  it('activeRunId 가 discarded run 을 가리키면 null 로 교정 + warn', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const discardedRun = makeRun({ runId: 'run-dead', status: 'discarded' })
    const ws = makeWorkspace({ activeRunId: 'run-dead', runs: [discardedRun] })
    const saved = store.saveWorkspace(ws)

    expect(saved.activeRunId).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WorkspaceStore] activeRunId 불일치')
    )
    warnSpy.mockRestore()
  })

  it('activeRunId 가 존재하지 않는 runId 를 가리켜도 null 로 교정', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const ws = makeWorkspace({ activeRunId: 'ghost-run' })
    const saved = store.saveWorkspace(ws)

    expect(saved.activeRunId).toBeNull()
    warnSpy.mockRestore()
  })

  it('activeRunId 가 live run 을 정확히 가리키면 그대로 유지', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const ws = makeWorkspace()
    const saved = store.saveWorkspace(ws)
    expect(saved.activeRunId).toBe(ws.activeRunId)
  })

  it('activeRunId 가 null 이면 검사하지 않는다', () => {
    const store = new WorkspaceStore(new MemoryStorage())
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ws = makeWorkspace({ activeRunId: null })
    store.saveWorkspace(ws)
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
