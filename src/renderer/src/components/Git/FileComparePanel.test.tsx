import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import FileComparePanel from './FileComparePanel'
import type { GitFileCompare } from '../../../../shared/types/git'

function makeResult(overrides: Partial<GitFileCompare> = {}): GitFileCompare {
  return {
    file: 'src/a.ts',
    leftContent: 'left content',
    rightContent: 'right content',
    leftBranch: 'main',
    rightBranch: 'feature/x',
    ...overrides
  }
}

describe('FileComparePanel', () => {
  it('좌/우 브랜치명 + 내용을 렌더', () => {
    const { getByText } = render(<FileComparePanel result={makeResult()} onBack={() => {}} />)
    expect(getByText('main')).toBeInTheDocument()
    expect(getByText('feature/x')).toBeInTheDocument()
    expect(getByText('left content')).toBeInTheDocument()
    expect(getByText('right content')).toBeInTheDocument()
  })

  it('← 목록으로 클릭 시 onBack 1회 호출', () => {
    const onBack = vi.fn()
    const { getByText } = render(<FileComparePanel result={makeResult()} onBack={onBack} />)
    fireEvent.click(getByText('← 목록으로'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('스냅샷', () => {
    const { container } = render(<FileComparePanel result={makeResult()} onBack={() => {}} />)
    expect(container).toMatchSnapshot()
  })
})
