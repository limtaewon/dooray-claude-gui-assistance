/**
 * diff 렌더 한도. 초과분은 내용을 비우고 안내 화면으로 대체한다 — Monaco 에 수 MB 문자열을
 * 넣으면 렌더러가 그대로 멈춘다.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/shared/large-diff-render-limit.ts`. Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: 조기 종료 라인 카운트만 남기고 이미지/노트북 등 특수 뷰어 분기 제거.
 */
export const MAX_RENDERED_DIFF_LINES_PER_SIDE = 120_000
export const MAX_RENDERED_DIFF_COMBINED_CHARACTERS = 6_000_000

/** 상한까지만 세는 라인 카운트 — 거대 문자열 전체를 훑지 않는다. 빈 문자열은 0. */
export function countLinesUpToLimit(value: string, limit: number): number {
  if (value.length === 0) return 0
  let lines = 1
  let index = value.indexOf('\n')
  while (index !== -1) {
    lines += 1
    if (lines > limit) return lines
    index = value.indexOf('\n', index + 1)
  }
  return lines
}

/** 렌더 한도를 넘는지 — 문자 수는 O(1) 로 먼저 보고, 그다음 줄 수를 상한까지만 센다. */
export function exceedsDiffRenderLimit(
  original: string,
  modified: string
): { lines?: number; characters?: number } | undefined {
  const characters = original.length + modified.length
  if (characters > MAX_RENDERED_DIFF_COMBINED_CHARACTERS) return { characters }

  const originalLines = countLinesUpToLimit(original, MAX_RENDERED_DIFF_LINES_PER_SIDE)
  if (originalLines > MAX_RENDERED_DIFF_LINES_PER_SIDE) return { lines: originalLines }
  const modifiedLines = countLinesUpToLimit(modified, MAX_RENDERED_DIFF_LINES_PER_SIDE)
  if (modifiedLines > MAX_RENDERED_DIFF_LINES_PER_SIDE) return { lines: modifiedLines }

  return undefined
}
