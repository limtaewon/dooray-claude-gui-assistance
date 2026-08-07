import { reconnectDelayMs, SESSION_INFO_TIMEOUT_MS, TOKEN_FETCH_TIMEOUT_MS } from './types'
import { describe, it, expect, vi } from 'vitest'

// ws + electron 모킹 — 실제 네트워크 X
vi.mock('ws', () => {
  class FakeWS {
    static OPEN = 1
    on(): void {}
    close(): void {}
    send(): void {}
    terminate(): void {}
    emit(): boolean { return false }
    readyState = 0
  }
  return { default: FakeWS, WebSocket: FakeWS }
})
vi.mock('electron', () => ({ net: { request: vi.fn() } }))

import { net } from 'electron'
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

/**
 * 재연결 버튼이 바로 안 듣던 두 원인의 회귀 게이트.
 * ① 대기 중이던 루프가 disconnect 후에도 깨어나지 못해 그 자리에 매달렸다.
 * ② 소켓을 닫자마자 새로 붙어 서버가 '세션 중복' 으로 막고 STANDBY(15초)로 빠졌다.
 */
describe('SocketModeClient — disconnect 가 대기를 깨운다', () => {
  type Internals = {
    wait: (ms: number) => Promise<void>
    pendingWaits: Set<() => void>
    ws: unknown
  }

  it('대기 중이던 sleep 이 disconnect 로 즉시 끝난다 — clearTimeout 만으로는 영영 안 끝난다', async () => {
    const c = new SocketModeClient({ botToken: 't', domain: 'd' })
    const inner = c as unknown as Internals

    let resolved = false
    const waiting = inner.wait(60_000).then(() => { resolved = true })
    expect(inner.pendingWaits.size).toBe(1)

    await c.disconnect()
    await waiting

    expect(resolved).toBe(true)
    expect(inner.pendingWaits.size).toBe(0)
  })

  it('소켓이 close 를 알리면 유예 시간을 다 안 쓰고 끝난다', async () => {
    const c = new SocketModeClient({ botToken: 't', domain: 'd' })
    const inner = c as unknown as Internals

    const listeners: Record<string, () => void> = {}
    let closeCalled = false
    inner.ws = {
      once: (event: string, cb: () => void) => { listeners[event] = cb },
      // 실제 ws 처럼 close() 호출 뒤 close 이벤트가 온다.
      close: () => { closeCalled = true; listeners.close?.() }
    }

    const started = Date.now()
    await c.disconnect()

    expect(closeCalled).toBe(true)
    // CLOSE_GRACE_MS(1.5s) 를 그대로 기다렸으면 실패한다.
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(inner.ws).toBeNull()
  })

  it('close 이벤트를 안 주는 소켓이어도 disconnect 가 걸려 있지 않는다', async () => {
    const c = new SocketModeClient({ botToken: 't', domain: 'd' })
    const inner = c as unknown as Internals
    // once/close 가 조용한 소켓 — 유예 타이머로만 풀려야 한다.
    inner.ws = { once: () => {}, close: () => {} }

    const done = c.disconnect()
    // 아직 유예 중이지만, 두 번째 disconnect 가 오면 그 대기도 깨워야 한다.
    await c.disconnect()
    await done

    expect(inner.ws).toBeNull()
    expect(inner.pendingWaits.size).toBe(0)
  })

  it('disconnect 후에는 state 가 DISCONNECTED 로 남는다', async () => {
    const c = new SocketModeClient({ botToken: 't', domain: 'd' })
    await c.disconnect()
    expect(c.getState()).toBe('DISCONNECTED')
  })
})

/**
 * "연결 중…" 에서 못 빠져나오던 경로들의 회귀 게이트.
 *
 * 재연결 루프는 소켓의 close 를 기다려 다음 시도로 넘어간다. close 가 오지 않는 상태에 빠지면
 * 루프가 그 자리에 매달린 채 상태만 CONNECTING 으로 남는다 — 사용자가 겪은 증상.
 */
