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
  AI_CHAT: 'ai:chat',
  AI_CHAT_RESET: 'ai:chat:reset',
  AI_BRIEFING: 'ai:briefing',
  AI_SUMMARIZE_TASK: 'ai:summarize-task',
  AI_GENERATE_REPORT: 'ai:generate-report',
  AI_GENERATE_WIKI: 'ai:generate-wiki',
  AI_GENERATE_MEETING_NOTE: 'ai:generate-meeting-note',

  // Dooray Wiki
  DOORAY_WIKI_DOMAINS: 'dooray:wiki:domains',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_PROJECTS: 'settings:get-projects',
  SETTINGS_SET_PROJECTS: 'settings:set-projects',

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

  // Chat Store
  CHAT_SAVE: 'chat:save',
  CHAT_LIST: 'chat:list',
  CHAT_LOAD: 'chat:load',
  CHAT_DELETE: 'chat:delete',

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

  // Dialog
  DIALOG_SELECT_FOLDER: 'dialog:select-folder',

  // Config
  CONFIG_CHANGED: 'config:changed'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
