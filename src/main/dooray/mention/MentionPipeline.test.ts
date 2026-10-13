import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// MentionPipeline → promptBuilder/ClaudayResponder 체인이 WatcherService 를 끌어올 수 있어 electron 계열 mock.
vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})
vi.mock('electron', () => ({
  BrowserWindow: class {},
  Notification: class { static isSupported(): boolean { return false } on(): void {} show(): void {} }
}))

import { MentionPipeline, STALE_MENTION_MS } from './MentionPipeline'
import { MentionTurnTracker } from './agent/MentionTurnTracker'
import type { MentionContext } from './MentionDispatcher'
import type { CollectedContext } from './ContextCollector'

const HOUR = 3_600_000

function makeDeps() {
  const calls: string[] = []
  const track = (name: string, impl: (...a: unknown[]) => unknown): ReturnType<typeof vi.fn> =>
    vi.fn((...a: unknown[]) => {
      calls.push(name)
      return impl(...a)
    })

  const collected: CollectedContext = {
    channelId: 'c1',
    channelName: '운영채널',
    mentionLogId: 'log1',
    inThread: false,
    maskedSecrets: 0,
    messages: [{ authorName: '나', text: '@clauday 정리해줘', sentAt: '2026-10-13T10:00:00Z' }]
  }
  const turns = new MentionTurnTracker()
  const beginSpy = vi.spyOn(turns, 'begin')
  const setProgressSpy = vi.spyOn(turns, 'setProgressLogId')
  const sessionData: Record<string, { tabId: string; channelName: string; organizationId?: string }> = {}

  const deps = {
    spawner: {
      tryReserve: track('tryReserve', () => ({ ok: true as const })),
      release: track('release', () => undefined),
      dispatch: track('dispatch', async () => ({ tabId: 'tab-1', reused: false }))
    },
    collector: { collect: track('collect', async () => collected) },
    workspace: {
      ensureChannel: track('ensureChannel', () => ({ channelDir: '/ws/c1', tasksDir: '/ws/c1/tasks', claudeMdPath: '/ws/c1/CLAUDE.md' })),
      writeTaskPrompt: track('writeTaskPrompt', () => 'tasks/log1.md'),
      saveAttachment: vi.fn(() => 'attachments/x.png')
    },
    responder: { send: track('responder.send', async () => 'progress-1') },
    sessions: {
      get: vi.fn((cid: string) => sessionData[cid] ?? null),
      set: vi.fn((cid: string, tabId: string, channelName: string, organizationId?: string) => {
        sessionData[cid] = { tabId, channelName, organizationId }
      })
    },
    turns,
    getWindowSize: () => 30,
    getTrigger: () => 'clauday',
    onReceived: track('onReceived', () => undefined),
    now: () => 1_000_000
  }
  return { deps, calls, collected, beginSpy, setProgressSpy, sessionData }
}

const ctx = (over: Partial<MentionContext> = {}): MentionContext => ({
  channelId: 'c1',
  senderId: 'me',
  logId: 'log1',
  text: '@clauday 장애 로그 정리해줘',
  sentAt: '2026-10-13T10:00:00Z',
  raw: { references: { channelMap: { c1: { orgId: 'org1' } } } } as never,
  ...over
})

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('MentionPipeline — STALE', () => {
  it('3시간 초과 멘션은 실행하지 않고 안내만 보낸다', async () => {
    const { deps } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx({ delayedMs: 5 * HOUR + 1000 }))
    expect(deps.responder.send).toHaveBeenCalledTimes(1)
    const [ch, msg, org] = deps.responder.send.mock.calls[0]
    expect(ch).toBe('c1')
    expect(msg).toContain('5시간 전 요청')
    expect(msg).toContain('자동으로 실행하지 않았습니다')
    expect(org).toBe('org1')
    expect(deps.spawner.tryReserve).not.toHaveBeenCalled()
    expect(deps.collector.collect).not.toHaveBeenCalled()
    expect(deps.spawner.dispatch).not.toHaveBeenCalled()
  })

  it('정확히 3시간은 stale 이 아니다 (초과만)', async () => {
    const { deps } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx({ delayedMs: STALE_MENTION_MS }))
    expect(deps.spawner.dispatch).toHaveBeenCalled()
  })

  it('3시간 + 1ms 는 stale', async () => {
    const { deps } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx({ delayedMs: STALE_MENTION_MS + 1 }))
    expect(deps.spawner.dispatch).not.toHaveBeenCalled()
    expect(deps.responder.send.mock.calls[0][1]).toContain('3시간 전')
  })

  it('delayedMs 가 없는 실시간 멘션은 stale 판정을 하지 않는다', async () => {
    const { deps } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx({ delayedMs: undefined }))
    expect(deps.spawner.dispatch).toHaveBeenCalled()
  })
})

