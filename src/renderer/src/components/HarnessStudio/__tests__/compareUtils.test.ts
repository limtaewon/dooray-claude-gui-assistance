import { describe, it, expect } from 'vitest'
import {
  diffAgentFields,
  diffAgents,
  diffLevelChains,
  diffGates,
  diffScores,
  diffModels
} from '../views/compareUtils'
import type { HarnessModel, HarnessAgent } from '@shared/types/harness'

// ─────────────────────────────────────────────
// 팩토리 헬퍼
// ─────────────────────────────────────────────

function makeAgent(overrides: Partial<HarnessAgent> & { id: string }): HarnessAgent {
  return {
    id: overrides.id,
    displayName: overrides.displayName ?? overrides.id,
    role: overrides.role ?? 'dev role',
    model: overrides.model ?? 'sonnet',
    modelSource: overrides.modelSource ?? 'static',
    tools: overrides.tools ?? [],
    reads: overrides.reads ?? [],
    writes: overrides.writes ?? [],
    phaseClass: overrides.phaseClass,
    riskNote: overrides.riskNote
  }
}

function makeModel(overrides?: Partial<HarnessModel>): HarnessModel {
  return {
    schemaVersion: 1,
    meta: {
      name: overrides?.meta?.name ?? 'test',
      source: overrides?.meta?.source ?? '/test',
      bundleHash: 'abc',
      kind: 'bundle'
    },
    agents: overrides?.agents ?? [],
    levels: overrides?.levels ?? [],
    triage: { questions: [], rules: [] },
    artifacts: overrides?.artifacts ?? [],
    controlFlow: overrides?.controlFlow ?? { gates: [], hooks: [], parallelGroups: [], loops: [] },
    warnings: [],
    provenance: {},
    score: overrides?.score
  }
}

// ─────────────────────────────────────────────
// diffAgentFields
// ─────────────────────────────────────────────

describe('diffAgentFields', () => {
  it('동일 에이전트면 빈 배열 반환', () => {
    const a = makeAgent({ id: 'dev', model: 'sonnet', role: 'developer' })
    expect(diffAgentFields(a, { ...a })).toHaveLength(0)
  })

  it('model 변경 감지', () => {
    const left = makeAgent({ id: 'dev', model: 'sonnet' })
    const right = makeAgent({ id: 'dev', model: 'opus' })
    expect(diffAgentFields(left, right)).toContain('model')
  })

  it('role 변경 감지', () => {
    const left = makeAgent({ id: 'dev', role: 'developer' })
    const right = makeAgent({ id: 'dev', role: 'senior developer' })
    expect(diffAgentFields(left, right)).toContain('role')
  })

  it('tools 변경 감지', () => {
    const left = makeAgent({ id: 'dev', tools: ['Read', 'Edit'] })
    const right = makeAgent({ id: 'dev', tools: ['Read', 'Edit', 'Bash'] })
    expect(diffAgentFields(left, right)).toContain('tools')
  })
})

// ─────────────────────────────────────────────
// diffAgents
// ─────────────────────────────────────────────