describe('SocketModeClient — CONNECTING 에서 안 빠져나오던 경로', () => {
  type Internals = {
    failCurrentAttempt: (ws: unknown, code: number, reason: string) => void
    startSessionInfoTimeout: (ws: unknown) => void
    handleRawMessage: (text: string) => void
    lastCloseCode: number | null
    lastCloseReason: string | null
    reconnectAttempt: number
    lastInboundAt: number
    state: string
    ws: unknown
    sessionInfoTimer: NodeJS.Timeout | null
  }

  /** ws 처럼 terminate/emit 을 갖춘 최소 대역. emit 된 close 를 기록한다. */
  function fakeSocket(): { terminated: boolean; emitted: Array<[number, string]>; terminate: () => void; emit: (ev: string, code: number, buf: Buffer) => void } {
    const sock = {
      terminated: false,
      emitted: [] as Array<[number, string]>,
      terminate: (): void => { sock.terminated = true },
      emit: (ev: string, code: number, buf: Buffer): void => {
        if (ev === 'close') sock.emitted.push([code, buf.toString()])
      }
    }
    return sock
  }

  function makeClient(): SocketModeClient & { __i: Internals } {
    const c = new SocketModeClient({ botToken: 't', domain: 'd' })
    ;(c as unknown as { __i: Internals }).__i = c as unknown as Internals
    return c as SocketModeClient & { __i: Internals }
  }

  it('실패 처리는 소켓을 끊고 close 를 직접 발화해 루프를 깨운다', () => {
    const c = makeClient()
    const sock = fakeSocket()

    c.__i.failCurrentAttempt(sock, 4002, 'session_info_timeout')

    expect(sock.terminated).toBe(true)
    // close 가 안 오는 소켓이어도 awaitClose 가 매달리지 않아야 한다.
    expect(sock.emitted).toEqual([[4002, 'session_info_timeout']])
    expect(c.__i.lastCloseCode).toBe(4002)
    expect(c.__i.lastCloseReason).toBe('session_info_timeout')
  })

  it('소켓이 없으면 실패 처리는 조용히 지나간다', () => {
    const c = makeClient()
    expect(() => c.__i.failCurrentAttempt(null, 4000, 'x')).not.toThrow()
  })

  it('open 후 sessionInfo 가 안 오면 상한에서 끊는다', () => {
    vi.useFakeTimers()
    try {
      const c = makeClient()
      const sock = fakeSocket()

      c.__i.startSessionInfoTimeout(sock)
      expect(sock.terminated).toBe(false)

      vi.advanceTimersByTime(SESSION_INFO_TIMEOUT_MS + 10)

      expect(sock.terminated).toBe(true)
      expect(sock.emitted[0][1]).toBe('session_info_timeout')
    } finally {
      vi.useRealTimers()
    }
  })

  it('sessionInfo 가 제때 오면 상한 타이머는 끊지 않는다', () => {
    vi.useFakeTimers()
    try {
      const c = makeClient()
      const sock = fakeSocket()
      c.__i.startSessionInfoTimeout(sock)

      c.__i.handleRawMessage(JSON.stringify({ type: 'sessionInfo' }))
      vi.advanceTimersByTime(SESSION_INFO_TIMEOUT_MS + 10)

      expect(c.getState()).toBe('ACTIVE')
      expect(sock.terminated).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ACTIVE 가 되면 백오프가 0 으로 리셋된다 — 없으면 간격이 상한에 눌러앉는다', () => {
    const c = makeClient()
    c.__i.reconnectAttempt = 7

    c.__i.handleRawMessage(JSON.stringify({ type: 'sessionInfo' }))

    expect(c.__i.reconnectAttempt).toBe(0)
  })

  it('토큰 발급이 응답하지 않으면 상한에서 실패로 끝난다 (영영 대기 금지)', async () => {
    vi.useFakeTimers()
    try {
      // 응답도 에러도 주지 않는 요청 — 상한이 없으면 이 Promise 는 영영 안 끝난다.
      vi.mocked(net.request).mockReturnValue({
        setHeader: () => {},
        on: () => {},
        write: () => {},
        end: () => {},
        abort: () => {}
      } as never)

      const c = makeClient()
      const pending = (c as unknown as { fetchSocketModeToken: () => Promise<void> })
        .fetchSocketModeToken()
      const assertion = expect(pending).rejects.toThrow(/시간 초과/)

      await vi.advanceTimersByTimeAsync(TOKEN_FETCH_TIMEOUT_MS + 10)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('disconnect 는 진행 중인 토큰 요청도 끊는다', async () => {
    let aborted = false
    vi.mocked(net.request).mockReturnValue({
      setHeader: () => {},
      on: () => {},
      write: () => {},
      end: () => {},
      abort: () => { aborted = true }
    } as never)

    const c = makeClient()
    const pending = (c as unknown as { fetchSocketModeToken: () => Promise<void> })
      .fetchSocketModeToken()
    const assertion = expect(pending).rejects.toThrow(/취소/)

    await c.disconnect()
    await assertion

    expect(aborted).toBe(true)
  })
})

describe('reconnectDelayMs — 자동 재연결 백오프', () => {
  it('시도할수록 늘어난다', () => {
    // 지터를 0 으로 고정해 순수 지수만 본다
    const noJitter = (): number => 0.5
    expect(reconnectDelayMs(1, noJitter)).toBe(1000)
    expect(reconnectDelayMs(2, noJitter)).toBe(2000)
    expect(reconnectDelayMs(3, noJitter)).toBe(4000)
    expect(reconnectDelayMs(6, noJitter)).toBe(30000)
  })

  it('상한을 넘지 않는다 — 서버가 오래 죽어도 30초 간격으로만 두드린다', () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      expect(reconnectDelayMs(attempt, () => 1)).toBeLessThanOrEqual(36000)
    }
  })

  it('지터가 섞여도 최소 간격 아래로 내려가지 않는다', () => {
    expect(reconnectDelayMs(1, () => 0)).toBeGreaterThanOrEqual(1000)
    expect(reconnectDelayMs(5, () => 0)).toBeGreaterThan(1000)
  })

  it('같은 시도라도 지터로 값이 갈린다 — 여러 클라이언트가 동시에 몰리지 않게', () => {
    expect(reconnectDelayMs(4, () => 0)).not.toBe(reconnectDelayMs(4, () => 1))
  })
})
