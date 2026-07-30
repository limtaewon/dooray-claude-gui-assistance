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
  /** Load more — 앞의 이 개수만큼 건너뛴다. 커서(oid)가 아니라 offset 이어야 `--all` 토폴로지가 페이지 간에 일관된다. */
  skip?: number
}

export interface GitHistoryResult {
  items: GitHistoryItem[]
  currentRef?: GitHistoryItemRef
  remoteRef?: GitHistoryItemRef
  baseRef?: GitHistoryItemRef
  mergeBase?: string
  hasMore: boolean
  limit: number
  /** 이번 응답이 건너뛴 개수 — 다음 페이지는 `skip + items.length` 로 요청한다. */
  skip: number
}

export type GitHistoryExecutor = (
  args: string[],
  cwd: string
) => Promise<{ stdout: string; stderr?: string }>
