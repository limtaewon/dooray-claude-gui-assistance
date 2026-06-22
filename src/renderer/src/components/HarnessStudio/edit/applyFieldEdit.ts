/**
 * applyFieldEdit.ts — frontmatter 필드 치환 순수 함수
 *
 * 구조화 폼 편집의 핵심 로직.
 * `(파일텍스트, fieldPath, newValue) → 새 파일텍스트` 변환을 수행한다.
 *
 * 지원하는 fieldPath:
 * - 'model'          : frontmatter `model:` 스칼라 치환 (없으면 신규 추가)
 * - 'tools'          : frontmatter `tools:` 인라인 리스트 치환 (없으면 신규 추가)
 * - 'allowed-tools'  : frontmatter `allowed-tools:` 인라인 리스트 치환 (없으면 신규 추가)
 *
 * 설계 원칙:
 * - CRLF/BOM 보존: Windows 에서 작성된 번들은 '\r\n' 을 유지해야 한다.
 *   내부 처리는 LF 로 정규화 후 원본 줄끝 문자로 복원한다.
 * - 멱등성: 동일 내용으로 재치환 시 결과가 변하지 않아야 한다.
 * - frontmatter 없는 파일: 파일 맨 앞에 frontmatter 블록 신규 생성.
 * - 인접 블록 스칼라(description: >) 를 건드리지 않는다.
 *
 * 제약:
 * - 이 파일은 순수 함수만 담는다. electron / Node fs / React 의존 금지.
 * - 테스트 단독 실행 가능.
 * - main 측에서 직접 import 하지 않는다 (renderer 전용 로직).
 */

// ─────────────────────────────────────────────
// 지원 fieldPath 타입
// ─────────────────────────────────────────────

/** applyFieldEdit 이 처리하는 YAML 키 이름 */
export type FieldLocator = 'model' | 'tools' | 'allowed-tools'

// ─────────────────────────────────────────────
// 내부 유틸리티
// ─────────────────────────────────────────────

/**
 * 파일 내용의 줄끝 문자를 감지한다.
 * CRLF 가 과반이면 'CRLF', 그 외는 'LF'.
 */
function detectLineEnding(content: string): 'CRLF' | 'LF' {
  const crlfCount = (content.match(/\r\n/g) ?? []).length
  const lfCount = (content.match(/(?<!\r)\n/g) ?? []).length
  return crlfCount > lfCount ? 'CRLF' : 'LF'
}

/**
 * 줄끝을 LF 로 정규화한다. BOM 도 제거한다.
 */
function normalizeLF(content: string): string {
  return content.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * LF 기준 내용을 원본 줄끝 문자(CRLF/LF)로 복원한다.
 */
function restoreLineEnding(content: string, ending: 'CRLF' | 'LF'): string {
  if (ending === 'CRLF') {
    return content.replace(/\n/g, '\r\n')
  }
  return content
}

/**
 * 파일 내용에서 frontmatter 블록(--- ... ---)의 범위를 찾는다.
 * @returns { start, end } frontmatter 원문의 인덱스 범위 (LF 정규화된 텍스트 기준),
 *          또는 frontmatter 가 없으면 null.
 *          start 는 첫 '---\n' 시작, end 는 닫는 '---' 뒤 '\n' 포함 끝.
 */
function findFrontmatterRange(content: string): { start: number; end: number } | null {
  if (!content.startsWith('---')) return null
  const closeIdx = content.indexOf('\n---', 3)
  if (closeIdx === -1) return null
  // closeIdx 는 '\n---' 의 '\n' 위치
  // '\n---' 다음에 '\n' 또는 파일 끝이 있어야 진짜 닫힘
  const afterClose = closeIdx + 4 // '\n---' 4자
  const charAfter = content[afterClose]
  if (charAfter !== undefined && charAfter !== '\n' && charAfter !== '\r') return null
  const end = charAfter === '\n' ? afterClose + 1 : afterClose
  return { start: 0, end }
}

/**
 * frontmatter 원문(--- 포함) 에서 특정 키의 줄 인덱스를 찾는다.
 * 키가 없으면 -1 을 반환한다.
 *
 * @param lines frontmatter 전체(--- 포함)를 split('\n') 한 배열
 * @param key   찾을 YAML 키 (예: 'model', 'tools', 'allowed-tools')
 */
function findKeyLineIndex(lines: string[], key: string): number {
  const pattern = new RegExp(`^${escapeRegex(key)}\\s*:`)
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i
  }
  return -1
}

/** 정규식 특수문자 이스케이프 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 스칼라 키-값 줄을 새 값으로 교체한 문자열을 반환한다.
 * 기존 줄의 들여쓰기를 유지한다.
 */
function replaceScalarLine(line: string, key: string, newValue: string): string {
  const indent = line.match(/^(\s*)/)?.[1] ?? ''
  return `${indent}${key}: ${newValue}`
}

/**
 * 도구 목록 배열을 YAML 인라인 시퀀스 문자열로 직렬화한다.
 * 예) ['Read', 'Edit'] → 'Read, Edit'
 * 블록 시퀀스가 아닌 인라인(콤마 분리) 형식을 사용한다.
 */
function serializeToolList(tools: string[]): string {
  return tools.join(', ')
}

/**
 * frontmatter 원문에서 블록 시퀀스(`- item`) 의 줄 범위를 찾는다.
 * keyLineIndex 바로 아래 들여쓰기 `  - ` 패턴이 이어지는 구간.
 * 반환: 블록이 있으면 [startLine, endLine] (inclusive), 없으면 null.
 */
