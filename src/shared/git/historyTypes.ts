/**
 * 커밋 히스토리 / 그래프 도메인 타입.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/shared/git-history-types.ts`. Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: 소스트리급 요구에 맞춰 `allBranches`(전 브랜치 조회) 와 `cursor`(Load more) 를 추가.
 */

export type GitHistoryGraphColorId =
  | 'git-graph-ref'
  | 'git-graph-remote-ref'
  | 'git-graph-base-ref'
  | 'git-graph-lane-1'
  | 'git-graph-lane-2'
  | 'git-graph-lane-3'
  | 'git-graph-lane-4'
  | 'git-graph-lane-5'

export const GIT_HISTORY_REF_COLOR: GitHistoryGraphColorId = 'git-graph-ref'
export const GIT_HISTORY_REMOTE_REF_COLOR: GitHistoryGraphColorId = 'git-graph-remote-ref'
export const GIT_HISTORY_BASE_REF_COLOR: GitHistoryGraphColorId = 'git-graph-base-ref'

export const GIT_HISTORY_LANE_COLORS: readonly GitHistoryGraphColorId[] = [
  'git-graph-lane-1',
  'git-graph-lane-2',
  'git-graph-lane-3',
  'git-graph-lane-4',
  'git-graph-lane-5'
]

export const GIT_HISTORY_DEFAULT_LIMIT = 50
export const GIT_HISTORY_MAX_LIMIT = 200

export type GitHistoryRefCategory = 'branches' | 'remote branches' | 'tags' | 'commits'

export interface GitHistoryItemRef {
  id: string
  name: string
  revision?: string
  category?: GitHistoryRefCategory
  color?: GitHistoryGraphColorId
}

export interface GitHistoryItem {
  id: string
  parentIds: string[]
  subject: string
  message: string
  displayId?: string
  author?: string
  authorEmail?: string
  /** epoch millis */
  timestamp?: number
  references?: GitHistoryItemRef[]
}

export interface GitHistoryOptions {
  limit?: number
  /** 비교 기준 ref — 그래프에서 전용 색을 받는다 */
  baseRef?: string | null
  /** 현재 브랜치만이 아니라 모든 브랜치를 대상으로 로그를 뽑는다 */
  allBranches?: boolean
  /** Load more — 앞의 이 개수만큼 건너뛴다. 커서(oid)가 아니라 offset 이어야 전 브랜치 토폴로지가 페이지 간에 일관된다. */
  skip?: number
  /** 커밋 필터. 하나라도 있으면 결과가 히스토리의 부분집합이라 그래프 레인이 이어지지 않는다. */
  filter?: GitHistoryFilter
}

/**
 * 커밋 필터 — 각 조건이 **독립적으로 함께** 걸린다(IntelliJ git log 툴바와 같은 모델).
 * 하나를 고르면 나머지가 풀리는 라디오 방식이 아니다.
 */
export interface GitHistoryFilter {
  /** 커밋 메시지 검색어. 7자 이상 hex 이고 실제 커밋이면 그 커밋 하나만 보여준다. */
  text?: string
  /** `text` 를 정규식으로 해석한다. 끄면 있는 그대로 찾는다. */
  regex?: boolean
  /** `text`·`author` 의 대소문자를 구분한다. 기본은 무시. */
  caseSensitive?: boolean
  /** 작성자 이름·이메일 (`--author`) */
  author?: string
  /** 이 경로를 건드린 커밋만 (pathspec) */
  path?: string
  /** 이 문자열이 추가되거나 삭제된 커밋만 (`-S`, pickaxe) */
  content?: string
  /** 이 시각 이후 (`--since`). git 이 이해하는 표현 — `2026-07-01`, `2 weeks ago` 등 */
  since?: string
  /** 이 시각 이전 (`--until`) */
  until?: string
  /** 특정 브랜치만. 지정하면 `allBranches` 보다 우선한다. */
  branch?: string
}

/** 값이 실제로 걸린 필터 키들 — 토글(regex/caseSensitive)은 단독으로 필터가 아니다. */
const FILTER_VALUE_KEYS = ['text', 'author', 'path', 'content', 'since', 'until', 'branch'] as const

/** 필터가 하나라도 걸려 있는지 — 그래프 레인 표시 여부를 가른다. */
export function hasHistoryFilter(filter: GitHistoryFilter | undefined): boolean {
  if (!filter) return false
  return FILTER_VALUE_KEYS.some((key) => Boolean(filter[key]?.trim()))
}

/** 걸린 조건 수 — UI 배지에 쓴다. */
export function countHistoryFilters(filter: GitHistoryFilter | undefined): number {
  if (!filter) return 0
  return FILTER_VALUE_KEYS.filter((key) => Boolean(filter[key]?.trim())).length
}

/**
 * 두 필터가 같은 조회를 뜻하는지.
 * 참조 비교로는 매번 새 객체가 만들어져 조건이 안 바뀌었는데도 히스토리를 다시 읽는다.
 */
export function sameHistoryFilter(
  a: GitHistoryFilter | undefined,
  b: GitHistoryFilter | undefined
): boolean {
  const norm = (f: GitHistoryFilter | undefined, key: (typeof FILTER_VALUE_KEYS)[number]): string =>
    f?.[key]?.trim() ?? ''
  if (FILTER_VALUE_KEYS.some((key) => norm(a, key) !== norm(b, key))) return false
  // 토글은 검색어가 있을 때만 조회에 영향을 준다.
  if (!norm(a, 'text') && !norm(a, 'author')) return true
  return Boolean(a?.regex) === Boolean(b?.regex) &&
    Boolean(a?.caseSensitive) === Boolean(b?.caseSensitive)
}

export interface GitHistoryResult {
  items: GitHistoryItem[]
  currentRef?: GitHistoryItemRef
  remoteRef?: GitHistoryItemRef
  baseRef?: GitHistoryItemRef
  mergeBase?: string
  hasMore: boolean
  limit: number
  /** 이번 응답에 필터가 적용됐는지 — 렌더러가 그래프를 접는 근거 */
  filtered?: boolean
  /** 이번 응답이 건너뛴 개수 — 다음 페이지는 `skip + items.length` 로 요청한다. */
  skip: number
}

export type GitHistoryExecutor = (
  args: string[],
  cwd: string
) => Promise<{ stdout: string; stderr?: string }>
