/**
 * buildGraph — HarnessModel + levelId → react-flow nodes/edges 변환 순수함수.
 *
 * 이 함수는 @xyflow/react 에 의존하지 않는 순수 데이터 변환이다.
 * 노드/엣지 타입 정의를 react-flow 없이도 테스트할 수 있도록
 * 필요한 형태의 인터페이스만 직접 정의한다.
 *
 * 레이아웃 전략:
 * - 에이전트 체인은 좌→우 단계 진행 (컬럼 배치).
 * - 병렬 그룹(parallelInChain) 은 같은 X 컬럼에 Y 방향으로 쌓는다.
 * - 게이트 노드는 해당 phase 에이전트 뒤 엣지 중간에 삽입.
 * - 활성 레벨 에이전트 외 나머지는 dimmed=true 로 흐림 처리.
 *
 * QA RETURN 루프 규칙:
 * - controlFlow.loops 에 "RETURN" 키워드가 포함된 루프가 있으면
 *   qa → dev (또는 체인 첫 번째 노드) 방향으로 복귀 엣지를 생성한다.
 *
 * highlightPath 규칙 (M7 Dry-run 연동):
 * - highlightPath 가 주어지면 해당 에이전트 노드는 highlighted=true,
 *   나머지 활성 체인 노드는 dimmed=true 로 처리한다(강조/흐림 대비).
 * - highlightPath 가 비어있거나 undefined 이면 기존 dimmed 로직만 동작한다.
 */

import type { HarnessModel, HarnessAgent, HarnessGate, HarnessLevelId } from '@shared/types/harness'

// ─────────────────────────────────────────────
// 노드/엣지 데이터 타입 (react-flow 독립)
// ─────────────────────────────────────────────

export interface AgentNodeData extends Record<string, unknown> {
  type: 'agent'
  agentId: string
  displayName: string
  role: string
  model: string
  modelSource: string
  phaseClass: string
  tools: string[]
  riskNote?: string
  escalation?: string
  dimmed: boolean
  /**
   * Dry-run 하이라이트 경로에 포함된 에이전트 여부 (M7).
   * true 이면 강조, 나머지 비하이라이트 활성 에이전트는 dimmed=true 처리된다.
   * highlightPath 가 없으면 항상 false.
   */
  highlighted: boolean
}

export interface GateNodeData extends Record<string, unknown> {
  type: 'gate'
  phase: string
  ruleCodes: string[]
  description?: string
  blocking: boolean
  dimmed: boolean
}

export type NodeData = AgentNodeData | GateNodeData

export interface GraphNode {
  id: string
  type: 'agentNode' | 'gateNode'
  position: { x: number; y: number }
  data: AgentNodeData | GateNodeData
}

export interface EdgeData extends Record<string, unknown> {
  /** 핸드오프 산출물 라벨 — 산출물 producer/consumers 매핑에서 파생 */
  artifact?: string
  /** 조건부 핸드오프 여부 — 점선 처리 */
  conditional: boolean
  /** QA RETURN 루프 여부 — 곡선 + 회귀색 */
  returnLoop: boolean
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: 'handoffEdge'
  data: EdgeData
  /** 조건부=점선. react-flow 가 직접 읽는 prop */
  animated?: boolean
}

export interface BuildGraphResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ─────────────────────────────────────────────
// 레이아웃 상수
// ─────────────────────────────────────────────

const COL_WIDTH = 220
const ROW_HEIGHT = 100
const GATE_OFFSET_X = COL_WIDTH / 2
const GATE_NODE_HEIGHT = 44
const AGENT_NODE_HEIGHT = 80
const START_X = 40
const START_Y = 60

// ─────────────────────────────────────────────
// 헬퍼 함수
// ─────────────────────────────────────────────

