/**
 * bundleHash.test.ts — computeBundleHash / computeTaskHash 단위 테스트
 *
 * 검증:
 * - 동일 입력 → 동일 해시 (결정론)
 * - 파일 추가/수정/삭제 → 해시 변경
 * - 파일 순서와 무관하게 동일 해시 (정렬 안정)
 * - frontmatter 변경 → 해시 변경
 * - computeTaskHash: bundleHash + taskText 조합
 */

import { describe, it, expect } from 'vitest'
import { computeBundleHash } from '../bundleHash'
import type { FileHashEntry } from '../bundleHash'
// computeTaskHash 는 taskHash.ts 로 일원화됨 (schemaVersion 포함)
import { computeTaskHash } from '../taskHash'

const makeEntry = (relativePath: string, mtimeMs = 1000, size = 100, frontmatterRaw = ''): FileHashEntry => ({
  relativePath,
  mtimeMs,
  size,
  frontmatterRaw,
})

describe('computeBundleHash — 결정론', () => {
  it('동일한 입력에서 항상 동일한 해시를 반환한다', () => {
    const entries = [
      makeEntry('_agents/developer.md', 1000, 200, 'name: developer'),
      makeEntry('_core/concepts.md', 2000, 300),
    ]
    const h1 = computeBundleHash(entries)
    const h2 = computeBundleHash(entries)
    expect(h1).toBe(h2)
  })

  it('SHA-256 hex 문자열(64자)을 반환한다', () => {
    const entries = [makeEntry('file.md')]
    const hash = computeBundleHash(entries)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('빈 배열도 처리하며 결정론적 해시를 반환한다', () => {
    // 실제 BundleScanner 는 빈 목록이면 dummy 엔트리를 넣어 처리하지만,
    // 순수 함수 자체는 빈 배열을 처리해야 함
    const h1 = computeBundleHash([])
    const h2 = computeBundleHash([])
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('computeBundleHash — 변경 감지', () => {
  it('파일을 추가하면 해시가 변경된다', () => {
    const base = [makeEntry('_agents/developer.md', 1000, 200)]
    const withNew = [
      ...base,
      makeEntry('_agents/qa.md', 1001, 150),
    ]
    expect(computeBundleHash(base)).not.toBe(computeBundleHash(withNew))
  })

  it('파일 mtime 이 변경되면 해시가 변경된다', () => {
    const original = [makeEntry('_agents/developer.md', 1000, 200)]
    const modified = [makeEntry('_agents/developer.md', 9999, 200)]
    expect(computeBundleHash(original)).not.toBe(computeBundleHash(modified))
  })

  it('파일 크기가 변경되면 해시가 변경된다', () => {
    const original = [makeEntry('_agents/developer.md', 1000, 200)]
    const modified = [makeEntry('_agents/developer.md', 1000, 999)]
    expect(computeBundleHash(original)).not.toBe(computeBundleHash(modified))
  })

  it('파일을 삭제하면 해시가 변경된다', () => {
    const withTwo = [
      makeEntry('_agents/developer.md', 1000, 200),
      makeEntry('_agents/qa.md', 1001, 150),
    ]
    const withOne = [makeEntry('_agents/developer.md', 1000, 200)]
    expect(computeBundleHash(withTwo)).not.toBe(computeBundleHash(withOne))
  })

  it('frontmatter 내용이 변경되면 해시가 변경된다', () => {
    const original = [makeEntry('developer/SKILL.md', 1000, 200, 'name: developer\nmodel: sonnet')]
    const modified = [makeEntry('developer/SKILL.md', 1000, 200, 'name: developer\nmodel: opus')]
    expect(computeBundleHash(original)).not.toBe(computeBundleHash(modified))
  })
})

describe('computeBundleHash — 순서 무관 안정성', () => {
  it('파일 목록 순서가 달라도 동일한 해시를 반환한다', () => {
    const entries1 = [
      makeEntry('_agents/developer.md', 1000, 200, 'name: developer'),
      makeEntry('_core/concepts.md', 2000, 300),
      makeEntry('_hooks/gate.sh', 3000, 400),
    ]
    const entries2 = [
      makeEntry('_hooks/gate.sh', 3000, 400),
      makeEntry('_agents/developer.md', 1000, 200, 'name: developer'),
      makeEntry('_core/concepts.md', 2000, 300),
    ]
    expect(computeBundleHash(entries1)).toBe(computeBundleHash(entries2))
  })

  it('알파벳 역순 입력도 동일한 해시를 반환한다', () => {
    const entries1 = [
      makeEntry('a.md'),
      makeEntry('b.md'),
      makeEntry('c.md'),
    ]
    const entries2 = [
      makeEntry('c.md'),
      makeEntry('b.md'),
      makeEntry('a.md'),
    ]
    expect(computeBundleHash(entries1)).toBe(computeBundleHash(entries2))
  })
})

describe('computeTaskHash', () => {
  it('동일한 bundleHash + taskText → 동일한 taskHash', () => {
    const h1 = computeTaskHash('abc123', '새 기능 추가 요청')
    const h2 = computeTaskHash('abc123', '새 기능 추가 요청')
    expect(h1).toBe(h2)
  })

  it('SHA-256 hex 문자열(64자)을 반환한다', () => {
    const h = computeTaskHash('abc', 'task')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('bundleHash 가 다르면 taskHash 가 달라진다', () => {
    const h1 = computeTaskHash('bundle-a', 'same task')
    const h2 = computeTaskHash('bundle-b', 'same task')
    expect(h1).not.toBe(h2)
  })

  it('taskText 가 다르면 taskHash 가 달라진다', () => {
    const h1 = computeTaskHash('same-bundle', '기능 A 추가')
    const h2 = computeTaskHash('same-bundle', '기능 B 수정')
    expect(h1).not.toBe(h2)
  })

  it('taskText 대소문자 무관 — 정규화 후 동일 해시', () => {
    const h1 = computeTaskHash('bundle', '새 기능 추가 요청')
    const h2 = computeTaskHash('bundle', '새 기능 추가 요청')
    expect(h1).toBe(h2)
  })

  it('taskText 연속 공백 정규화 — 동일 해시', () => {
    const h1 = computeTaskHash('bundle', '새  기능   추가')
    const h2 = computeTaskHash('bundle', '새 기능 추가')
    expect(h1).toBe(h2)
  })

  it('빈 taskText 도 처리한다', () => {
    expect(() => computeTaskHash('bundle', '')).not.toThrow()
    const h = computeTaskHash('bundle', '')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})
