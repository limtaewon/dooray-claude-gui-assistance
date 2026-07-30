/**
 * 커밋 그래프 한 행의 SVG. 레인 계산은 `@shared/git/historyGraph` 가 미리 끝낸다.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/renderer/src/components/right-sidebar/GitHistoryGraphSvg.tsx`.
 * Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: 경계(incoming/outgoing) 노드 분기 제거, 배경색 변수를 Clauday 토큰으로 교체.
 */
import {
  getGitHistoryItemLaneIndex,
  getGitHistoryMergeParentLaneIndex,
  type GitHistoryItemViewModel
} from '@shared/git/historyGraph'
import type { GitHistoryGraphColorId } from '@shared/git/historyTypes'

export const SWIMLANE_HEIGHT = 24
const SWIMLANE_WIDTH = 11
const SWIMLANE_CURVE_RADIUS = 5
const SWIMLANE_NODE_Y = SWIMLANE_HEIGHT / 2
const CIRCLE_RADIUS = 3.5
const CIRCLE_STROKE_WIDTH = 1.5

/** 노드 원 안쪽/테두리에 쓰는 배경 — 드로어 표면색과 같아야 선이 끊겨 보인다. */
const NODE_BACKDROP = 'var(--bg-surface)'

function graphColor(color: GitHistoryGraphColorId): string {
  return `var(--${color})`
}

function GraphPath({ d, color }: { d: string; color: GitHistoryGraphColorId }): JSX.Element {
  return <path d={d} fill="none" stroke={graphColor(color)} strokeLinecap="round" strokeWidth={1} />
}

