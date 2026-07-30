import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  shouldPersistSnapshot,
  migrateLegacySessions,
  capWorkspaceBytes,
  SnapshotStore,
  type LegacyTerminalSession,
  type SnapshotStorage
} from './snapshotStore'
import type { TerminalWorkspaceSnapshotV2, TerminalTabSnapshot } from '../../shared/types/terminal'

function makeTab(tabId: string, serialized = 'x'): TerminalTabSnapshot {
  const leafId = `${tabId}-leaf`
  return {
    tabId,
    name: tabId,
    tree: { type: 'leaf', leafId },
    focusedLeafId: leafId,
    panes: { [leafId]: { cwd: '/tmp', cols: 80, rows: 24, serialized } }
  }
}

function makeSnapshot(tabs: TerminalTabSnapshot[], activeTabId: string | null = tabs[0]?.tabId ?? null): TerminalWorkspaceSnapshotV2 {
  return { version: 2, savedAt: Date.now(), activeTabId, tabs }
}

function makeStorage(initial: Record<string, unknown> = {}): SnapshotStorage {
  const data: Record<string, unknown> = { ...initial }
  return {
    get: <T>(key: string, def: T): T => (key in data ? (data[key] as T) : def),
    set: (key: string, value: unknown): void => {
      data[key] = value
    }
  }
}

