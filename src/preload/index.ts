import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { release } from 'os'

// IpcRenderer 리스너 한도 상향 (기본 10, 다중 터미널 탭 + 각종 IPC 구독 때문에 넉넉히)
ipcRenderer.setMaxListeners(100)

// 터미널 출력 구독: 단일 IPC 리스너를 공유해서 핸들러 수만큼 이벤트 리스너가 누적되지 않게 함
type TerminalOutputPayload = { id: string; data: string }
const terminalOutputHandlers = new Set<(payload: TerminalOutputPayload) => void>()
let terminalOutputSubscribed = false
function subscribeTerminalOutput(cb: (payload: TerminalOutputPayload) => void): () => void {
  terminalOutputHandlers.add(cb)
  if (!terminalOutputSubscribed) {
    terminalOutputSubscribed = true
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_OUTPUT, (_: IpcRendererEvent, payload: TerminalOutputPayload) => {
      for (const h of terminalOutputHandlers) {
        try { h(payload) } catch { /* ignore */ }
      }
    })
  }
  return () => { terminalOutputHandlers.delete(cb) }
}
import { IPC_CHANNELS } from '../shared/types/ipc'
// 터미널 종료 구독: TERMINAL_OUTPUT 과 동일한 단일 리스너 공유 패턴 (ADR-v2-terminal-p1-01)
const terminalExitHandlers = new Set<(payload: TerminalExitPayload) => void>()
let terminalExitSubscribed = false
function subscribeTerminalExit(cb: (payload: TerminalExitPayload) => void): () => void {
  terminalExitHandlers.add(cb)
  if (!terminalExitSubscribed) {
    terminalExitSubscribed = true
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_EXIT, (_: IpcRendererEvent, payload: TerminalExitPayload) => {
      for (const h of terminalExitHandlers) {
        try { h(payload) } catch { /* ignore */ }
      }
    })
  }
  return () => { terminalExitHandlers.delete(cb) }
}

// v2.0 M-A: main → renderer flush 요청 구독 — TERMINAL_OUTPUT/TERMINAL_EXIT 와 동일한 단일 리스너 공유 패턴.
// payload 없음(push 전용, ADR-v2-terminal-p2-03 §2).
const terminalRequestStateHandlers = new Set<() => void>()
let terminalRequestStateSubscribed = false
function subscribeTerminalRequestState(cb: () => void): () => void {
  terminalRequestStateHandlers.add(cb)
  if (!terminalRequestStateSubscribed) {
    terminalRequestStateSubscribed = true
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_REQUEST_STATE, () => {
      for (const h of terminalRequestStateHandlers) {
        try { h() } catch { /* ignore */ }
      }
    })
  }
  return () => { terminalRequestStateHandlers.delete(cb) }
}

// CalDAV 데이터 변경 알림 (sync 결과 → main → 여기 → renderer 구독자)
// #7 OS 알림 클릭 → renderer 가 subscribe 한 콜백으로 라우팅 (contextIsolation 이라 dispatchEvent 불가)
const gotoAiRecommendHandlers = new Set<() => void>()
ipcRenderer.on('goto-ai-recommend', () => {
  for (const h of gotoAiRecommendHandlers) {
    try { h() } catch { /* ignore */ }
  }
})
function subscribeGotoAiRecommend(cb: () => void): () => void {
  gotoAiRecommendHandlers.add(cb)
  return () => { gotoAiRecommendHandlers.delete(cb) }
}

const caldavUpdatedHandlers = new Set<() => void>()
ipcRenderer.on('caldav-updated', () => {
  console.log('[preload] caldav-updated received, handlers:', caldavUpdatedHandlers.size)
  for (const h of caldavUpdatedHandlers) {
    try { h() } catch { /* ignore */ }
  }
})
function subscribeCaldavUpdated(cb: () => void): () => void {
  caldavUpdatedHandlers.add(cb)
  return () => { caldavUpdatedHandlers.delete(cb) }
}

// CalDAV 동기화 진행률 알림
type SyncProgressPayload =
  | { calendarUrl: string; calendarName: string; current: number; total: number; objectCount: number }
  | { stage: 'start' | 'complete' | 'error'; message?: string }
const caldavSyncHandlers = new Set<(p: SyncProgressPayload) => void>()
ipcRenderer.on('caldav-sync-progress', (_: IpcRendererEvent, payload: SyncProgressPayload) => {
  for (const h of caldavSyncHandlers) {
    try { h(payload) } catch { /* ignore */ }
  }
})
function subscribeCaldavSyncProgress(cb: (p: SyncProgressPayload) => void): () => void {
  caldavSyncHandlers.add(cb)
  return () => { caldavSyncHandlers.delete(cb) }
}
import type { McpServerConfig } from '../shared/types/mcp'
import type {
  RawBundleSummary,
  HarnessModel,
  DryRunResult,
  DiscoveredHarness,
  CachedHarnessEntry
} from '../shared/types/harness'
import type {
  HarnessDraft,
  DraftDiffSummary,
  AIEditProposal,
  BackupEntry,
  AgentSourceMap
} from '../shared/types/harness-edit'
import type { Skill, SkillSaveRequest, SkillDeleteManyResult } from '../shared/types/skills'
import type { UsageQueryParams, UsageSummary } from '../shared/types/usage'
import type {
  DoorayProject,
  DoorayTask,
  DoorayTaskDetail,
  DoorayTaskUpdateParams,
  DoorayWikiPage,
  DoorayWikiUpdateParams,
  DoorayCalendarEvent,
  DoorayCalendarQueryParams,
  DoorayWorkflow
} from '../shared/types/dooray'
import type {
  CalDAVCalendar,
  CalDAVCredentialStatus,
  CalDAVEvent,
  CalDAVEventCreate,
  CalDAVEventQuery,
  CalDAVSaveCredentialsInput,
  CalDAVTestResult
} from '../shared/types/caldav'
import type {
  UnifiedCalendar,
  UnifiedEvent,
  UnifiedEventCreate,
  UnifiedEventDateTimeUpdate,
  UnifiedEventUpdate,
  UnifiedEventQuery,
  LocalCalendar,
  LocalCalendarCreate,
  LocalCalendarUpdate
} from '../shared/types/calendar'
import type { AIBriefing, AIReport, AIProgressEvent, AIModelConfig, AIModelName } from '../shared/types/ai'
import type {
  TerminalSession,
  TerminalCreateOptions,
  TerminalResizeOptions,
  TerminalExitPayload,
  TerminalWorkspaceSnapshotV2,
  TerminalSaveStateResult,
  TerminalResolvePathRequest,
  TerminalResolvedPath
} from '../shared/types/terminal'
import type { GitHubStatus } from '../shared/types/github'
import type {
  GitWorktree,
  GitWorktreeUsage,
  GitWorktreeStatus,
  GitBranch,
  GitDiffResult,
  GitWorktreeCreateParams,
  GitWorktreeRemoveParams,
  GitFileCompare
} from '../shared/types/git'
import type { GitStatusResult } from '../shared/git/statusTypes'
import type { GitHistoryOptions, GitHistoryResult } from '../shared/git/historyTypes'
import type {
  GitAuthorInfo,
  GitBranchDiff,
  GitCommitDetail,
  GitCommitParams,
  GitCreateBranchParams,
  GitFileDiffContent,
  GitFileDiffParams,
  GitPullParams,
  GitPushParams,
  GitRemoteInfo,
  GitRemoteOpResult,
  GitStashEntry
} from '../shared/git/scmTypes'
import type {
  RepoRegistryEntry,
  AddRepoParams,
  WorkspaceSettings,
  TaskWorkspace,
  StartTaskParams,
  StartTaskResult,
  ResumeRunParams,
  ResumeRunResult,
  AdoptRunResult,
  CleanupRunParams,
  CleanupRunResult,
  ReconcileResult,
  TaskDropTarget,
  TaskSessionLink,
  EnsureTaskWorktreeParams,
  TaskWorktreeInfo,
  WorkspaceRunUpdatedPayload
} from '../shared/types/workspace'

