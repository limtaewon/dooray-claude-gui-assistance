import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Avatar from './Avatar'

describe('Avatar', () => {
  it('이름 첫 2글자를 대문자로', () => {
    const { container } = render(<Avatar name="alice" />)
    expect(container.textContent).toBe('AL')
  })

  it('빈 이름은 · 폴백', () => {
    const { container } = render(<Avatar name="" />)
    expect(container.textContent).toBe('·')
  })

  it('한글 이름도 첫 두 글자', () => {
    const { container } = render(<Avatar name="홍길동" />)
    expect(container.textContent).toBe('홍길')
  })

  it('size=lg → 추가 클래스 부여', () => {
    const { container } = render(<Avatar name="X" size="lg" />)
    expect(container.firstChild).toHaveClass('lg')
  })

  it('size=md → 기본 클래스만', () => {
    const { container } = render(<Avatar name="X" />)
    expect((container.firstChild as Element)?.className).toContain('ds-avatar')
  })

  it('tone override 가 색상을 결정', () => {
    const { container: a } = render(<Avatar name="X" tone="#aabbcc" />)
    const { container: b } = render(<Avatar name="X" tone="#112233" />)
    const styleA = (a.firstChild as HTMLElement).style.background
    const styleB = (b.firstChild as HTMLElement).style.background
    expect(styleA).not.toBe(styleB)
  })

  it('이름별로 색상이 결정적', () => {
    const { container: a } = render(<Avatar name="alice" />)
    const { container: b } = render(<Avatar name="alice" />)
    const styleA = (a.firstChild as HTMLElement).style.color
    const styleB = (b.firstChild as HTMLElement).style.color
    expect(styleA).toBe(styleB)
  })

  it('className 병합', () => {
    const { container } = render(<Avatar name="X" className="extra" />)
    expect(container.firstChild).toHaveClass('extra')
  })
})
