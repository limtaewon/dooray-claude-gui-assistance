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

/** 커밋 필터 — git log 의 검색 옵션에 그대로 대응한다. 전부 리터럴(정규식 아님)로 해석한다. */
export interface GitHistoryFilter {
  /** 커밋 메시지 (`--grep`) */
  message?: string
  /** 작성자 이름·이메일 (`--author`) */
  author?: string
  /** 이 경로를 건드린 커밋만 (pathspec) */
  path?: string
  /** 이 문자열이 추가되거나 삭제된 커밋만 (`-S`, pickaxe) */
  content?: string
}

/** 필터가 하나라도 걸려 있는지 — 그래프 레인 표시 여부를 가른다. */
export function hasHistoryFilter(filter: GitHistoryFilter | undefined): boolean {
  if (!filter) return false
  return Boolean(
    filter.message?.trim() || filter.author?.trim() || filter.path?.trim() || filter.content?.trim()
  )
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
