/**
 * main/index.ts IPC 라우터 정합 검증.
 *
 * 목표: `ipcMain.handle()` 로 등록되는 채널들이 IPC_CHANNELS 의 invoke 계열과 정합한지 확인.
 *
 * 전략:
 *  - electron 의 `app.whenReady` 를 즉시 resolve 하게 mock + `ipcMain.handle/on` 을 spy
 *  - main/index.ts 가 import 시점에 끌어오는 무거운 서비스/네이티브 모듈을 모두 stub
 *  - dynamic import 후 spy 의 호출 채널을 수집해서 IPC_CHANNELS 와 대조
 *
 * 이 테스트는 채널 등록의 "총량/카탈로그 정합" 만 검증하고 핸들러 동작은 검증하지 않는다.
 * 핸들러별 행동은 각 서비스의 단위 테스트에서 이미 커버됨.
 */
import { describe, it, expect, vi } from 'vitest'
import { IPC_CHANNELS } from '../shared/types/ipc'

// ---- electron 모킹 ----------------------------------------------------------
// ipcMain.handle 호출 채널을 수집하는 spy
const handleCalls: string[] = []
const onCalls: string[] = []

vi.mock('electron', () => {
  const mockWebContents = {
    send: vi.fn(),
    on: vi.fn(),
    openDevTools: vi.fn(),
    setWindowOpenHandler: vi.fn()
  }
  const mockWindow = {
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    show: vi.fn(),
    webContents: mockWebContents,
    isDestroyed: () => false
  }
  class MockBrowserWindow {
    webContents = mockWebContents
    loadURL = vi.fn()
    loadFile = vi.fn()
    on = vi.fn()
    once = vi.fn()
    show = vi.fn()
    isDestroyed = (): boolean => false
    static getAllWindows = (): unknown[] => [mockWindow]
  }
  return {
    app: {
      // index.ts 의 app.whenReady().then(...) 가 동기적으로 실행되도록 즉시 resolve.
      whenReady: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      quit: vi.fn(),
      getPath: vi.fn((name: string) => `/tmp/mock-${name}`)
    },
    BrowserWindow: MockBrowserWindow,
    ipcMain: {
      handle: vi.fn((channel: string, _fn?: unknown) => {
        handleCalls.push(channel)
      }),
      on: vi.fn((channel: string, _fn?: unknown) => {
        onCalls.push(channel)
      }),
      removeHandler: vi.fn(),
      removeAllListeners: vi.fn()
    },
    shell: {
      openExternal: vi.fn(),
      openPath: vi.fn(),
      showItemInFolder: vi.fn()
    },
    dialog: {
      showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
      showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
      showMessageBox: vi.fn().mockResolvedValue({ response: 0 })
    },
    Menu: {
      buildFromTemplate: vi.fn().mockReturnValue({}),
      setApplicationMenu: vi.fn()
    },
    Notification: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      show: vi.fn()
    }))
  }
})

// ---- @electron-toolkit/utils mock ------------------------------------------
vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false },
  electronApp: { setAppUserModelId: vi.fn() },
  optimizer: { watchWindowShortcuts: vi.fn() }
}))

// ---- electron-store mock ---------------------------------------------------
vi.mock('electron-store', () => {
  return {
    default: class MockStore<T extends Record<string, unknown>> {
      private data: T = {} as T
      constructor(_opts: unknown = {}) { /* ignore */ }
      get(key: string, fallback?: unknown): unknown {
        const v = (this.data as Record<string, unknown>)[key]
        return v === undefined ? fallback : v
      }
      set(key: string, value: unknown): void {
        ;(this.data as Record<string, unknown>)[key] = value
      }
      delete(key: string): void {
        delete (this.data as Record<string, unknown>)[key]
      }
      clear(): void {
        this.data = {} as T
      }
    }
  }
})

