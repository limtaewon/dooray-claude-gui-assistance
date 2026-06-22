import { describe, it, expect } from 'vitest'
import {
  checkOrphanAgents,
  checkUndefinedChainAgents,
  checkUnclaimedOutputs,
  checkMissingProducers,
  checkGatePhaseAlignment,
  checkUnknownModels,
  checkScoreCoverage,
  buildWeakAxesSummary,
  runDoctorChecks
} from '../views/doctorUtils'
import type { HarnessModel, HarnessAgent, HarnessArtifact } from '@shared/types/harness'

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
    riskNote: overrides.riskNote
  }
}

function makeArtifact(overrides: Partial<HarnessArtifact> & { id: string }): HarnessArtifact {
  return {
    id: overrides.id,
    producer: overrides.producer,
    consumers: overrides.consumers ?? [],
    persist: overrides.persist ?? 'git'
  }
}

function makeModel(overrides?: Partial<HarnessModel>): HarnessModel {
  return {
    schemaVersion: 1,
    meta: { name: 'test', source: '/test', bundleHash: 'abc', kind: 'bundle' },
    agents: overrides?.agents ?? [],
    levels: overrides?.levels ?? [],
    triage: { questions: [], rules: [] },
    artifacts: overrides?.artifacts ?? [],
    controlFlow: overrides?.controlFlow ?? { gates: [], hooks: [], parallelGroups: [], loops: [] },
    warnings: overrides?.warnings ?? [],
    provenance: {},
    score: overrides?.score
  }
}

// ─────────────────────────────────────────────
// checkOrphanAgents
// ─────────────────────────────────────────────

describe('checkOrphanAgents', () => {
  it('레벨이 없으면 WARN 반환', () => {
    const model = makeModel({ agents: [makeAgent({ id: 'dev' })] })
    const result = checkOrphanAgents(model)
    expect(result.severity).toBe('WARN')
  })

  it('모든 에이전트가 체인에 포함되면 PASS', () => {
    const model = makeModel({
      agents: [makeAgent({ id: 'dev' }), makeAgent({ id: 'qa' })],
      levels: [{ id: 'L0', name: 'L0', agentChain: ['dev', 'qa'], requiredArtifacts: [] }]
    })
    expect(checkOrphanAgents(model).severity).toBe('PASS')
  })

  it('체인에 없는 에이전트가 있으면 WARN + items 반환', () => {
    const model = makeModel({
      agents: [makeAgent({ id: 'dev' }), makeAgent({ id: 'security' })],
      levels: [{ id: 'L0', name: 'L0', agentChain: ['dev'], requiredArtifacts: [] }]
    })
    const result = checkOrphanAgents(model)
    expect(result.severity).toBe('WARN')
    expect(result.items).toContain('security')
  })
})

// ─────────────────────────────────────────────
// checkUndefinedChainAgents
// ─────────────────────────────────────────────

describe('checkUndefinedChainAgents', () => {
  it('레벨이 없으면 PASS', () => {
    const model = makeModel({ agents: [makeAgent({ id: 'dev' })] })
    expect(checkUndefinedChainAgents(model).severity).toBe('PASS')
  })

  it('체인에 정의된 에이전트만 있으면 PASS', () => {
    const model = makeModel({
      agents: [makeAgent({ id: 'dev' })],
      levels: [{ id: 'L0', name: 'L0', agentChain: ['dev'], requiredArtifacts: [] }]
    })
    expect(checkUndefinedChainAgents(model).severity).toBe('PASS')
  })

  it('체인에 미정의 에이전트가 있으면 FAIL + items', () => {
    const model = makeModel({
      agents: [makeAgent({ id: 'dev' })],
      levels: [{ id: 'L0', name: 'L0', agentChain: ['dev', 'ghost-agent'], requiredArtifacts: [] }]
    })
    const result = checkUndefinedChainAgents(model)
    expect(result.severity).toBe('FAIL')
    expect(result.items).toContain('ghost-agent')
  })
})

// ─────────────────────────────────────────────
// checkUnclaimedOutputs
// ─────────────────────────────────────────────

describe('checkUnclaimedOutputs', () => {
  it('소비자가 있으면 PASS', () => {
    const artifacts = [makeArtifact({ id: 'story', producer: 'analyst', consumers: ['developer'] })]
    expect(checkUnclaimedOutputs(artifacts).severity).toBe('PASS')
  })

  it('producer 있고 consumers 없으면 WARN', () => {
    const artifacts = [makeArtifact({ id: 'story', producer: 'analyst', consumers: [] })]
    const result = checkUnclaimedOutputs(artifacts)
    expect(result.severity).toBe('WARN')
    expect(result.items).toContain('story')
  })

  it('persist=dooray 는 외부 소비로 간주 — PASS', () => {
    const artifacts = [makeArtifact({ id: 'task', producer: 'dev', consumers: [], persist: 'dooray' })]
    expect(checkUnclaimedOutputs(artifacts).severity).toBe('PASS')
  })
})

// ─────────────────────────────────────────────
// checkMissingProducers
// ─────────────────────────────────────────────

describe('checkMissingProducers', () => {
  it('모든 산출물에 생산자 있으면 PASS', () => {
    const artifacts = [makeArtifact({ id: 'story', producer: 'analyst', consumers: [] })]
    expect(checkMissingProducers(artifacts).severity).toBe('PASS')
  })

  it('생산자 없고 소비자도 없으면 WARN', () => {
    const artifacts = [makeArtifact({ id: 'story', consumers: [] })]
    expect(checkMissingProducers(artifacts).severity).toBe('WARN')
  })

  it('생산자 없고 소비자 있으면 FAIL', () => {
    const artifacts = [makeArtifact({ id: 'story', consumers: ['developer'] })]
    const result = checkMissingProducers(artifacts)
    expect(result.severity).toBe('FAIL')
    expect(result.items).toContain('story')
  })
})

