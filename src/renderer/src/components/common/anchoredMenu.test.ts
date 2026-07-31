import { describe, it, expect } from 'vitest'
import { anchoredMenuPosition } from './anchoredMenu'

const viewport = { width: 1200, height: 800 }

function anchor(patch: Partial<{ left: number; right: number; top: number; bottom: number }> = {}) {
  return { left: 900, right: 940, top: 100, bottom: 124, ...patch }
}

describe('anchoredMenuPosition — 가로', () => {
  it('기본은 앵커 오른쪽 끝에 맞춘다', () => {
    const pos = anchoredMenuPosition(anchor(), { width: 288 }, viewport)
    expect(pos.left).toBe(940 - 288)
  })

  it('align start 면 앵커 왼쪽에 맞춘다', () => {
    const pos = anchoredMenuPosition(anchor(), { width: 288 }, viewport, { align: 'start' })
    expect(pos.left).toBe(900)
  })

  it('화면 왼쪽으로 넘치면 안쪽으로 당긴다', () => {
    const pos = anchoredMenuPosition(anchor({ left: 4, right: 30 }), { width: 288 }, viewport)
    expect(pos.left).toBe(8)
  })

  it('화면 오른쪽으로 넘치면 안쪽으로 당긴다', () => {
    const pos = anchoredMenuPosition(anchor({ left: 1180, right: 1196 }), { width: 288 }, viewport, {
      align: 'start'
    })
    expect(pos.left).toBe(1200 - 288 - 8)
  })

  it('창이 메뉴보다 좁으면 폭 자체를 줄인다 — 좁은 패널에서 잘리던 문제', () => {
    const pos = anchoredMenuPosition(anchor(), { width: 288 }, { width: 240, height: 800 })
    expect(pos.width).toBe(240 - 16)
    expect(pos.left).toBe(8)
  })

  it('아주 좁아도 최소 폭 아래로는 안 줄인다', () => {
    const pos = anchoredMenuPosition(anchor(), { width: 288 }, { width: 100, height: 800 })
    expect(pos.width).toBe(160)
  })
})

describe('anchoredMenuPosition — 세로', () => {
  it('기본은 앵커 아래', () => {
    const pos = anchoredMenuPosition(anchor(), { width: 200, height: 300 }, viewport)
    expect(pos.flipped).toBe(false)
    expect(pos.top).toBe(124 + 4)
  })

  it('아래가 모자라고 위가 더 넓으면 뒤집는다', () => {
    const pos = anchoredMenuPosition(
      anchor({ top: 700, bottom: 740 }),
      { width: 200, height: 300 },
      viewport
    )
    expect(pos.flipped).toBe(true)
    expect(pos.top).toBeLessThan(700)
  })

  it('아래가 좁아도 위가 더 좁으면 뒤집지 않는다 — 뒤집으면 버튼이 가려진다', () => {
    const pos = anchoredMenuPosition(
      anchor({ top: 40, bottom: 70 }),
      { width: 200, height: 900 },
      { width: 1200, height: 200 }
    )
    expect(pos.flipped).toBe(false)
  })

  it('남은 공간을 maxHeight 로 준다 — 넘치면 메뉴가 스스로 스크롤한다', () => {
    const pos = anchoredMenuPosition(anchor(), { width: 200 }, viewport)
    expect(pos.maxHeight).toBe(800 - 124 - 4 - 8)
  })

  it('maxHeight 는 최소 높이 아래로 내려가지 않는다', () => {
    const pos = anchoredMenuPosition(
      anchor({ top: 180, bottom: 195 }),
      { width: 200 },
      { width: 1200, height: 200 }
    )
    expect(pos.maxHeight).toBeGreaterThanOrEqual(120)
  })
})