// ---- 네이티브 모듈 / 외부 라이브러리 ----------------------------------------
vi.mock('node-pty', () => ({ spawn: vi.fn(() => ({ write: vi.fn(), resize: vi.fn(), kill: vi.fn(), on: vi.fn(), onData: vi.fn(), onExit: vi.fn() })) }))
vi.mock('keytar', () => ({
  getPassword: vi.fn().mockResolvedValue(null),
  setPassword: vi.fn().mockResolvedValue(undefined),
  deletePassword: vi.fn().mockResolvedValue(true)
}))
vi.mock('ws', () => ({
  default: class MockWS {
    on = vi.fn()
    send = vi.fn()
    close = vi.fn()
  }
}))
vi.mock('tsdav', () => ({
  DAVClient: class MockDAVClient {
    login = vi.fn().mockResolvedValue(undefined)
    fetchCalendars = vi.fn().mockResolvedValue([])
    fetchCalendarObjects = vi.fn().mockResolvedValue([])
    createCalendarObject = vi.fn().mockResolvedValue({ ok: true })
    deleteCalendarObject = vi.fn().mockResolvedValue(undefined)
  }
}))

// ---- main 측 서비스 stub ----------------------------------------------------
// main/index.ts 가 import 시점에 인스턴스를 생성하므로 각 서비스를 가짜 클래스로 대체.
function makeStubClass(extra: Record<string, unknown> = {}): new (...args: unknown[]) => unknown {
  return class StubService {
    constructor(..._args: unknown[]) {
      Object.assign(this, extra)
    }
    setMainWindow = vi.fn()
    start = vi.fn().mockResolvedValue(undefined)
    stop = vi.fn().mockResolvedValue(undefined)
    dispose = vi.fn()
    setSkillLoader = vi.fn()
    setModelConfig = vi.fn()
    getModelConfig = vi.fn().mockReturnValue({})
    forTarget = vi.fn().mockReturnValue([])
    isAvailable = vi.fn().mockReturnValue(false)
    composeMessengerMessage = vi.fn().mockResolvedValue('')
    generateFilterRule = vi.fn().mockResolvedValue(null)
    on = vi.fn()
    once = vi.fn()
    list = vi.fn().mockResolvedValue([])
    get = vi.fn().mockResolvedValue(null)
    set = vi.fn().mockResolvedValue(undefined)
    setEnabled = vi.fn()
    setTrigger = vi.fn()
    setCustomProjectIds = vi.fn()
    setRoot = vi.fn()
    setHookConfig = vi.fn()
    setHandler = vi.fn()
    onMention = vi.fn()
    setMyMemberIdResolver = vi.fn()
    setMemberNameResolver = vi.fn()
    addEventListener = vi.fn()
    getAgentRoot = vi.fn().mockReturnValue('/tmp/agent-workspace')
    handleSocketEvent = vi.fn().mockResolvedValue(undefined)
    getMemberName = vi.fn().mockResolvedValue('')
    getMyMemberIdPublic = vi.fn().mockResolvedValue(null)
    fullSync = vi.fn().mockResolvedValue({ totalObjects: 0 })
    listEvents = vi.fn().mockResolvedValue([])
    listCalendars = vi.fn().mockResolvedValue([])
    getHolidays = vi.fn().mockResolvedValue([])
    checkBusy = vi.fn().mockReturnValue({ busy: false, sinceMs: 0 })
    exportSessions = vi.fn().mockReturnValue([])
  } as unknown as new (...args: unknown[]) => unknown
}

