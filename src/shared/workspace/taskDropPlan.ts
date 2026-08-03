import type { RepoRegistryEntry, TaskSessionLink } from '../types/workspace'

/** 경로 비교 — 뒤 슬래시 차이만 무시한다. */
function normalize(path: string): string {
  return path.replace(/[/\\]+$/, '')
}

export function samePath(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  return normalize(a) === normalize(b)
}

/** 워크트리를 만들 저장소 — 브랜치 이름 템플릿 치환에 필요한 값까지 함께 나른다. */
export interface TaskDropRepoRef {
  path: string
  name: string
  baseBranch?: string
  /** 브랜치 템플릿의 `{prefix}` (repo.branchPrefix) */
  branchPrefix?: string
}

export interface TaskDropCandidate {
  repoId: string
  name: string
  path: string
  /** 새 브랜치를 딸 기준 브랜치 (repo.defaultBaseBranch) */
  baseBranch?: string
  /** 브랜치 템플릿의 `{prefix}` (repo.branchPrefix) */
  branchPrefix?: string
  /** 그 저장소에서 이 업무로 쓰던 claude 세션 (있으면 이어간다) */
  sessionId?: string
  /** 그 세션이 있던 폴더 — 워크트리에서 하던 것이면 저장소 경로와 다르다 */
  sessionCwd?: string
}

export type TaskDropPlan =
  /**
   * 바로 시작한다. `needsCd` 가 false 면 이미 그 폴더에 있다는 뜻.
   * `needsCd` 가 true 면 `cwd`·`repoName` 이 반드시 있다. 둘 다 없는 경우는 터미널 위치를
   * 알아내지 못한 것 — 있는 자리에서 그대로 실행한다(Windows 는 cwd 실측 수단이 없다).
   */
  | {
      kind: 'start'
      cwd?: string
      repoName?: string
      sessionId?: string
      needsCd: boolean
      /** 이 업무를 진행할 저장소 — 있으면 여기에 업무용 워크트리를 만들어 그리로 간다 */
      repo?: TaskDropRepoRef
    }
  /** 어느 저장소에서 할지 물어야 한다. */
  | { kind: 'choose'; candidates: TaskDropCandidate[] }

export interface TaskDropPlanInput {
  /** 드롭한 터미널이 지금 있는 폴더 */
  currentCwd?: string
  /**
   * 그 폴더가 속한 **본 저장소** 경로(워크트리면 워크트리가 아니라 본 저장소).
   * 이미 이 프로젝트의 저장소에서 작업 중인지 판정하는 기준 — 워크트리 안에 있어도 같은 저장소다.
   */
  currentRepoRoot?: string
  /** 이 프로젝트에 매핑된 저장소들 */
  mappedRepos: RepoRegistryEntry[]
  /** 이 업무가 폴더별로 쓰던 세션 */
  links: TaskSessionLink[]
}

function repoOf(repo: RepoRegistryEntry): TaskDropRepoRef {
  return {
    path: repo.path,
    name: repo.name,
    baseBranch: repo.defaultBaseBranch,
    // 브랜치 템플릿의 `{prefix}` 가 이 값을 쓴다 — 여기서 안 실으면 그 토큰이 조용히 빈칸이 된다.
    branchPrefix: repo.branchPrefix
  }
}

/** 그 폴더에서 이 업무로 쓰던 세션 — 세션은 (업무 × 폴더) 로 기억한다. */
export function sessionForCwd(links: TaskSessionLink[], cwd: string): string | undefined {
  return links.find((link) => samePath(link.cwd, cwd))?.claudeSessionId
}

/**
 * 그 **저장소** 에서 이 업무로 쓰던 세션 — 워크트리에서 돌린 것도 찾는다.
 *
 * 업무를 드롭하면 워크트리(`.<저장소>-worktrees/<브랜치>`)로 옮겨가므로 링크의 cwd 는 저장소
 * 경로와 다르다. 저장소 경로만 비교하면 "이어가기" 가 영영 안 뜬다.
 * 여러 개면 가장 최근 것.
 */
export function sessionForRepo(
  links: TaskSessionLink[],
  repoPath: string
): { sessionId: string; cwd: string } | undefined {
  const mine = links
    .filter((link) => belongsToRepo(link, repoPath))
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0]
  return mine ? { sessionId: mine.claudeSessionId, cwd: mine.cwd } : undefined
}

