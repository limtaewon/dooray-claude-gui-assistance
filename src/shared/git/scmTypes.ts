/** 소스 제어 요청/응답 계약 — main↔renderer 공용. status/history 타입은 별도 파일. */
import type { GitStatusEntry } from './statusTypes'

/** diff 대상. 'staged' = index vs HEAD, 'unstaged' = 작업트리 vs index, commit = 그 커밋의 변경. */
export type GitDiffSource =
  | { kind: 'staged' }
  | { kind: 'unstaged' }
  | { kind: 'commit'; commitOid: string; parentOid?: string }

export interface GitFileDiffParams {
  repoPath: string
  path: string
  /** rename 인 경우의 원본 경로 — 좌측(original)을 이 경로로 읽는다 */
  oldPath?: string
  source: GitDiffSource
}

/**
 * 파일 diff — unified patch 가 아니라 양쪽 전문을 준다. diff 계산은 Monaco 가 한다.
 * 렌더 한도를 넘으면 내용을 비우고 `tooLarge` 만 채운다.
 */
export interface GitFileDiffContent {
  path: string
  original: string
  modified: string
  originalBinary: boolean
  modifiedBinary: boolean
  /** 렌더 한도 초과 — 뷰어는 안내 화면을 띄운다 */
  tooLarge?: { lines?: number; characters?: number }
}

/** 커밋 1건의 변경 파일 — 히스토리에서 커밋을 펼쳤을 때. */
export interface GitCommitFileChange {
  path: string
  oldPath?: string
  status: GitStatusEntry['status']
  added?: number
  removed?: number
}

export interface GitCommitDetail {
  commitOid: string
  parentOid?: string
  files: GitCommitFileChange[]
}

export interface GitStashEntry {
  /** `stash@{0}` */
  ref: string
  index: number
  message: string
  /** epoch millis */
  timestamp?: number
}

/** 커밋 작성자 — 필터에서 목록으로 고를 수 있게 빈도순으로 준다. */
export interface GitAuthorInfo {
  name: string
  email: string
  /** 표본 안에서의 커밋 수 — 자주 쓰는 사람을 위로 올리는 데 쓴다 */
  count: number
}

export interface GitRemoteInfo {
  name: string
  fetchUrl: string
  pushUrl: string
}

export interface GitCommitParams {
  repoPath: string
  message: string
  amend?: boolean
}

export interface GitPushParams {
  repoPath: string
  remote?: string
  branch?: string
  /** upstream 설정 (`-u`) — upstream 이 없는 브랜치를 처음 올릴 때 */
  setUpstream?: boolean
  /** 강제 푸시는 `--force-with-lease` 만 허용한다 */
  forceWithLease?: boolean
}

export interface GitPullParams {
  repoPath: string
  remote?: string
  branch?: string
  rebase?: boolean
}

/** 원격 작업 결과 — 실패해도 throw 대신 이 형태로 이유를 실어 보낸다. */
export interface GitRemoteOpResult {
  ok: boolean
  /** 사용자에게 보여줄 요약 (정규화된 git 메시지) */
  message: string
  /** 인증 실패로 판정되면 true — UI 가 자격증명 안내를 띄운다 */
  authFailed?: boolean
}

export interface GitCreateBranchParams {
  repoPath: string
  name: string
  /** 분기 시작점 — 생략 시 HEAD */
  startPoint?: string
  /** 만들고 바로 전환 */
  checkout?: boolean
}
