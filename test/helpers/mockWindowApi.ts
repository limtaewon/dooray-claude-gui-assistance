/**
 * window.api 모킹 헬퍼.
 *
 * 통합 테스트에서 renderer 컴포넌트가 호출하는 `window.api.*` 도메인을
 * vi.fn() 으로 채워서 IPC 흐름(어떤 채널이 언제 호출됐는지)을 검증한다.
 *
 * 사용법:
 *   import { installMockWindowApi, resetMockWindowApi } from '../../../test/helpers/mockWindowApi'
 *
 *   beforeEach(() => { installMockWindowApi() })
 *   afterEach(() => { resetMockWindowApi() })
 *
 * 특정 메서드 동작을 덮어쓰려면:
 *   vi.mocked(window.api.dooray.tasks.list).mockResolvedValue([...])
 */
import { vi } from 'vitest'

/** "이벤트 구독" 류 메서드의 기본 반환 — cleanup 함수 */
const noopUnsub = (): void => { /* no-op */ }

/** 도메인별 기본값을 채워둔 mock api. 각 메서드는 빈 결과를 반환 → 테스트가 필요 시 mockResolvedValue 로 덮어쓰면 됨. */
export function createMockWindowApi(): Record<string, unknown> {
  return {
    mcp: {
      list: vi.fn().mockResolvedValue({}),
      add: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    skills: {
      list: vi.fn().mockResolvedValue([]),
      read: vi.fn().mockResolvedValue(''),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue({ deleted: 0, failed: 0 }),
      importFromFiles: vi.fn().mockResolvedValue({ imported: 0, cancelled: false }),
      exportToFolder: vi.fn().mockResolvedValue({ exported: 0, cancelled: false })
    },
    sharedSkills: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      upload: vi.fn().mockResolvedValue({ postId: '' }),
      download: vi.fn().mockResolvedValue({ filename: '' }),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    usage: {
      query: vi.fn().mockResolvedValue({ days: [], totals: {} })
    },
    dooray: {
      setToken: vi.fn().mockResolvedValue(undefined),
      getToken: vi.fn().mockResolvedValue(null),
      deleteToken: vi.fn().mockResolvedValue(undefined),
      validateToken: vi.fn().mockResolvedValue({ valid: false }),
      myMemberId: vi.fn().mockResolvedValue(null),
      projects: {
        list: vi.fn().mockResolvedValue([]),
        info: vi.fn().mockResolvedValue(null)
      },
      fetchFile: vi.fn().mockResolvedValue(''),
      tasks: {
        list: vi.fn().mockResolvedValue([]),
        detail: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
        comments: vi.fn().mockResolvedValue([]),
        onPartial: vi.fn().mockReturnValue(noopUnsub),
        create: vi.fn().mockResolvedValue({ id: '' }),
        tags: vi.fn().mockResolvedValue([]),
        templates: vi.fn().mockResolvedValue([]),
        templateDetail: vi.fn().mockResolvedValue(null),
        createComment: vi.fn().mockResolvedValue({ id: '' }),
        uploadFile: vi.fn().mockResolvedValue({ id: '' }),
        updateBody: vi.fn().mockResolvedValue(undefined),
        updateComment: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        deleteComment: vi.fn().mockResolvedValue(undefined)
      },
      wiki: {
        domains: vi.fn().mockResolvedValue([]),
        list: vi.fn().mockResolvedValue([]),
        children: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
        storageList: vi.fn().mockResolvedValue([]),
        storageGet: vi.fn().mockResolvedValue({ name: '', content: '' }),
        storageUpload: vi.fn().mockResolvedValue({ pageId: '', updated: false }),
        storageSoftDelete: vi.fn().mockResolvedValue(undefined),
        storageResolve: vi.fn().mockResolvedValue({ wikiId: '', wikiName: '' })
      },
      calendar: {
        list: vi.fn().mockResolvedValue([]),
        events: vi.fn().mockResolvedValue([])
      },
      projectWorkflows: vi.fn().mockResolvedValue([])
    },
    caldav: {
      testConnect: vi.fn().mockResolvedValue({ ok: false }),
      saveCredentials: vi.fn().mockResolvedValue({ ok: true }),
      status: vi.fn().mockResolvedValue({ connected: false, username: null }),
      disconnect: vi.fn().mockResolvedValue({ ok: true }),
      listCalendars: vi.fn().mockResolvedValue([]),
      listEvents: vi.fn().mockResolvedValue([]),
      createEvent: vi.fn().mockResolvedValue(undefined),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
      fullSync: vi.fn().mockResolvedValue({ totalObjects: 0 }),
      incrementalSync: vi.fn().mockResolvedValue({ anyChange: false }),
      onUpdated: vi.fn().mockReturnValue(noopUnsub),
      onSyncProgress: vi.fn().mockReturnValue(noopUnsub)
    },
    calendar: {
      listCalendars: vi.fn().mockResolvedValue([]),
      listEvents: vi.fn().mockResolvedValue([]),
      createEvent: vi.fn().mockResolvedValue(null),
      deleteEvent: vi.fn().mockResolvedValue(undefined)
    },
    localCalendar: {
      create: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true })
    },
    shell: {
      openPath: vi.fn().mockResolvedValue({ ok: true }),
      readImageDataUrl: vi.fn().mockResolvedValue({ ok: true, dataUrl: '' }),
      showInFolder: vi.fn().mockResolvedValue({ ok: true })
    },
    claudeMdTemplates: {
      list: vi.fn().mockResolvedValue([]),
      apply: vi.fn().mockResolvedValue({ ok: true })
    },
    aiRecommendNotify: {
      getEnabled: vi.fn().mockResolvedValue(true),
      setEnabled: vi.fn().mockResolvedValue({ ok: true, enabled: true }),
      onGoto: vi.fn().mockReturnValue(noopUnsub)
    },
    terminal: {
      create: vi.fn().mockImplementation(async (_opts?: unknown) => ({
        id: `term-${Math.random().toString(36).slice(2, 8)}`,
        name: '~',
        cwd: '/tmp',
        createdAt: Date.now()
      })),
      input: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      getOutput: vi.fn().mockResolvedValue(''),
      rename: vi.fn().mockResolvedValue(true),
      onOutput: vi.fn().mockReturnValue(noopUnsub),
      // v2.0 B-1: 테스트에서 마지막으로 등록된 콜백은 `mock.calls.at(-1)?.[0]` 로 꺼내 직접 발화시킬 수 있음
      onExit: vi.fn().mockReturnValue(noopUnsub),
      // v2.0 M-A: 영속화 v2
      saveState: vi.fn().mockResolvedValue({ ok: true, bytes: 0 }),
      restoreState: vi.fn().mockResolvedValue(null),
      onRequestState: vi.fn().mockReturnValue(noopUnsub),
      // v2.0 M-B: 링크 존재 검증
      resolvePath: vi.fn().mockResolvedValue([]),
      sessionCwd: vi.fn().mockResolvedValue(null),
      foreground: vi.fn().mockResolvedValue(null),
      onMentionOpened: vi.fn().mockReturnValue(noopUnsub),
      onMentionFocus: vi.fn().mockReturnValue(noopUnsub)
    },
    claude: {
      startTask: vi.fn().mockResolvedValue(null),
      chatSend: vi.fn().mockResolvedValue(undefined),
      chatCancel: vi.fn().mockResolvedValue(true),
      onChatEvent: vi.fn().mockReturnValue(noopUnsub),
      sessionList: vi.fn().mockResolvedValue([]),
      sessionLoad: vi.fn().mockResolvedValue([]),
      sessionRename: vi.fn().mockResolvedValue(undefined),
      sessionStar: vi.fn().mockResolvedValue(undefined),
      saveAttachment: vi.fn().mockResolvedValue('')
    },
    ai: {
      available: vi.fn().mockResolvedValue(false),
      ask: vi.fn().mockResolvedValue(''),
      briefing: vi.fn().mockResolvedValue(null),
      summarizeTask: vi.fn().mockResolvedValue(''),
      generateReport: vi.fn().mockResolvedValue(null),
      generateWiki: vi.fn().mockResolvedValue(''),
      wikiProofread: vi.fn().mockResolvedValue(''),
      wikiImprove: vi.fn().mockResolvedValue(''),
      generateSkill: vi.fn().mockResolvedValue({ name: '', description: '', content: '' }),
      recommendAnalyze: vi.fn().mockResolvedValue(null),
      recommendCacheGet: vi.fn().mockResolvedValue(null),
      onProgress: vi.fn().mockReturnValue(noopUnsub),
      getModelConfig: vi.fn().mockResolvedValue({}),
      setModelConfig: vi.fn().mockResolvedValue(undefined)
    },
    settings: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      getProjects: vi.fn().mockResolvedValue([]),
      setProjects: vi.fn().mockResolvedValue(undefined),
      getCustomProjects: vi.fn().mockResolvedValue([]),
      setCustomProjects: vi.fn().mockResolvedValue(undefined)
    },
    cloverSkills: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      forTarget: vi.fn().mockResolvedValue([])
    },
    briefingStore: {
      save: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    claudeSessions: {
      list: vi.fn().mockResolvedValue([]),
      detail: vi.fn().mockResolvedValue([])
    },
    claudeInsights: {
      generate: vi.fn().mockResolvedValue('')
    },
    claudeCli: {
      info: vi.fn().mockResolvedValue({ version: '', mainHelp: '', mcpHelp: '', authHelp: '', agentsHelp: '', pluginHelp: '' })
    },
    git: {
      isRepo: vi.fn().mockResolvedValue(false),
      repoRoot: vi.fn().mockResolvedValue(''),
      mainRepoRoot: vi.fn().mockResolvedValue(null),
      branches: vi.fn().mockResolvedValue([]),
      worktrees: vi.fn().mockResolvedValue([]),
      worktreeUsage: vi.fn().mockResolvedValue([]),
      createWorktree: vi.fn().mockResolvedValue(null),
      removeWorktree: vi.fn().mockResolvedValue(undefined),
      worktreeStatus: vi.fn().mockResolvedValue({ ahead: 0, behind: 0, dirty: false }),
      diff: vi.fn().mockResolvedValue({ files: [] }),
      compareBranches: vi.fn().mockResolvedValue({ files: [] }),
      compareFile: vi.fn().mockResolvedValue(null),
      prune: vi.fn().mockResolvedValue(undefined),
      deleteBranch: vi.fn().mockResolvedValue(undefined),
      // v2.0: 소스 제어 (터미널 우측 드로어)
      scm: {
        status: vi.fn().mockResolvedValue({ entries: [], conflictOperation: 'none' }),
        history: vi.fn().mockResolvedValue({ items: [], hasMore: false, limit: 50, skip: 0 }),
        commitDetail: vi.fn().mockResolvedValue({ commitOid: '', files: [] }),
        fileDiff: vi.fn().mockResolvedValue({
          path: '',
          original: '',
          modified: '',
          originalBinary: false,
          modifiedBinary: false
        }),
        stage: vi.fn().mockResolvedValue(undefined),
        unstage: vi.fn().mockResolvedValue(undefined),
        discard: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue({ ok: true, message: '' }),
        lastCommitMessage: vi.fn().mockResolvedValue(''),
        push: vi.fn().mockResolvedValue({ ok: true, message: '' }),
        pull: vi.fn().mockResolvedValue({ ok: true, message: '' }),
        fetch: vi.fn().mockResolvedValue({ ok: true, message: '' }),
        remotes: vi.fn().mockResolvedValue([]),
        authors: vi.fn().mockResolvedValue([]),
        stashList: vi.fn().mockResolvedValue([]),
        stashPush: vi.fn().mockResolvedValue(undefined),
        stashAction: vi.fn().mockResolvedValue(undefined),
        createBranch: vi.fn().mockResolvedValue(undefined),
        checkout: vi.fn().mockResolvedValue(undefined),
        abort: vi.fn().mockResolvedValue(undefined)
      }
    },
    // v2.0 C-2: 워크스페이스(태스크 ↔ 워크트리 ↔ 에이전트 run). renderer 뷰는 C-3 이후에 붙는다.
    workspace: {
      repos: {
        list: vi.fn().mockResolvedValue([]),
        add: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(null),
        remove: vi.fn().mockResolvedValue(undefined)
      },
      settings: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(null)
      },
      setProjectRepo: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      startTask: vi.fn().mockResolvedValue(null),
      run: {
        resume: vi.fn().mockResolvedValue(null),
        adopt: vi.fn().mockResolvedValue(null),
        cleanup: vi.fn().mockResolvedValue(null)
      },
      reconcile: vi.fn().mockResolvedValue({ detached: 0, discarded: 0 }),
      taskWorktree: vi.fn().mockImplementation(async (params: { repoPath: string; branch: string }) => ({
        path: `${params.repoPath}-worktrees/${params.branch.replace(/\//g, '-')}`,
        branch: params.branch,
        created: true,
        isMainRepo: false
      })),
      taskDrop: {
        resolve: vi.fn().mockResolvedValue(null),
        link: vi.fn().mockResolvedValue(null),
        unlink: vi.fn().mockResolvedValue(undefined),
        touch: vi.fn().mockResolvedValue(undefined),
        linked: vi.fn().mockResolvedValue({})
      },
      onRunUpdated: vi.fn().mockReturnValue(noopUnsub)
    },
    analytics: {
      track: vi.fn(),
      summary: vi.fn().mockResolvedValue({ events: [], totals: {} }),
      exportAll: vi.fn().mockResolvedValue([]),
      clear: vi.fn().mockResolvedValue(undefined)
    },
    community: {
      posts: vi.fn().mockResolvedValue({ posts: [], totalCount: 0 })
    },
    messenger: {
      listChannels: vi.fn().mockResolvedValue([]),
      send: vi.fn().mockResolvedValue(undefined),
      composeWithAI: vi.fn().mockResolvedValue('')
    },
    bot: {
      getConfig: vi.fn().mockResolvedValue({ domain: '' }),
      setConfig: vi.fn().mockResolvedValue({ state: 'idle', lastError: null, ready: false }),
      getStatus: vi.fn().mockResolvedValue({ state: 'idle', lastError: null, ready: false }),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      onStateUpdate: vi.fn().mockReturnValue(noopUnsub),
      onEvent: vi.fn().mockReturnValue(noopUnsub)
    },
    watcher: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      messages: vi.fn().mockResolvedValue([]),
      markRead: vi.fn().mockResolvedValue(undefined),
      markAllRead: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      unreadCounts: vi.fn().mockResolvedValue({}),
      generateFilter: vi.fn().mockResolvedValue(null),
      onNewMessages: vi.fn().mockReturnValue(noopUnsub)
    },
    mention: {
      onReceived: vi.fn().mockReturnValue(noopUnsub)
    },
    dialog: {
      selectFolder: vi.fn().mockResolvedValue(null)
    },
    onConfigChanged: vi.fn().mockReturnValue(noopUnsub),
    // v2.0 windows-fix ADR-v2-windows-fix-03 §4: 정적 값 — 함수가 아니라 그대로 덮어써서 테스트한다.
    system: { platform: 'darwin', osRelease: '23.0.0' }
  }
}

/** window.api 를 mock 으로 교체. */
export function installMockWindowApi(): Record<string, unknown> {
  const api = createMockWindowApi()
  // @ts-expect-error - jsdom window 에 api 주입
  globalThis.window.api = api
  return api
}

/** beforeEach 직전 호출용 — 기존 mock 함수들의 호출 기록 초기화. */
export function resetMockWindowApi(): void {
  const api = (globalThis as unknown as { window: { api?: Record<string, unknown> } }).window?.api
  if (!api) return
  const walk = (obj: unknown): void => {
    if (!obj || typeof obj !== 'object') return
    for (const v of Object.values(obj as Record<string, unknown>)) {
      if (typeof v === 'function' && 'mockClear' in (v as object)) {
        ;(v as unknown as { mockClear: () => void }).mockClear()
      } else if (typeof v === 'object' && v !== null) {
        walk(v)
      }
    }
  }
  walk(api)
}