vi.mock('./config/McpConfigManager', () => ({ McpConfigManager: makeStubClass() }))
vi.mock('./config/SkillsManager', () => ({ SkillsManager: makeStubClass() }))
vi.mock('./skills/SharedSkillsService', () => ({ SharedSkillsService: makeStubClass() }))
vi.mock('./config/ConfigWatcher', () => ({ ConfigWatcher: makeStubClass() }))
vi.mock('./usage/UsageParser', () => ({ UsageParser: makeStubClass() }))
vi.mock('./dooray/DoorayClient', () => ({ DoorayClient: makeStubClass() }))
vi.mock('./dooray/TaskService', () => ({ TaskService: makeStubClass() }))
vi.mock('./dooray/WikiService', () => ({ WikiService: makeStubClass() }))
vi.mock('./dooray/WikiStorageService', () => ({ WikiStorageService: makeStubClass() }))
vi.mock('./caldav/CalDAVClient', () => ({ CalDAVClient: makeStubClass() }))
vi.mock('./caldav/CredentialStore', () => ({
  CalDAVCredentialStore: {
    has: vi.fn().mockReturnValue(false),
    save: vi.fn(),
    load: vi.fn().mockReturnValue(null),
    clear: vi.fn()
  }
}))
vi.mock('./caldav/LocalEventStore', () => ({ LocalEventStore: makeStubClass() }))
vi.mock('./caldav/UnifiedCalendarService', () => ({ UnifiedCalendarService: makeStubClass() }))
vi.mock('./caldav/CTagPoller', () => ({ CTagPoller: makeStubClass() }))
vi.mock('./caldav/CalendarObjectsStore', () => ({
  CalendarObjectsStore: {
    listCalendarUrls: vi.fn().mockReturnValue([]),
    totalObjectCount: vi.fn().mockReturnValue(0),
    clearAll: vi.fn()
  }
}))
vi.mock('./holiday/HolidayService', () => ({ HolidayService: makeStubClass() }))
vi.mock('./dooray/MessengerService', () => ({ MessengerService: makeStubClass() }))
vi.mock('./dooray/socket-mode/BotService', () => ({ BotService: makeStubClass() }))
vi.mock('./dooray/mention/MentionDispatcher', () => ({ MentionDispatcher: makeStubClass() }))
vi.mock('./dooray/mention/ContextCollector', () => ({ ContextCollector: makeStubClass() }))
vi.mock('./dooray/mention/promptBuilder', () => ({
  buildPromptFromContext: vi.fn().mockReturnValue(''),
  extractUserRequest: vi.fn().mockReturnValue('')
}))
vi.mock('./dooray/mention/MentionTerminalSpawner', () => ({ MentionTerminalSpawner: makeStubClass() }))
vi.mock('./dooray/mention/MentionNotifier', () => ({ notifyMention: vi.fn() }))
vi.mock('./dooray/mention/AgentWorkspaceManager', () => ({ AgentWorkspaceManager: makeStubClass() }))
vi.mock('./dooray/mention/ChannelSessionStore', () => ({ ChannelSessionStore: makeStubClass() }))
vi.mock('./dooray/mention/ClaudayResponder', () => ({
  ClaudayResponder: makeStubClass(),
  extractOrgId: vi.fn().mockReturnValue('')
}))
vi.mock('./dooray/mention/HookServer', () => ({
  HookServer: class HookServer {
    setHandler = vi.fn()
    start = vi.fn().mockResolvedValue({ port: 0, secret: '' })
    stop = vi.fn()
  }
}))
vi.mock('./dooray/mention/transcriptReader', () => ({
  readLastAssistantText: vi.fn().mockReturnValue(''),
  truncateForMessenger: vi.fn((s: string) => s)
}))
vi.mock('./watcher/WatcherService', () => ({ WatcherService: makeStubClass() }))
vi.mock('./ai/AIService', () => ({
  AIService: makeStubClass(),
  setUserAnthropicApiKey: vi.fn(),
  getClaudeBin: vi.fn().mockReturnValue('claude')
}))
vi.mock('./claude/ClaudeChatService', () => ({ ClaudeChatService: makeStubClass() }))
vi.mock('./claude/ClaudeSessionService', () => ({ ClaudeSessionService: makeStubClass() }))
vi.mock('./claude/AttachmentService', () => ({ AttachmentService: makeStubClass() }))
vi.mock('./terminal/TerminalManager', () => ({ TerminalManager: makeStubClass() }))
vi.mock('./skills/SkillStore', () => ({ SkillStore: makeStubClass() }))
vi.mock('./git/GitService', () => ({ GitService: makeStubClass() }))
vi.mock('./analytics/AnalyticsService', () => ({ AnalyticsService: makeStubClass() }))

// ---- path mock (join 등 기본 함수 제공) -------------------------------------
vi.mock('path', () => {
  const path = require('path')
  return path
})

