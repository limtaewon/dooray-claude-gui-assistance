/**
 * split 레이아웃 이진 트리 순수 함수 모음 (v2.0 B-4, ADR-v2-terminal-p2-02 §2).
 *
 * 트리는 렌더러 상태다 — main 은 이 모듈을 모른다. 어떤 함수도 입력 트리를 변형하지 않고
 * 항상 새 노드를 반환한다(변경이 없으면 원본 참조를 그대로 돌려줘 불필요한 리렌더를 막는다).
 * leaf 는 `leafId` 만 가진다 — `sessionId` 는 재시작마다 새로 발급되는 휘발값이라 트리에
 * 넣지 않는다(ADR-02 §대안 4).
 */
import type { SplitDirection, SplitLeaf, SplitNode } from '@shared/types/terminal'

/** 분기 노드까지의 경로 — 각 단계에서 first/second 중 어느 자식으로 내려갔는지. */
export type SplitPath = Array<'first' | 'second'>

const MAX_TREE_DEPTH = 8

function makeLeaf(leafId: string): SplitLeaf {
  return { type: 'leaf', leafId }
}

/** path 를 따라 내려가 노드를 `replacer` 결과로 치환한다. 변화가 없으면 원본 참조를 유지한다. */
function replaceAtPath(tree: SplitNode, path: SplitPath, replacer: (node: SplitNode) => SplitNode): SplitNode {
  if (path.length === 0) return replacer(tree)
  if (tree.type !== 'split') return tree
  const [head, ...rest] = path
  const child = tree[head]
  const nextChild = replaceAtPath(child, rest, replacer)
  if (nextChild === child) return tree
  return head === 'first' ? { ...tree, first: nextChild } : { ...tree, second: nextChild }
}

/** 트리에서 leafId 의 경로를 찾는다. 루트 자신이 그 leaf 면 빈 배열. 없으면 null. */
export function findLeafPath(tree: SplitNode, leafId: string): SplitPath | null {
  if (tree.type === 'leaf') return tree.leafId === leafId ? [] : null
  const firstPath = findLeafPath(tree.first, leafId)
  if (firstPath) return ['first', ...firstPath]
  const secondPath = findLeafPath(tree.second, leafId)
  if (secondPath) return ['second', ...secondPath]
  return null
}

/**
 * targetLeafId 위치를 분기 노드로 치환한다 — 기존 leaf 는 first, newLeafId 는 second.
 * targetLeafId 를 못 찾으면 원본 트리를 그대로 반환한다.
 */
export function splitLeaf(
  tree: SplitNode,
  targetLeafId: string,
  direction: SplitDirection,
  newLeafId: string
): SplitNode {
  const path = findLeafPath(tree, targetLeafId)
  if (!path) return tree
  return replaceAtPath(tree, path, (node) => ({
    type: 'split',
    direction,
    first: node,
    second: makeLeaf(newLeafId)
  }))
}

/**
 * leafId 를 제거한다 — 부모 분기의 남은 형제가 그 자리로 승격된다("형제 승격" 한 번의 연산).
 * 트리 전체가 그 leaf 하나뿐이었다면 `null`(탭을 닫아야 함을 의미).
 */
export function closeLeaf(tree: SplitNode, leafId: string): SplitNode | null {
  if (tree.type === 'leaf') return tree.leafId === leafId ? null : tree

  const collapsedFirst = closeLeaf(tree.first, leafId)
  if (collapsedFirst === null) return tree.second
  if (collapsedFirst !== tree.first) return { ...tree, first: collapsedFirst }

  const collapsedSecond = closeLeaf(tree.second, leafId)
  if (collapsedSecond === null) return tree.first
  if (collapsedSecond !== tree.second) return { ...tree, second: collapsedSecond }

  return tree
}

/** 시각적 순서(첫 자식 → 둘째 자식)로 leafId 를 나열한다. */
export function collectLeafIds(tree: SplitNode): string[] {
  if (tree.type === 'leaf') return [tree.leafId]
  return [...collectLeafIds(tree.first), ...collectLeafIds(tree.second)]
}

/** 0.5 근방(±0.005)이면 저장을 생략하기 위해 undefined, 그 외엔 소수 3자리로 양자화한다. 극단값은 5%~95% 로 clamp. */
export function quantizeRatio(ratio: number): number | undefined {
  if (Math.abs(ratio - 0.5) <= 0.005) return undefined
  const clamped = Math.min(0.95, Math.max(0.05, ratio))
  return Math.round(clamped * 1000) / 1000
}

/** path 가 가리키는 분기 노드의 ratio 를 바꾼다. path 가 분기가 아닌 노드를 가리키면 원본을 그대로 반환한다. */
export function setRatioAtPath(tree: SplitNode, path: SplitPath, ratio: number | undefined): SplitNode {
  return replaceAtPath(tree, path, (node) => (node.type === 'split' ? { ...node, ratio } : node))
}

/** 노드 아래 leaf 개수 — equalizeRatios 가중치로 쓰인다. */
export function getEqualizeWeight(node: SplitNode): number {
  return node.type === 'leaf' ? 1 : getEqualizeWeight(node.first) + getEqualizeWeight(node.second)
}

