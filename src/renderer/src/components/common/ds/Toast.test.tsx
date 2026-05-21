import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import ToastHost, { useToast } from './Toast'

function Probe({ run }: { run: (api: ReturnType<typeof useToast>) => void }): JSX.Element {
  const api = useToast()
  return <button onClick={() => run(api)}>fire</button>
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('ToastHost / useToast', () => {
  it('useToast — Provider 밖 사용 시 throw', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe run={() => {}} />)).toThrow(/within <ToastHost>/)
    errSpy.mockRestore()
  })

  it('push 호출 시 토스트 표시', () => {
    const { container, getByText } = render(
      <ToastHost>
        <Probe run={(api) => api.push({ title: 'Hi', body: 'Body' })} />
      </ToastHost>
    )
    fireEvent.click(getByText('fire'))
    expect(container.textContent).toContain('Hi')
    expect(container.textContent).toContain('Body')
  })

  it('duration 후 자동 닫힘', () => {
    const { container, getByText } = render(
      <ToastHost>
        <Probe run={(api) => api.push({ title: '잠시', duration: 500 })} />
      </ToastHost>
    )
    fireEvent.click(getByText('fire'))
    expect(container.textContent).toContain('잠시')
    act(() => { vi.advanceTimersByTime(600) })
    expect(container.textContent).not.toContain('잠시')
  })

  it('success/error/warn/ai/info 톤 헬퍼', () => {
    const { container, getByText } = render(
      <ToastHost>
        <Probe run={(api) => {
          api.success('OK')
          api.error('Err')
          api.warn('W')
          api.ai('AI')
          api.info('I')
        }} />
      </ToastHost>
    )
    fireEvent.click(getByText('fire'))
    expect(container.querySelectorAll('.ds-toast').length).toBeGreaterThanOrEqual(5)
    expect(container.querySelector('.ds-toast.success')).not.toBeNull()
    expect(container.querySelector('.ds-toast.error')).not.toBeNull()
    expect(container.querySelector('.ds-toast.warn')).not.toBeNull()
    expect(container.querySelector('.ds-toast.ai')).not.toBeNull()
  })

  it('닫기 버튼 클릭 시 토스트 제거', () => {
    const { container, getByText } = render(
      <ToastHost>
        <Probe run={(api) => api.push({ title: 'X' })} />
      </ToastHost>
    )
    fireEvent.click(getByText('fire'))
    const closeBtn = container.querySelector('.t-close') as HTMLElement
    expect(closeBtn).not.toBeNull()
    fireEvent.click(closeBtn)
    expect(container.textContent).not.toContain('X')
  })
})
