/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/src/components/terminal-pane/wrapped-terminal-link-ranges.ts (v1.4.162)
 * Original: src/renderer/src/components/terminal-pane/hard-wrapped-terminal-path-fragments.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: 두 원본 파일(soft/hard wrap 재구성 + 조각 판정 술어)을 plan.md 의 파일 목록에 맞춰 하나로
 * 합쳤다. `dedupeLogicalLines`/`buildCandidateLogicalLinesForBufferPosition`(원본
 * terminal-file-link-hit-testing.ts)도 fingerprint 재검증에 필요해 함께 포함했다. 로직 자체는
 * 변경하지 않았다 — xterm 5.5 stable 에는 `translateToString(..., outColumns)` 가 없으므로
 * `translateLineWithColumns` 는 항상 셀 단위 폴백(`translateLineWithCells`)으로 떨어진다
 * (Orca 노트 §0, xterm 6.x 전용 API 미사용).
 */

// xterm 의 실제 `IBufferLine`/`IBufferRange` 는 각각 20여 개 멤버를 가진 무거운 인터페이스라,
// 우리가 실제로 쓰는 부분만 로컬로 좁혀 선언한다 — 프로덕션에서는 진짜 `terminal.buffer.active`
// 의 라인(구조적으로 이 좁은 인터페이스의 상위집합)이 그대로 들어오고, 테스트에서는 이 좁은
// 계약만 만족하는 가벼운 더미(`fakeXtermBuffer.ts`)를 쓸 수 있다.
interface TerminalBufferCell {
  getWidth(): number
  getChars(): string
}

interface TerminalBufferLine {
  readonly length: number
  readonly isWrapped: boolean
  getCell(x: number): TerminalBufferCell | undefined
  translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number, outColumns?: number[]): string
}

export interface BufferRange {
  start: { x: number; y: number }
  end: { x: number; y: number }
}

interface WrappedLogicalRow {
  y: number
  text: string
  sourceText: string
  columns: number[]
  startIndex: number
  isWrapped: boolean
  lineLength: number
}

export interface WrappedLogicalLine {
  text: string
  rows: WrappedLogicalRow[]
  fingerprint: string
}

/** soft wrap 재구성 상한 — 200행 / 20,000자 (ADR-05 §레이어 3, G18). */
const MAX_SOFT_WRAPPED_LINK_ROWS = 200
const MAX_SOFT_WRAPPED_LINK_CHARS = 20_000
/** hard wrap(claude TUI 같은 물리적 줄바꿈) 역스캔 상한 — 20행. */
const DEFAULT_HARD_WRAP_MAX_ROWS = 20

// ---- 셀 ↔ 문자열 인덱스 매핑 -------------------------------------------------------------

function translateLineWithCells(line: TerminalBufferLine): { text: string; columns: number[] } | null {
  let text = ''
  const columns: number[] = []
  let endColumn = 0

  for (let x = 0; x < line.length; x++) {
    const cell = line.getCell(x)
    if (!cell) return null
    const width = cell.getWidth()
    if (width === 0) continue // wide 문자의 두 번째(빈) 셀
    const chars = cell.getChars() || ' '
    text += chars
    for (let i = 0; i < chars.length; i++) columns.push(x)
    endColumn = x + Math.max(width, 1)
  }
  columns.push(endColumn)
  return { text, columns }
}

/**
 * 문자열 인덱스 → 셀 좌표 매핑 테이블을 만든다. xterm 5.5 는 `translateToString` 의 4번째 인자
 * (`outColumns`, 6.x 전용)를 지원하지 않으므로 `columns` 는 항상 채워지지 않고, 셀 단위 순회로
 * 폴백한다(East Asian Wide 판정을 우리가 다시 하지 않고 xterm 이 실제로 배치한 셀을 읽는다).
 */
export function translateLineWithColumns(line: TerminalBufferLine): { text: string; columns: number[] } {
  const columns: number[] = []
  const text = line.translateToString(false, 0, undefined, columns)
  if (columns.length === text.length + 1) return { text, columns }

  const cellTranslation = translateLineWithCells(line)
  if (cellTranslation) return cellTranslation

  return { text, columns: Array.from({ length: text.length + 1 }, (_v, i) => i) }
}

// ---- soft wrap ---------------------------------------------------------------------------

