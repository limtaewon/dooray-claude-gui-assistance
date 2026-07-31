import { describe, it, expect } from 'vitest'
import {
  DRAWER_DEFAULT_WIDTH,
  DRAWER_MAX_WIDTH,
  DRAWER_MIN_WIDTH,
  TERMINAL_MIN_WIDTH,
  clampDrawerWidth,
  resolveStoredDrawerWidth
} from './drawerWidth'

describe('clampDrawerWidth', () => {
  it('범위 안의 값은 그대로 (정수로 반올림)', () => {
    expect(clampDrawerWidth(400.4)).toBe(400)
  })

  it('하한·상한을 넘으면 자른다', () => {
    expect(clampDrawerWidth(10)).toBe(DRAWER_MIN_WIDTH)
    expect(clampDrawerWidth(99999)).toBe(DRAWER_MAX_WIDTH)
  })

  it('창 폭을 주면 터미널 최소 폭을 남긴다 — 패널이 화면을 다 먹지 않게', () => {
    // 창 1000 → 패널 상한은 1000 - 320 = 680
    expect(clampDrawerWidth(900, 1000)).toBe(1000 - TERMINAL_MIN_WIDTH)
  })

  it('창이 아주 좁으면 하한이 우선한다 — 그래야 패널 내용이 읽힌다', () => {
    expect(clampDrawerWidth(500, 400)).toBe(DRAWER_MIN_WIDTH)
  })

  it('NaN 은 기본값으로 떨어진다', () => {
    expect(clampDrawerWidth(Number.NaN)).toBe(DRAWER_DEFAULT_WIDTH)
  })
})

describe('resolveStoredDrawerWidth', () => {
  it('저장된 숫자를 범위로 자른다', () => {
    expect(resolveStoredDrawerWidth(400)).toBe(400)
    expect(resolveStoredDrawerWidth(5)).toBe(DRAWER_MIN_WIDTH)
  })

  it('숫자가 아니면 기본값', () => {
    expect(resolveStoredDrawerWidth(null)).toBe(DRAWER_DEFAULT_WIDTH)
    expect(resolveStoredDrawerWidth('320')).toBe(DRAWER_DEFAULT_WIDTH)
    expect(resolveStoredDrawerWidth(undefined)).toBe(DRAWER_DEFAULT_WIDTH)
  })
})
