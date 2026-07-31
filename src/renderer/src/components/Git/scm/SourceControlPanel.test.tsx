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

function mockStatus(entries: GitStatusEntry[] = ENTRIES): void {
  vi.mocked(window.api.git.scm.status).mockResolvedValue({
    entries,
    branch: 'refs/heads/feature/neon-6793',
    head: 'abc1234',
    conflictOperation: 'none'
  } as never)
}

async function render(): Promise<void> {
  renderWithDs(<SourceControlPanel repoPath="/repo" onOpenDiff={() => {}} />)
  await screen.findByText('feature/neon-6793')
}

describe('SourceControlPanel — 커밋 대상 선택', () => {
  beforeEach(() => {
    installMockWindowApi()
    mockStatus()
    vi.mocked(window.api.git.scm.commit).mockResolvedValue({ ok: true, message: '' })
  })

  afterEach(() => {
    resetMockWindowApi()
    vi.clearAllMocks()
  })

  it('추적 여부로만 나눈다 — 체크해도 파일이 섹션을 옮겨 다니지 않는다', async () => {
    await render()

    expect(screen.getByText('변경')).toBeInTheDocument()
    expect(screen.getByText('버전이 없는 파일')).toBeInTheDocument()
    // 스테이징 섹션은 없다
    expect(screen.queryByText('커밋에 포함')).not.toBeInTheDocument()

    const box = screen.getByRole('checkbox', { name: /docs\/new\.sql 커밋에 포함/ })
    await userEvent.click(box)

    // 체크만 바뀌고 여전히 같은 섹션에 있다
    expect(screen.getByRole('checkbox', { name: /docs\/new\.sql 커밋에서 빼기/ })).toBeChecked()
    expect(screen.getByText('버전이 없는 파일')).toBeInTheDocument()
  })

  it('추적 중인 변경은 기본으로 골라두고, 버전 없는 파일은 아니다', async () => {
    await render()

    expect(screen.getByRole('checkbox', { name: /src\/changed\.ts 커밋에서 빼기/ })).toBeChecked()
    // 빌드 산출물이 딸려 들어가면 되돌리기 번거롭다 — 새 파일은 사용자가 직접 고른다
    expect(screen.getByRole('checkbox', { name: /docs\/new\.sql 커밋에 포함/ })).not.toBeChecked()
  })

  it('체크한 파일만 커밋한다', async () => {
    await render()

    await userEvent.click(screen.getByRole('checkbox', { name: /src\/changed\.ts 커밋에서 빼기/ }))
    await userEvent.type(screen.getByPlaceholderText(/커밋 메시지/), '작업')
    await userEvent.click(screen.getByRole('button', { name: '커밋' }))

    await waitFor(() => {
      expect(window.api.git.scm.commit).toHaveBeenCalledWith(
        expect.objectContaining({ repoPath: '/repo', message: '작업', paths: ['src/staged.ts'] })
      )
    })
  })

  it('버전 없는 파일도 골라서 커밋에 넣는다', async () => {
    await render()

    await userEvent.click(screen.getByRole('checkbox', { name: /docs\/new\.sql 커밋에 포함/ }))
    await userEvent.type(screen.getByPlaceholderText(/커밋 메시지/), '새 파일')
    await userEvent.click(screen.getByRole('button', { name: '커밋' }))

    await waitFor(() => {
      const call = vi.mocked(window.api.git.scm.commit).mock.calls.at(-1)?.[0]
      expect(call?.paths).toContain('docs/new.sql')
    })
  })

  it('섹션 헤더 체크박스로 그 섹션을 통째로 넣고 뺀다', async () => {
    await render()

    await userEvent.click(screen.getByRole('checkbox', { name: '버전이 없는 파일 전체 커밋에 포함' }))
    expect(screen.getByRole('checkbox', { name: /docs\/new\.sql 커밋에서 빼기/ })).toBeChecked()

    await userEvent.click(screen.getByRole('checkbox', { name: '변경 전체 빼기' }))
    expect(screen.getByRole('checkbox', { name: /src\/changed\.ts 커밋에 포함/ })).not.toBeChecked()
  })

  it('고른 파일이 없으면 커밋할 수 없다', async () => {
    await render()

    await userEvent.type(screen.getByPlaceholderText(/커밋 메시지/), '작업')
    await userEvent.click(screen.getByRole('checkbox', { name: '변경 전체 빼기' }))

    expect(screen.getByRole('button', { name: '커밋' })).toBeDisabled()
  })

  it('커밋 및 푸시는 커밋 후 바로 올린다', async () => {
    vi.mocked(window.api.git.scm.push).mockResolvedValue({ ok: true, message: '' })
    await render()

    await userEvent.type(screen.getByPlaceholderText(/커밋 메시지/), '작업')
    await userEvent.click(screen.getByRole('button', { name: '커밋 및 푸시' }))

    await waitFor(() => {
      expect(window.api.git.scm.commit).toHaveBeenCalled()
      expect(window.api.git.scm.push).toHaveBeenCalled()
    })
  })

  it('커밋이 실패하면 푸시하지 않는다', async () => {
    vi.mocked(window.api.git.scm.commit).mockResolvedValue({ ok: false, message: 'hook 거부' })
    await render()

    await userEvent.type(screen.getByPlaceholderText(/커밋 메시지/), '작업')
    await userEvent.click(screen.getByRole('button', { name: '커밋 및 푸시' }))

    await waitFor(() => expect(window.api.git.scm.commit).toHaveBeenCalled())
    expect(window.api.git.scm.push).not.toHaveBeenCalled()
  })
})