function GitHistoryGraphSvg({ viewModel }: { viewModel: GitHistoryItemViewModel }): JSX.Element {
  const { historyItem, inputSwimlanes, outputSwimlanes } = viewModel
  const inputIndex = inputSwimlanes.findIndex((node) => node.id === historyItem.id)
  const circleIndex = getGitHistoryItemLaneIndex(viewModel)
  const circleColor =
    circleIndex < outputSwimlanes.length
      ? outputSwimlanes[circleIndex]!.color
      : circleIndex < inputSwimlanes.length
        ? inputSwimlanes[circleIndex]!.color
        : 'git-graph-ref'

  const paths: JSX.Element[] = []
  let outputSwimlaneIndex = 0

  for (let index = 0; index < inputSwimlanes.length; index += 1) {
    const color = inputSwimlanes[index]!.color

    // 이 커밋을 기다리던 레인 — 원이 다른 열에 있으면 원호로 끌어온다.
    if (inputSwimlanes[index]!.id === historyItem.id) {
      if (index !== circleIndex) {
        paths.push(
          <GraphPath
            key={`base-${index}`}
            color={color}
            d={[
              `M ${SWIMLANE_WIDTH * (index + 1)} 0`,
              `A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * index} ${SWIMLANE_NODE_Y}`,
              `H ${SWIMLANE_WIDTH * (circleIndex + 1)}`
            ].join(' ')}
          />
        )
      } else {
        outputSwimlaneIndex += 1
      }
      continue
    }

    if (
      outputSwimlaneIndex < outputSwimlanes.length &&
      inputSwimlanes[index]!.id === outputSwimlanes[outputSwimlaneIndex]!.id
    ) {
      if (index === outputSwimlaneIndex) {
        // 통과 레인 — 직선
        paths.push(
          <GraphPath
            key={`vertical-${index}`}
            color={color}
            d={`M ${SWIMLANE_WIDTH * (index + 1)} 0 V ${SWIMLANE_HEIGHT}`}
          />
        )
      } else {
        // 왼쪽으로 당겨지는 레인 — S 자
        paths.push(
          <GraphPath
            key={`shift-${index}-${outputSwimlaneIndex}`}
            color={color}
            d={[
              `M ${SWIMLANE_WIDTH * (index + 1)} 0`,
              'V 6',
              `A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 1 ${
                SWIMLANE_WIDTH * (index + 1) - SWIMLANE_CURVE_RADIUS
              } ${SWIMLANE_HEIGHT / 2}`,
              `H ${SWIMLANE_WIDTH * (outputSwimlaneIndex + 1) + SWIMLANE_CURVE_RADIUS}`,
              `A ${SWIMLANE_CURVE_RADIUS} ${SWIMLANE_CURVE_RADIUS} 0 0 0 ${
                SWIMLANE_WIDTH * (outputSwimlaneIndex + 1)
              } ${SWIMLANE_HEIGHT / 2 + SWIMLANE_CURVE_RADIUS}`,
              `V ${SWIMLANE_HEIGHT}`
            ].join(' ')}
          />
        )
      }
      outputSwimlaneIndex += 1
    }
  }

  // 머지 커밋의 두 번째 이후 부모로 갈라지는 원호
  for (let index = 1; index < historyItem.parentIds.length; index += 1) {
    const parentOutputIndex = getGitHistoryMergeParentLaneIndex(viewModel, historyItem.parentIds[index]!)
    if (parentOutputIndex === -1) continue
    paths.push(
      <GraphPath
        key={`merge-parent-${index}`}
        color={outputSwimlanes[parentOutputIndex]!.color}
        d={[
          `M ${SWIMLANE_WIDTH * parentOutputIndex} ${SWIMLANE_HEIGHT / 2}`,
          `A ${SWIMLANE_WIDTH} ${SWIMLANE_WIDTH} 0 0 1 ${SWIMLANE_WIDTH * (parentOutputIndex + 1)} ${SWIMLANE_HEIGHT}`,
          `M ${SWIMLANE_WIDTH * parentOutputIndex} ${SWIMLANE_HEIGHT / 2}`,
          `H ${SWIMLANE_WIDTH * (circleIndex + 1)}`
        ].join(' ')}
      />
    )
  }

  if (inputIndex !== -1) {
    paths.push(
      <GraphPath
        key="into-node"
        color={inputSwimlanes[inputIndex]!.color}
        d={`M ${SWIMLANE_WIDTH * (circleIndex + 1)} 0 V ${SWIMLANE_HEIGHT / 2}`}
      />
    )
  }
  if (historyItem.parentIds.length > 0) {
    paths.push(
      <GraphPath
        key="out-of-node"
        color={circleColor}
        d={`M ${SWIMLANE_WIDTH * (circleIndex + 1)} ${SWIMLANE_HEIGHT / 2} V ${SWIMLANE_HEIGHT}`}
      />
    )
  }

  const cx = SWIMLANE_WIDTH * (circleIndex + 1)
  const cy = SWIMLANE_NODE_Y
  const width = SWIMLANE_WIDTH * (Math.max(inputSwimlanes.length, outputSwimlanes.length, 1) + 1)
  const isMergeNode = historyItem.parentIds.length > 1

  return (
    <svg
      aria-hidden="true"
      className="shrink-0 overflow-visible"
      width={width}
      height={SWIMLANE_HEIGHT}
      viewBox={`0 0 ${width} ${SWIMLANE_HEIGHT}`}
    >
      {paths}
      {viewModel.kind === 'HEAD' ? (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={CIRCLE_RADIUS + 3}
            fill={graphColor(circleColor)}
            stroke={NODE_BACKDROP}
            strokeWidth={CIRCLE_STROKE_WIDTH}
          />
          <circle cx={cx} cy={cy} r={CIRCLE_STROKE_WIDTH} fill={NODE_BACKDROP} />
        </>
      ) : isMergeNode ? (
        <>
          <circle cx={cx} cy={cy} r={CIRCLE_RADIUS + 1} fill={graphColor(circleColor)} />
          <circle cx={cx} cy={cy} r={CIRCLE_RADIUS - 1.5} fill={NODE_BACKDROP} />
        </>
      ) : (
        <circle cx={cx} cy={cy} r={CIRCLE_RADIUS} fill={graphColor(circleColor)} />
      )}
    </svg>
  )
}

export default GitHistoryGraphSvg