/** 모든 분기의 ratio 를 하위 leaf 개수 비율로 재계산한다(3분할 이상에서 "균등"의 의미). */
export function equalizeRatios(tree: SplitNode): SplitNode {
  if (tree.type === 'leaf') return tree
  const firstWeight = getEqualizeWeight(tree.first)
  const secondWeight = getEqualizeWeight(tree.second)
  return {
    ...tree,
    ratio: quantizeRatio(firstWeight / (firstWeight + secondWeight)),
    first: equalizeRatios(tree.first),
    second: equalizeRatios(tree.second)
  }
}

interface LeafRect {
  leafId: string
  x0: number
  y0: number
  x1: number
  y1: number
}

function collectLeafRects(
  node: SplitNode,
  rect: { x0: number; y0: number; x1: number; y1: number },
  out: LeafRect[]
): void {
  if (node.type === 'leaf') {
    out.push({ leafId: node.leafId, ...rect })
    return
  }
  const ratio = node.ratio ?? 0.5
  if (node.direction === 'row') {
    const midX = rect.x0 + (rect.x1 - rect.x0) * ratio
    collectLeafRects(node.first, { ...rect, x1: midX }, out)
    collectLeafRects(node.second, { ...rect, x0: midX }, out)
  } else {
    const midY = rect.y0 + (rect.y1 - rect.y0) * ratio
    collectLeafRects(node.first, { ...rect, y1: midY }, out)
    collectLeafRects(node.second, { ...rect, y0: midY }, out)
  }
}

/**
 * fromLeafId 기준으로 지정한 방향에 있는 가장 가까운 leaf 를 찾는다(⌥⌘화살표).
 * 트리의 ratio 로부터 leaf 들의 정규화 좌표([0,1] 사각형)를 구성한 뒤, 해당 방향에 있는
 * 후보 중 (주축 거리 우선, 교차축 거리 차선) 가장 가까운 것을 고른다. 없으면 null.
 */
export function neighborLeaf(
  tree: SplitNode,
  fromLeafId: string,
  direction: 'left' | 'right' | 'up' | 'down'
): string | null {
  const rects: LeafRect[] = []
  collectLeafRects(tree, { x0: 0, y0: 0, x1: 1, y1: 1 }, rects)
  const from = rects.find((r) => r.leafId === fromLeafId)
  if (!from) return null

  const fromCx = (from.x0 + from.x1) / 2
  const fromCy = (from.y0 + from.y1) / 2
  const EPS = 1e-6

  let best: LeafRect | null = null
  let bestScore = Infinity
  for (const r of rects) {
    if (r.leafId === fromLeafId) continue
    const cx = (r.x0 + r.x1) / 2
    const cy = (r.y0 + r.y1) / 2
    let inDirection = false
    let primaryDist = 0
    switch (direction) {
      case 'left':
        inDirection = r.x1 <= from.x0 + EPS
        primaryDist = from.x0 - r.x1
        break
      case 'right':
        inDirection = r.x0 >= from.x1 - EPS
        primaryDist = r.x0 - from.x1
        break
      case 'up':
        inDirection = r.y1 <= from.y0 + EPS
        primaryDist = from.y0 - r.y1
        break
      case 'down':
        inDirection = r.y0 >= from.y1 - EPS
        primaryDist = r.y0 - from.y1
        break
    }
    if (!inDirection) continue
    const perpDist = direction === 'left' || direction === 'right' ? Math.abs(cy - fromCy) : Math.abs(cx - fromCx)
    const score = Math.max(primaryDist, 0) * 2 + perpDist
    if (score < bestScore) {
      bestScore = score
      best = r
    }
  }
  return best?.leafId ?? null
}

/**
 * 손상된 스냅샷을 걸러낸다 — 알 수 없는 type, 빈/중복 leafId, 범위 밖 ratio, 8단계 초과 깊이면 false.
 * false 면 호출자가 단일 leaf 트리로 폴백해야 한다(복원 경로, ADR-02 §2).
 */
export function isValidTree(node: SplitNode, depth = 0): boolean {
  try {
    const ids = collectLeafIdsChecked(node, depth)
    return new Set(ids).size === ids.length
  } catch {
    return false
  }
}

function collectLeafIdsChecked(node: SplitNode, depth: number): string[] {
  if (depth > MAX_TREE_DEPTH) throw new Error('split tree 깊이 초과')
  if (node.type === 'leaf') {
    if (typeof node.leafId !== 'string' || node.leafId.length === 0) throw new Error('leafId 비정상')
    return [node.leafId]
  }
  if (node.type !== 'split') throw new Error('알 수 없는 노드 type')
  if (node.direction !== 'row' && node.direction !== 'column') throw new Error('알 수 없는 direction')
  if (node.ratio !== undefined && (Number.isNaN(node.ratio) || node.ratio < 0 || node.ratio > 1)) {
    throw new Error('ratio 범위 밖')
  }
  if (!node.first || !node.second) throw new Error('자식 노드 누락')
  return [...collectLeafIdsChecked(node.first, depth + 1), ...collectLeafIdsChecked(node.second, depth + 1)]
}
