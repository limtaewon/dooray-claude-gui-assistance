import { describe, it, expect } from 'vitest'
import { currentChangeIndex, formatChangePosition, type DiffChangeLike } from './diffNavigation'

function change(over: Partial<DiffChangeLike>): DiffChangeLike {
  return { modifiedStartLineNumber: 1, modifiedEndLineNumber: 1, originalStartLineNumber: 1, ...over }
}

describe('currentChangeIndex', () => {
  const changes = [
    change({ modifiedStartLineNumber: 13, modifiedEndLineNumber: 13 }),
    change({ modifiedStartLineNumber: 40, modifiedEndLineNumber: 42 }),
    change({ modifiedStartLineNumber: 90, modifiedEndLineNumber: 90 })
  ]

  it('첫 변경 앞이면 0 — 아직 아무 변경에도 못 갔다', () => {
    expect(currentChangeIndex(changes, 1)).toBe(0)
    expect(currentChangeIndex(changes, 12)).toBe(0)
  })

  it('변경 줄에 있으면 그 번호', () => {
    expect(currentChangeIndex(changes, 13)).toBe(1)
    expect(currentChangeIndex(changes, 41)).toBe(2)
    expect(currentChangeIndex(changes, 999)).toBe(3)
  })

  it('삭제만 있는 변경은 표시 줄 다음부터가 그 변경이다', () => {
    // modifiedEndLineNumber === 0 이면 "이 줄 뒤에서 지워졌다" 는 뜻
    const deletion = [change({ modifiedStartLineNumber: 20, modifiedEndLineNumber: 0 })]
    expect(currentChangeIndex(deletion, 20)).toBe(0)
    expect(currentChangeIndex(deletion, 21)).toBe(1)
  })

  it('변경이 없으면 0', () => {
    expect(currentChangeIndex([], 5)).toBe(0)
  })
})

describe('formatChangePosition', () => {
  it('몇 번째인지 보여준다', () => {
    expect(formatChangePosition(2, 12)).toBe('2/12')
  })

  it('첫 변경 앞이어도 1 부터 센다 — 0/12 는 읽는 사람을 헷갈리게 한다', () => {
    expect(formatChangePosition(0, 12)).toBe('1/12')
  })

  it('범위를 넘지 않는다', () => {
    expect(formatChangePosition(99, 3)).toBe('3/3')
  })

  it('변경이 없으면 표시하지 않는다', () => {
    expect(formatChangePosition(0, 0)).toBeNull()
  })
})
