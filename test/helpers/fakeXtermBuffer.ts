/**
 * `wrappedLinkRanges.ts`/`filePathLinkProvider.ts` 테스트용 최소 `IBufferLine` 더미.
 * 실제 xterm 5.5 stable 은 `translateToString(..., outColumns)` 를 지원하지 않으므로, 이 더미도
 * 4번째 인자를 무시한다 — `translateLineWithColumns` 가 항상 셀 단위 폴백 경로를 타도록 강제해서
 * 프로덕션에서 실제로 실행되는 경로를 그대로 검증한다 (ADR-v2-terminal-p2-05 §레이어 3).
 */

interface FakeCell {
  chars: string
  width: 0 | 1 | 2
}

export interface FakeLineSpec {
  text: string
  isWrapped?: boolean
}

export class FakeBufferLine {
  readonly isWrapped: boolean
  private readonly cells: FakeCell[]

  constructor(text: string, isWrapped: boolean, wideChars: ReadonlySet<string>) {
    this.isWrapped = isWrapped
    this.cells = []
    for (const ch of Array.from(text)) {
      const isWide = wideChars.has(ch)
      this.cells.push({ chars: ch, width: isWide ? 2 : 1 })
      if (isWide) this.cells.push({ chars: '', width: 0 })
    }
  }

  get length(): number {
    return this.cells.length
  }

  getCell(x: number): { getWidth(): number; getChars(): string } | undefined {
    const cell = this.cells[x]
    if (!cell) return undefined
    return { getWidth: () => cell.width, getChars: () => cell.chars }
  }

  /** 4번째 인자(outColumns)를 의도적으로 무시한다 — 실사용 환경(xterm 5.5)과 동일. */
  translateToString(_trimRight?: boolean, startColumn = 0, endColumn?: number): string {
    const end = endColumn ?? this.cells.length
    return this.cells.slice(startColumn, end).map((c) => c.chars).join('')
  }
}

/** `y` 순서대로 나열한 라인들로 `{ getLine }` 버퍼를 만든다. `wideChars` 는 2셀로 렌더링할 문자 집합. */
export function createFakeBuffer(
  lines: FakeLineSpec[],
  wideChars: string[] = []
): { getLine(y: number): FakeBufferLine | undefined } {
  const wideSet = new Set(wideChars)
  const fakeLines = lines.map((l) => new FakeBufferLine(l.text, l.isWrapped ?? false, wideSet))
  return { getLine: (y: number) => fakeLines[y] }
}
