import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import SessionRetentionMenu from './SessionRetentionMenu'
import type { ClaudeRetentionState } from '@shared/types/claude-retention'

const SETTINGS_PATH = '/Users/me/.claude/settings.json'

function stateOf(patch: Partial<ClaudeRetentionState>): ClaudeRetentionState {
  return { days: 30, source: 'default', settingsPath: SETTINGS_PATH, ...patch }
}

async function openMenu(): Promise<void> {
  renderWithDs(<SessionRetentionMenu />)
  await userEvent.click(screen.getByRole('button', { name: '세션 보관 기간 설정' }))
  await waitFor(() => expect(screen.getByRole('dialog', { name: '세션 보관 기간' })).toBeInTheDocument())
}

describe('SessionRetentionMenu', () => {
  beforeEach(() => {
    installMockWindowApi()
    vi.mocked(window.api.claude.retentionGet).mockResolvedValue(stateOf({}))
    vi.mocked(window.api.claude.retentionSet).mockImplementation(async (days) =>
      stateOf(days === null ? {} : { days, source: 'settings' })
    )
  })

  afterEach(() => {
    resetMockWindowApi()
  })

  it('기본값을 쓰는 중이면 그 사실과 파일 경로를 알린다', async () => {
    await openMenu()

    await waitFor(() => expect(screen.getByText(/claude 기본값/)).toBeInTheDocument())
    expect(screen.getByText(SETTINGS_PATH)).toBeInTheDocument()
  })

  it('프리셋을 누르면 그 값으로 저장한다', async () => {
    await openMenu()

    await userEvent.click(screen.getByRole('button', { name: '180일' }))

    expect(window.api.claude.retentionSet).toHaveBeenCalledWith(180)
    await waitFor(() => expect(screen.queryByText(/claude 기본값/)).not.toBeInTheDocument())
  })

  it('직접 입력한 값도 저장된다', async () => {
    await openMenu()

    const input = screen.getByLabelText('보관 기간(일)')
    await userEvent.clear(input)
    await userEvent.type(input, '400')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(window.api.claude.retentionSet).toHaveBeenCalledWith(400)
  })

  it('정수가 아니면 저장을 시도하지 않고 이유를 보여준다', async () => {
    await openMenu()

    const input = screen.getByLabelText('보관 기간(일)')
    await userEvent.clear(input)
    await userEvent.type(input, '12.5')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(window.api.claude.retentionSet).not.toHaveBeenCalled()
    expect(screen.getByText(/정수/)).toBeInTheDocument()
  })

  it('저장 실패 사유를 그대로 보여준다 — 조용히 삼키면 왜 안 바뀌는지 알 수 없다', async () => {
    vi.mocked(window.api.claude.retentionSet).mockRejectedValue(
      new Error('/Users/me/.claude/settings.json 를 읽지 못해 저장을 멈췄습니다')
    )
    await openMenu()

    await userEvent.click(screen.getByRole('button', { name: '90일' }))

    await waitFor(() => expect(screen.getByText(/읽지 못해 저장을 멈췄습니다/)).toBeInTheDocument())
  })

  it('설정 파일을 못 읽으면 저장 수단을 아예 감춘다', async () => {
    vi.mocked(window.api.claude.retentionGet).mockResolvedValue(
      stateOf({ source: 'unreadable', error: 'Unexpected token' })
    )
    await openMenu()

    await waitFor(() => expect(screen.getByText(/저장을 막았습니다/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '90일' })).not.toBeInTheDocument()
  })

  it('설정에 값이 있을 때만 기본값으로 되돌리기를 제공한다', async () => {
    vi.mocked(window.api.claude.retentionGet).mockResolvedValue(
      stateOf({ days: 365, source: 'settings' })
    )
    await openMenu()

    const reset = await screen.findByRole('button', { name: /기본값\(30일\)으로 되돌리기/ })
    await userEvent.click(reset)

    expect(window.api.claude.retentionSet).toHaveBeenCalledWith(null)
  })
})
