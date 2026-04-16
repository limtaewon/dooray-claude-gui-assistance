export interface GitWorktree {
  path: string
  branch: string
  head: string // commit hash
  isMain: boolean
  isBare: boolean
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