describe('shouldPersistSnapshot', () => {
  it('renderer + 빈 incoming + existing 있음 → true (사용자가 진짜 다 닫은 것)', () => {
    const existing = makeSnapshot([makeTab('a')])
    expect(shouldPersistSnapshot(makeSnapshot([]), existing, 'renderer')).toBe(true)
  })

  it('renderer + null incoming + existing null → true', () => {
    expect(shouldPersistSnapshot(null, null, 'renderer')).toBe(true)
  })

  it('renderer + 비빈 incoming + existing null → true', () => {
    expect(shouldPersistSnapshot(makeSnapshot([makeTab('a')]), null, 'renderer')).toBe(true)
  })

  it('cache + 빈 incoming + existing 있음 → false + warn (덮어쓰기 차단)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const existing = makeSnapshot([makeTab('a')])
    expect(shouldPersistSnapshot(makeSnapshot([]), existing, 'cache')).toBe(false)
    expect(shouldPersistSnapshot(null, existing, 'cache')).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('cache + 비빈 incoming + existing 있음 → true', () => {
    const existing = makeSnapshot([makeTab('a')])
    expect(shouldPersistSnapshot(makeSnapshot([makeTab('b')]), existing, 'cache')).toBe(true)
  })

  it('cache + null incoming + existing null → true (지울 게 없음)', () => {
    expect(shouldPersistSnapshot(null, null, 'cache')).toBe(true)
  })
})

describe('migrateLegacySessions', () => {
  it('0건 → 빈 탭 목록, activeTabId null', () => {
    const result = migrateLegacySessions([])
    expect(result).toEqual({ version: 2, savedAt: expect.any(Number), activeTabId: null, tabs: [] })
  })

  it('1건 → 탭 1개, 단일 leaf, cols/rows 0', () => {
    const legacy: LegacyTerminalSession[] = [{ meta: { id: 's1', name: 'My Tab', cwd: '/tmp/x' }, output: 'hello' }]
    const result = migrateLegacySessions(legacy)
    expect(result.tabs).toHaveLength(1)
    const tab = result.tabs[0]
    expect(tab.name).toBe('My Tab')
    expect(tab.tree).toEqual({ type: 'leaf', leafId: tab.focusedLeafId })
    const pane = tab.panes[tab.focusedLeafId]
    expect(pane.cols).toBe(0)
    expect(pane.rows).toBe(0)
    expect(pane.cwd).toBe('/tmp/x')
    expect(pane.serialized).toBe('hello')
    expect(result.activeTabId).toBe(tab.tabId)
  })

  it('N건 → 탭 N개', () => {
    const legacy: LegacyTerminalSession[] = [
      { meta: { id: 's1', name: 'A', cwd: '/a' }, output: '' },
      { meta: { id: 's2', name: 'B', cwd: '/b' }, output: '' },
      { meta: { id: 's3', name: 'C', cwd: '/c' }, output: '' }
    ]
    const result = migrateLegacySessions(legacy)
    expect(result.tabs.map((t) => t.name)).toEqual(['A', 'B', 'C'])
  })

  it('깨진 meta 도 throw 없이 기본값으로 처리', () => {
    const legacy = [{ meta: {}, output: undefined }] as unknown as LegacyTerminalSession[]
    expect(() => migrateLegacySessions(legacy)).not.toThrow()
    const result = migrateLegacySessions(legacy)
    expect(result.tabs[0].name).toBe('Terminal')
  })
})

describe('capWorkspaceBytes', () => {
  it('캡 이내면 변형 없이 반환', () => {
    const snap = makeSnapshot([makeTab('a', 'short')])
    const result = capWorkspaceBytes(snap, { perLeafBytes: 1024, totalBytes: 1024 * 1024 })
    expect(result).toEqual(snap)
  })

  it('leaf 하나가 perLeafBytes 초과 → 해당 leaf 만 trim', () => {
    const snap = makeSnapshot([makeTab('a', 'x'.repeat(2000))])
    const result = capWorkspaceBytes(snap, { perLeafBytes: 500, totalBytes: 1024 * 1024 })
    const pane = result.tabs[0].panes['a-leaf']
    expect(pane.serialized.length).toBeLessThanOrEqual(500)
  })

  it('leaf trim 후에도 totalBytes 초과 → 활성 탭 제외 오래된 탭부터 드롭 + warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const tabs = [makeTab('old', 'x'.repeat(400)), makeTab('mid', 'x'.repeat(400)), makeTab('active', 'x'.repeat(400))]
    const snap = makeSnapshot(tabs, 'active')
    const result = capWorkspaceBytes(snap, { perLeafBytes: 10_000, totalBytes: 700 })

    const remainingIds = result.tabs.map((t) => t.tabId)
    expect(remainingIds).toContain('active')
    expect(remainingIds).not.toContain('old')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('SnapshotStore', () => {
  let storage: SnapshotStorage

  beforeEach(() => {
    storage = makeStorage()
  })

  it('saveSnapshot(renderer) — 저장 + { ok:true, bytes>0 } 반환 + 캐시 갱신', () => {
    const store = new SnapshotStore(storage)
    const snap = makeSnapshot([makeTab('a')])
    const result = store.saveSnapshot(snap, 'renderer')
    expect(result.ok).toBe(true)
    expect(result.bytes).toBeGreaterThan(0)
    expect(store.getCachedSnapshot()?.tabs[0].tabId).toBe('a')
    expect(storage.get('terminalWorkspaceV2', null)).not.toBeNull()
  })

  it('saveSnapshot(cache) — 빈 스냅샷이 기존 저장분을 덮어쓰지 않는다', () => {
    const storageWithExisting = makeStorage({ terminalWorkspaceV2: makeSnapshot([makeTab('existing')]) })
    const store = new SnapshotStore(storageWithExisting)
    // 아직 saveSnapshot 이 한 번도 호출되지 않아 메모리 캐시가 비어있는 상태 — storage 를 직접 봐야 한다.
    const result = store.saveSnapshot(makeSnapshot([]), 'cache')
    expect(result).toEqual({ ok: false, bytes: 0, skipped: true })
    const persisted = storageWithExisting.get<TerminalWorkspaceSnapshotV2 | null>('terminalWorkspaceV2', null)
    expect(persisted?.tabs).toHaveLength(1)
  })

  it('loadSnapshot — v2 없고 legacy 있으면 1회 마이그레이션 후 저장', () => {
    const legacy: LegacyTerminalSession[] = [{ meta: { id: 's1', name: 'A', cwd: '/a' }, output: 'out' }]
    const storageWithLegacy = makeStorage({ terminalSessions: legacy })
    const store = new SnapshotStore(storageWithLegacy)

    const first = store.loadSnapshot()
    expect(first?.tabs).toHaveLength(1)
    expect(storageWithLegacy.get('terminalWorkspaceV2', null)).not.toBeNull()

    // 마이그레이션은 1회만 — 두 번째 호출에서 legacy 를 다시 변환하지 않음(v2 가 이미 있으므로 그대로 반환).
    const second = store.loadSnapshot()
    expect(second).toEqual(first)
  })

  it('loadSnapshot — v2/legacy 둘 다 없으면 null, store 에 아무 것도 안 씀', () => {
    const store = new SnapshotStore(storage)
    expect(store.loadSnapshot()).toBeNull()
    expect(storage.get('terminalWorkspaceV2', 'untouched')).toBe('untouched')
  })

  it('getCachedSnapshot — saveSnapshot 이전에는 null', () => {
    const store = new SnapshotStore(storage)
    expect(store.getCachedSnapshot()).toBeNull()
  })
})