// ─────────────────────────────────────────────
// checkGatePhaseAlignment
// ─────────────────────────────────────────────

describe('checkGatePhaseAlignment', () => {
  it('게이트 없으면 PASS', () => {
    const model = makeModel()
    expect(checkGatePhaseAlignment(model).severity).toBe('PASS')
  })

  it('게이트 phase 가 에이전트 id 와 일치하면 PASS', () => {
    const model = makeModel({
      agents: [makeAgent({ id: 'developer', displayName: 'developer' })],
      controlFlow: {
        gates: [{ phase: 'developer', ruleCodes: [], blocking: true }],
        hooks: [], parallelGroups: [], loops: []
      }
    })
    expect(checkGatePhaseAlignment(model).severity).toBe('PASS')
  })

  it('게이트 phase 가 어떤 에이전트와도 불일치하면 FAIL', () => {
    const model = makeModel({
      agents: [makeAgent({ id: 'dev' })],
      controlFlow: {
        gates: [{ phase: 'unknown-phase', ruleCodes: [], blocking: true }],
        hooks: [], parallelGroups: [], loops: []
      }
    })
    const result = checkGatePhaseAlignment(model)
    expect(result.severity).toBe('FAIL')
    expect(result.items).toContain('unknown-phase')
  })
})

// ─────────────────────────────────────────────
// checkUnknownModels
// ─────────────────────────────────────────────

describe('checkUnknownModels', () => {
  it('모든 에이전트 model 이 확인되면 PASS', () => {
    const agents = [makeAgent({ id: 'dev', model: 'sonnet' })]
    expect(checkUnknownModels(agents).severity).toBe('PASS')
  })

  it('unknown 모델 에이전트 있으면 WARN + items', () => {
    const agents = [
      makeAgent({ id: 'dev', model: 'sonnet' }),
      makeAgent({ id: 'qa', model: 'unknown' })
    ]
    const result = checkUnknownModels(agents)
    expect(result.severity).toBe('WARN')
    expect(result.items).toContain('qa')
    expect(result.items).not.toContain('dev')
  })
})

// ─────────────────────────────────────────────
// checkScoreCoverage
// ─────────────────────────────────────────────

describe('checkScoreCoverage', () => {
  it('score 없으면 WARN', () => {
    const model = makeModel()
    expect(checkScoreCoverage(model).severity).toBe('WARN')
  })

  it('score.axes 비어있으면 WARN', () => {
    const model = makeModel({ score: { axes: [], total: 0 } })
    expect(checkScoreCoverage(model).severity).toBe('WARN')
  })

  it('정상 score 있으면 PASS', () => {
    const model = makeModel({
      score: {
        axes: [{ key: 'enforcement', value: 8, max: 10 }],
        total: 8
      }
    })
    expect(checkScoreCoverage(model).severity).toBe('PASS')
  })
})

// ─────────────────────────────────────────────
// buildWeakAxesSummary
// ─────────────────────────────────────────────

describe('buildWeakAxesSummary', () => {
  it('score 없으면 빈 배열', () => {
    const model = makeModel()
    expect(buildWeakAxesSummary(model)).toHaveLength(0)
  })

  it('점수 낮은 순으로 정렬된다', () => {
    const model = makeModel({
      score: {
        axes: [
          { key: 'enforcement', value: 9, max: 10 },
          { key: 'controlFlow', value: 2, max: 10 },
          { key: 'observability', value: 5, max: 10 }
        ],
        total: 16
      }
    })
    const summary = buildWeakAxesSummary(model)
    expect(summary[0].key).toBe('controlFlow')
    expect(summary[2].key).toBe('enforcement')
  })
})

// ─────────────────────────────────────────────
// runDoctorChecks — 통합
// ─────────────────────────────────────────────

describe('runDoctorChecks — 전체 정합 점검', () => {
  it('이상 없는 모델 → PASS 전체 통과', () => {
    const model = makeModel({
      agents: [makeAgent({ id: 'dev' }), makeAgent({ id: 'qa' })],
      levels: [{ id: 'L0', name: 'L0', agentChain: ['dev', 'qa'], requiredArtifacts: [] }],
      artifacts: [
        makeArtifact({ id: 'story', producer: 'dev', consumers: ['qa'] })
      ],
      controlFlow: {
        gates: [{ phase: 'dev', ruleCodes: ['R501'], blocking: true }],
        hooks: [], parallelGroups: [], loops: []
      },
      score: {
        axes: [{ key: 'enforcement', value: 8, max: 10 }],
        total: 8
      }
    })
    const report = runDoctorChecks(model)
    expect(report.failCount).toBe(0)
    expect(report.warnCount).toBe(0)
    expect(report.overallSeverity).toBe('PASS')
  })

  it('FAIL 이 있으면 overallSeverity=FAIL', () => {
    const model = makeModel({
      agents: [makeAgent({ id: 'dev' })],
      levels: [{ id: 'L0', name: 'L0', agentChain: ['dev', 'ghost'], requiredArtifacts: [] }]
    })
    const report = runDoctorChecks(model)
    expect(report.overallSeverity).toBe('FAIL')
    expect(report.failCount).toBeGreaterThan(0)
  })

  it('checks 배열은 7개 항목', () => {
    const model = makeModel()
    const report = runDoctorChecks(model)
    expect(report.checks).toHaveLength(7)
  })
})
