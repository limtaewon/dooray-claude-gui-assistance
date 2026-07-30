import type { AgentRunStatus } from '@shared/types/workspace'
import type { ChipTone } from '../common/ds'

/** run 상태의 사용자 표기 + 칩 톤 + dot 색. 좌측 목록 배지와 run 헤더가 공유한다. */
export const RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
  spawning: '시작 중',
  running: '작업 중',
  'awaiting-input': '응답 대기',
  failed: '실패',
  adopted: '채택됨',
  discarded: '정리됨'
}

export const RUN_STATUS_TONE: Record<AgentRunStatus, ChipTone> = {
  spawning: 'neutral',
  running: 'blue',
  'awaiting-input': 'orange',
  failed: 'red',
  adopted: 'emerald',
  discarded: 'neutral'
}

/** 좌측 태스크 목록의 상태 dot 클래스. running 만 pulse 로 진행 중임을 알린다. */
export function runStatusDotClass(status: AgentRunStatus): string {
  switch (status) {
    case 'running':
      return 'bg-clauday-blue animate-pulse'
    case 'spawning':
      return 'bg-text-tertiary animate-pulse'
    case 'awaiting-input':
      return 'bg-clauday-orange'
    case 'failed':
      return 'bg-red-500'
    case 'adopted':
      return 'bg-emerald-500'
    default:
      return 'bg-text-tertiary'
  }
}

/** 경과 시간 표기 (초/분/시간). 진행 중 run 헤더용. */
export function formatElapsed(startedAt: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000))
  if (sec < 60) return `${sec}초`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분`
  const hour = Math.floor(min / 60)
  return `${hour}시간 ${min % 60}분`
}
