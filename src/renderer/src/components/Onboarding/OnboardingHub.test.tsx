import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import OnboardingHub from './OnboardingHub'

describe('OnboardingHub', () => {
  it('메뉴를 리스트업하고 단계 수를 보여준다', () => {
    renderWithDs(<OnboardingHub onStartTour={() => {}} completed={[]} onResetCompleted={() => {}} />)

    expect(screen.getByText('터미널')).toBeInTheDocument()
    expect(screen.getByText('두레이')).toBeInTheDocument()
    expect(screen.getByText('설정')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /온보딩 시작/ }).length).toBeGreaterThan(5)
  })

  it('시작을 누르면 그 메뉴로 투어를 요청한다', async () => {
    const onStartTour = vi.fn()
    renderWithDs(<OnboardingHub onStartTour={onStartTour} completed={[]} onResetCompleted={() => {}} />)

    // 첫 카드(터미널)의 시작 버튼
    await userEvent.click(screen.getAllByRole('button', { name: /온보딩 시작/ })[0])

    expect(onStartTour).toHaveBeenCalledWith('terminal')
  })

  it('이미 본 메뉴는 표시하고 버튼 문구가 다시 보기로 바뀐다', () => {
    renderWithDs(
      <OnboardingHub onStartTour={() => {}} completed={['terminal']} onResetCompleted={() => {}} />
    )

    expect(screen.getByText('봄')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /다시 보기/ })).toBeInTheDocument()
  })

  it('진행 초기화는 본 것이 있을 때만 나온다', async () => {
    const onReset = vi.fn()
    const { unmount } = renderWithDs(
      <OnboardingHub onStartTour={() => {}} completed={[]} onResetCompleted={onReset} />
    )
    expect(screen.queryByRole('button', { name: /진행 초기화/ })).not.toBeInTheDocument()
    unmount()

    renderWithDs(<OnboardingHub onStartTour={() => {}} completed={['mcp']} onResetCompleted={onReset} />)
    await userEvent.click(screen.getByRole('button', { name: /진행 초기화/ }))
    expect(onReset).toHaveBeenCalled()
  })
})
