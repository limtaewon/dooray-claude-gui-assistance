import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import Modal from './Modal'

describe('Modal', () => {
  it('open=false 면 렌더 안함', () => {
    const { container } = render(<Modal open={false} onClose={() => {}}>x</Modal>)
    expect(container.firstChild).toBeNull()
  })

  it('open=true 면 portal 에 렌더', () => {
    render(<Modal open onClose={() => {}}>본문</Modal>)
    expect(document.querySelector('.ds-modal-backdrop')).not.toBeNull()
    expect(document.body.textContent).toContain('본문')
  })

  it('title 렌더', () => {
    render(<Modal open onClose={() => {}} title="제목">x</Modal>)
    expect(document.querySelector('.m-title')?.textContent).toBe('제목')
  })

  it('footer 렌더', () => {
    render(<Modal open onClose={() => {}} footer={<button>OK</button>}>x</Modal>)
    expect(document.querySelector('.m-foot')).not.toBeNull()
  })

  it('ESC 키로 onClose 호출 (dismissable=true)', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose}>x</Modal>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('dismissable=false 면 ESC 무시', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} dismissable={false}>x</Modal>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('backdrop 클릭 시 onClose', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose}>x</Modal>)
    const backdrop = document.querySelector('.ds-modal-backdrop') as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('dismissable=false 면 backdrop 클릭 무시', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} dismissable={false}>x</Modal>)
    const backdrop = document.querySelector('.ds-modal-backdrop') as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('body 클릭은 닫히지 않음 (stopPropagation)', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose}>본문</Modal>)
    const dialog = document.querySelector('.ds-modal') as HTMLElement
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('닫기 버튼 클릭', () => {
    const onClose = vi.fn()
    render(<Modal open onClose={onClose} title="t">x</Modal>)
    const btn = document.querySelector('button[aria-label="닫기"]') as HTMLElement
    fireEvent.click(btn)
    expect(onClose).toHaveBeenCalled()
  })

  it('width 적용', () => {
    render(<Modal open onClose={() => {}} width={500} title="t">x</Modal>)
    const dialog = document.querySelector('.ds-modal') as HTMLElement
    expect(dialog.style.width).toBe('500px')
  })

  it('resizable=true 면 추가 클래스', () => {
    render(<Modal open onClose={() => {}} resizable>x</Modal>)
    expect(document.querySelector('.ds-modal-resize')).not.toBeNull()
  })
})
