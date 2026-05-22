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
  /** 다중 import — 파일 선택 다이얼로그를 열고 선택된 .md 들을 모두 저장 */
  SKILLS_IMPORT: 'skills:import',
  /** 다중 export — 폴더 선택 다이얼로그를 열고 지정 스킬들을 그 폴더에 .md 로 내보냄 */
  SKILLS_EXPORT: 'skills:export',
  /** 다중 삭제 */
  SKILLS_DELETE_MANY: 'skills:delete-many',

  // Usage
  USAGE_QUERY: 'usage:query',

  // Shell — OS 기본 핸들러로 path/URL 열기 (#6 터미널 path cmd+클릭 등)
  SHELL_OPEN_PATH: 'shell:open-path',
  /** 이미지 파일을 data URL 로 변환 (#2 터미널 이미지 사이드 패널 썸네일) */
  SHELL_READ_IMAGE_DATAURL: 'shell:read-image-dataurl',
  /** 파일의 부모 폴더를 OS 파일 탐색기에서 열고 해당 파일 highlight (Warp 식 Show in Finder) */
  SHELL_SHOW_IN_FOLDER: 'shell:show-in-folder',

  // CLAUDE.md 카탈로그 (#3) — 앱 내장 템플릿 목록 + 사용자가 고른 폴더에 적용
  CLAUDE_MD_TEMPLATES_LIST: 'claude-md:templates:list',
  CLAUDE_MD_TEMPLATES_APPLY: 'claude-md:templates:apply',

  // AI 추천 새 글 OS 알림 (#7) — 1시간 폴링 + silent hours. 사용자 토글.
  AI_RECOMMEND_NOTIFY_GET_ENABLED: 'ai-recommend:notify:get-enabled',
  AI_RECOMMEND_NOTIFY_SET_ENABLED: 'ai-recommend:notify:set-enabled',

  // Dooray
  DOORAY_TOKEN_SET: 'dooray:token:set',
  DOORAY_TOKEN_GET: 'dooray:token:get',
  DOORAY_TOKEN_DELETE: 'dooray:token:delete',
  DOORAY_TOKEN_VALIDATE: 'dooray:token:validate',
  /** 내 organizationMemberId 조회 (본인 작성자 검증용) */
  DOORAY_MY_MEMBER_ID: 'dooray:my-member-id',
  DOORAY_PROJECTS_LIST: 'dooray:projects:list',
  DOORAY_TASKS_LIST: 'dooray:tasks:list',
  DOORAY_TASKS_CC: 'dooray:tasks:cc',
  DOORAY_TASKS_UPDATE: 'dooray:tasks:update',
  /** 사용자 지정 위키 페이지를 parent 로 쓰는 채널 */
  DOORAY_WIKI_STORAGE_LIST: 'dooray:wiki:storage:list',
  DOORAY_WIKI_STORAGE_GET: 'dooray:wiki:storage:get',
  DOORAY_WIKI_STORAGE_UPLOAD: 'dooray:wiki:storage:upload',
  DOORAY_WIKI_STORAGE_SOFT_DELETE: 'dooray:wiki:storage:soft-delete',
  /** 두레이 위키 URL → wikiId / pageId / 이름 추출 */
  DOORAY_WIKI_STORAGE_RESOLVE: 'dooray:wiki:storage:resolve',
  DOORAY_WIKI_LIST: 'dooray:wiki:list',
  DOORAY_WIKI_CHILDREN: 'dooray:wiki:children',
  DOORAY_WIKI_GET: 'dooray:wiki:get',
  DOORAY_WIKI_UPDATE: 'dooray:wiki:update',
  DOORAY_CALENDAR_LIST: 'dooray:calendar:list',
  DOORAY_CALENDAR_EVENTS: 'dooray:calendar:events',
  // CalDAV (v1.5) — 두레이 CalDAV 통합
  CALDAV_TEST_CONNECT: 'caldav:test-connect',
  CALDAV_SAVE_CREDENTIALS: 'caldav:save-credentials',
  CALDAV_STATUS: 'caldav:status',
  CALDAV_DISCONNECT: 'caldav:disconnect',
  CALDAV_LIST_CALENDARS: 'caldav:list-calendars',
  CALDAV_LIST_EVENTS: 'caldav:list-events',
  CALDAV_CREATE_EVENT: 'caldav:create-event',
  CALDAV_DELETE_EVENT: 'caldav:delete-event',
  CALDAV_FULL_SYNC: 'caldav:full-sync',
  CALDAV_INCREMENTAL_SYNC: 'caldav:incremental-sync',
  // Calendar (v1.5) — CalDAV + 로컬 통합 인터페이스
  CALENDAR_LIST_CALENDARS: 'calendar:list-calendars',
  CALENDAR_LIST_EVENTS: 'calendar:list-events',
  CALENDAR_CREATE_EVENT: 'calendar:create-event',
  CALENDAR_UPDATE_EVENT_DATETIME: 'calendar:update-event-datetime',
  CALENDAR_DELETE_EVENT: 'calendar:delete-event',
  LOCAL_CALENDAR_CREATE: 'local-calendar:create',
  LOCAL_CALENDAR_UPDATE: 'local-calendar:update',
  LOCAL_CALENDAR_DELETE: 'local-calendar:delete',
  DOORAY_PROJECT_INFO: 'dooray:project:info',
  DOORAY_TASKS_PARTIAL: 'dooray:tasks:partial',
  DOORAY_FILE_FETCH: 'dooray:file:fetch',
  DOORAY_TASK_CREATE: 'dooray:task:create',
  DOORAY_TASK_COMMENT_CREATE: 'dooray:task:comment:create',
  DOORAY_TASK_UPLOAD_FILE: 'dooray:task:upload-file',
  DOORAY_TASK_UPDATE_BODY: 'dooray:task:update-body',
  DOORAY_TASK_COMMENT_UPDATE: 'dooray:task:comment:update',
  /** 태스크(커뮤니티 글) 삭제 — 본인 글만 (호출 측에서 검증) */
  DOORAY_TASK_DELETE: 'dooray:task:delete',
  /** 댓글 삭제 — 본인 댓글만 */
  DOORAY_TASK_COMMENT_DELETE: 'dooray:task:comment:delete',
  DOORAY_TASK_TEMPLATES_LIST: 'dooray:task:templates:list',
  DOORAY_TASK_TEMPLATE_DETAIL: 'dooray:task:templates:detail',
  /** 프로젝트에 정의된 태그 목록 — 빠른 태스크 생성 시 태그 선택용 */
  DOORAY_PROJECT_TAGS_LIST: 'dooray:project:tags:list',
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
  /** OS 알림 클릭 이벤트 (main → renderer) — 모니터링 탭으로 이동 + 해당 와처 선택 */
  WATCHER_NOTIFICATION_CLICK: 'watcher:notification-click',

  // Dooray Bot (Socket Mode WebSocket 통합)
  /** 봇 설정 조회 (도메인/enabled — 토큰은 두레이 API 토큰 재사용) */
  BOT_GET_CONFIG: 'bot:get-config',
  /** 봇 설정 저장 (도메인/enabled). 저장 후 자동 재시작. */
  BOT_SET_CONFIG: 'bot:set-config',
  /** 현재 연결 상태 조회 */
  BOT_GET_STATUS: 'bot:get-status',
  /** 수동 시작/중지 */
  BOT_START: 'bot:start',
  BOT_STOP: 'bot:stop',
  /** 상태 변화 이벤트 (main → renderer) */
  BOT_STATE_UPDATE: 'bot:state-update',
  /** 이벤트 도착 (메시지 등, main → renderer — 모니터링/디버깅용) */
  BOT_EVENT: 'bot:event',

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
  TERMINAL_RENAME: 'terminal:rename',
  /** v1.4: 두레이 멘션이 새 터미널을 열었음을 렌더러에 알림 (entries 추가/활성화 요청) */
  MENTION_TERMINAL_OPENED: 'mention:terminal:opened',
  /** v1.4: 기존 채널 탭을 재사용 — 렌더러에 활성화만 요청 (id 페이로드) */
  MENTION_TERMINAL_FOCUS: 'mention:terminal:focus',
  /** v1.4: 멘션이 수신됐음을 사이드바/알림 UI에 push (배지/pulse 트리거) */
  MENTION_RECEIVED: 'mention:received',

  // Claude Code Task Bridge
  CLAUDE_START_TASK: 'claude:start-task',

  // Claude Code Chat (interactive transcript UI)
  CLAUDE_CHAT_SEND: 'claude:chat:send',
  CLAUDE_CHAT_EVENT: 'claude:chat:event',
  CLAUDE_CHAT_CANCEL: 'claude:chat:cancel',
  /** ~/.claude/projects 안 jsonl 들을 파싱한 세션 목록 (cwd 필터 가능) */
  CLAUDE_SESSION_LIST: 'claude:session:list',
  /** 특정 세션의 user/assistant 메시지 목록 */
  CLAUDE_SESSION_LOAD: 'claude:session:load',
  /** 세션 사용자 정의 이름 변경 */
  CLAUDE_SESSION_RENAME: 'claude:session:rename',
  /** 세션 즐겨찾기 토글 */
  CLAUDE_SESSION_STAR: 'claude:session:star',
  /** 채팅 첨부 파일 저장 (clipboard 이미지/임시 파일 등) → 절대 경로 반환 */
  CLAUDE_ATTACHMENT_SAVE: 'claude:attachment:save',

  // AI
  AI_AVAILABLE: 'ai:available',
  AI_ASK: 'ai:ask',
  AI_BRIEFING: 'ai:briefing',
  AI_SUMMARIZE_TASK: 'ai:summarize-task',
  AI_GENERATE_REPORT: 'ai:generate-report',
  AI_GENERATE_WIKI: 'ai:generate-wiki',
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

  // Clauday Skills (target 별 파일시스템 스킬)
  CLAUDAY_SKILLS_LIST: 'clauday-skills:list',
  CLAUDAY_SKILLS_GET: 'clauday-skills:get',
  CLAUDAY_SKILLS_SAVE: 'clauday-skills:save',
  CLAUDAY_SKILLS_DELETE: 'clauday-skills:delete',
  CLAUDAY_SKILLS_FOR_TARGET: 'clauday-skills:for-target',

  // Shared Skills (Dooray 공개 프로젝트 기반 공유소)
  SHARED_SKILLS_LIST: 'shared-skills:list',
  SHARED_SKILLS_GET: 'shared-skills:get',
  SHARED_SKILLS_UPLOAD: 'shared-skills:upload',
  SHARED_SKILLS_DOWNLOAD: 'shared-skills:download',
  SHARED_SKILLS_DELETE: 'shared-skills:delete',

  // AI Skill Generator
  AI_WIKI_PROOFREAD: 'ai:wiki-proofread',
  AI_WIKI_IMPROVE: 'ai:wiki-improve',
  AI_GENERATE_SKILL: 'ai:generate-skill',

  // AI 활용 사례 추천 (개인 Claude Code 설정 기반)
  AI_RECOMMEND_ANALYZE: 'ai:recommend:analyze',
  AI_RECOMMEND_CACHE_GET: 'ai:recommend:cache:get',

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

  // Error report (Claude CLI 호출 진단 + 사용자 제보)
  ERROR_REPORT_COLLECT: 'error-report:collect',
  ERROR_REPORT_SUBMIT_COMMUNITY: 'error-report:submit-community',
  ERROR_REPORT_COPY_CLIPBOARD: 'error-report:copy-clipboard',

  // Feedback (v1.6.0 — Ultra Agent 직결)
  FEEDBACK_SUBMIT: 'feedback:submit',

  // Config
  CONFIG_CHANGED: 'config:changed'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
