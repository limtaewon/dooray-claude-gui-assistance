import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import type { GitService } from '../git/GitService'
import type { TaskService } from '../dooray/TaskService'
import type { TerminalManager } from '../terminal/TerminalManager'
import type { AgentRunSpawner } from './AgentRunSpawner'
import type { WorkspaceStore } from './WorkspaceStore'
import { makeRepoId } from './workspaceState'
import { isPathInside, normalizePathForCompare } from '../utils/paths'
import { isSafeGitRef } from '../../shared/workspace/gitRef'
import { buildBranchName, resolveBranchNameConflict } from '../../shared/workspace/branchName'
import { workspaceKey } from '../../shared/workspace/workspaceKey'
import { applyRunEvent, isLiveRun, type RunEvent } from '../../shared/workspace/runStateMachine'
import type { preApproveTrust, writeHookSettings } from '../claude/claudeDirSetup'
import type {
  AddRepoParams,
  AdoptRunResult,
  AgentRun,
  CleanupRunParams,
  CleanupRunResult,
  RepoRegistryEntry,
  ReconcileResult,
  ResumeRunParams,
  ResumeRunResult,
  StartTaskParams,
  StartTaskResult,
  TaskWorkspace,
  WorkspaceKey,
  WorkspaceRunUpdatedPayload,
  WorkspaceSettings
} from '../../shared/types/workspace'

export type WorkspaceErrorCode =
  | 'REPO_NOT_FOUND'
  | 'NOT_A_REPO'
  | 'CONCURRENCY_LIMIT'
  | 'PATH_INSIDE_AGENT_ROOT'
  | 'RUN_NOT_FOUND'
  | 'DIRTY_WORKTREE'
  | 'ADOPTED_BRANCH_GUARD'

/** `code` 는 main 쪽 로깅/테스트 전용 — IPC 를 건너오지 못한다(Error 는 message 만 직렬화). message 는 그대로 사용자에게 보여줄 한국어 문장. */
export class WorkspaceError extends Error {
  constructor(
    public code: WorkspaceErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'WorkspaceError'
  }
}

export interface ClaudeDirDeps {
  preApproveTrust: typeof preApproveTrust
  writeHookSettings: typeof writeHookSettings
}

