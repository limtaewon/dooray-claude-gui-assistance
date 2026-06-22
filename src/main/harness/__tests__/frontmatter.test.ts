/**
 * frontmatter.test.ts — parseFrontmatter 단위 테스트
 *
 * 픽스처:
 * - reined 스타일: model: sonnet, tools: (inline)
 * - neon 스타일: model 없음, allowed-tools: (inline, mcp__ 포함)
 * - YAML 블록 시퀀스
 * - frontmatter 없음
 */

import { describe, it, expect } from 'vitest'
import { parseFrontmatter, extractFrontmatterRaw } from '../frontmatter'

describe('extractFrontmatterRaw', () => {
  it('--- 블록이 있으면 frontmatter 본문을 반환한다', () => {
    const content = `---\nname: test\nmodel: sonnet\n---\n\n# Body`
    const raw = extractFrontmatterRaw(content)
    expect(raw).toContain('name: test')
    expect(raw).toContain('model: sonnet')
  })

  it('--- 블록이 없으면 null 을 반환한다', () => {
    const content = `# No frontmatter\n\nJust body text.`
    expect(extractFrontmatterRaw(content)).toBeNull()
  })

  it('닫는 --- 가 없으면 null 을 반환한다', () => {
    const content = `---\nname: test\n`
    expect(extractFrontmatterRaw(content)).toBeNull()
  })

  it('BOM 문자를 제거하고 파싱한다', () => {
    const content = `﻿---\nname: bom-test\n---\n`
    const raw = extractFrontmatterRaw(content)
    expect(raw).toContain('name: bom-test')
  })
})

describe('parseFrontmatter — reined 스타일 (model 있음, tools 인라인)', () => {
  const content = `---
name: reined-bmad-developer
description: >
  Use when: developer 페이즈에서 코드 변경이 필요할 때,
  orchestrator 가 developer 호출 시.
tools: Read, Edit, Write, Glob, Grep, Bash, Task
model: sonnet
---

# Developer body
`

  it('name 을 정확히 추출한다', () => {
    const result = parseFrontmatter(content)
    expect(result.name).toBe('reined-bmad-developer')
  })

  it('model 을 정확히 추출한다', () => {
    const result = parseFrontmatter(content)
    expect(result.model).toBe('sonnet')
  })

  it('tools 인라인 목록을 추출한다', () => {
    const result = parseFrontmatter(content)
    expect(result.tools).toEqual(expect.arrayContaining(['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Task']))
    expect(result.tools).toHaveLength(7)
  })

  it('description folded block 을 추출한다', () => {
    const result = parseFrontmatter(content)
    expect(result.description).toContain('developer 페이즈에서')
  })

  it('raw 를 포함한다', () => {
    const result = parseFrontmatter(content)
    expect(result.raw).toContain('name: reined-bmad-developer')
  })
})

describe('parseFrontmatter — neon 스타일 (model 없음, allowed-tools + mcp__)', () => {
  const content = `---
name: neon-bmad-developer
description: >
  Use when: 두레이 하위업무(스토리) 기반 구현이 필요할 때.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, Task, mcp__mysql__query, mcp__mysql__find_tables, mcp__ibsheet-manual__get_document
---

# neon developer
`

  it('name 을 정확히 추출한다', () => {
    const result = parseFrontmatter(content)
    expect(result.name).toBe('neon-bmad-developer')
  })

  it('model 이 없으면 undefined 를 반환한다', () => {
    const result = parseFrontmatter(content)
    expect(result.model).toBeUndefined()
  })

  it('allowed-tools 를 tools 로 반환한다', () => {
    const result = parseFrontmatter(content)
    expect(result.tools).toContain('Read')
    expect(result.tools).toContain('Task')
  })

  it('mcp__ 형태의 도구명을 포함한다', () => {
    const result = parseFrontmatter(content)
    expect(result.tools).toContain('mcp__mysql__query')
    expect(result.tools).toContain('mcp__mysql__find_tables')
    expect(result.tools).toContain('mcp__ibsheet-manual__get_document')
  })
})

