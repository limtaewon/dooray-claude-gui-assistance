import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithDs } from '../../../../../../test/helpers/renderWithDs'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../../test/helpers/mockWindowApi'
import BranchDiffPanel from './BranchDiffPanel'

const BASE_OID = 'a'.repeat(40)

describe('BranchDiffPanel', () => {
  beforeEach(() => installMockWindowApi())
  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  it('기준 대비 바뀐 파일과 커밋 수를 보여준다', async () => {
    vi.mocked(window.api.git.scm.branchDiff).mockResolvedValue({
      baseRef: 'origin/develop',
      baseOid: BASE_OID,
      headRef: 'feature/neon-6774',
      ahead: 3,
      files: [{ path: 'src/main/a.ts', status: 'modified', added: 10, removed: 2 }]
    })

    renderWithDs(<BranchDiffPanel repoPath="/repo" onOpenDiff={() => {}} />)

    expect(await screen.findByText('feature/neon-6774')).toBeInTheDocument()
    expect(screen.getByText('← origin/develop')).toBeInTheDocument()
    expect(screen.getByText('커밋 3')).toBeInTheDocument()
    expect(screen.getByText('a.ts')).toBeInTheDocument()
    expect(screen.getByText('+10')).toBeInTheDocument()
  })

  it('파일을 누르면 기준 커밋 대비 diff 를 연다', async () => {
    vi.mocked(window.api.git.scm.branchDiff).mockResolvedValue({
      baseRef: 'origin/main',
      baseOid: BASE_OID,
      headRef: 'feature/x',
      ahead: 1,
      files: [{ path: 'src/a.ts', status: 'modified' }]
    })
    const onOpenDiff = vi.fn()

    renderWithDs(<BranchDiffPanel repoPath="/repo" onOpenDiff={onOpenDiff} />)
    await userEvent.click(await screen.findByTitle('src/a.ts'))

    expect(onOpenDiff).toHaveBeenCalledWith({
      repoPath: '/repo',
      path: 'src/a.ts',
      oldPath: undefined,
      source: { kind: 'range', baseOid: BASE_OID },
      caption: 'origin/main 대비'
    })
  })

  it('달라진 파일이 없으면 그렇게 말한다', async () => {
    renderWithDs(<BranchDiffPanel repoPath="/repo" onOpenDiff={() => {}} />)
    expect(await screen.findByText('origin/main 와 달라진 파일이 없습니다')).toBeInTheDocument()
  })

  it('기준 브랜치를 못 찾으면 이유를 보여준다', async () => {
    vi.mocked(window.api.git.scm.branchDiff).mockRejectedValue(new Error('기준 브랜치를 찾지 못했습니다'))
    renderWithDs(<BranchDiffPanel repoPath="/repo" onOpenDiff={() => {}} />)
    await waitFor(() => {
      expect(screen.getByText('기준 브랜치를 찾지 못했습니다')).toBeInTheDocument()
    })
  })
})
