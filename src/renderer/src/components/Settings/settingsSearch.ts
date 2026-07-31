/**
 * 설정 검색 — 항목 카탈로그와 점수 매김.
 *
 * 설계는 Orca(https://github.com/stablyai/orca — orca@1.4.162-rc.0,
 * `src/renderer/src/components/settings/settings-search.ts`)를 참고했다.
 * Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: i18n 별칭·커맨드 팔레트 연동 제거, 4계층 점수만 남김.
 *
 * 왜 정적 카탈로그인가: 설정 행은 대부분 언마운트 상태(한 번에 한 섹션만 마운트)라 DOM 을
 * 훑어서 찾을 수 없다. 검색 대상은 코드가 아니라 데이터로 들고 있어야 누락이 안 생긴다.
 */

/** 검색 대상 한 항목. 섹션 하나가 여러 개를 가진다. */
export interface SettingsSearchEntry {
  title: string
  description?: string
  /** 제목·설명에 없지만 사람들이 칠 법한 말 (영문 원어, 동의어) */
  keywords?: string[]
}

export interface SettingsSearchTarget extends SettingsSearchEntry {
  /** 이 항목이 속한 섹션 id */
  sectionId: string
}

/** 타이핑 중 무거운 섹션을 계속 갈아끼우지 않도록 적용을 미룬다. */
export const SETTINGS_SEARCH_DEBOUNCE_MS = 150
/** 붙여넣기 사고 방어 — 이보다 긴 질의는 매칭하지 않는다. */
const MAX_QUERY_LENGTH = 200

type MatchKind = 'exact' | 'prefix' | 'substring'

/** 필드 계층 × 매칭 강도. 제목이 설명보다, 정확 일치가 부분 일치보다 앞선다. */
const FIELD_SCORE: Record<'title' | 'description' | 'keyword', Record<MatchKind, number>> = {
  title: { exact: 700, prefix: 650, substring: 600 },
  description: { exact: 500, prefix: 450, substring: 400 },
  keyword: { exact: 300, prefix: 250, substring: 200 }
}

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

function matchKind(haystack: string | undefined, needle: string): MatchKind | null {
  if (!haystack) return null
  const value = haystack.toLowerCase()
  if (value === needle) return 'exact'
  if (value.startsWith(needle)) return 'prefix'
  return value.includes(needle) ? 'substring' : null
}

/** 항목 하나의 점수. 0 이면 안 걸린 것. */
export function scoreSearchEntry(entry: SettingsSearchEntry, normalizedQuery: string): number {
  if (!normalizedQuery) return 0

  let best = 0
  const titleKind = matchKind(entry.title, normalizedQuery)
  if (titleKind) best = Math.max(best, FIELD_SCORE.title[titleKind])

  const descriptionKind = matchKind(entry.description, normalizedQuery)
  if (descriptionKind) best = Math.max(best, FIELD_SCORE.description[descriptionKind])

  for (const keyword of entry.keywords ?? []) {
    const kind = matchKind(keyword, normalizedQuery)
    if (kind) best = Math.max(best, FIELD_SCORE.keyword[kind])
  }
  return best
}

/** 검색어에 걸리는지만 — 행 단위 게이팅에 쓴다. 질의가 비면 항상 통과. */
export function matchesSettingsSearch(query: string, entry: SettingsSearchEntry): boolean {
  const normalized = normalizeQuery(query)
  if (!normalized || normalized.length > MAX_QUERY_LENGTH) return !normalized
  return scoreSearchEntry(entry, normalized) > 0
}

export interface SettingsSearchHit {
  sectionId: string
  title: string
  description?: string
  score: number
}

/**
 * 섹션별 최고 점수로 접어 정렬한다. 같은 점수면 카탈로그 순서를 지킨다 —
 * 정렬이 흔들리면 같은 검색어에도 결과 순서가 매번 달라 보인다.
 */
export function searchSettings(
  targets: readonly SettingsSearchTarget[],
  query: string
): SettingsSearchHit[] {
  const normalized = normalizeQuery(query)
  if (!normalized || normalized.length > MAX_QUERY_LENGTH) return []

  const scored = targets
    .map((target, index) => ({ target, index, score: scoreSearchEntry(target, normalized) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)

  const seen = new Set<string>()
  const hits: SettingsSearchHit[] = []
  for (const row of scored) {
    const key = `${row.target.sectionId}:${row.target.title}`
    if (seen.has(key)) continue
    seen.add(key)
    hits.push({
      sectionId: row.target.sectionId,
      title: row.target.title,
      description: row.target.description,
      score: row.score
    })
  }
  return hits
}

/** 검색 결과가 걸린 섹션 id 집합 — 좌측 네비를 좁히는 데 쓴다. */
export function matchedSectionIds(
  targets: readonly SettingsSearchTarget[],
  query: string
): Set<string> {
  return new Set(searchSettings(targets, query).map((hit) => hit.sectionId))
}
