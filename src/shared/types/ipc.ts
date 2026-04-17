export const IPC_CHANNELS = {
  // MCP
  MCP_LIST: 'mcp:list',
  MCP_ADD: 'mcp:add',
  MCP_UPDATE: 'mcp:update',
  MCP_DELETE: 'mcp:delete',

  // Skills
  SKILLS_LIST: 'skills:list',
  SKILLS_READ: 'skills:read',
  SKILLS_SAVE: 'skills:save',
  SKILLS_DELETE: 'skills:delete',

  // Usage
  USAGE_QUERY: 'usage:query',

  // Dooray
  DOORAY_TOKEN_SET: 'dooray:token:set',
  DOORAY_TOKEN_GET: 'dooray:token:get',
  DOORAY_TOKEN_DELETE: 'dooray:token:delete',
  DOORAY_TOKEN_VALIDATE: 'dooray:token:validate',
  DOORAY_PROJECTS_LIST: 'dooray:projects:list',
  DOORAY_TASKS_LIST: 'dooray:tasks:list',
  DOORAY_TASKS_CC: 'dooray:tasks:cc',
  DOORAY_TASKS_UPDATE: 'dooray:tasks:update',
  DOORAY_WIKI_LIST: 'dooray:wiki:list',
  DOORAY_WIKI_CHILDREN: 'dooray:wiki:children',
  DOORAY_WIKI_GET: 'dooray:wiki:get',
  DOORAY_WIKI_UPDATE: 'dooray:wiki:update',
  DOORAY_CALENDAR_LIST: 'dooray:calendar:list',
  DOORAY_CALENDAR_EVENTS: 'dooray:calendar:events',
  DOORAY_PROJECT_INFO: 'dooray:project:info',
  DOORAY_TASKS_PARTIAL: 'dooray:tasks:partial',
  DOORAY_FILE_FETCH: 'dooray:file:fetch',
  DOORAY_TASK_CREATE: 'dooray:task:create',
  DOORAY_TASK_COMMENT_CREATE: 'dooray:task:comment:create',
  DOORAY_TASK_UPLOAD_FILE: 'dooray:task:upload-file',
  DOORAY_TASK_UPDATE_BODY: 'dooray:task:update-body',
  DOORAY_TASK_COMMENT_UPDATE: 'dooray:task:comment:update',
  DOORAY_COMMUNITY_POSTS: 'dooray:community:posts',
  DOORAY_MESSENGER_CHANNELS: 'dooray:messenger:channels',
  DOORAY_MESSENGER_SEND: 'dooray:messenger:send',

  // AI - Messenger
  AI_COMPOSE_MESSAGE: 'ai:compose-message',

  // Watcher (채널 모니터링)
  WATCHER_LIST: 'watcher:list',
  WATCHER_CREATE: 'watcher:create',
  WATCHER_UPDATE: 'watcher:update',
  WATCHER_DELETE: 'watcher:delete',
  WATCHER_MESSAGES: 'watcher:messages',
  WATCHER_MARK_READ: 'watcher:mark-read',
  WATCHER_MARK_ALL_READ: 'watcher:mark-all-read',
  WATCHER_REFRESH: 'watcher:refresh',
  WATCHER_UNREAD_COUNT: 'watcher:unread-count',
  /** 새 메시지 도착 이벤트 (main → renderer) */
  WATCHER_NEW_MESSAGES: 'watcher:new-messages',

  // AI - 필터 규칙 생성
  AI_GENERATE_FILTER: 'ai:generate-filter',

  // Dooray Task Detail
  DOORAY_TASK_DETAIL: 'dooray:task:detail',
  DOORAY_TASK_COMMENTS: 'dooray:task:comments',

  // Terminal
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_KILL: 'terminal:kill',
  TERMINAL_LIST: 'terminal:list',
  TERMINAL_OUTPUT: 'terminal:output',
  TERMINAL_SAVE_OUTPUT: 'terminal:save-output',
  TERMINAL_RESTORE: 'terminal:restore',

  // Claude Code Task Bridge
  CLAUDE_START_TASK: 'claude:start-task',

  // AI
  AI_AVAILABLE: 'ai:available',
  AI_ASK: 'ai:ask',
  AI_BRIEFING: 'ai:briefing',
  AI_SUMMARIZE_TASK: 'ai:summarize-task',
  AI_GENERATE_REPORT: 'ai:generate-report',
  AI_GENERATE_WIKI: 'ai:generate-wiki',
  AI_GENERATE_MEETING_NOTE: 'ai:generate-meeting-note',
  AI_PROGRESS: 'ai:progress',
  AI_MODEL_CONFIG_GET: 'ai:model-config:get',
  AI_MODEL_CONFIG_SET: 'ai:model-config:set',

  // Dooray Wiki
  DOORAY_WIKI_DOMAINS: 'dooray:wiki:domains',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_PROJECTS: 'settings:get-projects',
  SETTINGS_SET_PROJECTS: 'settings:set-projects',
  SETTINGS_GET_CUSTOM_PROJECTS: 'settings:get-custom-projects',
  SETTINGS_SET_CUSTOM_PROJECTS: 'settings:set-custom-projects',

  // Clover Skills
  CLOVER_SKILLS_LIST: 'clover-skills:list',
  CLOVER_SKILLS_GET: 'clover-skills:get',
  CLOVER_SKILLS_SAVE: 'clover-skills:save',
  CLOVER_SKILLS_DELETE: 'clover-skills:delete',
  CLOVER_SKILLS_FOR_TARGET: 'clover-skills:for-target',

  // AI Skill Generator
  AI_WIKI_PROOFREAD: 'ai:wiki-proofread',
  AI_WIKI_IMPROVE: 'ai:wiki-improve',
  AI_GENERATE_SKILL: 'ai:generate-skill',

  // Briefing Store
  BRIEFING_SAVE: 'briefing:save',
  BRIEFING_LIST: 'briefing:list',
  BRIEFING_DELETE: 'briefing:delete',

  // Claude Sessions
  CLAUDE_SESSIONS_LIST: 'claude:sessions:list',
  CLAUDE_SESSIONS_DETAIL: 'claude:sessions:detail',

  // Claude Insights
  CLAUDE_INSIGHTS: 'claude:insights',

  // Claude CLI Info
  CLAUDE_CLI_INFO: 'claude:cli-info',

  // Git Worktree
  GIT_IS_REPO: 'git:is-repo',
  GIT_REPO_ROOT: 'git:repo-root',
  GIT_BRANCHES: 'git:branches',
  GIT_WORKTREES: 'git:worktrees',
  GIT_WORKTREE_CREATE: 'git:worktree-create',
  GIT_WORKTREE_REMOVE: 'git:worktree-remove',
  GIT_WORKTREE_STATUS: 'git:worktree-status',
  GIT_DIFF: 'git:diff',
  GIT_COMPARE_BRANCHES: 'git:compare-branches',
  GIT_COMPARE_FILE: 'git:compare-file',
  GIT_PRUNE: 'git:prune',

  // Analytics
  ANALYTICS_TRACK: 'analytics:track',
  ANALYTICS_SUMMARY: 'analytics:summary',
  ANALYTICS_EXPORT: 'analytics:export',
  ANALYTICS_CLEAR: 'analytics:clear',

  // Dialog
  DIALOG_SELECT_FOLDER: 'dialog:select-folder',

  // Config
  CONFIG_CHANGED: 'config:changed'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
