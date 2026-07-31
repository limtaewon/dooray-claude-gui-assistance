import { describe, it, expect } from 'vitest'
import { moveTab, pickNextActiveTab, pushMru } from './tabOrder'

describe('moveTab', () => {
  it('activeId 를 overId 위치로 옮긴다', () => {
    expect(moveTab(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a'])
  })

  it('뒤에서 앞으로도 옮길 수 있다', () => {
    expect(moveTab(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
  })

  it('동일 id 면 원본을 그대로 반환한다', () => {
    const ids = ['a', 'b', 'c']
    expect(moveTab(ids, 'a', 'a')).toBe(ids)
  })

  it('모르는 activeId 면 원본을 그대로 반환한다', () => {
    const ids = ['a', 'b', 'c']
    expect(moveTab(ids, 'z', 'a')).toBe(ids)
  })

  it('모르는 overId 면 원본을 그대로 반환한다', () => {
    const ids = ['a', 'b', 'c']
    expect(moveTab(ids, 'a', 'z')).toBe(ids)
  })
})

describe('pushMru', () => {
  it('새 id 를 맨 앞으로 승격한다', () => {
    expect(pushMru(['b', 'c'], 'a')).toEqual(['a', 'b', 'c'])
  })

  it('이미 있는 id 는 중복 없이 맨 앞으로 옮긴다', () => {
    expect(pushMru(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
  })

  it('cap 을 넘으면 오래된 항목부터 버린다', () => {
    const mru = ['a', 'b', 'c']
    expect(pushMru(mru, 'd', 3)).toEqual(['d', 'a', 'b'])
  })
})

describe('pickNextActiveTab', () => {
  it('MRU 스택에 남아있는 항목을 우선 선택한다', () => {
    const order = ['a', 'b', 'c']
    const mru = ['c', 'a', 'b'] // b 를 닫는 상황 — mru 순서상 c 가 다음
    expect(pickNextActiveTab(order, 'b', mru)).toBe('c')
  })

  it('MRU 에 후보가 없으면 오른쪽 이웃을 선택한다', () => {
    const order = ['a', 'b', 'c']
    expect(pickNextActiveTab(order, 'b', [])).toBe('c')
  })

  it('오른쪽 이웃이 없으면 왼쪽 이웃을 선택한다', () => {
    const order = ['a', 'b', 'c']
    expect(pickNextActiveTab(order, 'c', [])).toBe('b')
  })

  it('남은 탭이 없으면 null 을 반환한다', () => {
    expect(pickNextActiveTab(['a'], 'a', [])).toBeNull()
  })

  it('MRU 후보가 이미 닫힌 탭이면 건너뛰고 다음 후보를 본다', () => {
    const order = ['a', 'b', 'c']
    // mru 맨 앞이 closedId 자신인 경우 무시하고 다음 후보 사용
    expect(pickNextActiveTab(order, 'b', ['b', 'a'])).toBe('a')
  })
})
