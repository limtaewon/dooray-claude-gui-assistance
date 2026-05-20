import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Badge from './Badge'

describe('Badge', () => {
  it('자식 렌더', () => {
    const { container } = render(<Badge>3</Badge>)
    expect(container.textContent).toBe('3')
  })

  it('기본 톤은 orange', () => {
    const { container } = render(<Badge>1</Badge>)
    const el = container.firstChild as HTMLElement
    expect(el.style.background).toContain('clauday-orange')
  })

  it('tone 별 배경색 매핑', () => {
    const { container } = render(<Badge tone="emerald">9+</Badge>)
    const el = container.firstChild as HTMLElement
    expect(el.style.background).toBe('rgb(34, 197, 94)')
  })

  it('tone=red', () => {
    const { container } = render(<Badge tone="red">!</Badge>)
    expect((container.firstChild as HTMLElement).style.background).toBe('rgb(239, 68, 68)')
  })

  it('tone=violet', () => {
    const { container } = render(<Badge tone="violet">v</Badge>)
    expect((container.firstChild as HTMLElement).style.background).toBe('rgb(167, 139, 250)')
  })
})
