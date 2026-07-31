import { describe, it, expect } from 'vitest'
import { spotlightRect, tourCardPosition } from './tourGeometry'

const VIEWPORT = { width: 1200, height: 800 }
const CARD = { width: 340, height: 168 }

describe('tourCardPosition', () => {
  it('앵커가 없으면 화면 가운데', () => {
    expect(tourCardPosition(null, CARD, VIEWPORT)).toEqual({ left: 430, top: 316, placement: 'center' })
  })

  it('아래 공간이 있으면 아래에 붙인다', () => {
    const pos = tourCardPosition({ left: 500, top: 100, width: 100, height: 40 }, CARD, VIEWPORT)
    expect(pos.placement).toBe('bottom')
    expect(pos.top).toBe(152)
  })

  it('아래가 좁으면 위로 올린다', () => {
    const pos = tourCardPosition({ left: 500, top: 700, width: 100, height: 40 }, CARD, VIEWPORT)
    expect(pos.placement).toBe('top')
    expect(pos.top).toBe(520)
  })

  it('위아래가 다 좁으면 옆으로 뺀다', () => {
    const tall = { left: 0, top: 0, width: 60, height: 800 }
    expect(tourCardPosition(tall, CARD, VIEWPORT).placement).toBe('right')
  })

  it('오른쪽도 좁으면 왼쪽', () => {
    const tall = { left: 1140, top: 0, width: 60, height: 800 }
    expect(tourCardPosition(tall, CARD, VIEWPORT).placement).toBe('left')
  })

  it('어디에도 안 들어가면 가운데 — 카드가 대상을 가리는 것보다 낫다', () => {
    const huge = { left: 0, top: 0, width: 1200, height: 800 }
    expect(tourCardPosition(huge, CARD, VIEWPORT).placement).toBe('center')
  })

  it('화면 밖으로 나가지 않는다', () => {
    const edge = { left: 1180, top: 10, width: 20, height: 20 }
    const pos = tourCardPosition(edge, CARD, VIEWPORT)
    expect(pos.left).toBeGreaterThanOrEqual(12)
    expect(pos.left + CARD.width).toBeLessThanOrEqual(VIEWPORT.width - 12)
  })
})

describe('spotlightRect', () => {
  it('대상보다 조금 넉넉하게 잡는다', () => {
    expect(spotlightRect({ left: 100, top: 100, width: 50, height: 20 }, VIEWPORT)).toEqual({
      left: 94,
      top: 94,
      width: 62,
      height: 32
    })
  })

  it('화면 밖으로 넘치지 않는다', () => {
    const rect = spotlightRect({ left: 0, top: 0, width: 30, height: 30 }, VIEWPORT)
    expect(rect).toMatchObject({ left: 0, top: 0 })
  })

  it('앵커가 없으면 없다', () => {
    expect(spotlightRect(null, VIEWPORT)).toBeNull()
  })
})
