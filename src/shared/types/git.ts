export interface GitWorktree {
  path: string
  branch: string
  head: string // commit hash
  isMain: boolean
  isBare: boolean
}

/** 워크트리 정리 화면이 쓰는 실측 정보 — 용량은 posix 만(Windows 는 null). */
export interface GitWorktreeUsage {
  path: string
  branch: string
  isMain: boolean
  /** 작업 파일이 차지하는 바이트. 측정 불가면 null (`.git` 오브젝트는 공유라 포함되지 않는다) */
  sizeBytes: number | null
  /** 커밋되지 않은 변경 파일 수 — 0 이 아니면 지울 때 잃는 게 있다 */
  dirtyFiles: number
  /** 폴더 수정 시각 (마지막 사용 추정의 폴백) */
  mtimeMs: number | null
}

export interface GitWorktreeStatus {
  worktree: GitWorktree
  modifiedFiles: number
  untrackedFiles: number
  aheadBehind: { ahead: number; behind: number }
}

export interface GitBranch {
  name: string
  isRemote: boolean
  isCurrent: boolean
  lastCommit: string
  lastCommitDate: string
}

export interface GitFileDiff {
  file: string
  status: 'M' | 'A' | 'D' | 'R' | '?'
  additions: number
  deletions: number
}

export interface GitDiffResult {
  files: GitFileDiff[]
  summary: string
  patch: string
}

export interface GitWorktreeCreateParams {
  repoPath: string
  branch: string
  path?: string // custom worktree path, auto-generated if not provided
  newBranch?: boolean // create new branch
  baseBranch?: string // base branch for new branch
}

export interface GitWorktreeRemoveParams {
  repoPath: string
  worktreePath: string
  force?: boolean
}

export interface GitFileCompare {
  file: string
  leftContent: string
  rightContent: string
  leftBranch: string
  rightBranch: string
}
