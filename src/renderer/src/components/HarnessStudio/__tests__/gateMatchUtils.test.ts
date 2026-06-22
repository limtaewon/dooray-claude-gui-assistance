/**
 * gateMatchUtils 단위 테스트.
 *
 * 에이전트 ↔ 게이트 매칭 로직을 검증한다.
 * - displayName 매칭
 * - id 매칭
 * - phaseClass 매칭
 * - 불일치 케이스
 * - findGateForAgent 동작
 */

import { describe, it, expect } from 'vitest'
import { agentMatchesGate, findGateForAgent } from '../inspector/gateMatchUtils'
import type { HarnessAgent, HarnessGate } from '@shared/types/harness'

// ─────────────────────────────────────────────
// 팩토리 헬퍼
// ─────────────────────────────────────────────

function makeAgent(overrides: Partial<HarnessAgent> & { id: string }): HarnessAgent {
  return {
    id: overrides.id,
    displayName: overrides.displayName ?? overrides.id,
    role: overrides.role ?? '',
    model: overrides.model ?? 'sonnet',
    modelSource: overrides.modelSource ?? 'static',
    tools: overrides.tools ?? [],
    reads: overrides.reads ?? [],
    writes: overrides.writes ?? [],
    phaseClass: overrides.phaseClass,
    escalation: overrides.escalation,
    signals: overrides.signals,
    riskNote: overrides.riskNote
  }
}

function makeGate(phase: string, overrides?: Partial<HarnessGate>): HarnessGate {
  return {
    phase,
    ruleCodes: overrides?.ruleCodes ?? [],
    description: overrides?.description,
    blocking: overrides?.blocking ?? true
  }
}

// ─────────────────────────────────────────────
// agentMatchesGate
// ─────────────────────────────────────────────

describe('agentMatchesGate', () => {
  it('gate.phase 가 agent.displayName 과 같으면 true', () => {
    const agent = makeAgent({ id: 'reined-bmad-developer', displayName: 'developer' })
    const gate = makeGate('developer')
    expect(agentMatchesGate(agent, gate)).toBe(true)
  })

  it('gate.phase 가 agent.id 와 같으면 true', () => {
    const agent = makeAgent({ id: 'dev', displayName: 'Developer' })
    const gate = makeGate('dev')
    expect(agentMatchesGate(agent, gate)).toBe(true)
  })

  it('gate.phase 가 agent.phaseClass 와 같으면 true', () => {
    const agent = makeAgent({ id: 'reined-bmad-developer', displayName: 'developer', phaseClass: 'dev' })
    const gate = makeGate('dev')
    expect(agentMatchesGate(agent, gate)).toBe(true)
  })

  it('phaseClass 가 없으면 id/displayName 만 비교한다', () => {
    const agent = makeAgent({ id: 'reined-bmad-developer', displayName: 'developer' })
    const gate = makeGate('dev')
    // displayName='developer' != 'dev', id='reined-bmad-developer' != 'dev', phaseClass=undefined
    expect(agentMatchesGate(agent, gate)).toBe(false)
  })

  it('어느 필드도 일치하지 않으면 false', () => {
    const agent = makeAgent({ id: 'pm', displayName: 'PM', phaseClass: 'pm' })
    const gate = makeGate('dev')
    expect(agentMatchesGate(agent, gate)).toBe(false)
  })

  it('gate.phase 가 agent.displayName 과 대소문자 불일치 시 false (엄격 비교)', () => {
    const agent = makeAgent({ id: 'qa-agent', displayName: 'QA' })
    const gate = makeGate('qa')
    expect(agentMatchesGate(agent, gate)).toBe(false)
  })
})

// ─────────────────────────────────────────────
// findGateForAgent
// ─────────────────────────────────────────────

describe('findGateForAgent', () => {
  const gates: HarnessGate[] = [
    makeGate('dev', { ruleCodes: ['R505', 'R530'], blocking: true }),
    makeGate('qa', { ruleCodes: ['R601'], blocking: false }),
    makeGate('release', { ruleCodes: ['R701'], blocking: true })
  ]

  it('displayName 으로 매칭된 게이트를 반환한다', () => {
    const agent = makeAgent({ id: 'rbmad-dev', displayName: 'dev' })
    const result = findGateForAgent(agent, gates)
    expect(result?.phase).toBe('dev')
    expect(result?.ruleCodes).toEqual(['R505', 'R530'])
  })

  it('phaseClass 로 매칭된 게이트를 반환한다', () => {
    const agent = makeAgent({ id: 'rbmad-qa-agent', displayName: 'quality-assurance', phaseClass: 'qa' })
    const result = findGateForAgent(agent, gates)
    expect(result?.phase).toBe('qa')
  })

  it('매칭 게이트 없으면 undefined 반환', () => {
    const agent = makeAgent({ id: 'orchestrator', displayName: 'orchestrator', phaseClass: 'orchestrator' })
    const result = findGateForAgent(agent, gates)
    expect(result).toBeUndefined()
  })

  it('빈 게이트 목록에서는 항상 undefined', () => {
    const agent = makeAgent({ id: 'dev', displayName: 'dev' })
    expect(findGateForAgent(agent, [])).toBeUndefined()
  })

  it('여러 게이트가 매칭될 경우 첫 번째를 반환한다', () => {
    const dupGates: HarnessGate[] = [
      makeGate('dev', { ruleCodes: ['R505'] }),
      makeGate('dev', { ruleCodes: ['R999'] })
    ]
    const agent = makeAgent({ id: 'dev', displayName: 'dev' })
    const result = findGateForAgent(agent, dupGates)
    expect(result?.ruleCodes).toEqual(['R505'])
  })
})