describe('diffAgents', () => {
  it('동일 에이전트면 unchanged', () => {
    const agent = makeAgent({ id: 'dev', model: 'sonnet' })
    const left = makeModel({ agents: [agent] })
    const right = makeModel({ agents: [{ ...agent }] })
    const diffs = diffAgents(left, right)
    expect(diffs.find((d) => d.id === 'dev')?.status).toBe('unchanged')
  })

  it('right 에만 있으면 added', () => {
    const left = makeModel({ agents: [makeAgent({ id: 'dev' })] })
    const right = makeModel({ agents: [makeAgent({ id: 'dev' }), makeAgent({ id: 'qa' })] })
    const diffs = diffAgents(left, right)
    expect(diffs.find((d) => d.id === 'qa')?.status).toBe('added')
  })

  it('left 에만 있으면 removed', () => {
    const left = makeModel({ agents: [makeAgent({ id: 'dev' }), makeAgent({ id: 'qa' })] })
    const right = makeModel({ agents: [makeAgent({ id: 'dev' })] })
    const diffs = diffAgents(left, right)
    expect(diffs.find((d) => d.id === 'qa')?.status).toBe('removed')
  })

  it('변경된 에이전트는 changed + changedFields', () => {
    const left = makeModel({ agents: [makeAgent({ id: 'dev', model: 'sonnet' })] })
    const right = makeModel({ agents: [makeAgent({ id: 'dev', model: 'opus' })] })
    const diffs = diffAgents(left, right)
    const diff = diffs.find((d) => d.id === 'dev')
    expect(diff?.status).toBe('changed')
    expect(diff?.changedFields).toContain('model')
  })

  it('결과는 added → removed → changed → unchanged 순서', () => {
    const left = makeModel({
      agents: [makeAgent({ id: 'dev', model: 'sonnet' }), makeAgent({ id: 'old' })]
    })
    const right = makeModel({
      agents: [makeAgent({ id: 'dev', model: 'opus' }), makeAgent({ id: 'new' })]
    })
    const diffs = diffAgents(left, right)
    const statusOrder = diffs.map((d) => d.status)
    const addedIdx = statusOrder.indexOf('added')
    const removedIdx = statusOrder.indexOf('removed')
    const changedIdx = statusOrder.indexOf('changed')
    expect(addedIdx).toBeLessThan(removedIdx)
    expect(removedIdx).toBeLessThan(changedIdx)
  })
})

// ─────────────────────────────────────────────
// diffLevelChains
// ─────────────────────────────────────────────

describe('diffLevelChains', () => {
  it('동일 체인이면 unchanged', () => {
    const level = { id: 'L0' as const, name: 'L0', agentChain: ['dev', 'qa'], requiredArtifacts: [] }
    const left = makeModel({ levels: [level] })
    const right = makeModel({ levels: [{ ...level }] })
    const diffs = diffLevelChains(left, right)
    expect(diffs.find((d) => d.levelId === 'L0')?.status).toBe('unchanged')
  })

  it('체인이 변경되면 changed + addedAgents/removedAgents', () => {
    const left = makeModel({ levels: [{ id: 'L0' as const, name: 'L0', agentChain: ['dev', 'qa'], requiredArtifacts: [] }] })
    const right = makeModel({ levels: [{ id: 'L0' as const, name: 'L0', agentChain: ['dev', 'qa', 'security'], requiredArtifacts: [] }] })
    const diffs = diffLevelChains(left, right)
    const diff = diffs.find((d) => d.levelId === 'L0')
    expect(diff?.status).toBe('changed')
    expect(diff?.addedAgents).toContain('security')
    expect(diff?.removedAgents).toHaveLength(0)
  })

  it('right 에만 있는 레벨은 added', () => {
    const left = makeModel({ levels: [] })
    const right = makeModel({ levels: [{ id: 'L2' as const, name: 'L2', agentChain: ['dev'], requiredArtifacts: [] }] })
    const diffs = diffLevelChains(left, right)
    expect(diffs.find((d) => d.levelId === 'L2')?.status).toBe('added')
  })
})

// ─────────────────────────────────────────────
// diffGates
// ─────────────────────────────────────────────

