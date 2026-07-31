import type { GitWorktreeUsage } from '../types/git'
import type { TaskSessionLink } from '../types/workspace'

/** 정리 화면의 한 줄 — 실측 정보에 "언제 마지막으로 썼는지" 를 얹은 것. */
export interface WorktreeCleanupRow extends GitWorktreeUsage {
  /** 이 폴더에서 업무 세션을 마지막으로 쓴 시각. 기록이 없으면 폴더 수정 시각 */
  lastUsedAt: number | null
  /** 그 시각이 세션 기록에서 온 것인지 (폴더 수정 시각 추정이 아닌지) */
  lastUsedFromSession: boolean
}

function normalize(path: string): string {
  return path.replace(/[/\\]+$/, '')
}

/**
 * 워크트리 실측 정보와 업무 세션 링크를 합쳐 정리 목록을 만든다.
 *
 * 본 저장소는 정리 대상이 아니라 제외한다 — 지울 수 없고, 실수로 고르게 두면 안 된다.
 * 정렬은 **오래 안 쓴 것부터** — 정리 화면에서 먼저 보여야 할 것이 그것이다.
 */
export function buildCleanupRows(
  usages: GitWorktreeUsage[],
  links: TaskSessionLink[]
): WorktreeCleanupRow[] {
  const lastUsedByPath = new Map<string, number>()
  for (const link of links) {
    const key = normalize(link.cwd)
    const prev = lastUsedByPath.get(key)
    if (prev === undefined || link.lastUsedAt > prev) lastUsedByPath.set(key, link.lastUsedAt)
  }

  return usages
    .filter((usage) => !usage.isMain)
    .map((usage) => {
      const fromSession = lastUsedByPath.get(normalize(usage.path))
      return {
        ...usage,
        lastUsedAt: fromSession ?? usage.mtimeMs,
        lastUsedFromSession: fromSession !== undefined
      }
    })
    .sort((a, b) => (a.lastUsedAt ?? 0) - (b.lastUsedAt ?? 0))
}

/** 고른 항목들의 합계 — 지우면 무엇을 잃는지 한 줄로 말하기 위한 값. */
export function summarizeSelection(
  rows: WorktreeCleanupRow[],
  selected: Set<string>
): { count: number; sizeBytes: number; dirtyCount: number; unknownSize: boolean } {
  const picked = rows.filter((row) => selected.has(row.path))
  return {
    count: picked.length,
    sizeBytes: picked.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0),
    dirtyCount: picked.filter((row) => row.dirtyFiles > 0).length,
    unknownSize: picked.some((row) => row.sizeBytes === null)
  }
}

/** 사람이 읽는 용량. 측정 못 한 경우는 `—`. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/** 상대 시각. 기준 시각을 인자로 받아 테스트가 시계에 기대지 않게 한다. */
export function formatLastUsed(at: number | null, now: number): string {
  if (at === null) return '알 수 없음'
  const days = Math.floor((now - at) / 86_400_000)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 30) return `${days}일 전`
  const months = Math.floor(days / 30)
  return months < 12 ? `${months}개월 전` : `${Math.floor(months / 12)}년 전`
}
