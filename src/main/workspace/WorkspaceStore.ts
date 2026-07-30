import { migrateWorkspaceState, type WorkspaceState } from './workspaceState'
import { isLiveRun } from '../../shared/workspace/runStateMachine'
import type {
  AgentRun,
  RepoRegistryEntry,
  TaskSessionLink,
  TaskWorkspace,
  WorkspaceKey,
  WorkspaceSettings
} from '../../shared/types/workspace'

const STATE_KEY = 'state'

/** `WorkspaceStore` 가 요구하는 최소 저장소 계약. `electron-store` 인스턴스가 이를 만족한다. */
export interface WorkspaceStorage {
  get<T>(key: string, fallback: T): T
  set(key: string, value: unknown): void
}

/**
 * 태스크 ↔ 브랜치 ↔ 워크트리 ↔ claude 세션 대응 관계의 영속화 계층.
 * 진실은 키 하나(`state`) 아래 문서 1개 — 쓰기는 항상 read-modify-write 후 전체 저장.
 */
export class WorkspaceStore {
  private state: WorkspaceState

  constructor(
    private storage: WorkspaceStorage,
    opts?: { legacyGitRepoPath?: string }
  ) {
    const raw = this.storage.get<unknown>(STATE_KEY, null)
    this.state = migrateWorkspaceState(raw, { legacyGitRepoPath: opts?.legacyGitRepoPath })
    this.persist()
  }

  private persist(): void {
    this.storage.set(STATE_KEY, this.state)
  }

  getState(): WorkspaceState {
    return this.state
  }

  listRepos(): RepoRegistryEntry[] {
    return this.state.repos
  }

  addRepo(entry: RepoRegistryEntry): RepoRegistryEntry {
    const existing = this.state.repos.find((r) => r.id === entry.id)
    if (existing) return existing
    this.state.repos = [...this.state.repos, entry]
    this.persist()
    return entry
  }

  updateRepo(id: string, patch: Partial<RepoRegistryEntry>): RepoRegistryEntry | null {
    let updated: RepoRegistryEntry | null = null
    this.state.repos = this.state.repos.map((r) => {
      if (r.id !== id) return r
      updated = { ...r, ...patch, id: r.id }
      return updated
    })
    if (updated) this.persist()
    return updated
  }

  removeRepo(id: string): void {
    this.state.repos = this.state.repos.filter((r) => r.id !== id)
    this.persist()
  }

  getSettings(): WorkspaceSettings {
    return this.state.settings
  }

  setSettings(patch: Partial<WorkspaceSettings>): WorkspaceSettings {
    this.state.settings = { ...this.state.settings, ...patch }
    this.persist()
    return this.state.settings
  }

  setProjectRepo(projectId: string, repoId: string): void {
    this.state.projectRepoMap = { ...this.state.projectRepoMap, [projectId]: repoId }
    this.persist()
  }

  listWorkspaces(): TaskWorkspace[] {
    return Object.values(this.state.workspaces)
  }

  getWorkspace(key: WorkspaceKey): TaskWorkspace | null {
    return this.state.workspaces[key] ?? null
  }

  /**
   * 워크스페이스를 저장한다. `activeRunId` 가 존재하지 않거나 live 상태가 아닌 run 을 가리키면
   * 경고 로그 후 null 로 교정해 저장한다(ADR-v2-workspace-p1-03 (e) — throw 하지 않는다).
   */
  saveWorkspace(ws: TaskWorkspace): TaskWorkspace {
    const corrected = this.enforceActiveRunInvariant(ws)
    const persisted: TaskWorkspace = { ...corrected, updatedAt: Date.now() }
    this.state.workspaces = { ...this.state.workspaces, [persisted.id]: persisted }
    this.persist()
    return persisted
  }

  private enforceActiveRunInvariant(ws: TaskWorkspace): TaskWorkspace {
    if (ws.activeRunId === null) return ws
    const run = ws.runs.find((r) => r.runId === ws.activeRunId)
    if (run && isLiveRun(run.status)) return ws
    console.warn(`[WorkspaceStore] activeRunId 불일치 workspaceId=${ws.id} runId=${ws.activeRunId}`)
    return { ...ws, activeRunId: null }
  }

  findRunById(runId: string): { workspace: TaskWorkspace; run: AgentRun } | null {
    for (const ws of Object.values(this.state.workspaces)) {
      const run = ws.runs.find((r) => r.runId === runId)
      if (run) return { workspace: ws, run }
    }
    return null
  }

  findWorkspaceByWorktree(worktreePath: string): TaskWorkspace | null {
    for (const ws of Object.values(this.state.workspaces)) {
      if (ws.runs.some((r) => r.worktreePath === worktreePath)) return ws
    }
    return null
  }

  getTaskSessionLink(key: WorkspaceKey): TaskSessionLink | null {
    return this.state.taskSessionLinks[key] ?? null
  }

  setTaskSessionLink(key: WorkspaceKey, link: TaskSessionLink): void {
    this.state.taskSessionLinks = { ...this.state.taskSessionLinks, [key]: link }
    this.persist()
  }
}
