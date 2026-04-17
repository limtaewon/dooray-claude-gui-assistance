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
      ipcRenderer.invoke(IPC_CHANNELS.SKILLS_DELETE, filename)
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
      list: (projectIds?: string[]): Promise<DoorayTask[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASKS_LIST, projectIds),
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
      /** 태스크 생성 (커뮤니티 글쓰기) */
      create: (params: { projectId: string; subject: string; body: string; assigneeIds?: string[] }): Promise<{ id: string }> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_CREATE, params),
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
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_COMMENT_UPDATE, params)
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
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_WIKI_UPDATE, params)
    },
    calendar: {
      list: (): Promise<Array<{ id: string; name: string; type: string }>> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_CALENDAR_LIST),
      events: (params: DoorayCalendarQueryParams): Promise<DoorayCalendarEvent[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_CALENDAR_EVENTS, params)
    }
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
    onOutput: (callback: (payload: { id: string; data: string }) => void): (() => void) =>
      subscribeTerminalOutput(callback)
  },

  // Claude Code Bridge
  claude: {
    startTask: (params: { subject: string; body?: string; projectCode?: string }): Promise<TerminalSession> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_START_TASK, params)
  },

  // AI
  ai: {
    available: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_AVAILABLE),
    ask: (params: { prompt: string; systemPrompt?: string; model?: AIModelName; maxBudget?: string; requestId?: string; feature?: keyof AIModelConfig }): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_ASK, params),
    briefing: (requestId?: string): Promise<AIBriefing> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_BRIEFING, { requestId }),
    summarizeTask: (task: DoorayTask, body?: string, requestId?: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SUMMARIZE_TASK, { task, body, requestId }),
    generateReport: (type: 'daily' | 'weekly', requestId?: string): Promise<AIReport> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_REPORT, { type, requestId }),
    generateWiki: (taskSubject: string, taskBody?: string, projectCode?: string, requestId?: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_WIKI, { taskSubject, taskBody, projectCode, requestId }),
    generateMeetingNote: (eventSubject: string, eventDescription?: string, attendees?: string[], requestId?: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_MEETING_NOTE, { eventSubject, eventDescription, attendees, requestId }),
    wikiProofread: (title: string, content: string, requestId?: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_WIKI_PROOFREAD, { title, content, requestId }),
    wikiImprove: (title: string, content: string, requestId?: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_WIKI_IMPROVE, { title, content, requestId }),
    generateSkill: (request: string, target: string, requestId?: string): Promise<{ name: string; description: string; content: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_SKILL, { request, target, requestId }),
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

  // Clover Skills
  cloverSkills: {
    list: (): Promise<import('../shared/types/skill').CloverSkill[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOVER_SKILLS_LIST),
    get: (id: string): Promise<import('../shared/types/skill').CloverSkill | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOVER_SKILLS_GET, id),
    save: (skill: import('../shared/types/skill').CloverSkill): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOVER_SKILLS_SAVE, skill),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOVER_SKILLS_DELETE, id),
    forTarget: (target: string): Promise<import('../shared/types/skill').CloverSkill[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLOVER_SKILLS_FOR_TARGET, target)
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

  // Dialog
  dialog: {
    selectFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_FOLDER)
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

export type CloverAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
