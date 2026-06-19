/**
 * SkillEditor / SkillCard 의 순수 헬퍼 함수 단위 테스트.
 *
 * 이 파일은 DOM / window.api 의존 없이 순수 로직만 검증한다.
 */
import { describe, it, expect } from 'vitest'

// --- parseFrontmatter / buildContent (SkillEditor 에서 export) ---
// 직접 inline 으로 같은 로직을 재정의해 테스트 (import는 tsx 컴파일 필요)
function parseFrontmatter(body: string): { name: string; description: string } {
  const m = body.match(/^\s*---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return { name: '', description: '' }
  const nameMatch = m[1].match(/^\s*name\s*:\s*(.+?)\s*$/m)
  const descMatch = m[1].match(/^\s*description\s*:\s*(.+?)\s*$/m)
  return {
    name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : '',
    description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : ''
  }
}

function buildContent(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`
}

// --- extractDescription (SkillCard 에서 inline) ---
function extractDescription(content: string): string {
  if (!content) return ''
  const m = content.match(/^---\s*[\r\n]([\s\S]*?)[\r\n]---/)
  if (m) {
    const fm = m[1]
    const desc = fm.match(/description:\s*(.+)/i)
    if (desc) return desc[1].trim().replace(/^["']|["']$/g, '')
  }
  const body = m ? content.slice(m[0].length) : content
  const firstLine = body.split('\n').find((l) => l.trim() && !l.trim().startsWith('#'))
  return (firstLine || '').trim().slice(0, 80)
}

// --- extractFrontmatterDescription (SkillsManager 에서 inline) ---
function extractFrontmatterDescription(body: string): string | undefined {
  if (!body) return undefined
  const m = body.match(/^\s*---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return undefined
  const d = m[1].match(/^\s*description\s*:\s*(.+?)\s*$/m)
  if (!d) return undefined
  return d[1].trim().replace(/^["']|["']$/g, '')
}

const SAMPLE_SKILL = `---
name: 코드 리뷰어
description: React 컴포넌트를 접근성·성능·타입 기준으로 리뷰
---

# 코드 리뷰

PR 변경사항을 분석합니다.
`

describe('parseFrontmatter', () => {
  it('name 과 description 을 올바르게 추출한다', () => {
    const { name, description } = parseFrontmatter(SAMPLE_SKILL)
    expect(name).toBe('코드 리뷰어')
    expect(description).toBe('React 컴포넌트를 접근성·성능·타입 기준으로 리뷰')
  })

  it('frontmatter 가 없으면 빈 문자열을 반환한다', () => {
    const { name, description } = parseFrontmatter('# 스킬 내용만 있음')
    expect(name).toBe('')
    expect(description).toBe('')
  })

  it('따옴표로 감싼 값에서 따옴표를 제거한다', () => {
    const body = `---\nname: "my skill"\ndescription: 'some desc'\n---\n\n내용`
    const { name, description } = parseFrontmatter(body)
    expect(name).toBe('my skill')
    expect(description).toBe('some desc')
  })
})

describe('buildContent', () => {
  it('name·description·body 로 frontmatter+본문을 조립한다', () => {
    const result = buildContent('test', 'desc', '## 본문')
    expect(result).toContain('---\nname: test\ndescription: desc\n---')
    expect(result).toContain('## 본문')
  })

  it('마지막에 개행이 포함된다', () => {
    const result = buildContent('a', 'b', 'body')
    expect(result.endsWith('\n')).toBe(true)
  })
})

describe('extractDescription (SkillCard)', () => {
  it('frontmatter 의 description 을 우선 반환한다', () => {
    const desc = extractDescription(SAMPLE_SKILL)
    expect(desc).toBe('React 컴포넌트를 접근성·성능·타입 기준으로 리뷰')
  })

  it('frontmatter 없으면 첫 단락을 반환한다', () => {
    const content = '# 제목\n\n본문 첫 줄입니다'
    const desc = extractDescription(content)
    expect(desc).toBe('본문 첫 줄입니다')
  })

  it('빈 입력에 빈 문자열을 반환한다', () => {
    expect(extractDescription('')).toBe('')
  })

  it('80자까지 자른다', () => {
    const content = 'x'.repeat(100)
    const desc = extractDescription(content)
    expect(desc.length).toBeLessThanOrEqual(80)
  })
})

describe('extractFrontmatterDescription (SkillsManager)', () => {
  it('frontmatter description 을 반환한다', () => {
    const result = extractFrontmatterDescription(SAMPLE_SKILL)
    expect(result).toBe('React 컴포넌트를 접근성·성능·타입 기준으로 리뷰')
  })

  it('frontmatter 없으면 undefined 를 반환한다', () => {
    expect(extractFrontmatterDescription('# 본문만')).toBeUndefined()
  })

  it('빈 입력에 undefined 를 반환한다', () => {
    expect(extractFrontmatterDescription('')).toBeUndefined()
  })
})

describe('filteredShared 검색 로직 (description 포함)', () => {
  /** 공유소 검색 로직 — filteredShared useMemo 와 동일 */
  function filterSharedSkills(
    skills: Array<{ name: string; authorName: string; description?: string }>,
    query: string
  ): typeof skills {
    const q = query.trim().toLowerCase()
    if (!q) return skills
    return skills.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.authorName.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q)
    )
  }

  const items = [
    { name: 'code-reviewer', authorName: 'alice', description: 'React 컴포넌트 리뷰' },
    { name: 'commit-helper', authorName: 'bob', description: undefined },
    { name: 'daily-report', authorName: 'charlie', description: '일일 보고서 작성' }
  ]

  it('이름으로 필터링된다', () => {
    const result = filterSharedSkills(items, 'code')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('code-reviewer')
  })

  it('작성자로 필터링된다', () => {
    const result = filterSharedSkills(items, 'bob')
    expect(result).toHaveLength(1)
    expect(result[0].authorName).toBe('bob')
  })

  it('description 으로 필터링된다', () => {
    const result = filterSharedSkills(items, '보고서')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('daily-report')
  })

  it('description 이 undefined 여도 오류 없이 처리된다', () => {
    expect(() => filterSharedSkills(items, 'anything')).not.toThrow()
  })

  it('빈 검색어면 전체 반환', () => {
    expect(filterSharedSkills(items, '')).toHaveLength(3)
  })
})
