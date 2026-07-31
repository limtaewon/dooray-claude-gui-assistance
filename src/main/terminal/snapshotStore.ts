import { randomUUID } from 'crypto'
import type {
  SplitLeaf,
  TerminalPaneSnapshot,
  TerminalSaveStateResult,
  TerminalTabSnapshot,
  TerminalWorkspaceSnapshotV2
} from '../../shared/types/terminal'
import { utf8ByteLength, trimSerializedToBytes } from '../../shared/utils/textBytes'
import { sanitizeForRestore } from './sanitizeForRestore'

/** electron-store 를 대체 가능한 최소 인터페이스 — 테스트 주입용 (WikiStorageService 선례). */
export interface SnapshotStorage {
  get<T>(key: string, defaultValue: T): T
  set(key: string, value: unknown): void
}

/** 레거시 `terminalSessions` 항목 1개(세션 메타 + raw 출력). */
export interface LegacyTerminalSession {
  meta: { id: string; name: string; cwd: string }
  output: string
}

const STORE_KEY = 'terminalWorkspaceV2'
const LEGACY_STORE_KEY = 'terminalSessions'

export interface CapOptions {
  perLeafBytes: number
  totalBytes: number
}

const DEFAULT_CAP: CapOptions = { perLeafBytes: 512 * 1024, totalBytes: 8 * 1024 * 1024 }

/**
 * 빈 스냅샷이 기존 저장분을 지우는 것을 막는다. 렌더러가 보낸 값은 사용자의 진짜 상태이므로 항상 허용한다
 * (ADR-v2-terminal-p2-03 §5).
 */
export function shouldPersistSnapshot(
  incoming: TerminalWorkspaceSnapshotV2 | null,
  existing: TerminalWorkspaceSnapshotV2 | null,
  source: 'renderer' | 'cache'
): boolean {
  if (source === 'renderer') return true

  const incomingEmpty = !incoming || incoming.tabs.length === 0
  const existingHasTabs = !!existing && existing.tabs.length > 0
  if (incomingEmpty && existingHasTabs) {
    console.warn('[snapshotStore] cache 경로 — 빈 스냅샷이 기존 저장분을 덮어쓰려 해 차단', {
      existingTabs: existing!.tabs.length
    })
    return false
  }
  return true
}

/**
 * 레거시 `terminalSessions`(세션 배열)을 v2 스냅샷으로 변환한다 — 세션 1개당 탭 1개(단일 leaf).
 * cols/rows 는 알 수 없으므로 0 으로 둔다(복원 시 resize 스킵의 신호, ADR-v2-terminal-p2-03 §10).
 */
export function migrateLegacySessions(legacy: LegacyTerminalSession[]): TerminalWorkspaceSnapshotV2 {
  const tabs: TerminalTabSnapshot[] = legacy.map((session) => {
    const leafId = randomUUID()
    const leaf: SplitLeaf = { type: 'leaf', leafId }
    const pane: TerminalPaneSnapshot = {
      cwd: session.meta?.cwd,
      cols: 0,
      rows: 0,
      serialized: sanitizeForRestore(session.output ?? '')
    }
    return {
      tabId: randomUUID(),
      name: session.meta?.name || 'Terminal',
      tree: leaf,
      focusedLeafId: leafId,
      panes: { [leafId]: pane }
    }
  })

  return {
    version: 2,
    savedAt: Date.now(),
    activeTabId: tabs[0]?.tabId ?? null,
    tabs
  }
}

/** 스냅샷의 leaf 별 직렬화 문자열 바이트 합. */
function tabBytes(tab: TerminalTabSnapshot): number {
  return Object.values(tab.panes).reduce((sum, pane) => sum + utf8ByteLength(pane.serialized), 0)
}

/**
 * 워크스페이스 스냅샷 총 용량을 캡 안으로 눌러 담는다.
 * 1) leaf 별로 `perLeafBytes` 초과 시 head trim(오래된 출력부터).
 * 2) 그래도 `totalBytes` 초과면 활성 탭을 제외하고 오래된 탭부터 드롭 + warn (ADR-v2-terminal-p2-03 §9).
 */
