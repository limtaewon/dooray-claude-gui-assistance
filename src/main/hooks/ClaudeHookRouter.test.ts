import { describe, it, expect, vi } from 'vitest'
import { ClaudeHookRouter, type HookRoute } from './ClaudeHookRouter'
import type { HookEventPayload } from '../dooray/mention/HookServer'

function makeEvent(cwd = '/x'): HookEventPayload {
  return { event: 'stop', cwd, raw: {} }
}

describe('ClaudeHookRouter', () => {
  it('resolver 등록 순서대로 first-match — 두번째가 매치되면 세번째는 호출되지 않는다', async () => {
    const router = new ClaudeHookRouter()
    const r1 = vi.fn(() => null)
    const r2 = vi.fn((): HookRoute => ({ kind: 'a', id: '1' }))
    const r3 = vi.fn(() => null)
    router.addResolver(r1)
    router.addResolver(r2)
    router.addResolver(r3)
    const handler = vi.fn()
    router.setHandler('a', handler)

    await router.dispatch(makeEvent())

    expect(r1).toHaveBeenCalled()
    expect(r2).toHaveBeenCalled()
    expect(r3).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('모든 resolver 가 null 이면 핸들러 미호출, 예외 없음, console.warn 미호출', async () => {
    const router = new ClaudeHookRouter()
    router.addResolver(() => null)
    router.addResolver(() => null)
    const handler = vi.fn()
    router.setHandler('a', handler)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(router.dispatch(makeEvent())).resolves.toBeUndefined()

    expect(handler).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('미등록 kind 는 console.warn 1회, 예외 없음', async () => {
    const router = new ClaudeHookRouter()
    router.addResolver(() => ({ kind: 'unknown', id: '1' }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(router.dispatch(makeEvent())).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('핸들러 미등록')
    warnSpy.mockRestore()
  })

  it('핸들러가 reject 하면 dispatch 도 reject (전파)', async () => {
    const router = new ClaudeHookRouter()
    router.addResolver(() => ({ kind: 'a', id: '1' }))
    router.setHandler('a', async () => {
      throw new Error('boom')
    })

    await expect(router.dispatch(makeEvent())).rejects.toThrow('boom')
  })

  it('핸들러의 Promise 를 await 한다 (완료 전에 dispatch 가 끝나지 않음)', async () => {
    const router = new ClaudeHookRouter()
    router.addResolver(() => ({ kind: 'a', id: '1' }))
    let resolved = false
    router.setHandler('a', async () => {
      await new Promise((r) => setTimeout(r, 10))
      resolved = true
    })

    await router.dispatch(makeEvent())

    expect(resolved).toBe(true)
  })

  it('resolver 가 throw 하면 warn 후 다음 resolver 결과로 라우팅', async () => {
    const router = new ClaudeHookRouter()
    router.addResolver(() => {
      throw new Error('resolver boom')
    })
    router.addResolver(() => ({ kind: 'a', id: '1' }))
    const handler = vi.fn()
    router.setHandler('a', handler)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await router.dispatch(makeEvent())

    expect(warnSpy).toHaveBeenCalled()
    expect(handler).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('같은 kind 로 setHandler 를 2회 호출하면 마지막 것으로 덮어쓴다', async () => {
    const router = new ClaudeHookRouter()
    router.addResolver(() => ({ kind: 'a', id: '1' }))
    const first = vi.fn()
    const second = vi.fn()
    router.setHandler('a', first)
    router.setHandler('a', second)

    await router.dispatch(makeEvent())

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('ClaudeHookRouter.decide', () => {
  const permEvent = (cwd = '/x'): HookEventPayload => ({ event: 'permission_request', cwd, raw: {} })

  it('resolver 가 매치한 kind 의 decider 를 (ev, route, signal) 로 호출하고 결과를 돌려준다', async () => {
    const router = new ClaudeHookRouter()
    const route: HookRoute = { kind: 'a', id: '1' }
    router.addResolver(() => route)
    const result = { hookSpecificOutput: { ok: true } }
    const decider = vi.fn(async () => result)
    router.setDecider('a', decider)
    const ev = permEvent()
    const signal = new AbortController().signal
    await expect(router.decide(ev, signal)).resolves.toBe(result)
    expect(decider).toHaveBeenCalledWith(ev, route, signal)
  })

  it('다른 kind 의 decider 는 호출하지 않는다', async () => {
    const router = new ClaudeHookRouter()
    router.addResolver(() => ({ kind: 'a', id: '1' }))
    const other = vi.fn(async () => ({}))
    router.setDecider('b', other)
    await expect(router.decide(permEvent(), new AbortController().signal)).resolves.toBeNull()
    expect(other).not.toHaveBeenCalled()
  })

  it('route 가 없으면 null (decider 호출 없음)', async () => {
    const router = new ClaudeHookRouter()
    router.addResolver(() => null)
    const decider = vi.fn(async () => ({}))
    router.setDecider('a', decider)
    await expect(router.decide(permEvent(), new AbortController().signal)).resolves.toBeNull()
    expect(decider).not.toHaveBeenCalled()
  })

  it('resolver 가 없어도 null', async () => {
    await expect(new ClaudeHookRouter().decide(permEvent(), new AbortController().signal)).resolves.toBeNull()
  })

  it('decider 가 없으면 null', async () => {
    const router = new ClaudeHookRouter()
    router.addResolver(() => ({ kind: 'a', id: '1' }))
    await expect(router.decide(permEvent(), new AbortController().signal)).resolves.toBeNull()
  })

  it('decider 가 null 을 주면 그대로 null', async () => {
    const router = new ClaudeHookRouter()
    router.addResolver(() => ({ kind: 'a', id: '1' }))
    router.setDecider('a', async () => null)
    await expect(router.decide(permEvent(), new AbortController().signal)).resolves.toBeNull()
  })

  it('resolver 예외는 무시하고 다음 resolver 로', async () => {
    const router = new ClaudeHookRouter()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    router.addResolver(() => { throw new Error('boom') })
    router.addResolver(() => ({ kind: 'a', id: '1' }))
    router.setDecider('a', async () => ({ ok: 1 }))
    await expect(router.decide(permEvent(), new AbortController().signal)).resolves.toEqual({ ok: 1 })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('first-match — 앞 resolver 가 매치하면 뒤 resolver 는 호출되지 않는다', async () => {
    const router = new ClaudeHookRouter()
    const second = vi.fn(() => ({ kind: 'b', id: '2' }))
    router.addResolver(() => ({ kind: 'a', id: '1' }))
    router.addResolver(second)
    router.setDecider('a', async () => ({}))
    await router.decide(permEvent(), new AbortController().signal)
    expect(second).not.toHaveBeenCalled()
  })

  it('decider 의 예외는 호출자에게 전파된다 (HookServer 가 {} 로 마감)', async () => {
    const router = new ClaudeHookRouter()
    router.addResolver(() => ({ kind: 'a', id: '1' }))
    router.setDecider('a', async () => { throw new Error('x') })
    await expect(router.decide(permEvent(), new AbortController().signal)).rejects.toThrow('x')
  })
})
