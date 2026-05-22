import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

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
import type { Skill, SkillSaveRequest } from '../shared/types/skills'
import type { UsageQueryParams, UsageSummary } from '../shared/types/usage'
import type {
  DoorayProject,
  DoorayTask,
  DoorayTaskDetail,
  DoorayTaskUpdateParams,
  DoorayWikiPage,
  DoorayWikiUpdateParams,
  DoorayCalendarEvent,
  DoorayCalendarQueryParams
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
import type { TerminalSession, TerminalCreateOptions, TerminalResizeOptions } from '../shared/types/terminal'
import type {
  GitWorktree,
  GitWorktreeStatus,
  GitBranch,
  GitDiffResult,
  GitWorktreeCreateParams,
  GitWorktreeRemoveParams,
  GitFileCompare
} from '../shared/types/git'

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
    deleteMany: (filenames: string[]): Promise<{ deleted: number }> =>
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
      updateBody: (params: { projectId: string; postId: string; subject: string; body: string }): Promise<void> =>
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
    }
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
    restoreSaved: (): Promise<Array<{ meta: { id: string; name: string; cwd: string }; output: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESTORE),
    rename: (id: string, name: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RENAME, { id, name }),
    onOutput: (callback: (payload: { id: string; data: string }) => void): (() => void) =>
      subscribeTerminalOutput(callback),
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

  // Git Worktree
  git: {
    isRepo: (path: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_IS_REPO, path),
    repoRoot: (path: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_REPO_ROOT, path),
    branches: (repoPath: string): Promise<GitBranch[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCHES, repoPath),
    worktrees: (repoPath: string): Promise<GitWorktree[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_WORKTREES, repoPath),
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
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PRUNE, repoPath)
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
  }
}

export type ClaudayAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
