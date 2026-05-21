import { app, BrowserWindow, ipcMain, shell, dialog, Menu } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { McpConfigManager } from './config/McpConfigManager'
import { SkillsManager } from './config/SkillsManager'
import { SharedSkillsService } from './skills/SharedSkillsService'
import { ConfigWatcher } from './config/ConfigWatcher'
import { UsageParser } from './usage/UsageParser'
import { DoorayClient } from './dooray/DoorayClient'
import { TaskService } from './dooray/TaskService'
import { WikiService } from './dooray/WikiService'
import { WikiStorageService } from './dooray/WikiStorageService'
import type { WikiStorageKind } from './dooray/WikiStorageService'
// CalendarService(두레이 네이티브 calendar v1 API) — v1.5 에서 UnifiedCalendarService 로 대체됨
import { CalDAVClient } from './caldav/CalDAVClient'
import { CalDAVCredentialStore } from './caldav/CredentialStore'
import { LocalEventStore } from './caldav/LocalEventStore'
import { UnifiedCalendarService } from './caldav/UnifiedCalendarService'
import { CTagPoller } from './caldav/CTagPoller'
import { CalendarObjectsStore } from './caldav/CalendarObjectsStore'
import { HolidayService } from './holiday/HolidayService'
import type {
  CalDAVEventCreate,
  CalDAVEventQuery,
  CalDAVSaveCredentialsInput
} from '../shared/types/caldav'
import type {
  UnifiedEventCreate,
  UnifiedEventDateTimeUpdate,
  UnifiedEventQuery,
  LocalCalendarCreate,
  LocalCalendarUpdate
} from '../shared/types/calendar'
import { MessengerService } from './dooray/MessengerService'
import { BotService } from './dooray/socket-mode/BotService'
import { MentionDispatcher } from './dooray/mention/MentionDispatcher'
import { ContextCollector } from './dooray/mention/ContextCollector'
import { buildPromptFromContext, extractUserRequest } from './dooray/mention/promptBuilder'
import { MentionTerminalSpawner } from './dooray/mention/MentionTerminalSpawner'
import { notifyMention } from './dooray/mention/MentionNotifier'
import { AgentWorkspaceManager } from './dooray/mention/AgentWorkspaceManager'
import { ChannelSessionStore } from './dooray/mention/ChannelSessionStore'
import { ClaudayResponder, extractOrgId } from './dooray/mention/ClaudayResponder'
import { HookServer, type HookEventPayload } from './dooray/mention/HookServer'
import { readLastAssistantText, truncateForMessenger } from './dooray/mention/transcriptReader'
import { relative as pathRelative, sep as pathSep, basename as pathBasename } from 'path'
import { WatcherService } from './watcher/WatcherService'
import { AiRecommendNotifier } from './ai-recommend/AiRecommendNotifier'
import { cleanFirstMessage } from './claude/sessionPreview'
import { AIService, setUserAnthropicApiKey, getClaudeBin } from './ai/AIService'
import { ClaudeChatService } from './claude/ClaudeChatService'
import { ClaudeSessionService } from './claude/ClaudeSessionService'
import { AttachmentService } from './claude/AttachmentService'
import Store from 'electron-store'
import { TerminalManager } from './terminal/TerminalManager'
import { SkillStore } from './skills/SkillStore'
import { GitService } from './git/GitService'
import { AnalyticsService } from './analytics/AnalyticsService'
import { IPC_CHANNELS } from '../shared/types/ipc'
import type { McpServerConfig } from '../shared/types/mcp'
import type { SkillSaveRequest } from '../shared/types/skills'
import type { UsageQueryParams } from '../shared/types/usage'
import type { DoorayTaskUpdateParams, DoorayWikiUpdateParams, DoorayCalendarQueryParams, DoorayTask } from '../shared/types/dooray'
import type { TerminalCreateOptions, TerminalResizeOptions } from '../shared/types/terminal'
import type { GitWorktreeCreateParams, GitWorktreeRemoveParams } from '../shared/types/git'

// Managers
const mcpConfigManager = new McpConfigManager()
const skillsManager = new SkillsManager()

/** Claude Code 스킬 공유소 (두레이 위키 하위 페이지) */
const SHARED_SKILL_WIKI_ID = '4312559241344624232'
const SHARED_SKILL_PARENT_PAGE_ID = '4315675585495536255'
const configWatcher = new ConfigWatcher()
const usageParser = new UsageParser()
const doorayClient = new DoorayClient()
const taskService = new TaskService(doorayClient)
const aiRecommendNotifier = new AiRecommendNotifier(taskService)
const wikiService = new WikiService(doorayClient)
// store 초기화는 아래에서 하지만, lambda 들이 method 호출 시점에 평가되므로 문제 없음.
// (단, 첫 IPC 호출 전에 store 가 반드시 초기화되어 있어야 함.)
const wikiStorage = new WikiStorageService(wikiService, {
  get: (k) => store.get(k) as string | undefined,
  set: (k, v) => store.set(k, v),
  delete: (k) => store.delete(k)
})
const sharedSkills = new SharedSkillsService(wikiService, skillsManager, {
  wikiId: SHARED_SKILL_WIKI_ID,
  parentPageId: SHARED_SKILL_PARENT_PAGE_ID
})
sharedSkills.setMyMemberIdResolver(() =>
  taskService.getMyMemberIdPublic().catch(() => null)
)
const caldavClient = new CalDAVClient()
const holidayService = new HolidayService()
const unifiedCalendar = new UnifiedCalendarService(caldavClient, holidayService)
// 시작 시 공휴일 백그라운드 refresh (캐시 7일 TTL 안이면 skip)
holidayService.getHolidays().catch((e) => console.error('[main] 공휴일 refresh 실패:', e))
const ctagPoller = new CTagPoller(unifiedCalendar)
ctagPoller.start()

// 자격증명만 있고 ICS 캐시가 비어있으면 시작 시 silent fullSync (앱 첫 부팅/캐시 클리어 후 등)
const _hasCreds = CalDAVCredentialStore.has()
const _cachedCalendars = CalendarObjectsStore.listCalendarUrls().length
const _cachedObjects = CalendarObjectsStore.totalObjectCount()
console.log('[main] CalDAV 부팅 상태:', { hasCredentials: _hasCreds, cachedCalendars: _cachedCalendars, cachedObjects: _cachedObjects })

// 옛 sync 흔적(time-range 도입 전 무제한 받은 큰 캐시) 자동 정리 — 임계값 10000
// (이전 2000은 캘린더/이벤트 많은 사용자가 매 부팅마다 강제 fullSync 도는 문제 있었음)
const STALE_CACHE_THRESHOLD = 10000
if (_cachedObjects > STALE_CACHE_THRESHOLD) {
  console.log(`[main] 큰 옛 캐시 감지 (${_cachedObjects} > ${STALE_CACHE_THRESHOLD}) → clearAll 후 새 fullSync`)
  CalendarObjectsStore.clearAll()
}

const _needFullSync = _hasCreds && CalendarObjectsStore.totalObjectCount() === 0
if (_needFullSync) {
  console.log('[main] 자동 fullSync 시작 (자격증명 있음 + ICS 캐시 0건)')
  unifiedCalendar.fullSync()
    .then((r) => console.log('[main] 자동 fullSync 완료:', r))
    .catch((e) => console.error('[main] 자동 fullSync 실패:', e))
} else if (!_hasCreds) {
  console.log('[main] 자동 fullSync skip: 자격증명 없음/손상')
} else {
  console.log('[main] 자동 fullSync skip: ICS 캐시 이미 존재 (' + CalendarObjectsStore.totalObjectCount() + '건)')
}

/**
 * v1.5: UnifiedCalendarService 결과를 옛 DoorayCalendarEvent 형식으로 변환.
 * 프론트의 BriefingPanel / list view / AI 분석이 점진적으로 새 인터페이스로
 * 옮겨가는 동안 호환 어댑터로 사용.
 */
async function getEventsLegacy(params: { from: string; to: string }): Promise<import('../shared/types/dooray').DoorayCalendarEvent[]> {
  const [evts, cals] = await Promise.all([
    unifiedCalendar.listEvents({ from: params.from, to: params.to }),
    unifiedCalendar.listCalendars()
  ])
  const calMap = new Map(cals.map((c) => [c.id, c]))
  return evts.map((e) => {
    const cal = calMap.get(e.calendarId)
    return {
      id: `${e.source}:${e.id}`,
      subject: e.summary,
      description: e.description,
      location: e.location,
      startedAt: e.start,
      endedAt: e.end,
      wholeDayFlag: e.allDay,
      calendar: cal ? { id: cal.id, name: cal.name } : undefined
    }
  })
}
const messengerService = new MessengerService(doorayClient)
sharedSkills.setMemberNameResolver((id) => messengerService.getMemberName(id))
const botService = new BotService(doorayClient)
const mentionDispatcher = new MentionDispatcher(botService, taskService)
const mentionContextCollector = new ContextCollector(messengerService)
const watcherService = new WatcherService(messengerService)
const aiService = new AIService()
const claudeChat = new ClaudeChatService(getClaudeBin())
const claudeSessions = new ClaudeSessionService()
const claudeAttachments = new AttachmentService()
const store = new Store({ name: 'clauday-data' })
const terminalManager = new TerminalManager()
const agentWorkspace = new AgentWorkspaceManager()
const channelSessionStore = new ChannelSessionStore()
const mentionTerminalSpawner = new MentionTerminalSpawner(terminalManager, channelSessionStore)
const claudayResponder = new ClaudayResponder(messengerService)
const hookServer = new HookServer()
/** turn 단위 도구 사용 누적 (channelId → list) — Stop hook에서 비우면서 요약 송신 */
const turnBuffers = new Map<string, Array<{ tool: string; detail: string }>>()

