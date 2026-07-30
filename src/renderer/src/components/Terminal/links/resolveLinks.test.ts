import { describe, it, expect, vi } from 'vitest'
import { resolveFileLinkCandidates, preferLongestNonOverlappingLinks } from './resolveLinks'
import type { CachedPathResolution } from './pathExistsCache'
import { getPathExistsCacheKey, writePathExistsCache } from './pathExistsCache'

describe('resolveFileLinkCandidates', () => {
  it('캐시 미스만 배치로 invoke 한다', async () => {
    const cache = new Map<string, CachedPathResolution>()
    writePathExistsCache(cache, getPathExistsCacheKey('/repo', 'cached.ts'), { resolved: '/repo/cached.ts', kind: 'file' })
    const resolvePath = vi.fn().mockResolvedValue([{ candidate: 'fresh.ts', resolved: '/repo/fresh.ts', kind: 'file' }])

    const result = await resolveFileLinkCandidates({
      candidates: ['cached.ts', 'fresh.ts'],
      cwdHint: '/repo',
      cache,
      resolvePath
    })

    expect(resolvePath).toHaveBeenCalledWith({ sessionId: undefined, cwdHint: '/repo', candidates: ['fresh.ts'] })
    expect(result.get('cached.ts')).toEqual({ resolved: '/repo/cached.ts', kind: 'file' })
    expect(result.get('fresh.ts')).toEqual({ resolved: '/repo/fresh.ts', kind: 'file' })
  })

  it('전부 캐시 히트면 invoke 하지 않는다', async () => {
    const cache = new Map<string, CachedPathResolution>()
    writePathExistsCache(cache, getPathExistsCacheKey('/repo', 'a.ts'), { resolved: '/repo/a.ts', kind: 'file' })
    const resolvePath = vi.fn()
    await resolveFileLinkCandidates({ candidates: ['a.ts'], cwdHint: '/repo', cache, resolvePath })
    expect(resolvePath).not.toHaveBeenCalled()
  })

  it('결과를 캐시에 적재해 다음 호출에서 재사용된다', async () => {
    const cache = new Map<string, CachedPathResolution>()
    const resolvePath = vi.fn().mockResolvedValue([{ candidate: 'a.ts', resolved: '/repo/a.ts', kind: 'file' }])
    await resolveFileLinkCandidates({ candidates: ['a.ts'], cwdHint: '/repo', cache, resolvePath })
    await resolveFileLinkCandidates({ candidates: ['a.ts'], cwdHint: '/repo', cache, resolvePath })
    expect(resolvePath).toHaveBeenCalledTimes(1)
  })

  it('음수(kind:null) 결과도 캐시된다', async () => {
    const cache = new Map<string, CachedPathResolution>()
    const resolvePath = vi.fn().mockResolvedValue([{ candidate: 'missing.ts', resolved: '/repo/missing.ts', kind: null }])
    const result = await resolveFileLinkCandidates({ candidates: ['missing.ts'], cwdHint: '/repo', cache, resolvePath })
    expect(result.get('missing.ts')).toEqual({ resolved: '/repo/missing.ts', kind: null })
    expect(resolvePath).toHaveBeenCalledTimes(1)
    await resolveFileLinkCandidates({ candidates: ['missing.ts'], cwdHint: '/repo', cache, resolvePath })
    expect(resolvePath).toHaveBeenCalledTimes(1) // 두 번째는 캐시 히트
  })

  it('cwdHint 가 없으면 sessionId 로 캐시 버킷을 근사한다', async () => {
    const cache = new Map<string, CachedPathResolution>()
    const resolvePath = vi.fn().mockResolvedValue([{ candidate: 'a.ts', resolved: '/repo/a.ts', kind: 'file' }])
    await resolveFileLinkCandidates({ candidates: ['a.ts'], sessionId: 's1', cache, resolvePath })
    expect(resolvePath).toHaveBeenCalledWith({ sessionId: 's1', cwdHint: undefined, candidates: ['a.ts'] })
    // 같은 세션 재조회는 캐시를 탄다.
    await resolveFileLinkCandidates({ candidates: ['a.ts'], sessionId: 's1', cache, resolvePath })
    expect(resolvePath).toHaveBeenCalledTimes(1)
  })

  it('IPC 실패 시 throw 하지 않고 미스분은 빈 채로 남긴다', async () => {
    const cache = new Map<string, CachedPathResolution>()
    const resolvePath = vi.fn().mockRejectedValue(new Error('ipc down'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await resolveFileLinkCandidates({ candidates: ['a.ts'], cwdHint: '/repo', cache, resolvePath })
    expect(result.has('a.ts')).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('중복 후보는 한 번만 요청한다', async () => {
    const cache = new Map<string, CachedPathResolution>()
    const resolvePath = vi.fn().mockResolvedValue([{ candidate: 'a.ts', resolved: '/repo/a.ts', kind: 'file' }])
    await resolveFileLinkCandidates({ candidates: ['a.ts', 'a.ts', 'a.ts'], cwdHint: '/repo', cache, resolvePath })
    expect(resolvePath).toHaveBeenCalledWith({ sessionId: undefined, cwdHint: '/repo', candidates: ['a.ts'] })
  })
})

describe('preferLongestNonOverlappingLinks', () => {
  function span(text: string, y: number, x0: number, x1: number): { text: string; range: { start: { x: number; y: number }; end: { x: number; y: number } } } {
    return { text, range: { start: { x: x0, y }, end: { x: x1, y } } }
  }

  it('겹치는 후보 중 가장 긴 것만 남긴다', () => {
    const long = span('/Users/x/very/long/path.ts', 1, 1, 30)
    const short = span('path.ts', 1, 20, 27)
    expect(preferLongestNonOverlappingLinks([short, long])).toEqual([long])
  })

  it('겹치지 않는 후보는 모두 유지한다', () => {
    const a = span('a.ts', 1, 1, 4)
    const b = span('b.ts', 1, 10, 14)
    expect(preferLongestNonOverlappingLinks([b, a])).toEqual([a, b])
  })

  it('서로 다른 논리 라인(y) 의 후보도 올바르게 비교한다', () => {
    const rowOne = span('a.ts', 1, 1, 4)
    const rowTwo = span('b.ts', 2, 1, 4)
    expect(preferLongestNonOverlappingLinks([rowOne, rowTwo])).toEqual([rowOne, rowTwo])
  })
})
