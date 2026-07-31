/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/src/lib/terminal-links.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * Portions ported from VSCode (https://github.com/microsoft/vscode)
 * Original: src/vs/workbench/contrib/terminal/browser/links/terminalLocalLinkDetector.ts
 * Copyright (c) Microsoft Corporation. All rights reserved. — MIT License
 * (Orca 자신도 이 파일을 "Ported from VSCode's terminal link detectors" 라고 명시한다 — 이중 고지.)
 *
 * 변경: worktree(다중 워크스페이스 루트) 판정, `file://` URI 패스, 원격 런타임(SSH) 분기는
 * Clauday 에 해당 개념이 없어 전부 제거했다. 경로 후보 추출(구분자 필수 패턴 + 공백 3-pass)만
 * 남기고, cwd 결합/`~` 확장(원본 `resolveTerminalFileLink*`)은 main 의 `TERMINAL_RESOLVE_PATH` 로
 * 옮겼다 — 이 파일은 "문자열 후보를 뽑는다" 까지만 담당한다 (ADR-v2-terminal-p2-05 §레이어 2).
 */

import { parsePathLineColumn } from './lineColumn'

/** 정규식 매치에서 경계 구두점(따옴표/괄호류)을 잘라낸 원시 후보 범위. */
export interface TextRange {
  startIndex: number
  endIndex: number
  text: string
}

/** line:col 분리 + 위치 정보까지 붙은 최종 후보. */
export interface FileLinkCandidate {
  pathText: string
  line: number | null
  column: number | null
  startIndex: number
  endIndex: number
  displayText: string
}

const LEADING_TRIM_CHARS = new Set(['(', '[', '{', '"', "'"])
const TRAILING_TRIM_CHARS = new Set([')', ']', '}', '"', "'", ',', ';', '.'])

// 구분자(`/`, `\`) 를 포함하는 압축 경로 — `./src/foo.ts`, `/abs/bar`, `src/foo.ts:12:3` 등.
// 프레임워크 라우트 파일(`app/(shop)/products/[id]/page.tsx`)처럼 괄호 세그먼트를 쓰는 경우가
// 흔해 괄호류도 허용 문자에 포함한다.
const LOCAL_PATH_REGEX =
  /(?:~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/]|[A-Za-z0-9._-]+[\\/])[A-Za-z0-9._~\-/%+@\\()[\]]*(?::\d+)?(?::\d+)?/g

