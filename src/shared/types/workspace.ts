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

/**
 * 터미널 태스크 드로어(C-3.5)용 스키마 선반영. 이 트랙(C-1/C-2)은 읽기/쓰기 서비스를 만들지 않는다.
 */
export interface TaskSessionLink {
  cwd: string
  claudeSessionId: string
  lastUsedAt: number
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
export interface WorkspaceSettings {
  branchTemplate: string
  defaultBaseBranch?: string
  maxConcurrentRuns: number
  autoApproveDefault: boolean
  transitionDoorayDefault: boolean
  commentBranchDefault: boolean
  lastStart?: WorkspaceLastStartOptions
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
