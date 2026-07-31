/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/terminal/pane-divider-drag.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: Orca 의 sizes[] 배열 모델 대신 Clauday SplitLayout 의 단일 ratio(첫 pane 비율) 모델에
 * 맞춰 순수 계산부만 재구성했다. pointer 이벤트 배선(setPointerCapture/rAF 코얼레싱)은
 * SplitLayout.tsx 의 PaneDivider 컴포넌트가 이 모듈의 함수를 호출해 수행한다.
 */

/** 적응형 최소폭 계산의 기준값(px) — 컨테이너가 이보다 작으면 total/2 로 더 좁혀진다. */
export const MIN_PANE_PX = 120

/** 컨테이너 총 픽셀 크기 기준 적응형 최소 픽셀폭. `Math.min(MIN_PANE_PX, total/2)`. */
export function adaptiveMinPx(totalPx: number): number {
  if (totalPx <= 0) return 0
  return Math.min(MIN_PANE_PX, totalPx / 2)
}

/** ratio 를 적응형 최소폭 기준 [minRatio, 1-minRatio] 범위로 clamp 한다. */
export function clampRatio(ratio: number, totalPx: number): number {
  if (totalPx <= 0) return 0.5
  const minRatio = adaptiveMinPx(totalPx) / totalPx
  if (minRatio >= 0.5) return 0.5
  return Math.min(1 - minRatio, Math.max(minRatio, ratio))
}

/**
 * 포인터의 절대 좌표(clientX/Y 등 축 하나)를 컨테이너 기준 비율로 변환한다.
 * `containerStartPx`/`totalPx` 는 드래그 축(row 면 left/width, column 이면 top/height)에 맞춰
 * 호출자가 `getBoundingClientRect()` 로부터 뽑아 넘긴다.
 */
export function ratioFromPointer(pointerPx: number, containerStartPx: number, totalPx: number): number {
  if (totalPx <= 0) return 0.5
  const raw = (pointerPx - containerStartPx) / totalPx
  return clampRatio(raw, totalPx)
}