/** agentChain 에서 병렬 그룹을 고려한 컬럼 인덱스 맵 생성 */
function buildColumnMap(
  agentChain: string[],
  parallelInChain: string[][] = []
): Map<string, number> {
  const colMap = new Map<string, number>()
  let col = 0

  // 병렬 그룹에 속한 에이전트 ID → 그룹 인덱스 맵
  const parallelGroupOf = new Map<string, number>()
  for (let g = 0; g < parallelInChain.length; g++) {
    for (const id of parallelInChain[g]) {
      parallelGroupOf.set(id, g)
    }
  }

  // 이미 배치된 병렬 그룹 추적
  const placedGroups = new Set<number>()

  for (const agentId of agentChain) {
    const gIdx = parallelGroupOf.get(agentId)
    if (gIdx !== undefined) {
      if (placedGroups.has(gIdx)) {
        // 같은 병렬 그룹 — 이미 배치된 컬럼 재사용
        const groupCol = colMap.get(parallelInChain[gIdx][0])
        colMap.set(agentId, groupCol ?? col)
      } else {
        // 새 병렬 그룹 첫 번째 — 현재 컬럼 할당
        for (const parallelId of parallelInChain[gIdx]) {
          colMap.set(parallelId, col)
        }
        placedGroups.add(gIdx)
        col++
      }
    } else {
      colMap.set(agentId, col)
      col++
    }
  }

  return colMap
}

/** 병렬 그룹 내 Y 오프셋 계산 */
function buildRowMap(
  agentChain: string[],
  parallelInChain: string[][] = []
): Map<string, number> {
  const rowMap = new Map<string, number>()
  const parallelGroupOf = new Map<string, number>()

  for (let g = 0; g < parallelInChain.length; g++) {
    for (const id of parallelInChain[g]) {
      parallelGroupOf.set(id, g)
    }
  }

  const groupRowCounts = new Map<number, number>()

  for (const agentId of agentChain) {
    const gIdx = parallelGroupOf.get(agentId)
    if (gIdx !== undefined) {
      const currentRow = groupRowCounts.get(gIdx) ?? 0
      rowMap.set(agentId, currentRow)
      groupRowCounts.set(gIdx, currentRow + 1)
    } else {
      rowMap.set(agentId, 0)
    }
  }

  return rowMap
}

/** 에이전트 ID → 핸드오프 산출물 라벨 (producer → consumer 간) */
function buildArtifactLabelMap(model: HarnessModel): Map<string, string> {
  const labelMap = new Map<string, string>()
  for (const artifact of model.artifacts) {
    if (artifact.producer) {
      labelMap.set(artifact.producer, artifact.id)
    }
  }
  return labelMap
}

/**
 * QA RETURN 루프 존재 여부 판별.
 * loops 배열 중 "RETURN" 키워드가 포함된 항목이 있으면 true.
 */
function hasReturnLoop(model: HarnessModel): boolean {
  return model.controlFlow.loops.some((loop) => loop.toUpperCase().includes('RETURN'))
}

// ─────────────────────────────────────────────
// 메인 함수
// ─────────────────────────────────────────────

/**
 * HarnessModel + levelId 를 받아 react-flow 노드/엣지 배열을 반환한다.
 *
 * - 지정된 levelId 의 agentChain 을 활성 경로로 취급한다.
 * - 활성 체인에 없는 에이전트도 dimmed=true 로 포함해 전체 구조를 표시한다.
 * - 게이트 노드는 blocking 게이트만 활성 체인 phase 에이전트 다음에 삽입한다.
 * - levelId 가 null/undefined 이거나 해당 레벨이 없으면 모든 에이전트를 dimmed 처리한다.
 * - highlightPath 가 주어지면 해당 에이전트만 highlighted=true,
 *   나머지 활성 체인 에이전트는 dimmed=true 로 처리(Dry-run 경로 강조).
 *
 * @param model - 정규화된 HarnessModel
 * @param levelId - 활성화할 레벨 식별자
 * @param highlightPath - Dry-run 결과 에이전트 ID 배열 (M7, optional)
 * @returns react-flow 노드/엣지 배열
 */
