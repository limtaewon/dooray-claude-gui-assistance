import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessengerService } from './MessengerService'

function makeClient(responder?: (path: string, opts?: unknown) => unknown) {
  return {
    request: vi.fn((path: string, opts?: unknown) => {
      if (responder) return Promise.resolve(responder(path, opts))
      return Promise.resolve({ result: [] })
    })
  }
}

let svc: MessengerService

describe('MessengerService.listChannels', () => {
  it('archivedAt / type=direct 제외 + updatedAt 내림차순', async () => {
    const client = makeClient(() => ({
      result: [
        { id: '1', type: 'channel', title: 'A', updatedAt: '2026-01-01' },
        { id: '2', type: 'direct', title: 'DM', updatedAt: '2026-02-02' },
        { id: '3', type: 'channel', title: 'archived', updatedAt: '2026-03-03', archivedAt: '2026-04-01' },
        { id: '4', type: 'channel', title: 'B', updatedAt: '2026-02-02' }
      ]
    }))
    svc = new MessengerService(client as never)
    const chs = await svc.listChannels()
    expect(chs.map((c) => c.id)).toEqual(['4', '1'])
  })

  it('1분 TTL 캐시 (force=false)', async () => {
    const client = makeClient(() => ({ result: [{ id: '1', title: 'A' }] }))
    svc = new MessengerService(client as never)
    await svc.listChannels()
    await svc.listChannels()
    expect(client.request).toHaveBeenCalledTimes(1)
  })

  it('force=true 면 캐시 무시 후 재호출', async () => {
    const client = makeClient(() => ({ result: [{ id: '1', title: 'A' }] }))
    svc = new MessengerService(client as never)
    await svc.listChannels()
    await svc.listChannels(true)
    expect(client.request).toHaveBeenCalledTimes(2)
  })

  it('clearCache() 후 재호출', async () => {
    const client = makeClient(() => ({ result: [{ id: '1', title: 'A' }] }))
    svc = new MessengerService(client as never)
    await svc.listChannels()
    svc.clearCache()
    await svc.listChannels()
    expect(client.request).toHaveBeenCalledTimes(2)
  })

  it('displayName/title/name 우선순위', async () => {
    const client = makeClient(() => ({
      result: [
        { id: '1', displayName: 'D', title: 'T', name: 'N' },
        { id: '2', title: 'T', name: 'N' },
        { id: '3', name: 'N' },
        { id: '4' }
      ]
    }))
    svc = new MessengerService(client as never)
    const chs = await svc.listChannels()
    const byId = Object.fromEntries(chs.map((c) => [c.id, c.displayName]))
    expect(byId['1']).toBe('D')
    expect(byId['2']).toBe('T')
    expect(byId['3']).toBe('N')
    expect(byId['4']).toBe('(이름 없음)')
  })
})

describe('MessengerService.fetchChannelLogs', () => {
  it('size 와 order=-createdAt 으로 호출', async () => {
    const client = makeClient(() => ({ result: [{ id: 'l1', text: 'hi' }] }))
    svc = new MessengerService(client as never)
    const logs = await svc.fetchChannelLogs('ch1', 50)
    expect(client.request).toHaveBeenCalledWith('/messenger/v1/channels/ch1/logs?size=50&order=-createdAt')
    expect(logs).toHaveLength(1)
  })

  it('result 없으면 빈 배열', async () => {
    const client = makeClient(() => ({}))
    svc = new MessengerService(client as never)
    expect(await svc.fetchChannelLogs('ch1')).toEqual([])
  })
})

describe('MessengerService.sendMessage', () => {
  beforeEach(() => {
    svc = new MessengerService(makeClient(() => ({ header: { isSuccessful: true } })) as never)
  })

  it('빈 텍스트는 throw', async () => {
    await expect(svc.sendMessage('c', '')).rejects.toThrow(/비어있/)
    await expect(svc.sendMessage('c', '   ')).rejects.toThrow(/비어있/)
  })

  it('정상 호출 — POST + body JSON', async () => {
    const client = makeClient(() => ({ header: { isSuccessful: true } }))
    svc = new MessengerService(client as never)
    await svc.sendMessage('ch1', 'hi', 'org1')
    expect(client.request).toHaveBeenCalledWith(
      '/messenger/v1/channels/ch1/logs',
      expect.objectContaining({ method: 'POST' })
    )
    const body = JSON.parse((client.request.mock.calls[0][1] as { body: string }).body)
    expect(body).toEqual({ text: 'hi', organizationId: 'org1' })
  })

  it('organizationId 없으면 undefined', async () => {
    const client = makeClient(() => ({ header: { isSuccessful: true } }))
    svc = new MessengerService(client as never)
    await svc.sendMessage('ch1', 'hi')
    const body = JSON.parse((client.request.mock.calls[0][1] as { body: string }).body)
    expect(body.organizationId).toBeUndefined()
  })
})

describe('MessengerService.getMemberName / resolveMemberNames', () => {
  it('성공 시 캐시, 두 번째 호출은 네트워크 안 탐', async () => {
    const client = makeClient(() => ({ result: { name: '홍길동' } }))
    svc = new MessengerService(client as never)
    expect(await svc.getMemberName('m1')).toBe('홍길동')
    expect(await svc.getMemberName('m1')).toBe('홍길동')
    expect(client.request).toHaveBeenCalledTimes(1)
  })

  it('실패도 캐시 (재시도 방지)', async () => {
    const client = makeClient()
    client.request.mockRejectedValue(new Error('fail'))
    svc = new MessengerService(client as never)
    expect(await svc.getMemberName('m1')).toBe('')
    expect(await svc.getMemberName('m1')).toBe('')
    expect(client.request).toHaveBeenCalledTimes(1)
  })

  it('빈 ID 는 빈 문자열 반환', async () => {
    svc = new MessengerService(makeClient() as never)
    expect(await svc.getMemberName('')).toBe('')
  })

  it('result.name 없으면 빈 문자열', async () => {
    svc = new MessengerService(makeClient(() => ({ result: {} })) as never)
    expect(await svc.getMemberName('m1')).toBe('')
  })

  it('resolveMemberNames: 알려진 멤버는 skip', async () => {
    const client = makeClient(() => ({ result: { name: 'A' } }))
    svc = new MessengerService(client as never)
    await svc.getMemberName('m1') // 캐시 채움
    await svc.resolveMemberNames(['m1', 'm2', ''])
    // m1 은 캐시됨, '' 은 skip, m2 만 호출
    expect(client.request).toHaveBeenCalledTimes(2)
  })
})
