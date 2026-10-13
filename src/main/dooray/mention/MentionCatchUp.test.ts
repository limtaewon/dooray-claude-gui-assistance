import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// MentionCatchUp 이 WatcherService.extractText 를 import 하므로 electron 계열을 mock.
vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})
vi.mock('electron', () => ({
  BrowserWindow: class {},
  Notification: class { static isSupported(): boolean { return false } on(): void {} show(): void {} }
}))

import { MentionCatchUp, MentionCatchUpState, type KeyValueStorage } from './MentionCatchUp'
import { MemElectronStore } from '../../../../test/mocks/electron-store'

function memStorage(initial: Record<string, unknown> = {}): KeyValueStorage & { data: Record<string, unknown> } {
  const store = new MemElectronStore<Record<string, unknown>>({ defaults: initial })
  return Object.assign(store as unknown as KeyValueStorage, { data: (store as unknown as { data: Record<string, unknown> }).data })
}

describe('MentionCatchUpState', () => {
  it('add 한 logId 는 has, 중복 add 는 한 번만 저장', () => {
    const storage = memStorage()
    const set = vi.spyOn(storage, 'set')
    const s = new MentionCatchUpState(storage)
    expect(s.has('a')).toBe(false)
    s.add('a')
    s.add('a')
    expect(s.has('a')).toBe(true)
    expect(set).toHaveBeenCalledTimes(1)
  })

  it('저장소에서 복원 (문자열이 아닌 값은 버림)', () => {
    const s = new MentionCatchUpState(memStorage({ processedMentionIds: ['a', 1, null, 'b'] }))
    expect(s.has('a')).toBe(true)
    expect(s.has('b')).toBe(true)
    expect(s.has('1')).toBe(false)
  })

  it('배열이 아닌 저장값은 빈 목록으로', () => {
    expect(new MentionCatchUpState(memStorage({ processedMentionIds: 'oops' })).has('oops')).toBe(false)
  })

  it('processed 는 500개 cap — 오래된 것부터 버린다', () => {
    const storage = memStorage()
    const s = new MentionCatchUpState(storage)
    for (let i = 0; i < 505; i++) s.add(`id${i}`)
    expect(s.has('id0')).toBe(false)
    expect(s.has('id4')).toBe(false)
    expect(s.has('id5')).toBe(true)
    expect(s.has('id504')).toBe(true)
    expect((storage.get('processedMentionIds') as string[]).length).toBe(500)
  })

  it('새 인스턴스가 저장된 목록을 이어받는다', () => {
    const storage = memStorage()
    new MentionCatchUpState(storage).add('persisted')
    expect(new MentionCatchUpState(storage).has('persisted')).toBe(true)
  })

  it('lastAliveAt 저장/복원, 없거나 숫자가 아니면 null', () => {
    const storage = memStorage()
    const s = new MentionCatchUpState(storage)
    expect(s.getLastAliveAt()).toBeNull()
    s.setLastAliveAt(12345)
    expect(s.getLastAliveAt()).toBe(12345)
    storage.set('lastAliveAt', 'x')
    expect(s.getLastAliveAt()).toBeNull()
    storage.set('lastAliveAt', Number.NaN)
    expect(s.getLastAliveAt()).toBeNull()
  })
})

// ───────────────────────── MentionCatchUp.find ─────────────────────────

const NOW = Date.parse('2026-10-13T12:00:00Z')
const SINCE = Date.parse('2026-10-13T10:00:00Z')
const iso = (ms: number): string => new Date(ms).toISOString()

function log(id: string, opts: { text?: string; sender?: string; at?: number; thread?: Record<string, unknown> } = {}): Record<string, unknown> {
  return {
    id,
    text: opts.text ?? '@clauday 해줘',
    sender: { member: { organizationMemberId: opts.sender ?? 'me' } },
    sentAt: iso(opts.at ?? SINCE + 60_000),
    ...(opts.thread ? { thread: opts.thread } : {})
  }
}

function setup(opts: {
  channels?: Array<Record<string, unknown>>
  logs?: Record<string, Array<Record<string, unknown>>>
  myId?: string | null
  processed?: string[]
} = {}) {
  const channels = opts.channels ?? [{ id: 'c1', updatedAt: iso(SINCE + 1000), organizationId: 'org1' }]
  const logs = opts.logs ?? {}
  const messenger = {
    listAllChannelsRaw: vi.fn().mockResolvedValue(channels),
    fetchChannelLogs: vi.fn(async (ch: string) => {
      const v = logs[ch]
      if (v === undefined) return []
      return v
    })
  }
  const processed = new Set(opts.processed ?? [])
  const getMyMemberId = vi.fn().mockResolvedValue(opts.myId === undefined ? 'me' : opts.myId)
  const catchUp = new MentionCatchUp({
    messenger: messenger as never,
    getMyMemberId,
    matches: (t) => /^\s*@clauday(\s|$)/i.test(t),
    processed: { has: (id) => processed.has(id) },
    now: () => NOW
  })
  return { catchUp, messenger, getMyMemberId }
}

