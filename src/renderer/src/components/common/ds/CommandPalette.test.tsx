import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import CommandPalette from './CommandPalette'

const GROUPS = [
  { label: '파일', items: [
    { id: 'open', label: '열기', hint: '⌘O', keywords: 'open' },
    { id: 'save', label: '저장', hint: '⌘S' }
  ] },
  { label: '편집', items: [
    { id: 'copy', label: '복사', keywords: 'clip' }
  ] }
]

describe('CommandPalette', () => {
  it('open=false 면 렌더 안함', () => {
    const { container } = render(<CommandPalette open={false} onClose={() => {}} groups={GROUPS} onRun={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('open=true → portal 렌더 + 모든 그룹/항목', () => {
    render(<CommandPalette open onClose={() => {}} groups={GROUPS} onRun={() => {}} />)
    expect(document.body.textContent).toContain('파일')
    expect(document.body.textContent).toContain('편집')
    expect(document.body.textContent).toContain('열기')
    expect(document.body.textContent).toContain('복사')
  })

  it('검색어로 라벨/hint/keywords 필터링', () => {
    render(<CommandPalette open onClose={() => {}} groups={GROUPS} onRun={() => {}} />)
    const input = document.querySelector('.ds-cp-search input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'clip' } })
    expect(document.body.textContent).toContain('복사')
    expect(document.body.textContent).not.toContain('열기')
  })

  it('필터 결과 없으면 안내 문구', () => {
    render(<CommandPalette open onClose={() => {}} groups={GROUPS} onRun={() => {}} />)
    const input = document.querySelector('.ds-cp-search input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(document.body.textContent).toContain('결과가 없어요')
  })

  it('Enter → onRun + onClose', () => {
    const onRun = vi.fn()
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} groups={GROUPS} onRun={onRun} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onRun).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape → onClose', () => {
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} groups={GROUPS} onRun={() => {}} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('ArrowDown/ArrowUp 으로 선택 이동', () => {
    const onRun = vi.fn()
    render(<CommandPalette open onClose={() => {}} groups={GROUPS} onRun={onRun} />)
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onRun).toHaveBeenCalled()
    expect(onRun.mock.calls[0][0].id).toBe('copy')
  })

  it('항목 클릭 시 실행 + 닫힘', () => {
    const onRun = vi.fn()
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} groups={GROUPS} onRun={onRun} />)
    const items = document.querySelectorAll('.ds-cp-item')
    fireEvent.click(items[1])
    expect(onRun.mock.calls[0][0].id).toBe('save')
    expect(onClose).toHaveBeenCalled()
  })

  it('backdrop 클릭 시 onClose', () => {
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} groups={GROUPS} onRun={() => {}} />)
    fireEvent.click(document.querySelector('.ds-cp-backdrop') as HTMLElement)
    expect(onClose).toHaveBeenCalled()
  })

  it('placeholder override', () => {
    render(<CommandPalette open onClose={() => {}} groups={GROUPS} onRun={() => {}} placeholder="검색하세요" />)
    const input = document.querySelector('.ds-cp-search input') as HTMLInputElement
    expect(input.placeholder).toBe('검색하세요')
  })
})
