import { describe, it, expect } from 'vitest'
import {
  bindingFromEvent,
  canonicalBinding,
  formatBinding,
  formatBindingChips,
  matchesBinding,
  parseBinding
} from './binding'

const ev = (over: Partial<Parameters<typeof bindingFromEvent>[0]> = {}) => ({
  key: 'd',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...over
})

describe('parseBinding', () => {
  it('모디파이어와 키를 분해한다', () => {
    expect(parseBinding('Mod+Shift+D')).toEqual({ mod: true, ctrl: false, alt: false, shift: true, key: 'D' })
  })

  it('Electron 표기와 mac 글리프를 모두 받는다', () => {
    expect(canonicalBinding('CmdOrCtrl+K')).toBe('Mod+K')
    expect(canonicalBinding('⌘⇧D'.split('').join('+'))).toBe('Mod+Shift+D')
  })

  it('키 별칭을 표준명으로 정규화한다', () => {
    expect(parseBinding('Mod+/')?.key).toBe('Slash')
    expect(parseBinding('Mod+Up')?.key).toBe('ArrowUp')
    expect(parseBinding('Esc')?.key).toBe('Escape')
  })

  it('키가 없거나 두 개면 null', () => {
    expect(parseBinding('Mod+Shift')).toBeNull()
    expect(parseBinding('Mod+A+B')).toBeNull()
    expect(parseBinding('')).toBeNull()
  })

  it('모디파이어 순서가 달라도 같은 정규형이 된다', () => {
    expect(canonicalBinding('Shift+Mod+D')).toBe(canonicalBinding('Mod+Shift+D'))
  })
})

describe('formatBinding', () => {
  it('mac 은 글리프를 구분자 없이 붙인다', () => {
    expect(formatBinding('Mod+Shift+D', 'darwin')).toBe('⌘⇧D')
    expect(formatBinding('Mod+Alt+ArrowLeft', 'darwin')).toBe('⌘⌥←')
  })

  it('그 외 플랫폼은 단어를 + 로 잇는다', () => {
    expect(formatBinding('Mod+Shift+D', 'other')).toBe('Ctrl+Shift+D')
  })

  it('칩 배열로도 얻을 수 있다', () => {
    expect(formatBindingChips('Mod+K', 'darwin')).toEqual(['⌘', 'K'])
  })
})

describe('bindingFromEvent', () => {
  it('mac 의 ⌘ 는 Mod 로 정규화된다 — 다른 플랫폼으로 이식 가능', () => {
    expect(bindingFromEvent(ev({ metaKey: true }), 'darwin')).toBe('Mod+D')
  })

  it('win 의 Ctrl 도 같은 Mod 로 정규화된다', () => {
    expect(bindingFromEvent(ev({ ctrlKey: true }), 'other')).toBe('Mod+D')
  })

  it('mac 의 물리 Control 은 Ctrl 로 구분된다', () => {
    expect(bindingFromEvent(ev({ metaKey: true, ctrlKey: true }), 'darwin')).toBe('Mod+Ctrl+D')
  })

  it('모디파이어 단독은 캡처하지 않는다', () => {
    expect(bindingFromEvent(ev({ key: 'Shift', shiftKey: true }), 'darwin')).toBeNull()
  })

  it('한글 레이아웃에서도 물리 키를 잡는다 (e.code 폴백)', () => {
    expect(bindingFromEvent(ev({ key: 'ㅇ', code: 'KeyD', metaKey: true }), 'darwin')).toBe('Mod+D')
  })
})

describe('matchesBinding', () => {
  it('일치/불일치를 판정한다', () => {
    expect(matchesBinding(ev({ metaKey: true }), 'Mod+D', 'darwin')).toBe(true)
    expect(matchesBinding(ev({ metaKey: true, shiftKey: true }), 'Mod+D', 'darwin')).toBe(false)
    expect(matchesBinding(ev({ ctrlKey: true }), 'Mod+D', 'darwin')).toBe(false)
  })
})
