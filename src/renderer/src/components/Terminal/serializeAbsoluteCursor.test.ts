import { describe, it, expect, vi } from 'vitest'
import { serializeWithAbsoluteCursor } from './serializeAbsoluteCursor'

function makeTerminal(cursorX: number, cursorY: number): { buffer: { active: { cursorX: number; cursorY: number } } } {
  return { buffer: { active: { cursorX, cursorY } } }
}

function makeAddon(result: string): { serialize: ReturnType<typeof vi.fn> } {
  return { serialize: vi.fn().mockReturnValue(result) }
}

describe('serializeWithAbsoluteCursor', () => {
  it('addon.serialize() 결과 뒤에 절대 CUP(1-based) 접미가 붙는다', () => {
    const terminal = makeTerminal(4, 2) // cursorX=4, cursorY=2 (0-based)
    const addon = makeAddon('hello\r\nworld')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = serializeWithAbsoluteCursor(terminal as any, addon as any)
    expect(out).toBe('hello\r\nworld\x1b[3;5H')
  })

  it('cursorX=0, cursorY=0 이면 1;1 로 환산된다', () => {
    const terminal = makeTerminal(0, 0)
    const addon = makeAddon('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = serializeWithAbsoluteCursor(terminal as any, addon as any)
    expect(out).toBe('\x1b[1;1H')
  })

  it('options 를 addon.serialize() 에 그대로 전달한다', () => {
    const terminal = makeTerminal(0, 0)
    const addon = makeAddon('')
    const opts = { scrollback: 2000, excludeAltBuffer: true }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    serializeWithAbsoluteCursor(terminal as any, addon as any, opts)
    expect(addon.serialize).toHaveBeenCalledWith(opts)
  })
})
