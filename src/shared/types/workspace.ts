/**
 * 워크스페이스 도메인 타입. 타입 선언 전용 — 런타임 값(상수/함수)은 `src/shared/workspace/` 에 둔다.
 * ADR-v2-workspace-p1-01/02/03/06 참조.
 */

/** `'${projectId}:${taskId}'` 합성키. 조립/분해는 `src/shared/workspace/workspaceKey.ts` 로만 한다. */
export type WorkspaceKey = string

/** 사용자가 등록한 git 저장소. */
export interface RepoRegistryEntry {
  id: string
  path: string
  name: string
  defaultBaseBranch?: string
  /** 브랜치 템플릿의 `{prefix}` 토큰에 노출되는 저장소별 접두사 */
  branchPrefix?: string
}

/**
 * agent run 의 생애주기 상태.
 * live: spawning|running|awaiting-input, live 아님(재개 가능): failed, terminal: adopted|discarded
 */
export type AgentRunStatus = 'spawning' | 'running' | 'awaiting-input' | 'failed' | 'adopted' | 'discarded'

/** 두레이 태스크 하나에서 파생된 브랜치·워크트리·claude 세션 1회 실행. */
export interface AgentRun {
  runId: string
  workspaceId: WorkspaceKey
  repoId: string
  branch: string
  baseBranch: string
  worktreePath: string
  status: AgentRunStatus
  /** 자동 타이핑한 프롬프트 원본. 빈 문자열이면 "터미널에서 직접 지시" 모드 */
  prompt: string
  /** 프롬프트 원본 파일 경로(워크트리 밖). 빈 프롬프트면 없음 */
  promptPath?: string
  autoApprove: boolean
  /** 현재 앱 프로세스에서만 유효한 PTY id — 부팅 시 reconcile 이 null 로 만든다 (휘발) */
  terminalSessionId: string | null
  /** Stop hook 의 transcript_path 에서 추출. `claude --resume` 용으로 영속 */
  claudeSessionId?: string
  /** Stop 시점의 마지막 assistant 텍스트 (카드 미리보기용) */
  lastAssistantText?: string
  startedAt: number
  endedAt?: number
  /** 사용자에게 보여줄 실패 사유 */
  error?: string
}

/** 두레이 태스크 하나에 대응하는 워크스페이스. 살아 있는 run 은 최대 1개(`activeRunId`). */
export interface TaskWorkspace {
  id: WorkspaceKey
  projectId: string
  taskId: string
  taskNumber?: number
  subject: string
  repoId: string
  status: 'active' | 'adopted' | 'archived'
  /** 최근 run 의 브랜치 — 좌측 목록 배지용 캐시 */
  branch: string
  /** 살아 있는 run 은 최대 1개. 없으면 null (fan-out 제거) */
  activeRunId: string | null
  /** 이력 — 재시도/resume. 최신이 뒤 */
  runs: AgentRun[]
  createdAt: number
  updatedAt: number
}

/** 터미널 태스크 드로어(C-3.5) — 태스크 ↔ claude 세션 매핑. */
/**
 * 업무 하나가 특정 폴더에서 쓰던 claude 세션.
 *
 * 키가 **(업무, 폴더) 쌍**인 이유: 한 업무가 여러 저장소에 걸치는 일이 흔하다.
 * 예를 들어 한 기능을 서버(2NEON)와 AI(neon-ai) 양쪽에서 동시에 고친다.
 * 업무 하나에 세션 하나만 매달면 폴더를 옮길 때마다 이전 대화가 끊긴다.
 */
export interface TaskSessionLink {
  cwd: string
  claudeSessionId: string
  lastUsedAt: number
  /** 표시용 저장소 이름 — 저장소 등록이 풀려도 어디였는지는 남아야 한다 */
  repoName?: string
}

/** 태스크를 터미널 pane 에 드롭했을 때 열 대상 — `cd` 할 폴더와 이어갈 세션(있으면). */
export interface TaskDropTarget {
  cwd: string
  repoName: string
  claudeSessionId?: string
}

/** [작업 시작] 모달에서 마지막으로 사용한 옵션 — 다음 원클릭 시작에 재사용된다. */
export interface WorkspaceLastStartOptions {
  repoId?: string
  autoApprove?: boolean
  transitionDooray?: boolean
  commentBranch?: boolean
  fetchBeforeCreate?: boolean
}