describe('MentionPipeline — busy', () => {
  it('tryReserve 실패 시 진행 중 안내만 보내고 수집/실행 안 함', async () => {
    const { deps } = makeDeps()
    deps.spawner.tryReserve.mockReturnValue({ ok: false, sinceMs: 7 * 60_000 })
    await new MentionPipeline(deps as never).handle(ctx())
    expect(deps.responder.send).toHaveBeenCalledTimes(1)
    expect(deps.responder.send.mock.calls[0][1]).toBe('이전 작업이 아직 진행 중입니다 (시작 7분 전). 끝나면 다시 호출해주세요.')
    expect(deps.collector.collect).not.toHaveBeenCalled()
    expect(deps.spawner.dispatch).not.toHaveBeenCalled()
    expect(deps.spawner.release).not.toHaveBeenCalled()
  })

  it('1분 미만이어도 "1분 전" 으로 표기', async () => {
    const { deps } = makeDeps()
    deps.spawner.tryReserve.mockReturnValue({ ok: false, sinceMs: 10_000 })
    await new MentionPipeline(deps as never).handle(ctx())
    expect(deps.responder.send.mock.calls[0][1]).toContain('시작 1분 전')
  })
})

describe('MentionPipeline — 정상 흐름', () => {
  it('collect → ensureChannel → writeTaskPrompt → onReceived → begin → 진행 송신 → setProgressLogId → dispatch', async () => {
    const { deps, calls, beginSpy, setProgressSpy } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx())

    expect(calls.filter((c) => c !== 'release')).toEqual([
      'tryReserve', 'collect', 'ensureChannel', 'writeTaskPrompt', 'onReceived', 'responder.send', 'dispatch'
    ])
    // begin → 진행 송신 → setProgressLogId → dispatch
    const o = (m: { mock: { invocationCallOrder: number[] } }): number => m.mock.invocationCallOrder[0]
    expect(o(beginSpy)).toBeLessThan(o(deps.responder.send))
    expect(o(deps.responder.send)).toBeLessThan(o(setProgressSpy))
    expect(o(setProgressSpy)).toBeLessThan(o(deps.spawner.dispatch))
    expect(deps.spawner.release).not.toHaveBeenCalled()
  })

  it('turns.begin 에 회신 자리/조직/시작 시각을 기억하고 진행 logId 를 채운다', async () => {
    const { deps, beginSpy, setProgressSpy } = makeDeps()
    beginSpy.mockRestore()
    setProgressSpy.mockRestore()
    await new MentionPipeline(deps as never).handle(ctx())
    const stop = deps.turns.onStop('c1')
    expect(stop.kind).toBe('mention')
    if (stop.kind === 'mention') {
      expect(stop.turn).toMatchObject({
        logId: 'log1',
        replyChannelId: 'c1',
        inThread: false,
        organizationId: 'org1',
        progressLogId: 'progress-1',
        startedAt: 1_000_000
      })
    }
  })

  it('진행 메시지 송신이 실패(null)해도 dispatch 는 진행된다', async () => {
    const { deps, setProgressSpy } = makeDeps()
    deps.responder.send.mockResolvedValue(null)
    await new MentionPipeline(deps as never).handle(ctx())
    expect(setProgressSpy).toHaveBeenCalledWith('c1', null)
    expect(deps.spawner.dispatch).toHaveBeenCalled()
  })

  it('dispatch 인자: 채널 폴더·프롬프트 경로·@트리거를 뗀 사용자 요청', async () => {
    const { deps } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx({ text: '@clauday 장애 로그 정리해줘' }))
    expect(deps.spawner.dispatch).toHaveBeenCalledWith({
      channelId: 'c1',
      channelName: '운영채널',
      channelDir: '/ws/c1',
      promptRelPath: 'tasks/log1.md',
      userRequest: '장애 로그 정리해줘'
    })
  })

  it('collect 에 windowSize / channelDisplayName 을 넘긴다', async () => {
    const { deps } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx({ channelDisplayName: '표시이름' }))
    expect(deps.collector.collect.mock.calls[0].slice(0, 4)).toEqual(['c1', 'log1', 30, '표시이름'])
  })

  it('collect 의 saveAttachment 는 워크스페이스 saveAttachment 로 위임', async () => {
    const { deps } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx())
    const opts = deps.collector.collect.mock.calls[0][4]
    const data = Buffer.from('x')
    expect(opts.saveAttachment('f1', 'a.png', data)).toBe('attachments/x.png')
    expect(deps.workspace.saveAttachment).toHaveBeenCalledWith('c1', 'f1', 'a.png', data)
  })

  it('onReceived 알림 정보', async () => {
    const { deps } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx())
    expect(deps.onReceived).toHaveBeenCalledWith({
      channelId: 'c1',
      channelName: '운영채널',
      text: '@clauday 장애 로그 정리해줘',
      logId: 'log1',
      sentAt: '2026-10-13T10:00:00Z'
    })
  })

  it('세션에 organizationId 를 저장한다', async () => {
    const { deps } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx())
    expect(deps.sessions.set).toHaveBeenCalledWith('c1', '', '운영채널', 'org1')
  })

  it('dispatch 후 세션에 orgId 가 빠져 있으면 보강한다', async () => {
    const { deps, sessionData } = makeDeps()
    deps.spawner.dispatch.mockImplementation(async () => {
      sessionData['c1'] = { tabId: 'tab-9', channelName: '운영채널' }
      return { tabId: 'tab-9', reused: false }
    })
    await new MentionPipeline(deps as never).handle(ctx())
    expect(deps.sessions.set).toHaveBeenLastCalledWith('c1', 'tab-9', '운영채널', 'org1')
  })
})

