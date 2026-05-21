import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Kbd from './Kbd'

describe('Kbd', () => {
  it('자식 렌더 + ds-kbd 클래스', () => {
    const { container } = render(<Kbd>⌘</Kbd>)
    expect(container.firstChild).toHaveClass('ds-kbd')
    expect(container.textContent).toBe('⌘')
  })

  it('className 병합', () => {
    const { container } = render(<Kbd className="extra">K</Kbd>)
    expect(container.firstChild).toHaveClass('extra')
  })
})
