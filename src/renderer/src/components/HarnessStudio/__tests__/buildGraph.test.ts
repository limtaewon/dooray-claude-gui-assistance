import { describe, it, expect } from 'vitest'
import { buildGraph } from '../flow/buildGraph'
import type { BuildGraphResult, AgentNodeData, GateNodeData } from '../flow/buildGraph'
import type { HarnessModel, HarnessAgent, HarnessLevel, HarnessLevelId } from '@shared/types/harness'

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

function makeLevel(id: HarnessLevelId, agentChain: string[], parallelInChain?: string[][]): HarnessLevel {
  return {
    id,
    name: `Level ${id}`,
    agentChain,
    parallelInChain,
    requiredArtifacts: []
  }
}

function makeModel(overrides?: Partial<HarnessModel>): HarnessModel {
  return {
    schemaVersion: 1,
    meta: {
      name: 'test-bundle',
      source: '/test',
      bundleHash: 'abc123',
      kind: 'bundle'
    },
    agents: overrides?.agents ?? [],
    levels: overrides?.levels ?? [],
    triage: { questions: [], rules: [] },
    artifacts: overrides?.artifacts ?? [],
    controlFlow: overrides?.controlFlow ?? {
      gates: [],
      hooks: [],
      parallelGroups: [],
      loops: []
    },
    overlay: overrides?.overlay,
    warnings: [],
    provenance: {}
  }
}

// ─────────────────────────────────────────────
// buildGraph — 기본 동작
// ─────────────────────────────────────────────

describe('buildGraph — 빈 모델 degradation', () => {
  it('에이전트가 없으면 빈 nodes/edges 반환', () => {
    const model = makeModel()
    const result = buildGraph(model, 'L0')
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
  })

  it('levelId가 null 이면 모든 에이전트가 dimmed', () => {
    const model = makeModel({
      agents: [makeAgent({ id: 'a1' }), makeAgent({ id: 'a2' })]
    })
    const result = buildGraph(model, null)
    for (const node of result.nodes) {
      const data = node.data as AgentNodeData
      expect(data.dimmed).toBe(true)
    }
  })
})

describe('buildGraph — L0 단순 체인', () => {
  const agents = [
    makeAgent({ id: 'analyst', displayName: 'analyst', phaseClass: 'analyst' }),
    makeAgent({ id: 'developer', displayName: 'developer', phaseClass: 'dev' }),
    makeAgent({ id: 'qa', displayName: 'qa', phaseClass: 'qa' })
  ]
  const levels = [
    makeLevel('L0', ['analyst', 'developer', 'qa'])
  ]
  const model = makeModel({ agents, levels })

  it('활성 체인 노드가 생성된다', () => {
    const result = buildGraph(model, 'L0')
    const agentNodes = result.nodes.filter((n) => n.type === 'agentNode')
    const activeIds = agentNodes
      .filter((n) => !(n.data as AgentNodeData).dimmed)
      .map((n) => (n.data as AgentNodeData).agentId)
    expect(activeIds).toContain('analyst')
    expect(activeIds).toContain('developer')
    expect(activeIds).toContain('qa')
  })

  it('순차 엣지가 체인 길이 - 1 만큼 생성된다', () => {
    const result = buildGraph(model, 'L0')
    // return 루프 없고 게이트 없으므로 직접 엣지만
    const sequentialEdges = result.edges.filter(
      (e) => !e.id.includes('return') && !e.id.includes('gate')
    )
    expect(sequentialEdges.length).toBeGreaterThanOrEqual(2)
  })

  it('활성 체인 노드는 dimmed=false', () => {
    const result = buildGraph(model, 'L0')
    for (const agentId of ['analyst', 'developer', 'qa']) {
      const node = result.nodes.find((n) => n.id === agentId)
      expect(node).toBeDefined()
      expect((node!.data as AgentNodeData).dimmed).toBe(false)
    }
  })

  it('엣지 source/target 이 실제 노드 id 와 일치', () => {
    const result = buildGraph(model, 'L0')
    const nodeIds = new Set(result.nodes.map((n) => n.id))
    for (const edge of result.edges) {
      expect(nodeIds.has(edge.source), `source ${edge.source} 미존재`).toBe(true)
      expect(nodeIds.has(edge.target), `target ${edge.target} 미존재`).toBe(true)
    }
  })
})

