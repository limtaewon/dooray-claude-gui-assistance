import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import OpenInEditorButton, { resetEditorCache } from './OpenInEditorButton'
import type { DetectedEditor } from '@shared/types/editor'

const WORKTREE = '/Users/me/.2NEON-worktrees/feature-neon-6793'

const INTELLIJ: DetectedEditor = {
  id: 'intellij',
  name: 'IntelliJ IDEA',
  target: '/Applications/IntelliJ IDEA.app',
  kind: 'app'
}
const VSCODE: DetectedEditor = {
  id: 'vscode',
  name: 'VS Code',
  target: '/Applications/Visual Studio Code.app',
  kind: 'app'
}

describe('OpenInEditorButton', () => {
  beforeEach(() => {
    installMockWindowApi()
    resetEditorCache()
  })

  afterEach(() => {
    resetMockWindowApi()
    resetEditorCache()
  })

  it('설치된 에디터가 없으면 아무 것도 그리지 않는다 — 눌러도 안 되는 버튼을 두지 않는다', async () => {
    vi.mocked(window.api.editor.list).mockResolvedValue([])

    renderWithDs(<OpenInEditorButton path={WORKTREE} />)

    await waitFor(() => expect(window.api.editor.list).toHaveBeenCalled())
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('하나뿐이면 고르는 단계 없이 바로 연다', async () => {
    vi.mocked(window.api.editor.list).mockResolvedValue([INTELLIJ])

    renderWithDs(<OpenInEditorButton path={WORKTREE} />)

    const button = await screen.findByRole('button', { name: `IntelliJ IDEA 로 열기 — ${WORKTREE}` })
    await userEvent.click(button)

    expect(window.api.editor.open).toHaveBeenCalledWith({ editorId: 'intellij', path: WORKTREE })
  })

  it('여러 개면 골라서 연다', async () => {
    vi.mocked(window.api.editor.list).mockResolvedValue([INTELLIJ, VSCODE])

    renderWithDs(<OpenInEditorButton path={WORKTREE} />)

    await userEvent.click(await screen.findByRole('button', { name: `에디터로 열기 — ${WORKTREE}` }))
    await userEvent.click(screen.getByRole('button', { name: 'VS Code' }))

    expect(window.api.editor.open).toHaveBeenCalledWith({ editorId: 'vscode', path: WORKTREE })
  })

  it('열기가 실패하면 이유를 알린다 — 조용히 아무 일도 안 일어나면 안 된다', async () => {
    vi.mocked(window.api.editor.list).mockResolvedValue([INTELLIJ])
    vi.mocked(window.api.editor.open).mockRejectedValue(new Error('폴더가 없습니다'))

    renderWithDs(<OpenInEditorButton path={WORKTREE} />)

    await userEvent.click(await screen.findByRole('button', { name: /IntelliJ IDEA 로 열기/ }))

    await waitFor(() => expect(screen.getByText('IntelliJ IDEA 로 열지 못했습니다')).toBeInTheDocument())
    expect(screen.getByText('폴더가 없습니다')).toBeInTheDocument()
  })

  it('감지는 한 번만 — 버튼이 여러 개 붙어도 IPC 를 반복하지 않는다', async () => {
    vi.mocked(window.api.editor.list).mockResolvedValue([INTELLIJ])

    renderWithDs(
      <>
        <OpenInEditorButton path={WORKTREE} />
        <OpenInEditorButton path={`${WORKTREE}-2`} />
        <OpenInEditorButton path={`${WORKTREE}-3`} />
      </>
    )

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(3))
    expect(window.api.editor.list).toHaveBeenCalledTimes(1)
  })
})
