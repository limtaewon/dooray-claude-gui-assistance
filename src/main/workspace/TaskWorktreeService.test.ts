import { describe, it, expect, vi } from 'vitest'
import { TaskWorktreeService, type TaskWorktreeDeps } from './TaskWorktreeService'
import type { GitWorktree } from '../../shared/types/git'

const MAIN: GitWorktree = {
  path: '/Users/me/Desktop/2NEON',
  branch: 'feature/neon-6793',
  head: 'abc',
  isMain: true,
  isBare: false
}

function makeDeps(overrides?: Partial<TaskWorktreeDeps['git']>): {
  deps: TaskWorktreeDeps
  git: TaskWorktreeDeps['git']
  trust: ReturnType<typeof vi.fn>
} {
  const git = {
    listWorktrees: vi.fn().mockResolvedValue([MAIN]),
    listBranches: vi.fn().mockResolvedValue([{ name: 'main', isRemote: false }]),
    createWorktree: vi.fn().mockImplementation(async ({ branch }: { branch: string }) => ({
      path: `/Users/me/Desktop/.2NEON-worktrees/${branch.replace(/\//g, '-')}`,
      branch,
      head: 'def',
      isMain: false,
      isBare: false
    })),
    getDefaultRemoteBranch: vi.fn().mockResolvedValue('origin/develop'),
    addToInfoExclude: vi.fn().mockResolvedValue(true),
    ...overrides
  } as TaskWorktreeDeps['git']
  const trust = vi.fn()
  return { deps: { git, claudeDir: { preApproveTrust: trust } }, git, trust }
}

describe('TaskWorktreeService.ensure', () => {
  it('업무마다 새 워크트리를 만든다 — 다른 업무가 저장소를 점유해도 막히지 않는다', async () => {
    const { deps, git } = makeDeps()

    const info = await new TaskWorktreeService(deps).ensure({
      repoPath: MAIN.path,
      branch: 'feature/neon-6460',
      baseBranch: 'develop'
    })

    expect(info).toEqual({
      path: '/Users/me/Desktop/.2NEON-worktrees/feature-neon-6460',
      branch: 'feature/neon-6460',
      created: true,
      isMainRepo: false
    })
    expect(git.createWorktree).toHaveBeenCalledWith({
      repoPath: MAIN.path,
      branch: 'feature/neon-6460',
      newBranch: true,
      baseBranch: 'develop'
    })
    // 저장소에 정해둔 base 가 있으면 원격을 들여다볼 필요가 없다
    expect(git.getDefaultRemoteBranch).not.toHaveBeenCalled()
  })

  it('base 를 안 정해뒀으면 원격 기본 브랜치에서 갈라낸다 — 지금 HEAD 는 다른 업무의 브랜치다', async () => {
    const { deps, git } = makeDeps()

    await new TaskWorktreeService(deps).ensure({ repoPath: MAIN.path, branch: 'feature/neon-6711' })

    expect(git.createWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ newBranch: true, baseBranch: 'origin/develop' })
    )
  })

  it('원격 기본 브랜치도 모르면 현재 HEAD 에서 갈라내고 경고를 남긴다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { deps, git } = makeDeps({ getDefaultRemoteBranch: vi.fn().mockResolvedValue(null) })

    await new TaskWorktreeService(deps).ensure({ repoPath: MAIN.path, branch: 'feature/neon-6711' })

    expect(git.createWorktree).toHaveBeenCalledWith(
      expect.objectContaining({ newBranch: true, baseBranch: undefined })
    )
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('그 브랜치가 이미 본 저장소에 체크아웃돼 있으면 거기서 한다', async () => {
    // git 은 같은 브랜치를 두 곳에 체크아웃하지 못한다 — 이미 그 브랜치로 작업 중이면 그게 정답이다.
    const { deps, git } = makeDeps()

    const info = await new TaskWorktreeService(deps).ensure({
      repoPath: MAIN.path,
      branch: 'feature/neon-6793'
    })

    expect(info).toEqual({
      path: MAIN.path,
      branch: 'feature/neon-6793',
      created: false,
      isMainRepo: true
    })
    expect(git.createWorktree).not.toHaveBeenCalled()
  })

  it('그 브랜치의 워크트리가 이미 있으면 재사용한다', async () => {
    const existing: GitWorktree = {
      path: '/Users/me/Desktop/.2NEON-worktrees/feature-neon-6460',
      branch: 'feature/neon-6460',
      head: 'def',
      isMain: false,
      isBare: false
    }
    const { deps, git } = makeDeps({ listWorktrees: vi.fn().mockResolvedValue([MAIN, existing]) })

    const info = await new TaskWorktreeService(deps).ensure({
      repoPath: MAIN.path,
      branch: 'feature/neon-6460'
    })

    expect(info).toMatchObject({ path: existing.path, created: false, isMainRepo: false })
    expect(git.createWorktree).not.toHaveBeenCalled()
  })

  it('브랜치가 이미 있으면 새로 만들지 않고 체크아웃한다', async () => {
    const { deps, git } = makeDeps({
      listBranches: vi.fn().mockResolvedValue([
        { name: 'main', isRemote: false },
        { name: 'feature/neon-6460', isRemote: false }
      ])
    })

    await new TaskWorktreeService(deps).ensure({
      repoPath: MAIN.path,
      branch: 'feature/neon-6460',
      baseBranch: 'develop'
    })

    expect(git.createWorktree).toHaveBeenCalledWith({
      repoPath: MAIN.path,
      branch: 'feature/neon-6460',
      newBranch: false,
      baseBranch: undefined
    })
  })

  it('새 워크트리는 trust 를 미리 승인한다 — claude 가 신뢰 여부를 물으면 자동 입력이 먹힌다', async () => {
    const { deps, trust, git } = makeDeps()

    const info = await new TaskWorktreeService(deps).ensure({
      repoPath: MAIN.path,
      branch: 'feature/neon-6460'
    })

    expect(trust).toHaveBeenCalledWith(info.path)
    expect(git.addToInfoExclude).toHaveBeenCalledWith(info.path, expect.arrayContaining(['.claude/']))
  })

  it('info/exclude 갱신 실패가 워크트리 사용을 막지는 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { deps } = makeDeps({ addToInfoExclude: vi.fn().mockRejectedValue(new Error('permission denied')) })

    const info = await new TaskWorktreeService(deps).ensure({
      repoPath: MAIN.path,
      branch: 'feature/neon-6460'
    })

    expect(info.created).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