describe('buildGraph — 레벨 간 활성/비활성 분리', () => {
  const agents = [
    makeAgent({ id: 'analyst' }),
    makeAgent({ id: 'developer' }),
    makeAgent({ id: 'qa' }),
    makeAgent({ id: 'security', phaseClass: 'security' })
  ]
  const levels = [
    makeLevel('L0', ['analyst', 'developer']),
    makeLevel('L1', ['analyst', 'developer', 'qa']),
    makeLevel('L2', ['analyst', 'developer', 'qa', 'security'])
  ]
  const model = makeModel({ agents, levels })

  it('L0 활성 — security 는 dimmed', () => {
    const result = buildGraph(model, 'L0')
    const secNode = result.nodes.find((n) => n.id === 'security')
    expect(secNode).toBeDefined()
    expect((secNode!.data as AgentNodeData).dimmed).toBe(true)
  })

  it('L2 활성 — 모든 에이전트가 dimmed=false', () => {
    const result = buildGraph(model, 'L2')
    const dimmedNodes = result.nodes.filter(
      (n) => n.type === 'agentNode' && (n.data as AgentNodeData).dimmed
    )
    expect(dimmedNodes).toHaveLength(0)
  })

  it('레벨이 없으면 모든 에이전트 dimmed', () => {
    const result = buildGraph(model, 'L3')
    const activeNodes = result.nodes.filter(
      (n) => n.type === 'agentNode' && !(n.data as AgentNodeData).dimmed
    )
    expect(activeNodes).toHaveLength(0)
  })
})

describe('buildGraph — 병렬 그룹(parallelInChain)', () => {
  const agents = [
    makeAgent({ id: 'dev', phaseClass: 'dev' }),
    makeAgent({ id: 'qa', phaseClass: 'qa' }),
    makeAgent({ id: 'security', phaseClass: 'security' }),
    makeAgent({ id: 'release', phaseClass: 'release' })
  ]
  const levels = [
    makeLevel('L2', ['dev', 'qa', 'security', 'release'], [['qa', 'security']])
  ]
  const model = makeModel({ agents, levels })

  it('병렬 그룹 에이전트(qa, security)는 같은 X 컬럼에 배치된다', () => {
    const result = buildGraph(model, 'L2')
    const qaNode = result.nodes.find((n) => n.id === 'qa')
    const secNode = result.nodes.find((n) => n.id === 'security')
    expect(qaNode).toBeDefined()
    expect(secNode).toBeDefined()
    // 같은 컬럼 = 같은 X 좌표
    expect(qaNode!.position.x).toBe(secNode!.position.x)
  })

  it('병렬 그룹 내 에이전트끼리는 직접 엣지가 생성되지 않는다', () => {
    const result = buildGraph(model, 'L2')
    const qaSecEdge = result.edges.find(
      (e) =>
        (e.source === 'qa' && e.target === 'security') ||
        (e.source === 'security' && e.target === 'qa')
    )
    expect(qaSecEdge).toBeUndefined()
  })

  it('병렬 그룹 에이전트는 Y 방향으로 다른 위치에 배치된다', () => {
    const result = buildGraph(model, 'L2')
    const qaNode = result.nodes.find((n) => n.id === 'qa')
    const secNode = result.nodes.find((n) => n.id === 'security')
    expect(qaNode!.position.y).not.toBe(secNode!.position.y)
  })
})

describe('buildGraph — QA RETURN 루프', () => {
  const agents = [
    makeAgent({ id: 'developer', phaseClass: 'dev' }),
    makeAgent({ id: 'qa-agent', displayName: 'qa', phaseClass: 'qa' })
  ]
  const levels = [makeLevel('L1', ['developer', 'qa-agent'])]
  const controlFlowWithLoop = {
    gates: [],
    hooks: [],
    parallelGroups: [],
    loops: ['QA RETURN 루프 3회 → SM 에스컬레이션']
  }
  const model = makeModel({ agents, levels, controlFlow: controlFlowWithLoop })

  it('loops 에 RETURN 이 포함되면 복귀 엣지가 생성된다', () => {
    const result = buildGraph(model, 'L1')
    const returnEdge = result.edges.find((e) => e.data?.returnLoop === true)
    expect(returnEdge).toBeDefined()
  })

  it('복귀 엣지의 source 는 qa 에이전트, target 은 dev 에이전트', () => {
    const result = buildGraph(model, 'L1')
    const returnEdge = result.edges.find((e) => e.data?.returnLoop === true)
    expect(returnEdge?.source).toBe('qa-agent')
    expect(returnEdge?.target).toBe('developer')
  })

  it('loops 가 비어있으면 복귀 엣지가 없다', () => {
    const modelNoLoop = makeModel({ agents, levels })
    const result = buildGraph(modelNoLoop, 'L1')
    const returnEdge = result.edges.find((e) => e.data?.returnLoop === true)
    expect(returnEdge).toBeUndefined()
  })
})

