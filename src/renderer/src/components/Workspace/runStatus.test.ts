import { describe, it, expect } from 'vitest'
import { RUN_STATUS_LABEL, RUN_STATUS_TONE, formatElapsed, runStatusDotClass } from './runStatus'
import type { AgentRunStatus } from '@shared/types/workspace'

const ALL: AgentRunStatus[] = ['spawning', 'running', 'awaiting-input', 'failed', 'adopted', 'discarded']

describe('runStatus', () => {
  it('모든 상태에 라벨과 톤이 정의돼 있다', () => {
    for (const status of ALL) {
      expect(RUN_STATUS_LABEL[status]).toBeTruthy()
      expect(RUN_STATUS_TONE[status]).toBeTruthy()
      expect(runStatusDotClass(status)).toContain('bg-')
    }
  })

  it('진행 중 상태만 pulse 로 표시한다', () => {
    expect(runStatusDotClass('running')).toContain('animate-pulse')
    expect(runStatusDotClass('spawning')).toContain('animate-pulse')
    expect(runStatusDotClass('awaiting-input')).not.toContain('animate-pulse')
    expect(runStatusDotClass('adopted')).not.toContain('animate-pulse')
  })

  describe('formatElapsed', () => {
    const base = 1_700_000_000_000

    it('1분 미만은 초 단위', () => {
      expect(formatElapsed(base, base + 5_000)).toBe('5초')
      expect(formatElapsed(base, base + 59_000)).toBe('59초')
    })

    it('1시간 미만은 분 단위', () => {
      expect(formatElapsed(base, base + 60_000)).toBe('1분')
      expect(formatElapsed(base, base + 59 * 60_000)).toBe('59분')
    })

    it('1시간 이상은 시간+분', () => {
      expect(formatElapsed(base, base + 60 * 60_000)).toBe('1시간 0분')
      expect(formatElapsed(base, base + 90 * 60_000)).toBe('1시간 30분')
    })

    it('시계가 거꾸로 가도 음수를 내지 않는다', () => {
      expect(formatElapsed(base, base - 10_000)).toBe('0초')
    })
  })
})
