import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithDs } from '../../../../../test/helpers/renderWithDs'
import { installMockWindowApi, resetMockWindowApi } from '../../../../../test/helpers/mockWindowApi'
import TaskDrawer from './TaskDrawer'
import type { DoorayTask } from '@shared/types/dooray'
import type { RepoRegistryEntry, WorkspaceSettings } from '@shared/types/workspace'

const REPO: RepoRegistryEntry = { id: 'r1', path: '/Users/me/2NEON', name: '2NEON' }

const TASK: DoorayTask = {
  id: 't1',
  projectId: 'p1',
  projectCode: 'NEON',
  number: 6793,
  subject: '유의어 사전 신규 메뉴',
  workflowClass: 'working',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z'
}

function settingsWith(overrides: WorkspaceSettings['projectOverrides']): WorkspaceSettings {
  return {
    branchTemplate: 'feature/{projectCode}-{taskNumber}',
    maxConcurrentRuns: 3,
    autoApproveDefault: false,
    transitionDoorayDefault: false,
    commentBranchDefault: false,
    projectOverrides: overrides,
    taskDropResume: true
  } as WorkspaceSettings
}

/** 이 패널이 보여줄 프로젝트 설정만 골라 답한다. */
function pickedProjects(ids: string[]): void {
  vi.mocked(window.api.settings.get).mockImplementation(async (key: string) =>
    key === 'terminalTaskProjects' ? ids : null
  )
}

describe('TaskDrawer — 설정이 덜 됐을 때의 안내', () => {
  beforeEach(() => {
    installMockWindowApi()
    pickedProjects([])
    vi.mocked(window.api.dooray.tasks.list).mockResolvedValue([])
    vi.mocked(window.api.workspace.repos.list).mockResolvedValue([REPO])
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue(settingsWith({}))
  })

  afterEach(() => {
    resetMockWindowApi()
  })

  /** "업무가 안 뜬다" 제보의 실제 원인 — 목록이 빈 게 아니라 볼 프로젝트를 안 고른 것이다. */
  it('프로젝트를 안 골랐으면 그 사실과 다음 할 일을 알린다', async () => {
    renderWithDs(<TaskDrawer />)

    expect(await screen.findByText('볼 프로젝트를 아직 안 골랐습니다')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /프로젝트 고르기/ })).toBeInTheDocument()
  })

  it('안내 버튼은 설정 워크스페이스 탭으로 보낸다', async () => {
    const onGoto = vi.fn()
    window.addEventListener('goto-settings', onGoto)
    renderWithDs(<TaskDrawer />)

    await userEvent.click(await screen.findByRole('button', { name: /프로젝트 고르기/ }))

    expect(onGoto).toHaveBeenCalled()
    expect((onGoto.mock.calls[0][0] as CustomEvent).detail).toEqual({ tab: 'workspace' })
    window.removeEventListener('goto-settings', onGoto)
  })

  it('저장소를 하나도 등록 안 했으면 그것부터 알린다', async () => {
    pickedProjects(['p1'])
    vi.mocked(window.api.workspace.repos.list).mockResolvedValue([])

    renderWithDs(<TaskDrawer />)

    expect(await screen.findByText('저장소를 아직 등록하지 않았습니다')).toBeInTheDocument()
  })

  it('프로젝트에 저장소를 안 붙였으면 워크트리가 안 생긴다는 것까지 말한다', async () => {
    pickedProjects(['p1'])

    renderWithDs(<TaskDrawer />)

    expect(await screen.findByText('이 프로젝트에 쓸 저장소를 정하지 않았습니다')).toBeInTheDocument()
    expect(screen.getByText(/워크트리 없이/)).toBeInTheDocument()
  })

  it('설정이 끝났는데 업무가 없으면 설정 얘기를 꺼내지 않는다', async () => {
    pickedProjects(['p1'])
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue(
      settingsWith({ p1: { repoIds: ['r1'] } })
    )

    renderWithDs(<TaskDrawer />)

    expect(await screen.findByText('담당한 업무가 없습니다')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /저장소 정하기/ })).not.toBeInTheDocument()
  })

  it('업무는 떠도 저장소가 없으면 놓기 전에 배너로 알린다', async () => {
    pickedProjects(['p1'])
    vi.mocked(window.api.dooray.tasks.list).mockResolvedValue([TASK])

    renderWithDs(<TaskDrawer />)

    await waitFor(() => expect(screen.getByText('유의어 사전 신규 메뉴')).toBeInTheDocument())
    expect(screen.getByText(/워크트리 없이 시작합니다/)).toBeInTheDocument()
  })

  it('저장소까지 정해져 있으면 배너를 띄우지 않는다', async () => {
    pickedProjects(['p1'])
    vi.mocked(window.api.dooray.tasks.list).mockResolvedValue([TASK])
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue(
      settingsWith({ p1: { repoIds: ['r1'] } })
    )

    renderWithDs(<TaskDrawer />)

    await waitFor(() => expect(screen.getByText('유의어 사전 신규 메뉴')).toBeInTheDocument())
    expect(screen.queryByText(/워크트리 없이 시작합니다/)).not.toBeInTheDocument()
  })
})
