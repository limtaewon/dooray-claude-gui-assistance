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

// ───────────────────────── 에이전트 강화(S1/S2) 추가분 ─────────────────────────

describe('MessengerService.sendMessage — logId 반환', () => {
  it('result.id 를 돌려준다', async () => {
    const client = makeClient(() => ({ result: { id: 'log-77' } }))
    svc = new MessengerService(client as never)
    expect(await svc.sendMessage('ch1', 'hi')).toBe('log-77')
  })

  it('result 가 없으면 null', async () => {
    svc = new MessengerService(makeClient(() => ({ result: null })) as never)
    expect(await svc.sendMessage('ch1', 'hi')).toBeNull()
    svc = new MessengerService(makeClient(() => ({ result: {} })) as never)
    expect(await svc.sendMessage('ch1', 'hi')).toBeNull()
  })
})

describe('MessengerService.sendCard', () => {
  it('POST /logs 에 text + attachments + organizationId, logId 반환', async () => {
    const client = makeClient(() => ({ result: { id: 'card-1' } }))
    svc = new MessengerService(client as never)
    const card = { title: '제목', color: '#2E7D32', fields: [{ title: '소요', value: '0:10', short: true }] }
    const id = await svc.sendCard('ch1', '[Clauday]', [card], 'org1')
    expect(id).toBe('card-1')
    const [path, opts] = client.request.mock.calls[0] as [string, { method: string; body: string }]
    expect(path).toBe('/messenger/v1/channels/ch1/logs')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ text: '[Clauday]', attachments: [card], organizationId: 'org1' })
  })

  it('organizationId 생략 시 body 에서 빠진다', async () => {
    const client = makeClient(() => ({ result: { id: 'c' } }))
    svc = new MessengerService(client as never)
    await svc.sendCard('ch1', 't', [{ title: 'x' }])
    const body = JSON.parse((client.request.mock.calls[0][1] as { body: string }).body)
    expect('organizationId' in body).toBe(false)
  })
})

describe('MessengerService.updateMessage', () => {
  it('PUT /logs/{logId} 에 text 만 보낸다', async () => {
    const client = makeClient(() => ({ header: { isSuccessful: true } }))
    svc = new MessengerService(client as never)
    await svc.updateMessage('ch1', 'log9', '✅ 완료')
    const [path, opts] = client.request.mock.calls[0] as [string, { method: string; body: string }]
    expect(path).toBe('/messenger/v1/channels/ch1/logs/log9')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ text: '✅ 완료' })
  })

  it('빈 텍스트는 요청 없이 throw', async () => {
    const client = makeClient()
    svc = new MessengerService(client as never)
    await expect(svc.updateMessage('ch1', 'l', '  ')).rejects.toThrow(/비어있/)
    expect(client.request).not.toHaveBeenCalled()
  })
})

describe('MessengerService.createThreadAndSend', () => {
  it('body 에 text·attachments·threadText, threadChannelId 반환', async () => {
    const client = makeClient(() => ({ result: { id: 'root-1', channelId: 'thr-1' } }))
    svc = new MessengerService(client as never)
    const card = { title: '요약' }
    const res = await svc.createThreadAndSend('ch1', { text: '[Clauday]', attachments: [card] }, '(1/2)\n본문')
    expect(res).toEqual({ threadChannelId: 'thr-1' })
    const [path, opts] = client.request.mock.calls[0] as [string, { method: string; body: string }]
    expect(path).toBe('/messenger/v1/channels/ch1/threads/create-and-send')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ text: '[Clauday]', attachments: [card], threadText: '(1/2)\n본문' })
  })

  it('attachments 가 없거나 비어 있고 threadText 도 없으면 text 만', async () => {
    const client = makeClient(() => ({ result: { channelId: 't' } }))
    svc = new MessengerService(client as never)
    await svc.createThreadAndSend('ch1', { text: 'a', attachments: [] })
    expect(JSON.parse((client.request.mock.calls[0][1] as { body: string }).body)).toEqual({ text: 'a' })
  })

  it('응답에 channelId 가 없으면 threadChannelId null', async () => {
    svc = new MessengerService(makeClient(() => ({ result: { id: 'x' } })) as never)
    expect(await svc.createThreadAndSend('ch1', { text: 'a' })).toEqual({ threadChannelId: null })
    svc = new MessengerService(makeClient(() => ({ result: null })) as never)
    expect(await svc.createThreadAndSend('ch1', { text: 'a' })).toEqual({ threadChannelId: null })
  })
})