/** claude code hook → 두레이 알림 라우터.
 *  - cwd로 channelId 추출 (~/Clauday-Workspaces/agent/{channelId}/...)
 *  - PostToolUse: turnBuffers에 누적
 *  - Stop: 누적 요약을 [Clauday] 메시지로 송신 + markIdle */
async function handleClaudeHook(ev: HookEventPayload): Promise<void> {
  const channelId = extractChannelIdFromCwd(ev.cwd)
  if (!channelId) return

  if (ev.event === 'post_tool_use') {
    const detail = formatToolDetail(ev.tool_name, ev.tool_input)
    const buf = turnBuffers.get(channelId) || []
    buf.push({ tool: ev.tool_name || '?', detail })
    turnBuffers.set(channelId, buf)
    return
  }

  if (ev.event === 'stop') {
    const buf = turnBuffers.get(channelId) || []
    turnBuffers.delete(channelId)
    const session = channelSessionStore.get(channelId)
    const orgId = session?.organizationId

    // claude code가 hook payload에 last_assistant_message를 직접 넣어준다 (raw keys 확인됨).
    // transcript 파일을 읽는 것보다 단순하고 정확.
    let assistantText = extractAssistantMessage(ev.raw.last_assistant_message)

    const transcriptPath = (ev.raw.transcript_path as string | undefined) || ''
    // last_assistant_message가 비어있으면 transcript 파일에서 fallback 추출
    if (!assistantText && transcriptPath) {
      assistantText = readLastAssistantText(transcriptPath)
    }

    // transcript 파일명이 곧 claude session id (xxx.jsonl) — 다음 spawn 시 --resume에 사용
    if (transcriptPath) {
      const sid = pathBasename(transcriptPath).replace(/\.jsonl$/, '')
      if (sid) channelSessionStore.setClaudeSessionId(channelId, sid)
    }

    const body = composeStopMessage(assistantText, buf)
    await claudayResponder.send(channelId, body, orgId)
    channelSessionStore.markIdle(channelId)
  }
}

/** Stop 시 두레이로 보낼 메시지 본문 구성.
 *  주: claude의 응답 텍스트 (사용자에게 보여진 그 글). 없으면 "응답 완료" 폴백.
 *  부: 사용한 도구 짧은 목록 (turn 안에서 큰 변화가 있었는지 한눈에 보이게). */
function composeStopMessage(assistantText: string, buf: Array<{ tool: string; detail: string }>): string {
  const main = assistantText.trim()
    ? truncateForMessenger(assistantText.trim())
    : '응답 완료.'

  if (buf.length === 0) return main
  const items = buf.slice(0, 8).map((b) => b.detail ? `${b.tool}(${b.detail})` : b.tool)
  const more = buf.length > 8 ? ` 외 ${buf.length - 8}건` : ''
  return `${main}\n\n— 사용 도구: ${items.join(', ')}${more}`
}

function extractChannelIdFromCwd(cwd: string): string | null {
  if (!cwd) return null
  const agentRoot = agentWorkspace.getAgentRoot()
  if (!cwd.startsWith(agentRoot)) return null
  const rel = pathRelative(agentRoot, cwd)
  const seg = rel.split(pathSep)[0]
  return seg || null
}

/** claude code가 hook payload에 넣어주는 last_assistant_message → 평문 텍스트.
 *  형식 후보: string / { content: [{type:'text', text}] } / { text: string } */
function extractAssistantMessage(raw: unknown): string {
  if (!raw) return ''
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw !== 'object') return ''
  const m = raw as { content?: unknown; text?: unknown; message?: unknown }
  if (typeof m.text === 'string') return m.text.trim()
  if (m.message && typeof m.message === 'object') {
    return extractAssistantMessage(m.message)
  }
  if (Array.isArray(m.content)) {
    const parts: string[] = []
    for (const b of m.content) {
      if (b && typeof b === 'object') {
        const blk = b as { type?: string; text?: unknown }
        if (blk.type === 'text' && typeof blk.text === 'string') parts.push(blk.text)
      } else if (typeof b === 'string') {
        parts.push(b)
      }
    }
    return parts.join('\n').trim()
  }
  if (typeof m.content === 'string') return m.content.trim()
  return ''
}

function formatToolDetail(tool: string | undefined, input: Record<string, unknown> | undefined): string {
  if (!tool || !input) return ''
  const filePath = (input.file_path as string | undefined) || ''
  switch (tool) {
    case 'Edit':
    case 'Write':
    case 'Read':
      return filePath ? pathBasename(filePath) : ''
    case 'Bash': {
      const cmd = (input.command as string | undefined) || ''
      return cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd
    }
    case 'Glob':
    case 'Grep':
      return ((input.pattern as string | undefined) || '').slice(0, 40)
    default:
      return ''
  }
}
const skillStore = new SkillStore()
const gitService = new GitService()
const analyticsService = new AnalyticsService()

