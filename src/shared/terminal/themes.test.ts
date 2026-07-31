import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TERMINAL_THEME_ID,
  TERMINAL_THEMES,
  resolveTerminalTheme
} from './themes'

describe('TERMINAL_THEMES', () => {
  it('id 가 겹치지 않는다', () => {
    const ids = TERMINAL_THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('기본 테마가 목록에 있다', () => {
    expect(TERMINAL_THEMES.some((t) => t.id === DEFAULT_TERMINAL_THEME_ID)).toBe(true)
  })

  it('모든 테마가 16색 + 배경·전경·커서를 갖춘다 — 하나라도 비면 그 자리가 검게 뚫린다', () => {
    const required = [
      'background', 'foreground', 'cursor', 'cursorAccent', 'selectionBackground',
      'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
      'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
      'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
    ] as const

    for (const theme of TERMINAL_THEMES) {
      for (const key of required) {
        expect(theme.colors[key], `${theme.id}.${key}`).toMatch(/^#[0-9A-Fa-f]{6,8}$/)
      }
    }
  })

  it('밝은 테마도 하나 이상 있다', () => {
    expect(TERMINAL_THEMES.some((t) => t.light)).toBe(true)
  })
})

describe('resolveTerminalTheme', () => {
  it('id 로 찾는다', () => {
    expect(resolveTerminalTheme('dracula').label).toBe('Dracula')
  })

  it('모르는 값이면 기본값 — 터미널이 검은 화면이 되면 안 된다', () => {
    expect(resolveTerminalTheme('없는테마').id).toBe(DEFAULT_TERMINAL_THEME_ID)
    expect(resolveTerminalTheme(null).id).toBe(DEFAULT_TERMINAL_THEME_ID)
    expect(resolveTerminalTheme(undefined).id).toBe(DEFAULT_TERMINAL_THEME_ID)
  })
})
