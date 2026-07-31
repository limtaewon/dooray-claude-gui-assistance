/** 소스 제어 요청/응답 계약 — main↔renderer 공용. status/history 타입은 별도 파일. */
import type { GitStatusEntry } from './statusTypes'

/** diff 대상. 'staged' = index vs HEAD, 'unstaged' = 작업트리 vs index, commit = 그 커밋의 변경. */
export type GitDiffSource =
  | { kind: 'staged' }
  | { kind: 'unstaged' }
  | { kind: 'commit'; commitOid: string; parentOid?: string }
  /** 기준 커밋 대비 지금 작업 트리 — '이 브랜치가 바꾼 것 전부'(커밋 + 아직 안 한 변경) */
  | { kind: 'range'; baseOid: string }

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

/**
 * 브랜치가 기준(base)에서 갈라진 뒤 바꾼 파일들.
 *
 * 작업 트리까지 포함해 비교한다 — '이 브랜치가 최종적으로 무엇을 바꾸는가' 가 알고 싶은 것이라
 * 커밋한 것만 보여주면 반쪽이다. 추적되지 않는 새 파일은 여기 안 나온다(변경사항 탭에서 본다).
 */
export interface GitBranchDiff {
  /** 비교 기준으로 쓴 ref (`origin/main` 등) */
  baseRef: string
  /** merge-base 커밋 — diff 요청에 그대로 쓴다 */
  baseOid: string
  /** 현재 브랜치 이름 (detached 면 짧은 해시) */
  headRef: string
  /** 기준 이후 이 브랜치의 커밋 수 */
  ahead: number
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
