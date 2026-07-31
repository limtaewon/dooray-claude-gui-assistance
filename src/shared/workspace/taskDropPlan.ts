import type { RepoRegistryEntry, TaskSessionLink } from '../types/workspace'

/** 경로 비교 — 뒤 슬래시 차이만 무시한다. */
function normalize(path: string): string {
  return path.replace(/[/\\]+$/, '')
}

export function samePath(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  return normalize(a) === normalize(b)
}

export interface TaskDropCandidate {
  repoId: string
  name: string
  path: string
  /** 그 폴더에서 이 업무로 쓰던 claude 세션 (있으면 이어간다) */
  sessionId?: string
}

export type TaskDropPlan =
  /**
   * 바로 시작한다. `needsCd` 가 false 면 이미 그 폴더에 있다는 뜻.
   * `needsCd` 가 true 면 `cwd`·`repoName` 이 반드시 있다. 둘 다 없는 경우는 터미널 위치를
   * 알아내지 못한 것 — 있는 자리에서 그대로 실행한다(Windows 는 cwd 실측 수단이 없다).
   */
  | { kind: 'start'; cwd?: string; repoName?: string; sessionId?: string; needsCd: boolean }
  /** 어느 저장소에서 할지 물어야 한다. */
  | { kind: 'choose'; candidates: TaskDropCandidate[] }

export interface TaskDropPlanInput {
  /** 드롭한 터미널이 지금 있는 폴더 */
  currentCwd?: string
  /** 이 프로젝트에 매핑된 저장소들 */
  mappedRepos: RepoRegistryEntry[]
  /** 이 업무가 폴더별로 쓰던 세션 */
  links: TaskSessionLink[]
}

function sessionFor(links: TaskSessionLink[], cwd: string): string | undefined {
  return links.find((link) => samePath(link.cwd, cwd))?.claudeSessionId
}

/**
 * 업무를 어디서 시작할지 정한다.
 *
 * 규칙 — **지금 있는 자리가 이미 그 프로젝트의 저장소면 거기서 한다.** 사용자가 터미널을 그
 * 폴더로 옮겨둔 것 자체가 선택이라, 다른 데로 `cd` 하면 그 선택을 덮는다.
 * 매핑되지 않은 자리에 놓았을 때만 어디로 갈지 정하는데, 후보가 하나면 그냥 가고 여럿이면 묻는다.
 * 매핑이 아예 없으면 지금 자리에서 시작한다 — 설정을 안 했다고 드롭이 죽으면 안 된다.
 */
export function resolveTaskDropPlan(input: TaskDropPlanInput): TaskDropPlan {
  const { currentCwd, mappedRepos, links } = input

  const here = currentCwd
    ? mappedRepos.find((repo) => samePath(repo.path, currentCwd))
    : undefined
  if (here && currentCwd) {
    return {
      kind: 'start',
      cwd: here.path,
      repoName: here.name,
      sessionId: sessionFor(links, here.path),
      needsCd: false
    }
  }

  if (mappedRepos.length === 1) {
    const only = mappedRepos[0]
    return {
      kind: 'start',
      cwd: only.path,
      repoName: only.name,
      sessionId: sessionFor(links, only.path),
      needsCd: !samePath(currentCwd, only.path)
    }
  }

  if (mappedRepos.length > 1) {
    return {
      kind: 'choose',
      candidates: mappedRepos.map((repo) => ({
        repoId: repo.id,
        name: repo.name,
        path: repo.path,
        sessionId: sessionFor(links, repo.path)
      }))
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
  return {
    kind: 'start',
    cwd: candidate.path,
    repoName: candidate.name,
    sessionId: candidate.sessionId,
    needsCd: !samePath(currentCwd, candidate.path)
  }
}
