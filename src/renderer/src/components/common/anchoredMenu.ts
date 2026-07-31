/**
 * 버튼에 붙는 팝업 메뉴의 화면 좌표 계산.
 *
 * 왜 필요한가: 메뉴를 `absolute` 로 부모 안에 두면 좁은 패널(작업 패널 320px)에서 잘리거나
 * 부모 폭을 밀어 레이아웃이 덜컹거린다. body 포털 + `fixed` 로 띄우고 위치만 여기서 정한다.
 */
export interface AnchorRect {
  left: number
  right: number
  top: number
  bottom: number
}

export interface Viewport {
  width: number
  height: number
}

export interface AnchoredMenuPosition {
  left: number
  top: number
  /** 화면 아래 공간이 부족해 버튼 위로 뒤집혔는지 */
  flipped: boolean
  /** 화면에 맞추느라 줄인 최종 폭 */
  width: number
  /** 아래(또는 위) 남은 공간에 맞춘 최대 높이 — 넘치면 메뉴가 자체 스크롤한다 */
  maxHeight: number
}

const VIEWPORT_MARGIN = 8
const MIN_MENU_HEIGHT = 120

/**
 * 앵커 기준으로 메뉴 위치를 정한다.
 * - 가로: 오른쪽 정렬을 기본으로 하되 화면 밖으로 나가면 안쪽으로 당긴다.
 * - 세로: 아래에 두되 공간이 모자라고 위가 더 넓으면 위로 뒤집는다.
 */
export function anchoredMenuPosition(
  anchor: AnchorRect,
  menu: { width: number; height?: number },
  viewport: Viewport,
  options: { align?: 'start' | 'end'; gap?: number } = {}
): AnchoredMenuPosition {
  const gap = options.gap ?? 4
  const width = Math.min(menu.width, Math.max(160, viewport.width - VIEWPORT_MARGIN * 2))

  const preferredLeft = options.align === 'start' ? anchor.left : anchor.right - width
  const left = Math.round(
    Math.min(Math.max(VIEWPORT_MARGIN, preferredLeft), viewport.width - width - VIEWPORT_MARGIN)
  )

  const spaceBelow = viewport.height - anchor.bottom - gap - VIEWPORT_MARGIN
  const spaceAbove = anchor.top - gap - VIEWPORT_MARGIN
  const desired = menu.height ?? Number.POSITIVE_INFINITY
  // 아래가 모자라고 위가 더 넓을 때만 뒤집는다 — 굳이 위로 올리면 버튼이 가려진다.
  const flipped = spaceBelow < Math.min(desired, MIN_MENU_HEIGHT) && spaceAbove > spaceBelow

  const maxHeight = Math.max(MIN_MENU_HEIGHT, flipped ? spaceAbove : spaceBelow)
  const top = flipped
    ? Math.round(Math.max(VIEWPORT_MARGIN, anchor.top - gap - Math.min(desired, maxHeight)))
    : Math.round(anchor.bottom + gap)

  return { left, top, flipped, width, maxHeight }
}
