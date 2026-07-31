/**
 * 커밋 그래프 레인(swimlane) 계산.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/shared/git-history-graph.ts`. Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: ① incoming/outgoing 가상 행 합성(`git-history-boundary-rows.ts`) 제거 — Clauday 는 전
 *   브랜치 조회를 지원해 경계 행이 필요 없다. ② 머지 부모 색 조회의 선형 탐색을 Map 인덱스로 교체
 *   (Load more 로 커밋이 수천 건 쌓이면 원본은 O(n·m)).
 *
 * 알고리즘: `--topo-order` 로 정렬된 커밋을 위→아래 1패스로 훑으며, 직전 행의 outputSwimlanes 를
 * 이번 행의 inputSwimlanes 로 전파한다. 전역 레이아웃을 미리 계산하지 않는다.
 * ⚠️ 행 간 의존이 있으므로 **윈도우만 계산할 수 없다** — 전체를 계산하고 렌더만 윈도잉해야 한다.
 */
import {
  GIT_HISTORY_BASE_REF_COLOR,
  GIT_HISTORY_LANE_COLORS,
  GIT_HISTORY_REF_COLOR,
  GIT_HISTORY_REMOTE_REF_COLOR,
  type GitHistoryGraphColorId,
  type GitHistoryItem,
  type GitHistoryItemRef
} from './historyTypes'

export interface GitHistoryGraphNode {
  id: string
  color: GitHistoryGraphColorId
}

export interface GitHistoryItemViewModel {
  historyItem: GitHistoryItem
  inputSwimlanes: GitHistoryGraphNode[]
  outputSwimlanes: GitHistoryGraphNode[]
  kind: 'HEAD' | 'node'
}

function rotate(index: number, length: number): number {
  return ((index % length) + length) % length
}

function cloneNode(node: GitHistoryGraphNode): GitHistoryGraphNode {
  return { id: node.id, color: node.color }
}

function findLastNodeIndex(nodes: readonly GitHistoryGraphNode[], id: string): number {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (nodes[index]?.id === id) return index
  }
  return -1
}

function getLabelColorIdentifier(
  historyItem: GitHistoryItem,
  colorMap: Map<string, GitHistoryGraphColorId | undefined>
): GitHistoryGraphColorId | undefined {
  for (const ref of historyItem.references ?? []) {
    const color = colorMap.get(ref.id)
    if (color !== undefined) return color
  }
  return undefined
}

export function compareGitHistoryRefs(
  ref1: GitHistoryItemRef,
  ref2: GitHistoryItemRef,
  currentRef?: GitHistoryItemRef,
  remoteRef?: GitHistoryItemRef,
  baseRef?: GitHistoryItemRef
): number {
  const order = (ref: GitHistoryItemRef): number => {
    if (ref.id === currentRef?.id) return 1
    if (ref.id === remoteRef?.id) return 2
    if (ref.id === baseRef?.id) return 3
    if (ref.color !== undefined) return 4
    return 99
  }
  return order(ref1) - order(ref2)
}

export interface GitHistoryGraphInput {
  colorMap?: Map<string, GitHistoryGraphColorId | undefined>
  currentRef?: GitHistoryItemRef
  remoteRef?: GitHistoryItemRef
  baseRef?: GitHistoryItemRef
}

