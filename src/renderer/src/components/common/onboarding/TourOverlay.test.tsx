import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithDs } from '../../../../../../test/helpers/renderWithDs'
import TourOverlay from './TourOverlay'
import type { TourStep } from './tours'

const STEPS: TourStep[] = [
  { anchor: 'demo-a', title: '첫 단계', body: '여기서 시작합니다' },
  { title: '둘째 단계', body: '앵커가 없는 단계' },
  { anchor: 'demo-missing', title: '셋째 단계', body: '앵커를 못 찾는 단계' }
]

function setup(index = 0) {
  const onIndexChange = vi.fn()
  const onClose = vi.fn()
  const onFinish = vi.fn()
  const anchor = document.createElement('div')
  anchor.setAttribute('data-tour', 'demo-a')
  document.body.appendChild(anchor)
  renderWithDs(
    <TourOverlay
      steps={STEPS}
      index={index}
      onIndexChange={onIndexChange}
      onClose={onClose}
      onFinish={onFinish}
    />
  )
  return { onIndexChange, onClose, onFinish }
}

describe('TourOverlay', () => {
  it('현재 단계와 진행도를 보여준다', () => {
    setup()
    expect(screen.getByText('첫 단계')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
  })

  it('앵커를 못 찾아도 단계를 건너뛰지 않는다 — 설명에 구멍이 생기면 안 된다', () => {
    setup(2)
    expect(screen.getByText('셋째 단계')).toBeInTheDocument()
  })

  it('다음/이전으로 이동한다', async () => {
    const { onIndexChange } = setup(1)
    await userEvent.click(screen.getByRole('button', { name: '다음 단계' }))
    expect(onIndexChange).toHaveBeenCalledWith(2)
    await userEvent.click(screen.getByRole('button', { name: '이전 단계' }))
    expect(onIndexChange).toHaveBeenCalledWith(0)
  })

  it('첫 단계에서는 이전이 잠겨 있다', () => {
    setup(0)
    expect(screen.getByRole('button', { name: '이전 단계' })).toBeDisabled()
  })

  it('마지막에서는 마치기 — 완료로 처리된다', async () => {
    const { onFinish } = setup(2)
    await userEvent.click(screen.getByRole('button', { name: '안내 마치기' }))
    expect(onFinish).toHaveBeenCalled()
  })

  it('Esc 로 멈춘다', () => {
    const { onClose } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('화살표로도 넘긴다', () => {
    const { onIndexChange } = setup(1)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onIndexChange).toHaveBeenCalledWith(2)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(onIndexChange).toHaveBeenCalledWith(0)
  })
})