function getWrappedRowsFingerprint(rows: WrappedLogicalRow[]): string {
  return rows.map((row) => `${row.y}:${row.isWrapped ? 1 : 0}:${row.lineLength}:${row.sourceText}\0${row.text}`).join('\n')
}

function toWrappedLogicalLine(rows: WrappedLogicalRow[], text: string): WrappedLogicalLine {
  return { text, rows: [...rows], fingerprint: getWrappedRowsFingerprint(rows) }
}

/**
 * `bufferLineNumber`(1-based) 가 속한 soft-wrap 블록 전체를 이어붙인다 — `isWrapped` 를 따라
 * 앞뒤로 확장한다. 상한을 넘으면(200행/20,000자) 안전하게 `null` 을 반환한다.
 */
export function buildWrappedLogicalLine(
  buffer: { getLine(y: number): TerminalBufferLine | undefined },
  bufferLineNumber: number
): WrappedLogicalLine | null {
  const y = bufferLineNumber - 1
  if (!buffer.getLine(y)) return null

  let startY = y
  let rowCount = 1
  while (startY > 0 && buffer.getLine(startY)?.isWrapped) {
    if (rowCount >= MAX_SOFT_WRAPPED_LINK_ROWS) return null
    startY--
    rowCount++
  }
  let endY = y
  while (buffer.getLine(endY + 1)?.isWrapped) {
    if (rowCount >= MAX_SOFT_WRAPPED_LINK_ROWS) return null
    endY++
    rowCount++
  }

  let text = ''
  const rows: WrappedLogicalRow[] = []
  for (let rowY = startY; rowY <= endY; rowY++) {
    const line = buffer.getLine(rowY)
    if (!line) return null
    const translated = translateLineWithColumns(line)
    if (text.length + translated.text.length > MAX_SOFT_WRAPPED_LINK_CHARS) return null
    rows.push({
      y: rowY,
      text: translated.text,
      sourceText: translated.text,
      columns: translated.columns,
      startIndex: text.length,
      isWrapped: line.isWrapped,
      lineLength: line.length
    })
    text += translated.text
  }
  return toWrappedLogicalLine(rows, text)
}

// ---- hard wrap 조각 판정 술어 ------------------------------------------------------------

interface HardWrappedPathFragmentRow {
  text: string
  sourceText: string
  columns: number[]
  isWrapped: boolean
  lineLength: number
}

const HARD_WRAPPED_PATH_FRAGMENT_PATTERN = /^[A-Za-z0-9._~@%+=:,/\\-]+$/

function isHardWrappedPathFragment(text: string): boolean {
  return HARD_WRAPPED_PATH_FRAGMENT_PATTERN.test(text) && /[A-Za-z0-9]/.test(text)
}

/** 줄이 완전한 루트/드라이브/상대 접두사에서 그대로 끝난 경우(다음 줄이 이어받아야 완성됨). */
function isIncompleteHardWrappedPathStart(text: string): boolean {
  return /^(?:[/\\]|\.{1,2}\/|~\/|[A-Za-z]:)$/.test(text)
}

function isHardWrappedPathContinuation(text: string): boolean {
  return isHardWrappedPathFragment(text) || isIncompleteHardWrappedPathStart(text)
}

/** 이 줄(또는 줄의 접미)이 hard-wrap 경로의 "시작"이 될 수 있는가. */
function canStartHardWrappedPath(text: string): boolean {
  if (!isHardWrappedPathFragment(text)) {
    return /(?:^|[\s•*>-])(?:\/|\.{1,2}\/|[A-Za-z0-9._-]+\/)[A-Za-z0-9._~@%+=:,/\\-]*$/.test(text)
  }
  return /(?:\/|\\)/.test(text)
}

function sliceFragmentRow(row: HardWrappedPathFragmentRow, startIndex: number, endIndex: number): HardWrappedPathFragmentRow {
  return { ...row, text: row.text.slice(startIndex, endIndex), columns: row.columns.slice(startIndex, endIndex + 1) }
}

function getHardWrappedPathSuffix(row: HardWrappedPathFragmentRow): HardWrappedPathFragmentRow | null {
  let startIndex = row.text.length
  while (startIndex > 0 && HARD_WRAPPED_PATH_FRAGMENT_PATTERN.test(row.text[startIndex - 1])) startIndex--
  const suffix = sliceFragmentRow(row, startIndex, row.text.length)
  return isHardWrappedPathContinuation(suffix.text) ? suffix : null
}

