/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/src/lib/explicit-file-link-target.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: Orca 원본은 이 파일에서 cwd 결합/`~` 확장까지 담당한다(`resolveExplicitFileLinkTarget*`).
 * Clauday 는 그 부분을 main 의 `TERMINAL_RESOLVE_PATH`(`resolveCandidates`, expandHome+resolve+stat)
 * 로 옮겼으므로, line:col 파싱과 bare-root 거부 판정만 남기고 경로 해석 로직은 들어내 이식했다
 * (ADR-v2-terminal-p2-05 §레이어 4).
 */

/** line:col 접미 파싱 + bare root 거부 결과. */
export interface ParsedLineColumn {
  pathText: string
  line: number | null
  column: number | null
}

const BARE_ROOT_ONLY_PATTERN = /^[\\/]+$/
const TILDE_ROOT_PATTERN = /^~[\\/]$/
const WINDOWS_DRIVE_ROOT_PATTERN = /^[A-Za-z]:[\\/]$/

/** `/`, `~/`, `C:/` 같은 "루트뿐인" 경로는 디렉터리로도 링크가 되지 않는다 (ADR-05 §레이어 4). */
function isBareRoot(pathText: string): boolean {
  return (
    BARE_ROOT_ONLY_PATTERN.test(pathText) ||
    TILDE_ROOT_PATTERN.test(pathText) ||
    WINDOWS_DRIVE_ROOT_PATTERN.test(pathText)
  )
}

/** 절대/틸드 경로이면서 실제 세그먼트가 있으면(=bare root 가 아니면) trailing separator 를 유지한다. */
function canKeepTrailingSeparator(pathText: string): boolean {
  if (isBareRoot(pathText)) return false
  return /^(?:~[\\/]|[\\/]|[A-Za-z]:[\\/])/.test(pathText)
}

/**
 * `path/to/file.ts:120:8` 형태에서 경로/줄/열을 분리한다. `line<1`/`col<1` 은 거부(null 반환),
 * bare root(`/`, `~/`, `C:/`)도 거부한다 (G16, ADR-05 §레이어 4).
 */
export function parsePathLineColumn(value: string): ParsedLineColumn | null {
  const match = /^(.*?)(?::(\d+))?(?::(\d+))?$/.exec(value)
  if (!match) return null

  const pathText = match[1]
  if (!pathText) return null

  const hasLineOrColumn = Boolean(match[2] || match[3])
  if (/^[\\/]\s/.test(pathText)) return null
  if (/[\\/]$/.test(pathText)) {
    if (hasLineOrColumn || !canKeepTrailingSeparator(pathText)) return null
  }

  const line = match[2] ? Number.parseInt(match[2], 10) : null
  const column = match[3] ? Number.parseInt(match[3], 10) : null
  if ((line !== null && line < 1) || (column !== null && column < 1)) return null

  return { pathText, line, column }
}