// 공백 포함 경로 3-pass 가 공유하는 "넓은" 후보 정규식 — ReDoS 회피를 위해 정규식 자체는 하나의
// 부정 문자 클래스로 선형 스캔만 하고, 세 가지 판정(구분자 뒤 공백/확장자 종료/줄 끝 공백)은
// 코드에서 후보를 좁힌다 (ADR-05 §레이어 2).
const SPACED_PATH_CANDIDATE_REGEX =
  /(?:~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/]|[A-Za-z0-9._-]+[\\/])[^()[\]{}'",;<>|`\r\n]+(?::\d+)?(?::\d+)?/g

const URI_PREFIX_CHAR_PATTERN = /^[A-Za-z0-9+./:-]$/

function hasPathSeparator(text: string): boolean {
  return text.includes('/') || text.includes('\\')
}

function hasSeparatorAfterWhitespace(text: string): boolean {
  let sawWhitespace = false
  for (const char of text) {
    if (/\s/.test(char)) { sawWhitespace = true; continue }
    if (sawWhitespace && (char === '/' || char === '\\')) return true
  }
  return false
}

function hasInternalWhitespaceBeforeTrimmedEnd(text: string): boolean {
  return /\s/.test(text.trimEnd())
}

function isAtTrimmedLineEnd(lineText: string, endIndex: number): boolean {
  return lineText.slice(endIndex).trim().length === 0
}

function countPathStarts(text: string): number {
  let count = 0
  for (const _m of text.matchAll(/(?:^|\s)(?:~[\\/]|[\\/]|\.{1,2}[\\/]|[A-Za-z]:[\\/])/g)) count += 1
  return count
}

function trimSpacedPathTrailingProse(range: TextRange): TextRange {
  // 확장자로 끝나는 한 경로만 남기고, 그 뒤의 산문(prose)이나 별개의 두 번째 경로는 버린다.
  let selected: string | null = null
  const extensionPattern = /\.[A-Za-z0-9_+-]+(?::\d+)?(?::\d+)?(?=\s+|$)/g
  let match: RegExpExecArray | null
  while ((match = extensionPattern.exec(range.text)) !== null) {
    const end = match.index + match[0].length
    const text = range.text.slice(0, end)
    if (countPathStarts(text) > 1) continue
    if (end < range.text.length || selected === null || /[\\/]/.test(range.text.slice(selected.length, end))) {
      selected = text
    }
  }
  if (!selected) return range
  return { text: selected, startIndex: range.startIndex, endIndex: range.startIndex + selected.length }
}

function hasSpacedPathExtension(text: string): boolean {
  const trimmed = trimSpacedPathTrailingProse({ text, startIndex: 0, endIndex: text.length }).text.trimEnd()
  return /\s/.test(trimmed) && /\.[A-Za-z0-9_+-]+(?::\d+)?(?::\d+)?$/.test(trimmed)
}

function trimTrailingWhitespace(range: TextRange): TextRange {
  const text = range.text.trimEnd()
  return { text, startIndex: range.startIndex, endIndex: range.startIndex + text.length }
}

function getImmediateUriPrefix(lineText: string, endIndex: number): string {
  let start = endIndex
  while (start > 0 && URI_PREFIX_CHAR_PATTERN.test(lineText[start - 1])) start -= 1
  return lineText.slice(start, endIndex)
}

/** `https://host/path` 의 `//host/path` 부분이 로컬 경로로 잘못 잡히는 것을 막는다. */
function isInsideUriScheme(lineText: string, range: TextRange): boolean {
  const prefix = getImmediateUriPrefix(lineText, range.startIndex)
  return (
    range.text.includes('://') ||
    (/[A-Za-z][A-Za-z0-9+.-]*:(?:\/\/)?$/.test(prefix) && (prefix.endsWith('://') || range.text.startsWith('//')))
  )
}

/** 매치에서 경계 구두점을 잘라낸 범위들을 순회한다. */
export function* detectRanges(lineText: string, regex: RegExp): Generator<TextRange> {
  for (const match of lineText.matchAll(regex)) {
    const rawStart = match.index ?? 0
    const value = match[0]
    let start = 0
    let end = value.length
    while (start < end && LEADING_TRIM_CHARS.has(value[start])) start += 1
    while (end > start && TRAILING_TRIM_CHARS.has(value[end - 1])) end -= 1
    if (start >= end) continue
    yield { text: value.slice(start, end), startIndex: rawStart + start, endIndex: rawStart + end }
  }
}

export function mergeRanges(ranges: [number, number][]): [number, number][] {
  if (ranges.length <= 1) return ranges
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const merged: [number, number][] = []
  for (const range of sorted) {
    const last = merged.at(-1)
    if (!last || range[0] > last[1]) { merged.push([range[0], range[1]]); continue }
    last[1] = Math.max(last[1], range[1])
  }
  return merged
}

/** claimedRanges 는 startIndex 오름차순으로 정렬돼 있다고 가정 — 이진 탐색으로 겹침을 확인한다. */
export function rangesOverlap(range: TextRange, claimedRanges: readonly [number, number][]): boolean {
  let low = 0
  let high = claimedRanges.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (claimedRanges[mid][0] < range.endIndex) low = mid + 1
    else high = mid
  }
  const previous = claimedRanges[low - 1]
  return previous !== undefined && previous[1] > range.startIndex
}

export function insertClaimedRange(claimedRanges: [number, number][], range: [number, number]): void {
  const last = claimedRanges.at(-1)
  if (!last || last[0] <= range[0]) { claimedRanges.push(range); return }
  let low = 0
  let high = claimedRanges.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (claimedRanges[mid][0] <= range[0]) low = mid + 1
    else high = mid
  }
  claimedRanges.splice(low, 0, range)
}

export function toFileLinkCandidate(range: TextRange): FileLinkCandidate | null {
  const parsed = parsePathLineColumn(range.text)
  if (!parsed) return null
  return {
    pathText: parsed.pathText,
    line: parsed.line,
    column: parsed.column,
    startIndex: range.startIndex,
    endIndex: range.endIndex,
    displayText: range.text
  }
}

