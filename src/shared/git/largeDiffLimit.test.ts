import { describe, it, expect } from 'vitest'
import {
  MAX_RENDERED_DIFF_LINES_PER_SIDE,
  countLinesUpToLimit,
  exceedsDiffRenderLimit
} from './largeDiffLimit'
import {
  DEFAULT_GIT_STATUS_LIMIT,
  capGitStatusEntries,
  resolveGitStatusLimit
} from './statusLimit'

describe('countLinesUpToLimit', () => {
  it('빈 문자열은 0 줄', () => {
    expect(countLinesUpToLimit('', 10)).toBe(0)
  })

  it('개행 수 + 1 을 센다', () => {
    expect(countLinesUpToLimit('a', 10)).toBe(1)
    expect(countLinesUpToLimit('a\nb', 10)).toBe(2)
    expect(countLinesUpToLimit('a\nb\n', 10)).toBe(3)
  })

  it('한도를 넘으면 즉시 멈춘다 — 거대 문자열 전체를 훑지 않는다', () => {
    expect(countLinesUpToLimit('a\n'.repeat(100), 3)).toBe(4)
  })
})

describe('exceedsDiffRenderLimit', () => {
  it('일반 크기는 통과', () => {
    expect(exceedsDiffRenderLimit('작은 원본', '작은 수정')).toBeUndefined()
  })

  it('합산 문자 수 초과를 먼저 잡는다 (O(1))', () => {
    const huge = 'x'.repeat(4_000_000)
    expect(exceedsDiffRenderLimit(huge, huge)?.characters).toBe(8_000_000)
  })

  it('줄 수 초과를 잡는다', () => {
    const many = '\n'.repeat(MAX_RENDERED_DIFF_LINES_PER_SIDE + 1)
    expect(exceedsDiffRenderLimit(many, '')?.lines).toBeGreaterThan(MAX_RENDERED_DIFF_LINES_PER_SIDE)
  })

  it('수정본 쪽만 커도 잡는다', () => {
    const many = '\n'.repeat(MAX_RENDERED_DIFF_LINES_PER_SIDE + 1)
    expect(exceedsDiffRenderLimit('', many)).toBeDefined()
  })
})

describe('statusLimit', () => {
  it('잘못된 값은 기본 상한으로 떨어진다', () => {
    expect(resolveGitStatusLimit(undefined)).toBe(DEFAULT_GIT_STATUS_LIMIT)
    expect(resolveGitStatusLimit(-1)).toBe(DEFAULT_GIT_STATUS_LIMIT)
    expect(resolveGitStatusLimit(1.5)).toBe(DEFAULT_GIT_STATUS_LIMIT)
    expect(resolveGitStatusLimit(10)).toBe(10)
  })

  it('상한 이하는 그대로 통과시킨다', () => {
    expect(capGitStatusEntries([1, 2], 10)).toEqual({ entries: [1, 2] })
  })

  it('상한을 넘으면 잘라내고 전체 개수를 남긴다', () => {
    expect(capGitStatusEntries([1, 2, 3], 2)).toEqual({
      entries: [1, 2],
      didHitLimit: true,
      statusLength: 3
    })
  })

  it('스트리밍 중 이미 한도에 걸렸으면(previous) 개수가 적어도 didHitLimit 을 유지한다', () => {
    expect(capGitStatusEntries([1], 10, { didHitLimit: true, statusLength: 5000 })).toEqual({
      entries: [1],
      didHitLimit: true,
      statusLength: 5000
    })
  })
})
