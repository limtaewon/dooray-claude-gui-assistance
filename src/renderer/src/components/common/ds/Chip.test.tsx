import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Chip from './Chip'

describe('Chip', () => {
  it('자식 렌더', () => {
    const { container } = render(<Chip>working</Chip>)
    expect(container.textContent).toBe('working')
  })

  it('기본 tone=neutral', () => {
    const { container } = render(<Chip>x</Chip>)
    expect(container.firstChild).toHaveClass('neutral')
  })

  it('tone=blue', () => {
    const { container } = render(<Chip tone="blue">x</Chip>)
    expect(container.firstChild).toHaveClass('blue')
  })

  it('dot=true 면 점 요소 포함', () => {
    const { container } = render(<Chip dot>x</Chip>)
    expect(container.querySelector('.dot')).not.toBeNull()
  })

  it('dot=false 면 점 없음', () => {
    const { container } = render(<Chip>x</Chip>)
    expect(container.querySelector('.dot')).toBeNull()
  })

  it('square=true 면 sq 클래스', () => {
    const { container } = render(<Chip square>x</Chip>)
    expect((container.firstChild as Element)?.className).toContain('sq')
  })

  it('className 병합', () => {
    const { container } = render(<Chip className="extra">x</Chip>)
    expect(container.firstChild).toHaveClass('extra')
  })
})
