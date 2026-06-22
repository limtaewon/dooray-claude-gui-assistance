/**
 * applyFieldEdit.test.ts — frontmatter 필드 치환 순수 함수 테스트
 *
 * 검증:
 * 1. model 신규 추가 (frontmatter 있음, model 키 없음)
 * 2. model 치환 (frontmatter 있음, model 키 존재)
 * 3. tools 인라인 리스트 치환
 * 4. allowed-tools 인라인 리스트 치환
 * 5. CRLF 보존
 * 6. BOM 포함 파일 정상 처리
 * 7. frontmatter 없는 파일에 신규 추가
 * 8. 멱등성 (동일 값 재치환)
 * 9. 블록 시퀀스 tools → 인라인 치환
 * 10. 실제 reined/neon frontmatter 표본 기반 케이스
 */

import { describe, it, expect } from 'vitest'
import { applyFieldEdit } from '../applyFieldEdit'

// ─────────────────────────────────────────────
// 픽스처
// ─────────────────────────────────────────────

/** reined-fixture-developer.md 실제 frontmatter 기반 */
const REINED_DEVELOPER_CONTENT = `---
name: reined-fixture-developer
description: >
  Use when: developer 페이즈에서 코드 변경이 필요할 때.
tools: Read, Edit, Write, Glob, Grep, Bash, Task
model: sonnet
---

# Developer

구현자 에이전트.
`

/** neon-fixture developer/SKILL.md 실제 frontmatter 기반 (model 키 없음) */
const NEON_DEVELOPER_CONTENT = `---
name: neon-fixture-developer
description: >
  Use when: developer 페이즈 진입 시, BE/FE 코드 변경을 실행해야 할 때.
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, Task, mcp__mysql__query, mcp__mysql__find_tables
---

# neon-fixture — Developer (구현자)

## 역할 카드
- **역할**: BE/FE 구현 + 교차검증
- **위험**: @Transactional 사용, BO 생략
`

/** CRLF 줄끝 파일 */
const CRLF_CONTENT = `---\r\nname: test-agent\r\nmodel: haiku\r\ntools: Read, Edit\r\n---\r\n\r\n# Test\r\n`

/** BOM 포함 파일 */
const BOM_CONTENT = `﻿---\nname: bom-agent\nmodel: haiku\n---\n\n# BOM Test\n`

/** 블록 시퀀스 tools */
const BLOCK_SEQUENCE_CONTENT = `---
name: block-agent
model: sonnet
tools:
  - Read
  - Edit
  - Write
---

# Block Sequence Agent
`

/** frontmatter 없는 파일 */
const NO_FM_CONTENT = `# Just markdown

No frontmatter here.
`

// ─────────────────────────────────────────────
// model 치환 테스트
// ─────────────────────────────────────────────

describe('applyFieldEdit — model 치환', () => {
  it('기존 model: sonnet → opus 로 치환한다', () => {
    const result = applyFieldEdit(REINED_DEVELOPER_CONTENT, 'model', 'opus')
    expect(result).toContain('model: opus')
    expect(result).not.toContain('model: sonnet')
  })

  it('치환 후 name/tools 등 다른 필드는 변경되지 않는다', () => {
    const result = applyFieldEdit(REINED_DEVELOPER_CONTENT, 'model', 'opus')
    expect(result).toContain('name: reined-fixture-developer')
    expect(result).toContain('tools: Read, Edit, Write, Glob, Grep, Bash, Task')
  })

  it('description 블록 스칼라는 손상되지 않는다', () => {
    const result = applyFieldEdit(REINED_DEVELOPER_CONTENT, 'model', 'opus')
    expect(result).toContain('description: >')
    expect(result).toContain('Use when: developer 페이즈에서 코드 변경이 필요할 때.')
  })

  it('frontmatter 가 있지만 model 키가 없으면 신규 추가한다 (neon)', () => {
    const result = applyFieldEdit(NEON_DEVELOPER_CONTENT, 'model', 'sonnet')
    expect(result).toContain('model: sonnet')
    // frontmatter 안에 들어가야 함
    const fmEnd = result.indexOf('\n---', 4)
    const fm = result.slice(0, fmEnd)
    expect(fm).toContain('model: sonnet')
  })

  it('신규 추가 후 기존 allowed-tools 는 그대로 유지된다', () => {
    const result = applyFieldEdit(NEON_DEVELOPER_CONTENT, 'model', 'opus')
    expect(result).toContain('allowed-tools: Read, Edit, Write')
    expect(result).toContain('model: opus')
  })

  it('frontmatter 없는 파일에 model 을 신규 추가한다', () => {
    const result = applyFieldEdit(NO_FM_CONTENT, 'model', 'haiku')
    expect(result).toContain('---\nmodel: haiku\n---')
    expect(result).toContain('# Just markdown')
  })
})

