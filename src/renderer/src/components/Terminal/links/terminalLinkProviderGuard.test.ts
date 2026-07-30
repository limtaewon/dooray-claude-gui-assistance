import { describe, it, expect, vi } from 'vitest'
import type { ILinkProvider, Terminal } from '@xterm/xterm'
import { guardLinkProvider, installLinkProviderGuard } from './terminalLinkProviderGuard'

function fakeTerminal(): { registerLinkProvider: ReturnType<typeof vi.fn> } {
  return { registerLinkProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }) }
}

describe('guardLinkProvider', () => {
  it('provideLinks 가 동기 throw 해도 예외를 전파하지 않고 콜백에 undefined 를 전달한다', () => {
    const throwingProvider: ILinkProvider = {
      provideLinks: () => { throw new Error('boom') }
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const guarded = guardLinkProvider(throwingProvider, 'test-provider')
    const callback = vi.fn()

    expect(() => guarded.provideLinks(1, callback)).not.toThrow()
    expect(callback).toHaveBeenCalledWith(undefined)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('콜백을 이미 호출한 뒤에 throw 하면 다시 호출하지 않는다', () => {
    const provider: ILinkProvider = {
      provideLinks: (_line, cb) => {
        cb([])
        throw new Error('late throw')
      }
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const guarded = guardLinkProvider(provider, 'test-provider')
    const callback = vi.fn()
    guarded.provideLinks(1, callback)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith([])
    warnSpy.mockRestore()
  })

  it('정상 동작하는 provider 는 그대로 통과시킨다', () => {
    const provider: ILinkProvider = { provideLinks: (_line, cb) => cb([]) }
    const guarded = guardLinkProvider(provider, 'p')
    const callback = vi.fn()
    guarded.provideLinks(1, callback)
    expect(callback).toHaveBeenCalledWith([])
  })
})

describe('installLinkProviderGuard', () => {
  it('이후 등록되는 모든 provider 를 감싼다 — throw 해도 registerLinkProvider 호출 자체는 정상 반환', () => {
    const terminal = fakeTerminal()
    // installLinkProviderGuard 가 terminal.registerLinkProvider 자체를 새 래퍼로 갈아치우므로,
    // "실제로 무엇이 등록됐는지"는 원본(mock) 호출 기록으로 확인해야 한다.
    const originalRegisterLinkProvider = terminal.registerLinkProvider
    installLinkProviderGuard(terminal as unknown as Terminal)
    expect(terminal.registerLinkProvider).not.toBe(originalRegisterLinkProvider)

    const throwingProvider: ILinkProvider = { provideLinks: () => { throw new Error('boom') } }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    terminal.registerLinkProvider(throwingProvider)

    // 원본 registerLinkProvider(mock)에 실제로 전달된 provider 는 guarded 버전이어야 한다.
    const registeredProvider = originalRegisterLinkProvider.mock.calls[0][0] as ILinkProvider
    const callback = vi.fn()
    expect(() => registeredProvider.provideLinks(1, callback)).not.toThrow()
    expect(callback).toHaveBeenCalledWith(undefined)
    warnSpy.mockRestore()
  })

  it('registerLinkProvider 가 없는 stub 에도 안전하게 동작한다', () => {
    const terminal = {} as Terminal
    expect(() => installLinkProviderGuard(terminal)).not.toThrow()
  })
})