// (이전에는 브리핑/보고서 사이에 cachedTasks를 공유했지만, 두레이 측에서 상태가
// 바뀐 뒤에도 stale 데이터가 남아 보고서가 옛 상태를 출력하는 버그가 있었다.
// 이제 매 호출 시 항상 fresh fetch한다 — 이슈 #5)

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'Clauday',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#F4F6FA',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  configWatcher.setMainWindow(mainWindow)
  terminalManager.setMainWindow(mainWindow)
  aiService.setMainWindow(mainWindow)
  taskService.setMainWindow(mainWindow)
  // customProjects는 과거 객체 배열 / 신규 문자열 배열 둘 다 지원
  const rawCustom = store.get('customProjects', []) as unknown[]
  const customIds = rawCustom.map((x) =>
    typeof x === 'string' ? x : (x && typeof x === 'object' && 'id' in x ? String((x as { id: unknown }).id) : '')
  ).filter(Boolean)
  taskService.setCustomProjectIds(customIds)
  watcherService.setMainWindow(mainWindow)
  watcherService.start()
  // 두레이 봇 (Socket Mode WebSocket) — 토큰/도메인이 설정돼있고 enabled면 부팅 시 자동 시작
  botService.setMainWindow(mainWindow)
  // 들어오는 메시지를 와처에 실시간 전달 (폴링과 공존, dedup 자동)
  botService.addEventListener((ev) => {
    void watcherService.handleSocketEvent(ev).catch((err) =>
      console.error('[WatcherService] handleSocketEvent 실패:', err)
    )
  })
  // v1.4: @clauday 멘션 디스패처 — 와처와 독립. 토큰 주인의 멘션만 트리거.
  mentionDispatcher.setEnabled(
    (store.get('doorayMentionTrigger.enabled', true) as boolean) ?? true
  )
  mentionDispatcher.setTrigger(
    (store.get('doorayMentionTrigger.keyword', 'clauday') as string) || 'clauday'
  )
  mentionTerminalSpawner.setMainWindow(mainWindow)
  // 사용자가 store에 customRoot 저장한 게 있으면 적용 (없으면 ~/Clauday-Workspaces/ default)
  const customWorkspaceRoot = store.get('agentWorkspaceRoot', '') as string
  if (customWorkspaceRoot) agentWorkspace.setRoot(customWorkspaceRoot)
  // Hook 서버 시작 — claude code의 PostToolUse/Stop hook이 여기로 POST됨
  void hookServer.start().then(({ port, secret }) => {
    agentWorkspace.setHookConfig({ port, secret })
    hookServer.setHandler((ev) => handleClaudeHook(ev))
  }).catch((err) => console.error('[HookServer] start 실패:', err))
  mentionDispatcher.onMention(async (ctx) => {
    try {
      const orgId = extractOrgId(ctx)
      // 동시 작업 차단 — 같은 채널에서 진행 중이면 거부 + 두레이 채널로 안내
      const busyState = mentionTerminalSpawner.checkBusy(ctx.channelId)
      if (busyState.busy) {
        const minutes = Math.max(1, Math.floor(busyState.sinceMs / 60000))
        await claudayResponder.send(
          ctx.channelId,
          `이전 작업이 아직 진행 중입니다 (시작 ${minutes}분 전). 끝나면 다시 호출해주세요.`,
          orgId
        )
        console.log(`[Mention] busy 거부 channelId=${ctx.channelId} since=${minutes}m`)
        return
      }
      const windowSize =
        (store.get('doorayMentionTrigger.windowSize', 50) as number) || 50
      const collected = await mentionContextCollector.collect(
        ctx.channelId,
        ctx.logId,
        windowSize,
        ctx.channelDisplayName
      )
      const prompt = buildPromptFromContext(collected)
      const ws = agentWorkspace.ensureChannel(ctx.channelId, collected.channelName)
      const promptRelPath = agentWorkspace.writeTaskPrompt(
        ctx.channelId,
        ctx.logId,
        prompt
      )
      // 알림은 사용자 인지를 위해 dispatch 전에 즉시
      notifyMention(mainWindow, {
        channelName: collected.channelName,
        preview: ctx.text
      })
      // 사이드바 배지/pulse 트리거용 IPC push
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.MENTION_RECEIVED, {
          channelId: ctx.channelId,
          channelName: collected.channelName,
          text: ctx.text,
          logId: ctx.logId,
          sentAt: ctx.sentAt
        })
      }
      // 시작 알림 — 두레이 채널로 즉시 통보
      await claudayResponder.send(ctx.channelId, '작업을 시작합니다.', orgId)
      // organizationId를 세션에 저장 (Stop hook에서 종료 알림 송신 시 재사용)
      channelSessionStore.set(ctx.channelId, channelSessionStore.get(ctx.channelId)?.tabId || '', collected.channelName, orgId)

      // 멘션에서 @clauday 떼낸 실제 요청을 한 줄 입력에 직접 박는다 (md 파일과 분리)
      const userRequest = extractUserRequest(ctx.text, mentionDispatcher.getTrigger())
      const result = await mentionTerminalSpawner.dispatch({
        channelId: ctx.channelId,
        channelName: collected.channelName,
        channelDir: ws.channelDir,
        promptRelPath,
        userRequest
      })
      // dispatch가 set을 또 호출하니 orgId가 누락되지 않게 한 번 더 보강
      const cur = channelSessionStore.get(ctx.channelId)
      if (cur && !cur.organizationId && orgId) {
        channelSessionStore.set(ctx.channelId, cur.tabId, cur.channelName, orgId)
      }
      console.log(
        `[Mention] dispatch 완료 tabId=${result.tabId} reused=${result.reused} ` +
        `messages=${collected.messages.length} prompt=${promptRelPath}`
      )
    } catch (err) {
      console.error('[Mention] 파이프라인 실패:', err)
    }
  })
  mentionDispatcher.start()
  void botService.start().catch((err) => console.error('[BotService] start 실패:', err))
  // AI가 스킬을 system prompt에 자동으로 합치도록 연결 (enabled && autoApply 스킬만)
  aiService.setSkillLoader((target) => {
    const skills = skillStore.forTarget(target)
    return skills.map((s) => ({ name: s.name, content: s.content }))
  })
  // 저장된 모델 설정 로드
  aiService.setModelConfig((store.get('aiModelConfig', {}) as import('../shared/types/ai').AIModelConfig) || {})
  // 저장된 Anthropic API 키 로드 (패키징 앱에서 키체인 접근 실패 시 대안)
  setUserAnthropicApiKey((store.get('anthropicApiKey', '') as string) || null)

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function registerIpcHandlers(): void {
  // MCP
  ipcMain.handle(IPC_CHANNELS.MCP_LIST, () => mcpConfigManager.list())
  ipcMain.handle(
    IPC_CHANNELS.MCP_ADD,
    (_, { name, config }: { name: string; config: McpServerConfig }) =>
      mcpConfigManager.add(name, config)
  )
  ipcMain.handle(
    IPC_CHANNELS.MCP_UPDATE,
    (_, { name, config }: { name: string; config: McpServerConfig }) =>
      mcpConfigManager.update(name, config)
  )
  ipcMain.handle(IPC_CHANNELS.MCP_DELETE, (_, name: string) => mcpConfigManager.delete(name))

  // Skills
  ipcMain.handle(IPC_CHANNELS.SKILLS_LIST, () => skillsManager.list())
  ipcMain.handle(IPC_CHANNELS.SKILLS_READ, (_, filename: string) => skillsManager.read(filename))
  ipcMain.handle(IPC_CHANNELS.SKILLS_SAVE, (_, req: SkillSaveRequest) => skillsManager.save(req))
  ipcMain.handle(IPC_CHANNELS.SHARED_SKILLS_LIST, () => sharedSkills.list())
  ipcMain.handle(IPC_CHANNELS.SHARED_SKILLS_GET, (_, postId: string) => sharedSkills.get(postId))
  ipcMain.handle(
    IPC_CHANNELS.SHARED_SKILLS_UPLOAD,
    (_, req: import('../shared/types/shared-skills').SharedSkillUploadRequest) => sharedSkills.upload(req)
  )
  ipcMain.handle(IPC_CHANNELS.SHARED_SKILLS_DOWNLOAD, (_, postId: string) => sharedSkills.download(postId))
  ipcMain.handle(IPC_CHANNELS.SHARED_SKILLS_DELETE, (_, postId: string) => sharedSkills.delete(postId))
  ipcMain.handle(IPC_CHANNELS.SKILLS_DELETE, (_, filename: string) =>
    skillsManager.delete(filename)
  )
  ipcMain.handle(IPC_CHANNELS.SKILLS_DELETE_MANY, (_, filenames: string[]) =>
    skillsManager.deleteMany(filenames)
  )
  ipcMain.handle(IPC_CHANNELS.SKILLS_IMPORT, () => skillsManager.importFromFiles())
  ipcMain.handle(IPC_CHANNELS.SKILLS_EXPORT, (_, filenames: string[]) =>
    skillsManager.exportToFolder(filenames)
  )

  // AI 추천 새 글 알림 (#7) — 토글 IPC
  ipcMain.handle(IPC_CHANNELS.AI_RECOMMEND_NOTIFY_GET_ENABLED, () => aiRecommendNotifier.isEnabled())
  ipcMain.handle(IPC_CHANNELS.AI_RECOMMEND_NOTIFY_SET_ENABLED, (_, enabled: boolean) => {
    aiRecommendNotifier.setEnabled(!!enabled)
    return { ok: true as const, enabled: aiRecommendNotifier.isEnabled() }
  })

  // CLAUDE.md 카탈로그 (#3) — 앱 내장 템플릿 목록 + 적용
  // apply: 사용자에게 폴더 선택 dialog 띄우고, 그 폴더의 CLAUDE.md 에 본문 저장.
  // 이미 파일이 있으면 overwrite=true 일 때만 덮어씀.
  ipcMain.handle(IPC_CHANNELS.CLAUDE_MD_TEMPLATES_LIST, async () => {
    const { CLAUDE_MD_TEMPLATES } = await import('./claudeMdCatalog')
    return CLAUDE_MD_TEMPLATES.map(({ id, name, description }) => ({ id, name, description }))
  })
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_MD_TEMPLATES_APPLY,
    async (
      _,
      input: { id: string; cwd?: string; overwrite?: boolean }
    ): Promise<{ ok: boolean; path?: string; conflict?: boolean; error?: string }> => {
      const { findClaudeMdTemplate } = await import('./claudeMdCatalog')
      const tpl = findClaudeMdTemplate(input.id)
      if (!tpl) return { ok: false, error: '존재하지 않는 템플릿입니다.' }
      let targetCwd = input.cwd
      if (!targetCwd) {
        const win = BrowserWindow.getFocusedWindow()
        const r = await dialog.showOpenDialog(win!, {
          properties: ['openDirectory', 'createDirectory'],
          title: 'CLAUDE.md 를 적용할 프로젝트 폴더 선택',
          buttonLabel: '여기에 적용'
        })
        if (r.canceled || r.filePaths.length === 0) return { ok: false, error: 'cancelled' }
        targetCwd = r.filePaths[0]
      }
      const fs = await import('fs')
      const { join } = await import('path')
      const target = join(targetCwd, 'CLAUDE.md')
      try {
        if (fs.existsSync(target) && !input.overwrite) {
          return { ok: false, path: target, conflict: true }
        }
        await fs.promises.writeFile(target, tpl.body, 'utf-8')
        return { ok: true, path: target }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : '쓰기 실패' }
      }
    }
  )

  // 이미지 → data URL (#2 사이드 패널 썸네일). 5MB 초과면 거절. 간단 LRU 캐시.
  const imageDataUrlCache = new Map<string, { url: string; mtimeMs: number; size: number }>()
  ipcMain.handle(IPC_CHANNELS.SHELL_READ_IMAGE_DATAURL, async (_, target: string): Promise<{ ok: boolean; dataUrl?: string; error?: string }> => {
    if (!target || typeof target !== 'string') return { ok: false, error: 'invalid target' }
    const { homedir } = await import('os')
    const fs = await import('fs')
    const { extname, basename } = await import('path')
    const expanded = target.startsWith('~/') || target === '~'
      ? target.replace(/^~/, homedir())
      : target
    try {
      const stat = await fs.promises.stat(expanded)
      if (!stat.isFile()) return { ok: false, error: 'not a file' }
      if (stat.size > 5 * 1024 * 1024) return { ok: false, error: 'too large (>5MB)' }
      const cached = imageDataUrlCache.get(expanded)
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return { ok: true, dataUrl: cached.url }
      }
      const ext = extname(expanded).slice(1).toLowerCase() || 'png'
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
      const buf = await fs.promises.readFile(expanded)
      const url = `data:${mime};base64,${buf.toString('base64')}`
      // 캐시 사이즈 cap (20개)
      if (imageDataUrlCache.size > 20) {
        const firstKey = imageDataUrlCache.keys().next().value as string | undefined
        if (firstKey) imageDataUrlCache.delete(firstKey)
      }
      imageDataUrlCache.set(expanded, { url, mtimeMs: stat.mtimeMs, size: stat.size })
      void basename(expanded)
      return { ok: true, dataUrl: url }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'read failed' }
    }
  })

  // Show in Finder / Explorer — 파일의 부모 폴더 열고 해당 파일을 highlight (Warp 풍 hover 액션).
  ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_IN_FOLDER, async (_, target: string) => {
    if (!target || typeof target !== 'string') return { ok: false, error: 'invalid target' }
    const { homedir } = await import('os')
    const expanded = target.startsWith('~/') || target === '~'
      ? target.replace(/^~/, homedir())
      : target
    try {
      shell.showItemInFolder(expanded)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'show failed' }
    }
  })

  // Shell — OS 기본 핸들러로 path/URL 열기. 절대경로/URL 만 허용.
  // 상대경로는 cwd 결합이 필요한데 호출 측이 미리 절대경로로 만들어 전달해야 함.
  // ~/ 시작은 home 으로 자동 치환.
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_PATH, async (_, target: string) => {
    if (!target || typeof target !== 'string') return { ok: false, error: 'invalid target' }
    if (/^(https?|mailto|vscode|cursor|file):/i.test(target)) {
      await shell.openExternal(target)
      return { ok: true }
    }
    const { homedir } = await import('os')
    const expanded = target.startsWith('~/') || target === '~'
      ? target.replace(/^~/, homedir())
      : target
    const err = await shell.openPath(expanded)
    return err ? { ok: false, error: err } : { ok: true }
  })

  // Usage (5분 캐시)
  const usageCache: Record<string, { data: unknown; timestamp: number }> = {}
  ipcMain.handle(IPC_CHANNELS.USAGE_QUERY, async (_, params: UsageQueryParams) => {
    const key = params.period
    const cached = usageCache[key]
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) return cached.data
    const data = await usageParser.query(params)
    usageCache[key] = { data, timestamp: Date.now() }
    return data
  })

  // Dooray
  ipcMain.handle(IPC_CHANNELS.DOORAY_TOKEN_SET, async (_, token: string) => {
    const r = await doorayClient.setToken(token)
    // 토큰 새로 설정되면 AI 추천 폴러 재시작 (silent 초기 fetch 로 cursor 갱신)
    aiRecommendNotifier.stop()
    aiRecommendNotifier.start().catch((e) => console.warn('[main] notifier 재시작 실패:', e))
    return r
  })
  ipcMain.handle(IPC_CHANNELS.DOORAY_TOKEN_GET, () => doorayClient.getToken())
  ipcMain.handle(IPC_CHANNELS.DOORAY_TOKEN_DELETE, async () => {
    const r = await doorayClient.deleteToken()
    aiRecommendNotifier.stop()
    return r
  })
  ipcMain.handle(IPC_CHANNELS.DOORAY_TOKEN_VALIDATE, () => doorayClient.validateToken())
  ipcMain.handle(IPC_CHANNELS.DOORAY_MY_MEMBER_ID, () =>
    taskService.getMyMemberIdPublic().catch(() => null)
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_PROJECTS_LIST, () =>
    taskService.listMyProjects()
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_PROJECT_INFO, (_, projectId: string) =>
    taskService.getProjectInfo(projectId)
  )
  // 커뮤니티: 게시글(=태스크) 생성
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASK_TEMPLATES_LIST,
    (_, projectId: string) => taskService.listProjectTemplates(projectId)
  )
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASK_TEMPLATE_DETAIL,
    (_, { projectId, templateId }: { projectId: string; templateId: string }) =>
      taskService.getProjectTemplate(projectId, templateId)
  )
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASK_CREATE,
    (_, params: { projectId: string; subject: string; body: string; assigneeIds?: string[]; tagIds?: string[] }) =>
      taskService.createTask(params)
  )
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_PROJECT_TAGS_LIST,
    (_, projectId: string) => taskService.listProjectTags(projectId)
  )
  // 커뮤니티: 댓글 생성
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASK_COMMENT_CREATE,
    (_, params: { projectId: string; postId: string; content: string }) =>
      taskService.createTaskComment(params)
  )
  // 파일 업로드 (ArrayBuffer로 받음)
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASK_UPLOAD_FILE,
    (_, params: { projectId: string; postId: string; filename: string; mime: string; data: ArrayBuffer }) =>
      taskService.uploadFileToTask(params)
  )
  // 본문 업데이트 (이미지 업로드 후 링크 치환에 사용)
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASK_UPDATE_BODY,
    (_, params: { projectId: string; postId: string; subject: string; body: string }) =>
      taskService.updateTaskBody(params)
  )
  // 댓글 본문 수정
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASK_COMMENT_UPDATE,
    (_, params: { projectId: string; postId: string; logId: string; content: string }) =>
      taskService.updateTaskComment(params)
  )
  // 태스크(커뮤니티 글) 삭제 — 본인 글만. 호출 측(renderer)이 senderId 비교로 사전 검증.
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASK_DELETE,
    (_, params: { projectId: string; postId: string }) =>
      taskService.deleteTask(params)
  )
  // 댓글 삭제 — 본인 댓글만.
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASK_COMMENT_DELETE,
    (_, params: { projectId: string; postId: string; logId: string }) =>
      taskService.deleteTaskComment(params)
  )
  // 커뮤니티: 게시글 목록
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_COMMUNITY_POSTS,
    (_, { projectId, page, size }: { projectId: string; page?: number; size?: number }) =>
      taskService.listCommunityPosts(projectId, page, size)
  )
  // 메신저: 채널 목록
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_MESSENGER_CHANNELS,
    (_, { force }: { force?: boolean } = {}) => messengerService.listChannels(!!force)
  )
  // 메신저: 메시지 전송
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_MESSENGER_SEND,
    (_, { channelId, text, organizationId }: { channelId: string; text: string; organizationId?: string }) =>
      messengerService.sendMessage(channelId, text, organizationId)
  )

  // 두레이 봇 (Socket Mode WebSocket) — 도메인 입력만으로 자동 활성
  ipcMain.handle(IPC_CHANNELS.BOT_GET_CONFIG, () => ({
    domain: botService.getDomain()
  }))
  ipcMain.handle(
    IPC_CHANNELS.BOT_SET_CONFIG,
    async (_, payload: { domain?: string }) => {
      if (typeof payload.domain === 'string') {
        botService.setDomain(payload.domain)
      }
      await botService.restart()
      return botService.getStatus()
    }
  )
  ipcMain.handle(IPC_CHANNELS.BOT_GET_STATUS, () => botService.getStatus())
  ipcMain.handle(IPC_CHANNELS.BOT_START, () => botService.start())
  ipcMain.handle(IPC_CHANNELS.BOT_STOP, () => botService.stop())
  // AI: 메신저 메시지 정리/생성
  ipcMain.handle(
    IPC_CHANNELS.AI_COMPOSE_MESSAGE,
    (_, { instruction, channelName, requestId }: { instruction: string; channelName?: string; requestId?: string }) =>
      aiService.composeMessengerMessage(instruction, channelName, requestId)
  )
  // AI: 자연어 → 필터 규칙 JSON
  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_FILTER,
    (_, { instruction, requestId }: { instruction: string; requestId?: string }) =>
      aiService.generateFilterRule(instruction, requestId)
  )

  // ===== Watcher (모니터링) =====
  ipcMain.handle(IPC_CHANNELS.WATCHER_LIST, () => watcherService.listWatchers())
  ipcMain.handle(
    IPC_CHANNELS.WATCHER_CREATE,
    (_, req: import('../shared/types/watcher').WatcherCreateRequest) => watcherService.createWatcher(req)
  )
  ipcMain.handle(
    IPC_CHANNELS.WATCHER_UPDATE,
    (_, { id, patch }: { id: string; patch: import('../shared/types/watcher').WatcherUpdateRequest }) =>
      watcherService.updateWatcher(id, patch)
  )
  ipcMain.handle(IPC_CHANNELS.WATCHER_DELETE, (_, id: string) => watcherService.deleteWatcher(id))
  ipcMain.handle(IPC_CHANNELS.WATCHER_MESSAGES, (_, watcherId: string) =>
    watcherService.messagesForWatcher(watcherId)
  )
  ipcMain.handle(IPC_CHANNELS.WATCHER_MARK_READ, (_, ids: string[]) => watcherService.markRead(ids))
  ipcMain.handle(IPC_CHANNELS.WATCHER_MARK_ALL_READ, (_, watcherId: string) => watcherService.markAllRead(watcherId))
  ipcMain.handle(IPC_CHANNELS.WATCHER_REFRESH, (_, watcherId?: string) => watcherService.refresh(watcherId))
  ipcMain.handle(IPC_CHANNELS.WATCHER_UNREAD_COUNT, () => watcherService.unreadCounts())
  // 파일/이미지 fetch (인증 토큰 필요한 리소스를 data URL로 반환, 10분 캐시)
  const fileCache = new Map<string, { dataUrl: string; at: number }>()
  ipcMain.handle(IPC_CHANNELS.DOORAY_FILE_FETCH, async (_, args: unknown) => {
    // 여러 형태 지원 (호환성)
    let path: string | undefined
    let context: { projectId?: string; postId?: string; wikiId?: string; pageId?: string } | undefined

    if (typeof args === 'string') {
      path = args
    } else if (args && typeof args === 'object') {
      const o = args as { path?: unknown; context?: unknown }
      if (typeof o.path === 'string') {
        path = o.path
        context = o.context as typeof context
      }
    }
    if (!path) throw new Error(`잘못된 파라미터 (${typeof args})`)

    const cacheKey = context
      ? `${path}|${context.projectId || ''}|${context.postId || ''}|${context.wikiId || ''}|${context.pageId || ''}`
      : path
    const now = Date.now()
    const cached = fileCache.get(cacheKey)
    if (cached && now - cached.at < 10 * 60 * 1000) return cached.dataUrl
    const dataUrl = await doorayClient.fetchBinary(path, context)
    fileCache.set(cacheKey, { dataUrl, at: now })
    if (fileCache.size > 50) {
      const oldest = Array.from(fileCache.entries()).sort((a, b) => a[1].at - b[1].at)[0]
      if (oldest) fileCache.delete(oldest[0])
    }
    return dataUrl
  })
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASKS_LIST,
    (_, payload?: string[] | { projectIds?: string[]; force?: boolean }) => {
      // 구버전 호환: payload가 string[]이면 캐시 사용. 객체면 force 옵션 적용.
      if (Array.isArray(payload) || payload === undefined) {
        return taskService.listMyTasks(payload)
      }
      return taskService.listMyTasks(payload.projectIds, payload.force === true)
    }
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_TASKS_CC, (_, projectIds?: string[]) =>
    taskService.listMyCcTasks(projectIds)
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_TASKS_UPDATE, (_, params: DoorayTaskUpdateParams) =>
    taskService.updateTaskStatus(params)
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_WIKI_LIST, (_, projectId: string) =>
    wikiService.list(projectId)
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_WIKI_CHILDREN, (_, { wikiId, parentPageId }: { wikiId: string; parentPageId: string }) =>
    wikiService.list(wikiId, parentPageId)
  )
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_WIKI_GET,
    (_, { projectId, pageId }: { projectId: string; pageId: string }) =>
      wikiService.get(projectId, pageId)
  )
  ipcMain.handle(IPC_CHANNELS.DOORAY_WIKI_UPDATE, (_, params: DoorayWikiUpdateParams) =>
    wikiService.update(params)
  )
  // 나만의 위키 저장소 — 스킬/MCP 보관용 (사용자가 입력한 위키 페이지 URL 하위에 컨테이너 생성)
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_WIKI_STORAGE_LIST,
    (_, { wikiId, kind, parentPageIdHint }: { wikiId: string; kind: WikiStorageKind; parentPageIdHint?: string }) =>
      wikiStorage.list(wikiId, kind, parentPageIdHint)
  )
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_WIKI_STORAGE_GET,
    (_, { wikiId, pageId }: { wikiId: string; pageId: string }) =>
      wikiStorage.get(wikiId, pageId)
  )
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_WIKI_STORAGE_UPLOAD,
    (_, params: { wikiId: string; kind: WikiStorageKind; name: string; content: string; parentPageIdHint?: string }) =>
      wikiStorage.upload(params)
  )
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_WIKI_STORAGE_SOFT_DELETE,
    (_, { wikiId, pageId }: { wikiId: string; pageId: string }) =>
      wikiStorage.softDelete(wikiId, pageId)
  )
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_WIKI_STORAGE_RESOLVE,
    (_, input: string) => wikiStorage.resolveWikiId(input)
  )
  // 옛 dooray.calendar.* IPC 는 v1.5 에서 UnifiedCalendarService 어댑터로 동작.
  // 두레이 네이티브 calendar v1 API 직접 호출은 더 이상 하지 않음.
  ipcMain.handle(IPC_CHANNELS.DOORAY_CALENDAR_LIST, async () => {
    const cals = await unifiedCalendar.listCalendars()
    return cals.map((c) => ({ id: c.id, name: c.name, type: c.source }))
  })
  ipcMain.handle(IPC_CHANNELS.DOORAY_CALENDAR_EVENTS, (_, params: DoorayCalendarQueryParams) =>
    getEventsLegacy(params)
  )

  // CalDAV (v1.5)
  ipcMain.handle(IPC_CHANNELS.CALDAV_TEST_CONNECT, (_, input: CalDAVSaveCredentialsInput) =>
    caldavClient.testConnection(input.username, input.password)
  )
  ipcMain.handle(IPC_CHANNELS.CALDAV_SAVE_CREDENTIALS, (_, input: CalDAVSaveCredentialsInput) => {
    CalDAVCredentialStore.save(input.username, input.password)
    caldavClient.invalidate()
    unifiedCalendar.invalidateCache()
    // 새 자격증명으로 polling 재가동 (이미 시작된 상태면 그대로 다음 tick 부터 새 자격증명 사용)
    return { ok: true as const }
  })
  ipcMain.handle(IPC_CHANNELS.CALDAV_STATUS, () => ({
    connected: CalDAVCredentialStore.has(),
    username: CalDAVCredentialStore.getUsername()
  }))
  ipcMain.handle(IPC_CHANNELS.CALDAV_DISCONNECT, () => {
    CalDAVCredentialStore.clear()
    caldavClient.invalidate()
    unifiedCalendar.invalidateCache()
    return { ok: true as const }
  })
  ipcMain.handle(IPC_CHANNELS.CALDAV_LIST_CALENDARS, () => caldavClient.listCalendars())
  ipcMain.handle(IPC_CHANNELS.CALDAV_LIST_EVENTS, (_, q: CalDAVEventQuery) => caldavClient.listEvents(q))
  ipcMain.handle(IPC_CHANNELS.CALDAV_CREATE_EVENT, (_, input: CalDAVEventCreate) => caldavClient.createEvent(input))
  ipcMain.handle(IPC_CHANNELS.CALDAV_DELETE_EVENT, (_, p: { url: string; etag?: string }) =>
    caldavClient.deleteEvent(p.url, p.etag)
  )
  ipcMain.handle(IPC_CHANNELS.CALDAV_FULL_SYNC, () => unifiedCalendar.fullSync())
  ipcMain.handle(IPC_CHANNELS.CALDAV_INCREMENTAL_SYNC, () => unifiedCalendar.incrementalSync())

  // Calendar (통합)
  ipcMain.handle(IPC_CHANNELS.CALENDAR_LIST_CALENDARS, () => unifiedCalendar.listCalendars())
  ipcMain.handle(IPC_CHANNELS.CALENDAR_LIST_EVENTS, (_, q: UnifiedEventQuery) =>
    unifiedCalendar.listEvents(q)
  )
  ipcMain.handle(IPC_CHANNELS.CALENDAR_CREATE_EVENT, (_, input: UnifiedEventCreate) =>
    unifiedCalendar.createEvent(input)
  )
  ipcMain.handle(IPC_CHANNELS.CALENDAR_UPDATE_EVENT_DATETIME, (_, input: UnifiedEventDateTimeUpdate) =>
    unifiedCalendar.updateEventDateTime(input)
  )
  ipcMain.handle(
    IPC_CHANNELS.CALENDAR_DELETE_EVENT,
    (_, p: { source: 'local' | 'caldav'; id: string; calendarId?: string; caldavUrl?: string; etag?: string }) =>
      unifiedCalendar.deleteEvent(p)
  )
  ipcMain.handle(IPC_CHANNELS.LOCAL_CALENDAR_CREATE, (_, input: LocalCalendarCreate) =>
    LocalEventStore.createCalendar(input.name, input.color)
  )
  ipcMain.handle(IPC_CHANNELS.LOCAL_CALENDAR_UPDATE, (_, input: LocalCalendarUpdate) => {
    LocalEventStore.updateCalendar(input.id, { name: input.name, color: input.color })
    return { ok: true as const }
  })
  ipcMain.handle(IPC_CHANNELS.LOCAL_CALENDAR_DELETE, (_, id: string) => {
    LocalEventStore.deleteCalendar(id)
    return { ok: true as const }
  })

  // Terminal
  ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, (_, opts?: TerminalCreateOptions) =>
    terminalManager.create(opts)
  )
  ipcMain.on(IPC_CHANNELS.TERMINAL_INPUT, (_, { id, data }: { id: string; data: string }) =>
    terminalManager.input(id, data)
  )
  ipcMain.on(IPC_CHANNELS.TERMINAL_RESIZE, (_, opts: TerminalResizeOptions) =>
    terminalManager.resize(opts)
  )
  ipcMain.handle(IPC_CHANNELS.TERMINAL_KILL, (_, id: string) =>
    terminalManager.kill(id)
  )
  ipcMain.handle(IPC_CHANNELS.TERMINAL_LIST, () => terminalManager.listSessions())
  ipcMain.handle(IPC_CHANNELS.TERMINAL_SAVE_OUTPUT, (_, id: string) => terminalManager.getOutput(id))
  ipcMain.handle(IPC_CHANNELS.TERMINAL_RESTORE, () => {
    return store.get('terminalSessions', []) as Array<{ meta: { id: string; name: string; cwd: string }; output: string }>
  })
  ipcMain.handle(IPC_CHANNELS.TERMINAL_RENAME, (_, { id, name }: { id: string; name: string }) => {
    const ok = terminalManager.setName(id, name)
    // 즉시 자동 저장 한 번 더 (다음 30초 폴링 전에 종료돼도 이름 보존되게)
    if (ok) {
      try {
        const sessions = terminalManager.exportSessions()
        if (sessions.length > 0) store.set('terminalSessions', sessions)
      } catch { /* ok */ }
    }
    return ok
  })

  // Claude Code Task Bridge - 태스크 컨텍스트로 Claude Code 세션 시작
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_START_TASK,
    (_, { subject, body, projectCode }: { subject: string; body?: string; projectCode?: string }) => {
      const prompt = [
        `두레이 태스크를 시작합니다.`,
        `프로젝트: ${projectCode || '알 수 없음'}`,
        `태스크: ${subject}`,
        body ? `\n설명:\n${body.substring(0, 2000)}` : '',
        `\n이 태스크를 분석하고 필요한 작업을 진행해주세요.`
      ].filter(Boolean).join('\n')

      const session = terminalManager.create({
        command: 'claude',
        args: ['-p', prompt, '--model', 'sonnet'],
        cwd: require('os').homedir()
      })
      return session
    }
  )

  // Dooray Task Detail
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASK_DETAIL,
    (_, { projectId, taskId }: { projectId: string; taskId: string }) =>
      taskService.getTaskDetail(projectId, taskId)
  )

  // Task comments
  ipcMain.handle(
    IPC_CHANNELS.DOORAY_TASK_COMMENTS,
    (_, { projectId, taskId }: { projectId: string; taskId: string }) =>
      taskService.getTaskComments(projectId, taskId)
  )

  // Claude Code Chat (interactive transcript)
  ipcMain.handle(IPC_CHANNELS.CLAUDE_CHAT_SEND, async (
    _,
    req: import('../shared/types/claude-chat').ClaudeChatSendRequest
  ) => {
    const { sessionIdPromise } = claudeChat.send(req)
    return sessionIdPromise
  })
  ipcMain.handle(IPC_CHANNELS.CLAUDE_CHAT_CANCEL, async (_, chatId: string) => {
    claudeChat.cancel(chatId)
    return true
  })
  ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSION_LIST, async (_, cwd?: string) =>
    claudeSessions.listSessions(cwd)
  )
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_SESSION_LOAD,
    async (_, { sessionId, cwd }: { sessionId: string; cwd: string }) =>
      claudeSessions.loadSession(sessionId, cwd)
  )
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_SESSION_RENAME,
    async (_, { sessionId, title }: { sessionId: string; title: string }) => {
      claudeSessions.setCustomTitle(sessionId, title)
    }
  )
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_SESSION_STAR,
    async (_, { sessionId, starred }: { sessionId: string; starred: boolean }) => {
      claudeSessions.setStarred(sessionId, starred)
    }
  )
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_ATTACHMENT_SAVE,
    async (_, { name, data }: { name: string; data: ArrayBuffer | Uint8Array }) =>
      claudeAttachments.save(name, data)
  )

  // AI
  ipcMain.handle(IPC_CHANNELS.AI_AVAILABLE, () => aiService.isAvailable())
  ipcMain.handle(
    IPC_CHANNELS.AI_ASK,
    async (_, { prompt, systemPrompt, model, maxBudget, requestId, feature, mcpServers, imagePaths }: {
      prompt: string
      systemPrompt?: string
      model?: import('../shared/types/ai').AIModelName
      maxBudget?: string
      requestId?: string
      feature?: keyof import('../shared/types/ai').AIModelConfig
      mcpServers?: string[]
      imagePaths?: string[]
    }) => aiService.ask(prompt, { systemPrompt, model, maxBudget, requestId, feature, mcpServers, imagePaths })
  )
  ipcMain.handle(IPC_CHANNELS.AI_BRIEFING, async (_, opts?: { requestId?: string; mcpServers?: string[] }) => {
    const requestId = opts?.requestId
    const mcpServers = opts?.mcpServers
    const started = Date.now()
    const emit = (message: string): void => {
      if (!requestId) return
      const win = BrowserWindow.getAllWindows()[0]
      if (!win || win.isDestroyed()) return
      win.webContents.send(IPC_CHANNELS.AI_PROGRESS, {
        requestId,
        stage: 'collecting',
        message,
        elapsedMs: Date.now() - started
      })
    }
    try {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const endOfWeek = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000)

      // 정책 변경: 사용자가 토글한 프로젝트의 태스크 + 토글한 캘린더 일정은 **항상** main 이 사전 fetch.
      // 스킬/MCP 는 base 데이터 위 보강 분석 (특정 키워드 필터, 외부 정보, 가공 룰) 으로만 쓰임.
      // 예전 'delegateAll' 모드는 base 데이터 누락 위험이 커서 제거.
      const briefingSkills = skillStore.forTarget('briefing')
      const hasActiveSkill = briefingSkills.length > 0
      const pinnedProjects = (store.get('pinnedProjects', []) as string[]) || []
      const pinnedCalendars = (store.get('pinnedCalendars', []) as string[]) || []

      emit('📋 담당 태스크 조회 중...')
      const tasksP = taskService.listMyTasks(pinnedProjects.length > 0 ? pinnedProjects : undefined, true).then((r) => {
        emit(`✓ 담당 태스크 ${r.length}개${pinnedProjects.length > 0 ? ` (토글 ${pinnedProjects.length}개 프로젝트)` : ''}`)
        return r
      })

      emit('👥 CC/멘션 태스크 조회 중...')
      const ccP = taskService.listMyCcTasks(pinnedProjects.length > 0 ? pinnedProjects : undefined).then((r) => {
        emit(`✓ CC 태스크 ${r.length}개${pinnedProjects.length > 0 ? ` (토글 ${pinnedProjects.length}개)` : ''}`)
        return r
      })

      emit('⏰ 오늘 마감 태스크 조회 중...')
      const dueP = taskService.listDueTodayTasks(pinnedProjects.length > 0 ? pinnedProjects : undefined).then((r) => {
        emit(`✓ 오늘 마감 ${r.length}개`)
        return r
      })

      emit('📅 이번주 일정 조회 중...')
      const eventsP = getEventsLegacy({ from: startOfDay.toISOString(), to: endOfWeek.toISOString() })
        .then((r) => {
          const filtered = pinnedCalendars.length > 0
            ? r.filter((e) => {
                const idStr = String(e.id || '')
                if (idStr.startsWith('local:') || idStr.startsWith('holiday:')) return true
                return !!e.calendar?.id && pinnedCalendars.includes(e.calendar.id)
              })
            : r
          emit(`✓ 일정 ${filtered.length}개${pinnedCalendars.length > 0 ? ` (토글 적용 / 전체 ${r.length})` : ''}`)
          return filtered
        })

      const [tasks, ccTasks, dueTodayTasks, events] = await Promise.all([tasksP, ccP, dueP, eventsP])

      if (hasActiveSkill) emit(`🔍 스킬 ${briefingSkills.length}개 보강 적용 (MCP 로 추가 분석 가능)`)

      return aiService.generateBriefing(
        tasks,
        events,
        undefined,
        ccTasks,
        dueTodayTasks,
        requestId,
        mcpServers,
        // base 데이터 항상 사전 fetch — 위임 모드 제거. AI 가 추가 분석은 스킬+MCP 로.
        false
      )
    } catch (err) {
      return {
        greeting: '브리핑을 생성할 수 없습니다.',
        urgent: [], focus: [], mentioned: [], stale: [], todayEvents: [],
        recommendations: [err instanceof Error ? err.message : '오류가 발생했습니다.']
      }
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.AI_SUMMARIZE_TASK,
    async (_, { task, body, requestId }: { task: DoorayTask; body?: string; requestId?: string }) =>
      aiService.summarizeTask(task, body, requestId)
  )
  ipcMain.handle(IPC_CHANNELS.AI_GENERATE_REPORT, async (_, { type, requestId, mcpServers }: { type: 'daily' | 'weekly'; requestId?: string; mcpServers?: string[] }) => {
    try {
      // 정책: 토글한 프로젝트의 태스크 + 토글한 캘린더 일정은 항상 base 로 사전 fetch.
      const pinnedProjects = (store.get('pinnedProjects', []) as string[]) || []
      const pinnedCalendars = (store.get('pinnedCalendars', []) as string[]) || []
      const tasks = await taskService.listMyTasks(
        pinnedProjects.length > 0 ? pinnedProjects : undefined,
        true
      )
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const endOfWeek = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000)
      const allEvents = await getEventsLegacy({
        from: startOfDay.toISOString(),
        to: endOfWeek.toISOString()
      })
      const events = pinnedCalendars.length > 0
        ? allEvents.filter((e) => {
            const idStr = String(e.id || '')
            // local(빠른 todo) + holiday 는 토글 UI 에 없으므로 항상 포함 (브리핑과 동일 정책)
            if (idStr.startsWith('local:') || idStr.startsWith('holiday:')) return true
            return !!e.calendar?.id && pinnedCalendars.includes(e.calendar.id)
          })
        : allEvents
      return aiService.generateReport(type, tasks, events, requestId, mcpServers)
    } catch (err) {
      return { title: '오류', content: err instanceof Error ? err.message : '보고서 생성 실패', generatedAt: new Date().toISOString() }
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_WIKI,
    async (_, { taskSubject, taskBody, projectCode, requestId }: { taskSubject: string; taskBody?: string; projectCode?: string; requestId?: string }) =>
      aiService.generateWikiDraft(taskSubject, taskBody, projectCode, requestId)
  )
  // AI 모델 설정
  ipcMain.handle(IPC_CHANNELS.AI_MODEL_CONFIG_GET, () => aiService.getModelConfig())
  ipcMain.handle(IPC_CHANNELS.AI_MODEL_CONFIG_SET, (_, config: import('../shared/types/ai').AIModelConfig) => {
    aiService.setModelConfig(config)
    store.set('aiModelConfig', config)
  })

  // Settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_, key: string) => store.get(key))
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_, { key, value }: { key: string; value: unknown }) => {
    store.set(key, value)
    if (key === 'anthropicApiKey') {
      setUserAnthropicApiKey(typeof value === 'string' ? value : null)
    }
  })
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_PROJECTS, () =>
    store.get('pinnedProjects', []) as string[]
  )
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_PROJECTS, (_, projectIds: string[]) => {
    store.set('pinnedProjects', projectIds)
  })
  // 수동 추가 프로젝트 (API로 조회 안 되는 공개 프로젝트)
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_CUSTOM_PROJECTS, () =>
    store.get('customProjects', []) as string[]
  )
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_CUSTOM_PROJECTS, (_, projectIds: string[]) => {
    const dedup = Array.from(new Set(projectIds))
    store.set('customProjects', dedup)
    taskService.setCustomProjectIds(dedup)
  })

  // Clauday Skills (파일시스템 기반 - ~/Library/Application Support/Clauday/skills/)
  ipcMain.handle(IPC_CHANNELS.CLAUDAY_SKILLS_LIST, () => skillStore.list())
  ipcMain.handle(IPC_CHANNELS.CLAUDAY_SKILLS_GET, (_, id: string) => skillStore.get(id))
  ipcMain.handle(IPC_CHANNELS.CLAUDAY_SKILLS_SAVE, (_, skill: Record<string, unknown>) =>
    skillStore.save(skill as unknown as import('../shared/types/skill').ClaudaySkill)
  )
  ipcMain.handle(IPC_CHANNELS.CLAUDAY_SKILLS_DELETE, (_, id: string) => skillStore.delete(id))
  ipcMain.handle(IPC_CHANNELS.CLAUDAY_SKILLS_FOR_TARGET, (_, target: string) => skillStore.forTarget(target))

  // Briefing Store
  ipcMain.handle(IPC_CHANNELS.BRIEFING_SAVE, (_, briefing: unknown) => {
    const list = (store.get('briefings', []) as unknown[])
    list.unshift({ ...briefing as Record<string, unknown>, savedAt: new Date().toISOString() })
    // 최대 30개 유지
    store.set('briefings', list.slice(0, 30))
  })
  ipcMain.handle(IPC_CHANNELS.BRIEFING_LIST, () => store.get('briefings', []))
  ipcMain.handle(IPC_CHANNELS.BRIEFING_DELETE, (_, index: number) => {
    const list = (store.get('briefings', []) as unknown[])
    list.splice(index, 1)
    store.set('briefings', list)
  })

  // AI Wiki
  ipcMain.handle(IPC_CHANNELS.AI_WIKI_PROOFREAD, async (_, { title, content, requestId }: { title: string; content: string; requestId?: string }) =>
    aiService.wikiProofread(title, content, requestId)
  )
  ipcMain.handle(IPC_CHANNELS.AI_WIKI_IMPROVE, async (_, { title, content, requestId }: { title: string; content: string; requestId?: string }) =>
    aiService.wikiImprove(title, content, requestId)
  )

  // AI Skill Generator
  ipcMain.handle(
    IPC_CHANNELS.AI_GENERATE_SKILL,
    async (_, { request, target, requestId, mcpServers }: { request: string; target: string; requestId?: string; mcpServers?: string[] }) =>
      aiService.generateSkill(request, target, requestId, mcpServers)
  )

  // AI 활용 사례 추천 — 개인 Claude Code setup(skills + MCP)을 프롬프트에 주입하고
  // dooray-mcp로 공유 프로젝트 task를 claude -p가 직접 조회·분류하게 함.
  const AI_SHARING_PROJECT_ID = '4138743749699736544'
  ipcMain.handle(IPC_CHANNELS.AI_RECOMMEND_CACHE_GET, () => aiService.getLastAIRecommendation())

  ipcMain.handle(
    IPC_CHANNELS.AI_RECOMMEND_ANALYZE,
    async (_, opts?: { requestId?: string; limit?: number; mcpServers?: string[] }) => {
      const [skillList, mcpMap] = await Promise.all([
        skillsManager.list(),
        mcpConfigManager.list()
      ])
      // 스킬 frontmatter description 간단 추출 (YAML의 description: 값)
      const skills = skillList.map((s) => {
        const m = s.content.match(/^---[\s\S]*?\ndescription:\s*(.+?)\n[\s\S]*?---/i)
        const desc = m ? m[1].replace(/^["']|["']$/g, '').trim() : undefined
        return { name: s.name, description: desc }
      })
      const mcpNames = Object.keys(mcpMap || {})
      return aiService.analyzeAISharing(skills, mcpNames, {
        projectId: AI_SHARING_PROJECT_ID,
        limit: opts?.limit ?? 60,
        requestId: opts?.requestId,
        mcpServers: opts?.mcpServers
      })
    }
  )

  // Wiki domains
  ipcMain.handle(IPC_CHANNELS.DOORAY_WIKI_DOMAINS, () => wikiService.listDomains())

  // Claude Sessions (mtime 기반 캐시 + 비동기 fs + 스트림 읽기)
  // cleanFirstMessage 는 단위 테스트를 위해 별도 모듈로 분리 (#13).
  interface SessionMeta { id: string; project: string; firstMsg: string; timestamp: string; lines: number }
  interface SessionCacheEntry { meta: SessionMeta; mtimeMs: number; size: number; path: string }
  const sessionCache = new Map<string, SessionCacheEntry>()
  let sessionIdToPath = new Map<string, string>()

  ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSIONS_LIST, async () => {
    const fs = await import('fs')
    const fsp = fs.promises
    const { join } = await import('path')
    const { homedir } = await import('os')
    const base = join(homedir(), '.claude', 'projects')

    const parseFirstMessage = (fp: string): Promise<{ firstMsg: string; timestamp: string; lines: number }> =>
      new Promise((resolve) => {
        let firstMsg = '', timestamp = '', lines = 0, buf = ''
        const stream = fs.createReadStream(fp, { encoding: 'utf-8', highWaterMark: 32 * 1024 })
        let done = false
        const finish = (): void => {
          if (done) return
          done = true
          stream.destroy()
          resolve({ firstMsg, timestamp, lines })
        }
        stream.on('data', (chunk: string | Buffer) => {
          buf += chunk.toString()
          let idx: number
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.substring(0, idx).trim()
            buf = buf.substring(idx + 1)
            if (line) {
              lines++
              if (!firstMsg) {
                try {
                  const d = JSON.parse(line)
                  if (d.type === 'user') {
                    const msg = d.message || {}
                    let c = msg.content || ''
                    if (Array.isArray(c)) c = c.map((x: Record<string, string>) => x.text || '').join(' ')
                    firstMsg = cleanFirstMessage(String(c))
                    timestamp = d.timestamp || ''
                  }
                } catch {}
              }
            }
            // 첫 메시지 찾고 50줄 샘플했으면 조기 종료
            if (firstMsg && lines >= 50) { finish(); return }
          }
        })
        stream.on('end', finish)
        stream.on('error', finish)
      })

    const newIdToPath = new Map<string, string>()
    const sessions: SessionMeta[] = []

    let projDirs: string[] = []
    try { projDirs = await fsp.readdir(base) } catch { return [] }

    // 프로젝트별 파일 스캔은 병렬, 각 프로젝트 내에서도 파일들 병렬
    await Promise.all(projDirs.map(async (projDir) => {
      const projPath = join(base, projDir)
      let files: string[] = []
      try {
        const entries = await fsp.readdir(projPath)
        files = entries.filter((f) => f.endsWith('.jsonl') && !f.includes('subagent'))
      } catch { return }
      const rawPath = projDir.replace(/-/g, '/')
      const homeNorm = require('os').homedir().replace(/\\/g, '/')
      const project = rawPath.startsWith(homeNorm + '/')
        ? '~/' + rawPath.slice(homeNorm.length + 1)
        : rawPath.replace(/^\//, '')

      await Promise.all(files.map(async (file) => {
        const fp = join(projPath, file)
        const sid = file.replace('.jsonl', '')
        newIdToPath.set(sid, fp)
        let stat: { mtimeMs: number; size: number }
        try { stat = await fsp.stat(fp) } catch { return }

        const cached = sessionCache.get(sid)
        if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
          sessions.push(cached.meta)
          return
        }
        const parsed = await parseFirstMessage(fp)
        if (parsed.firstMsg && !parsed.firstMsg.startsWith('Caveat:')) {
          const meta: SessionMeta = { id: sid, project, firstMsg: parsed.firstMsg, timestamp: parsed.timestamp, lines: parsed.lines }
          sessionCache.set(sid, { meta, mtimeMs: stat.mtimeMs, size: stat.size, path: fp })
          sessions.push(meta)
        }
      }))
    }))

    // 삭제된 세션 제거
    for (const sid of Array.from(sessionCache.keys())) {
      if (!newIdToPath.has(sid)) sessionCache.delete(sid)
    }
    sessionIdToPath = newIdToPath

    return sessions.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  })

  ipcMain.handle(IPC_CHANNELS.CLAUDE_SESSIONS_DETAIL, async (_, sessionId: string) => {
    const fsp = (await import('fs')).promises
    const { join } = await import('path')
    const { homedir } = await import('os')

    // 인덱스에서 경로 조회, 없으면 직접 탐색
    let fp = sessionIdToPath.get(sessionId)
    if (!fp) {
      const base = join(homedir(), '.claude', 'projects')
      try {
        const projDirs = await fsp.readdir(base)
        for (const projDir of projDirs) {
          const candidate = join(base, projDir, `${sessionId}.jsonl`)
          try { await fsp.access(candidate); fp = candidate; break } catch {}
        }
      } catch {}
    }
    if (!fp) return []

    const messages: Array<{ role: string; content: string; timestamp: string }> = []
    try {
      const content = await fsp.readFile(fp, 'utf-8')
      for (const line of content.split('\n')) {
        if (!line.trim()) continue
        try {
          const d = JSON.parse(line)
          if (d.type === 'user' || d.type === 'assistant') {
            const msg = d.message || {}
            let c = msg.content || ''
            if (Array.isArray(c)) {
              // text 타입 블록만 추출 (tool_use, tool_result 등 공백 라인 방지)
              c = c.filter((x: Record<string, unknown>) => x.type === 'text')
                   .map((x: Record<string, string>) => x.text || '').join('\n').trim()
            }
            const finalContent = String(c).trim()
            if (!finalContent) continue  // 빈 메시지 (tool_use 등) 스킵
            messages.push({ role: d.type, content: finalContent.substring(0, 2000), timestamp: d.timestamp || '' })
          }
        } catch {}
      }
    } catch {}
    return messages
  })

  // Claude Insights (한국어 리포트)
  ipcMain.handle(IPC_CHANNELS.CLAUDE_INSIGHTS, async () => {
    const { readFileSync, existsSync, readdirSync } = require('fs')
    const { join } = require('path')
    const { homedir } = require('os')

    // facets에서 주요 파일만 읽기 (전체는 너무 큼)
    const facetsDir = join(homedir(), '.claude', 'usage-data', 'facets')
    let data = ''

    if (existsSync(facetsDir)) {
      const files = readdirSync(facetsDir).filter((f: string) => f.endsWith('.json'))
      // 최근 10개 세션만
      const recent = files.slice(0, 10)
      for (const file of recent) {
        try {
          const content = readFileSync(join(facetsDir, file), 'utf-8')
          const parsed = JSON.parse(content)
          // 핵심 정보만 추출
          data += JSON.stringify({
            id: parsed.sessionId?.substring(0, 8),
            project: parsed.projectPath,
            duration: parsed.durationMs,
            model: parsed.modelUsage,
            tools: parsed.toolUsageCounts,
            outcome: parsed.outcome,
            title: parsed.title || parsed.firstUserMessage?.substring(0, 80)
          }) + '\n'
        } catch {}
      }
    }

    if (!data) {
      const reportPath = join(homedir(), '.claude', 'usage-data', 'report.html')
      if (existsSync(reportPath)) {
        // HTML에서 텍스트만 추출 (태그 제거)
        const html = readFileSync(reportPath, 'utf-8')
        data = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 8000)
      }
    }

    if (!data) return '인사이트 데이터가 없습니다. 먼저 터미널에서 `/insights`를 실행해주세요.'

    try {
      return await aiService.ask(
        `다음은 Claude Code 최근 세션 데이터입니다. 한국어 인사이트 리포트를 작성해주세요.

포함:
1. **전체 요약** — 세션 수, 주요 통계
2. **주요 작업** — 어떤 작업을 했는지
3. **모델 사용 패턴** — 어떤 모델을 얼마나 썼는지
4. **비용 분석** — 어디에 비용이 많이 쓰였는지
5. **개선 추천** — 비용 절약, 효율 향상 팁

마크다운으로 보기 좋게.

${data}`,
        { feature: 'sessionSummary', maxBudget: '0.3' }
      )
    } catch (err) {
      return `인사이트 생성 오류: ${err instanceof Error ? err.message : '알 수 없는 오류'}`
    }
  })

  // Claude CLI Info (한국어 번역 포함)
  ipcMain.handle(IPC_CHANNELS.CLAUDE_CLI_INFO, async () => {
    const { execFile } = require('child_process')
    const { homedir } = require('os')
    const { join } = require('path')
    const home = homedir()
    const { delimiter: pathDelim } = require('path')
    const isWin = process.platform === 'win32'
    const extraPaths = isWin
      ? [join(home, '.claude', 'local'), join(home, '.claude', 'bin'), join(home, 'AppData', 'Roaming', 'npm'), join(home, 'AppData', 'Local', 'npm')]
      : [join(home, '.claude', 'local'), join(home, '.claude', 'bin'), '/usr/local/bin', '/opt/homebrew/bin', join(home, '.local', 'bin')]
    // 사용자 PATH 우선 — extraPaths 는 fallback (구버전 claude 가 우리 prepend 로 잡히는 문제 방지)
    const richEnv = { ...process.env, PATH: [process.env.PATH || '', ...extraPaths].join(pathDelim), DISABLE_OMC: '1' }
    const { decodeProcessText } = require('./utils/procText') as typeof import('./utils/procText')
    const run = (args: string[]): Promise<string> => new Promise((resolve) => {
      // Windows cp949 mojibake 방지 — raw Buffer 로 받아 자동 디코드.
      execFile('claude', args, { timeout: 5000, env: richEnv, encoding: 'buffer' }, (err: Error | null, stdoutBuf: Buffer, stderrBuf: Buffer) => {
        const stdout = decodeProcessText(stdoutBuf)
        const stderr = decodeProcessText(stderrBuf)
        resolve(stdout || stderr || (err?.message ?? ''))
      })
    })
    const [version, mainHelp, mcpHelp, authHelp, agentsHelp, pluginHelp] = await Promise.all([
      run(['--version']),
      run(['--help']),
      run(['mcp', '--help']),
      run(['auth', '--help']),
      run(['agents', '--help']),
      run(['plugin', '--help'])
    ])

    // AI 한국어 번역
    const translate = async (text: string, section: string): Promise<string> => {
      try {
        return await aiService.ask(
          `다음 Claude Code CLI "${section}" 도움말을 한국어로 번역해. 명령어/옵션명/코드는 원문 유지. 마크다운 테이블로 정리해서 보기 좋게.\n\n${text}`,
          { maxBudget: '0.1' }
        )
      } catch { return text }
    }

    const [mainKo, mcpKo, authKo, agentsKo, pluginKo] = await Promise.all([
      translate(mainHelp, '기본 사용법'),
      translate(mcpHelp, 'MCP 서버'),
      translate(authHelp, '인증'),
      translate(agentsHelp, '에이전트'),
      translate(pluginHelp, '플러그인')
    ])

    return {
      version: version.trim(),
      mainHelp: mainKo, mcpHelp: mcpKo, authHelp: authKo, agentsHelp: agentsKo, pluginHelp: pluginKo
    }
  })

  // Git Worktree (에러 시 메시지 정규화)
  const gitHandle = <T,>(channel: string, handler: (...args: unknown[]) => Promise<T>): void => {
    ipcMain.handle(channel, async (_, ...args: unknown[]) => {
      try {
        return await handler(...args)
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err))
      }
    })
  }

  gitHandle(IPC_CHANNELS.GIT_IS_REPO, (path) =>
    gitService.isGitRepo(path as string)
  )
  gitHandle(IPC_CHANNELS.GIT_REPO_ROOT, (path) =>
    gitService.getRepoRoot(path as string)
  )
  gitHandle(IPC_CHANNELS.GIT_BRANCHES, (repoPath) =>
    gitService.listBranches(repoPath as string)
  )
  gitHandle(IPC_CHANNELS.GIT_WORKTREES, (repoPath) =>
    gitService.listWorktrees(repoPath as string)
  )
  gitHandle(IPC_CHANNELS.GIT_WORKTREE_CREATE, (params) =>
    gitService.createWorktree(params as GitWorktreeCreateParams)
  )
  gitHandle(IPC_CHANNELS.GIT_WORKTREE_REMOVE, (params) =>
    gitService.removeWorktree(params as GitWorktreeRemoveParams)
  )
  gitHandle(IPC_CHANNELS.GIT_WORKTREE_STATUS, (worktreePath) =>
    gitService.getWorktreeStatus(worktreePath as string)
  )
  gitHandle(IPC_CHANNELS.GIT_DIFF, (worktreePath) =>
    gitService.getDiff(worktreePath as string)
  )
  gitHandle(IPC_CHANNELS.GIT_COMPARE_BRANCHES, (args) => {
    const { repoPath, branch1, branch2 } = args as { repoPath: string; branch1: string; branch2: string }
    return gitService.compareBranches(repoPath, branch1, branch2)
  })
  gitHandle(IPC_CHANNELS.GIT_COMPARE_FILE, (args) => {
    const { repoPath, filePath, branch1, branch2 } = args as { repoPath: string; filePath: string; branch1: string; branch2: string }
    return gitService.compareFile(repoPath, filePath, branch1, branch2)
  })
  gitHandle(IPC_CHANNELS.GIT_PRUNE, (repoPath) =>
    gitService.pruneWorktrees(repoPath as string)
  )

  // Analytics (로컬 전용 사용 분석)
  ipcMain.on(IPC_CHANNELS.ANALYTICS_TRACK, (_, event: { type: string; params?: Record<string, unknown> }) => {
    analyticsService.track(event.type as import('../shared/types/analytics').AnalyticsEventType, event.params || {})
  })
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_SUMMARY, (_, days?: number) => analyticsService.summary(days))
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_EXPORT, () => analyticsService.exportAll())
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_CLEAR, () => analyticsService.clear())

  // Dialog
  ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '터미널 작업 폴더 선택'
    })
    return result.canceled ? null : result.filePaths[0]
  })
}

