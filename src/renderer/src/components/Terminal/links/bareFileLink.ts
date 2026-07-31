/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/src/lib/terminal-bare-file-link-detection.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * Portions ported from VSCode (https://github.com/microsoft/vscode)
 * Original: src/vs/workbench/contrib/terminal/browser/links/terminalWordLinkDetector.ts
 * Copyright (c) Microsoft Corporation. All rights reserved. — MIT License
 *
 * 변경: 없음 — 확장자 없는 파일명 후보 판정 로직은 원본과 동일하다. `EXTENSIONLESS_FILENAMES`
 * 화이트리스트도 그대로 유지(ADR-v2-terminal-p2-05 §레이어 2, "확장자 화이트리스트 방식 폐기" 는
 * 경로 매칭 방식 얘기이지 이 화이트리스트와는 별개다).
 */

import { detectRanges, rangesOverlap, toFileLinkCandidate } from './terminalPathRegex'
import type { FileLinkCandidate } from './terminalPathRegex'

// `:` 는 line:col 접미 파서가 처리하므로 여기서는 구분자로 취급하지 않는다.
const WORD_TOKEN_REGEX = /[^\s()[\]{}'",;<>|`]+/g

/** 구분자 없이도 링크로 인정하는 무확장자 프로젝트 파일 — G15. */
export const EXTENSIONLESS_FILENAMES = new Set([
  'Makefile',
  'Dockerfile',
  'Rakefile',
  'Gemfile',
  'Procfile',
  'LICENSE',
  'README',
  'CHANGELOG',
  'AUTHORS',
  'NOTICE',
  'CONTRIBUTING'
])

const BARE_FILENAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._+-]*$/
const MAX_BARE_FILENAME_TOKEN_LENGTH = 120

function looksLikeFilename(token: string): boolean {
  if (token.length < 2 || token.length > 100) return false
  if (!BARE_FILENAME_PATTERN.test(token)) return false
  if (/^\d+$/.test(token)) return false
  if (token.includes('.')) return !/^\.+$/.test(token)
  return EXTENSIONLESS_FILENAMES.has(token)
}

/**
 * 구분자가 없는 "맨 파일명" 후보(`Makefile`, `package.json`) — 산문과 구분할 방법이 없으므로
 * 반드시 존재 검증(레이어 5)을 통과해야만 실제 링크가 된다. 이미 다른 패스가 점유한 범위는
 * 건너뛴다(경로 안의 일부 토큰을 중복 링크하지 않는다).
 */
export function detectBareFilenameLinks(
  lineText: string,
  claimedRanges: readonly [number, number][]
): FileLinkCandidate[] {
  const links: FileLinkCandidate[] = []
  for (const range of detectRanges(lineText, WORD_TOKEN_REGEX)) {
    if (rangesOverlap(range, claimedRanges)) continue
    // hover 마다 도는 스캔이다 — 거대한 구분자 없는 토큰 하나에 시간을 쓰지 않는다.
    if (range.text.length > MAX_BARE_FILENAME_TOKEN_LENGTH) continue
    const link = toFileLinkCandidate(range)
    if (!link || !looksLikeFilename(link.pathText)) continue
    links.push(link)
  }
  return links
}