/** 워크스페이스 기능 전역 설정. 기본값은 `src/main/workspace/workspaceState.ts` 의 `DEFAULT_WORKSPACE_SETTINGS`. */
/**
 * 업무를 터미널에 놓았을 때 어디서 시작할지.
 *
 * 기본이 `current` 인 이유: 업무 하나가 저장소 하나에 대응한다는 가정은 현실과 다르다.
 * 한 업무를 서버·AI 양쪽에서 고치는 일이 흔해서, **사용자가 터미널을 원하는 폴더로 옮겨두고
 * 거기에 놓는 것**이 실제 흐름이다. 미리 지정한 폴더로 `cd` 해버리면 그 흐름을 깬다.
 */
export type TaskDropStartIn = 'current' | 'mapped'

/** 두레이 프로젝트 하나에만 적용할 값. 비어 있는 항목은 전역 기본을 따른다. */
export interface ProjectOverride {
  /** 이 프로젝트가 쓰는 저장소들 — 한 프로젝트가 여러 저장소에 걸친다 */
  repoIds?: string[]
  branchTemplate?: string
  promptTemplate?: string
}

export interface WorkspaceSettings {
  branchTemplate: string
  defaultBaseBranch?: string
  maxConcurrentRuns: number
  autoApproveDefault: boolean
  transitionDoorayDefault: boolean
  commentBranchDefault: boolean
  lastStart?: WorkspaceLastStartOptions

  /**
   * 프로젝트별 덮어쓰기. 저장소 10여 개 × 두레이 프로젝트 N 개가 보통이라
   * 전역 값 하나로는 맞출 수 없다 — 값이 없는 항목만 전역 기본을 쓴다.
   */
  projectOverrides: Record<string, ProjectOverride>

  /** 업무 드롭 — 시작 폴더 */
  taskDropStartIn: TaskDropStartIn
  /** 그 폴더에 이 업무의 세션이 있으면 `claude --resume` 으로 이어간다 */
  taskDropResume: boolean
  /**
   * claude 에 보낼 첫 지시 템플릿. **비우면 지시를 보내지 않고** claude 만 띄운다.
   * 치환자: `{title}` `{number}` `{project}` `{ref}` `{url}` `{body}`
   */
  taskDropPromptTemplate: string
  /** `--dangerously-skip-permissions` 로 실행 — 도구 승인 프롬프트를 건너뛴다 */
  taskDropSkipPermissions: boolean
}

/** `workspace:start-task` 요청 파라미터. 모달 필드(`docs/mockups/v2/start-work-modal.html`)의 근거. */
export interface StartTaskParams {
  projectId: string
  taskId: string
  repoId?: string
  baseBranch?: string
  branchName?: string
  prompt?: string
  autoApprove?: boolean
  transitionDooray?: boolean
  commentBranch?: boolean
  fetchBeforeCreate?: boolean
  rememberRepoForProject?: boolean
}

/** `startTask` 의 결과. 실패하지 않는 best-effort 단계의 실패는 `warnings` 로 반환된다. */
export interface StartTaskResult {
  workspace: TaskWorkspace
  run: AgentRun
  /** 이미 활성 run 이 있어 새로 만들지 않았다 */
  reused: boolean
  warnings: string[]
}

export interface ResumeRunParams {
  runId: string
  prompt?: string
}

export interface CleanupRunParams {
  runId: string
  force?: boolean
  deleteBranch?: boolean
}

/** `workspace:run:updated` push 페이로드. 워크스페이스 전체를 실어 렌더러가 병합 로직 없이 교체한다. */
export interface WorkspaceRunUpdatedPayload {
  workspace: TaskWorkspace
  runId: string
  reason: 'created' | 'status' | 'session' | 'removed'
}

/** `workspace:repos:add` 요청. `id` 는 경로 기반으로 결정적으로 계산되므로 입력에서 받지 않는다. */
export interface AddRepoParams {
  path: string
  name?: string
  defaultBaseBranch?: string
  branchPrefix?: string
}

export interface ResumeRunResult {
  workspace: TaskWorkspace
  run: AgentRun
  warnings: string[]
}

export interface AdoptRunResult {
  workspace: TaskWorkspace
  run: AgentRun
}

export interface CleanupRunResult {
  workspace: TaskWorkspace
  warnings: string[]
}

export interface ReconcileResult {
  /** terminalSessionId 가 있던 run 중 이번 reconcile 로 detach(null 화)된 개수 */
  detached: number
  /** 워크트리가 사라져 discarded 로 정리된 run 개수 */
  discarded: number
}