describe('buildGraph — 게이트 노드', () => {
  const agents = [
    makeAgent({ id: 'developer', displayName: 'developer' }),
    makeAgent({ id: 'qa', displayName: 'qa' })
  ]
  const levels = [makeLevel('L1', ['developer', 'qa'])]
  const gates = [
    {
      phase: 'developer',
      ruleCodes: ['R501', 'R502'],
      description: '개발 완료 게이트',
      blocking: true
    }
  ]
  const model = makeModel({ agents, levels, controlFlow: { gates, hooks: [], parallelGroups: [], loops: [] } })

  it('게이트 노드가 생성된다', () => {
    const result = buildGraph(model, 'L1')
    const gateNodes = result.nodes.filter((n) => n.type === 'gateNode')
    expect(gateNodes.length).toBeGreaterThanOrEqual(1)
  })

  it('게이트 노드 data 에 ruleCodes 가 포함된다', () => {
    const result = buildGraph(model, 'L1')
    const gateNode = result.nodes.find((n) => n.type === 'gateNode')
    const data = gateNode?.data as GateNodeData
    expect(data?.ruleCodes).toContain('R501')
    expect(data?.ruleCodes).toContain('R502')
  })

  it('게이트 노드 data 에 blocking=true 가 반영된다', () => {
    const result = buildGraph(model, 'L1')
    const gateNode = result.nodes.find((n) => n.type === 'gateNode')
    expect((gateNode?.data as GateNodeData)?.blocking).toBe(true)
  })
})

describe('buildGraph — 산출물 라벨 엣지', () => {
  const agents = [
    makeAgent({ id: 'analyst' }),
    makeAgent({ id: 'developer' })
  ]
  const levels = [makeLevel('L1', ['analyst', 'developer'])]
  const artifacts = [
    {
      id: 'story',
      producer: 'analyst',
      consumers: ['developer'],
      persist: 'git' as const
    }
  ]
  const model = makeModel({ agents, levels, artifacts })

  it('producer → consumer 엣지에 산출물 라벨이 설정된다', () => {
    const result = buildGraph(model, 'L1')
    const edge = result.edges.find(
      (e) => e.source === 'analyst' && e.target === 'developer'
    )
    // 직접 엣지 또는 gate를 경유하는 경우 모두 허용
    if (edge) {
      expect(edge.data?.artifact).toBe('story')
    } else {
      // gate가 삽입된 경우 analyst→gate 다음 gate→developer 엣지에서 확인
      const gateToDevEdge = result.edges.find(
        (e) => e.target === 'developer' && e.data?.artifact === 'story'
      )
      expect(gateToDevEdge ?? edge).toBeDefined()
    }
  })
})

