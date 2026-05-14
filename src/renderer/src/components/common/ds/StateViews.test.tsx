import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { EmptyView, LoadingView, ErrorView } from './StateViews'

describe('EmptyView', () => {
  it('title 렌더', () => {
    const { container } = render(<EmptyView title="비어있어요" />)
    expect(container.textContent).toContain('비어있어요')
  })

  it('body 옵션', () => {
    const { container } = render(<EmptyView title="t" body="설명" />)
    expect(container.textContent).toContain('설명')
  })

  it('action 렌더', () => {
    const { container } = render(<EmptyView title="t" action={<button>action</button>} />)
    expect(container.querySelector('button')).not.toBeNull()
  })

  it('body 없으면 body 영역 없음', () => {
    const { container } = render(<EmptyView title="t" />)
    expect(container.querySelectorAll('.ds-state-body')).toHaveLength(0)
  })
})

describe('LoadingView', () => {
  it('기본 라벨 "불러오는 중..."', () => {
    const { container } = render(<LoadingView />)
    expect(container.textContent).toContain('불러오는 중')
    expect(container.querySelector('.ds-spinner')).not.toBeNull()
  })

  it('label override', () => {
    const { container } = render(<LoadingView label="대기 중" />)
    expect(container.textContent).toContain('대기 중')
  })
})

describe('ErrorView', () => {
  it('기본 제목 "문제가 발생했어요"', () => {
    const { container } = render(<ErrorView />)
    expect(container.textContent).toContain('문제가 발생')
  })

  it('title override', () => {
    const { container } = render(<ErrorView title="오류" />)
    expect(container.textContent).toContain('오류')
  })

  it('onRetry 있으면 버튼 + 클릭 동작', () => {
    const onRetry = vi.fn()
    const { container } = render(<ErrorView onRetry={onRetry} />)
    const btn = container.querySelector('button')
    expect(btn).not.toBeNull()
    fireEvent.click(btn!)
    expect(onRetry).toHaveBeenCalled()
  })

  it('onRetry 없으면 버튼 없음', () => {
    const { container } = render(<ErrorView />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('body 렌더', () => {
    const { container } = render(<ErrorView body="원인 설명" />)
    expect(container.textContent).toContain('원인 설명')
  })
})
