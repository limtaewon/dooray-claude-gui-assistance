import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  MAX_SEARCH_QUERY_LENGTH,
  buildSearchOptions,
  clampSearchQuery,
  formatMatchCount,
  isValidRegexQuery,
  resetSafeFindWarnings,
  safeFind
} from './terminalSearch'

describe('clampSearchQuery', () => {
  it('상한(2048) 이하는 그대로 반환', () => {
    const q = 'a'.repeat(2047)
    expect(clampSearchQuery(q)).toBe(q)
  })

  it('정확히 상한이면 그대로 반환', () => {
    const q = 'a'.repeat(MAX_SEARCH_QUERY_LENGTH)
    expect(clampSearchQuery(q)).toHaveLength(MAX_SEARCH_QUERY_LENGTH)
  })

  it('상한을 넘으면 절단', () => {
    const q = 'a'.repeat(2049)
    expect(clampSearchQuery(q)).toHaveLength(MAX_SEARCH_QUERY_LENGTH)
  })
})

describe('formatMatchCount', () => {
  it('쿼리가 없으면 빈 문자열', () => {
    expect(formatMatchCount({ resultIndex: 0, resultCount: 5 }, '')).toBe('')
  })

  it('결과가 아직 없으면(null) 빈 문자열', () => {
    expect(formatMatchCount(null, 'error')).toBe('')
  })

  it('매치 0건 → 0/0', () => {
    expect(formatMatchCount({ resultIndex: -1, resultCount: 0 }, 'zzz')).toBe('0/0')
  })

  it('활성 매치 없음(resultIndex < 0) → -/N', () => {
    expect(formatMatchCount({ resultIndex: -1, resultCount: 3 }, 'a')).toBe('-/3')
  })

  it('정상 매치 1건 → 1/1', () => {
    expect(formatMatchCount({ resultIndex: 0, resultCount: 1 }, 'a')).toBe('1/1')
  })

  it('999건은 그대로 표기', () => {
    expect(formatMatchCount({ resultIndex: 2, resultCount: 999 }, 'a')).toBe('3/999')
  })

  it('1000건 이상은 >999 로 표기', () => {
    expect(formatMatchCount({ resultIndex: 2, resultCount: 1000 }, 'a')).toBe('3/>999')
  })
})

describe('isValidRegexQuery', () => {
  it('정규식 토글이 꺼져있으면 항상 유효', () => {
    expect(isValidRegexQuery('(', false)).toBe(true)
  })

  it('정규식 토글이 켜져있고 유효한 패턴이면 true', () => {
    expect(isValidRegexQuery('a.*b', true)).toBe(true)
  })

  it('정규식 토글이 켜져있고 잘못된 패턴이면 false', () => {
    expect(isValidRegexQuery('(', true)).toBe(false)
  })
})

describe('buildSearchOptions', () => {
  it('호출마다 새 객체를 반환한다 (이전 객체 변이 금지)', () => {
    const a = buildSearchOptions({ caseSensitive: false, regex: false, wholeWord: false })
    const b = buildSearchOptions({ caseSensitive: false, regex: false, wholeWord: false })
    expect(a).not.toBe(b)
    expect(a.decorations).not.toBe(b.decorations)
  })

  it('토글이 옵션에 반영된다', () => {
    const opts = buildSearchOptions({ caseSensitive: true, regex: true, wholeWord: true })
    expect(opts.caseSensitive).toBe(true)
    expect(opts.regex).toBe(true)
    expect(opts.wholeWord).toBe(true)
  })

  it('decoration 색상이 #RRGGBB 형식이다', () => {
    const opts = buildSearchOptions({ caseSensitive: false, regex: false, wholeWord: false })
    const hex = /^#[0-9A-Fa-f]{6}$/
    expect(opts.decorations?.matchBackground).toMatch(hex)
    expect(opts.decorations?.activeMatchBackground).toMatch(hex)
  })
})

describe('safeFind', () => {
  beforeEach(() => {
    resetSafeFindWarnings()
    vi.restoreAllMocks()
  })

  it('findNext 가 정상 동작하면 ok:true 와 결과를 반환', () => {
    const addon = {
      findNext: vi.fn().mockReturnValue(true),
      findPrevious: vi.fn(),
      clearDecorations: vi.fn()
    }
    const result = safeFind(addon, 'next', 'foo', {}, { sessionId: 's1' })
    expect(result).toEqual({ ok: true, found: true })
    expect(addon.findNext).toHaveBeenCalledWith('foo', {})
  })

  it('findPrevious 가 정상 동작하면 ok:true', () => {
    const addon = {
      findNext: vi.fn(),
      findPrevious: vi.fn().mockReturnValue(false),
      clearDecorations: vi.fn()
    }
    const result = safeFind(addon, 'prev', 'foo', {}, { sessionId: 's1' })
    expect(result).toEqual({ ok: true, found: false })
  })

  it('throw 하는 addon 도 예외를 전파하지 않고 ok:false 반환 + clearDecorations 시도', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const addon = {
      findNext: vi.fn().mockImplementation(() => { throw new Error('boom') }),
      findPrevious: vi.fn(),
      clearDecorations: vi.fn()
    }
    const result = safeFind(addon, 'next', 'foo', {}, { sessionId: 's2' })
    expect(result).toEqual({ ok: false, found: false })
    expect(addon.clearDecorations).toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('같은 세션에서 반복 실패해도 warn 은 1회만', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const addon = {
      findNext: vi.fn().mockImplementation(() => { throw new Error('boom') }),
      findPrevious: vi.fn(),
      clearDecorations: vi.fn()
    }
    safeFind(addon, 'next', 'foo', {}, { sessionId: 's3' })
    safeFind(addon, 'next', 'bar', {}, { sessionId: 's3' })
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('clearDecorations 자체가 throw 해도 예외가 새지 않는다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const addon = {
      findNext: vi.fn().mockImplementation(() => { throw new Error('boom') }),
      findPrevious: vi.fn(),
      clearDecorations: vi.fn().mockImplementation(() => { throw new Error('clear-boom') })
    }
    expect(() => safeFind(addon, 'next', 'foo', {}, { sessionId: 's4' })).not.toThrow()
  })
})
