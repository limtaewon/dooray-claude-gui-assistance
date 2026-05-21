import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join, basename, dirname } from 'path'
import type {
  GitWorktree,
  GitWorktreeStatus,
  GitBranch,
  GitFileDiff,
  GitDiffResult,
  GitWorktreeCreateParams,
  GitWorktreeRemoveParams,
  GitFileCompare
} from '../../shared/types/git'

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message))
      } else {
        resolve(stdout.trim())
      }
    })
  })
}

/** git ref 이름 검증 (커맨드 인젝션 방지) */
function assertSafeRef(ref: string): void {
  if (ref.startsWith('-') || ref.includes('..') || /[;\|\&\$`\n\r]/.test(ref)) {
    throw new Error(`유효하지 않은 git 참조: ${ref}`)
  }
}

export class GitService {
  /** 해당 경로가 git 저장소인지 확인 */
  async isGitRepo(path: string): Promise<boolean> {
    try {
      await git(['rev-parse', '--git-dir'], path)
      return true
    } catch {
      return false
    }
  }

  /** git 저장소의 루트 경로 */
  async getRepoRoot(path: string): Promise<string> {
    return git(['rev-parse', '--show-toplevel'], path)
  }

  /** 브랜치 목록 (로컬 + 리모트) */
  async listBranches(repoPath: string): Promise<GitBranch[]> {
    const [localRaw, remoteRaw, currentRaw] = await Promise.all([
      git(['branch', '--format=%(refname:short)|%(objectname:short)|%(creatordate:iso8601)'], repoPath),
      git(['branch', '-r', '--format=%(refname:short)|%(objectname:short)|%(creatordate:iso8601)'], repoPath).catch(() => ''),
      git(['branch', '--show-current'], repoPath)
    ])

    const current = currentRaw.trim()
    const branches: GitBranch[] = []

    for (const line of localRaw.split('\n').filter(Boolean)) {
      const [name, lastCommit, lastCommitDate] = line.split('|')
      branches.push({
        name,
        isRemote: false,
        isCurrent: name === current,
        lastCommit: lastCommit || '',
        lastCommitDate: lastCommitDate || ''
      })
    }

    for (const line of remoteRaw.split('\n').filter(Boolean)) {
      const [name, lastCommit, lastCommitDate] = line.split('|')
      if (name.includes('/HEAD')) continue
      const shortName = name.replace(/^origin\//, '')
      if (branches.some((b) => b.name === shortName)) continue
      branches.push({
        name,
        isRemote: true,
        isCurrent: false,
        lastCommit: lastCommit || '',
        lastCommitDate: lastCommitDate || ''
      })
    }

    return branches
  }

  /** worktree porcelain 출력 → GitWorktree[] 변환 */
  private parseWorktrees(raw: string): GitWorktree[] {
    const worktrees: GitWorktree[] = []
    let current: Partial<GitWorktree> = {}
    const push = (): void => {
      if (!current.path) return
      worktrees.push({
        path: current.path,
        branch: current.branch || '(detached)',
        head: current.head || '',
        isMain: worktrees.length === 0,
        isBare: current.isBare || false
      })
      current = {}
    }
    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) current.path = line.substring('worktree '.length)
      else if (line.startsWith('HEAD ')) current.head = line.substring('HEAD '.length)
      else if (line.startsWith('branch ')) current.branch = line.substring('branch '.length).replace('refs/heads/', '')
      else if (line === 'bare') current.isBare = true
      else if (line === '') push()
    }
    push()
    return worktrees
  }

  /**
   * 워크트리 목록.
   * 외부 (터미널 등) 에서 worktree 가 삭제됐을 경우 git 은 stale 한 entry 를 그대로 들고 있어서
   * UI 가 그 path 로 status 갱신/remove 시도하다 ENOENT throw 가 발생 (Issue #8).
   * → main worktree 아닌 entry 중 fs 가 비어있는 게 보이면 자동 prune 후 재 list.
   */
  async listWorktrees(repoPath: string): Promise<GitWorktree[]> {
    const raw = await git(['worktree', 'list', '--porcelain'], repoPath)
    let parsed = this.parseWorktrees(raw)
    const hasStale = parsed.some((w) => !w.isMain && !w.isBare && w.path && !existsSync(w.path))
    if (hasStale) {
      await git(['worktree', 'prune'], repoPath).catch(() => { /* prune 실패는 무시 — 다음 호출에서 재시도 */ })
      const raw2 = await git(['worktree', 'list', '--porcelain'], repoPath).catch(() => raw)
      parsed = this.parseWorktrees(raw2)
    }
    return parsed
  }

  /** 워크트리 생성 */
  async createWorktree(params: GitWorktreeCreateParams): Promise<GitWorktree> {
    const { repoPath, branch, newBranch, baseBranch } = params
    assertSafeRef(branch)
    if (baseBranch) assertSafeRef(baseBranch)

    const repoName = basename(repoPath)
    const worktreeBase = join(dirname(repoPath), `.${repoName}-worktrees`)
    const safeBranch = branch.replace(/\//g, '-')
    const worktreePath = params.path || join(worktreeBase, safeBranch)

    if (existsSync(worktreePath)) {
      const worktrees = await this.listWorktrees(repoPath)
      const existing = worktrees.find((w) => w.path === worktreePath)
      if (existing) return existing
      throw new Error(`경로 ${worktreePath}이(가) 이미 존재하지만 워크트리가 아닙니다. 수동으로 제거해주세요.`)
    }

    if (newBranch) {
      await git(['worktree', 'add', '-b', branch, worktreePath, baseBranch || 'HEAD'], repoPath)
    } else {
      const isRemote = branch.startsWith('origin/')
      const localBranch = isRemote ? branch.replace(/^origin\//, '') : branch

      try {
        await git(['worktree', 'add', worktreePath, localBranch], repoPath)
      } catch (err) {
        if (String(err).includes('is not a commit')) {
          await git(['worktree', 'add', '--track', '-b', localBranch, worktreePath, `origin/${localBranch}`], repoPath)
        } else {
          throw err
        }
      }
    }

    const worktrees = await this.listWorktrees(repoPath)
    const created = worktrees.find((w) => w.path === worktreePath)
    if (!created) throw new Error('워크트리 생성 후 찾을 수 없음')
    return created
  }

  /** 워크트리 삭제 — 외부에서 이미 fs 가 삭제된 경우 prune 으로 fallback (Issue #8) */
  async removeWorktree(params: GitWorktreeRemoveParams): Promise<void> {
    if (!existsSync(params.worktreePath)) {
      // fs 가 비어있으면 git worktree remove 가 "is not a working tree" 로 실패 — prune 만으로 metadata 정리.
      await git(['worktree', 'prune'], params.repoPath).catch(() => { /* 이미 prune 됐을 수 있음 */ })
      return
    }
    const args = ['worktree', 'remove']
    if (params.force) args.push('--force')
    args.push('--', params.worktreePath)
    try {
      await git(args, params.repoPath)
    } catch (err) {
      const msg = String(err)
      // 외부에서 .git/worktrees 만 부분 손상된 경우 등 — prune 으로 graceful fallback
      if (msg.includes('is not a working tree') || msg.includes('does not exist') || msg.includes('not a directory')) {
        await git(['worktree', 'prune'], params.repoPath).catch(() => { /* ok */ })
        return
      }
      throw err
    }
  }

  /**
   * 워크트리 상태 (변경파일 수, ahead/behind).
   * worktreePath 가 외부에서 이미 삭제된 경우 git status 가 ENOENT throw 하므로 zero 반환 (Issue #8).
   */
  async getWorktreeStatus(worktreePath: string): Promise<Omit<GitWorktreeStatus, 'worktree'>> {
    if (!existsSync(worktreePath)) {
      return { modifiedFiles: 0, untrackedFiles: 0, aheadBehind: { ahead: 0, behind: 0 } }
    }
    const [statusRaw, aheadBehindRaw] = await Promise.all([
      git(['status', '--porcelain'], worktreePath),
      git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], worktreePath).catch(() => '0\t0')
    ])

    const lines = statusRaw.split('\n').filter(Boolean)
    const modifiedFiles = lines.filter((l) => !l.startsWith('??')).length
    const untrackedFiles = lines.filter((l) => l.startsWith('??')).length

    const [ahead, behind] = aheadBehindRaw.split('\t').map(Number)

    return {
      modifiedFiles,
      untrackedFiles,
      aheadBehind: { ahead: ahead || 0, behind: behind || 0 }
    }
  }

  /** 변경된 파일 목록 (diff) */
  async getDiff(worktreePath: string): Promise<GitDiffResult> {
    const [numstatRaw, diffRaw, statusRaw] = await Promise.all([
      git(['diff', '--numstat', 'HEAD'], worktreePath).catch(() => ''),
      git(['diff', 'HEAD'], worktreePath).catch(() => ''),
      git(['status', '--porcelain'], worktreePath)
    ])

    // numstat으로 정확한 변경 줄 수 파싱
    const numstatMap = new Map<string, { additions: number; deletions: number }>()
    for (const line of numstatRaw.split('\n').filter(Boolean)) {
      const [add, del, file] = line.split('\t')
      numstatMap.set(file, { additions: parseInt(add) || 0, deletions: parseInt(del) || 0 })
    }

    const files: GitFileDiff[] = []
    for (const line of statusRaw.split('\n').filter(Boolean)) {
      const status = line.substring(0, 2).trim() as GitFileDiff['status']
      const file = line.substring(3)
      const stat = numstatMap.get(file) || { additions: 0, deletions: 0 }
      files.push({ file, status: status || 'M', ...stat })
    }

    const totalAdd = Array.from(numstatMap.values()).reduce((s, v) => s + v.additions, 0)
    const totalDel = Array.from(numstatMap.values()).reduce((s, v) => s + v.deletions, 0)

    return {
      files,
      summary: `${files.length}개 파일, +${totalAdd} -${totalDel}`,
      patch: diffRaw.substring(0, 50000)
    }
  }

  /** 두 브랜치 간 diff */
  async compareBranches(repoPath: string, branch1: string, branch2: string): Promise<GitDiffResult> {
    assertSafeRef(branch1)
    assertSafeRef(branch2)

    const [numstatRaw, diffRaw] = await Promise.all([
      git(['diff', '--numstat', '--', branch1, branch2], repoPath).catch(() => ''),
      git(['diff', '--', branch1, branch2], repoPath).catch(() => '')
    ])

    const files: GitFileDiff[] = []
    let totalAdd = 0, totalDel = 0
    for (const line of numstatRaw.split('\n').filter(Boolean)) {
      const [add, del, file] = line.split('\t')
      const additions = parseInt(add) || 0
      const deletions = parseInt(del) || 0
      totalAdd += additions
      totalDel += deletions
      files.push({ file, status: 'M', additions, deletions })
    }

    return {
      files,
      summary: `${files.length}개 파일, +${totalAdd} -${totalDel}`,
      patch: diffRaw.substring(0, 50000)
    }
  }

  /** 특정 파일의 두 브랜치 간 내용 비교 */
  async compareFile(repoPath: string, filePath: string, branch1: string, branch2: string): Promise<GitFileCompare> {
    assertSafeRef(branch1)
    assertSafeRef(branch2)

    const [left, right] = await Promise.all([
      git(['show', `${branch1}:${filePath}`], repoPath).catch(() => '(파일 없음)'),
      git(['show', `${branch2}:${filePath}`], repoPath).catch(() => '(파일 없음)')
    ])

    return {
      file: filePath,
      leftContent: left.substring(0, 100000),
      rightContent: right.substring(0, 100000),
      leftBranch: branch1,
      rightBranch: branch2
    }
  }

  /** 워크트리 정리 (삭제된 워크트리 참조 제거) */
  async pruneWorktrees(repoPath: string): Promise<void> {
    await git(['worktree', 'prune'], repoPath)
  }
}
