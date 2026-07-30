import { describe, it, expect, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import RendererToggle from './RendererToggle'

describe('RendererToggle', () => {
  it('setting=webgl · fellBack=false 면 "WebGL" 라벨을 보여준다', () => {
    const { getByTitle } = renderWithDs(
      <RendererToggle setting="webgl" fellBack={false} onChange={vi.fn()} />
    )
    expect(getByTitle('터미널 렌더러 전환')).toHaveTextContent('WebGL')
  })

  it('setting=webgl · fellBack=true 면 "DOM (폴백)" 라벨을 보여준다', () => {
    const { getByTitle } = renderWithDs(
      <RendererToggle setting="webgl" fellBack onChange={vi.fn()} />
    )
    expect(getByTitle('터미널 렌더러 전환')).toHaveTextContent('DOM (폴백)')
  })

  it('setting=dom 이면 fellBack 과 무관하게 "DOM" 라벨을 보여준다', () => {
    const { getByTitle } = renderWithDs(
      <RendererToggle setting="dom" fellBack onChange={vi.fn()} />
    )
    expect(getByTitle('터미널 렌더러 전환')).toHaveTextContent('DOM')
    expect(getByTitle('터미널 렌더러 전환')).not.toHaveTextContent('폴백')
  })

  it('버튼 클릭으로 메뉴가 열리고, 옵션 선택 시 onChange 후 메뉴가 닫힌다', () => {
    const onChange = vi.fn()
    const { getByTitle, getByText, queryByText } = renderWithDs(
      <RendererToggle setting="webgl" fellBack={false} onChange={onChange} />
    )
    fireEvent.click(getByTitle('터미널 렌더러 전환'))
    expect(getByText('호환 모드 · GPU 문제 시 폴백')).toBeInTheDocument()

    fireEvent.click(getByText('DOM'))
    expect(onChange).toHaveBeenCalledWith('dom')
    expect(queryByText('호환 모드 · GPU 문제 시 폴백')).not.toBeInTheDocument()
  })

  it('메뉴가 열린 상태에서 바깥을 클릭하면 닫힌다', () => {
    const { getByTitle, getByText, queryByText } = renderWithDs(
      <div>
        <div data-testid="outside">밖</div>
        <RendererToggle setting="webgl" fellBack={false} onChange={vi.fn()} />
      </div>
    )
    fireEvent.click(getByTitle('터미널 렌더러 전환'))
    expect(getByText('GPU 가속 · 기본값')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(queryByText('GPU 가속 · 기본값')).not.toBeInTheDocument()
  })
})
