import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})

vi.mock('electron', () => ({
  BrowserWindow: class {},
  Notification: class { static isSupported(): boolean { return false } on(): void {} show(): void {} }
}))

import { WatcherService, extractText } from './WatcherService'

function makeMessenger() {
  return {
    listChannels: vi.fn().mockResolvedValue([]),
    fetchChannelLogs: vi.fn().mockResolvedValue([]),
    getMemberName: vi.fn().mockResolvedValue(''),
    resolveMemberNames: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined)
  }
}

let svc: WatcherService
let messenger: ReturnType<typeof makeMessenger>

beforeEach(() => {
  messenger = makeMessenger()
  svc = new WatcherService(messenger as never)
})

describe('extractText', () => {
  it('text 필드 우선', () => {
    expect(extractText({ id: 'l', text: 'hi' } as never)).toBe('hi')
  })

  it('text 가 비어있으면 message → messageText → content → body 순', () => {
    expect(extractText({ id: 'l', message: 'M' } as never)).toBe('M')
    expect(extractText({ id: 'l', messageText: 'MT' } as never)).toBe('MT')
    expect(extractText({ id: 'l', content: 'C' } as never)).toBe('C')
    expect(extractText({ id: 'l', body: 'B' } as never)).toBe('B')
  })

  it('content / body 가 객체이면 .content 추출', () => {
    expect(extractText({ id: 'l', content: { content: 'OBJ-C' } } as never)).toBe('OBJ-C')
    expect(extractText({ id: 'l', body: { content: 'OBJ-B' } } as never)).toBe('OBJ-B')
  })

  it('JSON 형태 rich text → text 필드 추출', () => {
    expect(extractText({ id: 'l', text: JSON.stringify({ text: 'inner' }) } as never)).toBe('inner')
  })

  it('blocks 배열 안 text 모음', () => {
    const raw = JSON.stringify({ blocks: [{ text: 'A' }, { text: 'B' }] })
    expect(extractText({ id: 'l', text: raw } as never)).toBe('A\nB')
  })

  it('빈 본문은 빈 문자열', () => {
    expect(extractText({ id: 'l' } as never)).toBe('')
  })

  it('JSON 파싱 실패한 { 로 시작하는 텍스트는 원본 반환', () => {
    expect(extractText({ id: 'l', text: '{not-json' } as never)).toBe('{not-json')
  })
})

describe('WatcherService — CRUD', () => {
  it('createWatcher → listWatchers 에 등장', () => {
    const w = svc.createWatcher({
      name: '와처A', instruction: 'inst',
      channelIds: ['c1'], channelNames: ['채널A'],
      filter: { anyOf: ['배포'] }
    } as never)
    expect(w.id).toBeTruthy()
    expect(w.enabled).toBe(true)
    const list = svc.listWatchers()
    expect(list).toHaveLength(1)
  })

  it('updateWatcher 로 부분 패치', () => {
    const w = svc.createWatcher({ name: 'A', channelIds: ['c1'], channelNames: ['ch'], filter: {}, instruction: '' } as never)
    const updated = svc.updateWatcher(w.id, { name: 'A2', enabled: false } as never)!
    expect(updated.name).toBe('A2')
    expect(updated.enabled).toBe(false)
    expect(updated.filter).toBe(w.filter)
  })

  it('updateWatcher — 존재 없으면 null', () => {
    expect(svc.updateWatcher('nope', {} as never)).toBeNull()
  })

  it('deleteWatcher 후 메시지도 함께 정리', () => {
    const w = svc.createWatcher({ name: 'A', channelIds: ['c1'], channelNames: ['ch'], filter: {}, instruction: '' } as never)
    svc.deleteWatcher(w.id)
    expect(svc.listWatchers()).toHaveLength(0)
  })
})