export interface WorkspaceServiceDeps {
  store: WorkspaceStore
  git: Pick<
    GitService,
    | 'isGitRepo'
    | 'listBranches'
    | 'listWorktrees'
    | 'createWorktree'
    | 'removeWorktree'
    | 'getWorktreeStatus'
    | 'deleteBranch'
    | 'addToInfoExclude'
    | 'fetchRemote'
  >
  tasks: Pick<TaskService, 'getTaskDetail' | 'getProjectInfo' | 'getProjectWorkflows' | 'updateTaskStatus' | 'createTaskComment'>
  spawner: Pick<AgentRunSpawner, 'spawn'>
  terminals: Pick<TerminalManager, 'addExitListener'>
  /** hook 서버 port/secret 은 부팅 이후 비동기로 정해지므로 값이 아닌 thunk (ADR-v2-workspace-p1-05 (d)) */
  getHookConfig: () => { port: number; secret: string } | null
  /** 프롬프트 파일 위치(`<root>/workspace/{runId}/prompt.md`) 계산용 */
  getWorkspaceRoot: () => string
  /** 워크트리 경로가 멘션 agentRoot 내부/접두사면 거부하기 위한 기준 경로 */
  getAgentRoot: () => string
  claudeDir: ClaudeDirDeps
  now?: () => number
  newRunId?: () => string
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** `GitService.createWorktree` 의 기본 경로 계산(ADR-v2-workspace-p1-06 (c))을 그대로 복제한 예측 함수.
 * 실제 생성 *전에* agentRoot 충돌을 검사하기 위함 — 검사가 실패하면 워크트리를 만들지 않는다(부수효과 0). */
function predictWorktreePath(repoPath: string, branch: string): string {
  const repoName = basename(repoPath)
  const worktreeBase = join(dirname(repoPath), `.${repoName}-worktrees`)
  return join(worktreeBase, branch.replace(/\//g, '-'))
}

function violatesAgentRoot(agentRoot: string, candidatePath: string): boolean {
  if (isPathInside(agentRoot, candidatePath)) return true
  return normalizePathForCompare(candidatePath).startsWith(normalizePathForCompare(agentRoot))
}

function buildTabName(subject: string, taskNumber: number | undefined, taskId: string): string {
  const label = taskNumber ? `#${taskNumber}` : `#${taskId.slice(-6)}`
  return `${label} ${subject}`.slice(0, 60)
}

/**
 * 두레이 태스크 ↔ 브랜치 ↔ 워크트리 ↔ claude 세션 1회 실행(run)의 생애주기 서비스.
 * `startTask` 는 롤백하지 않는 재진입 가능한 단계 기록이다(ADR-v2-workspace-p1-06) — 실패해도
 * 사용자가 이어 쓸 수 있는 상태(워크트리 + failed run)를 남긴다.
 */
export class WorkspaceService {
  private listeners = new Set<(payload: WorkspaceRunUpdatedPayload) => void>()
  private unsubscribeExit: () => void
  private now: () => number
  private newRunId: () => string

  constructor(private deps: WorkspaceServiceDeps) {
    this.now = deps.now ?? (() => Date.now())
    this.newRunId = deps.newRunId ?? (() => randomUUID())
    this.unsubscribeExit = deps.terminals.addExitListener((payload) => this.handleTerminalExit(payload.id))
  }

  dispose(): void {
    this.unsubscribeExit()
  }

  /** `workspace:run:updated` 변경 구독. unsubscribe 함수 반환. */
  addChangeListener(cb: (payload: WorkspaceRunUpdatedPayload) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  private emitChange(workspace: TaskWorkspace, runId: string, reason: WorkspaceRunUpdatedPayload['reason']): void {
    const payload: WorkspaceRunUpdatedPayload = { workspace, runId, reason }
    for (const cb of this.listeners) {
      try {
        cb(payload)
      } catch (err) {
        console.warn('[Workspace] change listener 실패:', err)
      }
    }
  }

  private recordWarning(warnings: string[], taskId: string, runId: string | undefined, msg: string): void {
    warnings.push(msg)
    console.warn(`[Workspace] ${msg} taskId=${taskId}${runId ? ` runId=${runId}` : ''}`)
  }

  // ---- 저장소 레지스트리 / 설정 (단순 위임) ------------------------------------

  listRepos(): RepoRegistryEntry[] {
    return this.deps.store.listRepos()
  }

  addRepo(params: AddRepoParams): RepoRegistryEntry {
    const entry: RepoRegistryEntry = {
      id: makeRepoId(params.path),
      path: params.path,
      name: params.name?.trim() || basename(params.path),
      defaultBaseBranch: params.defaultBaseBranch,
      branchPrefix: params.branchPrefix
    }
    return this.deps.store.addRepo(entry)
  }

  updateRepo(id: string, patch: Partial<RepoRegistryEntry>): RepoRegistryEntry | null {
    return this.deps.store.updateRepo(id, patch)
  }

  removeRepo(id: string): void {
    this.deps.store.removeRepo(id)
  }

  getSettings(): WorkspaceSettings {
    return this.deps.store.getSettings()
  }

  setSettings(patch: Partial<WorkspaceSettings>): WorkspaceSettings {
    return this.deps.store.setSettings(patch)
  }

  setProjectRepo(projectId: string, repoId: string): void {
    this.deps.store.setProjectRepo(projectId, repoId)
  }

  listWorkspaces(): TaskWorkspace[] {
    return this.deps.store.listWorkspaces()
  }

  getWorkspace(key: WorkspaceKey): TaskWorkspace | null {
    return this.deps.store.getWorkspace(key)
  }

  // ---- hook resolver 가 쓰는 조회/기록 (ADR-v2-workspace-p1-05) -----------------

  /** cwd 가 속한 활성 run 을 찾는다 — 세그먼트 기준 최장 매칭(형제 경로 오탐 없음). 활성 run 이 없으면 null. */
  resolveRunByCwd(cwd: string): { workspace: TaskWorkspace; run: AgentRun } | null {
    let best: { workspace: TaskWorkspace; run: AgentRun } | null = null
    for (const ws of this.deps.store.listWorkspaces()) {
      if (!ws.activeRunId) continue
      const run = ws.runs.find((r) => r.runId === ws.activeRunId)
      if (!run || !isLiveRun(run.status)) continue
      if (!isPathInside(run.worktreePath, cwd)) continue
      if (!best || run.worktreePath.length > best.run.worktreePath.length) {
        best = { workspace: ws, run }
      }
    }
    return best
  }

  /** PostToolUse hook — `tool-activity` 이벤트. 전이가 없으면(null) 쓰기·push 0. */
  recordToolActivity(runId: string): void {
    const found = this.deps.store.findRunById(runId)
    if (!found) return
    const nextStatus = applyRunEvent(found.run.status, 'tool-activity')
    if (!nextStatus) return
    const updatedRun: AgentRun = { ...found.run, status: nextStatus }
    this.persistRunUpdate(found.workspace, updatedRun, 'status')
  }

  /** Stop hook — `stop` 이벤트 + claudeSessionId/lastAssistantText 갱신. terminal 상태 run 은 무시(쓰기 0). */
  recordStop(runId: string, info: { claudeSessionId?: string; lastAssistantText?: string }): void {
    const found = this.deps.store.findRunById(runId)
    if (!found) return
    const nextStatus = applyRunEvent(found.run.status, 'stop')
    if (!nextStatus) return
    const updatedRun: AgentRun = {
      ...found.run,
      status: nextStatus,
      ...(info.claudeSessionId ? { claudeSessionId: info.claudeSessionId } : {}),
      ...(info.lastAssistantText ? { lastAssistantText: info.lastAssistantText } : {})
    }
    this.persistRunUpdate(found.workspace, updatedRun, 'status')
  }

  /** run 을 workspace.runs 안에서 교체 저장 + activeRunId 정합 + push. */
  private persistRunUpdate(ws: TaskWorkspace, run: AgentRun, reason: WorkspaceRunUpdatedPayload['reason']): TaskWorkspace {
    const runs = ws.runs.map((r) => (r.runId === run.runId ? run : r))
    const activeRunId = ws.activeRunId === run.runId && !isLiveRun(run.status) ? null : ws.activeRunId
    const saved = this.deps.store.saveWorkspace({ ...ws, runs, activeRunId, branch: run.branch })
    this.emitChange(saved, run.runId, reason)
    return saved
  }

  // ---- startTask (ADR-v2-workspace-p1-06) --------------------------------------

  private resolveRepo(params: StartTaskParams): RepoRegistryEntry {
    const repos = this.deps.store.listRepos()
    let repo: RepoRegistryEntry | undefined
    if (params.repoId) {
      repo = repos.find((r) => r.id === params.repoId)
    } else {
      const mappedId = this.deps.store.getState().projectRepoMap[params.projectId]
      if (mappedId) repo = repos.find((r) => r.id === mappedId)
      if (!repo && repos.length === 1) repo = repos[0]
    }
    if (!repo) {
      throw new WorkspaceError(
        'REPO_NOT_FOUND',
        '연결된 git 저장소를 찾을 수 없습니다. 워크스페이스 설정에서 저장소를 먼저 등록해주세요.'
      )
    }
    return repo
  }

  async startTask(params: StartTaskParams): Promise<StartTaskResult> {
    const warnings: string[] = []
    const key = workspaceKey(params.projectId, params.taskId)

    // ① repo 결정
    const repo = this.resolveRepo(params)
    // ② 프로젝트↔저장소 매핑 기억(옵션)
    if (params.rememberRepoForProject) this.deps.store.setProjectRepo(params.projectId, repo.id)

    // ③ 멱등 — 활성 run 이 있으면 그대로 반환(부수효과 0)
    const existingWs = this.deps.store.getWorkspace(key)
    if (existingWs?.activeRunId) {
      const activeRun = existingWs.runs.find((r) => r.runId === existingWs.activeRunId)
      if (activeRun && isLiveRun(activeRun.status)) {
        return { workspace: existingWs, run: activeRun, reused: true, warnings: [] }
      }
    }

    // ④ 동시 실행 상한
    const settings = this.deps.store.getSettings()
    const liveCount = this.deps.store
      .listWorkspaces()
      .flatMap((w) => w.runs)
      .filter((r) => isLiveRun(r.status)).length
    if (liveCount >= settings.maxConcurrentRuns) {
      throw new WorkspaceError(
        'CONCURRENCY_LIMIT',
        `동시에 진행 가능한 작업 수(${settings.maxConcurrentRuns}개)를 초과했습니다. 기존 작업을 정리한 뒤 다시 시도해주세요.`
      )
    }

    if (!(await this.deps.git.isGitRepo(repo.path))) {
      throw new WorkspaceError('NOT_A_REPO', `등록된 경로가 git 저장소가 아닙니다: ${repo.path}`)
    }

    // ⑤ (옵션) fetch — best-effort
    if (params.fetchBeforeCreate) {
      try {
        await this.deps.git.fetchRemote(repo.path)
      } catch (err) {
        this.recordWarning(warnings, params.taskId, undefined, `원격 fetch 실패: ${errorMessage(err)}`)
      }
    }

    // ⑥ 태스크 상세
    const detail = await this.deps.tasks.getTaskDetail(params.projectId, params.taskId)
    let projectCode = detail.projectCode
    if (!projectCode) {
      try {
        projectCode = (await this.deps.tasks.getProjectInfo(params.projectId)).code
      } catch {
        projectCode = undefined
      }
    }

    // ⑦ 브랜치명
    let branch: string
    if (params.branchName) {
      if (!isSafeGitRef(params.branchName)) {
        throw new Error(`유효하지 않은 브랜치 이름입니다: ${params.branchName}`)
      }
      branch = params.branchName
    } else {
      const base = buildBranchName({
        template: settings.branchTemplate,
        projectCode,
        taskNumber: detail.number,
        taskId: params.taskId,
        subject: detail.subject,
        prefix: repo.branchPrefix
      })
      const taken = await this.collectTakenBranchNames(repo.path)
      branch = resolveBranchNameConflict(base, taken)
    }

    // ⑧ baseBranch
    const baseBranch = params.baseBranch || repo.defaultBaseBranch || settings.defaultBaseBranch || undefined

    // ⑨~⑩ 워크트리 생성 전 agentRoot 충돌 예측 검사(부수효과 0 지점)
    const agentRoot = this.deps.getAgentRoot()
    const predictedPath = predictWorktreePath(repo.path, branch)
    if (violatesAgentRoot(agentRoot, predictedPath)) {
      throw new WorkspaceError(
        'PATH_INSIDE_AGENT_ROOT',
        `워크트리 경로가 멘션 작업 폴더(${agentRoot}) 내부/근처입니다. 저장소를 다른 위치로 옮기거나 별도 저장소를 사용해주세요.`
      )
    }
    const worktree = await this.deps.git.createWorktree({ repoPath: repo.path, branch, newBranch: true, baseBranch })

    // ⑪ .claude 준비 (trust + hook settings) — best-effort
    const trustResult = this.deps.claudeDir.preApproveTrust(worktree.path)
    if (trustResult === 'failed') {
      this.recordWarning(warnings, params.taskId, undefined, 'claude trust 사전 등록에 실패했습니다.')
    }
    const hookConfig = this.deps.getHookConfig()
    try {
      this.deps.claudeDir.writeHookSettings(worktree.path, hookConfig)
    } catch (err) {
      this.recordWarning(warnings, params.taskId, undefined, `.claude hook 설정 쓰기 실패: ${errorMessage(err)}`)
    }
    if (!hookConfig) {
      this.recordWarning(warnings, params.taskId, undefined, 'hook 서버가 아직 시작되지 않아 진행 상태 갱신이 동작하지 않을 수 있습니다.')
    }

    // ⑫ info/exclude — best-effort
    try {
      await this.deps.git.addToInfoExclude(worktree.path, ['.claude/settings.local.json'])
    } catch (err) {
      this.recordWarning(warnings, params.taskId, undefined, `.git/info/exclude 갱신 실패: ${errorMessage(err)}`)
    }

    // ⑬ 프롬프트 파일(워크트리 밖)
    const runId = this.newRunId()
    const prompt = params.prompt ?? ''
    let promptPath: string | undefined
    if (prompt) {
      const promptDir = join(this.deps.getWorkspaceRoot(), 'workspace', runId)
      mkdirSync(promptDir, { recursive: true })
      promptPath = join(promptDir, 'prompt.md')
      writeFileSync(promptPath, prompt, 'utf8')
    }

    // ⑭ run 을 spawning 으로 저장
    const startedAt = this.now()
    const autoApprove = params.autoApprove ?? settings.autoApproveDefault
    let run: AgentRun = {
      runId,
      workspaceId: key,
      repoId: repo.id,
      branch,
      baseBranch: baseBranch ?? 'HEAD',
      worktreePath: worktree.path,
      status: 'spawning',
      prompt,
      promptPath,
      autoApprove,
      terminalSessionId: null,
      startedAt
    }
    const baseWs: TaskWorkspace =
      existingWs ??
      ({
        id: key,
        projectId: params.projectId,
        taskId: params.taskId,
        subject: detail.subject,
        repoId: repo.id,
        status: 'active',
        branch,
        activeRunId: null,
        runs: [],
        createdAt: startedAt,
        updatedAt: startedAt
      } satisfies TaskWorkspace)
    let workspace: TaskWorkspace = {
      ...baseWs,
      taskNumber: detail.number,
      subject: detail.subject,
      repoId: repo.id,
      status: 'active',
      branch,
      activeRunId: runId,
      runs: [...baseWs.runs, run]
    }
    workspace = this.deps.store.saveWorkspace(workspace)
    this.emitChange(workspace, runId, 'created')

    // ⑮ spawn
    try {
      const spawnResult = await this.deps.spawner.spawn({
        cwd: worktree.path,
        tabName: buildTabName(detail.subject, detail.number, params.taskId),
        prompt,
        promptPath,
        autoApprove
      })
      const nextStatus = applyRunEvent(run.status, 'spawn-succeeded') ?? 'running'
      run = { ...run, status: nextStatus, terminalSessionId: spawnResult.terminalSessionId }
    } catch (err) {
      const nextStatus = applyRunEvent(run.status, 'spawn-failed') ?? 'failed'
      run = { ...run, status: nextStatus, error: errorMessage(err) }
      this.recordWarning(warnings, params.taskId, runId, `claude 자동 기동 실패: ${errorMessage(err)}`)
    }
    workspace = this.persistRunUpdate(workspace, run, 'session')

    // ⑯ (옵션) 두레이 상태 전환 — best-effort, 기본 ON
    const transitionDooray = params.transitionDooray ?? settings.transitionDoorayDefault
    if (transitionDooray) {
      try {
        const workflows = await this.deps.tasks.getProjectWorkflows(params.projectId)
        const target = workflows.find((w) => w.class === 'working')
        if (target) {
          await this.deps.tasks.updateTaskStatus({ projectId: params.projectId, postId: params.taskId, status: target.id })
        } else {
          this.recordWarning(warnings, params.taskId, runId, '두레이 워크플로우 중 "진행중" 단계를 찾지 못해 상태를 전환하지 못했습니다.')
        }
      } catch (err) {
        this.recordWarning(warnings, params.taskId, runId, `두레이 상태 전환 실패: ${errorMessage(err)}`)
      }
    }

    // ⑰ (옵션) 댓글 — best-effort, 기본 OFF
    const commentBranch = params.commentBranch ?? settings.commentBranchDefault
    if (commentBranch) {
      try {
        await this.deps.tasks.createTaskComment({
          projectId: params.projectId,
          postId: params.taskId,
          content: `[Clauday] \`${branch}\` 에서 작업을 시작했습니다.`
        })
      } catch (err) {
        this.recordWarning(warnings, params.taskId, runId, `두레이 댓글 작성 실패: ${errorMessage(err)}`)
      }
    }

    return { workspace, run, reused: false, warnings }
  }

  private async collectTakenBranchNames(repoPath: string): Promise<string[]> {
    const [branches, worktrees] = await Promise.all([
      this.deps.git.listBranches(repoPath).catch(() => []),
      this.deps.git.listWorktrees(repoPath).catch(() => [])
    ])
    return [...branches.filter((b) => !b.isRemote).map((b) => b.name), ...worktrees.map((w) => w.branch)]
  }

  // ---- 생애주기: resume / adopt / cleanup / reconcile (ADR-v2-workspace-p1-01/06) ----

  async resumeRun(params: ResumeRunParams): Promise<ResumeRunResult> {
    const found = this.deps.store.findRunById(params.runId)
    if (!found) throw new WorkspaceError('RUN_NOT_FOUND', `run 을 찾을 수 없습니다: ${params.runId}`)
    let { workspace, run } = found
    const warnings: string[] = []

    if (!existsSync(run.worktreePath)) {
      const discardedStatus = applyRunEvent(run.status, 'discard')
      if (discardedStatus) {
        const discardedRun: AgentRun = { ...run, status: discardedStatus, terminalSessionId: null, endedAt: this.now() }
        workspace = this.persistRunUpdate(workspace, discardedRun, 'removed')
      }
      throw new WorkspaceError('RUN_NOT_FOUND', `워크트리가 더 이상 존재하지 않습니다: ${run.worktreePath}`)
    }

    // port/secret 은 부팅마다 바뀌므로 반드시 재작성
    const hookConfig = this.deps.getHookConfig()
    try {
      this.deps.claudeDir.writeHookSettings(run.worktreePath, hookConfig)
    } catch (err) {
      this.recordWarning(warnings, workspace.taskId, run.runId, `.claude hook 설정 갱신 실패: ${errorMessage(err)}`)
    }
    if (!hookConfig) {
      this.recordWarning(warnings, workspace.taskId, run.runId, 'hook 서버가 아직 시작되지 않아 진행 상태 갱신이 동작하지 않을 수 있습니다.')
    }
    this.deps.claudeDir.preApproveTrust(run.worktreePath)

    const spawnResult = await this.deps.spawner.spawn({
      cwd: run.worktreePath,
      tabName: buildTabName(workspace.subject, workspace.taskNumber, workspace.taskId),
      prompt: params.prompt ?? '',
      autoApprove: run.autoApprove,
      resumeSessionId: run.claudeSessionId
    })

    const nextStatus = applyRunEvent(run.status, 'resume') ?? 'running'
    const updatedRun: AgentRun = { ...run, status: nextStatus, terminalSessionId: spawnResult.terminalSessionId }
    workspace = this.persistRunUpdate(workspace, updatedRun, 'session')
    return { workspace, run: updatedRun, warnings }
  }

  async adoptRun(runId: string): Promise<AdoptRunResult> {
    const found = this.deps.store.findRunById(runId)
    if (!found) throw new WorkspaceError('RUN_NOT_FOUND', `run 을 찾을 수 없습니다: ${runId}`)
    const { workspace, run } = found
    const nextStatus = applyRunEvent(run.status, 'adopt') ?? run.status
    const updatedRun: AgentRun = { ...run, status: nextStatus, terminalSessionId: null, endedAt: run.endedAt ?? this.now() }
    const runs = workspace.runs.map((r) => (r.runId === runId ? updatedRun : r))
    const nextWs: TaskWorkspace = {
      ...workspace,
      status: 'adopted',
      runs,
      activeRunId: workspace.activeRunId === runId ? null : workspace.activeRunId
    }
    const saved = this.deps.store.saveWorkspace(nextWs)
    this.emitChange(saved, runId, 'status')
    return { workspace: saved, run: updatedRun }
  }

  async cleanupRun(params: CleanupRunParams): Promise<CleanupRunResult> {
    const found = this.deps.store.findRunById(params.runId)
    if (!found) throw new WorkspaceError('RUN_NOT_FOUND', `run 을 찾을 수 없습니다: ${params.runId}`)
    const { workspace, run } = found
    const warnings: string[] = []

    const status = await this.deps.git.getWorktreeStatus(run.worktreePath)
    const dirty = status.modifiedFiles > 0 || status.untrackedFiles > 0
    if (dirty && !params.force) {
      throw new WorkspaceError(
        'DIRTY_WORKTREE',
        '워크트리에 커밋되지 않은 변경사항이 있습니다. 정말 정리하려면 강제 옵션으로 다시 시도해주세요.'
      )
    }

    const repo = this.deps.store.listRepos().find((r) => r.id === run.repoId)
    if (!repo) {
      this.recordWarning(warnings, workspace.taskId, run.runId, `repoId=${run.repoId} 를 찾을 수 없어 워크트리/브랜치 정리를 건너뜁니다.`)
    } else {
      try {
        await this.deps.git.removeWorktree({ repoPath: repo.path, worktreePath: run.worktreePath, force: params.force })
      } catch (err) {
        this.recordWarning(warnings, workspace.taskId, run.runId, `워크트리 제거 실패: ${errorMessage(err)}`)
      }

      if (params.deleteBranch) {
        if (run.status === 'adopted') {
          this.recordWarning(warnings, workspace.taskId, run.runId, '채택(adopted)된 run 의 브랜치는 삭제하지 않습니다.')
        } else {
          try {
            await this.deps.git.deleteBranch(repo.path, run.branch, { force: true })
          } catch (err) {
            this.recordWarning(warnings, workspace.taskId, run.runId, `브랜치 삭제 실패: ${errorMessage(err)}`)
          }
        }
      }
    }

    if (run.promptPath) {
      try {
        rmSync(dirname(run.promptPath), { recursive: true, force: true })
      } catch (err) {
        this.recordWarning(warnings, workspace.taskId, run.runId, `프롬프트 파일 정리 실패: ${errorMessage(err)}`)
      }
    }

    const nextStatus = run.status === 'adopted' ? 'adopted' : (applyRunEvent(run.status, 'discard') ?? 'discarded')
    const updatedRun: AgentRun = { ...run, status: nextStatus, terminalSessionId: null, endedAt: run.endedAt ?? this.now() }
    const runs = workspace.runs.map((r) => (r.runId === run.runId ? updatedRun : r))
    const stillLive = runs.some((r) => isLiveRun(r.status))
    const nextWsStatus: TaskWorkspace['status'] = workspace.status === 'adopted' ? 'adopted' : stillLive ? workspace.status : 'archived'
    const nextWs: TaskWorkspace = {
      ...workspace,
      runs,
      activeRunId: workspace.activeRunId === run.runId ? null : workspace.activeRunId,
      status: nextWsStatus
    }
    const saved = this.deps.store.saveWorkspace(nextWs)
    this.emitChange(saved, run.runId, 'removed')
    return { workspace: saved, warnings }
  }

  /** 부팅 시 휘발 상태 정리 — 모든 run 의 terminalSessionId 를 null 로 하고, 워크트리가 사라진 live run 은 discard,
   * 남아있는 live run 은 claudeSessionId 유무로 stop(→awaiting-input)/spawn-failed(→failed) 번역한다. */
  async reconcile(): Promise<ReconcileResult> {
    let detached = 0
    let discarded = 0
    for (const ws of this.deps.store.listWorkspaces()) {
      let changed = false
      const runs: AgentRun[] = ws.runs.map((run) => {
        let nextRun = run
        if (run.terminalSessionId !== null) {
          nextRun = { ...nextRun, terminalSessionId: null }
          detached++
          changed = true
        }
        if (isLiveRun(run.status)) {
          if (!existsSync(run.worktreePath)) {
            const s = applyRunEvent(nextRun.status, 'discard')
            if (s) {
              nextRun = { ...nextRun, status: s, endedAt: this.now() }
              discarded++
              changed = true
            }
          } else {
            const event: RunEvent = run.claudeSessionId ? 'stop' : 'spawn-failed'
            const s = applyRunEvent(nextRun.status, event)
            if (s) {
              nextRun = { ...nextRun, status: s }
              changed = true
            }
          }
        }
        return nextRun
      })
      if (!changed) continue
      const activeRunId = ws.activeRunId && runs.some((r) => r.runId === ws.activeRunId && isLiveRun(r.status)) ? ws.activeRunId : null
      this.deps.store.saveWorkspace({ ...ws, runs, activeRunId })
    }
    console.log(`[Workspace] reconcile detached=${detached} discarded=${discarded}`)
    return { detached, discarded }
  }

  /** 사용자가 터미널을 직접 종료했을 때(B-1 `addExitListener`) — 해당 run 을 detach 처리. */
  private handleTerminalExit(terminalSessionId: string): void {
    for (const ws of this.deps.store.listWorkspaces()) {
      const run = ws.runs.find((r) => r.terminalSessionId === terminalSessionId)
      if (!run) continue
      let nextRun: AgentRun = { ...run, terminalSessionId: null }
      if (isLiveRun(run.status)) {
        const event: RunEvent = run.claudeSessionId ? 'stop' : 'spawn-failed'
        const s = applyRunEvent(run.status, event)
        if (s) nextRun = { ...nextRun, status: s }
      }
      this.persistRunUpdate(ws, nextRun, 'session')
      return
    }
  }
}
