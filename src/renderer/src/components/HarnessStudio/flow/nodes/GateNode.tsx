/**
 * GateNode — Harness Studio Flow Canvas 게이트 칩 노드.
 *
 * blocking=true 이면 잠금 아이콘 + 규칙코드 강조 표시.
 * dimmed=true 이면 opacity 낮춤.
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Lock, CheckCircle } from 'lucide-react'
import type { NodeProps } from '@xyflow/react'
import type { GateNodeData } from '../buildGraph'

function GateNode({ data, selected }: NodeProps): JSX.Element {
  const nodeData = data as unknown as GateNodeData
  const { phase, ruleCodes, description, blocking, dimmed } = nodeData

  const opacity = dimmed ? 0.35 : 1
  const bgVar = blocking ? 'var(--c-red-bg)' : 'var(--c-emerald-bg)'
  const fgVar = blocking ? 'var(--c-red-fg)' : 'var(--c-emerald-fg)'
  const borderVar = blocking
    ? 'color-mix(in oklab, var(--c-red-fg) 40%, transparent)'
    : 'color-mix(in oklab, var(--c-emerald-fg) 40%, transparent)'
  const Icon = blocking ? Lock : CheckCircle

  return (
    <div
      title="클릭해 게이트 상세 보기"
      style={{
        opacity,
        background: bgVar,
        border: `1.5px solid ${selected ? 'var(--c-blue-solid)' : borderVar}`,
        boxShadow: selected ? 'var(--ring-focus)' : undefined,
        borderRadius: '6px',
        padding: '6px 10px',
        minWidth: '110px',
        maxWidth: '170px',
        cursor: 'pointer',
        transition: 'opacity 0.2s, box-shadow 0.15s'
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: borderVar, border: 'none', width: 7, height: 7 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: borderVar, border: 'none', width: 7, height: 7 }}
      />

      <div className="flex items-center gap-1.5">
        <Icon size={10} style={{ color: fgVar, flexShrink: 0 }} />
        <span
          className="text-xs font-semibold"
          style={{ color: fgVar }}
        >
          Gate: {phase}
        </span>
      </div>

      {/* 규칙 코드 목록 */}
      {ruleCodes.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {ruleCodes.slice(0, 3).map((code) => (
            <span
              key={code}
              className="ds-chip sq"
              style={{
                background: blocking ? 'var(--c-red-bg)' : 'var(--c-emerald-bg)',
                color: fgVar,
                border: `1px solid ${borderVar}`,
                fontSize: '8px',
                height: '14px',
                padding: '0 4px'
              }}
            >
              {code}
            </span>
          ))}
          {ruleCodes.length > 3 && (
            <span
              className="text-[8px]"
              style={{ color: fgVar, opacity: 0.7 }}
            >
              +{ruleCodes.length - 3}
            </span>
          )}
        </div>
      )}

      {/* 설명 */}
      {description && (
        <p
          className="text-[10px] mt-0.5 leading-snug line-clamp-2"
          style={{ color: fgVar, opacity: 0.75 }}
          title={description}
        >
          {description}
        </p>
      )}
    </div>
  )
}

export default memo(GateNode)