/**
 * 커스텀 애플리케이션 메뉴 설치.
 * 기본 Electron 메뉴는 Cmd+W(Close), Cmd+M(Minimize), Cmd+1-9(Window 전환) 등을
 * renderer보다 먼저 가로채므로, 앱 내 단축키(⌘T/⌘W/⌘1~9 터미널 탭)가 동작하지 않음.
 * 필수 항목만 유지한 커스텀 메뉴로 충돌 제거.
 */
function installAppMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const }
      ]
    }] : []),
    {
      label: 'Edit',
      submenu: [
        // accelerator 를 명시적으로 지정 — 윈도우에서 role 만 두면 단축키가 등록 안 되는 케이스 보강.
        { role: 'undo', accelerator: 'CmdOrCtrl+Z' },
        { role: 'redo', accelerator: 'CmdOrCtrl+Shift+Z' },
        { type: 'separator' },
        { role: 'cut', accelerator: 'CmdOrCtrl+X' },
        { role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { role: 'paste', accelerator: 'CmdOrCtrl+V' },
        // pasteAndMatchStyle 의 기본 단축키는 Ctrl+Shift+V 인데, 우리는 그 키를 터미널의 paste
        // 단축키로 따로 쓰고 있어 충돌 방지를 위해 미할당.
        { role: 'pasteAndMatchStyle', accelerator: '' },
        { role: 'selectAll', accelerator: 'CmdOrCtrl+A' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', accelerator: 'CmdOrCtrl+Shift+R' },
        { role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+Alt+R' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      // Cmd+W(close), Cmd+M(minimize), Cmd+1-9 같은 앱 내 단축키와 충돌하는 기본 항목 제거
      submenu: [
        { label: 'Minimize', accelerator: '', click: () => BrowserWindow.getFocusedWindow()?.minimize() },
        { label: 'Zoom', click: () => {
          const w = BrowserWindow.getFocusedWindow()
          if (w) w.isMaximized() ? w.unmaximize() : w.maximize()
        }},
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [])
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  installAppMenu()
  registerIpcHandlers()
  configWatcher.start()
  createWindow()
  // #7 AI 추천 새 글 폴러 시작 (1시간 주기, silent hours 22-9시).
  // 토큰 미설정 / 네트워크 실패는 알아서 다음 주기 재시도.
  aiRecommendNotifier.start().catch((e) => console.warn('[main] aiRecommendNotifier 시작 실패:', e))

  // 터미널 세션 30초마다 자동 저장
  setInterval(() => {
    try {
      const sessions = terminalManager.exportSessions()
      if (sessions.length > 0) store.set('terminalSessions', sessions)
    } catch {}
  }, 30000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 터미널 세션 저장 (앱 종료 전)
app.on('before-quit', () => {
  try {
    const sessions = terminalManager.exportSessions()
    store.set('terminalSessions', sessions)
  } catch {}
})

app.on('window-all-closed', () => {
  configWatcher.stop()
  terminalManager.dispose()
  claudeChat.dispose()
  void botService.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
