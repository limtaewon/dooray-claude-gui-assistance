import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TaskDropService } from './TaskDropService'
import { WorkspaceStore, type WorkspaceStorage } from './WorkspaceStore'

/** 디스크 무접촉 in-memory storage — WorkspaceStore.test.ts 와 동일 패턴 */
class MemoryStorage implements WorkspaceStorage {
  private map = new Map<string, unknown>()
  get<T>(key: string, fallback: T): T {
    return this.map.has(key) ? (this.map.get(key) as T) : fallback
  }
  set(key: string, value: unknown): void {
    this.map.set(key, value)
  }
}

const REPO_A = { id: 'a', path: '/work/ios', name: 'ios-dooray' }
const REPO_B = { id: 'b', path: '/work/kmp', name: 'mobile-kmp' }

describe('TaskDropService', () => {
  let store: WorkspaceStore

  beforeEach(() => {
    store = new WorkspaceStore(new MemoryStorage())
    store.addRepo(REPO_A)
    store.addRepo(REPO_B)
  })

  const make = (opts: {
    sessions?: { sessionId: string; lastActivityAt: string }[]
    exists?: (p: string) => boolean
  } = {}): TaskDropService =>
    new TaskDropService({
      store,
      listSessions: vi.fn().mockResolvedValue(opts.sessions ?? []),
      pathExists: opts.exists ?? (() => true)
    })

  describe('resolve', () => {
    it('매핑이 없으면 첫 저장소를 돌려준다', async () => {
      const target = await make().resolve('proj-1', 'task-1')
      expect(target).toEqual({ cwd: '/work/ios', repoName: 'ios-dooray' })
    })

    it('프로젝트에 매핑된 저장소를 우선한다', async () => {
      store.setProjectRepo('proj-1', 'b')
      const target = await make().resolve('proj-1', 'task-1')
      expect(target?.cwd).toBe('/work/kmp')
    })

    it('세션 링크가 있으면 그 폴더와 세션 id 를 돌려준다', async () => {
      store.setTaskSessionLink('proj-1:task-1', {
        cwd: '/work/kmp',
        claudeSessionId: 'sess-9',
        lastUsedAt: Date.now()
      })
      const target = await make().resolve('proj-1', 'task-1')
      expect(target).toEqual({ cwd: '/work/kmp', repoName: 'mobile-kmp', claudeSessionId: 'sess-9' })
    })

    it('링크된 폴더가 사라졌으면 저장소로 폴백한다', async () => {
      store.setTaskSessionLink('proj-1:task-1', { cwd: '/gone', claudeSessionId: 'sess-9', lastUsedAt: 0 })
      const target = await make({ exists: () => false }).resolve('proj-1', 'task-1')
      expect(target).toEqual({ cwd: '/work/ios', repoName: 'ios-dooray' })
    })

    it('등록된 저장소가 없으면 null', async () => {
      store.removeRepo('a')
      store.removeRepo('b')
      expect(await make().resolve('proj-1', 'task-1')).toBeNull()
    })
  })

  describe('link', () => {
    const since = Date.parse('2026-07-30T10:00:00Z')

    it('since 이후 활동한 세션 중 최신을 연결한다', async () => {
      const svc = make({
        sessions: [
          { sessionId: 'old', lastActivityAt: '2026-07-30T09:00:00Z' },
          { sessionId: 'new', lastActivityAt: '2026-07-30T10:00:30Z' },
          { sessionId: 'newest', lastActivityAt: '2026-07-30T10:01:00Z' }
        ]
      })
      expect(await svc.link('proj-1', 'task-1', '/work/ios', since)).toBe('newest')
      expect(store.getTaskSessionLink('proj-1:task-1')).toMatchObject({
        cwd: '/work/ios',
        claudeSessionId: 'newest'
      })
    })

    it('since 이전 세션만 있으면 연결하지 않는다 — 이미 열려 있던 세션을 잘못 붙잡지 않기 위함', async () => {
      const svc = make({ sessions: [{ sessionId: 'old', lastActivityAt: '2026-07-30T09:00:00Z' }] })
      expect(await svc.link('proj-1', 'task-1', '/work/ios', since)).toBeNull()
      expect(store.getTaskSessionLink('proj-1:task-1')).toBeNull()
    })

    it('세션이 없으면 null', async () => {
      expect(await make().link('proj-1', 'task-1', '/work/ios', since)).toBeNull()
    })

    it('깨진 타임스탬프는 후보에서 제외한다', async () => {
      const svc = make({ sessions: [{ sessionId: 'bad', lastActivityAt: 'not-a-date' }] })
      expect(await svc.link('proj-1', 'task-1', '/work/ios', since)).toBeNull()
    })
  })

  it('unlink 하면 매핑이 사라지고 linkedKeys 에서도 빠진다', async () => {
    const svc = make()
    store.setTaskSessionLink('proj-1:task-1', { cwd: '/work/ios', claudeSessionId: 's', lastUsedAt: 0 })
    expect(svc.linkedKeys()).toEqual(['proj-1:task-1'])

    svc.unlink('proj-1', 'task-1')

    expect(store.getTaskSessionLink('proj-1:task-1')).toBeNull()
    expect(svc.linkedKeys()).toEqual([])
  })
})