describe('buildGraph — L3 풀체인', () => {
  const agents = [
    makeAgent({ id: 'analyst', phaseClass: 'analyst' }),
    makeAgent({ id: 'pm', phaseClass: 'pm' }),
    makeAgent({ id: 'architect', phaseClass: 'architect' }),
    makeAgent({ id: 'developer', phaseClass: 'dev' }),
    makeAgent({ id: 'qa', phaseClass: 'qa' }),
    makeAgent({ id: 'security', phaseClass: 'security' }),
    makeAgent({ id: 'release', phaseClass: 'release' })
  ]
  const levels = [
    makeLevel('L0', ['developer', 'qa']),
    makeLevel('L1', ['analyst', 'developer', 'qa']),
    makeLevel('L2', ['analyst', 'architect', 'developer', 'qa']),
    makeLevel('L3', ['analyst', 'pm', 'architect', 'developer', 'qa', 'security', 'release'])
  ]
  const model = makeModel({ agents, levels })

  it('L3 에서 7개 에이전트 노드가 모두 active', () => {
    const result = buildGraph(model, 'L3')
    const activeNodes = result.nodes.filter(
      (n) => n.type === 'agentNode' && !(n.data as AgentNodeData).dimmed
    )
    expect(activeNodes).toHaveLength(7)
  })

  it('L0 에서 L3 비활성 에이전트는 dimmed', () => {
    const result = buildGraph(model, 'L0')
    const dimmedNodes = result.nodes.filter(
      (n) => n.type === 'agentNode' && (n.data as AgentNodeData).dimmed
    )
    // L0 체인: developer, qa → 나머지 5개 dimmed
    expect(dimmedNodes).toHaveLength(5)
  })

  it('노드 위치 x 는 음수가 아니다', () => {
    const result: BuildGraphResult = buildGraph(model, 'L3')
    for (const node of result.nodes) {
      expect(node.position.x, `node ${node.id} x < 0`).toBeGreaterThanOrEqual(0)
    }
  })

  it('모든 엣지 id 는 유니크하다', () => {
    const result = buildGraph(model, 'L3')
    const ids = result.edges.map((e) => e.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })
})

// ─────────────────────────────────────────────
// buildGraph — 오버레이 반영 (M8)
// ─────────────────────────────────────────────

describe('buildGraph — 오버레이 disabledAgents', () => {
  const agents = [
    makeAgent({ id: 'developer', displayName: 'developer', phaseClass: 'dev' }),
    makeAgent({ id: 'qa', displayName: 'qa', phaseClass: 'qa' }),
    makeAgent({ id: 'security', displayName: 'security', phaseClass: 'security' })
  ]
  const levels = [makeLevel('L2', ['developer', 'qa', 'security'])]
  const overlay = {
    domains: [],
    modelOverrides: {},
    disabledAgents: ['security']
  }
  const model = makeModel({ agents, levels, overlay })

  it('disabledAgents 에이전트는 overlayDisabled=true 로 마킹된다', () => {
    const result = buildGraph(model, 'L2', undefined, true)
    const secNode = result.nodes.find((n) => n.id === 'security')
    expect(secNode).toBeDefined()
    expect((secNode!.data as AgentNodeData).overlayDisabled).toBe(true)
  })

  it('disabledAgents 에이전트는 활성 체인 엣지에서 제외된다', () => {
    const result = buildGraph(model, 'L2', undefined, true)
    // security 가 체인에 없으므로 qa→security 엣지 없어야 함
    const edgeToSecurity = result.edges.find(
      (e) => e.target === 'security' && !e.id.includes('gate')
    )
    expect(edgeToSecurity).toBeUndefined()
  })

  it('overlayEnabled=false 이면 disabledAgents 무시', () => {
    const result = buildGraph(model, 'L2', undefined, false)
    const secNode = result.nodes.find((n) => n.id === 'security')
    expect((secNode!.data as AgentNodeData).overlayDisabled).toBe(false)
  })
})

describe('buildGraph — 오버레이 modelOverrides', () => {
  const agents = [
    makeAgent({ id: 'developer', model: 'sonnet' }),
    makeAgent({ id: 'qa', model: 'haiku' })
  ]
  const levels = [makeLevel('L1', ['developer', 'qa'])]
  const overlay = {
    domains: [],
    modelOverrides: { developer: 'opus' as const },
    disabledAgents: []
  }
  const model = makeModel({ agents, levels, overlay })

  it('modelOverride 가 있는 에이전트는 오버라이드 model 로 노드 data 설정', () => {
    const result = buildGraph(model, 'L1', undefined, true)
    const devNode = result.nodes.find((n) => n.id === 'developer')
    expect((devNode!.data as AgentNodeData).model).toBe('opus')
  })

  it('오버라이드 에이전트는 originalModel 이 원본 model 을 가진다', () => {
    const result = buildGraph(model, 'L1', undefined, true)
    const devNode = result.nodes.find((n) => n.id === 'developer')
    expect((devNode!.data as AgentNodeData).originalModel).toBe('sonnet')
  })

  it('오버라이드 없는 에이전트는 originalModel 이 undefined', () => {
    const result = buildGraph(model, 'L1', undefined, true)
    const qaNode = result.nodes.find((n) => n.id === 'qa')
    expect((qaNode!.data as AgentNodeData).originalModel).toBeUndefined()
  })
})

// ─────────────────────────────────────────────
// buildGraph — highlightPath (H1 회귀 방지)
// ─────────────────────────────────────────────

describe('buildGraph — highlightPath 하이라이트/흐림 처리', () => {
  const agents = [
    makeAgent({ id: 'analyst', phaseClass: 'analyst' }),
    makeAgent({ id: 'developer', phaseClass: 'dev' }),
    makeAgent({ id: 'qa', phaseClass: 'qa' })
  ]
  const levels = [makeLevel('L1', ['analyst', 'developer', 'qa'])]
  const model = makeModel({ agents, levels })

  it('highlightPath 에 포함된 에이전트는 highlighted=true', () => {
    const result = buildGraph(model, 'L1', ['developer'])
    const devNode = result.nodes.find((n) => n.id === 'developer')
    expect((devNode!.data as AgentNodeData).highlighted).toBe(true)
  })

  it('highlightPath 에 없는 활성 체인 에이전트는 dimmed=true', () => {
    const result = buildGraph(model, 'L1', ['developer'])
    const analystNode = result.nodes.find((n) => n.id === 'analyst')
    const qaNode = result.nodes.find((n) => n.id === 'qa')
    expect((analystNode!.data as AgentNodeData).dimmed).toBe(true)
    expect((qaNode!.data as AgentNodeData).dimmed).toBe(true)
  })

  it('highlightPath 가 없으면 활성 체인 에이전트는 모두 highlighted=false, dimmed=false', () => {
    const result = buildGraph(model, 'L1', undefined)
    for (const agentId of ['analyst', 'developer', 'qa']) {
      const node = result.nodes.find((n) => n.id === agentId)
      expect((node!.data as AgentNodeData).highlighted).toBe(false)
      expect((node!.data as AgentNodeData).dimmed).toBe(false)
    }
  })

  it('빈 highlightPath 배열은 highlightPath 없음과 동일하게 동작한다', () => {
    const result = buildGraph(model, 'L1', [])
    for (const agentId of ['analyst', 'developer', 'qa']) {
      const node = result.nodes.find((n) => n.id === agentId)
      expect((node!.data as AgentNodeData).highlighted).toBe(false)
      expect((node!.data as AgentNodeData).dimmed).toBe(false)
    }
  })

  it('highlightPath 에 여러 에이전트를 지정하면 모두 highlighted=true', () => {
    const result = buildGraph(model, 'L1', ['analyst', 'qa'])
    const analystNode = result.nodes.find((n) => n.id === 'analyst')
    const qaNode = result.nodes.find((n) => n.id === 'qa')
    const devNode = result.nodes.find((n) => n.id === 'developer')
    expect((analystNode!.data as AgentNodeData).highlighted).toBe(true)
    expect((qaNode!.data as AgentNodeData).highlighted).toBe(true)
    expect((devNode!.data as AgentNodeData).dimmed).toBe(true)
  })
})

// ─────────────────────────────────────────────
// buildGraph — overlayEnabled=false (H2 회귀 방지)
// ─────────────────────────────────────────────

describe('buildGraph — overlayEnabled=false 시 오버레이 미적용', () => {
  const agents = [
    makeAgent({ id: 'developer', model: 'sonnet' }),
    makeAgent({ id: 'qa', model: 'haiku' }),
    makeAgent({ id: 'security', phaseClass: 'security' })
  ]
  const levels = [makeLevel('L2', ['developer', 'qa', 'security'])]
  const overlay = {
    domains: [],
    modelOverrides: { developer: 'opus' as const },
    disabledAgents: ['security']
  }
  const model = makeModel({ agents, levels, overlay })

  it('overlayEnabled=false 이면 disabledAgents 가 overlayDisabled=false 로 유지된다', () => {
    const result = buildGraph(model, 'L2', undefined, false)
    const secNode = result.nodes.find((n) => n.id === 'security')
    expect((secNode!.data as AgentNodeData).overlayDisabled).toBe(false)
  })

  it('overlayEnabled=false 이면 modelOverrides 가 적용되지 않는다', () => {
    const result = buildGraph(model, 'L2', undefined, false)
    const devNode = result.nodes.find((n) => n.id === 'developer')
    // 오버레이 미적용 → 원본 sonnet 유지
    expect((devNode!.data as AgentNodeData).model).toBe('sonnet')
    expect((devNode!.data as AgentNodeData).originalModel).toBeUndefined()
  })

  it('overlayEnabled=true 이면 modelOverrides 가 적용된다', () => {
    const result = buildGraph(model, 'L2', undefined, true)
    const devNode = result.nodes.find((n) => n.id === 'developer')
    expect((devNode!.data as AgentNodeData).model).toBe('opus')
  })
})