export function buildGitHistoryViewModels(
  historyItems: GitHistoryItem[],
  input: GitHistoryGraphInput = {}
): GitHistoryItemViewModel[] {
  const colorMap = input.colorMap ?? new Map<string, GitHistoryGraphColorId | undefined>()
  const { currentRef, remoteRef, baseRef } = input
  const byId = new Map(historyItems.map((item) => [item.id, item]))

  let colorIndex = -1
  const viewModels: GitHistoryItemViewModel[] = []

  for (const historyItem of historyItems) {
    const kind = historyItem.id === currentRef?.revision ? 'HEAD' : 'node'
    const inputSwimlanes = (viewModels.at(-1)?.outputSwimlanes ?? []).map(cloneNode)
    const outputSwimlanes: GitHistoryGraphNode[] = []
    let firstParentAdded = false

    if (historyItem.parentIds.length > 0) {
      for (const node of inputSwimlanes) {
        if (node.id === historyItem.id) {
          if (!firstParentAdded) {
            // 이 커밋을 기다리던 레인이 첫 부모로 승계된다(색 유지).
            outputSwimlanes.push({
              id: historyItem.parentIds[0]!,
              color: getLabelColorIdentifier(historyItem, colorMap) ?? node.color
            })
            firstParentAdded = true
          }
          // 같은 커밋을 기다리던 나머지 레인은 흡수한다(머지 수렴).
          continue
        }
        outputSwimlanes.push(cloneNode(node))
      }
    }

    // 머지 커밋의 두 번째 이후 부모는 새 레인을 연다.
    for (let index = firstParentAdded ? 1 : 0; index < historyItem.parentIds.length; index += 1) {
      let colorIdentifier: GitHistoryGraphColorId | undefined
      if (index === 0) {
        colorIdentifier = getLabelColorIdentifier(historyItem, colorMap)
      } else {
        const parent = byId.get(historyItem.parentIds[index]!)
        colorIdentifier = parent ? getLabelColorIdentifier(parent, colorMap) : undefined
      }
      if (!colorIdentifier) {
        colorIndex = rotate(colorIndex + 1, GIT_HISTORY_LANE_COLORS.length)
        colorIdentifier = GIT_HISTORY_LANE_COLORS[colorIndex]!
      }
      outputSwimlanes.push({ id: historyItem.parentIds[index]!, color: colorIdentifier })
    }

    const references = (historyItem.references ?? [])
      .map((ref) => {
        let color = colorMap.get(ref.id)
        if (colorMap.has(ref.id) && color === undefined) {
          const inputIndex = inputSwimlanes.findIndex((node) => node.id === historyItem.id)
          const circleIndex = inputIndex !== -1 ? inputIndex : inputSwimlanes.length
          color =
            circleIndex < outputSwimlanes.length
              ? outputSwimlanes[circleIndex]!.color
              : circleIndex < inputSwimlanes.length
                ? inputSwimlanes[circleIndex]!.color
                : GIT_HISTORY_REF_COLOR
        }
        return { ...ref, color }
      })
      .sort((ref1, ref2) => compareGitHistoryRefs(ref1, ref2, currentRef, remoteRef, baseRef))

    viewModels.push({
      historyItem: { ...historyItem, references },
      kind,
      inputSwimlanes,
      outputSwimlanes
    })
  }

  return viewModels
}

/** 커밋 원(circle)이 놓일 레인 인덱스. 들어오는 레인이 없으면 맨 오른쪽에 새로 뚫는다. */
export function getGitHistoryItemLaneIndex(viewModel: GitHistoryItemViewModel): number {
  const inputIndex = viewModel.inputSwimlanes.findIndex(
    (node) => node.id === viewModel.historyItem.id
  )
  return inputIndex !== -1 ? inputIndex : viewModel.inputSwimlanes.length
}

export function getGitHistoryMergeParentLaneIndex(
  viewModel: GitHistoryItemViewModel,
  parentId: string
): number {
  return findLastNodeIndex(viewModel.outputSwimlanes, parentId)
}

/** 현재/upstream/base ref 에 고정색을 배정한다. 나머지 레인은 5색 라운드로빈. */
export function buildDefaultGitHistoryColorMap(input: {
  currentRef?: GitHistoryItemRef
  remoteRef?: GitHistoryItemRef
  baseRef?: GitHistoryItemRef
}): Map<string, GitHistoryGraphColorId | undefined> {
  const colorMap = new Map<string, GitHistoryGraphColorId | undefined>()
  if (input.currentRef) colorMap.set(input.currentRef.id, GIT_HISTORY_REF_COLOR)
  if (input.remoteRef) colorMap.set(input.remoteRef.id, GIT_HISTORY_REMOTE_REF_COLOR)
  if (input.baseRef) colorMap.set(input.baseRef.id, GIT_HISTORY_BASE_REF_COLOR)
  return colorMap
}
