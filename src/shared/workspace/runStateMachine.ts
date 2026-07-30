import type { AgentRunStatus } from '../types/workspace'

/** agent run 에 발생 가능한 이벤트. 상태 전이는 목표 상태가 아니라 "무슨 일이 일어났는가"로 표현한다. */
export type RunEvent = 'spawn-succeeded' | 'spawn-failed' | 'tool-activity' | 'stop' | 'resume' | 'adopt' | 'discard'

const LIVE_STATUSES: ReadonlySet<AgentRunStatus> = new Set(['spawning', 'running', 'awaiting-input'])
const TERMINAL_STATUSES: ReadonlySet<AgentRunStatus> = new Set(['adopted', 'discarded'])

/**
 * 상태 전이표 (ADR-v2-workspace-p1-01 (d)).
 * terminal 상태(adopted/discarded)는 모든 이벤트를 흡수(빈 객체)한다.
 */
const TRANSITIONS: Record<AgentRunStatus, Partial<Record<RunEvent, AgentRunStatus>>> = {
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
  // failed 는 죽은 상태가 아니다 — hook 도착은 claude 가 살아 있다는 증거이므로 live 로 되돌린다.
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

/** 상태 전이. 이벤트가 현재 상태에서 허용되지 않으면 null(에러 아님 — 늦게 온 hook 등 정상 레이스). */
export function applyRunEvent(status: AgentRunStatus, event: RunEvent): AgentRunStatus | null {
  return TRANSITIONS[status][event] ?? null
}

/** live 상태(spawning/running/awaiting-input) 여부. */
export function isLiveRun(status: AgentRunStatus): boolean {
  return LIVE_STATUSES.has(status)
}

/** terminal 상태(adopted/discarded) 여부 — 모든 이벤트를 흡수한다. */
export function isTerminalRun(status: AgentRunStatus): boolean {
  return TERMINAL_STATUSES.has(status)
}
