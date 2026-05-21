import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Card from './Card'

describe('Card', () => {
  it('기본 variant — ds-card 만', () => {
    const { container } = render(<Card>본문</Card>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toBe('ds-card ')
  })

  it('variant=raised → 클래스 추가', () => {
    const { container } = render(<Card variant="raised">x</Card>)
    expect(container.firstChild).toHaveClass('raised')
  })

  it('variant=flat → 클래스 추가', () => {
    const { container } = render(<Card variant="flat">x</Card>)
    expect(container.firstChild).toHaveClass('flat')
  })

  it('추가 className 병합', () => {
    const { container } = render(<Card className="x">y</Card>)
    expect(container.firstChild).toHaveClass('x')
  })

  it('HTML 속성 전달', () => {
    const { container } = render(<Card data-testid="t" id="c1">y</Card>)
    expect(container.firstChild).toHaveAttribute('id', 'c1')
    expect(container.firstChild).toHaveAttribute('data-testid', 't')
  })
})
