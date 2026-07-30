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
   * 드롭한 태스크를 어디서 열지 결정한다. 기존 세션 링크의 폴더가 살아 있으면 그것을,
   * 아니면 프로젝트에 매핑된 저장소(없으면 기본 저장소)를 돌려준다. 저장소가 없으면 null.
   */
  async resolve(projectId: string, taskId: string): Promise<TaskDropTarget | null> {
    const key = workspaceKey(projectId, taskId)
    const link = this.store.getTaskSessionLink(key)
    const repos = this.store.listRepos()
    const mappedId = this.store.getState().projectRepoMap[projectId]
    const repo = repos.find((r) => r.id === mappedId) ?? repos[0]

    if (link && this.pathExists(link.cwd)) {
      const owner = repos.find((r) => r.path === link.cwd)
      return { cwd: link.cwd, repoName: owner?.name ?? repo?.name ?? link.cwd, claudeSessionId: link.claudeSessionId }
    }
    if (!repo) return null
    return { cwd: repo.path, repoName: repo.name }
  }

  /**
   * 드롭 직후 생긴 claude 세션을 태스크에 연결한다. `since` 이후 활동한 세션만 후보로 보고
   * 가장 최근 것을 고른다 — 이미 열려 있던 다른 세션을 잘못 붙잡지 않기 위함.
   * 후보가 없으면 null 을 반환하며 매핑도 만들지 않는다(다음 드롭이 다시 시도한다).
   */
  async link(projectId: string, taskId: string, cwd: string, since: number): Promise<string | null> {
    const sessions = await this.listSessions(cwd)
    let best: { sessionId: string; at: number } | null = null
    for (const s of sessions) {
      const at = Date.parse(s.lastActivityAt)
      if (Number.isNaN(at) || at < since) continue
      if (!best || at > best.at) best = { sessionId: s.sessionId, at }
    }
    if (!best) return null

    const record: TaskSessionLink = { cwd, claudeSessionId: best.sessionId, lastUsedAt: Date.now() }
    this.store.setTaskSessionLink(workspaceKey(projectId, taskId), record)
    return best.sessionId
  }

  /** 매핑 해제 — 다음 드롭은 새 세션으로 시작한다. */
  unlink(projectId: string, taskId: string): void {
    this.store.setTaskSessionLink(workspaceKey(projectId, taskId), null)
  }

  /** 링크가 있는 태스크 키 목록 — 드로어의 🔗 배지용. */
  linkedKeys(): string[] {
    return Object.keys(this.store.getState().taskSessionLinks)
  }
}
