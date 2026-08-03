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

/** 이슈 #35 — 정렬 · 변경 감지 · 태그. */
describe('TaskDrawer — 정렬과 변경 감지', () => {
  const OLD: DoorayTask = { ...TASK, id: 'old', subject: '오래된 업무', updatedAt: '2026-08-01T00:00:00Z' }
  const FRESH: DoorayTask = {
    ...TASK,
    id: 'fresh',
    subject: '방금 댓글 달린 업무',
    updatedAt: '2026-08-03T10:56:31Z'
  }

  /** 프로젝트 · 정렬 · 확인기준선 세 저장값에 각각 답한다. */
  function storedSettings(over: { sort?: unknown; seen?: unknown } = {}): void {
    vi.mocked(window.api.settings.get).mockImplementation(async (key: string) => {
      if (key === 'terminalTaskProjects') return ['p1']
      if (key === 'terminalTaskSort') return over.sort ?? null
      if (key === 'terminalTaskSeen') return over.seen ?? null
      return null
    })
  }

  beforeEach(() => {
    installMockWindowApi()
    storedSettings()
    vi.mocked(window.api.dooray.tasks.list).mockResolvedValue([OLD, FRESH])
    vi.mocked(window.api.workspace.repos.list).mockResolvedValue([REPO])
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue(
      settingsWith({ p1: { repoIds: ['r1'] } })
    )
  })

  afterEach(() => {
    resetMockWindowApi()
  })

  it('기본은 최근 변경순 — 댓글이 달린 업무가 위로 온다', async () => {
    renderWithDs(<TaskDrawer />)

    await waitFor(() => expect(screen.getByText('오래된 업무')).toBeInTheDocument())
    // getAllByText 는 문서 순서로 준다 — 카드가 실제로 놓인 차례가 그대로 나온다.
    const subjects = screen
      .getAllByText(/^(방금 댓글 달린 업무|오래된 업무)$/)
      .map((el) => el.textContent)
    expect(subjects).toEqual(['방금 댓글 달린 업무', '오래된 업무'])
  })

  it('첫 실행(기준선 없음)에는 변경 배지를 붙이지 않고 기준선만 저장한다', async () => {
    renderWithDs(<TaskDrawer />)

    await waitFor(() => expect(screen.getByText('오래된 업무')).toBeInTheDocument())
    expect(screen.queryByLabelText('지난번에 본 뒤 변경됨')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(window.api.settings.set).toHaveBeenCalledWith('terminalTaskSeen', {
        old: '2026-08-01T00:00:00Z',
        fresh: '2026-08-03T10:56:31Z'
      })
    )
  })

  it('지난번에 본 뒤 updatedAt 이 바뀐 업무에만 배지를 붙인다', async () => {
    storedSettings({ seen: { old: '2026-08-01T00:00:00Z', fresh: '2026-08-02T00:00:00Z' } })

    renderWithDs(<TaskDrawer />)

    await waitFor(() => expect(screen.getByText('방금 댓글 달린 업무')).toBeInTheDocument())
    expect(screen.getAllByLabelText('지난번에 본 뒤 변경됨')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /모두 읽음/ })).toBeInTheDocument()
  })

  it('모두 읽음을 누르면 배지가 사라지고 기준선이 저장된다', async () => {
    storedSettings({ seen: { old: '2026-08-01T00:00:00Z', fresh: '2026-08-02T00:00:00Z' } })
    renderWithDs(<TaskDrawer />)
    await waitFor(() => expect(screen.getByText('방금 댓글 달린 업무')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /모두 읽음/ }))

    expect(screen.queryByLabelText('지난번에 본 뒤 변경됨')).not.toBeInTheDocument()
    expect(window.api.settings.set).toHaveBeenCalledWith('terminalTaskSeen', {
      old: '2026-08-01T00:00:00Z',
      fresh: '2026-08-03T10:56:31Z'
    })
  })

  it('저장된 정렬이 오염돼 있어도 기본값으로 떨어져 목록이 뜬다', async () => {
    storedSettings({ sort: '없는정렬' })

    renderWithDs(<TaskDrawer />)

    await waitFor(() => expect(screen.getByText('방금 댓글 달린 업무')).toBeInTheDocument())
  })
})

describe('TaskDrawer — 카드의 태그', () => {
  const TAGGED: DoorayTask = {
    ...TASK,
    id: 'tagged',
    subject: '태그 붙은 업무',
    tags: [{ id: 'g1', name: 'QA', color: 'ff8800' }]
  }
  const PLAIN: DoorayTask = { ...TASK, id: 'plain', subject: '태그 없는 업무' }

  beforeEach(() => {
    installMockWindowApi()
    pickedProjects(['p1'])
    vi.mocked(window.api.dooray.tasks.list).mockResolvedValue([TAGGED, PLAIN])
    vi.mocked(window.api.workspace.repos.list).mockResolvedValue([REPO])
    vi.mocked(window.api.workspace.settings.get).mockResolvedValue(
      settingsWith({ p1: { repoIds: ['r1'] } })
    )
  })

  afterEach(() => {
    resetMockWindowApi()
  })

  it('카드에 태그를 보여준다 — 전에는 필터로만 고를 수 있고 눈에 안 보였다', async () => {
    renderWithDs(<TaskDrawer />)

    expect(await screen.findByRole('button', { name: /태그 QA 로 좁히기/ })).toBeInTheDocument()
  })

  it('태그를 누르면 그 태그의 업무만 남고, 다시 누르면 풀린다', async () => {
    renderWithDs(<TaskDrawer />)
    const chip = await screen.findByRole('button', { name: /태그 QA 로 좁히기/ })

    await userEvent.click(chip)

    expect(screen.queryByText('태그 없는 업무')).not.toBeInTheDocument()
    expect(screen.getByText('태그 붙은 업무')).toBeInTheDocument()

    // 걸린 뒤에는 뺄 수 있는 자리가 둘이다 — 검색창 아래 칩과 카드의 태그. 둘 다 같은 동작이다.
    const removers = screen.getAllByRole('button', { name: /태그 QA 필터 빼기/ })
    expect(removers.length).toBeGreaterThanOrEqual(2)
    await userEvent.click(removers[0])

    expect(await screen.findByText('태그 없는 업무')).toBeInTheDocument()
  })

  it('태그 칩 클릭이 상세 오버레이를 열지 않는다 — 좁히려다 창이 뜨면 안 된다', async () => {
    renderWithDs(<TaskDrawer />)

    await userEvent.click(await screen.findByRole('button', { name: /태그 QA 로 좁히기/ }))

    expect(screen.queryByRole('dialog', { name: '태그 붙은 업무' })).not.toBeInTheDocument()
  })
})
