import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import TimeAgo from './TimeAgo'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-13T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('TimeAgo 상대시간 포맷', () => {
  it('5초 미만 → "방금"', () => {
    const d = new Date('2026-05-13T11:59:58Z')
    const { container } = render(<TimeAgo date={d} />)
    expect(container.textContent).toBe('방금')
  })

  it('60초 미만 → "N초 전"', () => {
    const d = new Date('2026-05-13T11:59:30Z')
    const { container } = render(<TimeAgo date={d} />)
    expect(container.textContent).toBe('30초 전')
  })

  it('1시간 미만 → "N분 전"', () => {
    const d = new Date('2026-05-13T11:30:00Z')
    const { container } = render(<TimeAgo date={d} />)
    expect(container.textContent).toBe('30분 전')
  })

  it('1일 미만 → "N시간 전"', () => {
    const d = new Date('2026-05-13T07:00:00Z')
    const { container } = render(<TimeAgo date={d} />)
    expect(container.textContent).toBe('5시간 전')
  })

  it('1주 미만 → "N일 전"', () => {
    const d = new Date('2026-05-10T12:00:00Z')
    const { container } = render(<TimeAgo date={d} />)
    expect(container.textContent).toBe('3일 전')
  })

  it('7일 이상 → 절대 날짜', () => {
    const d = new Date('2026-04-01T00:00:00Z')
    const { container } = render(<TimeAgo date={d} />)
    expect(container.textContent).toMatch(/2026/)
  })

  it('string/number 입력도 허용', () => {
    const { container } = render(<TimeAgo date={'2026-05-13T11:59:30Z'} />)
    expect(container.textContent).toBe('30초 전')
  })

  it('absolute=true 면 절대시간', () => {
    const d = new Date('2026-05-13T11:00:00Z')
    const { container } = render(<TimeAgo date={d} absolute />)
    expect(container.textContent).not.toBe('1시간 전')
  })

  it('title 속성은 항상 절대시간 표기', () => {
    const d = new Date('2026-05-13T11:59:30Z')
    const { container } = render(<TimeAgo date={d} />)
    expect((container.firstChild as HTMLElement).getAttribute('title')).not.toBe('30초 전')
  })
})
