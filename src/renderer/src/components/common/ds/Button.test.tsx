import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Button from './Button'

describe('<Button />', () => {
  it('children 을 렌더링한다', () => {
    render(<Button>새 태스크</Button>)
    expect(screen.getByRole('button', { name: '새 태스크' })).toBeInTheDocument()
  })

  it('기본 variant 는 secondary, 명시한 variant 가 className 에 들어간다', () => {
    render(<Button>기본</Button>)
    expect(screen.getByRole('button')).toHaveClass('ds-btn', 'secondary')
  })

  it('variant=primary + size=sm 이 className 에 반영', () => {
    render(
      <Button variant="primary" size="sm">
        저장
      </Button>
    )
    const btn = screen.getByRole('button', { name: '저장' })
    expect(btn).toHaveClass('ds-btn', 'primary', 'sm')
  })

  it('size=md 는 클래스로 노출되지 않는다 (기본값)', () => {
    render(<Button size="md">기본</Button>)
    expect(screen.getByRole('button').className).not.toMatch(/\bmd\b/)
  })

  it('leftIcon / rightIcon 을 children 양옆에 렌더', () => {
    render(
      <Button leftIcon={<span data-testid="left">L</span>} rightIcon={<span data-testid="right">R</span>}>
        본문
      </Button>
    )
    expect(screen.getByTestId('left')).toBeInTheDocument()
    expect(screen.getByTestId('right')).toBeInTheDocument()
  })

  it('클릭 핸들러가 호출된다', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>클릭</Button>)
    await userEvent.click(screen.getByRole('button', { name: '클릭' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disabled 일 때 클릭이 무시된다', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        비활성
      </Button>
    )
    await userEvent.click(screen.getByRole('button', { name: '비활성' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('className prop 이 기본 클래스와 합쳐진다', () => {
    render(<Button className="extra-cls">x</Button>)
    expect(screen.getByRole('button')).toHaveClass('ds-btn', 'secondary', 'extra-cls')
  })
})
