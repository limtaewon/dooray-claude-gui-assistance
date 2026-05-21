import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})

// SocketModeClient 모킹 — 가짜 EventEmitter
type Handler = (...args: unknown[]) => void
const clientInstances: Array<{
  emitState: (s: string) => void
  emitEvent: (ev: unknown) => void
  emitError: (e: Error) => void
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}> = []

vi.mock('./SocketModeClient', () => {
  class FakeClient {
    private handlers: Record<string, Handler[]> = {}
    constructor(_opts: unknown) {
      clientInstances.push({
        emitState: (s) => this.emit('state', s),
        emitEvent: (ev) => this.emit('event', ev),
        emitError: (e) => this.emit('error', e),
        connect: this.connect,
        disconnect: this.disconnect
      })
    }
    on(event: string, cb: Handler): void {
      ;(this.handlers[event] ||= []).push(cb)
    }
    private emit(event: string, ...args: unknown[]): void {
      for (const h of this.handlers[event] || []) h(...args)
    }
    connect = vi.fn(async () => {})
    disconnect = vi.fn(async () => {})
  }
  return { SocketModeClient: FakeClient }
})

import { BotService } from './BotService'

const doorayClient = {
  getToken: vi.fn(async () => 'TOK')
}

let svc: BotService

beforeEach(() => {
  clientInstances.length = 0
  doorayClient.getToken.mockReset().mockResolvedValue('TOK')
  svc = new BotService(doorayClient as never)
})

describe('BotService — 설정', () => {
  it('초기 도메인 빈 문자열', () => {
    expect(svc.getDomain()).toBe('')
  })

  it('setDomain trim', () => {
    svc.setDomain('  nhnent.dooray.com  ')
    expect(svc.getDomain()).toBe('nhnent.dooray.com')
  })

  it('isReady: 도메인 + 토큰 모두 있어야 true', async () => {
    expect(await svc.isReady()).toBe(false)
    svc.setDomain('x.dooray.com')
    expect(await svc.isReady()).toBe(true)
    doorayClient.getToken.mockResolvedValueOnce('' as unknown as string)
    expect(await svc.isReady()).toBe(false)
  })
})

describe('BotService — 라이프사이클', () => {
  it('isReady=false 면 start 가 no-op', async () => {
    await svc.start()
    expect(clientInstances).toHaveLength(0)
  })

  it('start → SocketModeClient 생성 + connect 호출', async () => {
    svc.setDomain('x.dooray.com')
    await svc.start()
    expect(clientInstances).toHaveLength(1)
    expect(clientInstances[0].connect).toHaveBeenCalled()
  })

  it('start 중복 호출은 no-op', async () => {
    svc.setDomain('x.dooray.com')
    await svc.start()
    await svc.start()
    expect(clientInstances).toHaveLength(1)
  })

  it('stop 으로 disconnect + state DISCONNECTED', async () => {
    svc.setDomain('x.dooray.com')
    await svc.start()
    await svc.stop()
    expect(clientInstances[0].disconnect).toHaveBeenCalled()
    expect(svc.getStatus().state).toBe('DISCONNECTED')
  })

  it('restart = stop + start', async () => {
    svc.setDomain('x.dooray.com')
    await svc.start()
    await svc.restart()
    expect(clientInstances.length).toBeGreaterThanOrEqual(2)
  })
})

describe('BotService — 이벤트 라우팅', () => {
  it('event listener 등록 후 type=message 만 통과', async () => {
    svc.setDomain('x.dooray.com')
    await svc.start()
    const listener = vi.fn()
    svc.addEventListener(listener)
    clientInstances[0].emitEvent({ type: 'reaction', channelId: 'c1' })
    clientInstances[0].emitEvent({ type: 'message', channelId: 'c1', text: 'hi' })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].type).toBe('message')
  })

  it('addEventListener 의 unsubscribe', async () => {
    svc.setDomain('x.dooray.com')
    await svc.start()
    const listener = vi.fn()
    const off = svc.addEventListener(listener)
    off()
    clientInstances[0].emitEvent({ type: 'message', channelId: 'c1', text: 'x' })
    expect(listener).not.toHaveBeenCalled()
  })

  it('listener 에러는 다른 listener 진행 막지 않음', async () => {
    svc.setDomain('x.dooray.com')
    await svc.start()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = vi.fn(() => { throw new Error('boom') })
    const good = vi.fn()
    svc.addEventListener(bad)
    svc.addEventListener(good)
    clientInstances[0].emitEvent({ type: 'message', channelId: 'c1', text: 'x' })
    expect(good).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('error 이벤트 → lastError 갱신', async () => {
    svc.setDomain('x.dooray.com')
    await svc.start()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    clientInstances[0].emitError(new Error('socket fail'))
    expect(svc.getStatus().lastError).toBe('socket fail')
    errSpy.mockRestore()
  })

  it('state 이벤트 → getStatus().state 반영', async () => {
    svc.setDomain('x.dooray.com')
    await svc.start()
    clientInstances[0].emitState('CONNECTED')
    expect(svc.getStatus().state).toBe('CONNECTED')
  })
})

describe('BotService.setMainWindow + IPC', () => {
  it('mainWindow 가 살아있으면 state 변경 시 IPC 전송', async () => {
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    svc.setMainWindow(win as never)
    svc.setDomain('x.dooray.com')
    await svc.start()
    clientInstances[0].emitState('CONNECTED')
    expect(send).toHaveBeenCalled()
  })

  it('destroyed 면 전송 skip', async () => {
    const send = vi.fn()
    const win = { isDestroyed: () => true, webContents: { send } }
    svc.setMainWindow(win as never)
    svc.setDomain('x.dooray.com')
    await svc.start()
    clientInstances[0].emitState('CONNECTED')
    expect(send).not.toHaveBeenCalled()
  })

  it('event 전송 시 raw 필드 제거 (페이로드 경량화)', async () => {
    const send = vi.fn()
    const win = { isDestroyed: () => false, webContents: { send } }
    svc.setMainWindow(win as never)
    svc.setDomain('x.dooray.com')
    await svc.start()
    clientInstances[0].emitEvent({ type: 'message', channelId: 'c1', text: 'x', raw: { big: 'payload' } })
    const lastCall = send.mock.calls.find((c) => (c[0] as string).includes('event') || (c[0] as string).includes('EVENT'))
    // raw 가 undefined 인지 확인 — 첫 메시지/이벤트 송신 콜 중 하나
    const eventCall = send.mock.calls.find((c) => typeof c[1] === 'object' && (c[1] as Record<string, unknown>).text === 'x')
    expect(eventCall).toBeTruthy()
    expect((eventCall![1] as Record<string, unknown>).raw).toBeUndefined()
    void lastCall
  })
})

describe('BotService — getStatus', () => {
  it('초기 상태', () => {
    expect(svc.getStatus()).toEqual({ state: 'DISCONNECTED', lastError: null, ready: false })
  })

  it('start 후 ready=true', async () => {
    svc.setDomain('x.dooray.com')
    await svc.start()
    expect(svc.getStatus().ready).toBe(true)
  })
})
