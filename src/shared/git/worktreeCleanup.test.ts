import { describe, it, expect } from 'vitest'
import {
  buildCleanupRows,
  summarizeSelection,
  formatBytes,
  formatLastUsed
} from './worktreeCleanup'
import type { GitWorktreeUsage } from '../types/git'

const DAY = 86_400_000
const NOW = 1_800_000_000_000

function usage(over: Partial<GitWorktreeUsage> & { path: string }): GitWorktreeUsage {
  return {
    branch: 'feature/x',
    isMain: false,
    sizeBytes: 1024,
    dirtyFiles: 0,
    mtimeMs: NOW,
    ...over
  }
}

describe('buildCleanupRows', () => {
  it('본 저장소는 정리 대상이 아니다', () => {
    const rows = buildCleanupRows(
      [usage({ path: '/repo', isMain: true }), usage({ path: '/repo-wt/a' })],
      []
    )
    expect(rows.map((r) => r.path)).toEqual(['/repo-wt/a'])
  })

  it('세션 기록이 있으면 그 시각을 쓰고, 없으면 폴더 수정 시각으로 떨어진다', () => {
    const rows = buildCleanupRows(
      [
        usage({ path: '/wt/a', mtimeMs: NOW - 10 * DAY }),
        usage({ path: '/wt/b', mtimeMs: NOW - 20 * DAY })
      ],
      [{ cwd: '/wt/a/', claudeSessionId: 's1', lastUsedAt: NOW - DAY }]
    )
    const a = rows.find((r) => r.path === '/wt/a')
    const b = rows.find((r) => r.path === '/wt/b')
    // 뒤 슬래시 차이는 같은 폴더로 본다
    expect(a).toMatchObject({ lastUsedAt: NOW - DAY, lastUsedFromSession: true })
    expect(b).toMatchObject({ lastUsedAt: NOW - 20 * DAY, lastUsedFromSession: false })
  })

  it('같은 폴더에 링크가 여럿이면 가장 최근 것을 쓴다', () => {
    const rows = buildCleanupRows(
      [usage({ path: '/wt/a' })],
      [
        { cwd: '/wt/a', claudeSessionId: 's1', lastUsedAt: NOW - 5 * DAY },
        { cwd: '/wt/a', claudeSessionId: 's2', lastUsedAt: NOW - DAY }
      ]
    )
    expect(rows[0].lastUsedAt).toBe(NOW - DAY)
  })

  it('오래 안 쓴 것부터 보여준다', () => {
    const rows = buildCleanupRows(
      [
        usage({ path: '/wt/new', mtimeMs: NOW }),
        usage({ path: '/wt/old', mtimeMs: NOW - 90 * DAY }),
        usage({ path: '/wt/mid', mtimeMs: NOW - 10 * DAY })
      ],
      []
    )
    expect(rows.map((r) => r.path)).toEqual(['/wt/old', '/wt/mid', '/wt/new'])
  })
})

describe('summarizeSelection', () => {
  it('고른 것들의 용량·변경 파일을 합산한다', () => {
    const rows = buildCleanupRows(
      [
        usage({ path: '/wt/a', sizeBytes: 2048, dirtyFiles: 3 }),
        usage({ path: '/wt/b', sizeBytes: 1024 }),
        usage({ path: '/wt/c', sizeBytes: 4096 })
      ],
      []
    )
    expect(summarizeSelection(rows, new Set(['/wt/a', '/wt/b']))).toEqual({
      count: 2,
      sizeBytes: 3072,
      dirtyCount: 1,
      unknownSize: false
    })
  })

  it('용량을 못 잰 항목이 섞이면 합계가 부정확하다고 알린다', () => {
    const rows = buildCleanupRows([usage({ path: '/wt/a', sizeBytes: null })], [])
    expect(summarizeSelection(rows, new Set(['/wt/a']))).toMatchObject({
      sizeBytes: 0,
      unknownSize: true
    })
  })
})

describe('formatBytes', () => {
  it('단위를 올려 읽기 좋게 만든다', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB')
    expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB')
  })

  it('못 잰 값은 대시', () => {
    expect(formatBytes(null)).toBe('—')
  })
})

describe('formatLastUsed', () => {
  it('상대 시각으로 말한다', () => {
    expect(formatLastUsed(NOW, NOW)).toBe('오늘')
    expect(formatLastUsed(NOW - DAY, NOW)).toBe('어제')
    expect(formatLastUsed(NOW - 12 * DAY, NOW)).toBe('12일 전')
    expect(formatLastUsed(NOW - 70 * DAY, NOW)).toBe('2개월 전')
    expect(formatLastUsed(NOW - 400 * DAY, NOW)).toBe('1년 전')
    expect(formatLastUsed(null, NOW)).toBe('알 수 없음')
  })
})
