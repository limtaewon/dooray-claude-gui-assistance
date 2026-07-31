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
      store.upsertTaskSessionLink('proj-1:task-1', {
        cwd: '/work/kmp',
        claudeSessionId: 'sess-9',
        lastUsedAt: Date.now()
      })
      const target = await make().resolve('proj-1', 'task-1')
      expect(target).toEqual({ cwd: '/work/kmp', repoName: 'mobile-kmp', claudeSessionId: 'sess-9' })
    })

    it('링크가 여러 폴더에 있으면 가장 최근에 쓴 것을 연다', async () => {
      store.upsertTaskSessionLink('proj-1:task-1', { cwd: '/work/ios', claudeSessionId: 'ios', lastUsedAt: 100 })
      store.upsertTaskSessionLink('proj-1:task-1', { cwd: '/work/kmp', claudeSessionId: 'kmp', lastUsedAt: 200 })
      expect((await make().resolve('proj-1', 'task-1'))?.claudeSessionId).toBe('kmp')
    })

    it('드롭한 pane 이 이미 있는 폴더의 세션을 우선한다 — 같은 자리에서 이어가는 게 자연스럽다', async () => {
      store.upsertTaskSessionLink('proj-1:task-1', { cwd: '/work/ios', claudeSessionId: 'ios', lastUsedAt: 100 })
      store.upsertTaskSessionLink('proj-1:task-1', { cwd: '/work/kmp', claudeSessionId: 'kmp', lastUsedAt: 200 })
      const target = await make().resolve('proj-1', 'task-1', '/work/ios')
      expect(target?.claudeSessionId).toBe('ios')
    })

    it('preferCwd 에 링크가 없으면 최근 링크로 떨어진다', async () => {
      store.upsertTaskSessionLink('proj-1:task-1', { cwd: '/work/kmp', claudeSessionId: 'kmp', lastUsedAt: 200 })
      const target = await make().resolve('proj-1', 'task-1', '/somewhere-else')
      expect(target?.claudeSessionId).toBe('kmp')
    })

    it('링크된 폴더가 사라졌으면 저장소로 폴백한다', async () => {
      store.upsertTaskSessionLink('proj-1:task-1', { cwd: '/gone', claudeSessionId: 'sess-9', lastUsedAt: 0 })
      const target = await make({ exists: () => false }).resolve('proj-1', 'task-1')
      expect(target).toEqual({ cwd: '/work/ios', repoName: 'ios-dooray' })
    })

    it('등록된 저장소가 없으면 지금 터미널이 있는 폴더에서 시작한다', async () => {
      store.removeRepo('a')
      store.removeRepo('b')
      // 저장소 사전 등록을 요구하면 드래그&드롭이 통째로 동작하지 않는다.
      // 이미 프로젝트 폴더에 있는 터미널에 놓았다면 "여기서 시작" 이 자연스러운 해석이다.
      expect(await make().resolve('proj-1', 'task-1', '/Users/me/Desktop/2NEON')).toEqual({
        cwd: '/Users/me/Desktop/2NEON',
        repoName: '2NEON'
      })
    })

    it('저장소도 없고 터미널 폴더도 모르면 null', async () => {
      store.removeRepo('a')
      store.removeRepo('b')
      expect(await make().resolve('proj-1', 'task-1')).toBeNull()
    })

    it('없는 폴더는 폴백 대상이 아니다', async () => {
      store.removeRepo('a')
      store.removeRepo('b')
      expect(await make({ exists: () => false }).resolve('proj-1', 'task-1', '/gone')).toBeNull()
    })

    it('등록된 저장소가 있으면 그쪽이 우선이다 — 명시적 설정이 폴백보다 강하다', async () => {
      const target = await make().resolve('proj-1', 'task-1', '/somewhere/else')
      expect(target?.cwd).toBe('/work/ios')
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
      expect(store.listTaskSessionLinks('proj-1:task-1')).toMatchObject([
        { cwd: '/work/ios', claudeSessionId: 'newest', repoName: 'ios-dooray' }
      ])
    })

    it('다른 폴더에 연결하면 기존 링크를 지우지 않고 나란히 둔다 — 한 업무가 여러 저장소에 걸친다', async () => {
      const svc = make({ sessions: [{ sessionId: 'kmp-sess', lastActivityAt: '2026-07-30T10:01:00Z' }] })
      store.upsertTaskSessionLink('proj-1:task-1', { cwd: '/work/ios', claudeSessionId: 'ios-sess', lastUsedAt: 1 })

      await svc.link('proj-1', 'task-1', '/work/kmp', since)

      expect(store.listTaskSessionLinks('proj-1:task-1').map((l) => l.cwd).sort()).toEqual([
        '/work/ios',
        '/work/kmp'
      ])
    })

    it('같은 폴더에 다시 연결하면 덮어쓴다', async () => {
      const svc = make({ sessions: [{ sessionId: 'newer', lastActivityAt: '2026-07-30T10:01:00Z' }] })
      store.upsertTaskSessionLink('proj-1:task-1', { cwd: '/work/ios', claudeSessionId: 'older', lastUsedAt: 1 })

      await svc.link('proj-1', 'task-1', '/work/ios', since)

      expect(store.listTaskSessionLinks('proj-1:task-1')).toHaveLength(1)
      expect(store.listTaskSessionLinks('proj-1:task-1')[0].claudeSessionId).toBe('newer')
    })

    it('since 이전 세션만 있으면 연결하지 않는다 — 이미 열려 있던 세션을 잘못 붙잡지 않기 위함', async () => {
      const svc = make({ sessions: [{ sessionId: 'old', lastActivityAt: '2026-07-30T09:00:00Z' }] })
      expect(await svc.link('proj-1', 'task-1', '/work/ios', since)).toBeNull()
      expect(store.listTaskSessionLinks('proj-1:task-1')).toEqual([])
    })

    it('세션이 없으면 null', async () => {
      expect(await make().link('proj-1', 'task-1', '/work/ios', since)).toBeNull()
    })

    it('깨진 타임스탬프는 후보에서 제외한다', async () => {
      const svc = make({ sessions: [{ sessionId: 'bad', lastActivityAt: 'not-a-date' }] })
      expect(await svc.link('proj-1', 'task-1', '/work/ios', since)).toBeNull()
    })
  })

  describe('unlink / listLinks / linkedMap', () => {
    beforeEach(() => {
      store.upsertTaskSessionLink('proj-1:task-1', { cwd: '/work/ios', claudeSessionId: 'ios', lastUsedAt: 100 })
      store.upsertTaskSessionLink('proj-1:task-1', { cwd: '/work/kmp', claudeSessionId: 'kmp', lastUsedAt: 200 })
    })

    it('cwd 를 주면 그 폴더 링크만 지운다', () => {
      const svc = make()
      svc.unlink('proj-1', 'task-1', '/work/ios')
      expect(svc.listLinks('proj-1', 'task-1').map((l) => l.cwd)).toEqual(['/work/kmp'])
    })

    it('cwd 없이 부르면 이 업무의 링크를 전부 지운다', () => {
      const svc = make()
      svc.unlink('proj-1', 'task-1')
      expect(svc.listLinks('proj-1', 'task-1')).toEqual([])
      expect(svc.linkedMap()['proj-1:task-1']).toBeUndefined()
    })

    it('링크 목록은 최근 사용순이다', () => {
      expect(make().listLinks('proj-1', 'task-1').map((l) => l.claudeSessionId)).toEqual(['kmp', 'ios'])
    })

    it('linkedMap 은 현재 저장소 이름을 붙여 준다 — 카드 배지에 그대로 쓴다', () => {
      const map = make().linkedMap()
      expect(map['proj-1:task-1'].map((l) => l.repoName)).toEqual(['mobile-kmp', 'ios-dooray'])
    })

    it('touch 는 최근 사용 시각만 올려 정렬을 실제 사용과 맞춘다', () => {
      const svc = make()
      svc.touch('proj-1', 'task-1', '/work/ios')
      expect(svc.listLinks('proj-1', 'task-1')[0].cwd).toBe('/work/ios')
    })

    it('없는 폴더를 touch 해도 아무 일도 없다', () => {
      const svc = make()
      svc.touch('proj-1', 'task-1', '/nope')
      expect(svc.listLinks('proj-1', 'task-1')).toHaveLength(2)
    })
  })
  describe('link — 이름 붙이기', () => {
    it('호출부가 준 라벨을 쓴다 — 워크트리 경로는 등록된 저장소와 절대 같지 않다', async () => {
      const svc = make({
        sessions: [{ sessionId: 's1', lastActivityAt: new Date(2000).toISOString() }]
      })

      await svc.link('p1', 't1', '/Users/me/Desktop/.2NEON-worktrees/feature-neon-6793', 1000, '2NEON · feature/neon-6793')

      expect(svc.listLinks('p1', 't1')[0].repoName).toBe('2NEON · feature/neon-6793')
    })

    it('라벨이 없으면 폴더 이름으로 떨어진다 — 배지가 비어 보이면 안 된다', async () => {
      const svc = make({
        sessions: [{ sessionId: 's1', lastActivityAt: new Date(2000).toISOString() }]
      })

      await svc.link('p1', 't1', '/Users/me/Desktop/.2NEON-worktrees/feature-neon-6793', 1000)

      expect(svc.listLinks('p1', 't1')[0].repoName).toBe('feature-neon-6793')
    })
  })
})