const api = {
  // MCP
  mcp: {
    list: (): Promise<Record<string, McpServerConfig>> =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_LIST),
    add: (name: string, config: McpServerConfig): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_ADD, { name, config }),
    update: (name: string, config: McpServerConfig): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_UPDATE, { name, config }),
    delete: (name: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MCP_DELETE, name)
  },

  // Skills
  skills: {
    list: (): Promise<Skill[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_LIST),
    read: (filename: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_READ, filename),
    save: (req: SkillSaveRequest): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_SAVE, req),
    delete: (filename: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_DELETE, filename),
    deleteMany: (filenames: string[]): Promise<SkillDeleteManyResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_DELETE_MANY, filenames),
    importFromFiles: (): Promise<{ imported: number; cancelled: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_IMPORT),
    exportToFolder: (filenames: string[]): Promise<{ exported: number; cancelled: boolean; folder?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_EXPORT, filenames)
  },

  // Shared Skills (Dooray 위키 하위 페이지 기반 공유소)
  sharedSkills: {
    list: (): Promise<import('../shared/types/shared-skills').SharedSkill[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHARED_SKILLS_LIST),
    get: (postId: string): Promise<import('../shared/types/shared-skills').SharedSkill> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHARED_SKILLS_GET, postId),
    upload: (req: import('../shared/types/shared-skills').SharedSkillUploadRequest): Promise<{ postId: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHARED_SKILLS_UPLOAD, req),
    download: (postId: string): Promise<{ filename: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHARED_SKILLS_DOWNLOAD, postId),
    delete: (postId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHARED_SKILLS_DELETE, postId)
  },

  // Usage
  usage: {
    query: (params: UsageQueryParams): Promise<UsageSummary> =>
      ipcRenderer.invoke(IPC_CHANNELS.USAGE_QUERY, params)
  },

  // Dooray
  dooray: {
    setToken: (token: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TOKEN_SET, token),
    getToken: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TOKEN_GET),
    deleteToken: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TOKEN_DELETE),
    validateToken: (): Promise<{ valid: boolean; name?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TOKEN_VALIDATE),
    /** 내 organizationMemberId — 작성자 본인 검증용 */
    myMemberId: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.DOORAY_MY_MEMBER_ID),
    projects: {
      list: (): Promise<DoorayProject[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_PROJECTS_LIST),
      info: (projectId: string): Promise<DoorayProject> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_PROJECT_INFO, projectId)
    },
    /** 파일/이미지를 data URL로 가져오기 (인증 필요한 리소스용) */
    fetchFile: (
      path: string,
      context?: { projectId?: string; postId?: string; wikiId?: string; pageId?: string }
    ): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.DOORAY_FILE_FETCH, { path, context }),
    tasks: {
      list: (projectIds?: string[], force?: boolean): Promise<DoorayTask[]> =>
        ipcRenderer.invoke(
          IPC_CHANNELS.DOORAY_TASKS_LIST,
          force ? { projectIds, force: true } : projectIds
        ),
      detail: (projectId: string, taskId: string): Promise<DoorayTaskDetail> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_DETAIL, { projectId, taskId }),
      update: (params: DoorayTaskUpdateParams): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASKS_UPDATE, params),
      comments: (projectId: string, taskId: string): Promise<import('../shared/types/dooray').DoorayTaskComment[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_COMMENTS, { projectId, taskId }),
      /** 프로젝트별 태스크 점진 로딩 이벤트 수신 */
      onPartial: (callback: (payload: { projectId: string; tasks: DoorayTask[]; done: boolean }) => void): (() => void) => {
        const handler = (_: IpcRendererEvent, payload: { projectId: string; tasks: DoorayTask[]; done: boolean }): void =>
          callback(payload)
        ipcRenderer.on(IPC_CHANNELS.DOORAY_TASKS_PARTIAL, handler)
        return () => ipcRenderer.removeListener(IPC_CHANNELS.DOORAY_TASKS_PARTIAL, handler)
      },
      /** 태스크 생성 (커뮤니티 글쓰기). templateId 전달 시 두레이가 해당 템플릿 lineage 로 글을 기록. */
      create: (params: { projectId: string; subject: string; body: string; assigneeIds?: string[]; tagIds?: string[]; templateId?: string }): Promise<{ id: string }> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_CREATE, params),
      /** 프로젝트 태그 목록 (빠른 태스크 생성 시 태그 선택용) */
      tags: (projectId: string): Promise<Array<{ id: string; name: string; color: string }>> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_PROJECT_TAGS_LIST, projectId),
      /** 프로젝트 태스크 템플릿 목록 */
      templates: (projectId: string): Promise<Array<{ id: string; name: string }>> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_TEMPLATES_LIST, projectId),
      /** 프로젝트 태스크 템플릿 상세 (제목/본문) */
      templateDetail: (projectId: string, templateId: string): Promise<{ id: string; name: string; subject: string; body: string } | null> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_TEMPLATE_DETAIL, { projectId, templateId }),
      /** 태스크 댓글 생성 */
      createComment: (params: { projectId: string; postId: string; content: string }): Promise<{ id: string }> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_COMMENT_CREATE, params),
      /** 파일 업로드 (이미지 등) */
      uploadFile: (params: { projectId: string; postId: string; filename: string; mime: string; data: ArrayBuffer }): Promise<{ id: string }> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_UPLOAD_FILE, params),
      /** 태스크 본문 업데이트 */
      updateBody: (params: { projectId: string; postId: string; subject: string; body: string; mimeType?: string }): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_UPDATE_BODY, params),
      /** 댓글 본문 수정 */
      updateComment: (params: { projectId: string; postId: string; logId: string; content: string }): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_COMMENT_UPDATE, params),
      /** 태스크(커뮤니티 글) 삭제 — 본인 글만 */
      delete: (params: { projectId: string; postId: string }): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_DELETE, params),
      /** 댓글 삭제 — 본인 댓글만 */
      deleteComment: (params: { projectId: string; postId: string; logId: string }): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_COMMENT_DELETE, params)
    },
    wiki: {
      domains: (): Promise<Array<{ id: string; name: string; type: string }>> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_WIKI_DOMAINS),
      list: (projectId: string): Promise<DoorayWikiPage[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_WIKI_LIST, projectId),
      children: (wikiId: string, parentPageId: string): Promise<DoorayWikiPage[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_WIKI_CHILDREN, { wikiId, parentPageId }),
      get: (projectId: string, pageId: string): Promise<DoorayWikiPage> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_WIKI_GET, { projectId, pageId }),
      update: (params: DoorayWikiUpdateParams): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_WIKI_UPDATE, params),
      /** 나만의 위키 저장소 — 등록한 위키의 root 하위(level 2)에 컨테이너 생성. parentPageIdHint 가 있으면 자동 탐색 우회. */
      storageList: (wikiId: string, kind: 'skills' | 'mcps', parentPageIdHint?: string): Promise<Array<{ pageId: string; name: string; content: string; updatedAt: number }>> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_WIKI_STORAGE_LIST, { wikiId, kind, parentPageIdHint }),
      storageGet: (wikiId: string, pageId: string): Promise<{ name: string; content: string }> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_WIKI_STORAGE_GET, { wikiId, pageId }),
      storageUpload: (params: { wikiId: string; kind: 'skills' | 'mcps'; name: string; content: string; parentPageIdHint?: string }): Promise<{ pageId: string; updated: boolean }> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_WIKI_STORAGE_UPLOAD, params),
      storageSoftDelete: (wikiId: string, pageId: string): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_WIKI_STORAGE_SOFT_DELETE, { wikiId, pageId }),
      /** 위키 URL 또는 wikiId → wikiId + wikiName + (URL 에 있으면) parentPageId */
      storageResolve: (input: string): Promise<{ wikiId: string; wikiName: string; parentPageId?: string }> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_WIKI_STORAGE_RESOLVE, input)
    },
    calendar: {
      list: (): Promise<Array<{ id: string; name: string; type: string }>> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_CALENDAR_LIST),
      events: (params: DoorayCalendarQueryParams): Promise<DoorayCalendarEvent[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_CALENDAR_EVENTS, params)
    },
    /** v2.0 C-2: 프로젝트 워크플로우(상태) 목록 — startTask 의 두레이 상태 전환 대상 선택에 사용 */
    projectWorkflows: (projectId: string): Promise<DoorayWorkflow[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.DOORAY_PROJECT_WORKFLOWS, projectId)
  },

  // CalDAV (v1.5)
  caldav: {
    testConnect: (input: CalDAVSaveCredentialsInput): Promise<CalDAVTestResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALDAV_TEST_CONNECT, input),
    saveCredentials: (input: CalDAVSaveCredentialsInput): Promise<{ ok: true }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALDAV_SAVE_CREDENTIALS, input),
    status: (): Promise<CalDAVCredentialStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALDAV_STATUS),
    disconnect: (): Promise<{ ok: true }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALDAV_DISCONNECT),
    listCalendars: (): Promise<CalDAVCalendar[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALDAV_LIST_CALENDARS),
    listEvents: (query: CalDAVEventQuery): Promise<CalDAVEvent[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALDAV_LIST_EVENTS, query),
    createEvent: (input: CalDAVEventCreate): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALDAV_CREATE_EVENT, input),
    deleteEvent: (p: { url: string; etag?: string }): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALDAV_DELETE_EVENT, p),
    /** 전체 동기화 — 초기 연결 시 호출. 진행률은 onSyncProgress 로 구독 */
    fullSync: (): Promise<{ totalObjects: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALDAV_FULL_SYNC),
    /** 변경분만 동기화 — 수동 새로고침에 사용 */
    incrementalSync: (): Promise<{ anyChange: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALDAV_INCREMENTAL_SYNC),
    /** CalDAV 데이터 변경(sync 결과) 시 호출됨. cleanup 함수 반환 */
    onUpdated: (cb: () => void): (() => void) => subscribeCaldavUpdated(cb),
    /** 동기화 진행률 구독 */
    onSyncProgress: (cb: (p: SyncProgressPayload) => void): (() => void) =>
      subscribeCaldavSyncProgress(cb)
  },

  // Calendar (통합 — CalDAV + 로컬)
  calendar: {
    listCalendars: (): Promise<UnifiedCalendar[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_LIST_CALENDARS),
    listEvents: (q: UnifiedEventQuery): Promise<UnifiedEvent[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_LIST_EVENTS, q),
    createEvent: (input: UnifiedEventCreate): Promise<UnifiedEvent> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_CREATE_EVENT, input),
    updateEventDateTime: (input: UnifiedEventDateTimeUpdate): Promise<UnifiedEvent> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_UPDATE_EVENT_DATETIME, input),
    updateEvent: (input: UnifiedEventUpdate): Promise<UnifiedEvent> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_UPDATE_EVENT, input),
    deleteEvent: (p: { source: 'local' | 'caldav'; id: string; calendarId?: string; caldavUrl?: string; etag?: string }): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CALENDAR_DELETE_EVENT, p)
  },
  localCalendar: {
    create: (input: LocalCalendarCreate): Promise<LocalCalendar> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_CALENDAR_CREATE, input),
    update: (input: LocalCalendarUpdate): Promise<{ ok: true }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_CALENDAR_UPDATE, input),
    delete: (id: string): Promise<{ ok: true }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_CALENDAR_DELETE, id)
  },

  // Shell — OS 기본 핸들러로 열기 (절대경로/URL/file://)
  shell: {
    openPath: (target: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_PATH, target),
    /** 이미지 파일 → data URL (#2 썸네일). 5MB 초과 / 비파일은 ok:false */
    readImageDataUrl: (target: string): Promise<{ ok: boolean; dataUrl?: string; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_READ_IMAGE_DATAURL, target),
    /** 파일을 부모 폴더 안에서 highlight (Warp 식 Show in Finder) */
    showInFolder: (target: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHELL_SHOW_IN_FOLDER, target)
  },

  // 외부 에디터 — 워크트리 폴더를 IntelliJ 등에서 프로젝트로 연다
  editor: {
    /** 설치된 에디터만 돌려준다. force 면 다시 훑는다(설치 직후 갱신용) */
    list: (force?: boolean): Promise<import('../shared/types/editor').DetectedEditor[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.EDITOR_LIST, force),
    open: (req: import('../shared/types/editor').OpenInEditorRequest): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.EDITOR_OPEN, req)
  },

  // CLAUDE.md 카탈로그 (#3) — 앱 내장 템플릿 목록 + 적용
  claudeMdTemplates: {
    list: (): Promise<Array<{ id: string; name: string; description: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MD_TEMPLATES_LIST),
    apply: (input: { id: string; cwd?: string; overwrite?: boolean }): Promise<{ ok: boolean; path?: string; conflict?: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_MD_TEMPLATES_APPLY, input)
  },

  // AI 추천 새 글 알림 (#7) — 토글 + 알림 클릭 라우팅
  aiRecommendNotify: {
    getEnabled: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_RECOMMEND_NOTIFY_GET_ENABLED),
    setEnabled: (enabled: boolean): Promise<{ ok: true; enabled: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_RECOMMEND_NOTIFY_SET_ENABLED, enabled),
    onGoto: subscribeGotoAiRecommend
  },

  // Terminal
  terminal: {
    create: (opts?: TerminalCreateOptions): Promise<TerminalSession> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CREATE, opts),
    input: (id: string, data: string): void =>
      ipcRenderer.send(IPC_CHANNELS.TERMINAL_INPUT, { id, data }),
    resize: (opts: TerminalResizeOptions): void =>
      ipcRenderer.send(IPC_CHANNELS.TERMINAL_RESIZE, opts),
    kill: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_KILL, id),
    list: (): Promise<TerminalSession[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_LIST),
    getOutput: (id: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_SAVE_OUTPUT, id),
    rename: (id: string, name: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RENAME, { id, name }),
    onOutput: (callback: (payload: { id: string; data: string }) => void): (() => void) =>
      subscribeTerminalOutput(callback),
    /** v2.0 B-1: PTY 종료 통지 구독. suppression·at-most-once 판정은 main 이 수행. */
    onExit: (callback: (payload: TerminalExitPayload) => void): (() => void) =>
      subscribeTerminalExit(callback),
    /** v2.0 M-A: 렌더러 스냅샷 저장 (invoke). main 이 store 쓰기 + 메모리 캐시 갱신 */
    saveState: (snapshot: TerminalWorkspaceSnapshotV2 | null): Promise<TerminalSaveStateResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_SAVE_STATE, snapshot),
    /** v2.0 M-A: 스냅샷 복원 — 없으면 null (main 이 legacy 마이그레이션까지 수행 후 반환) */
    restoreState: (): Promise<TerminalWorkspaceSnapshotV2 | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESTORE_STATE),
    /** v2.0 M-A: main → renderer flush 요청 구독 (before-quit 핸드셰이크) */
    onRequestState: (callback: () => void): (() => void) => subscribeTerminalRequestState(callback),
    /** v2.0 M-B: 링크 후보 배치 존재 검증 */
    resolvePath: (req: TerminalResolvePathRequest): Promise<TerminalResolvedPath[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESOLVE_PATH, req),
    /** v2.0: 세션의 현재 cwd (pid 실측 → spawn cwd 폴백). `cd` 이후를 따라가야 하는 곳에서 쓴다. */
    sessionCwd: (sessionId: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_SESSION_CWD, sessionId),
    /** v2.0: 지금 그 pane 에서 돌고 있는 프로그램 이름 — 셸이면 프롬프트가 비어 있다는 뜻. */
    foreground: (sessionId: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_FOREGROUND, sessionId),
    /** v2.0: 터미널의 claude 가 내 차례를 넘겼을 때 (탭 배지용) */
    onClaudeDone: (callback: (payload: { sessionId: string }) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, payload: { sessionId: string }): void => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_CLAUDE_DONE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_CLAUDE_DONE, handler)
    },
    /** v2.0: 알림 클릭 — 그 세션 탭으로 이동 */
    onFocusSession: (callback: (payload: { sessionId: string }) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, payload: { sessionId: string }): void => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_FOCUS_SESSION, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_FOCUS_SESSION, handler)
    },
    /** v1.4: 두레이 멘션이 main에서 새 터미널을 열었을 때 렌더러로 푸시되는 메타 */
    onMentionOpened: (callback: (meta: TerminalSession) => void): (() => void) => {
      const handler = (_: unknown, meta: TerminalSession): void => callback(meta)
      ipcRenderer.on(IPC_CHANNELS.MENTION_TERMINAL_OPENED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MENTION_TERMINAL_OPENED, handler)
    },
    /** v1.4: 기존 채널 탭 재사용 — 활성화만 요청 */
    onMentionFocus: (callback: (payload: { id: string }) => void): (() => void) => {
      const handler = (_: unknown, payload: { id: string }): void => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.MENTION_TERMINAL_FOCUS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MENTION_TERMINAL_FOCUS, handler)
    }
  },

  // Claude Code Bridge
  claude: {
    startTask: (params: { subject: string; body?: string; projectCode?: string }): Promise<TerminalSession> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_START_TASK, params),
    chatSend: (req: import('../shared/types/claude-chat').ClaudeChatSendRequest): Promise<string | undefined> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_CHAT_SEND, req),
    chatCancel: (chatId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_CHAT_CANCEL, chatId),
    onChatEvent: (cb: (ev: import('../shared/types/claude-chat').ClaudeChatEvent) => void): (() => void) => {
      const handler = (_: unknown, ev: import('../shared/types/claude-chat').ClaudeChatEvent): void => cb(ev)
      ipcRenderer.on(IPC_CHANNELS.CLAUDE_CHAT_EVENT, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_CHAT_EVENT, handler)
    },
    /** 디스크에 남은 Claude Code 세션 목록 (cwd 미지정 시 전 프로젝트) */
    sessionList: (cwd?: string): Promise<import('../main/claude/ClaudeSessionService').ClaudeSessionMeta[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_SESSION_LIST, cwd),
    /** 특정 세션의 user/assistant 메시지 시간순 로드 */
    sessionLoad: (sessionId: string, cwd: string): Promise<import('../main/claude/ClaudeSessionService').ClaudeSessionMessage[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_SESSION_LOAD, { sessionId, cwd }),
    /** 세션 사용자 정의 이름 변경 (빈 문자열이면 제거) */
    sessionRename: (sessionId: string, title: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_SESSION_RENAME, { sessionId, title }),
    /** 세션 즐겨찾기 토글 */
    sessionStar: (sessionId: string, starred: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_SESSION_STAR, { sessionId, starred }),
    /** 세션 보관 기간 조회 — claude 가 이 기간이 지난 기록을 지운다 */
    retentionGet: (): Promise<import('../shared/types/claude-retention').ClaudeRetentionState> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_RETENTION_GET),
    /** 세션 보관 기간 저장. null 이면 claude 기본값(30일)을 따른다 */
    retentionSet: (days: number | null): Promise<import('../shared/types/claude-retention').ClaudeRetentionState> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_RETENTION_SET, days),
    /** 채팅 첨부 파일 저장 → 절대 경로 반환 (drag-drop 시 path 가 이미 있으면 호출 불필요, paste 이미지에 사용) */
    saveAttachment: (name: string, data: ArrayBuffer | Uint8Array): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_ATTACHMENT_SAVE, { name, data })
  },

  // AI
  ai: {
    available: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_AVAILABLE),
    ask: (params: { prompt: string; systemPrompt?: string; model?: AIModelName; maxBudget?: string; requestId?: string; feature?: keyof AIModelConfig; mcpServers?: string[]; imagePaths?: string[] }): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_ASK, params),
    briefing: (requestId?: string, mcpServers?: string[]): Promise<AIBriefing> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_BRIEFING, { requestId, mcpServers }),
    summarizeTask: (task: DoorayTask, body?: string, requestId?: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SUMMARIZE_TASK, { task, body, requestId }),
    generateReport: (type: 'daily' | 'weekly', requestId?: string, mcpServers?: string[]): Promise<AIReport> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_REPORT, { type, requestId, mcpServers }),
    generateWiki: (taskSubject: string, taskBody?: string, projectCode?: string, requestId?: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_WIKI, { taskSubject, taskBody, projectCode, requestId }),
    wikiProofread: (title: string, content: string, requestId?: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_WIKI_PROOFREAD, { title, content, requestId }),
    wikiImprove: (title: string, content: string, requestId?: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_WIKI_IMPROVE, { title, content, requestId }),
    generateSkill: (request: string, target: string, requestId?: string, mcpServers?: string[]): Promise<{ name: string; description: string; content: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_SKILL, { request, target, requestId, mcpServers }),
    recommendAnalyze: (opts?: { requestId?: string; limit?: number; mcpServers?: string[] }): Promise<import('../shared/types/ai-recommend').AIRecommendResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_RECOMMEND_ANALYZE, opts),
    recommendCacheGet: (): Promise<import('../shared/types/ai-recommend').AIRecommendResult | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_RECOMMEND_CACHE_GET),
    /** 진행상황 이벤트 구독 */
    onProgress: (callback: (event: AIProgressEvent) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, event: AIProgressEvent): void => callback(event)
      ipcRenderer.on(IPC_CHANNELS.AI_PROGRESS, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AI_PROGRESS, handler)
    },
    /** 모델 설정 조회/저장 */
    getModelConfig: (): Promise<AIModelConfig> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_MODEL_CONFIG_GET),
    setModelConfig: (config: AIModelConfig): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_MODEL_CONFIG_SET, config)
  },

  // Settings
  settings: {
    get: (key: string): Promise<unknown> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key, value }),
    getProjects: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_PROJECTS),
    setProjects: (projectIds: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_PROJECTS, projectIds),
    getCustomProjects: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_CUSTOM_PROJECTS),
    setCustomProjects: (projectIds: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_CUSTOM_PROJECTS, projectIds)
  },

  // Clauday Skills
  claudaySkills: {
    list: (): Promise<import('../shared/types/skill').ClaudaySkill[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDAY_SKILLS_LIST),
    get: (id: string): Promise<import('../shared/types/skill').ClaudaySkill | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDAY_SKILLS_GET, id),
    save: (skill: import('../shared/types/skill').ClaudaySkill): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDAY_SKILLS_SAVE, skill),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDAY_SKILLS_DELETE, id),
    forTarget: (target: string): Promise<import('../shared/types/skill').ClaudaySkill[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDAY_SKILLS_FOR_TARGET, target)
  },

  // Briefing Store
  briefingStore: {
    save: (briefing: AIBriefing): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.BRIEFING_SAVE, briefing),
    list: (): Promise<Array<AIBriefing & { savedAt: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BRIEFING_LIST),
    delete: (index: number): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.BRIEFING_DELETE, index)
  },

  // Claude Sessions
  claudeSessions: {
    list: (): Promise<Array<{ id: string; project: string; firstMsg: string; timestamp: string; lines: number }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_SESSIONS_LIST),
    detail: (id: string): Promise<Array<{ role: string; content: string; timestamp: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_SESSIONS_DETAIL, id)
  },

  // Claude Insights
  claudeInsights: {
    generate: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_INSIGHTS)
  },

  // Claude CLI
  claudeCli: {
    info: (): Promise<{ version: string; mainHelp: string; mcpHelp: string; authHelp: string; agentsHelp: string; pluginHelp: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_CLI_INFO)
  },

  /** GitHub 연동 — 앱은 토큰을 받지 않는다. `gh` CLI 상태를 그대로 본다. */
  github: {
    status: (refresh?: boolean): Promise<GitHubStatus> =>
      ipcRenderer.invoke(IPC_CHANNELS.GITHUB_STATUS, refresh)
  },

  // Git Worktree
  git: {
    isRepo: (path: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_IS_REPO, path),
    repoRoot: (path: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_REPO_ROOT, path),
    /** 워크트리 안이면 그 워크트리가 딸린 본 저장소 경로 (저장소가 아니면 null) */
    mainRepoRoot: (path: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_MAIN_REPO_ROOT, path),
    branches: (repoPath: string): Promise<GitBranch[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCHES, repoPath),
    worktrees: (repoPath: string): Promise<GitWorktree[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKTREES, repoPath),
    /** 워크트리별 용량·변경 파일 수 — 정리 화면용. du 를 돌리므로 필요할 때만 부른다. */
    worktreeUsage: (repoPath: string): Promise<GitWorktreeUsage[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKTREE_USAGE, repoPath),
    createWorktree: (params: GitWorktreeCreateParams): Promise<GitWorktree> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKTREE_CREATE, params),
    removeWorktree: (params: GitWorktreeRemoveParams): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKTREE_REMOVE, params),
    worktreeStatus: (worktreePath: string): Promise<Omit<GitWorktreeStatus, 'worktree'>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKTREE_STATUS, worktreePath),
    diff: (worktreePath: string): Promise<GitDiffResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DIFF, worktreePath),
    compareBranches: (repoPath: string, branch1: string, branch2: string): Promise<GitDiffResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMPARE_BRANCHES, { repoPath, branch1, branch2 }),
    compareFile: (repoPath: string, filePath: string, branch1: string, branch2: string): Promise<GitFileCompare> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_COMPARE_FILE, { repoPath, filePath, branch1, branch2 }),
    prune: (repoPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PRUNE, repoPath),
    /** v2.0 C-2: 로컬 브랜치 삭제. force 없으면 안전 삭제(-d), force 면 -D. */
    deleteBranch: (repoPath: string, branch: string, opts?: { force?: boolean }): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_DELETE_BRANCH, { repoPath, branch, opts }),

    /** v2.0: 소스 제어 — 워크트리 오케스트레이션(위 API)과 달리 한 저장소 안의 변경을 다룬다. */
    scm: {
      status: (repoPath: string, limit?: number): Promise<GitStatusResult> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_STATUS, { repoPath, limit }),
      history: (repoPath: string, options?: GitHistoryOptions): Promise<GitHistoryResult> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_HISTORY, { repoPath, options }),
      commitDetail: (repoPath: string, commitOid: string): Promise<GitCommitDetail> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_COMMIT_DETAIL, { repoPath, commitOid }),
      /** 이 브랜치가 기준(base) 대비 바꾼 파일들 — 커밋 + 아직 커밋 안 한 변경 */
      branchDiff: (repoPath: string, baseRef?: string): Promise<GitBranchDiff> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_BRANCH_DIFF, { repoPath, baseRef }),
      fileDiff: (params: GitFileDiffParams): Promise<GitFileDiffContent> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_FILE_DIFF, params),
      stage: (repoPath: string, paths: string[]): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_STAGE, { repoPath, paths }),
      unstage: (repoPath: string, paths: string[]): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_UNSTAGE, { repoPath, paths }),
      discard: (repoPath: string, paths: string[]): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_DISCARD, { repoPath, paths }),
      commit: (params: GitCommitParams): Promise<{ ok: boolean; message: string }> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_COMMIT, params),
      lastCommitMessage: (repoPath: string): Promise<string> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_LAST_COMMIT_MESSAGE, repoPath),
      push: (params: GitPushParams): Promise<GitRemoteOpResult> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_PUSH, params),
      pull: (params: GitPullParams): Promise<GitRemoteOpResult> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_PULL, params),
      fetch: (repoPath: string, remote?: string): Promise<GitRemoteOpResult> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_FETCH, { repoPath, remote }),
      remotes: (repoPath: string): Promise<GitRemoteInfo[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_REMOTES, repoPath),
      authors: (repoPath: string): Promise<GitAuthorInfo[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_AUTHORS, repoPath),
      stashList: (repoPath: string): Promise<GitStashEntry[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_STASH_LIST, repoPath),
      stashPush: (
        repoPath: string,
        options?: { message?: string; includeUntracked?: boolean }
      ): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_STASH_PUSH, { repoPath, ...options }),
      stashAction: (
        repoPath: string,
        action: 'apply' | 'pop' | 'drop',
        ref: string
      ): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_STASH_ACTION, { repoPath, action, ref }),
      createBranch: (params: GitCreateBranchParams): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_CREATE_BRANCH, params),
      checkout: (repoPath: string, branch: string): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_CHECKOUT, { repoPath, branch }),
      abort: (repoPath: string, operation: 'merge' | 'rebase'): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.GIT_SCM_ABORT, { repoPath, operation })
    }
  },

  // Workspace (v2.0 C-2) — 두레이 태스크 ↔ 워크트리 ↔ 에이전트 run. renderer 뷰는 C-3, 여기서는 표면만 완성.
  workspace: {
    repos: {
      list: (): Promise<RepoRegistryEntry[]> => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REPOS_LIST),
      add: (params: AddRepoParams): Promise<RepoRegistryEntry> =>
        ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REPOS_ADD, params),
      update: (id: string, patch: Partial<RepoRegistryEntry>): Promise<RepoRegistryEntry | null> =>
        ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REPOS_UPDATE, { id, patch }),
      remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REPOS_REMOVE, id)
    },
    settings: {
      get: (): Promise<WorkspaceSettings> => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SETTINGS_GET),
      set: (patch: Partial<WorkspaceSettings>): Promise<WorkspaceSettings> =>
        ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SETTINGS_SET, patch)
    },
    setProjectRepo: (projectId: string, repoId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_PROJECT_REPO_SET, { projectId, repoId }),
    list: (): Promise<TaskWorkspace[]> => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST),
    get: (key: string): Promise<TaskWorkspace | null> => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET, key),
    startTask: (params: StartTaskParams): Promise<StartTaskResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_START_TASK, params),
    run: {
      resume: (params: ResumeRunParams): Promise<ResumeRunResult> =>
        ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_RUN_RESUME, params),
      adopt: (runId: string): Promise<AdoptRunResult> => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_RUN_ADOPT, runId),
      cleanup: (params: CleanupRunParams): Promise<CleanupRunResult> =>
        ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_RUN_CLEANUP, params)
    },
    reconcile: (): Promise<ReconcileResult> => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_RECONCILE),
    /** 터미널 태스크 드로어(C-3.5) — 드래그&드롭으로 태스크를 pane 에 떨어뜨릴 때 쓴다. */
    taskDrop: {
      /** preferCwd 를 주면 그 폴더의 세션을 우선 이어간다 (드롭한 pane 이 이미 있는 폴더). */
      resolve: (projectId: string, taskId: string, preferCwd?: string): Promise<TaskDropTarget | null> =>
        ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_TASK_DROP_RESOLVE, { projectId, taskId, preferCwd }),
      /** 드롭 직후 — 세션이 생길 때까지 main 이 지켜보다 연결한다. */
      watch: (params: {
        projectId: string
        taskId: string
        cwd: string
        since: number
        label?: string
        repoPath?: string
      }): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_TASK_DROP_WATCH, params),
      /** 연결되면 알린다 — 배지를 새로 그리기 위한 신호. */
      onLinked: (cb: () => void): (() => void) => {
        const handler = (): void => cb()
        ipcRenderer.on(IPC_CHANNELS.WORKSPACE_TASK_DROP_LINKED_PUSH, handler)
        return () => ipcRenderer.removeListener(IPC_CHANNELS.WORKSPACE_TASK_DROP_LINKED_PUSH, handler)
      },
      /** 드롭 직후 생긴 세션을 태스크에 연결. `since` 이후 활동한 세션만 후보다. */
      link: (
        projectId: string,
        taskId: string,
        cwd: string,
        since: number,
        label?: string,
        repoPath?: string
      ): Promise<string | null> =>
        ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_TASK_DROP_LINK, {
          projectId,
          taskId,
          cwd,
          since,
          label,
          repoPath
        }),
      /** cwd 를 주면 그 폴더 링크만, 안 주면 이 업무의 링크 전부를 해제한다. */
      unlink: (projectId: string, taskId: string, cwd?: string): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_TASK_DROP_UNLINK, { projectId, taskId, cwd }),
      /** 세션을 다시 열었음을 알려 최근 사용순 정렬을 실제 사용과 맞춘다. */
      touch: (projectId: string, taskId: string, cwd: string): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_TASK_DROP_TOUCH, { projectId, taskId, cwd }),
      /** `projectId:taskId` → 폴더별 세션 링크. 카드의 저장소 배지에 그대로 쓴다. */
      linked: (): Promise<Record<string, TaskSessionLink[]>> =>
        ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_TASK_DROP_LINKED)
    },
    /** 업무용 워크트리 보장 — 이미 그 브랜치가 체크아웃돼 있으면 그 폴더를 그대로 준다. */
    taskWorktree: (params: EnsureTaskWorktreeParams): Promise<TaskWorktreeInfo> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_TASK_WORKTREE, params),
    /** run 변경 push 구독. unsubscribe 함수 반환. */
    onRunUpdated: (callback: (payload: WorkspaceRunUpdatedPayload) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, payload: WorkspaceRunUpdatedPayload): void => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.WORKSPACE_RUN_UPDATED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WORKSPACE_RUN_UPDATED, handler)
    }
  },

  // Analytics (로컬 전용)
  analytics: {
    track: (type: string, params?: Record<string, unknown>): void =>
      ipcRenderer.send(IPC_CHANNELS.ANALYTICS_TRACK, { type, params }),
    summary: (days?: number): Promise<import('../shared/types/analytics').AnalyticsSummary> =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_SUMMARY, days),
    exportAll: (): Promise<import('../shared/types/analytics').AnalyticsEvent[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_EXPORT),
    clear: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_CLEAR)
  },

  // Community (Dooray 공개 프로젝트를 백엔드로 사용)
  community: {
    posts: (projectId: string, page?: number, size?: number): Promise<{ posts: DoorayTask[]; totalCount: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.DOORAY_COMMUNITY_POSTS, { projectId, page, size })
  },

  // Messenger (Dooray 메신저)
  messenger: {
    listChannels: (force = false): Promise<import('../shared/types/messenger').DoorayChannel[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.DOORAY_MESSENGER_CHANNELS, { force }),
    send: (channelId: string, text: string, organizationId?: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.DOORAY_MESSENGER_SEND, { channelId, text, organizationId }),
    composeWithAI: (instruction: string, channelName?: string, requestId?: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_COMPOSE_MESSAGE, { instruction, channelName, requestId })
  },

  // Dooray Bot (Socket Mode WebSocket) — 두레이 API 토큰을 그대로 재사용. 도메인만 별도 입력.
  bot: {
    getConfig: (): Promise<{ domain: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOT_GET_CONFIG),
    setConfig: (
      payload: { domain?: string }
    ): Promise<{ state: string; lastError: string | null; ready: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOT_SET_CONFIG, payload),
    getStatus: (): Promise<{ state: string; lastError: string | null; ready: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOT_GET_STATUS),
    start: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.BOT_START),
    stop: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.BOT_STOP),
    onStateUpdate: (callback: (status: { state: string; lastError: string | null; ready: boolean }) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, status: { state: string; lastError: string | null; ready: boolean }): void =>
        callback(status)
      ipcRenderer.on(IPC_CHANNELS.BOT_STATE_UPDATE, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BOT_STATE_UPDATE, handler)
    },
    onEvent: (
      callback: (ev: { type: string; service: string; action: string; text?: string; channelId?: string; senderId?: string; logId?: string; sentAt?: string; content?: Record<string, unknown> }) => void
    ): (() => void) => {
      const handler = (_: IpcRendererEvent, ev: { type: string; service: string; action: string; text?: string; channelId?: string; senderId?: string; logId?: string; sentAt?: string; content?: Record<string, unknown> }): void =>
        callback(ev)
      ipcRenderer.on(IPC_CHANNELS.BOT_EVENT, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BOT_EVENT, handler)
    }
  },

  // Watcher (채널 모니터링)
  watcher: {
    list: (): Promise<import('../shared/types/watcher').Watcher[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCHER_LIST),
    create: (req: import('../shared/types/watcher').WatcherCreateRequest): Promise<import('../shared/types/watcher').Watcher> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCHER_CREATE, req),
    update: (id: string, patch: import('../shared/types/watcher').WatcherUpdateRequest): Promise<import('../shared/types/watcher').Watcher | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCHER_UPDATE, { id, patch }),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCHER_DELETE, id),
    messages: (watcherId: string): Promise<import('../shared/types/watcher').CollectedMessage[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCHER_MESSAGES, watcherId),
    markRead: (ids: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCHER_MARK_READ, ids),
    markAllRead: (watcherId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCHER_MARK_ALL_READ, watcherId),
    refresh: (watcherId?: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCHER_REFRESH, watcherId),
    unreadCounts: (): Promise<Record<string, number>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCHER_UNREAD_COUNT),
    generateFilter: (instruction: string, requestId?: string): Promise<import('../shared/types/watcher').FilterRule> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_FILTER, { instruction, requestId }),
    onNewMessages: (cb: (payload: { watcherId: string; messages: import('../shared/types/watcher').CollectedMessage[] }) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, payload: { watcherId: string; messages: import('../shared/types/watcher').CollectedMessage[] }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.WATCHER_NEW_MESSAGES, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WATCHER_NEW_MESSAGES, handler)
    }
  },

  // v1.4: 두레이 멘션 알림 (와처 패턴과 동일)
  mention: {
    onReceived: (cb: (payload: { channelId: string; channelName: string; text: string; logId: string; sentAt?: string }) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, payload: { channelId: string; channelName: string; text: string; logId: string; sentAt?: string }): void => cb(payload)
      ipcRenderer.on(IPC_CHANNELS.MENTION_RECEIVED, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.MENTION_RECEIVED, handler)
    }
  },

  // Dialog
  dialog: {
    selectFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER)
  },

  // Error report — Claude CLI 호출 진단 + 사용자 제보
  errorReport: {
    collect: (): Promise<{
      body: string
      recentLogs: unknown[]
      logPath: string
      defaultSubject: string
    }> => ipcRenderer.invoke(IPC_CHANNELS.ERROR_REPORT_COLLECT),
    submitCommunity: (payload: { subject?: string; userNote: string; diagnosticsBody: string }): Promise<{ id: string; url: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.ERROR_REPORT_SUBMIT_COMMUNITY, payload),
    copyToClipboard: (payload: { subject?: string; userNote: string; diagnosticsBody: string }): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.ERROR_REPORT_COPY_CLIPBOARD, payload)
  },

  // Feedback (v1.6.0)
  feedback: {
    submit: (payload: import('../shared/types/feedback').FeedbackPayload): Promise<import('../shared/types/feedback').FeedbackSubmitResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.FEEDBACK_SUBMIT, payload)
  },

  // Config
  onConfigChanged: (
    callback: (data: { event: string; path: string }) => void
  ): (() => void) => {
    const handler = (_: IpcRendererEvent, payload: { event: string; path: string }): void =>
      callback(payload)
    ipcRenderer.on(IPC_CHANNELS.CONFIG_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONFIG_CHANGED, handler)
  },

  // Harness Studio (v1.7)
  harness: {
    /**
     * 번들 경로를 정적으로 스캔한다. AI 없음, 즉시 반환.
     * pickDialog=true 로 호출하면 폴더 선택 다이얼로그를 연다.
     */
    scan: (args: { path?: string; pickDialog?: boolean }): Promise<RawBundleSummary | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.HARNESS_SCAN, args),

    /**
     * ~/.claude/skills/* 를 자동 발견한다. 정적, AI 없음.
     */
    discover: (): Promise<DiscoveredHarness[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.HARNESS_DISCOVER),

    /**
     * 번들 경로를 AI(Opus) 로 정규화해 HarnessModel 을 반환한다.
     * 캐시 hit 시 즉시, force=true 면 재정규화.
     * requestId 를 지정하면 AI_PROGRESS 이벤트로 진행률을 받을 수 있다.
     */
    normalize: (args: { path: string; force?: boolean; requestId?: string }): Promise<HarnessModel> =>
      ipcRenderer.invoke(IPC_CHANNELS.HARNESS_NORMALIZE, args),

    /**
     * 캐시를 삭제한다. path 지정 시 해당 번들만, 생략 시 전체.
     */
    clearCache: (args?: { path?: string }): Promise<{ cleared: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HARNESS_CACHE_CLEAR, args),

    /**
     * 캐시된 번들 목록을 반환한다 (최근 정규화 순).
     */
    listCached: (): Promise<CachedHarnessEntry[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.HARNESS_LIST_CACHED),

    /**
     * 태스크 평문으로 레벨을 추정하고 결정론적 경로/게이트/비용을 계산한다.
     *
     * 처리 흐름:
     * 1. taskHash 캐시 hit → 즉시 반환.
     * 2. miss → (projectPath 지정 시) 프로젝트 맥락 정적 수집 → AI(Haiku) 레벨 추정 + levelPath 결정론적 계산.
     * requestId 를 지정하면 AI_PROGRESS 이벤트로 진행률을 받을 수 있다.
     *
     * @param args.path - 번들 루트 절대경로 (HarnessModel 획득에 사용)
     * @param args.taskText - 태스크 설명 평문 또는 두레이 URL
     * @param args.requestId - 진행률 이벤트 구분 ID (optional)
     * @param args.projectPath - 프로젝트 루트 절대경로 (optional).
     *   지정 시 정적 프로파일 수집 후 AI 레벨 추정 맥락으로 전달 — 추정 정확도 향상.
     *   미지정 시 기존 동작 그대로.
     * @returns DryRunResult
     */
    dryrun: (args: { path: string; taskText: string; requestId?: string; projectPath?: string }): Promise<DryRunResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.HARNESS_DRYRUN, args),

    /**
     * 프로젝트 폴더 선택 다이얼로그를 열어 선택된 경로를 반환한다.
     *
     * dryrun 의 projectPath 입력에 사용한다.
     * 사용자가 취소하면 null 을 반환한다.
     *
     * @returns 선택된 디렉터리 절대경로, 또는 취소 시 null
     */
    pickProjectDir: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.HARNESS_PICK_DIR),

    /**
     * 번들 경로 + 토픽을 받아 온디맨드 한국어 설명/용어번역을 반환한다 (P3, Sonnet).
     *
     * 처리 흐름:
     * 1. normalize(path) 로 HarnessModel 획득 (캐시 hit 우선).
     * 2. 모델 컨텍스트 요약 → AIService.explainHarness(Sonnet) 호출 → 마크다운 반환.
     * requestId 를 지정하면 AI_PROGRESS 이벤트로 진행률을 받을 수 있다.
     *
     * @param args.path - 번들 루트 절대경로
     * @param args.topic - 설명 요청 토픽 (예: "architect 에이전트 역할", "L2 레벨 진입 조건")
     * @param args.requestId - 진행률 이벤트 구분 ID (optional)
     * @returns { markdown: string }
     */
    explain: (args: { path: string; topic: string; requestId?: string }): Promise<{ markdown: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.HARNESS_EXPLAIN, args),

    /**
     * Harness Studio 편집(저작) 기능 (v1.8).
     * 네임스페이스: api.harness.edit.*
     *
     * AI_PROGRESS 진행률은 기존 api.ai.onProgress 재사용 (requestId 로 구분).
     */
    edit: {
      /**
       * 번들 내 단일 파일 원본 내용 + AgentSourceMap 반환.
       * 게이트: 번들이 HARNESS_SCAN 으로 등록되어 있어야 한다.
       *
       * @param path - 번들 루트 절대경로
       * @param relPath - 번들 루트 기준 파일 상대경로
       * @returns { content: string; sourceMap?: AgentSourceMap }
       */
      readFile: (path: string, relPath: string): Promise<{ content: string; sourceMap?: AgentSourceMap }> =>
        ipcRenderer.invoke(IPC_CHANNELS.HARNESS_READ_FILE, { path, relPath }),

      /**
       * draft 와 디스크 현재 내용을 대조해 DraftDiffSummary 를 반환한다.
       * 쓰기 없음. 적용 전 미리보기 및 stale 감지 용도.
       *
       * @param path - 번들 루트 절대경로
       * @param draft - 편집 세션 draft 전체
       * @returns DraftDiffSummary
       */
      diff: (path: string, draft: HarnessDraft): Promise<DraftDiffSummary> =>
        ipcRenderer.invoke(IPC_CHANNELS.HARNESS_DIFF_DRAFT, { path, draft }),

      /**
       * draft 를 파일에 원자적으로 적용한다 (백업 + 쓰기 + 재정규화).
       *
       * 처리 순서: 경로 게이트 → stale 대조 → 백업 → temp-write+rename → cache clear → normalize(force=true).
       * stale 또는 경로 위반 시 에러를 throw 한다 (부분 적용 없음).
       *
       * @param path - 번들 루트 절대경로
       * @param draft - 편집 세션 draft 전체
       * @returns { applied: string[]; backupDir: string; model: HarnessModel }
       */
      apply: (path: string, draft: HarnessDraft): Promise<{ applied: string[]; backupDir: string; model: HarnessModel }> =>
        ipcRenderer.invoke(IPC_CHANNELS.HARNESS_APPLY_DRAFT, { path, draft }),

      /**
       * 자연어 명령을 AI 에 보내 파일 변경안을 제안받는다 (자동 쓰기 없음).
       *
       * proposals 는 사용자 승인 후 draft 에 반영한다.
       * 진행률은 api.ai.onProgress 로 구독 (requestId 로 구분).
       *
       * @param path - 번들 루트 절대경로
       * @param command - 사용자 자연어 명령 (예: "보안검토자를 opus 로 바꿔줘")
       * @param targetRelPaths - 편집 대상 파일 상대경로 목록 (화이트리스트)
       * @param requestId - 진행률 이벤트 구분 ID (optional)
       * @returns { proposals: AIEditProposal[] }
       */
      aiPropose: (
        path: string,
        command: string,
        targetRelPaths: string[],
        requestId?: string
      ): Promise<{ proposals: AIEditProposal[] }> =>
        ipcRenderer.invoke(IPC_CHANNELS.HARNESS_AI_EDIT, { path, command, targetRelPaths, requestId }),

      /**
       * 번들의 백업 목록을 반환한다 (최신 백업 우선 정렬).
       *
       * @param path - 번들 루트 절대경로
       * @returns BackupEntry[]
       */
      listBackups: (path: string): Promise<BackupEntry[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.HARNESS_LIST_BACKUPS, { path }),

      /**
       * 지정한 백업 디렉터리의 파일을 번들로 복원한다.
       *
       * backupDir 은 <userData>/harness-backups/ 하위여야 한다 (경로 주입 방어).
       * 복원 후 HarnessService.normalize(force=true) 로 재정규화한다.
       *
       * @param path - 번들 루트 절대경로
       * @param backupDir - 복원 대상 백업 디렉터리 절대경로 (BackupEntry.backupDir)
       * @returns { restored: string[]; model: HarnessModel }
       */
      restore: (path: string, backupDir: string): Promise<{ restored: string[]; model: HarnessModel }> =>
        ipcRenderer.invoke(IPC_CHANNELS.HARNESS_RESTORE_BACKUP, { path, backupDir })
    }
  },

  // v2.0 windows-fix ADR-v2-windows-fix-03 §4: windowsPty 게이트(빌드번호 판정)에 쓰는 정적 값.
  // IPC 채널이 아니다 — sandbox:false 라 preload 에서 동기로 읽어 노출한다. 값이 없어도(구버전 mock 등)
  // 호출부는 optional chaining 으로 안전하게 undefined 처리한다.
  system: {
    platform: process.platform,
    osRelease: release()
  }
}

export type ClaudayAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
