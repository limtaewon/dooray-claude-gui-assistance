import { describe, it, expect } from 'vitest'
import {
  TERMINAL_PATH_EXISTS_CACHE_MAX_ENTRIES,
  getPathExistsCacheKey,
  readPathExistsCache,
  writePathExistsCache
} from './pathExistsCache'

describe('pathExistsCache', () => {
  it('키는 cwd 와 candidate 를 NUL 로 구분한다', () => {
    expect(getPathExistsCacheKey('/repo', 'src/a.ts')).toBe('/repo\0src/a.ts')
  })

  it('같은 cwd 라도 candidate 가 다르면 키가 다르다(키 충돌 없음)', () => {
    const cache = new Map<string, { resolved: string; kind: 'file' | 'directory' | null }>()
    writePathExistsCache(cache, getPathExistsCacheKey('/repo', 'a.ts'), { resolved: '/repo/a.ts', kind: 'file' })
    writePathExistsCache(cache, getPathExistsCacheKey('/repo', 'b.ts'), { resolved: '/repo/b.ts', kind: 'file' })
    expect(readPathExistsCache(cache, getPathExistsCacheKey('/repo', 'a.ts'))?.resolved).toBe('/repo/a.ts')
    expect(readPathExistsCache(cache, getPathExistsCacheKey('/repo', 'b.ts'))?.resolved).toBe('/repo/b.ts')
  })

  it('cwd 가 다르면 같은 candidate 문자열도 다른 항목으로 캐시된다', () => {
    const cache = new Map<string, { resolved: string; kind: 'file' | 'directory' | null }>()
    writePathExistsCache(cache, getPathExistsCacheKey('/a', 'x.ts'), { resolved: '/a/x.ts', kind: 'file' })
    expect(readPathExistsCache(cache, getPathExistsCacheKey('/b', 'x.ts'))).toBeUndefined()
  })

  it('음수(미존재) 결과도 캐시한다', () => {
    const cache = new Map<string, { resolved: string; kind: 'file' | 'directory' | null }>()
    writePathExistsCache(cache, getPathExistsCacheKey('/repo', 'missing.ts'), { resolved: '/repo/missing.ts', kind: null })
    const hit = readPathExistsCache(cache, getPathExistsCacheKey('/repo', 'missing.ts'))
    expect(hit).toEqual({ resolved: '/repo/missing.ts', kind: null })
  })

  it('상한(1024)을 넘으면 가장 오래된(LRU) 항목부터 축출한다', () => {
    const cache = new Map<string, { resolved: string; kind: 'file' | 'directory' | null }>()
    for (let i = 0; i < TERMINAL_PATH_EXISTS_CACHE_MAX_ENTRIES; i++) {
      writePathExistsCache(cache, getPathExistsCacheKey('/repo', `f${i}.ts`), { resolved: `/repo/f${i}.ts`, kind: 'file' })
    }
    expect(cache.size).toBe(TERMINAL_PATH_EXISTS_CACHE_MAX_ENTRIES)
    // 하나 더 넣으면 가장 먼저 넣은(f0)이 축출된다.
    writePathExistsCache(cache, getPathExistsCacheKey('/repo', 'fNew.ts'), { resolved: '/repo/fNew.ts', kind: 'file' })
    expect(cache.size).toBe(TERMINAL_PATH_EXISTS_CACHE_MAX_ENTRIES)
    expect(readPathExistsCache(cache, getPathExistsCacheKey('/repo', 'f0.ts'))).toBeUndefined()
    expect(readPathExistsCache(cache, getPathExistsCacheKey('/repo', 'fNew.ts'))).toBeDefined()
  })

  it('읽으면 최근 사용으로 갱신되어 축출 순서에서 밀려난다', () => {
    const cache = new Map<string, { resolved: string; kind: 'file' | 'directory' | null }>()
    for (let i = 0; i < TERMINAL_PATH_EXISTS_CACHE_MAX_ENTRIES; i++) {
      writePathExistsCache(cache, getPathExistsCacheKey('/repo', `f${i}.ts`), { resolved: `/repo/f${i}.ts`, kind: 'file' })
    }
    // f0 를 다시 읽어 "최근 사용"으로 만든다.
    readPathExistsCache(cache, getPathExistsCacheKey('/repo', 'f0.ts'))
    writePathExistsCache(cache, getPathExistsCacheKey('/repo', 'fNew.ts'), { resolved: '/repo/fNew.ts', kind: 'file' })
    // f0 는 살아남고, 그 다음으로 오래된 f1 이 대신 축출된다.
    expect(readPathExistsCache(cache, getPathExistsCacheKey('/repo', 'f0.ts'))).toBeDefined()
    expect(readPathExistsCache(cache, getPathExistsCacheKey('/repo', 'f1.ts'))).toBeUndefined()
  })
})
