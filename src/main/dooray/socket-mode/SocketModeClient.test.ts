import { describe, it, expect, vi } from 'vitest'

// ws + electron 모킹 — 실제 네트워크 X
vi.mock('ws', () => {
  class FakeWS {
    static OPEN = 1
    on(): void {}
    close(): void {}
    send(): void {}
    readyState = 0
  }
  return { default: FakeWS, WebSocket: FakeWS }
})
vi.mock('electron', () => ({ net: { request: vi.fn() } }))

import { SocketModeClient } from './SocketModeClient'

describe('SocketModeClient — 생성/state', () => {
  it('botToken 누락 시 throw', () => {
    expect(() => new SocketModeClient({ botToken: '', domain: 'd' })).toThrow(/botToken/)
  })

  it('domain 누락 시 throw', () => {
    expect(() => new SocketModeClient({ botToken: 't', domain: '' })).toThrow(/domain/)
  })

  it('스킴 (https://) 자동 제거', () => {
    const c = new SocketModeClient({ botToken: 't', domain: 'https://x.dooray.com/' })
    expect((c as unknown as { opts: { domain: string } }).opts.domain).toBe('x.dooray.com')
  })

  it('초기 state=DISCONNECTED', () => {
    const c = new SocketModeClient({ botToken: 't', domain: 'd' })
    expect(c.getState()).toBe('DISCONNECTED')
  })

  it('disconnect 는 안전 no-op (ws 없을 때)', async () => {
    const c = new SocketModeClient({ botToken: 't', domain: 'd' })
    await expect(c.disconnect()).resolves.toBeUndefined()
  })
})

describe('SocketModeClient.normalize (private)', () => {
  type ClientWithNormalize = { normalize: (d: unknown) => unknown }
  function makeClient(services: string[] = ['messenger']): ClientWithNormalize {
    const c = new SocketModeClient({ botToken: 't', domain: 'd', services })
    return c as unknown as ClientWithNormalize
  }

  it('지원 안 하는 service 는 null', () => {
    const c = makeClient(['messenger'])
    expect(c.normalize({ service: 'wiki', type: 'message' })).toBeNull()
  })

  it('messenger 시스템 메시지 (content.type=1) 는 null', () => {
    const c = makeClient()
    expect(c.normalize({ service: 'messenger', type: 'message', content: { type: 1, text: 'sys' } })).toBeNull()
  })

  it('messenger message → type="message" 정규화', () => {
    const c = makeClient()
    const out = c.normalize({
      envelope_id: 'e1', service: 'messenger', type: 'message',
      content: { channelId: 'c1', text: 'hi', senderId: 'u1', id: 'log1', sentAt: '2026-05-13' }
    }) as Record<string, unknown>
    expect(out.type).toBe('message')
    expect(out.channelId).toBe('c1')
    expect(out.senderId).toBe('u1')
    expect(out.text).toBe('hi')
    expect(out.envelopeId).toBe('e1')
  })

  it('messenger + text + channelId 만 있어도 message 휴리스틱 통과', () => {
    const c = makeClient()
    const out = c.normalize({ service: 'messenger', type: 'someEvent', content: { channelId: 'c1', text: 'hi' } }) as Record<string, unknown>
    expect(out.type).toBe('message')
  })

  it('action 이 create/update 외면 null', () => {
    const c = makeClient()
    expect(c.normalize({ service: 'messenger', type: 'message', action: 'delete', content: { channelId: 'c1', text: 'x' } })).toBeNull()
  })

  it('action=update 는 통과', () => {
    const c = makeClient()
    const out = c.normalize({ service: 'messenger', type: 'message', action: 'update', content: { channelId: 'c1', text: 'x' } }) as Record<string, unknown>
    expect(out.action).toBe('update')
  })

  it('channelLog / channel-log / channelMessage 도 message 로 정규화', () => {
    const c = makeClient()
    for (const t of ['channelLog', 'channel-log', 'channelMessage', 'channel-message']) {
      const out = c.normalize({ service: 'messenger', type: t, content: { channelId: 'c', text: 'x' } }) as Record<string, unknown>
      expect(out.type).toBe('message')
    }
  })

  it('메시지가 아닌 이벤트는 raw type 그대로 통과', () => {
    const c = makeClient()
    const out = c.normalize({ service: 'messenger', type: 'channelMemberReadSeq', content: {} }) as Record<string, unknown>
    expect(out.type).toBe('channelMemberReadSeq')
  })

  it('content / payload 둘 다 없으면 빈 객체로 처리', () => {
    const c = makeClient()
    const out = c.normalize({ service: 'messenger', type: 'foo' }) as Record<string, unknown>
    expect(out).toBeTruthy()
  })

  it('payload 별칭도 content 로 사용', () => {
    const c = makeClient()
    const out = c.normalize({ service: 'messenger', type: 'message', payload: { channelId: 'c1', text: 'p' } }) as Record<string, unknown>
    expect(out.text).toBe('p')
  })
})

describe('SocketModeClient — isSessionLimitClose / connect 가드', () => {
  it('connect() 중복 호출 시 warn + 두 번째는 no-op', async () => {
    const c = new SocketModeClient({ botToken: 't', domain: 'd' })
    ;(c as unknown as { shouldReconnect: boolean }).shouldReconnect = true
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await c.connect()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
