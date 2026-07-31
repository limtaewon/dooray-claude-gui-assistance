/** 화면 좌표 사각형 — DOMRect 중 계산에 필요한 것만. */
export interface TourRect {
  left: number
  top: number
  width: number
  height: number
}

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

export interface TourViewport {
  width: number
  height: number
}

export interface TourCardPosition {
  left: number
  top: number
  placement: TourPlacement
}

/** 강조 대상과 설명 카드 사이 여백 */
const GAP = 12
/** 화면 가장자리에서 최소한 이만큼은 떨어뜨린다 */
const MARGIN = 12

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * 강조 대상 옆 어디에 설명 카드를 놓을지.
 *
 * 아래 → 위 → 오른쪽 → 왼쪽 순으로 **들어갈 자리를 찾는다**. 어디에도 안 들어가면 화면 중앙에
 * 띄운다 — 카드가 대상을 가리는 것보다 낫다. 마지막에 항상 화면 안으로 당긴다.
 */
export function tourCardPosition(
  anchor: TourRect | null,
  card: { width: number; height: number },
  viewport: TourViewport
): TourCardPosition {
  if (!anchor) {
    return {
      left: Math.round((viewport.width - card.width) / 2),
      top: Math.round((viewport.height - card.height) / 2),
      placement: 'center'
    }
  }

  const below = viewport.height - (anchor.top + anchor.height) - GAP - MARGIN
  const above = anchor.top - GAP - MARGIN
  const right = viewport.width - (anchor.left + anchor.width) - GAP - MARGIN
  const left = anchor.left - GAP - MARGIN

  let placement: TourPlacement = 'center'
  if (below >= card.height) placement = 'bottom'
  else if (above >= card.height) placement = 'top'
  else if (right >= card.width) placement = 'right'
  else if (left >= card.width) placement = 'left'

  if (placement === 'center') {
    return {
      left: Math.round((viewport.width - card.width) / 2),
      top: Math.round((viewport.height - card.height) / 2),
      placement
    }
  }

  const centerX = anchor.left + anchor.width / 2 - card.width / 2
  const centerY = anchor.top + anchor.height / 2 - card.height / 2

  const raw =
    placement === 'bottom'
      ? { left: centerX, top: anchor.top + anchor.height + GAP }
      : placement === 'top'
        ? { left: centerX, top: anchor.top - card.height - GAP }
        : placement === 'right'
          ? { left: anchor.left + anchor.width + GAP, top: centerY }
          : { left: anchor.left - card.width - GAP, top: centerY }

  return {
    left: Math.round(clamp(raw.left, MARGIN, Math.max(MARGIN, viewport.width - card.width - MARGIN))),
    top: Math.round(clamp(raw.top, MARGIN, Math.max(MARGIN, viewport.height - card.height - MARGIN))),
    placement
  }
}

/** 강조 구멍 — 대상보다 조금 넉넉하게 잡고 화면 밖으로 나가지 않게 자른다. */
export function spotlightRect(anchor: TourRect | null, viewport: TourViewport, padding = 6): TourRect | null {
  if (!anchor) return null
  const left = clamp(anchor.left - padding, 0, viewport.width)
  const top = clamp(anchor.top - padding, 0, viewport.height)
  return {
    left,
    top,
    width: clamp(anchor.width + padding * 2, 0, viewport.width - left),
    height: clamp(anchor.height + padding * 2, 0, viewport.height - top)
  }
}
