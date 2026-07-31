/** 작업 패널 폭 제약. 아래로는 파일 경로가 읽히는 최소, 위로는 터미널이 좁아지지 않는 선. */
export const DRAWER_MIN_WIDTH = 260
export const DRAWER_MAX_WIDTH = 720
export const DRAWER_DEFAULT_WIDTH = 320
/** 터미널이 최소한 이만큼은 남아야 한다 — 창이 좁으면 상한이 이 값에 맞춰 내려간다. */
export const TERMINAL_MIN_WIDTH = 320

/**
 * 드래그로 정해진 폭을 허용 범위로 자른다.
 * 창 폭을 주면 "터미널이 최소 폭은 유지" 규칙까지 적용한다 — 창을 줄였을 때 패널이 화면을
 * 다 먹어 터미널이 사라지는 것을 막는다.
 */
export function clampDrawerWidth(width: number, windowWidth?: number): number {
  if (!Number.isFinite(width)) return DRAWER_DEFAULT_WIDTH
  const upper =
    windowWidth && Number.isFinite(windowWidth)
      ? Math.max(DRAWER_MIN_WIDTH, Math.min(DRAWER_MAX_WIDTH, windowWidth - TERMINAL_MIN_WIDTH))
      : DRAWER_MAX_WIDTH
  return Math.round(Math.min(upper, Math.max(DRAWER_MIN_WIDTH, width)))
}

/** 저장된 값을 읽을 때 — 숫자가 아니거나 범위를 벗어나면 기본값으로 되돌린다. */
export function resolveStoredDrawerWidth(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clampDrawerWidth(value)
    : DRAWER_DEFAULT_WIDTH
}
