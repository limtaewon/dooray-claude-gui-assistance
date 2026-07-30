import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import DiffPanel from './DiffPanel'
import type { GitDiffResult } from '../../../../shared/types/git'

function makeResult(overrides: Partial<GitDiffResult> = {}): GitDiffResult {
  return { files: [], summary: '', patch: '', ...overrides }
}

describe('DiffPanel — 빈 상태', () => {
  it('files 없으면 변경사항 없음 안내', () => {
    const { getByText } = render(<DiffPanel result={makeResult()} branch="main" repoPath="/repo" />)
    expect(getByText('변경사항 없음')).toBeInTheDocument()
  })
})

describe('DiffPanel — 파일 목록', () => {
  const result = makeResult({
    summary: '+10 -3',
    files: [
      { file: 'a.ts', status: 'M', additions: 5, deletions: 1 },
      { file: 'b.ts', status: 'A', additions: 5, deletions: 0 },
      { file: 'c.ts', status: 'D', additions: 0, deletions: 2 },
      { file: 'd.ts', status: '?', additions: 0, deletions: 0 }
    ]
  })

  it('파일 개수/요약 + 상태 라벨 매핑', () => {
    const { getByText } = render(<DiffPanel result={result} branch="main" repoPath="/repo" />)
    expect(getByText('4개 파일 변경 · +10 -3')).toBeInTheDocument()
    expect(getByText('수정')).toBeInTheDocument()
    expect(getByText('추가')).toBeInTheDocument()
    expect(getByText('삭제')).toBeInTheDocument()
    expect(getByText('미추적')).toBeInTheDocument()
  })

  it('onFileCompare 미전달 시 비교 버튼 없음', () => {
    const { container } = render(<DiffPanel result={result} branch="main" repoPath="/repo" />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('onFileCompare 전달 시 클릭하면 파일 경로 인자로 호출', () => {
    const onFileCompare = vi.fn()
    const { getAllByTitle } = render(
      <DiffPanel result={result} branch="main" repoPath="/repo" onFileCompare={onFileCompare} />
    )
    fireEvent.click(getAllByTitle('파일 비교')[0])
    expect(onFileCompare).toHaveBeenCalledWith('a.ts')
  })
})

describe('DiffPanel — patch 라인 색상 분기', () => {
  it('+, -, @@, 나머지 4분기 클래스', () => {
    const result = makeResult({
      files: [{ file: 'a.ts', status: 'M', additions: 1, deletions: 1 }],
      patch: ['+++ b/a.ts', '--- a/a.ts', '@@ -1,1 +1,1 @@', '+added', '-removed', ' context'].join('\n')
    })
    const { container } = render(<DiffPanel result={result} branch="main" repoPath="/repo" />)
    const lines = Array.from(container.querySelectorAll('pre > div'))
    expect(lines[0]).not.toHaveClass('text-emerald-400') // +++ 는 추가 색상 제외
    expect(lines[1]).not.toHaveClass('text-red-400') // --- 는 삭제 색상 제외
    expect(lines[2]).toHaveClass('text-clauday-blue') // @@
    expect(lines[3]).toHaveClass('text-emerald-400') // +added
    expect(lines[4]).toHaveClass('text-red-400') // -removed
    expect(lines[5]).toHaveClass('text-text-tertiary') // context
  })
})

describe('DiffPanel — 스냅샷', () => {
  it('파일 3건 + patch 렌더', () => {
    const result = makeResult({
      summary: '+3 -1',
      files: [
        { file: 'a.ts', status: 'M', additions: 2, deletions: 1 },
        { file: 'b.ts', status: 'A', additions: 1, deletions: 0 },
        { file: 'c.ts', status: 'D', additions: 0, deletions: 0 }
      ],
      patch: '@@ -1,1 +1,1 @@\n+added\n-removed'
    })
    const { container } = render(<DiffPanel result={result} branch="main" repoPath="/repo" />)
    expect(container).toMatchSnapshot()
  })
})