describe('diffGates', () => {
  it('동일 게이트면 unchanged', () => {
    const gate = { phase: 'developer', ruleCodes: ['R501'], blocking: true }
    const left = makeModel({ controlFlow: { gates: [gate], hooks: [], parallelGroups: [], loops: [] } })
    const right = makeModel({ controlFlow: { gates: [{ ...gate }], hooks: [], parallelGroups: [], loops: [] } })
    const diffs = diffGates(left, right)
    expect(diffs.find((d) => d.phase === 'developer')?.status).toBe('unchanged')
  })

  it('blocking 변경 감지', () => {
    const left = makeModel({ controlFlow: { gates: [{ phase: 'dev', ruleCodes: [], blocking: true }], hooks: [], parallelGroups: [], loops: [] } })
    const right = makeModel({ controlFlow: { gates: [{ phase: 'dev', ruleCodes: [], blocking: false }], hooks: [], parallelGroups: [], loops: [] } })
    const diff = diffGates(left, right).find((d) => d.phase === 'dev')
    expect(diff?.status).toBe('changed')
    expect(diff?.blockingChanged).toBe(true)
  })

  it('ruleCodes 변경 감지', () => {
    const left = makeModel({ controlFlow: { gates: [{ phase: 'dev', ruleCodes: ['R501'], blocking: true }], hooks: [], parallelGroups: [], loops: [] } })
    const right = makeModel({ controlFlow: { gates: [{ phase: 'dev', ruleCodes: ['R501', 'R502'], blocking: true }], hooks: [], parallelGroups: [], loops: [] } })
    const diff = diffGates(left, right).find((d) => d.phase === 'dev')
    expect(diff?.ruleCodesChanged).toBe(true)
  })
})

// ─────────────────────────────────────────────
// diffScores
// ─────────────────────────────────────────────

describe('diffScores', () => {
  it('두 모델 모두 score 없으면 axes 빈 배열, totalDelta undefined', () => {
    const left = makeModel()
    const right = makeModel()
    const { axes, totalDelta } = diffScores(left, right)
    expect(axes).toHaveLength(0)
    expect(totalDelta).toBeUndefined()
  })

  it('delta 계산 — right 가 더 높으면 양수', () => {
    const left = makeModel({ score: { axes: [{ key: 'enforcement', value: 5, max: 10 }], total: 5 } })
    const right = makeModel({ score: { axes: [{ key: 'enforcement', value: 8, max: 10 }], total: 8 } })
    const { axes, totalDelta } = diffScores(left, right)
    expect(axes[0].delta).toBeGreaterThan(0)
    expect(totalDelta).toBe(3)
  })

  it('delta 계산 — right 가 더 낮으면 음수', () => {
    const left = makeModel({ score: { axes: [{ key: 'enforcement', value: 8, max: 10 }], total: 8 } })
    const right = makeModel({ score: { axes: [{ key: 'enforcement', value: 3, max: 10 }], total: 3 } })
    const { axes } = diffScores(left, right)
    expect(axes[0].delta).toBeLessThan(0)
  })
})

// ─────────────────────────────────────────────
// diffModels — 통합
// ─────────────────────────────────────────────

describe('diffModels', () => {
  it('동일 모델이면 summary 모두 0', () => {
    const model = makeModel({
      agents: [makeAgent({ id: 'dev' })],
      levels: [{ id: 'L0' as const, name: 'L0', agentChain: ['dev'], requiredArtifacts: [] }]
    })
    const diff = diffModels(model, { ...model })
    expect(diff.summary.agentsAdded).toBe(0)
    expect(diff.summary.agentsRemoved).toBe(0)
    expect(diff.summary.agentsChanged).toBe(0)
    expect(diff.summary.levelsChanged).toBe(0)
  })

  it('leftName/rightName 이 설정된다', () => {
    const left = makeModel({ meta: { name: 'bundle-a', source: '/a', bundleHash: 'a', kind: 'bundle' } })
    const right = makeModel({ meta: { name: 'bundle-b', source: '/b', bundleHash: 'b', kind: 'bundle' } })
    const diff = diffModels(left, right)
    expect(diff.leftName).toBe('bundle-a')
    expect(diff.rightName).toBe('bundle-b')
  })

  it('에이전트 추가/제거가 summary 에 반영된다', () => {
    const left = makeModel({ agents: [makeAgent({ id: 'dev' }), makeAgent({ id: 'old-qa' })] })
    const right = makeModel({ agents: [makeAgent({ id: 'dev' }), makeAgent({ id: 'new-security' })] })
    const diff = diffModels(left, right)
    expect(diff.summary.agentsAdded).toBe(1)
    expect(diff.summary.agentsRemoved).toBe(1)
  })
})