describe('MessengerService.downloadChannelFile', () => {
  const clientWith = (dataUrl: string) => ({ fetchBinary: vi.fn().mockResolvedValue(dataUrl), request: vi.fn() })

  it('file-api 경로로 요청하고 base64 data URL 을 Buffer 로 디코드', async () => {
    const client = clientWith(`data:image/png;base64,${Buffer.from('PNGDATA').toString('base64')}`)
    svc = new MessengerService(client as never)
    const res = await svc.downloadChannelFile('ch1', 'file9')
    expect(client.fetchBinary).toHaveBeenCalledWith('https://file-api.dooray.com/downloads/messenger/v1/channels/ch1/files/file9?media=raw')
    expect(res.mimeType).toBe('image/png')
    expect(res.data.toString()).toBe('PNGDATA')
    expect(client.request).not.toHaveBeenCalled()
  })

  it('base64 가 아닌 data URL 은 퍼센트 디코드한 utf8', async () => {
    svc = new MessengerService(clientWith('data:text/plain,%ED%95%9C%EA%B8%80') as never)
    const res = await svc.downloadChannelFile('c', 'f')
    expect(res.mimeType).toBe('text/plain')
    expect(res.data.toString('utf8')).toBe('한글')
  })

  it('mime 이 비어 있으면 application/octet-stream', async () => {
    svc = new MessengerService(clientWith('data:;base64,QUJD') as never)
    const res = await svc.downloadChannelFile('c', 'f')
    expect(res.mimeType).toBe('application/octet-stream')
    expect(res.data.toString()).toBe('ABC')
  })

  it('data URL 형식이 아니면 throw', async () => {
    svc = new MessengerService(clientWith('<html>login</html>') as never)
    await expect(svc.downloadChannelFile('c', 'f')).rejects.toThrow(/형식/)
  })

  it('fetchBinary 실패는 그대로 전파', async () => {
    const client = { fetchBinary: vi.fn().mockRejectedValue(new Error('403')), request: vi.fn() }
    svc = new MessengerService(client as never)
    await expect(svc.downloadChannelFile('c', 'f')).rejects.toThrow('403')
  })
})

describe('MessengerService.listAllChannelsRaw', () => {
  it('direct 는 포함하고 보관(archivedAt) 채널만 제외', async () => {
    const client = makeClient(() => ({
      result: [
        { id: '1', type: 'channel', updatedAt: '2026-01-01', organizationId: 'o1' },
        { id: '2', type: 'direct', updatedAt: '2026-02-02' },
        { id: '3', type: 'channel', archivedAt: '2026-04-01' }
      ]
    }))
    svc = new MessengerService(client as never)
    const all = await svc.listAllChannelsRaw()
    expect(all.map((c) => c.id)).toEqual(['1', '2'])
    expect(all[0]).toMatchObject({ organizationId: 'o1', updatedAt: '2026-01-01' })
    expect(client.request).toHaveBeenCalledWith('/messenger/v1/channels?size=200')
  })

  it('캐시를 쓰지 않고 매번 조회', async () => {
    const client = makeClient(() => ({ result: [{ id: '1' }] }))
    svc = new MessengerService(client as never)
    await svc.listAllChannelsRaw()
    await svc.listAllChannelsRaw()
    expect(client.request).toHaveBeenCalledTimes(2)
  })

  it('result 가 없으면 빈 배열', async () => {
    svc = new MessengerService(makeClient(() => ({})) as never)
    expect(await svc.listAllChannelsRaw()).toEqual([])
  })
})

describe('MessengerService.deleteMessage', () => {
  it('DELETE /messenger/v1/channels/{ch}/logs/{id}', async () => {
    const client = makeClient(() => ({ header: { isSuccessful: true } }))
    svc = new MessengerService(client as never)
    await expect(svc.deleteMessage('ch1', 'log9')).resolves.toBeUndefined()
    expect(client.request).toHaveBeenCalledTimes(1)
    const [path, opts] = client.request.mock.calls[0] as [string, { method: string; body?: string }]
    expect(path).toBe('/messenger/v1/channels/ch1/logs/log9')
    expect(opts.method).toBe('DELETE')
    expect(opts.body).toBeUndefined()
  })

  it('서버 오류(시스템 메시지 500 등)는 호출자에게 전파', async () => {
    const client = { request: vi.fn().mockRejectedValue(new Error('500')) }
    svc = new MessengerService(client as never)
    await expect(svc.deleteMessage('ch1', 'sys')).rejects.toThrow('500')
  })
})