function findBlockSequenceRange(lines: string[], keyLineIndex: number): [number, number] | null {
  let start = -1
  let end = -1
  for (let i = keyLineIndex + 1; i < lines.length; i++) {
    const trimmed = lines[i].trimStart()
    if (trimmed.startsWith('- ') || trimmed === '-') {
      if (start === -1) start = i
      end = i
    } else if (trimmed === '' || /^\s/.test(lines[i]) === false) {
      // 빈 줄이거나 들여쓰기 없는 새 키 시작 → 블록 끝
      break
    } else {
      // 들여쓰기만 있는 빈 줄 등 → 블록 계속
      if (start !== -1) {
        // 실제 아이템이 없는 들여쓰기 라인이면 중단
        break
      }
    }
  }
  if (start === -1) return null
  return [start, end]
}

// ─────────────────────────────────────────────
// 공개 함수
// ─────────────────────────────────────────────

/**
 * 파일 텍스트의 frontmatter 에서 특정 필드를 새 값으로 치환하거나 신규 추가하여
 * 변경된 파일 전체 텍스트를 반환한다.
 *
 * CRLF/BOM 보존: 원본 줄끝 문자로 최종 복원한다.
 * 멱등성: 동일 값으로 재호출 시 동일 결과를 반환한다.
 *
 * frontmatter 가 없는 파일에 대해 신규 추가할 때는 파일 맨 앞에
 * ```
 * ---
 * <key>: <value>
 * ---
 * ```
 * 블록을 삽입한다.
 *
 * @param fileText  원본 파일 전체 텍스트
 * @param locator   치환할 YAML 키 ('model' | 'tools' | 'allowed-tools')
 * @param newValue  새 값. 스칼라(model)는 string, 리스트(tools/allowed-tools)는 string[]
 * @returns 변경된 파일 전체 텍스트
 *
 * @throws Error locator 가 지원되지 않는 값일 때
 */
export function applyFieldEdit(
  fileText: string,
  locator: FieldLocator,
  newValue: string | string[],
): string {
  if (locator !== 'model' && locator !== 'tools' && locator !== 'allowed-tools') {
    throw new Error(`지원하지 않는 locator: ${locator}. 허용값: model | tools | allowed-tools`)
  }

  const lineEnding = detectLineEnding(fileText)
  const normalized = normalizeLF(fileText)

  const fmRange = findFrontmatterRange(normalized)

  if (fmRange === null) {
    // frontmatter 없음 → 파일 맨 앞에 신규 frontmatter 블록 생성
    const valueStr = locator === 'model'
      ? String(newValue)
      : serializeToolList(Array.isArray(newValue) ? newValue : [String(newValue)])
    const newFm = `---\n${locator}: ${valueStr}\n---\n`
    const result = newFm + normalized
    return restoreLineEnding(result, lineEnding)
  }

  const fmText = normalized.slice(fmRange.start, fmRange.end)
  const bodyAfter = normalized.slice(fmRange.end)

  // frontmatter 를 줄 단위로 분해 (마지막 빈 줄 포함)
  const lines = fmText.split('\n')
  // 마지막 요소가 '' 인 경우가 많음 (trailing newline)

  const keyLineIdx = findKeyLineIndex(lines, locator)

  if (keyLineIdx === -1) {
    // 키 없음 → frontmatter 닫는 '---' 바로 전에 신규 추가
    const closingIdx = lines.findLastIndex((l) => l.trimEnd() === '---')
    const valueStr = locator === 'model'
      ? String(newValue)
      : serializeToolList(Array.isArray(newValue) ? newValue : [String(newValue)])
    const newLine = `${locator}: ${valueStr}`
    if (closingIdx === -1) {
      // 이상한 frontmatter — 끝에 추가
      lines.push(newLine)
    } else {
      lines.splice(closingIdx, 0, newLine)
    }
    const newFmText = lines.join('\n')
    const result = newFmText + bodyAfter
    return restoreLineEnding(result, lineEnding)
  }

  // 키 있음 → 해당 줄 교체
  if (locator === 'model') {
    // 스칼라 단순 치환
    lines[keyLineIdx] = replaceScalarLine(lines[keyLineIdx], locator, String(newValue))
  } else {
    // tools / allowed-tools: 리스트 치환
    const toolList = Array.isArray(newValue) ? newValue : String(newValue).split(/[,\s]+/).filter(Boolean)
    const serialized = serializeToolList(toolList)

    // 기존 값이 블록 시퀀스(- item)인지 인라인인지 확인
    const blockRange = findBlockSequenceRange(lines, keyLineIdx)
    if (blockRange !== null) {
      // 블록 시퀀스를 인라인으로 교체 (아키텍처 결정: 일관성을 위해 인라인 사용)
      lines.splice(blockRange[0], blockRange[1] - blockRange[0] + 1)
      // keyLineIdx 라인 자체도 교체 (블록 삭제 후 키 라인 업데이트)
      lines[keyLineIdx] = replaceScalarLine(lines[keyLineIdx], locator, serialized)
    } else {
      // 인라인 치환
      lines[keyLineIdx] = replaceScalarLine(lines[keyLineIdx], locator, serialized)
    }
  }

  const newFmText = lines.join('\n')
  const result = newFmText + bodyAfter
  return restoreLineEnding(result, lineEnding)
}