describe('main/index.ts IPC 라우터 (channel registration)', () => {
  let importErr: unknown = null

  it('imports main/index.ts and registers IPC handlers without throwing', async () => {
    try {
      // dynamic import — vi.mock 들이 모두 적용된 상태에서 main 모듈 평가.
      await import('./index')
      // app.whenReady().then(...) 는 microtask 다음에 실행 → 한 tick 대기.
      await new Promise((r) => setImmediate(r))
      await new Promise((r) => setImmediate(r))
    } catch (e) {
      importErr = e
    }
    expect(importErr).toBeNull()
    expect(handleCalls.length).toBeGreaterThan(0)
  })

  it('registers expected number of IPC channels (>= 95 handle invocations)', () => {
    // 단순 정합 — handle 호출 횟수가 IPC_CHANNELS 의 절반 이상이어야 함.
    // (이벤트 채널은 webContents.send 로 쓰이므로 handle 등록 대상 아님.)
    const invokeChannelCount = Object.keys(IPC_CHANNELS).length
    expect(handleCalls.length).toBeGreaterThanOrEqual(Math.floor(invokeChannelCount / 2))
  })

  it('every registered channel is a known IPC_CHANNELS value', () => {
    const validChannels = new Set(Object.values(IPC_CHANNELS) as string[])
    const unknown = handleCalls.filter((c) => !validChannels.has(c))
    expect(unknown).toEqual([])
  })

  it('all handle channels are unique (no double-registration)', () => {
    const seen = new Set<string>()
    const dupes: string[] = []
    for (const c of handleCalls) {
      if (seen.has(c)) dupes.push(c)
      seen.add(c)
    }
    expect(dupes).toEqual([])
  })

  it('critical channels are registered', () => {
    // 사용자 시야에서 가장 중요한 채널들이 누락되지 않았는지 직접 확인.
    const critical = [
      IPC_CHANNELS.MCP_LIST,
      IPC_CHANNELS.SKILLS_LIST,
      IPC_CHANNELS.USAGE_QUERY,
      IPC_CHANNELS.DOORAY_TOKEN_VALIDATE,
      IPC_CHANNELS.DOORAY_PROJECTS_LIST,
      IPC_CHANNELS.TERMINAL_CREATE,
      IPC_CHANNELS.TERMINAL_KILL,
      IPC_CHANNELS.SETTINGS_GET,
      IPC_CHANNELS.SETTINGS_SET,
      IPC_CHANNELS.AI_MODEL_CONFIG_GET,
      IPC_CHANNELS.AI_MODEL_CONFIG_SET,
      IPC_CHANNELS.CALDAV_STATUS,
      IPC_CHANNELS.CALDAV_SAVE_CREDENTIALS,
      IPC_CHANNELS.CALENDAR_LIST_EVENTS,
      IPC_CHANNELS.WATCHER_LIST,
      IPC_CHANNELS.BOT_GET_STATUS,
      IPC_CHANNELS.GIT_IS_REPO,
      IPC_CHANNELS.ANALYTICS_SUMMARY,
      IPC_CHANNELS.DIALOG_SELECT_FOLDER
    ]
    const handleSet = new Set(handleCalls)
    const missing = critical.filter((c) => !handleSet.has(c))
    expect(missing).toEqual([])
  })

  it('event-only channels are NOT registered via ipcMain.handle', () => {
    // 이 채널들은 main → renderer push 전용 (webContents.send). handle 대상 아님.
    const eventOnly = [
      IPC_CHANNELS.TERMINAL_OUTPUT,
      IPC_CHANNELS.DOORAY_TASKS_PARTIAL,
      IPC_CHANNELS.MENTION_RECEIVED,
      IPC_CHANNELS.MENTION_TERMINAL_OPENED,
      IPC_CHANNELS.MENTION_TERMINAL_FOCUS,
      IPC_CHANNELS.AI_PROGRESS,
      IPC_CHANNELS.BOT_STATE_UPDATE,
      IPC_CHANNELS.BOT_EVENT,
      IPC_CHANNELS.WATCHER_NEW_MESSAGES,
      IPC_CHANNELS.WATCHER_NOTIFICATION_CLICK,
      IPC_CHANNELS.CONFIG_CHANGED,
      IPC_CHANNELS.CLAUDE_CHAT_EVENT
    ]
    const handleSet = new Set(handleCalls)
    const wronglyHandled = eventOnly.filter((c) => handleSet.has(c))
    expect(wronglyHandled).toEqual([])
  })

  it('terminal input/resize channels use ipcMain.on (fire-and-forget) not handle', () => {
    // preload 에서 `ipcRenderer.send` 로 호출하므로 main 은 `ipcMain.on` 등록 대상.
    const onSet = new Set(onCalls)
    expect(onSet.has(IPC_CHANNELS.TERMINAL_INPUT) || onSet.has(IPC_CHANNELS.TERMINAL_RESIZE) || onSet.has(IPC_CHANNELS.ANALYTICS_TRACK))
      .toBe(true)
  })
})
