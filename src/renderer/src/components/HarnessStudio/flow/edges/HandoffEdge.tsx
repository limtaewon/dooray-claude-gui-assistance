/**
 * HandoffEdge — Harness Studio 커스텀 핸드오프 엣지.
 *
 * - 산출물 라벨(artifact) 이 있으면 엣지 중간에 표시.
 * - conditional=true → 점선(stroke-dasharray).
 * - returnLoop=true → 곡선 + 회귀색(yellow 토큰).
 *
 * ADR-003 §커스텀 엣지 참조.
 */

import { memo } from 'react'
import { getBezierPath, EdgeLabelRenderer, BaseEdge } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'
import type { EdgeData } from '../buildGraph'

function HandoffEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected
}: EdgeProps): JSX.Element {
  const edgeData = (data ?? {}) as unknown as EdgeData

  const isReturn = edgeData.returnLoop ?? false
  const isConditional = edgeData.conditional ?? false
  const artifact = edgeData.artifact

  // RETURN 루프: 위쪽으로 우회하는 베지어 커브 (curvature 높임)
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: isReturn ? 0.6 : 0.25
  })

  // 색상 결정
  const strokeColor = isReturn
    ? 'var(--c-yellow-solid)'
    : selected
      ? 'var(--c-blue-solid)'
      : 'var(--bg-border-strong)'

  const strokeWidth = isReturn ? 1.5 : 1.5
  const strokeDasharray = isConditional ? '5 3' : undefined

  const strokeOpacity = isReturn ? 0.85 : 1

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray,
          strokeOpacity
        }}
      />

      {/* 산출물 라벨 */}
      {artifact && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all'
            }}
            className="nodrag nopan"
          >
            <span
              className="ds-chip neutral sq"
              style={{
                fontSize: '9px',
                height: '14px',
                padding: '0 4px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--bg-border)',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                maxWidth: '100px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'inline-block'
              }}
              title={artifact}
            >
              {artifact}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}

      {/* RETURN 루프 라벨 */}
      {isReturn && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 12}px)`,
              pointerEvents: 'none'
            }}
          >
            <span
              className="ds-chip yellow sq"
              style={{
                fontSize: '8px',
                height: '13px',
                padding: '0 3px'
              }}
            >
              RETURN
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export default memo(HandoffEdge)
