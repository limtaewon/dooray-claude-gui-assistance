import { describe, it, expect, vi } from 'vitest'
import type { IUnicodeVersionProvider } from '@xterm/xterm'
import { activateTerminalUnicodeProvider } from './terminalUnicodeProvider'

function makeFakeTerminal(hasBaseProvider = true): {
  unicode: { activeVersion: string; versions: string[]; register: ReturnType<typeof vi.fn> }
  _core?: { unicodeService?: { _providers?: Record<string, IUnicodeVersionProvider> } }
} {
  const baseProvider: IUnicodeVersionProvider = { version: '11', wcwidth: () => 1, charProperties: () => 0 }
  return {
    unicode: {
      activeVersion: '6',
      versions: ['6', '11'],
      register: vi.fn(function (this: { versions: string[] }, provider: { version: string }) {
        this.versions.push(provider.version)
      })
    },
    _core: { unicodeService: { _providers: hasBaseProvider ? { '11': baseProvider } : {} } }
  }
}

describe('activateTerminalUnicodeProvider', () => {
  it('Unicode11 provider 위에 ZWJ 보정 provider 를 등록하고 활성화한다', () => {
    const terminal = makeFakeTerminal(true)
    activateTerminalUnicodeProvider(terminal)
    expect(terminal.unicode.register).toHaveBeenCalledTimes(1)
    expect(terminal.unicode.activeVersion).toBe('clauday-11-zwj')
  })

  it('이미 활성화돼 있으면 다시 register 하지 않는다', () => {
    const terminal = makeFakeTerminal(true)
    activateTerminalUnicodeProvider(terminal)
    activateTerminalUnicodeProvider(terminal)
    expect(terminal.unicode.register).toHaveBeenCalledTimes(1)
  })

  it('Unicode11 provider 가 없으면 "11" 로만 폴백한다(register 안 함)', () => {
    const terminal = makeFakeTerminal(false)
    activateTerminalUnicodeProvider(terminal)
    expect(terminal.unicode.register).not.toHaveBeenCalled()
    expect(terminal.unicode.activeVersion).toBe('11')
  })

  it('ZWJ 이모지 폭 보정 — ZWJ 뒤 이모지는 선행 폭을 그대로 이어받는다', () => {
    const terminal = makeFakeTerminal(true)
    activateTerminalUnicodeProvider(terminal)
    const registered = terminal.unicode.register.mock.calls[0][0] as {
      charProperties: (cp: number, preceding: number) => number
    }
    const WIDE = 2
    const ZWJ = 0x200d
    // preceding 프로퍼티 인코딩: (charKind<<3)|(width<<1)|joinFlag — 첫 이모지(폭2, 이미 조인됨) 상태.
    const precedingWide = (0x1f468 << 3) | (WIDE << 1) | 1
    // ZWJ 코드포인트 자체가 오면 폭을 이어받아 조인 플래그를 세운다.
    const afterZwj = registered.charProperties(ZWJ, precedingWide)
    const width = (afterZwj >> 1) & 3
    expect(width).toBe(WIDE)
    expect(afterZwj & 1).toBe(1) // shouldJoin
  })
})