function getHardWrappedPathPrefix(row: HardWrappedPathFragmentRow): HardWrappedPathFragmentRow | null {
  let endIndex = 0
  while (endIndex < row.text.length && HARD_WRAPPED_PATH_FRAGMENT_PATTERN.test(row.text[endIndex])) endIndex++
  const prefix = sliceFragmentRow(row, 0, endIndex)
  return isHardWrappedPathContinuation(prefix.text) ? prefix : null
}

function trimHardWrappedPathRow(line: TerminalBufferLine): HardWrappedPathFragmentRow | null {
  const translated = translateLineWithColumns(line)
  const startIndex = translated.text.search(/\S/)
  if (startIndex === -1) return null
  let endIndex = translated.text.length
  while (endIndex > startIndex && /\s/.test(translated.text[endIndex - 1])) endIndex--
  return {
    text: translated.text.slice(startIndex, endIndex),
    sourceText: translated.text,
    columns: translated.columns.slice(startIndex, endIndex + 1),
    isWrapped: line.isWrapped,
    lineLength: line.length
  }
}

function toWrappedLogicalRow(row: HardWrappedPathFragmentRow, y: number, startIndex: number): WrappedLogicalRow {
  return { y, text: row.text, sourceText: row.sourceText, columns: row.columns, startIndex, isWrapped: row.isWrapped, lineLength: row.lineLength }
}

/**
 * claude TUI 같은 hard wrap(=`isWrapped` 플래그 없이 물리적으로 다음 줄에 이어지는 출력)을
 * 재구성한다. 현재 줄에서 최대 `maxRows`(기본 20) 만큼 역스캔하며 "이 줄이 경로 조각으로 시작해서
 * 다음 줄들도 경로 문자로 이어지는가"를 판정한다 — 여러 후보(줄 전체 시작 / 줄 끝 접미부 시작)를
 * 반환할 수 있다(행 수 내림차순 정렬 — 가장 긴 후보가 먼저).
 */
export function buildHardWrappedPathLogicalLineCandidates(
  buffer: { getLine(y: number): TerminalBufferLine | undefined },
  bufferLineNumber: number,
  maxRows = DEFAULT_HARD_WRAP_MAX_ROWS
): WrappedLogicalLine[] {
  const currentY = bufferLineNumber - 1
  if (!buffer.getLine(currentY)) return []

  const minY = Math.max(0, currentY - maxRows + 1)
  const candidates: WrappedLogicalLine[] = []

  for (let startY = currentY; startY >= minY; startY--) {
    const startLine = buffer.getLine(startY)
    const start = startLine ? trimHardWrappedPathRow(startLine) : null
    if (!start) continue

    const canStartWholeRow = canStartHardWrappedPath(start.text)
    const startSuffix = getHardWrappedPathSuffix(start)
    const canStartBoundary = Boolean(
      startSuffix && (canStartHardWrappedPath(startSuffix.text) || isIncompleteHardWrappedPathStart(startSuffix.text))
    )
    if (!canStartWholeRow && !canStartBoundary) continue

    const sourceRows: { row: HardWrappedPathFragmentRow; y: number }[] = [{ row: start, y: startY }]
    for (let rowY = startY + 1; rowY < startY + maxRows; rowY++) {
      const line = buffer.getLine(rowY)
      const row = line ? trimHardWrappedPathRow(line) : null
      if (!row) break
      sourceRows.push({ row, y: rowY })
      if (!isHardWrappedPathContinuation(row.text)) break
    }

    let lastWholeCandidateText: string | null = null
    if (canStartWholeRow) {
      let text = ''
      const rows: WrappedLogicalRow[] = []
      for (const sourceRow of sourceRows) {
        if (sourceRow.y > startY && !isHardWrappedPathFragment(sourceRow.row.text)) break
        rows.push(toWrappedLogicalRow(sourceRow.row, sourceRow.y, text.length))
        text += sourceRow.row.text
        if (sourceRow.y >= currentY) {
          candidates.push(toWrappedLogicalLine(rows, text))
          lastWholeCandidateText = text
        }
      }
    }

    if (!startSuffix || !canStartBoundary) continue
    let boundaryText = startSuffix.text
    const boundaryRows = [toWrappedLogicalRow(startSuffix, startY, 0)]
    let reachedMixedContinuation = false
    for (let rowIndex = 1; rowIndex < sourceRows.length; rowIndex++) {
      const sourceRow = sourceRows[rowIndex]
      if (isHardWrappedPathContinuation(sourceRow.row.text)) {
        boundaryRows.push(toWrappedLogicalRow(sourceRow.row, sourceRow.y, boundaryText.length))
        boundaryText += sourceRow.row.text
        continue
      }
      reachedMixedContinuation = true
      const finalPrefix = getHardWrappedPathPrefix(sourceRow.row)
      if (finalPrefix && finalPrefix.text.length < sourceRow.row.text.length) {
        boundaryRows.push(toWrappedLogicalRow(finalPrefix, sourceRow.y, boundaryText.length))
        boundaryText += finalPrefix.text
        if (sourceRow.y >= currentY && canStartHardWrappedPath(boundaryText)) {
          candidates.push(toWrappedLogicalLine(boundaryRows, boundaryText))
        }
      }
      break
    }

    const lastBoundaryRow = boundaryRows.at(-1)!
    if (
      !reachedMixedContinuation &&
      isIncompleteHardWrappedPathStart(startSuffix.text) &&
      boundaryRows.length >= 2 &&
      lastBoundaryRow.y >= currentY &&
      canStartHardWrappedPath(boundaryText) &&
      lastWholeCandidateText !== boundaryText
    ) {
      candidates.push(toWrappedLogicalLine(boundaryRows, boundaryText))
    }
  }

  return candidates.sort((a, b) => b.rows.length - a.rows.length)
}

