/**
 * AgentNode — Harness Studio Flow Canvas 커스텀 에이전트 노드.
 *
 * 배경=PhaseColor(phaseClass), 모델 배지(haiku/sonnet/opus 색 구분),
 * 위험 아이콘(riskNote 존재 시), modelSource='ai' 이면 ProvenanceBadge.
 *
 * dimmed=true 이면 opacity 를 낮춰 비활성 레벨 에이전트를 흐리게 표시한다.
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { AlertTriangle } from 'lucide-react'
import type { NodeProps } from '@xyflow/react'
import { phaseTokens } from '../../shared/PhaseColor'
import { ProvenanceBadge } from '../../shared/ProvenanceBadge'
import type { AgentNodeData } from '../buildGraph'

/** 모델명 → 배지 CSS 클래스 (DS 시맨틱 토큰 기반) */
const MODEL_BADGE_CLASS: Record<string, string> = {
  haiku:   'ds-chip neutral sq',
  sonnet:  'ds-chip blue sq',
  opus:    'ds-chip orange sq',
  unknown: 'ds-chip neutral sq'
}

function AgentNode({ data, selected }: NodeProps): JSX.Element {
  const nodeData = data as unknown as AgentNodeData
  const {
    displayName,
    role,
    model,
    modelSource,
    phaseClass,
    riskNote,
    dimmed
  } = nodeData

  const tokens = phaseTokens(phaseClass)
  const badgeClass = MODEL_BADGE_CLASS[model] ?? MODEL_BADGE_CLASS.unknown
  const opacity = dimmed ? 0.35 : 1

  return (
    <div
      style={{
        opacity,
        background: tokens.bg,
        border: `1px solid ${selected ? 'var(--c-blue-solid)' : tokens.border}`,
        borderLeft: `4px solid ${tokens.accent}`,
        boxShadow: selected ? 'var(--ring-focus)' : '0 1px 2px rgba(0,0,0,0.25)',
        borderRadius: '8px',
        padding: '10px 12px',
        minWidth: '170px',
        maxWidth: '220px',
        cursor: dimmed ? 'default' : 'pointer',
        transition: 'opacity 0.2s, box-shadow 0.15s'
      }}
    >
      {/* react-flow 핸들 */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: tokens.border, border: 'none', width: 8, height: 8 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: tokens.border, border: 'none', width: 8, height: 8 }}
      />

      {/* 헤더 행: 페이즈 점 + 이름 + 위험 아이콘 + 모델 배지 */}
      <div className="flex items-center gap-1.5 mb-1">
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            width: 7,
            height: 7,
            borderRadius: 999,
            background: tokens.accent
          }}
        />
        <span
          className="text-xs font-semibold truncate flex-1"
          style={{ color: tokens.fg }}
          title={displayName}
        >
          {displayName}
        </span>

        {/* 위험 아이콘 */}
        {riskNote && (
          <span title={riskNote} aria-label={`위험: ${riskNote}`} style={{ flexShrink: 0 }}>
            <AlertTriangle
              size={11}
              style={{ color: 'var(--c-yellow-fg)' }}
            />
          </span>
        )}

        {/* 모델 배지 */}
        <span className={badgeClass} style={{ flexShrink: 0, fontSize: '9px' }}>
          {model === 'unknown' ? '?' : model}
        </span>
      </div>

      {/* 역할 설명 */}
      {role && (
        <p
          className="text-xs leading-snug line-clamp-2"
          style={{ color: tokens.fg, opacity: 0.75 }}
          title={role}
        >
          {role}
        </p>
      )}

      {/* AI 추정 배지 (model 출처가 ai 일 때) */}
      {modelSource === 'ai' && (
        <div className="mt-1.5">
          <ProvenanceBadge source="ai" size="xs" />
        </div>
      )}
    </div>
  )
}

export default memo(AgentNode)