function buildLineEndingSpacedPathPrefixRanges(range: TextRange): TextRange[] {
  const ranges: TextRange[] = []
  for (const match of range.text.matchAll(/\s+/g)) {
    const endIndex = match.index ?? 0
    const text = range.text.slice(0, endIndex).trimEnd()
    if (text.includes(' ')) ranges.push({ text, startIndex: range.startIndex, endIndex: range.startIndex + text.length })
  }
  return ranges.toReversed()
}

/**
 * 공백을 포함한 경로 3-pass: 같은 넓은 후보 정규식을 재사용하고, 통과 조건만 3가지로 갈린다
 * (① 구분자 뒤 공백이 있는가 ② 확장자로 끝나는가 ③ 줄 끝까지 공백을 포함해 이어지는가).
 * `includeLineEndingPrefixCandidates` 가 켜지면 ③ 케이스에서 공백 경계마다 점점 짧아지는 후보들도
 * 함께 반환한다(hover 시 존재 검증으로 가장 먼저 맞는 후보를 찾기 위함).
 */
function detectSpacedLocalPathLinks(
  lineText: string,
  includeLineEndingPrefixCandidates: boolean
): FileLinkCandidate[] {
  const links: FileLinkCandidate[] = []
  const claimedRanges: [number, number][] = []
  const passes: Array<(text: string, lineText: string, endIndex: number) => boolean> = [
    (text) => hasSeparatorAfterWhitespace(text),
    (text) => hasSpacedPathExtension(text),
    (text, line, endIndex) => hasInternalWhitespaceBeforeTrimmedEnd(text) && isAtTrimmedLineEnd(line, endIndex)
  ]
  passes.forEach((accepts, passIndex) => {
    for (const range of detectRanges(lineText, SPACED_PATH_CANDIDATE_REGEX)) {
      if (!accepts(range.text, lineText, range.endIndex)) continue
      if (rangesOverlap(range, claimedRanges) || isInsideUriScheme(lineText, range)) continue
      const isLineEndingPass = passIndex === 2
      const candidateRanges = includeLineEndingPrefixCandidates && isLineEndingPass
        ? [range, ...buildLineEndingSpacedPathPrefixRanges(range)]
        : [range]
      const candidateLinks = candidateRanges
        .map((r) => toFileLinkCandidate(trimSpacedPathTrailingProse(trimTrailingWhitespace(r))))
        .filter((link): link is FileLinkCandidate => link !== null)
      const primary = candidateLinks[0]
      if (primary) {
        for (const link of candidateLinks) links.push(link)
        insertClaimedRange(claimedRanges, [primary.startIndex, primary.endIndex])
      }
    }
  })
  return links
}

/**
 * 구분자(`/`,`\`) 를 포함하는 경로 후보를 모두 추출한다 — 공백 포함 경로가 먼저 범위를 선점하고,
 * 남은 자리에서 압축 정규식(`LOCAL_PATH_REGEX`)이 스캔한다 (ADR-v2-terminal-p2-05 §레이어 2).
 */
export function detectLocalPathLinks(
  lineText: string,
  includeLineEndingPrefixCandidates = false
): FileLinkCandidate[] {
  if (!hasPathSeparator(lineText)) return []

  const links: FileLinkCandidate[] = []
  const spacedLinks = detectSpacedLocalPathLinks(lineText, includeLineEndingPrefixCandidates)
  const spacedRanges = mergeRanges(spacedLinks.map(({ startIndex, endIndex }): [number, number] => [startIndex, endIndex]))
  links.push(...spacedLinks)

  for (const range of detectRanges(lineText, LOCAL_PATH_REGEX)) {
    if (rangesOverlap(range, spacedRanges)) continue
    if (isInsideUriScheme(lineText, range)) continue
    if (!/[\\/]/.test(range.text)) continue
    const link = toFileLinkCandidate(range)
    if (link) links.push(link)
  }
  return links.sort((a, b) => a.startIndex - b.startIndex || b.endIndex - a.endIndex)
}