// ---- 조회 헬퍼 ----------------------------------------------------------------------------

export function dedupeLogicalLines(logicalLines: WrappedLogicalLine[]): WrappedLogicalLine[] {
  const seen = new Set<string>()
  return logicalLines.filter((line) => {
    if (seen.has(line.fingerprint)) return false
    seen.add(line.fingerprint)
    return true
  })
}

/** hard wrap 후보 + soft wrap 논리 라인을 한 번에 모아 중복(fingerprint 동일)을 제거한다. */
export function buildCandidateLogicalLines(
  buffer: { getLine(y: number): TerminalBufferLine | undefined },
  bufferLineNumber: number
): WrappedLogicalLine[] {
  const hardWrapped = buildHardWrappedPathLogicalLineCandidates(buffer, bufferLineNumber)
  const softWrapped = buildWrappedLogicalLine(buffer, bufferLineNumber)
  return dedupeLogicalLines(softWrapped ? [...hardWrapped, softWrapped] : hardWrapped)
}

// ---- 논리 인덱스 → 버퍼 좌표 --------------------------------------------------------------

function mapLogicalIndexToBufferPosition(
  logicalLine: WrappedLogicalLine,
  index: number,
  bias: 'start' | 'end'
): { x: number; y: number } | null {
  for (let rowIndex = 0; rowIndex < logicalLine.rows.length; rowIndex++) {
    const row = logicalLine.rows[rowIndex]
    const rowStart = row.startIndex
    const rowEnd = rowStart + row.text.length
    const isTarget = bias === 'start'
      ? index < rowEnd || (index === rowEnd && rowIndex === logicalLine.rows.length - 1)
      : index <= rowEnd && (index > rowStart || rowIndex === 0)
    if (!isTarget) continue
    const localIndex = Math.max(0, Math.min(index - rowStart, row.columns.length - 1))
    const column = row.columns[localIndex] ?? localIndex
    return { x: column, y: row.y + 1 }
  }
  return null
}

/** 논리 라인 안의 `[startIndex, endIndex)` 문자열 구간을 xterm `ILink.range`(1-based, inclusive)로 변환한다. */
export function rangeForLogicalLineSpan(
  logicalLine: WrappedLogicalLine,
  startIndex: number,
  endIndex: number
): BufferRange | null {
  const start = mapLogicalIndexToBufferPosition(logicalLine, startIndex, 'start')
  const end = mapLogicalIndexToBufferPosition(logicalLine, endIndex, 'end')
  if (!start || !end) return null
  return { start: { x: start.x + 1, y: start.y }, end: { x: end.x, y: end.y } }
}
