import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithDs } from '../../../../../../test/helpers/renderWithDs'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../../test/helpers/mockWindowApi'
import SourceControlPanel from './SourceControlPanel'
import type { GitStatusEntry } from '@shared/git/statusTypes'

function entry(over: Partial<GitStatusEntry> & { path: string }): GitStatusEntry {
  return { status: 'modified', area: 'unstaged', ...over }
}

const ENTRIES: GitStatusEntry[] = [
  entry({ path: 'src/staged.ts', area: 'staged', status: 'modified' }),
  entry({ path: 'src/changed.ts', area: 'unstaged', status: 'modified' }),
  entry({ path: 'docs/new.sql', area: 'untracked', status: 'untracked' })
]

describe('SourceControlPanel — 커밋 대상 체크박스', () => {
  beforeEach(() => {
    installMockWindowApi()
    vi.mocked(window.api.git.scm.status).mockResolvedValue({
      entries: ENTRIES,
      branch: 'refs/heads/feature/neon-6793',
      head: 'abc1234',
      conflictOperation: 'none'
    } as never)
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  it('스테이징된 파일은 체크, 나머지는 해제로 보인다', async () => {
    renderWithDs(<SourceControlPanel repoPath="/repo" onOpenDiff={() => {}} />)

    expect(await screen.findByRole('checkbox', { name: /src\/staged\.ts 커밋에서 빼기/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /src\/changed\.ts 커밋에 포함/ })).not.toBeChecked()
  })

  it('체크하면 커밋에 포함된다(stage)', async () => {
    renderWithDs(<SourceControlPanel repoPath="/repo" onOpenDiff={() => {}} />)

    await userEvent.click(
      await screen.findByRole('checkbox', { name: /src\/changed\.ts 커밋에 포함/ })
    )

    await waitFor(() => {
      expect(window.api.git.scm.stage).toHaveBeenCalledWith('/repo', ['src/changed.ts'])
    })
  })

  it('추적되지 않은 파일도 체크로 커밋에 넣는다', async () => {
    renderWithDs(<SourceControlPanel repoPath="/repo" onOpenDiff={() => {}} />)

    await userEvent.click(await screen.findByRole('checkbox', { name: /docs\/new\.sql 커밋에 포함/ }))

    await waitFor(() => {
      expect(window.api.git.scm.stage).toHaveBeenCalledWith('/repo', ['docs/new.sql'])
    })
  })

  it('체크를 풀면 커밋에서 뺀다(unstage)', async () => {
    renderWithDs(<SourceControlPanel repoPath="/repo" onOpenDiff={() => {}} />)

    await userEvent.click(
      await screen.findByRole('checkbox', { name: /src\/staged\.ts 커밋에서 빼기/ })
    )

    await waitFor(() => {
      expect(window.api.git.scm.unstage).toHaveBeenCalledWith('/repo', ['src/staged.ts'])
    })
  })

  it('섹션 헤더 체크박스로 그 섹션을 통째로 넣는다', async () => {
    renderWithDs(<SourceControlPanel repoPath="/repo" onOpenDiff={() => {}} />)

    await userEvent.click(await screen.findByRole('checkbox', { name: /추적되지 않음 전체 커밋에 포함/ }))

    await waitFor(() => {
      expect(window.api.git.scm.stage).toHaveBeenCalledWith('/repo', ['docs/new.sql'])
    })
  })
})