describe('MentionCatchUp.find', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('myId 를 모르면 빈 결과, 채널 목록도 조회하지 않는다', async () => {
    const { catchUp, messenger } = setup({ myId: null })
    expect(await catchUp.find(SINCE)).toEqual({ scannedChannels: 0, mentions: [] })
    expect(messenger.listAllChannelsRaw).not.toHaveBeenCalled()
  })

  it('updatedAt 이 since-60초 이전인 채널은 훑지 않는다 (60초 여유는 포함)', async () => {
    const { catchUp, messenger } = setup({
      channels: [
        { id: 'fresh', updatedAt: iso(SINCE + 1) },
        { id: 'slack', updatedAt: iso(SINCE - 59_000) },
        { id: 'edge', updatedAt: iso(SINCE - 60_000) },
        { id: 'old', updatedAt: iso(SINCE - 61_000) },
        { id: 'none' },
        { id: 'bad', updatedAt: 'nope' }
      ]
    })
    const r = await catchUp.find(SINCE)
    expect(r.scannedChannels).toBe(3)
    expect(messenger.fetchChannelLogs.mock.calls.map((c) => c[0]).sort()).toEqual(['edge', 'fresh', 'slack'])
  })

  it('내 멘션 + 트리거 매치 + since 이후 + 미처리만', async () => {
    const { catchUp } = setup({
      logs: {
        c1: [
          log('ok'),
          log('other-sender', { sender: 'someone' }),
          log('no-trigger', { text: '안녕하세요' }),
          log('mid-trigger', { text: '안녕 @clauday' }),
          log('before-since', { at: SINCE - 1 }),
          log('done'),
          log('empty', { text: '' })
        ]
      },
      processed: ['done']
    })
    const r = await catchUp.find(SINCE)
    expect(r.mentions.map((m) => m.logId)).toEqual(['ok'])
  })

  it('since 와 정확히 같은 시각은 포함', async () => {
    const { catchUp } = setup({ logs: { c1: [log('edge', { at: SINCE })] } })
    expect((await catchUp.find(SINCE)).mentions.map((m) => m.logId)).toEqual(['edge'])
  })

  it('sentAt 없으면 createdAt 사용, 둘 다 없으면 제외', async () => {
    const a = { ...log('a'), sentAt: undefined, createdAt: iso(SINCE + 5000) }
    const b = { ...log('b'), sentAt: undefined }
    const { catchUp } = setup({ logs: { c1: [a, b] } })
    expect((await catchUp.find(SINCE)).mentions.map((m) => m.logId)).toEqual(['a'])
  })

  it('MentionContext 필드: senderId/text/delayedMs/채널 메타', async () => {
    const at = SINCE + 600_000
    const { catchUp } = setup({ logs: { c1: [log('m1', { at, text: '@clauday 정리해줘' })] } })
    const [m] = (await catchUp.find(SINCE)).mentions
    expect(m).toMatchObject({
      channelId: 'c1',
      senderId: 'me',
      logId: 'm1',
      text: '@clauday 정리해줘',
      isThread: false,
      parentChannelId: undefined,
      delayedMs: NOW - at
    })
    expect(m.raw).toEqual({ references: { channelMap: { c1: { orgId: 'org1' } } } })
  })

  it('delayedMs 는 음수가 되지 않는다 (미래 시각)', async () => {
    const { catchUp } = setup({ logs: { c1: [log('future', { at: NOW + 10_000 })] } })
    expect((await catchUp.find(SINCE)).mentions[0].delayedMs).toBe(0)
  })

  it('보낸 시각 오름차순 정렬 (채널이 섞여도)', async () => {
    const { catchUp } = setup({
      channels: [
        { id: 'c1', updatedAt: iso(NOW) },
        { id: 'c2', updatedAt: iso(NOW) }
      ],
      logs: {
        c1: [log('c1-late', { at: SINCE + 300_000 }), log('c1-early', { at: SINCE + 100_000 })],
        c2: [log('c2-mid', { at: SINCE + 200_000 })]
      }
    })
    expect((await catchUp.find(SINCE)).mentions.map((m) => m.logId)).toEqual(['c1-early', 'c2-mid', 'c1-late'])
  })

  it('lastUpdatedAt 이 since-60초 이후인 글타래만 추가 조회하고 parentChannelId/isThread 를 채운다', async () => {
    const { catchUp, messenger } = setup({
      logs: {
        c1: [
          log('root-active', { text: '일반 글', thread: { channelId: 'thr-active', lastUpdatedAt: SINCE + 1000 } }),
          log('root-stale', { text: '일반 글', thread: { channelId: 'thr-stale', lastUpdatedAt: SINCE - 120_000 } }),
          log('root-nots', { text: '일반 글', thread: { channelId: 'thr-nots' } })
        ],
        'thr-active': [log('reply-mention', { at: SINCE + 120_000 }), log('reply-plain', { text: '네' })],
        'thr-stale': [log('should-not-see')],
        'thr-nots': [log('should-not-see-2')]
      }
    })
    const r = await catchUp.find(SINCE)
    const fetched = messenger.fetchChannelLogs.mock.calls.map((c) => c[0])
    expect(fetched).toContain('thr-active')
    expect(fetched).not.toContain('thr-stale')
    expect(fetched).not.toContain('thr-nots')
    expect(r.mentions).toHaveLength(1)
    const m = r.mentions[0]
    expect(m).toMatchObject({ channelId: 'thr-active', logId: 'reply-mention', isThread: true, parentChannelId: 'c1' })
    expect(m.raw).toEqual({ references: { channelMap: { 'thr-active': { orgId: 'org1', type: 'thread', parentChannelId: 'c1' } } } })
  })

  it('원글 자체가 내 멘션이고 글타래도 있으면 둘 다 찾는다', async () => {
    const { catchUp } = setup({
      logs: {
        c1: [log('root', { at: SINCE + 10_000, thread: { channelId: 'thr', lastUpdatedAt: SINCE + 20_000 } })],
        thr: [log('reply', { at: SINCE + 30_000 })]
      }
    })
    const r = await catchUp.find(SINCE)
    expect(r.mentions.map((m) => [m.logId, m.isThread])).toEqual([['root', false], ['reply', true]])
  })

  it('processed 는 글타래 답글에도 적용', async () => {
    const { catchUp } = setup({
      logs: {
        c1: [log('root', { text: 'x', thread: { channelId: 'thr', lastUpdatedAt: SINCE + 1 } })],
        thr: [log('reply')]
      },
      processed: ['reply']
    })
    expect((await catchUp.find(SINCE)).mentions).toEqual([])
  })

  it('한 채널의 로그 조회가 실패해도 건너뛰고 나머지를 계속', async () => {
    const { catchUp, messenger } = setup({
      channels: [
        { id: 'bad', updatedAt: iso(NOW) },
        { id: 'good', updatedAt: iso(NOW) }
      ],
      logs: { good: [log('g1')] }
    })
    messenger.fetchChannelLogs.mockImplementation(async (ch: string) => {
      if (ch === 'bad') throw new Error('500')
      return [log('g1')]
    })
    const r = await catchUp.find(SINCE)
    expect(r.scannedChannels).toBe(2)
    expect(r.mentions.map((m) => m.logId)).toEqual(['g1'])
    expect(console.warn).toHaveBeenCalled()
  })

  it('글타래 조회가 실패해도 그 채널의 나머지 멘션은 유지', async () => {
    const { catchUp, messenger } = setup({
      logs: { c1: [log('root', { thread: { channelId: 'thr', lastUpdatedAt: SINCE + 1 } }), log('other', { at: SINCE + 5000 })] }
    })
    messenger.fetchChannelLogs.mockImplementation(async (ch: string) => {
      if (ch === 'thr') throw new Error('boom')
      return [log('root', { thread: { channelId: 'thr', lastUpdatedAt: SINCE + 1 } }), log('other', { at: SINCE + 5000 })]
    })
    const r = await catchUp.find(SINCE)
    expect(r.mentions.map((m) => m.logId).sort()).toEqual(['other', 'root'])
  })

  it('채널이 하나도 없으면 빈 결과', async () => {
    const { catchUp } = setup({ channels: [] })
    expect(await catchUp.find(SINCE)).toEqual({ scannedChannels: 0, mentions: [] })
  })

  it('now 미주입이면 Date.now 로 delayedMs 계산', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const messenger = {
      listAllChannelsRaw: vi.fn().mockResolvedValue([{ id: 'c1', updatedAt: iso(NOW) }]),
      fetchChannelLogs: vi.fn().mockResolvedValue([log('m', { at: NOW - 5000 })])
    }
    const catchUp = new MentionCatchUp({
      messenger: messenger as never,
      getMyMemberId: async () => 'me',
      matches: () => true,
      processed: { has: () => false }
    })
    const r = await catchUp.find(SINCE)
    vi.useRealTimers()
    expect(r.mentions[0].delayedMs).toBe(5000)
  })
})
