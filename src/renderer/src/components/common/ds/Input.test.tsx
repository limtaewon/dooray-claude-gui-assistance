import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import Input, { Textarea, FieldLabel } from './Input'

describe('Input', () => {
  it('기본 size=md → 추가 클래스 없음', () => {
    const { container } = render(<Input />)
    expect(container.querySelector('input')?.className).toBe('ds-input ')
  })

  it('size=sm → sm 클래스', () => {
    const { container } = render(<Input size="sm" />)
    expect(container.querySelector('input')).toHaveClass('sm')
  })

  it('value/onChange 동작', () => {
    const handler = vi.fn()
    const { getByDisplayValue } = render(<Input value="hi" onChange={handler} />)
    fireEvent.change(getByDisplayValue('hi'), { target: { value: 'next' } })
    expect(handler).toHaveBeenCalled()
  })

  it('ref forward', () => {
    const ref = { current: null as HTMLInputElement | null }
    render(<Input ref={ref} />)
    expect(ref.current?.tagName).toBe('INPUT')
  })

  it('className 병합', () => {
    const { container } = render(<Input className="extra" />)
    expect(container.querySelector('input')).toHaveClass('extra')
  })
})

describe('Textarea', () => {
  it('렌더', () => {
    const { container } = render(<Textarea />)
    expect(container.querySelector('textarea')).not.toBeNull()
    expect(container.querySelector('textarea')).toHaveClass('ds-input')
  })

  it('ref forward', () => {
    const ref = { current: null as HTMLTextAreaElement | null }
    render(<Textarea ref={ref} />)
    expect(ref.current?.tagName).toBe('TEXTAREA')
  })
})

describe('FieldLabel', () => {
  it('label 태그 + ds-field-label 클래스', () => {
    const { container } = render(<FieldLabel>이름</FieldLabel>)
    const el = container.querySelector('label')
    expect(el).not.toBeNull()
    expect(el).toHaveClass('ds-field-label')
    expect(el?.textContent).toBe('이름')
  })

  it('className 병합', () => {
    const { container } = render(<FieldLabel className="extra">x</FieldLabel>)
    expect(container.querySelector('label')).toHaveClass('extra')
  })
})
