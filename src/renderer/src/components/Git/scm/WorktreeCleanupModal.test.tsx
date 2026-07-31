import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithDs } from '../../../../../../test/helpers/renderWithDs'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../../test/helpers/mockWindowApi'
import WorktreeCleanupModal from './WorktreeCleanupModal'

const NOW = Date.now()
const DAY = 86_400_000

function setUsage(): void {
  vi.mocked(window.api.git.worktreeUsage).mockResolvedValue([
    { path: '/repo', branch: 'feature/neon-6793', isMain: true, sizeBytes: 999, dirtyFiles: 0, mtimeMs: NOW },
    {
      path: '/repo-wt/feature-neon-6460',
      branch: 'feature/neon-6460',
      isMain: false,
      sizeBytes: 3 * 1024 * 1024,
      dirtyFiles: 0,
      mtimeMs: NOW - 40 * DAY
    },
    {
      path: '/repo-wt/feature-neon-6711',
      branch: 'feature/neon-6711',
      isMain: false,
      sizeBytes: 1024 * 1024,
      dirtyFiles: 2,
      mtimeMs: NOW - DAY
    }
  ])
}

describe('WorktreeCleanupModal', () => {
  beforeEach(() => {
    installMockWindowApi()
    setUsage()
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  it('본 저장소는 목록에 없고, 오래 안 쓴 것이 위에 온다', async () => {
    renderWithDs(<WorktreeCleanupModal repoPath="/repo" onClose={() => {}} onRemoved={() => {}} />)

    const boxes = await screen.findAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    expect(boxes[0]).toHaveAccessibleName('feature/neon-6460 선택')
    expect(screen.queryByText('feature/neon-6793')).not.toBeInTheDocument()
  })

  it('고르면 확보 용량을 합산해 보여준다', async () => {
    renderWithDs(<WorktreeCleanupModal repoPath="/repo" onClose={() => {}} onRemoved={() => {}} />)

    await userEvent.click(await screen.findByRole('checkbox', { name: 'feature/neon-6460 선택' }))

    expect(screen.getByText(/1개 선택 · 3\.0 MB 확보/)).toBeInTheDocument()
  })

  it('커밋 안 된 변경이 있는 워크트리는 표시하고, 지울 때 force 를 쓴다', async () => {
    const onRemoved = vi.fn()
    renderWithDs(<WorktreeCleanupModal repoPath="/repo" onClose={() => {}} onRemoved={onRemoved} />)

    await userEvent.click(await screen.findByRole('checkbox', { name: 'feature/neon-6711 선택' }))
    expect(screen.getByText('변경 2')).toBeInTheDocument()
    expect(screen.getByText(/커밋 안 된 변경이 있는 1개 포함/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /선택 삭제/ }))

    await waitFor(() => {
      expect(window.api.git.removeWorktree).toHaveBeenCalledWith({
        repoPath: '/repo',
        worktreePath: '/repo-wt/feature-neon-6711',
        force: true
      })
    })
    expect(onRemoved).toHaveBeenCalled()
  })

  it('변경이 없으면 force 없이 지운다', async () => {
    renderWithDs(<WorktreeCleanupModal repoPath="/repo" onClose={() => {}} onRemoved={() => {}} />)

    await userEvent.click(await screen.findByRole('checkbox', { name: 'feature/neon-6460 선택' }))
    await userEvent.click(screen.getByRole('button', { name: /선택 삭제/ }))

    await waitFor(() => {
      expect(window.api.git.removeWorktree).toHaveBeenCalledWith(
        expect.objectContaining({ force: false })
      )
    })
  })

  it('아무것도 안 골랐으면 삭제 버튼이 잠겨 있다', async () => {
    renderWithDs(<WorktreeCleanupModal repoPath="/repo" onClose={() => {}} onRemoved={() => {}} />)

    await screen.findAllByRole('checkbox')
    expect(screen.getByRole('button', { name: /선택 삭제/ })).toBeDisabled()
  })
})
