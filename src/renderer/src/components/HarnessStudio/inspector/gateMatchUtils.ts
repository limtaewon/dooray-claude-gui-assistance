/**
 * gateMatchUtils — 에이전트 ↔ 게이트 매칭 순수 유틸리티.
 *
 * FlowCanvas 와 AgentInspector 양쪽에서 재사용할 수 있도록
 * React 의존 없는 순수 함수로 분리한다.
 */

import type { HarnessAgent, HarnessGate } from '@shared/types/harness'

/**
 * 에이전트와 게이트가 같은 단계(phase)에 속하는지 판별한다.
 *
 * 매칭 기준 (순서대로):
 * 1. gate.phase === agent.displayName
 * 2. gate.phase === agent.id
 * 3. agent.phaseClass 가 있으면 gate.phase === agent.phaseClass
 *
 * @param agent - 비교할 에이전트
 * @param gate  - 비교할 게이트
 */
export function agentMatchesGate(agent: HarnessAgent, gate: HarnessGate): boolean {
  if (gate.phase === agent.displayName) return true
  if (gate.phase === agent.id) return true
  if (agent.phaseClass && gate.phase === agent.phaseClass) return true
  return false
}

/**
 * 에이전트에 대응하는 게이트를 목록에서 찾아 반환한다.
 * 여러 게이트가 매칭될 경우 첫 번째만 반환한다(일반적으로 phase 당 게이트 1개).
 *
 * @param agent - 대상 에이전트
 * @param gates - 전체 게이트 목록 (HarnessModel.controlFlow.gates)
 * @returns 매칭된 게이트 또는 undefined
 */
export function findGateForAgent(
  agent: HarnessAgent,
  gates: HarnessGate[]
): HarnessGate | undefined {
  return gates.find((gate) => agentMatchesGate(agent, gate))
}