describe('MentionPipeline — 지연 안내', () => {
  it('1분 초과 지연이면 진행 메시지에 지연 문구', async () => {
    const { deps } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx({ delayedMs: 12 * 60_000 }))
    expect(deps.responder.send.mock.calls[0][1]).toBe('⏳ 작업을 시작합니다 (⏰ 노트북이 깨어나 12분 늦게 시작)')
  })

  it('정확히 1분 이하는 지연 문구 없음', async () => {
    const { deps } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx({ delayedMs: 60_000 }))
    expect(deps.responder.send.mock.calls[0][1]).toBe('⏳ 작업을 시작합니다')
  })

  it('지연 정보가 없으면 기본 문구', async () => {
    const { deps } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx())
    expect(deps.responder.send.mock.calls[0][1]).toBe('⏳ 작업을 시작합니다')
  })
})

describe('MentionPipeline — 글타래', () => {
  it('글타래 멘션이면 collect 옵션에 parentChannelId, 턴 inThread=true', async () => {
    const { deps, beginSpy } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx({ isThread: true, parentChannelId: 'parent-1' }))
    expect(deps.collector.collect.mock.calls[0][4].parentChannelId).toBe('parent-1')
    expect(beginSpy.mock.calls[0][1]).toMatchObject({ inThread: true, replyChannelId: 'c1' })
  })

  it('일반 채널 멘션이면 parentChannelId 를 넘기지 않는다', async () => {
    const { deps, beginSpy } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx({ isThread: false, parentChannelId: 'ignored' }))
    expect(deps.collector.collect.mock.calls[0][4].parentChannelId).toBeUndefined()
    expect(beginSpy.mock.calls[0][1]).toMatchObject({ inThread: false })
  })
})

