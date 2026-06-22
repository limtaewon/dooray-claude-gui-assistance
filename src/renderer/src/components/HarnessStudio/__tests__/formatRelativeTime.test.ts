import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatRelativeTime } from '../HarnessStudioView'

describe('formatRelativeTime', () => {
  afterEach(() => { vi.useRealTimers() })

  const now = new Date('2026-06-19T10:00:00Z').getTime()

  it('1분 미만 → 방금', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const iso = new Date(now - 30_000).toISOString()
    expect(formatRelativeTime(iso)).toBe('방금')
  })

  it('30분 → "30분 전"', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const iso = new Date(now - 30 * 60_000).toISOString()
    expect(formatRelativeTime(iso)).toBe('30분 전')
  })

  it('3시간 → "3시간 전"', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const iso = new Date(now - 3 * 60 * 60_000).toISOString()
    expect(formatRelativeTime(iso)).toBe('3시간 전')
  })

  it('2일 → "2일 전"', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const iso = new Date(now - 2 * 24 * 60 * 60_000).toISOString()
    expect(formatRelativeTime(iso)).toBe('2일 전')
  })

  it('잘못된 ISO 문자열 → 빈 문자열', () => {
    expect(formatRelativeTime('not-a-date')).toBe('')
  })
})
