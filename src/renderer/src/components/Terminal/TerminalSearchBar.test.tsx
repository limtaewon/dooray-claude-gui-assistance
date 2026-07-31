/**
 * TerminalSearchBar 단위 테스트 — 상태 없는 뷰 컴포넌트(ADR-03). 키보드 디스패치(Enter/Shift+Enter/Esc)와
 * IME 조합 가드, 토글 버튼 aria-pressed 반영만 검증한다. 검색 로직 자체는 terminalSearch.test.ts /
 * useTerminalSearch.test.ts 가 담당.
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import TerminalSearchBar from './TerminalSearchBar'
import { DEFAULT_SEARCH_TOGGLES } from './terminalSearch'

function setup(overrides?: Partial<Parameters<typeof TerminalSearchBar>[0]>): {
  onQueryChange: ReturnType<typeof vi.fn>
  onCompositionStart: ReturnType<typeof vi.fn>
  onCompositionEnd: ReturnType<typeof vi.fn>
  onToggle: ReturnType<typeof vi.fn>
  onNext: ReturnType<typeof vi.fn>
  onPrev: ReturnType<typeof vi.fn>
  onClose: ReturnType<typeof vi.fn>
} {
  const onQueryChange = vi.fn()
  const onCompositionStart = vi.fn()
  const onCompositionEnd = vi.fn()
  const onToggle = vi.fn()
  const onNext = vi.fn()
  const onPrev = vi.fn()
  const onClose = vi.fn()

  render(
    <TerminalSearchBar
      query="foo"
      toggles={DEFAULT_SEARCH_TOGGLES}
      countLabel="3/47"
      hasError={false}
      onQueryChange={onQueryChange}
      onCompositionStart={onCompositionStart}
      onCompositionEnd={onCompositionEnd}
      onToggle={onToggle}
      onNext={onNext}
      onPrev={onPrev}
      onClose={onClose}
      {...overrides}
    />
  )

  return { onQueryChange, onCompositionStart, onCompositionEnd, onToggle, onNext, onPrev, onClose }
}

describe('TerminalSearchBar', () => {
  it('매치 카운트를 그대로 표시한다', () => {
    setup()
    expect(screen.getByText('3/47')).toBeInTheDocument()
  })

  it('Enter → onNext, Shift+Enter → onPrev', () => {
    const { onNext, onPrev } = setup()
    const input = screen.getByPlaceholderText('터미널 검색')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onPrev).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onPrev).toHaveBeenCalledTimes(1)
  })

  it('Escape → onClose', () => {
    const { onClose } = setup()
    const input = screen.getByPlaceholderText('터미널 검색')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('IME 조합 중(keyCode 229)에는 Enter 를 가로채지 않는다', () => {
    const { onNext } = setup()
    const input = screen.getByPlaceholderText('터미널 검색')
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    expect(onNext).not.toHaveBeenCalled()
  })

  it('입력 변경 시 onQueryChange 호출', () => {
    const { onQueryChange } = setup()
    const input = screen.getByPlaceholderText('터미널 검색')
    fireEvent.change(input, { target: { value: 'bar' } })
    expect(onQueryChange).toHaveBeenCalledWith('bar')
  })

  it('토글 버튼 클릭 시 onToggle 이 키와 함께 호출된다', () => {
    const { onToggle } = setup()
    fireEvent.click(screen.getByTitle('정규식'))
    expect(onToggle).toHaveBeenCalledWith('regex')
  })

  it('활성화된 토글은 aria-pressed=true', () => {
    setup({ toggles: { ...DEFAULT_SEARCH_TOGGLES, regex: true } })
    expect(screen.getByTitle('정규식')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTitle('대소문자 구분')).toHaveAttribute('aria-pressed', 'false')
  })

  it('hasError 면 카운트 영역에 오류 title 이 붙는다', () => {
    setup({ hasError: true, countLabel: '오류' })
    const label = screen.getByText('오류')
    expect(label).toHaveAttribute('title', '정규식이 올바르지 않습니다')
  })
})
