/**
 * Gates & 강제 패널 — 순수 함수 유틸리티.
 *
 * HarnessControlFlow 데이터를 뷰에 맞게 가공한다.
 * 테스트 가능한 순수함수로만 구성된다.
 */

import type { HarnessControlFlow, HarnessGate, HarnessHook } from '@shared/types/harness'

/** 4계층 제약 레이어 정의 */
export interface ConstraintLayer {
  /** 레이어 식별 키 */
  key: 'gate' | 'hook' | 'signal' | 'loop'
  /** 레이어 표시 이름 */
  label: string
  /** 이 레이어가 실제로 데이터를 가지고 있는지 */
  hasData: boolean
  /** 항목 수 */
  count: number
  /** 런타임 강제 여부 — gate/hook 은 true, signal/loop 은 false */
  runtimeEnforced: boolean
}

/**
 * 제어흐름에서 4계층 제약 요약을 만든다.
 *
 * 레이어 순서: gate(가장 강함) → hook → signal → loop
 */
export function buildConstraintLayers(cf: HarnessControlFlow): ConstraintLayer[] {
  const signalCount = cf.signalEnum
    ? Object.values(cf.signalEnum).reduce((acc, arr) => acc + arr.length, 0)
    : 0

  return [
    {
      key: 'gate',
      label: '게이트 (Phase Gate)',
      hasData: cf.gates.length > 0,
      count: cf.gates.length,
      runtimeEnforced: true
    },
    {
      key: 'hook',
      label: 'Hook (SubagentStop / PreToolUse)',
      hasData: cf.hooks.length > 0,
      count: cf.hooks.length,
      runtimeEnforced: true
    },
    {
      key: 'signal',
      label: 'SIGNAL Enum (에이전트 전이 신호)',
      hasData: signalCount > 0,
      count: signalCount,
      runtimeEnforced: false
    },
    {
      key: 'loop',
      label: '피드백 루프 / 병렬 그룹',
      hasData: cf.loops.length > 0 || cf.parallelGroups.length > 0,
      count: cf.loops.length + cf.parallelGroups.length,
      runtimeEnforced: false
    }
  ]
}

/**
 * 게이트 목록을 blocking/non-blocking 으로 분리.
 *
 * blocking=true 인 것이 실제 실행 차단 게이트(exit 1/2).
 */
export function partitionGates(gates: HarnessGate[]): {
  blocking: HarnessGate[]
  nonBlocking: HarnessGate[]
} {
  return {
    blocking: gates.filter((g) => g.blocking),
    nonBlocking: gates.filter((g) => !g.blocking)
  }
}

/**
 * ruleCodes 배열을 번들 종류별 prefix 로 그루핑.
 *
 * - R5xx 계열 (reined-bmad)
 * - NEON-Gxx 계열 (neon-bmad)
 * - 그 외 (AOP01, LYR01 등)
 */
export interface RuleCodeGroup {
  prefix: string
  codes: string[]
}

export function groupRuleCodes(ruleCodes: string[]): RuleCodeGroup[] {
  const groups = new Map<string, string[]>()

  for (const code of ruleCodes) {
    let prefix: string
    if (/^R\d/.test(code)) {
      prefix = 'R-series'
    } else if (/^NEON-G/i.test(code)) {
      prefix = 'NEON-G'
    } else {
      prefix = 'Other'
    }
    const arr = groups.get(prefix) ?? []
    arr.push(code)
    groups.set(prefix, arr)
  }

  return Array.from(groups.entries()).map(([prefix, codes]) => ({ prefix, codes }))
}

/**
 * 상태기계 전이를 from 상태 기준으로 그루핑.
 *
 * stateMachine 이 없으면 빈 Map 을 반환한다.
 */
export interface TransitionGroup {
  from: string
  transitions: Array<{ on: string; to: string }>
}

export function groupStateMachineByFrom(
  stateMachine: HarnessControlFlow['stateMachine']
): TransitionGroup[] {
  if (!stateMachine) return []

  const groups = new Map<string, Array<{ on: string; to: string }>>()

  for (const t of stateMachine.transitions) {
    const arr = groups.get(t.from) ?? []
    arr.push({ on: t.on, to: t.to })
    groups.set(t.from, arr)
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([from, transitions]) => ({ from, transitions }))
}

/**
 * hook 이벤트 종류에 따라 표시 색상 톤을 반환.
 *
 * SubagentStop 은 가장 강한 강제(orange), PreToolUse 는 보통(blue), 그 외 neutral.
 */
export function hookEventTone(event: HarnessHook['event']): 'orange' | 'blue' | 'neutral' {
  if (!event) return 'neutral'
  if (/subagent.*stop|stop/i.test(event)) return 'orange'
  if (/pretool|pre.tool/i.test(event)) return 'blue'
  return 'neutral'
}