// ─────────────────────────────────────────────
// tools / allowed-tools 치환 테스트
// ─────────────────────────────────────────────

describe('applyFieldEdit — tools 리스트 치환', () => {
  it('tools 인라인 리스트를 새 값으로 치환한다', () => {
    const result = applyFieldEdit(REINED_DEVELOPER_CONTENT, 'tools', ['Read', 'Edit'])
    expect(result).toContain('tools: Read, Edit')
    expect(result).not.toContain('tools: Read, Edit, Write, Glob, Grep, Bash, Task')
  })

  it('allowed-tools 리스트를 새 값으로 치환한다 (neon)', () => {
    const result = applyFieldEdit(NEON_DEVELOPER_CONTENT, 'allowed-tools', ['Read', 'Bash'])
    expect(result).toContain('allowed-tools: Read, Bash')
    expect(result).not.toContain('mcp__mysql__query')
  })

  it('블록 시퀀스 tools 를 인라인으로 치환한다', () => {
    const result = applyFieldEdit(BLOCK_SEQUENCE_CONTENT, 'tools', ['Read', 'Edit'])
    expect(result).toContain('tools: Read, Edit')
    // 블록 항목 제거됨
    expect(result).not.toContain('  - Read')
    expect(result).not.toContain('  - Edit')
    expect(result).not.toContain('  - Write')
  })

  it('tools 키 없는 파일에 신규 추가한다', () => {
    const result = applyFieldEdit(NEON_DEVELOPER_CONTENT, 'tools', ['Read', 'Glob'])
    expect(result).toContain('tools: Read, Glob')
  })

  it('빈 배열로 치환하면 tools 키는 유지되고 값이 비어있다', () => {
    const result = applyFieldEdit(REINED_DEVELOPER_CONTENT, 'tools', [])
    expect(result).toContain('tools: ')
  })
})

// ─────────────────────────────────────────────
// CRLF/BOM 보존
// ─────────────────────────────────────────────

describe('applyFieldEdit — CRLF/BOM 보존', () => {
  it('CRLF 파일 치환 후 CRLF 를 유지한다', () => {
    const result = applyFieldEdit(CRLF_CONTENT, 'model', 'opus')
    // 결과에 \r\n 이 있어야 함
    expect(result).toContain('\r\n')
    expect(result).toContain('model: opus')
  })

  it('CRLF 파일에서 tools 치환 후 CRLF 를 유지한다', () => {
    const result = applyFieldEdit(CRLF_CONTENT, 'tools', ['Read', 'Bash'])
    expect(result).toContain('\r\n')
    expect(result).toContain('tools: Read, Bash')
  })

  it('BOM 파일도 정상 처리된다', () => {
    const result = applyFieldEdit(BOM_CONTENT, 'model', 'sonnet')
    expect(result).toContain('model: sonnet')
    // name 은 유지
    expect(result).toContain('name: bom-agent')
  })

  it('LF 파일은 CRLF 없이 LF 로 유지된다', () => {
    const result = applyFieldEdit(REINED_DEVELOPER_CONTENT, 'model', 'haiku')
    expect(result).not.toContain('\r\n')
  })
})

// ─────────────────────────────────────────────
// 멱등성
// ─────────────────────────────────────────────

describe('applyFieldEdit — 멱등성', () => {
  it('동일 model 값으로 재치환 시 결과가 변하지 않는다', () => {
    const once = applyFieldEdit(REINED_DEVELOPER_CONTENT, 'model', 'sonnet')
    const twice = applyFieldEdit(once, 'model', 'sonnet')
    expect(twice).toBe(once)
  })

  it('동일 tools 값으로 재치환 시 결과가 변하지 않는다', () => {
    const once = applyFieldEdit(REINED_DEVELOPER_CONTENT, 'tools', ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Task'])
    const twice = applyFieldEdit(once, 'tools', ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Task'])
    expect(twice).toBe(once)
  })

  it('model 추가 후 동일 값 재치환 시 model 키가 2개 생기지 않는다', () => {
    const once = applyFieldEdit(NEON_DEVELOPER_CONTENT, 'model', 'opus')
    const twice = applyFieldEdit(once, 'model', 'opus')
    // 'model:' 이 1개만 있어야 함
    const modelOccurrences = (twice.match(/^model:/gm) ?? []).length
    expect(modelOccurrences).toBe(1)
  })
})

// ─────────────────────────────────────────────
// 에러 처리
// ─────────────────────────────────────────────

describe('applyFieldEdit — 에러 처리', () => {
  it('지원하지 않는 locator 는 Error 를 던진다', () => {
    expect(() =>
      // @ts-expect-error 의도적 잘못된 값
      applyFieldEdit(REINED_DEVELOPER_CONTENT, 'name', 'test')
    ).toThrow('지원하지 않는 locator')
  })
})
