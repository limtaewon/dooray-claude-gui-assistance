import { describe, it, expect } from 'vitest'
import { applySessionOrder } from './sessionOrder'

describe('applySessionOrder', () => {
  it('정상 재배치', () => {
    expect(applySessionOrder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b'])
  })

  it('모르는 id 는 무시', () => {
    expect(applySessionOrder(['a', 'b'], ['ghost', 'b', 'a'])).toEqual(['b', 'a'])
  })

  it('요청에 없는 id 는 기존 상대 순서로 뒤에 붙는다', () => {
    expect(applySessionOrder(['a', 'b', 'c', 'd'], ['c', 'a'])).toEqual(['c', 'a', 'b', 'd'])
  })

  it('빈 요청은 원래 순서를 그대로 유지 (no-op)', () => {
    expect(applySessionOrder(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c'])
  })

  it('요청에 중복 id 가 있어도 한 번만 반영', () => {
    expect(applySessionOrder(['a', 'b', 'c'], ['b', 'b', 'a'])).toEqual(['b', 'a', 'c'])
  })
})