export function buildGraph(
  model: HarnessModel,
  levelId: HarnessLevelId | null,
  highlightPath?: string[]
): BuildGraphResult {
  // 빈 에이전트 체인 degradation
  if (model.agents.length === 0) {
    return { nodes: [], edges: [] }
  }

  const level = levelId ? model.levels.find((l) => l.id === levelId) ?? null : null
  const activeChain: string[] = level?.agentChain ?? []
  const parallelInChain = level?.parallelInChain ?? []
  const activeChainSet = new Set(activeChain)

  // ── 하이라이트 경로 집합 ──

  // highlightPath 가 주어지면 해당 에이전트만 highlighted=true,
  // 나머지 활성 체인 노드는 dimmed=true(흐림) 처리.
  // highlightPath 가 없거나 비어있으면 기존 로직(활성=밝음, 비활성=흐림).
  const highlightSet = highlightPath && highlightPath.length > 0
    ? new Set(highlightPath)
    : null

  // ── 노드 생성 ──

  // 활성 체인에 속한 에이전트 먼저 배치, 나머지는 우측에 흐림으로 표시
  const chainColMap = buildColumnMap(activeChain, parallelInChain)
  const chainRowMap = buildRowMap(activeChain, parallelInChain)

  const nodes: GraphNode[] = []

  // 활성 체인 에이전트
  for (const agentId of activeChain) {
    const agent = model.agents.find((a) => a.id === agentId)
    if (!agent) continue

    const col = chainColMap.get(agentId) ?? 0
    const row = chainRowMap.get(agentId) ?? 0

    // highlightPath 가 있으면: 경로 포함=highlighted, 나머지=dimmed
    // highlightPath 없으면: 모두 활성(dimmed=false)
    const highlighted = highlightSet !== null ? highlightSet.has(agentId) : false
    const dimmed = highlightSet !== null ? !highlightSet.has(agentId) : false

    nodes.push({
      id: agentId,
      type: 'agentNode',
      position: {
        x: START_X + col * COL_WIDTH,
        y: START_Y + row * ROW_HEIGHT
      },
      data: agentToNodeData(agent, dimmed, highlighted)
    })
  }

  // 게이트 노드 삽입 (blocking 게이트, 활성 체인 phase 에이전트 다음)
  const gateNodes: GraphNode[] = []
  const gateEdgesFromGates: GraphEdge[] = []
  const gateInsertAfter = new Map<string, HarnessGate>()

  for (const gate of model.controlFlow.gates) {
    // gate.phase 가 activeChain 에 포함된 에이전트 displayName 과 매핑
    const matchedAgentId = activeChain.find((id) => {
      const agent = model.agents.find((a) => a.id === id)
      return agent && (agent.displayName === gate.phase || agent.id === gate.phase)
    })
    if (matchedAgentId) {
      gateInsertAfter.set(matchedAgentId, gate)
    }
  }

  // 게이트 노드 위치 계산 — 에이전트 노드 오른쪽 중간
  for (const [afterAgentId, gate] of gateInsertAfter) {
    const agentNode = nodes.find((n) => n.id === afterAgentId)
    if (!agentNode) continue

    const gateId = `gate-${gate.phase}`
    gateNodes.push({
      id: gateId,
      type: 'gateNode',
      position: {
        x: agentNode.position.x + GATE_OFFSET_X,
        y: agentNode.position.y + AGENT_NODE_HEIGHT + 8
      },
      data: {
        type: 'gate',
        phase: gate.phase,
        ruleCodes: gate.ruleCodes,
        description: gate.description,
        blocking: gate.blocking,
        dimmed: false
      } satisfies GateNodeData
    })
  }

  // 활성 체인에 없는 에이전트 (dimmed) — 우측 별도 컬럼에 배치
  const dimmedAgents = model.agents.filter((a) => !activeChainSet.has(a.id))
  const maxActiveCol = activeChain.length > 0
    ? Math.max(...activeChain.map((id) => chainColMap.get(id) ?? 0))
    : -1
  const dimmedStartCol = maxActiveCol + 2

  dimmedAgents.forEach((agent, idx) => {
    nodes.push({
      id: agent.id,
      type: 'agentNode',
      position: {
        x: START_X + (dimmedStartCol + Math.floor(idx / 3)) * COL_WIDTH,
        y: START_Y + (idx % 3) * ROW_HEIGHT
      },
      data: agentToNodeData(agent, true, false)
    })
  })

  const allNodes = [...nodes, ...gateNodes]

  // ── 엣지 생성 ──

  const edges: GraphEdge[] = []
  const artifactLabelMap = buildArtifactLabelMap(model)
  const hasReturn = hasReturnLoop(model)

  // 활성 체인 순차 엣지
  for (let i = 0; i < activeChain.length - 1; i++) {
    const sourceId = activeChain[i]
    const targetId = activeChain[i + 1]

    // 같은 병렬 그룹 내 에이전트끼리는 엣지 생성 안 함
    if (areSameParallelGroup(sourceId, targetId, parallelInChain)) continue

    const artifactLabel = artifactLabelMap.get(sourceId)

    edges.push({
      id: `edge-${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      type: 'handoffEdge',
      data: {
        artifact: artifactLabel,
        conditional: false,
        returnLoop: false
      }
    })
  }

  // QA RETURN 루프 엣지
  if (hasReturn && activeChain.length >= 2) {
    // qa 역할 에이전트 탐색
    const qaAgentId = activeChain.find((id) => {
      const agent = model.agents.find((a) => a.id === id)
      return agent && (agent.phaseClass === 'qa' || agent.displayName.toLowerCase().includes('qa'))
    })

    if (qaAgentId) {
      // 체인에서 qa 이전 dev 에이전트 탐색
      const qaIdx = activeChain.indexOf(qaAgentId)
      const devAgentId = activeChain
        .slice(0, qaIdx)
        .reverse()
        .find((id) => {
          const agent = model.agents.find((a) => a.id === id)
          return agent && (agent.phaseClass === 'dev' || agent.displayName.toLowerCase().includes('dev'))
        })

      const returnTargetId = devAgentId ?? activeChain[0]
      if (returnTargetId !== qaAgentId) {
        edges.push({
          id: `edge-return-${qaAgentId}-${returnTargetId}`,
          source: qaAgentId,
          target: returnTargetId,
          type: 'handoffEdge',
          data: {
            artifact: undefined,
            conditional: false,
            returnLoop: true
          }
        })
      }
    }
  }

  // 게이트 엣지 (agent → gate → next agent)
  for (const [afterAgentId] of gateInsertAfter) {
    const gateId = `gate-${gateInsertAfter.get(afterAgentId)?.phase}`
    const agentIdx = activeChain.indexOf(afterAgentId)
    const nextAgentId = agentIdx >= 0 ? activeChain[agentIdx + 1] : null

    // agent → gate
    edges.push({
      id: `edge-${afterAgentId}-${gateId}`,
      source: afterAgentId,
      target: gateId,
      type: 'handoffEdge',
      data: { artifact: undefined, conditional: false, returnLoop: false }
    })

    // gate → next agent (있을 경우)
    if (nextAgentId) {
      edges.push({
        id: `edge-${gateId}-${nextAgentId}`,
        source: gateId,
        target: nextAgentId,
        type: 'handoffEdge',
        data: {
          artifact: artifactLabelMap.get(afterAgentId),
          conditional: gateInsertAfter.get(afterAgentId)?.blocking === false,
          returnLoop: false
        }
      })
    }

    // 게이트가 삽입된 경우 원래 agent→nextAgent 직접 엣지를 제거
    if (nextAgentId) {
      const directEdgeIdx = edges.findIndex(
        (e) => e.source === afterAgentId && e.target === nextAgentId && !e.id.startsWith('edge-gate')
      )
      if (directEdgeIdx >= 0) {
        edges.splice(directEdgeIdx, 1)
      }
    }
  }

  edges.push(...gateEdgesFromGates)

  return { nodes: allNodes, edges }
}

// ─────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────

function agentToNodeData(agent: HarnessAgent, dimmed: boolean, highlighted: boolean): AgentNodeData {
  return {
    type: 'agent',
    agentId: agent.id,
    displayName: agent.displayName,
    role: agent.role,
    model: agent.model,
    modelSource: agent.modelSource,
    phaseClass: agent.phaseClass ?? 'other',
    tools: agent.tools,
    riskNote: agent.riskNote,
    escalation: agent.escalation,
    dimmed,
    highlighted
  }
}

function areSameParallelGroup(
  id1: string,
  id2: string,
  parallelInChain: string[][]
): boolean {
  for (const group of parallelInChain) {
    if (group.includes(id1) && group.includes(id2)) return true
  }
  return false
}