describe('parseFrontmatter — tools + allowed-tools 동시 존재 시 중복 제거', () => {
  const content = `---
name: hybrid-agent
tools: Read, Edit, Write
allowed-tools: Read, Glob, mcp__mysql__query
model: haiku
---
`

  it('tools 와 allowed-tools 를 합산하고 중복을 제거한다', () => {
    const result = parseFrontmatter(content)
    // Read 는 두 번 나오지만 한 번만
    const readCount = result.tools.filter((t) => t === 'Read').length
    expect(readCount).toBe(1)
    expect(result.tools).toContain('Edit')
    expect(result.tools).toContain('Write')
    expect(result.tools).toContain('Glob')
    expect(result.tools).toContain('mcp__mysql__query')
  })
})

describe('parseFrontmatter — YAML 블록 시퀀스 (- item 형식)', () => {
  const content = `---
name: block-agent
model: opus
tools:
  - Read
  - Edit
  - Bash
---
`

  it('블록 시퀀스 tools 를 추출한다', () => {
    const result = parseFrontmatter(content)
    expect(result.tools).toEqual(expect.arrayContaining(['Read', 'Edit', 'Bash']))
    expect(result.tools).toHaveLength(3)
  })
})

describe('parseFrontmatter — frontmatter 없음', () => {
  it('빈 tools 배열과 raw="" 를 반환한다', () => {
    const content = `# Just markdown\n\nNo frontmatter here.`
    const result = parseFrontmatter(content)
    expect(result.tools).toEqual([])
    expect(result.raw).toBe('')
    expect(result.name).toBeUndefined()
    expect(result.model).toBeUndefined()
  })

  it('빈 문자열 입력에도 크래시하지 않는다', () => {
    expect(() => parseFrontmatter('')).not.toThrow()
    const result = parseFrontmatter('')
    expect(result.tools).toEqual([])
  })
})

describe('parseFrontmatter — model 값 다양성', () => {
  it('claude-sonnet-4-6 같은 전체 모델명도 추출한다', () => {
    const content = `---\nname: x\nmodel: claude-sonnet-4-6\n---\n`
    const result = parseFrontmatter(content)
    expect(result.model).toBe('claude-sonnet-4-6')
  })

  it('haiku 모델명을 추출한다', () => {
    const content = `---\nname: x\nmodel: haiku\n---\n`
    const result = parseFrontmatter(content)
    expect(result.model).toBe('haiku')
  })

  it('opus 모델명을 추출한다', () => {
    const content = `---\nname: x\nmodel: opus\n---\n`
    const result = parseFrontmatter(content)
    expect(result.model).toBe('opus')
  })
})

describe('parseFrontmatter — 대괄호 인라인 배열', () => {
  it('[val1, val2] 형식의 tools 를 파싱한다', () => {
    const content = `---\nname: x\ntools: [Read, Edit, Write]\n---\n`
    const result = parseFrontmatter(content)
    expect(result.tools).toEqual(expect.arrayContaining(['Read', 'Edit', 'Write']))
  })
})

describe('parseFrontmatter — CRLF 줄바꿈 (Windows 회귀 방지)', () => {
  // Windows 체크아웃/저작 번들은 '\r\n' 을 쓴다. JS 정규식의 '.'·'$' 가 '\r' 을
  // 줄terminator 로 취급해 스칼라/리스트 추출이 깨졌던 회귀(Windows CI 실패)를 고정한다.
  it('CRLF frontmatter 에서 name/model/tools 를 정상 추출한다', () => {
    const content = '---\r\nname: code-reviewer\r\nmodel: haiku\r\ntools:\r\n  - Read\r\n  - mcp__mysql__query\r\n---\r\n# Agent\r\n'
    const result = parseFrontmatter(content)
    expect(result.name).toBe('code-reviewer')
    expect(result.model).toBe('haiku')
    expect(result.tools).toEqual(expect.arrayContaining(['Read', 'mcp__mysql__query']))
  })

  it('CRLF 인라인 tools 도 추출한다', () => {
    const content = '---\r\nname: x\r\nallowed-tools: Read, Edit\r\n---\r\n'
    const result = parseFrontmatter(content)
    expect(result.name).toBe('x')
    expect(result.tools).toEqual(expect.arrayContaining(['Read', 'Edit']))
  })

  it('CRLF frontmatter raw 에 \\r 이 남지 않는다', () => {
    const raw = extractFrontmatterRaw('---\r\nname: x\r\n---\r\n')
    expect(raw).not.toBeNull()
    expect(raw).not.toContain('\r')
  })
})