function belongsToRepo(link: TaskSessionLink, repoPath: string): boolean {
  if (link.repoPath) return samePath(link.repoPath, repoPath)
  if (samePath(link.cwd, repoPath)) return true
  // 옛 링크(repoPath 없음)는 워크트리 경로 규칙으로 되짚는다.
  return normalize(link.cwd).startsWith(`${worktreeRootOf(repoPath)}/`)
}

/** `~/Desktop/2NEON` → `~/Desktop/.2NEON-worktrees` (GitService.createWorktree 와 같은 규칙) */
function worktreeRootOf(repoPath: string): string {
  const clean = normalize(repoPath)
  const cut = clean.lastIndexOf('/')
  const parent = cut === -1 ? '' : clean.slice(0, cut)
  const name = cut === -1 ? clean : clean.slice(cut + 1)
  return `${parent}/.${name}-worktrees`
}

const sessionFor = sessionForCwd

/**
 * 업무를 어디서 시작할지 정한다.
 *
 * 규칙 — **지금 있는 자리가 이미 그 프로젝트의 저장소면 거기서 한다.** 사용자가 터미널을 그
 * 폴더로 옮겨둔 것 자체가 선택이라, 다른 데로 `cd` 하면 그 선택을 덮는다.
 * 매핑되지 않은 자리에 놓았을 때만 어디로 갈지 정하는데, 후보가 하나면 그냥 가고 여럿이면 묻는다.
 * 매핑이 아예 없으면 지금 자리에서 시작한다 — 설정을 안 했다고 드롭이 죽으면 안 된다.
 */
export function resolveTaskDropPlan(input: TaskDropPlanInput): TaskDropPlan {
  const { currentCwd, currentRepoRoot, mappedRepos, links } = input

  const here = mappedRepos.find(
    (repo) => samePath(repo.path, currentCwd) || samePath(repo.path, currentRepoRoot)
  )
  if (here) {
    return {
      kind: 'start',
      cwd: here.path,
      repoName: here.name,
      sessionId: sessionFor(links, here.path),
      needsCd: false,
      repo: repoOf(here)
    }
  }

  if (mappedRepos.length === 1) {
    const only = mappedRepos[0]
    return {
      kind: 'start',
      cwd: only.path,
      repoName: only.name,
      sessionId: sessionFor(links, only.path),
      needsCd: !samePath(currentCwd, only.path),
      repo: repoOf(only)
    }
  }

  if (mappedRepos.length > 1) {
    return {
      kind: 'choose',
      candidates: mappedRepos.map((repo) => {
        // 워크트리에서 돌리던 세션도 이 저장소의 것으로 친다.
        const previous = sessionForRepo(links, repo.path)
        return {
          repoId: repo.id,
          name: repo.name,
          path: repo.path,
          baseBranch: repo.defaultBaseBranch,
          branchPrefix: repo.branchPrefix,
          sessionId: previous?.sessionId,
          sessionCwd: previous?.cwd
        }
      })
    }
  }

  // 매핑된 저장소가 없다 — 지금 터미널이 있는 폴더에서 시작한다.
  if (currentCwd) {
    return {
      kind: 'start',
      cwd: currentCwd,
      repoName: normalize(currentCwd).split(/[/\\]/).filter(Boolean).pop() ?? currentCwd,
      sessionId: sessionFor(links, currentCwd),
      needsCd: false
    }
  }

  // 매핑도 없고 터미널 위치도 모른다 — 그래도 있는 자리에서 실행한다.
  // 여기서 막으면 저장소를 지정하지 않은 사용자는 드롭 자체를 못 쓴다.
  return { kind: 'start', needsCd: false }
}

/** 사용자가 후보를 고른 뒤의 실행 계획. */
export function planFromCandidate(
  candidate: TaskDropCandidate,
  currentCwd?: string
): Extract<TaskDropPlan, { kind: 'start' }> {
  // 세션은 그것이 만들어진 폴더에서만 이어갈 수 있다 — 워크트리에서 하던 것이면 그 폴더로 간다.
  const cwd = candidate.sessionCwd ?? candidate.path
  return {
    kind: 'start',
    cwd,
    repoName: candidate.name,
    sessionId: candidate.sessionId,
    needsCd: !samePath(currentCwd, cwd),
    repo: {
      path: candidate.path,
      name: candidate.name,
      baseBranch: candidate.baseBranch,
      branchPrefix: candidate.branchPrefix
    }
  }
}
