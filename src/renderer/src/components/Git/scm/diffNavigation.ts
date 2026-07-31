/** Monaco 의 `ILineChange` 중 위치 판정에 필요한 부분만. */
export interface DiffChangeLike {
  modifiedStartLineNumber: number
  modifiedEndLineNumber: number
  originalStartLineNumber: number
}

/**
 * 커서가 지금 몇 번째 변경에 있는지 (1-base, 첫 변경 앞이면 0).
 *
 * 삭제만 있는 변경은 `modifiedEndLineNumber` 가 0 이고 `modifiedStartLineNumber` 는
 * "그 줄 **뒤에** 지워졌다" 는 뜻이라, 그 다음 줄부터가 변경 위치다.
 */
export function currentChangeIndex(changes: DiffChangeLike[], line: number): number {
  let index = 0
  for (let i = 0; i < changes.length; i += 1) {
    const change = changes[i]
    const start =
      change.modifiedEndLineNumber === 0 ? change.modifiedStartLineNumber + 1 : change.modifiedStartLineNumber
    if (line >= start) index = i + 1
    else break
  }
  return index
}

/** `3/12` 처럼 몇 번째인지. 변경이 없으면 null — 버튼과 라벨을 함께 감춘다. */
export function formatChangePosition(index: number, count: number): string | null {
  if (count === 0) return null
  return `${Math.min(Math.max(index, 1), count)}/${count}`
}
