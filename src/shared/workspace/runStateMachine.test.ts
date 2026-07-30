import { describe, it, expect } from 'vitest'
import { applyRunEvent, isLiveRun, isTerminalRun, type RunEvent } from './runStateMachine'
import type { AgentRunStatus } from '../types/workspace'

const STATUSES: AgentRunStatus[] = ['spawning', 'running', 'awaiting-input', 'failed', 'adopted', 'discarded']
const EVENTS: RunEvent[] = ['spawn-succeeded', 'spawn-failed', 'tool-activity', 'stop', 'resume', 'adopt', 'discard']

/** ADR-v2-workspace-p1-01 (d) 전이표. null = 무시(허용 안 됨). */
const EXPECTED: Record<AgentRunStatus, Partial<Record<RunEvent, AgentRunStatus>>> = {
  spawning: {
    'spawn-succeeded': 'running',
    'spawn-failed': 'failed',
    'tool-activity': 'running',
    stop: 'awaiting-input',
    adopt: 'adopted',
    discard: 'discarded'
  },
  running: {
    stop: 'awaiting-input',
    adopt: 'adopted',
    discard: 'discarded'
  },
  'awaiting-input': {
    'tool-activity': 'running',
    resume: 'running',
    adopt: 'adopted',
    discard: 'discarded'
  },
  failed: {
    'tool-activity': 'running',
    stop: 'awaiting-input',
    resume: 'running',
    adopt: 'adopted',
    discard: 'discarded'
  },
  adopted: {},
  discarded: {}
}

describe('applyRunEvent — 6 status × 7 event = 42 조합 전 검증 (AC3)', () => {
  for (const status of STATUSES) {
    for (const event of EVENTS) {
      const expected = EXPECTED[status][event] ?? null
      it(`${status} -(${event})-> ${expected === null ? '무시(null)' : expected}`, () => {
        expect(applyRunEvent(status, event)).toBe(expected)
      })
    }
  }
})

describe('applyRunEvent — 시나리오 1: 정상 흐름', () => {
  it('spawning -> running -> awaiting-input -> running(PostToolUse 복귀) -> adopted', () => {
    let status: AgentRunStatus = 'spawning'
    status = applyRunEvent(status, 'spawn-succeeded')!
    expect(status).toBe('running')
    status = applyRunEvent(status, 'stop')!
    expect(status).toBe('awaiting-input')
    status = applyRunEvent(status, 'tool-activity')!
    expect(status).toBe('running')
    status = applyRunEvent(status, 'adopt')!
    expect(status).toBe('adopted')
  })
})

describe('applyRunEvent — 시나리오 2: terminal 상태 흡수', () => {
  it.each(['adopted', 'discarded'] as const)('%s 상태는 7개 이벤트 전부를 흡수(null)한다', (status) => {
    for (const event of EVENTS) {
      expect(applyRunEvent(status, event)).toBeNull()
    }
  })
})

describe('applyRunEvent — failed 는 죽은 상태가 아니다', () => {
  it('failed -(tool-activity)-> running — hook 도착 = claude 생존 증거', () => {
    expect(applyRunEvent('failed', 'tool-activity')).toBe('running')
  })

  it('failed -(stop)-> awaiting-input', () => {
    expect(applyRunEvent('failed', 'stop')).toBe('awaiting-input')
  })
})

describe('isLiveRun / isTerminalRun', () => {
  it.each(['spawning', 'running', 'awaiting-input'] as const)('%s 는 live', (status) => {
    expect(isLiveRun(status)).toBe(true)
    expect(isTerminalRun(status)).toBe(false)
  })

  it('failed 는 live 도 terminal 도 아니다', () => {
    expect(isLiveRun('failed')).toBe(false)
    expect(isTerminalRun('failed')).toBe(false)
  })

  it.each(['adopted', 'discarded'] as const)('%s 는 terminal', (status) => {
    expect(isTerminalRun(status)).toBe(true)
    expect(isLiveRun(status)).toBe(false)
  })
})
