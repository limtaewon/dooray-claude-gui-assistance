import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
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
import type { AIChatRequest, AIChatResponse, AIBriefing, AIReport, AIReportRequest } from '../shared/types/ai'
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
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_PROJECTS_LIST)
    },
    tasks: {
      list: (projectIds?: string[]): Promise<DoorayTask[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASKS_LIST, projectIds),
      detail: (projectId: string, taskId: string): Promise<DoorayTaskDetail> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_DETAIL, { projectId, taskId }),
      update: (params: DoorayTaskUpdateParams): Promise<void> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASKS_UPDATE, params),
      comments: (projectId: string, taskId: string): Promise<import('../shared/types/dooray').DoorayTaskComment[]> =>
        ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASK_COMMENTS, { projectId, taskId })
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
    onOutput: (callback: (payload: { id: string; data: string }) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, payload: { id: string; data: string }): void =>
        callback(payload)
      ipcRenderer.on(IPC_CHANNELS.TERMINAL_OUTPUT, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TERMINAL_OUTPUT, handler)
    }
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
    chat: (req: AIChatRequest): Promise<{ content: string; sessionId: string; cost: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT, req),
    resetChat: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_RESET),
    briefing: (): Promise<AIBriefing> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_BRIEFING),
    summarizeTask: (task: DoorayTask, body?: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SUMMARIZE_TASK, { task, body }),
    generateReport: (type: 'daily' | 'weekly'): Promise<AIReport> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_REPORT, { type }),
    generateWiki: (taskSubject: string, taskBody?: string, projectCode?: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_WIKI, { taskSubject, taskBody, projectCode }),
    generateMeetingNote: (eventSubject: string, eventDescription?: string, attendees?: string[]): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_MEETING_NOTE, { eventSubject, eventDescription, attendees }),
    wikiProofread: (title: string, content: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_WIKI_PROOFREAD, { title, content }),
    wikiImprove: (title: string, content: string): Promise<string> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_WIKI_IMPROVE, { title, content }),
    generateSkill: (request: string, target: string): Promise<{ name: string; description: string; content: string }> =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_GENERATE_SKILL, { request, target })
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
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_PROJECTS, projectIds)
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

  // Chat Store
  chatStore: {
    save: (id: string, messages: unknown[]): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_SAVE, { id, messages }),
    list: (): Promise<Array<{ id: string; messageCount: number; updatedAt: string; preview: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_LIST),
    load: (id: string): Promise<unknown[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_LOAD, id),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.CHAT_DELETE, id)
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
