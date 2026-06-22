/**
 * FlowCanvas — Harness Studio 메인 플로우 그래프 컴포넌트.
 *
 * @xyflow/react 를 사용한다. 의존이 무거우므로 React.lazy 로 감싸서
 * 사용하는 것을 권장한다(ADR-003 §격리).
 *
 * props:
 * - model          : HarnessModel (정규화된 하니스 모델)
 * - highlightPath  : string[] (Dry-run 연동 — 해당 에이전트 강조)
 * - overlayEnabled : boolean  (개인화 오버레이 반영 여부, 기본 true)
 * - onSelectAgent  : (agentId: string) => void (노드 클릭 콜백)
 */

import { useState, useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { Node, Edge, NodeMouseHandler } from '@xyflow/react'
import type { HarnessModel, HarnessLevelId } from '@shared/types/harness'
import { buildGraph } from './buildGraph'
import type { AgentNodeData, GateNodeData } from './buildGraph'
import { getFlowTheme, getFlowCSSVarOverrides } from './flowTheme'
import AgentNode from './nodes/AgentNode'
import GateNode from './nodes/GateNode'
import HandoffEdge from './edges/HandoffEdge'
import { AgentInspector } from '../inspector/AgentInspector'
import SegTabs from '@/components/common/ds/SegTabs'
import type { SegTabItem } from '@/components/common/ds/SegTabs'
import Chip from '@/components/common/ds/Chip'

// ─────────────────────────────────────────────
// react-flow 커스텀 타입 등록
// ─────────────────────────────────────────────

const NODE_TYPES = {
  agentNode: AgentNode,
  gateNode: GateNode
}

const EDGE_TYPES = {
  handoffEdge: HandoffEdge
}

// ─────────────────────────────────────────────
// 레벨 탭 빌더
// ─────────────────────────────────────────────

function buildLevelTabs(model: HarnessModel): SegTabItem<HarnessLevelId>[] {
  return model.levels
    .filter((l) => ['L0', 'L1', 'L2', 'L3'].includes(l.id))
    .map((l) => ({
      key: l.id as HarnessLevelId,
      label: `${l.id}${l.name ? ` · ${l.name}` : ''}`
    }))
}

// ─────────────────────────────────────────────
// FlowCanvas props
// ─────────────────────────────────────────────

export interface FlowCanvasProps {
  /** 정규화된 HarnessModel */
  model: HarnessModel
  /**
   * Dry-run 연동 — 하이라이트할 에이전트 ID 배열.
   * 주어지면 해당 에이전트만 강조하고 나머지는 흐림 처리된다.
   */
  highlightPath?: string[]
  /**
   * 개인화 오버레이 반영 여부.
   * true(기본)이면 model.overlay 를 buildGraph 에 반영한다.
   */
  overlayEnabled?: boolean
  /** 노드 클릭 시 에이전트 ID 콜백 */
  onSelectAgent?: (agentId: string) => void
}

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────

/**
 * Harness Studio Flow Canvas.
 *
 * L0~L3 레벨 토글로 활성 에이전트 체인을 전환하며,
 * 노드 클릭 시 오른쪽 AgentInspector 패널에 에이전트 상세를 표시한다.
 */
export function FlowCanvas({ model, highlightPath, overlayEnabled = true, onSelectAgent }: FlowCanvasProps): JSX.Element {
  const levelTabs = useMemo(() => buildLevelTabs(model), [model])
  const defaultLevel = levelTabs[0]?.key ?? null

  const [activeLevel, setActiveLevel] = useState<HarnessLevelId | null>(
    defaultLevel as HarnessLevelId | null
  )
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)

  // buildGraph 결과 → react-flow Node/Edge 타입으로 변환
  const { nodes: currentNodes, edges: currentEdges } = useMemo(() => {
    const result = buildGraph(model, activeLevel, highlightPath, overlayEnabled)
    return {
      nodes: result.nodes as unknown as Node[],
      edges: result.edges as unknown as Edge[]
    }
  }, [model, activeLevel, highlightPath, overlayEnabled])

  // 노드 클릭 핸들러
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const nodeData = node.data as unknown as AgentNodeData | GateNodeData
      if (nodeData.type === 'agent') {
        setSelectedAgentId((nodeData as AgentNodeData).agentId)
        onSelectAgent?.((nodeData as AgentNodeData).agentId)
      } else {
        setSelectedAgentId(null)
      }
    },
    [onSelectAgent]
  )

  // 배경 클릭 시 선택 해제
  const handlePaneClick = useCallback(() => {
    setSelectedAgentId(null)
  }, [])

  const selectedAgent = selectedAgentId
    ? model.agents.find((a) => a.id === selectedAgentId) ?? null
    : null

  const flowTheme = getFlowTheme()
  const cssVarOverrides = getFlowCSSVarOverrides()

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* 좌측: 플로우 그래프 */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* 레벨 토글 바 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--bg-border)] bg-[color:var(--bg-surface)] flex-shrink-0">
          {levelTabs.length > 0 ? (
            <SegTabs
              items={levelTabs}
              value={activeLevel ?? levelTabs[0].key}
              onChange={(key) => setActiveLevel(key as HarnessLevelId)}
            />
          ) : (
            <Chip tone="neutral" square>레벨 정보 없음</Chip>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Chip tone="neutral" square>
              에이전트 {model.agents.length}개
            </Chip>
            {model.warnings.length > 0 && (
              <Chip tone="yellow" square>
                경고 {model.warnings.length}개
              </Chip>
            )}
          </div>
        </div>

        {/* react-flow 캔버스 */}
        <div className="flex-1 relative" style={{ background: flowTheme.containerBg }}>
          <ReactFlow
            nodes={currentNodes}
            edges={currentEdges}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.3}
            maxZoom={2}
            style={cssVarOverrides}
            defaultEdgeOptions={{
              type: 'handoffEdge'
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color={flowTheme.patternColor}
              gap={20}
              size={1.2}
            />
            <Controls
              style={{
                background: flowTheme.controlsBg,
                border: `1px solid ${flowTheme.controlsBorder}`
              }}
            />
            <MiniMap
              style={{
                background: flowTheme.miniMapBg
              }}
              nodeColor={flowTheme.miniMapNodeColor}
              maskColor={flowTheme.miniMapMaskColor}
            />
          </ReactFlow>
        </div>
      </div>

      {/* 우측: Agent Inspector 패널 */}
      {selectedAgent && (
        <div
          className="flex-shrink-0 border-l border-[color:var(--bg-border)] overflow-y-auto"
          style={{ width: '260px', background: 'var(--bg-surface)' }}
        >
          <AgentInspector
            agent={selectedAgent}
            provenance={model.provenance}
            onClose={() => setSelectedAgentId(null)}
          />
        </div>
      )}
    </div>
  )
}

export default FlowCanvas
