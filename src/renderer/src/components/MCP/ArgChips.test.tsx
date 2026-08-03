import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ArgChips from './ArgChips'

/**
 * 로컬 카드와 공유 카드가 같은 컴포넌트를 쓰는지가 핵심이다.
 * v2.0.4 이전에는 공유 탭이 인자를 직접 렌더해서 `Authorization: Bearer …` 가 그대로 보였다.
 */
describe('ArgChips', () => {
  it('인자가 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<ArgChips args={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('평범한 인자는 그대로 보여준다', () => {
    render(<ArgChips args={['-y', 'mcp-remote', 'http://10.161.64.23:20002/mcp']} />)
    expect(screen.getByText('mcp-remote')).toBeInTheDocument()
    expect(screen.getByText('http://10.161.64.23:20002/mcp')).toBeInTheDocument()
  })

  it('헤더로 넘긴 토큰 값이 DOM 어디에도 남지 않는다', () => {
    const secret = '0fe8bb1f8f0d9b0354db3db32fa441e72ab69f52672f88f551e37e4a1f74b571'
    const { container } = render(
      <ArgChips args={['-y', 'mcp-remote', 'http://x/mcp', '--header', `Authorization: Bearer ${secret}`]} />
    )
    expect(container.innerHTML).not.toContain(secret)
    expect(screen.getByText(/Authorization: •+/)).toBeInTheDocument()
  })

  it('가려진 칩은 title 로 이유를 알린다', () => {
    render(<ArgChips args={['--token', 'abcdef123456']} />)
    expect(screen.getByTitle(/시크릿이라 값을 가렸습니다/)).toBeInTheDocument()
  })
})