describe('MentionPipeline — 예외', () => {
  it('collect 예외 시 release + 실패 안내, dispatch 안 함', async () => {
    const { deps } = makeDeps()
    deps.collector.collect.mockRejectedValue(new Error('수집 실패'))
    await expect(new MentionPipeline(deps as never).handle(ctx())).resolves.toBeUndefined()
    expect(deps.spawner.release).toHaveBeenCalledWith('c1')
    expect(deps.responder.send).toHaveBeenCalledTimes(1)
    expect(deps.responder.send.mock.calls[0][1]).toContain('작업을 시작하지 못했습니다')
    expect(deps.spawner.dispatch).not.toHaveBeenCalled()
  })

  it('dispatch 예외도 release + 실패 안내 (진행 메시지 뒤에 한 번 더)', async () => {
    const { deps } = makeDeps()
    deps.spawner.dispatch.mockRejectedValue(new Error('spawn 실패'))
    await new MentionPipeline(deps as never).handle(ctx())
    expect(deps.spawner.release).toHaveBeenCalledWith('c1')
    expect(deps.responder.send).toHaveBeenCalledTimes(2)
    expect(deps.responder.send.mock.calls[1][1]).toContain('작업을 시작하지 못했습니다')
  })

  it('begin 이후 dispatch 가 실패하면 대기 턴도 정리한다 — 남으면 다음 Stop 이 오회신 대상이 된다', async () => {
    const { deps } = makeDeps()
    deps.spawner.dispatch.mockRejectedValue(new Error('spawn 실패'))
    await new MentionPipeline(deps as never).handle(ctx())
    expect(deps.turns.has('c1')).toBe(false)
  })
})

describe('MentionPipeline — progress.start', () => {
  it('진행 메시지 logId 와 함께 시작 (회신 자리·시작 시각 포함), dispatch 보다 먼저', async () => {
    const { deps } = makeDeps()
    const progress = { start: vi.fn() }
    await new MentionPipeline({ ...deps, progress } as never).handle(ctx())
    expect(progress.start).toHaveBeenCalledTimes(1)
    expect(progress.start).toHaveBeenCalledWith('c1', { replyChannelId: 'c1', progressLogId: 'progress-1', startedAt: 1_000_000 })
    expect(progress.start.mock.invocationCallOrder[0]).toBeGreaterThan(deps.responder.send.mock.invocationCallOrder[0])
    expect(progress.start.mock.invocationCallOrder[0]).toBeLessThan(deps.spawner.dispatch.mock.invocationCallOrder[0])
  })

  it('진행 메시지 송신이 실패(null)하면 progressLogId null 로 호출 — ProgressReporter 가 추적하지 않는다', async () => {
    const { deps } = makeDeps()
    deps.responder.send.mockResolvedValue(null)
    const progress = { start: vi.fn() }
    await new MentionPipeline({ ...deps, progress } as never).handle(ctx())
    expect(progress.start).toHaveBeenCalledWith('c1', expect.objectContaining({ progressLogId: null }))
  })

  it('stale / busy 로 거부된 멘션은 progress 를 시작하지 않는다', async () => {
    const { deps } = makeDeps()
    const progress = { start: vi.fn() }
    const pipeline = new MentionPipeline({ ...deps, progress } as never)
    await pipeline.handle(ctx({ delayedMs: STALE_MENTION_MS + 1 }))
    deps.spawner.tryReserve.mockReturnValue({ ok: false, sinceMs: 1000 })
    await pipeline.handle(ctx())
    expect(progress.start).not.toHaveBeenCalled()
  })

  it('progress 가 주입되지 않아도 정상 진행', async () => {
    const { deps } = makeDeps()
    await new MentionPipeline(deps as never).handle(ctx())
    expect(deps.spawner.dispatch).toHaveBeenCalled()
  })
})

