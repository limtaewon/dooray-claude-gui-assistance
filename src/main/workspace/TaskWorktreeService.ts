import type { GitWorktree } from '../../shared/types/git'
import type { EnsureTaskWorktreeParams, TaskWorktreeInfo } from '../../shared/types/workspace'
import { samePath } from '../utils/paths'

export interface TaskWorktreeDeps {
  git: {
    listWorktrees: (repoPath: string) => Promise<GitWorktree[]>
    listBranches: (repoPath: string) => Promise<{ name: string; isRemote: boolean }[]>
    createWorktree: (params: {
      repoPath: string
      branch: string
      newBranch?: boolean
      baseBranch?: string
    }) => Promise<GitWorktree>
    getDefaultRemoteBranch: (repoPath: string) => Promise<string | null>
    addToInfoExclude: (worktreePath: string, patterns: string[]) => Promise<boolean>
  }
  claudeDir: {
    preApproveTrust: (dir: string) => unknown
  }
}

/** 워크트리에 남기면 diff 를 더럽히는 것들 — 공용 `info/exclude` 라 본 저장소에도 적용된다. */
const WORKTREE_EXCLUDES = ['.claude/', '.claude/settings.local.json']

/**
 * 업무 하나가 쓸 워크트리를 보장한다 — 업무마다 폴더가 갈리므로 여러 업무를 동시에 진행할 수 있다.
 *
 * 이미 그 브랜치가 어딘가(본 저장소 포함)에 체크아웃돼 있으면 **그 폴더를 그대로 쓴다** —
 * git 은 같은 브랜치를 두 곳에 체크아웃하지 못하고, 이미 그 브랜치로 작업 중이었다면 그게 정답이다.
 */
export class TaskWorktreeService {
  constructor(private deps: TaskWorktreeDeps) {}

  /**
   * 새 브랜치를 어디서 갈라낼지 정한다 — 저장소 설정값 → 원격 기본 브랜치 순.
   *
   * 둘 다 없으면 undefined 를 돌려주고 git 이 현재 HEAD 를 쓴다. 이때 본 저장소가 다른 업무의
   * 브랜치를 보고 있으면 그 위에서 갈라지므로, 어느 기준을 썼는지 로그로 남긴다.
   */
  private async resolveBase(repoPath: string, configured?: string): Promise<string | undefined> {
    if (configured?.trim()) return configured.trim()
    const remoteDefault = await this.deps.git.getDefaultRemoteBranch(repoPath).catch(() => null)
    if (remoteDefault) return remoteDefault
    console.warn(
      `[TaskWorktree] 기준 브랜치를 알 수 없어 현재 HEAD 에서 갈라냅니다 repoPath=${repoPath}` +
        ' (설정 → 워크스페이스 → 저장소의 "기본 base" 로 고정할 수 있습니다)'
    )
    return undefined
  }

  async ensure(params: EnsureTaskWorktreeParams): Promise<TaskWorktreeInfo> {
    const { repoPath, branch, baseBranch } = params

    const worktrees = await this.deps.git.listWorktrees(repoPath)
    const checkedOut = worktrees.find((w) => w.branch === branch)
    if (checkedOut) {
      return {
        path: checkedOut.path,
        branch,
        created: false,
        // 본 저장소가 이미 그 브랜치다 — 워크트리를 새로 파지 않고 여기서 한다.
        isMainRepo: samePath(checkedOut.path, repoPath)
      }
    }

    const branches = await this.deps.git.listBranches(repoPath).catch(() => [])
    const branchExists = branches.some((b) => !b.isRemote && b.name === branch)

    const created = await this.deps.git.createWorktree({
      repoPath,
      branch,
      newBranch: !branchExists,
      baseBranch: branchExists ? undefined : await this.resolveBase(repoPath, baseBranch)
    })

    // claude 가 새 폴더에서 "이 폴더를 신뢰하나요?" 를 물으면 자동 입력이 그 프롬프트에 먹힌다.
    this.deps.claudeDir.preApproveTrust(created.path)
    await this.deps.git
      .addToInfoExclude(created.path, WORKTREE_EXCLUDES)
      .catch((err) => {
        console.warn(`[TaskWorktree] info/exclude 갱신 실패 path=${created.path}:`, err)
        return false
      })

    return { path: created.path, branch, created: true, isMainRepo: false }
  }
}
