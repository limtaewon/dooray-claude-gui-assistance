import { describe, it, expect } from 'vitest'
import { computeTaskHash, normalizeTaskText } from './taskHash'

describe('normalizeTaskText', () => {
  it('앞뒤 공백 제거', () => {
    expect(normalizeTaskText('  hello  ')).toBe('hello')
  })

  it('연속 공백을 단일 스페이스로 치환', () => {
    expect(normalizeTaskText('hello   world')).toBe('hello world')
  })

  it('탭/개행도 단일 스페이스로 치환', () => {
    expect(normalizeTaskText('hello\t\nworld')).toBe('hello world')
  })

  it('정상 텍스트는 변경 없음', () => {
    expect(normalizeTaskText('OAuth 도입')).toBe('OAuth 도입')
  })

  it('빈 문자열은 빈 문자열 반환', () => {
    expect(normalizeTaskText('')).toBe('')
  })

  it('공백만 있는 문자열은 빈 문자열 반환', () => {
    expect(normalizeTaskText('   \t  \n  ')).toBe('')
  })
})

describe('computeTaskHash', () => {
  it('동일 bundleHash + 동일 taskText → 동일 해시', () => {
    const h1 = computeTaskHash('bundle-abc', 'OAuth 도입')
    const h2 = computeTaskHash('bundle-abc', 'OAuth 도입')
    expect(h1).toBe(h2)
  })

  it('다른 bundleHash → 다른 해시', () => {
    const h1 = computeTaskHash('bundle-abc', 'OAuth 도입')
    const h2 = computeTaskHash('bundle-xyz', 'OAuth 도입')
    expect(h1).not.toBe(h2)
  })

  it('다른 taskText → 다른 해시', () => {
    const h1 = computeTaskHash('bundle-abc', 'OAuth 도입')
    const h2 = computeTaskHash('bundle-abc', '다른 태스크')
    expect(h1).not.toBe(h2)
  })

  it('taskText 가 정규화되어 공백 차이 무시', () => {
    const h1 = computeTaskHash('bundle-abc', 'OAuth   도입')
    const h2 = computeTaskHash('bundle-abc', 'OAuth 도입')
    expect(h1).toBe(h2)
  })

  it('앞뒤 공백 있어도 동일 해시', () => {
    const h1 = computeTaskHash('bundle-abc', '  OAuth 도입  ')
    const h2 = computeTaskHash('bundle-abc', 'OAuth 도입')
    expect(h1).toBe(h2)
  })

  it('64자 hex 문자열 반환 (SHA-256)', () => {
    const h = computeTaskHash('bundle-abc', 'OAuth 도입')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('bundleHash 와 taskText 가 같은 내용이어도 구분자로 충돌 방지', () => {
    // bundleHash="abc", taskText="def" vs bundleHash="abcdef", taskText=""
    // 두 조합이 다른 해시를 내야 한다
    const h1 = computeTaskHash('abc', 'def')
    const h2 = computeTaskHash('abcdef', '')
    expect(h1).not.toBe(h2)
  })

  it('빈 bundleHash + 빈 taskText 도 해시 반환 (예외 없음)', () => {
    expect(() => computeTaskHash('', '')).not.toThrow()
    expect(computeTaskHash('', '')).toMatch(/^[0-9a-f]{64}$/)
  })
})
