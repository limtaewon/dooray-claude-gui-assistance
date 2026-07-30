/**
 * NUL 로 구분된 git 출력의 필드를 순회한다.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/shared/nul-delimited-fields.ts`. Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: 없음 (verbatim).
 */
export function* iterateNulDelimitedFields(value: string): Generator<string> {
  let start = 0
  while (start <= value.length) {
    const end = value.indexOf('\0', start)
    if (end === -1) {
      yield value.slice(start)
      return
    }
    yield value.slice(start, end)
    start = end + 1
  }
}
