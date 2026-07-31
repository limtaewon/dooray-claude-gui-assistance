import { describe, it, expect } from 'vitest'
import { countHistoryFilters, hasHistoryFilter, sameHistoryFilter } from './historyTypes'

describe('hasHistoryFilter / countHistoryFilters', () => {
  it('값이 없으면 필터가 아니다', () => {
    expect(hasHistoryFilter(undefined)).toBe(false)
    expect(hasHistoryFilter({})).toBe(false)
    expect(hasHistoryFilter({ text: '   ' })).toBe(false)
  })

  it('토글만으로는 필터가 되지 않는다 — 검색어가 있어야 의미가 생긴다', () => {
    expect(hasHistoryFilter({ regex: true, caseSensitive: true })).toBe(false)
    expect(countHistoryFilters({ regex: true })).toBe(0)
  })

  it('걸린 조건 수를 센다', () => {
    expect(countHistoryFilters({ text: 'fix', author: 'me' })).toBe(2)
    expect(countHistoryFilters({ text: 'fix', author: '  ' })).toBe(1)
    expect(countHistoryFilters({ path: 'src', since: '어제', branch: 'main' })).toBe(3)
  })
})

describe('sameHistoryFilter — 불필요한 재조회 방지', () => {
  it('내용이 같으면 다른 객체여도 같다고 본다', () => {
    expect(sameHistoryFilter({ text: 'fix' }, { text: 'fix' })).toBe(true)
    expect(sameHistoryFilter({}, {})).toBe(true)
    expect(sameHistoryFilter(undefined, {})).toBe(true)
  })

  it('앞뒤 공백 차이는 같은 조회다', () => {
    expect(sameHistoryFilter({ text: ' fix ' }, { text: 'fix' })).toBe(true)
  })

  it('값이 다르면 다르다', () => {
    expect(sameHistoryFilter({ text: 'fix' }, { text: 'feat' })).toBe(false)
    expect(sameHistoryFilter({ author: 'a' }, {})).toBe(false)
  })

  it('검색어가 없으면 토글을 바꿔도 같은 조회다 — 칩만 눌렀는데 다시 읽지 않게', () => {
    expect(sameHistoryFilter({ regex: false }, { regex: true })).toBe(true)
    expect(sameHistoryFilter({ caseSensitive: false }, { caseSensitive: true })).toBe(true)
    expect(sameHistoryFilter({ path: 'src' }, { path: 'src', regex: true })).toBe(true)
  })

  it('검색어가 있으면 토글 변경이 다른 조회다', () => {
    expect(sameHistoryFilter({ text: 'fix' }, { text: 'fix', regex: true })).toBe(false)
    expect(sameHistoryFilter({ text: 'fix' }, { text: 'fix', caseSensitive: true })).toBe(false)
  })

  it('작성자만 있어도 토글이 영향을 준다 — --author 도 같은 매칭 옵션을 쓴다', () => {
    expect(sameHistoryFilter({ author: 'me' }, { author: 'me', caseSensitive: true })).toBe(false)
  })
})