describe('WatcherService — handleSocketEvent (필터 매칭)', () => {
  it('messenger 외 이벤트 무시', async () => {
    await svc.handleSocketEvent({ service: 'task', type: 'message' } as never)
    expect(messenger.getMemberName).not.toHaveBeenCalled()
  })

  it('필수 필드 누락 무시', async () => {
    await svc.handleSocketEvent({ service: 'messenger', type: 'message', text: 'x' } as never)
    expect(messenger.getMemberName).not.toHaveBeenCalled()
  })

  it('anyOf 매치 시 메시지 저장 + listForWatcher 에 등장', async () => {
    const w = svc.createWatcher({
      name: 'X', instruction: '', channelIds: ['c1'], channelNames: ['CH'],
      filter: { anyOf: ['배포', 'deploy'] }
    } as never)
    messenger.getMemberName.mockResolvedValueOnce('홍길동')
    await svc.handleSocketEvent({
      service: 'messenger', type: 'message', text: '배포 완료',
      channelId: 'c1', senderId: 'u1', logId: 'log1'
    } as never)
    const msgs = svc.messagesForWatcher(w.id)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].authorName).toBe('홍길동')
    expect(msgs[0].matchedTerms).toContain('배포')
  })

  it('exclude 매치 시 차단', async () => {
    svc.createWatcher({
      name: 'X', instruction: '', channelIds: ['c1'], channelNames: ['CH'],
      filter: { anyOf: ['배포'], exclude: ['테스트'] }
    } as never)
    await svc.handleSocketEvent({
      service: 'messenger', type: 'message', text: '테스트 배포',
      channelId: 'c1', senderId: 'u1', logId: 'log1'
    } as never)
    expect(svc.listWatchers()[0]).toBeTruthy()
    expect(svc.messagesForWatcher(svc.listWatchers()[0].id)).toEqual([])
  })

  it('동일 messageId 중복 저장 안 됨', async () => {
    const w = svc.createWatcher({ name: 'X', instruction: '', channelIds: ['c1'], channelNames: ['ch'], filter: { anyOf: ['x'] } } as never)
    const ev = { service: 'messenger', type: 'message', text: 'x', channelId: 'c1', senderId: 'u', logId: 'L1' }
    await svc.handleSocketEvent(ev as never)
    await svc.handleSocketEvent(ev as never)
    expect(svc.messagesForWatcher(w.id)).toHaveLength(1)
  })

  it('regex 매칭', async () => {
    const w = svc.createWatcher({ name: 'X', instruction: '', channelIds: ['c1'], channelNames: ['ch'], filter: { regex: ['\\d{4}-\\d{2}-\\d{2}'] } } as never)
    await svc.handleSocketEvent({
      service: 'messenger', type: 'message', text: '오늘 2026-05-13 배포',
      channelId: 'c1', senderId: 'u', logId: 'L1'
    } as never)
    expect(svc.messagesForWatcher(w.id)).toHaveLength(1)
  })

  it('필터 비어있으면 모든 메시지 매치 (exclude 만 작동)', async () => {
    const w = svc.createWatcher({ name: 'X', instruction: '', channelIds: ['c1'], channelNames: ['ch'], filter: {} } as never)
    await svc.handleSocketEvent({
      service: 'messenger', type: 'message', text: '아무거나',
      channelId: 'c1', senderId: 'u', logId: 'L1'
    } as never)
    expect(svc.messagesForWatcher(w.id)).toHaveLength(1)
  })

  it('allOf — 모두 포함되어야 매치', async () => {
    const w = svc.createWatcher({ name: 'X', instruction: '', channelIds: ['c1'], channelNames: ['ch'], filter: { allOf: ['배포', '실패'] } } as never)
    await svc.handleSocketEvent({ service: 'messenger', type: 'message', text: '배포 성공', channelId: 'c1', senderId: 'u', logId: 'L1' } as never)
    expect(svc.messagesForWatcher(w.id)).toHaveLength(0)
    await svc.handleSocketEvent({ service: 'messenger', type: 'message', text: '배포 실패!', channelId: 'c1', senderId: 'u', logId: 'L2' } as never)
    expect(svc.messagesForWatcher(w.id)).toHaveLength(1)
  })

  it('getMemberName 실패 시 폴백 라벨', async () => {
    const w = svc.createWatcher({ name: 'X', instruction: '', channelIds: ['c1'], channelNames: ['ch'], filter: {} } as never)
    messenger.getMemberName.mockRejectedValueOnce(new Error('fail'))
    await svc.handleSocketEvent({ service: 'messenger', type: 'message', text: 'x', channelId: 'c1', senderId: 'u-abc-123-456', logId: 'L1' } as never)
    const msgs = svc.messagesForWatcher(w.id)
    expect(msgs[0].authorName).toContain('멤버')
  })

  it('senderId 없으면 "알 수 없음"', async () => {
    const w = svc.createWatcher({ name: 'X', instruction: '', channelIds: ['c1'], channelNames: ['ch'], filter: {} } as never)
    await svc.handleSocketEvent({ service: 'messenger', type: 'message', text: 'x', channelId: 'c1', logId: 'L1' } as never)
    const msgs = svc.messagesForWatcher(w.id)
    expect(msgs[0].authorName).toBe('알 수 없음')
  })
})

describe('WatcherService — markRead / unreadCounts', () => {
  it('markRead 후 unread 감소', async () => {
    const w = svc.createWatcher({ name: 'X', instruction: '', channelIds: ['c1'], channelNames: ['ch'], filter: {} } as never)
    await svc.handleSocketEvent({ service: 'messenger', type: 'message', text: 'x', channelId: 'c1', senderId: 'u', logId: 'L1' } as never)
    expect(svc.unreadCounts()[w.id]).toBe(1)
    const msgs = svc.messagesForWatcher(w.id)
    svc.markRead([msgs[0].id])
    expect(svc.unreadCounts()[w.id]).toBeUndefined()
  })

  it('markAllRead — 와처별 일괄', async () => {
    const w = svc.createWatcher({ name: 'X', instruction: '', channelIds: ['c1'], channelNames: ['ch'], filter: {} } as never)
    await svc.handleSocketEvent({ service: 'messenger', type: 'message', text: 'x', channelId: 'c1', senderId: 'u', logId: 'L1' } as never)
    svc.markAllRead(w.id)
    expect(svc.unreadCounts()[w.id]).toBeUndefined()
  })
})
