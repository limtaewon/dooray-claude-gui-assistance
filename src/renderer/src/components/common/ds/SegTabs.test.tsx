import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import SegTabs from './SegTabs'

describe('SegTabs', () => {
  it('items 갯수만큼 버튼 렌더 + 활성 상태', () => {
    const { container } = render(
      <SegTabs items={[{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]} value="a" onChange={() => {}} />
    )
    const btns = container.querySelectorAll('button')
    expect(btns).toHaveLength(2)
    expect(btns[0]).toHaveClass('active')
    expect(btns[1]).not.toHaveClass('active')
  })

  it('클릭 시 onChange', () => {
    const onChange = vi.fn()
    const { container } = render(
      <SegTabs items={[{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]} value="a" onChange={onChange} />
    )
    fireEvent.click(container.querySelectorAll('button')[1])
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('icon 렌더', () => {
    const { container } = render(
      <SegTabs items={[{ key: 'a', label: 'A', icon: <span data-testid="ic" /> }]} value="a" onChange={() => {}} />
    )
    expect(container.querySelector('[data-testid="ic"]')).not.toBeNull()
  })

  it('className 병합', () => {
    const { container } = render(
      <SegTabs items={[{ key: 'a', label: 'A' }]} value="a" onChange={() => {}} className="extra" />
    )
    expect(container.firstChild).toHaveClass('extra')
  })
})
