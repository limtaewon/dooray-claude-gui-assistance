/**
 * 소스 제어(작업 트리 상태) 도메인 타입.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/shared/git-status-types.ts`. Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: 서브모듈 내부 엔트리(`submoduleRoot`)와 SSH/세션 출처(`conflictStatusSource`) 필드 제거.
 *
 * 설계 주의: 한 파일이 staged/unstaged 양쪽에 걸리면 **엔트리를 2개** 만든다(파일 1행 = 1엔트리가
 * 아니다). 소스 제어 UI 가 두 목록을 따로 그리기 때문에 이 모델이 그대로 화면에 대응한다.
 */

export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied'
export type GitStagingArea = 'staged' | 'unstaged' | 'untracked'

export type GitConflictKind =
  | 'both_modified'
  | 'both_added'
  | 'both_deleted'
  | 'added_by_us'
  | 'added_by_them'
  | 'deleted_by_us'
  | 'deleted_by_them'

export type GitConflictOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'none'

export interface GitSubmoduleStatus {
  commitChanged: boolean
  trackedChanges: boolean
  untrackedChanges: boolean
}

/** 변경된 파일 하나. 충돌 엔트리는 `conflictKind` 가 채워지고 area 는 'unstaged' 로 온다. */
export interface GitStatusEntry {
  path: string
  status: GitFileStatus
  area: GitStagingArea
  /** rename/copy 원본 경로 */
  oldPath?: string
  conflictKind?: GitConflictKind
  submodule?: GitSubmoduleStatus
  /** 해당 영역의 diff 라인 수. 바이너리거나 조회 실패면 undefined. */
  added?: number
  removed?: number
}

/** upstream 이 없으면 ahead/behind 0 은 '동기화됨'이 아니다 — 반드시 hasUpstream 을 먼저 본다. */
export interface GitUpstreamStatus {
  hasUpstream: boolean
  upstreamName?: string
  ahead: number
  behind: number
}

export interface GitStatusResult {
  entries: GitStatusEntry[]
  conflictOperation: GitConflictOperation
  /** HEAD 커밋 oid. 커밋이 하나도 없으면 undefined. */
  head?: string
  /** `refs/heads/main` 형태. detached HEAD 면 undefined. */
  branch?: string
  upstreamStatus?: GitUpstreamStatus
  /** 엔트리 상한에 걸려 잘렸으면 true — UI 는 '변경이 너무 많음' 상태를 보여준다. */
  didHitLimit?: boolean
  /** git 을 중단하기 전까지 본 전체 엔트리 수 */
  statusLength?: number
}
