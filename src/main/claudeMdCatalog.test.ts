import { describe, it, expect } from 'vitest'
import { CLAUDE_MD_TEMPLATES, findClaudeMdTemplate } from './claudeMdCatalog'

describe('claudeMdCatalog (#3)', () => {
  it('템플릿이 최소 4개 이상 등록되어 있다', () => {
    expect(CLAUDE_MD_TEMPLATES.length).toBeGreaterThanOrEqual(4)
  })

  it('각 템플릿은 id/name/description/body 필드를 갖는다', () => {
    for (const t of CLAUDE_MD_TEMPLATES) {
      expect(t.id).toBeTruthy()
      expect(t.name).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(t.body.length).toBeGreaterThan(20)
    }
  })

  it('id 는 슬러그 형식 (소문자, 영숫자, 하이픈) 이며 중복 없음', () => {
    const ids = CLAUDE_MD_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('findClaudeMdTemplate — 존재하면 객체 반환, 없으면 undefined', () => {
    const first = CLAUDE_MD_TEMPLATES[0]
    expect(findClaudeMdTemplate(first.id)).toEqual(first)
    expect(findClaudeMdTemplate('not-a-real-id')).toBeUndefined()
  })

  it('본문은 마크다운 — 최상위 헤더(#)로 시작', () => {
    for (const t of CLAUDE_MD_TEMPLATES) {
      expect(t.body.trimStart().startsWith('#')).toBe(true)
    }
  })
})
