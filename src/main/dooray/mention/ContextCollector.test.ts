import { describe, it, expect, vi } from 'vitest'

// extractText 가 WatcherService 에서 export 되는데, WatcherService 가 electron/electron-store 를
// import 한다. CI 에서 electron 바이너리 install 실패 시 모듈 로드 자체가 깨지므로 mock 필요.
vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})
vi.mock('electron', () => ({
  BrowserWindow: class {},
  Notification: class { static isSupported(): boolean { return false } on(): void {} show(): void {} }
}))

import { ContextCollector } from './ContextCollector'

function makeLog(id: string, opts: { text?: string; sender?: string; senderName?: string; sentAt?: string } = {}) {
  return {
    id,
    text: opts.text ?? `msg ${id}`,
    sender: { member: { organizationMemberId: opts.sender || 'm1', name: opts.senderName } },
    sentAt: opts.sentAt || '2026-05-13T10:00:00Z'
  }
}

function makeMessenger(logs: ReturnType<typeof makeLog>[], channels: Array<{ id: string; displayName: string }> = []) {
  return {
    fetchChannelLogs: vi.fn().mockResolvedValue(logs),
    resolveMemberNames: vi.fn().mockResolvedValue(undefined),
    getMemberName: vi.fn().mockImplementation(async (id: string) => `name-${id}`),
    listChannels: vi.fn().mockResolvedValue(channels)
  }
}

describe('ContextCollector.collect', () => {
  it('mentionLogId 기준으로 그 시점부터 과거 windowSize 만큼 슬라이스', async () => {
    const logs = [
      makeLog('5'), // 최신
      makeLog('4'),
      makeLog('3'), // mention
      makeLog('2'),
      makeLog('1')
    ]
    const m = makeMessenger(logs)
    const c = new ContextCollector(m as never)
    const ctx = await c.collect('ch1', '3', 10)
    // mentionIdx=2, slice = logs[2..12] → ['3','2','1']
    // reverse → ['1','2','3']
    expect(ctx.messages.map((x) => x.text)).toEqual(['msg 1', 'msg 2', 'msg 3'])
    expect(ctx.mentionLogId).toBe('3')
  })

  it('windowSize=2 → mention 이후로 2개만', async () => {
    const logs = [makeLog('5'), makeLog('4'), makeLog('3'), makeLog('2'), makeLog('1')]
    const c = new ContextCollector(makeMessenger(logs) as never)
    const ctx = await c.collect('ch1', '3', 2)
    expect(ctx.messages.map((x) => x.text)).toEqual(['msg 2', 'msg 3'])
  })

  it('mentionLogId 가 안 보이면 최신부터', async () => {
    const logs = [makeLog('5'), makeLog('4'), makeLog('3')]
    const c = new ContextCollector(makeMessenger(logs) as never)
    const ctx = await c.collect('ch1', 'absent', 10)
    expect(ctx.messages.map((x) => x.text)).toEqual(['msg 3', 'msg 4', 'msg 5'])
  })

  it('빈 텍스트 메시지는 제외', async () => {
    const logs = [
      makeLog('3', { text: '내용' }),
      makeLog('2', { text: '' }),
      makeLog('1', { text: '   ' })
    ]
    const c = new ContextCollector(makeMessenger(logs) as never)
    const ctx = await c.collect('ch1', '3', 10)
    expect(ctx.messages).toHaveLength(1)
  })

  it('sender.member.name 우선 사용, 없으면 getMemberName 폴백', async () => {
    const logs = [
      makeLog('1', { sender: 'm1', senderName: '본명' }),
      { id: '2', text: 'no name', sender: { member: { organizationMemberId: 'm2' } }, sentAt: '2026-05-13T10:00:00Z' }
    ]
    const m = makeMessenger(logs as never)
    const c = new ContextCollector(m as never)
    const ctx = await c.collect('ch1', '1', 10)
    const byText = Object.fromEntries(ctx.messages.map((x) => [x.text, x.authorName]))
    expect(byText['msg 1']).toBe('본명')
    expect(byText['no name']).toBe('name-m2')
  })

  it('authorId / sentAt 없어도 폴백 처리', async () => {
    const logs = [{ id: '1', text: 'hi', sender: {} }]
    const m = makeMessenger(logs as never)
    const c = new ContextCollector(m as never)
    const ctx = await c.collect('ch1', '1', 5)
    expect(ctx.messages[0].authorName).toBe('알 수 없음')
    expect(typeof ctx.messages[0].sentAt).toBe('string')
  })

  it('channelName override 우선', async () => {
    const c = new ContextCollector(makeMessenger([makeLog('1')]) as never)
    const ctx = await c.collect('ch1', '1', 5, '직접지정')
    expect(ctx.channelName).toBe('직접지정')
  })

  it('listChannels 에서 채널 이름 해석', async () => {
    const c = new ContextCollector(
      makeMessenger([makeLog('1')], [{ id: 'ch1', displayName: '내 채널' }]) as never
    )
    const ctx = await c.collect('ch1', '1', 5)
    expect(ctx.channelName).toBe('내 채널')
  })

  it('listChannels 실패 시 channelId 를 그대로 사용', async () => {
    const m = makeMessenger([makeLog('1')])
    m.listChannels.mockRejectedValueOnce(new Error('fail'))
    const c = new ContextCollector(m as never)
    const ctx = await c.collect('ch1', '1', 5)
    expect(ctx.channelName).toBe('ch1')
  })

  it('listChannels 에 매치 없으면 channelId 폴백', async () => {
    const c = new ContextCollector(
      makeMessenger([makeLog('1')], [{ id: 'other', displayName: '다른' }]) as never
    )
    const ctx = await c.collect('ch1', '1', 5)
    expect(ctx.channelName).toBe('ch1')
  })
})
