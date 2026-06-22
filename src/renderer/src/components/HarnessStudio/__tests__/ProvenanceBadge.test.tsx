import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ProvenanceBadge } from '../shared/ProvenanceBadge'
import type { FieldSource } from '@shared/types/harness'

describe('ProvenanceBadge — 렌더', () => {
  const sources: FieldSource[] = ['static', 'ai', 'inferred', 'absent']

  it.each(sources)('source=%s 렌더 — 크래시 없음', (source) => {
    const { container } = render(<ProvenanceBadge source={source} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('static: "정적" 텍스트 포함', () => {
    const { getByText } = render(<ProvenanceBadge source="static" />)
    expect(getByText('정적')).toBeTruthy()
  })

  it('ai: "AI" 텍스트 포함', () => {
    const { getByText } = render(<ProvenanceBadge source="ai" />)
    expect(getByText('AI')).toBeTruthy()
  })

  it('inferred: "파생" 텍스트 포함', () => {
    const { getByText } = render(<ProvenanceBadge source="inferred" />)
    expect(getByText('파생')).toBeTruthy()
  })

  it('absent: "없음" 텍스트 포함', () => {
    const { getByText } = render(<ProvenanceBadge source="absent" />)
    expect(getByText('없음')).toBeTruthy()
  })

  it('aria-label 에 출처 정보 포함', () => {
    const { container } = render(<ProvenanceBadge source="ai" />)
    const el = container.querySelector('[aria-label]')
    expect(el?.getAttribute('aria-label')).toContain('출처')
  })

  it('size=xs 도 렌더 가능', () => {
    const { container } = render(<ProvenanceBadge source="static" size="xs" />)
    expect(container.firstChild).not.toBeNull()
  })

  it('className 전달됨', () => {
    const { container } = render(<ProvenanceBadge source="ai" className="test-cls" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('test-cls')
  })
})
