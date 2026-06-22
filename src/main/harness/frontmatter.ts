/**
 * frontmatter.ts — 순수 YAML frontmatter 파서
 *
 * 마크다운 파일 상단의 `---` 블록에서 name / tools / allowed-tools / model / description 을 추출한다.
 * tools 와 allowed-tools 를 모두 인식하며, mcp__... 형태의 MCP 도구명도 포함한다.
 *
 * 의존: 외부 라이브러리 없음 — js-yaml 이 deps 에 없으므로 경량 직접 파싱.
 * ADR-harness-studio-001, ADR-harness-studio-002 참조.
 *
 * 제약: 이 파일은 순수 함수만 담는다. electron / Node fs 의존 금지. 테스트 단독 실행 가능.
 */

/** frontmatter 추출 결과 */
export interface FrontmatterResult {
  /** frontmatter 내 name 값 (없으면 undefined) */
  name?: string
  /** tools: 또는 allowed-tools: 에서 합산한 도구명 목록 (중복 제거) */
  tools: string[]
  /** model: 값 (없으면 undefined) */
  model?: string
  /** description: 값 (여러 줄 folded/literal 포함, 없으면 undefined) */
  description?: string
  /** frontmatter 원문 (bundleHash 계산용) */
  raw: string
}

/**
 * YAML frontmatter 블록(`---` ... `---`)을 텍스트에서 추출하여 반환한다.
 * frontmatter 가 없으면 null 을 반환한다.
 *
 * @param content 마크다운 파일 전체 내용
 */
export function extractFrontmatterRaw(content: string): string | null {
  // BOM 제거 + 줄바꿈 정규화(CRLF/CR → LF).
  // Windows 에서 체크아웃·저작된 번들은 '\r\n' 을 쓰는데, JS 정규식의 '.'·'$' 가 '\r' 을
  // 줄terminator 로 취급해 `name:`/`tools:` 스칼라 추출이 깨진다(크로스플랫폼 회귀).
  const text = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  if (!text.startsWith('---')) return null

  const end = text.indexOf('\n---', 3)
  if (end === -1) return null

  // '---\n' 뒤부터 '\n---' 직전까지
  return text.slice(4, end)
}

/**
 * YAML frontmatter 에서 단일 스칼라 키 값을 추출한다.
 *
 * 지원하는 YAML 형식:
 * - `key: value`
 * - `key: >` / `key: |` (folded/literal 멀티라인, 다음 들여쓰기 블록 전체를 space-join)
 *
 * @param yaml frontmatter 원문
 * @param key 추출할 키
 */
function extractScalar(yaml: string, key: string): string | undefined {
  const lines = yaml.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(new RegExp(`^${escapeRegex(key)}:\\s*(.*)$`))
    if (!match) continue

    const value = match[1].trim()

    // folded(>) / literal(|) 블록 스칼라 — 이어지는 들여쓰기 줄을 이어붙임
    if (value === '>' || value === '|') {
      const bodyLines: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        const bodyLine = lines[j]
        // 들여쓰기가 있거나 빈 줄이면 블록 계속
        if (/^\s/.test(bodyLine) || bodyLine.trim() === '') {
          bodyLines.push(bodyLine.trim())
        } else {
          break
        }
      }
      return bodyLines.filter(Boolean).join(' ').trim() || undefined
    }

    return value || undefined
  }
  return undefined
}

/**
 * YAML frontmatter 에서 시퀀스(list) 키 값을 추출한다.
 *
 * 지원하는 형식:
 * - 인라인: `key: val1, val2, val3`
 * - 블록:
 *   ```
 *   key:
 *     - val1
 *     - val2
 *   ```
 *
 * @param yaml frontmatter 원문
 * @param key 추출할 키
 */
function extractList(yaml: string, key: string): string[] {
  const lines = yaml.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(new RegExp(`^${escapeRegex(key)}:\\s*(.*)$`))
    if (!match) continue

    const value = match[1].trim()

    if (value === '' || value === null) {
      // 블록 시퀀스 — 다음 줄들의 `- item` 수집
      const items: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        const itemLine = lines[j]
        const itemMatch = itemLine.match(/^\s+-\s+(.+)$/)
        if (itemMatch) {
          items.push(...splitToolList(itemMatch[1].trim()))
        } else if (/^\s+-\s*$/.test(itemLine)) {
          // 빈 항목 스킵
        } else if (/^\S/.test(itemLine) && itemLine.includes(':')) {
          // 다른 키 시작 → 블록 끝
          break
        } else if (itemLine.trim() !== '') {
          break
        }
      }
      return items
    }

    // 인라인 시퀀스: `tools: Read, Edit, Write` 또는 `tools: [Read, Edit]`
    const cleaned = value.replace(/^\[/, '').replace(/\]$/, '')
    return splitToolList(cleaned)
  }

  return []
}

/**
 * 도구 목록 문자열을 콤마/공백으로 분리하여 정리된 배열로 반환한다.
 * 빈 항목, 따옴표는 제거한다.
 */
function splitToolList(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((s) => s.replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean)
}

/** 정규식 특수문자 이스케이프 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 마크다운 파일 내용에서 frontmatter 를 파싱하여 FrontmatterResult 를 반환한다.
 * frontmatter 가 없으면 빈 결과(tools=[], raw='')를 반환한다 — 절대 throw 하지 않는다.
 *
 * tools 와 allowed-tools 를 모두 인식하여 중복 제거 후 합산한다.
 * mcp__... 형태의 MCP 도구명도 그대로 유지한다.
 *
 * @param content 마크다운 파일 전체 내용
 */
export function parseFrontmatter(content: string): FrontmatterResult {
  const raw = extractFrontmatterRaw(content)
  if (!raw) {
    return { tools: [], raw: '' }
  }

  const name = extractScalar(raw, 'name')
  const model = extractScalar(raw, 'model')
  const description = extractScalar(raw, 'description')

  // tools: 와 allowed-tools: 모두 수집하여 중복 제거
  const toolsFromTools = extractList(raw, 'tools')
  const toolsFromAllowed = extractList(raw, 'allowed-tools')
  const allTools = [...new Set([...toolsFromTools, ...toolsFromAllowed])]

  return { name, model, description, tools: allTools, raw }
}
