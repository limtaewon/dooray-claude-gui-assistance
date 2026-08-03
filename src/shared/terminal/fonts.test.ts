import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TERMINAL_FONT,
  TERMINAL_FONT_FAMILIES,
  resolveTerminalFont,
  terminalFontFamily
} from './fonts'

describe('terminalFontFamily', () => {
  it('CJK 폴백을 항상 뒤에 붙인다 — 한글 글리프가 없으면 셀 폭이 어긋난다', () => {
    for (const family of TERMINAL_FONT_FAMILIES) {
      expect(terminalFontFamily(family.id)).toContain('Apple SD Gothic Neo')
      expect(terminalFontFamily(family.id)).toContain('monospace')
    }
  })

  it('모르는 id 는 첫 글꼴로 떨어진다', () => {
    expect(terminalFontFamily('없는폰트')).toContain(TERMINAL_FONT_FAMILIES[0].stack)
  })
})

describe('resolveTerminalFont', () => {
  it('빈 값이면 기본값', () => {
    expect(resolveTerminalFont(undefined)).toEqual(DEFAULT_TERMINAL_FONT)
    expect(resolveTerminalFont({})).toEqual(DEFAULT_TERMINAL_FONT)
  })

  it('범위를 벗어난 크기는 잘라낸다 — 잘못된 값으로 터미널이 깨지면 안 된다', () => {
    expect(resolveTerminalFont({ size: 999 }).size).toBe(24)
    expect(resolveTerminalFont({ size: 1 }).size).toBe(9)
    expect(resolveTerminalFont({ size: Number.NaN }).size).toBe(DEFAULT_TERMINAL_FONT.size)
  })

  it('줄 간격도 범위를 지킨다', () => {
    expect(resolveTerminalFont({ lineHeight: 9 }).lineHeight).toBe(2)
    expect(resolveTerminalFont({ lineHeight: 0.1 }).lineHeight).toBe(1)
  })

  it('굵기는 400/500/600 만 받는다', () => {
    expect(resolveTerminalFont({ weight: 500 as never }).weight).toBe(500)
    expect(resolveTerminalFont({ weight: 900 as never }).weight).toBe(400)
  })

  it('모르는 글꼴 id 는 기본 글꼴로', () => {
    expect(resolveTerminalFont({ familyId: '없음' }).familyId).toBe(DEFAULT_TERMINAL_FONT.familyId)
  })
})
