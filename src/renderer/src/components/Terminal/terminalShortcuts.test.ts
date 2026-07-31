/**
 * terminalShortcuts 테이블 판정 회귀 테스트 (v2.0 B-4).
 */
import { describe, it, expect } from 'vitest'
import { resolveShortcut, matchShortcut, TERMINAL_SHORTCUTS } from './terminalShortcuts'
import type { ShortcutKeyState } from './terminalShortcuts'

function key(overrides: Partial<ShortcutKeyState>): ShortcutKeyState {
  return { key: '', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...overrides }
}

describe('terminalShortcuts', () => {
  it('mac: ⌘D → splitRight', () => {
    expect(resolveShortcut(key({ key: 'd', metaKey: true }), true)).toBe('splitRight')
  })
  it('mac: ⌘⇧D → splitDown (⌘D 와 겹치지 않는다)', () => {
    expect(resolveShortcut(key({ key: 'd', metaKey: true, shiftKey: true }), true)).toBe('splitDown')
  })
  it('mac: ⌥⌘← → focusLeft', () => {
    expect(resolveShortcut(key({ key: 'ArrowLeft', metaKey: true, altKey: true }), true)).toBe('focusLeft')
  })
  it('mac: 순수 Ctrl+D(EOF)는 매칭되지 않는다 — PTY 로 그대로 흘러가야 함', () => {
    expect(resolveShortcut(key({ key: 'd', ctrlKey: true }), true)).toBeNull()
  })
  it('mac: ⌘W → closePane', () => {
    expect(resolveShortcut(key({ key: 'w', metaKey: true }), true)).toBe('closePane')
  })
  it('mac: ⌘T → newTab', () => {
    expect(resolveShortcut(key({ key: 't', metaKey: true }), true)).toBe('newTab')
  })

  it('win: Ctrl+Alt+D → splitRight', () => {
    expect(resolveShortcut(key({ key: 'd', ctrlKey: true, altKey: true }), false)).toBe('splitRight')
  })
  it('win: Ctrl+Shift+D → splitDown', () => {
    expect(resolveShortcut(key({ key: 'd', ctrlKey: true, shiftKey: true }), false)).toBe('splitDown')
  })
  it('win: 순수 Ctrl+D 는 분할에 배정되지 않는다(EOF 로 통과)', () => {
    expect(resolveShortcut(key({ key: 'd', ctrlKey: true }), false)).toBeNull()
  })
  it('win: Ctrl+Alt+→ → focusRight', () => {
    expect(resolveShortcut(key({ key: 'ArrowRight', ctrlKey: true, altKey: true }), false)).toBe('focusRight')
  })

  it('무관한 키 입력은 null', () => {
    expect(resolveShortcut(key({ key: 'x' }), true)).toBeNull()
  })

  it('matchShortcut 은 플랫폼에 맞는 판정 함수만 쓴다', () => {
    const splitRight = TERMINAL_SHORTCUTS.find((b) => b.id === 'splitRight')!
    expect(matchShortcut(key({ key: 'd', metaKey: true }), splitRight, true)).toBe(true)
    expect(matchShortcut(key({ key: 'd', metaKey: true }), splitRight, false)).toBe(false)
  })
})
