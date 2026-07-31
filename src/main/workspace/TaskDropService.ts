import { existsSync } from 'node:fs'
import type { TaskDropTarget, TaskSessionLink } from '../../shared/types/workspace'
import { workspaceKey } from '../../shared/workspace/workspaceKey'
import type { WorkspaceStore } from './WorkspaceStore'

export interface TaskDropSessionSource {
  /** 해당 cwd 의 claude 세션 목록 (최신순 정렬은 보장하지 않는다) */
  (cwd: string): Promise<{ sessionId: string; lastActivityAt: string }[]>
}

export interface TaskDropServiceDeps {
  store: WorkspaceStore
  listSessions: TaskDropSessionSource
  /** 테스트 주입용 — 기본은 fs.existsSync */
  pathExists?: (p: string) => boolean
}

/**
 * 터미널 태스크 드로어(C-3.5)의 경량 흐름. 워크트리를 만들지 않고 매핑된 저장소 폴더에서
 * claude 를 띄우며, 태스크↔claude 세션 매핑을 관리해 두 번째부터는 resume 으로 이어간다.
 */
export class TaskDropService {
  private readonly store: WorkspaceStore
  private readonly listSessions: TaskDropSessionSource
  private readonly pathExists: (p: string) => boolean

  constructor(deps: TaskDropServiceDeps) {
    this.store = deps.store
    this.listSessions = deps.listSessions
    this.pathExists = deps.pathExists ?? existsSync
  }

  /**
   * 드롭한 태스크를 어디서 열지 결정한다.
   *
   * 우선순위: ① 드롭한 pane 이 이미 있는 폴더의 링크(같은 자리에서 이어가는 게 자연스럽다)
   * ② 가장 최근에 쓴 링크 중 폴더가 살아 있는 것 ③ 프로젝트에 매핑된 저장소(없으면 첫 저장소)
   * ④ **드롭한 터미널이 지금 있는 폴더**.
   *
   * ④ 가 없으면 저장소를 미리 등록하지 않은 사용자에게는 드래그&드롭이 통째로 동작하지 않는다.
   * 이미 프로젝트 폴더에 있는 터미널에 놓았다면 "여기서 시작" 이 가장 자연스러운 해석이다.
   */
  async resolve(projectId: string, taskId: string, preferCwd?: string): Promise<TaskDropTarget | null> {
    const key = workspaceKey(projectId, taskId)
    const links = this.store.listTaskSessionLinks(key).filter((l) => this.pathExists(l.cwd))
    const repos = this.store.listRepos()
    const nameOf = (cwd: string, fallback?: string): string =>
      repos.find((r) => r.path === cwd)?.name ??
      fallback ??
      cwd.split(/[/\\]/).filter(Boolean).pop() ??
      cwd

    const preferred = preferCwd ? links.find((l) => l.cwd === preferCwd) : undefined
    const chosen = preferred ?? links[0]
    if (chosen) {
      return {
        cwd: chosen.cwd,
        repoName: nameOf(chosen.cwd, chosen.repoName),
        claudeSessionId: chosen.claudeSessionId
      }
    }

    const mappedId = this.store.getState().projectRepoMap[projectId]
    const repo = repos.find((r) => r.id === mappedId) ?? repos[0]
    if (repo) return { cwd: repo.path, repoName: repo.name }

    // 등록된 저장소가 없으면 지금 터미널이 있는 폴더에서 시작한다.
    if (preferCwd && this.pathExists(preferCwd)) {
      return { cwd: preferCwd, repoName: nameOf(preferCwd) }
    }
    return null
  }

  /** 이 업무가 폴더별로 쓰던 세션 목록 (최근 사용순). */
  listLinks(projectId: string, taskId: string): TaskSessionLink[] {
    return this.store.listTaskSessionLinks(workspaceKey(projectId, taskId))
  }

  /**
   * 드롭 직후 생긴 claude 세션을 (업무, 폴더) 쌍에 연결한다. `since` 이후 활동한 세션만
   * 후보로 보고 가장 최근 것을 고른다 — 이미 열려 있던 다른 세션을 잘못 붙잡지 않기 위함.
   * 후보가 없으면 null 을 반환하며 매핑도 만들지 않는다(다음 드롭이 다시 시도한다).
   */
  async link(
    projectId: string,
    taskId: string,
    cwd: string,
    since: number,
    label?: string
  ): Promise<string | null> {
    const sessions = await this.listSessions(cwd)
    let best: { sessionId: string; at: number } | null = null
    for (const s of sessions) {
      const at = Date.parse(s.lastActivityAt)
      if (Number.isNaN(at) || at < since) continue
      if (!best || at > best.at) best = { sessionId: s.sessionId, at }
    }
    if (!best) return null

    // 워크트리 경로는 등록된 저장소와 절대 같지 않다 — 호출부가 준 이름(저장소 · 브랜치)을
    // 우선 쓰고, 없으면 폴더 이름으로 떨어진다. 여기서 undefined 가 되면 배지가 밋밋해진다.
    const repoName =
      label?.trim() ||
      this.store.listRepos().find((r) => r.path === cwd)?.name ||
      cwd.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
    this.store.upsertTaskSessionLink(workspaceKey(projectId, taskId), {
      cwd,
      claudeSessionId: best.sessionId,
      lastUsedAt: Date.now(),
      repoName
    })
    return best.sessionId
  }

  /** 세션을 다시 열었을 때 최근 사용 시각만 갱신한다 — 목록 정렬이 실제 사용을 따르게. */
  touch(projectId: string, taskId: string, cwd: string): void {
    const key = workspaceKey(projectId, taskId)
    const link = this.store.listTaskSessionLinks(key).find((l) => l.cwd === cwd)
    if (!link) return
    this.store.upsertTaskSessionLink(key, { ...link, lastUsedAt: Date.now() })
  }

  /** 매핑 해제. cwd 를 주면 그 폴더만, 안 주면 이 업무의 링크 전부. */
  unlink(projectId: string, taskId: string, cwd?: string): void {
    this.store.removeTaskSessionLink(workspaceKey(projectId, taskId), cwd)
  }

  /** 업무 키 → 폴더별 링크. 드로어 카드의 저장소 배지에 그대로 쓴다. */
  linkedMap(): Record<string, TaskSessionLink[]> {
    const repos = this.store.listRepos()
    const result: Record<string, TaskSessionLink[]> = {}
    for (const [key, links] of Object.entries(this.store.getState().taskSessionLinks)) {
      result[key] = [...links]
        .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
        .map((link) => ({
          ...link,
          repoName: repos.find((r) => r.path === link.cwd)?.name ?? link.repoName
        }))
    }
    return result
  }
}