export function capWorkspaceBytes(
  snapshot: TerminalWorkspaceSnapshotV2,
  opts: CapOptions = DEFAULT_CAP
): TerminalWorkspaceSnapshotV2 {
  const trimmedTabs = snapshot.tabs.map((tab) => {
    const panes: Record<string, TerminalPaneSnapshot> = {}
    for (const [leafId, pane] of Object.entries(tab.panes)) {
      panes[leafId] =
        utf8ByteLength(pane.serialized) > opts.perLeafBytes
          ? { ...pane, serialized: trimSerializedToBytes(pane.serialized, opts.perLeafBytes) }
          : pane
    }
    return { ...tab, panes }
  })

  let total = trimmedTabs.reduce((sum, tab) => sum + tabBytes(tab), 0)
  if (total <= opts.totalBytes) {
    return { ...snapshot, tabs: trimmedTabs }
  }

  const keep = new Set(trimmedTabs.map((t) => t.tabId))
  let droppedCount = 0
  for (const tab of trimmedTabs) {
    if (total <= opts.totalBytes) break
    if (tab.tabId === snapshot.activeTabId) continue // 활성 탭은 항상 남긴다
    keep.delete(tab.tabId)
    total -= tabBytes(tab)
    droppedCount++
  }

  if (droppedCount > 0) {
    console.warn('[snapshotStore] 워크스페이스 용량 초과 — 오래된 탭 제외', { droppedCount, totalBytes: total })
  }

  return { ...snapshot, tabs: trimmedTabs.filter((t) => keep.has(t.tabId)) }
}

/**
 * 터미널 워크스페이스 스냅샷의 저장소. `SnapshotStorage` 를 주입받아 테스트 가능하게 한다.
 * 마지막으로 성공 저장된 스냅샷을 메모리에 캐시해 before-quit 캐시 폴백(quitFlush)이 재사용한다.
 */
export class SnapshotStore {
  private cache: TerminalWorkspaceSnapshotV2 | null = null
  private legacyMigrated = false

  constructor(private storage: SnapshotStorage) {}

  /** 저장된 스냅샷을 반환한다. v2 가 없고 레거시가 있으면 최초 1회 마이그레이션 후 저장까지 수행한다. */
  loadSnapshot(): TerminalWorkspaceSnapshotV2 | null {
    let snap = this.storage.get<TerminalWorkspaceSnapshotV2 | null>(STORE_KEY, null)
    if (!snap && !this.legacyMigrated) {
      this.legacyMigrated = true
      const legacy = this.storage.get<LegacyTerminalSession[]>(LEGACY_STORE_KEY, [])
      if (legacy.length > 0) {
        snap = migrateLegacySessions(legacy)
        this.storage.set(STORE_KEY, snap)
      }
    }
    this.cache = snap
    return snap
  }

  /** 스냅샷을 저장한다 — 캡 적용 후 shouldPersistSnapshot 게이트를 통과해야 실제로 쓴다. 메모리 캐시도 갱신. */
  saveSnapshot(incoming: TerminalWorkspaceSnapshotV2 | null, source: 'renderer' | 'cache'): TerminalSaveStateResult {
    const capped = incoming ? capWorkspaceBytes(incoming, DEFAULT_CAP) : incoming
    const existing = this.cache ?? this.storage.get<TerminalWorkspaceSnapshotV2 | null>(STORE_KEY, null)

    if (!shouldPersistSnapshot(capped, existing, source)) {
      return { ok: false, bytes: 0, skipped: true }
    }

    this.storage.set(STORE_KEY, capped)
    this.cache = capped
    return { ok: true, bytes: capped ? utf8ByteLength(JSON.stringify(capped)) : 0 }
  }

  /** before-quit 캐시 폴백용 — 마지막으로 성공 저장된 스냅샷(메모리, disk I/O 없음). */
  getCachedSnapshot(): TerminalWorkspaceSnapshotV2 | null {
    return this.cache
  }
}
