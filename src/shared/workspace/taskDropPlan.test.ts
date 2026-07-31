import { describe, it, expect } from 'vitest'
import { planFromCandidate, resolveTaskDropPlan, samePath, sessionForRepo } from './taskDropPlan'
import type { RepoRegistryEntry, TaskSessionLink } from '../types/workspace'

const NEON: RepoRegistryEntry = { id: 'r1', path: '/Users/me/Desktop/2NEON', name: '2NEON' }
const AI: RepoRegistryEntry = { id: 'r2', path: '/Users/me/Desktop/neon-ai', name: 'neon-ai' }

function link(cwd: string, sessionId: string): TaskSessionLink {
  return { cwd, claudeSessionId: sessionId, lastUsedAt: 1 }
}

describe('samePath', () => {
  it('뒤 슬래시 차이는 같은 폴더', () => {
    expect(samePath('/a/b', '/a/b/')).toBe(true)
  })

  it('한쪽이 없으면 다르다', () => {
    expect(samePath(undefined, '/a')).toBe(false)
  })
})

describe('resolveTaskDropPlan — 지금 자리가 이미 매핑된 저장소', () => {
  it('cd 하지 않고 그 자리에서 시작한다 — 사용자가 옮겨둔 선택을 덮지 않는다', () => {
    const plan = resolveTaskDropPlan({
      currentCwd: AI.path,
      mappedRepos: [NEON, AI],
      links: []
    })
    expect(plan).toEqual({
      kind: 'start',
      cwd: AI.path,
      repoName: 'neon-ai',
      sessionId: undefined,
      needsCd: false,
      repo: { path: AI.path, name: 'neon-ai', baseBranch: undefined }
    })
  })

  it('그 폴더의 세션이 있으면 이어간다', () => {
    const plan = resolveTaskDropPlan({
      currentCwd: AI.path,
      mappedRepos: [NEON, AI],
      links: [link(NEON.path, 'neon-sess'), link(AI.path, 'ai-sess')]
    })
    expect(plan).toMatchObject({ kind: 'start', sessionId: 'ai-sess' })
  })
})

describe('resolveTaskDropPlan — 워크트리 안에 있을 때', () => {
  it('워크트리에 있어도 그 저장소에서 작업 중인 것으로 본다', () => {
    // 업무마다 워크트리가 갈리므로 터미널 경로가 등록된 저장소와 같을 일이 오히려 드물다.
    const plan = resolveTaskDropPlan({
      currentCwd: '/Users/me/Desktop/.2NEON-worktrees/feature-neon-6793',
      currentRepoRoot: NEON.path,
      mappedRepos: [NEON, AI],
      links: []
    })
    expect(plan).toMatchObject({ kind: 'start', repo: { path: NEON.path } })
  })
})

describe('sessionForRepo — 워크트리에서 돌린 세션도 그 저장소의 것', () => {
  it('repoPath 가 붙어 있으면 cwd 가 워크트리여도 찾는다', () => {
    const worktree: TaskSessionLink = {
      cwd: '/Users/me/Desktop/.neon-ai-worktrees/feature-neon-6793',
      claudeSessionId: 'wt-sess',
      lastUsedAt: 10,
      repoPath: AI.path
    }
    expect(sessionForRepo([worktree], AI.path)).toEqual({
      sessionId: 'wt-sess',
      cwd: worktree.cwd
    })
  })

  it('repoPath 가 없는 옛 링크는 워크트리 경로 규칙으로 되짚는다', () => {
    const legacy = link('/Users/me/Desktop/.neon-ai-worktrees/feature-neon-6793', 'old-sess')
    expect(sessionForRepo([legacy], AI.path)?.sessionId).toBe('old-sess')
  })

  it('다른 저장소의 워크트리는 섞이지 않는다', () => {
    const other = link('/Users/me/Desktop/.2NEON-worktrees/feature-neon-6793', 'neon-sess')
    expect(sessionForRepo([other], AI.path)).toBeUndefined()
  })

  it('여러 개면 가장 최근 것', () => {
    const older: TaskSessionLink = { cwd: AI.path, claudeSessionId: 'a', lastUsedAt: 1, repoPath: AI.path }
    const newer: TaskSessionLink = {
      cwd: '/Users/me/Desktop/.neon-ai-worktrees/x',
      claudeSessionId: 'b',
      lastUsedAt: 99,
      repoPath: AI.path
    }
    expect(sessionForRepo([older, newer], AI.path)?.sessionId).toBe('b')
  })
})

describe('resolveTaskDropPlan — 매핑되지 않은 자리에 놓았을 때', () => {
  it('저장소가 하나면 묻지 않고 그리로 간다', () => {
    const plan = resolveTaskDropPlan({
      currentCwd: '/tmp/elsewhere',
      mappedRepos: [NEON],
      links: [link(NEON.path, 's1')]
    })
    expect(plan).toEqual({
      kind: 'start',
      cwd: NEON.path,
      repoName: '2NEON',
      sessionId: 's1',
      needsCd: true,
      repo: { path: NEON.path, name: '2NEON', baseBranch: undefined }
    })
  })

  it('저장소가 여럿이면 고르게 한다 — 워크트리에서 하던 것도 이어가기로 잡힌다', () => {
    const plan = resolveTaskDropPlan({
      currentCwd: '/tmp/elsewhere',
      mappedRepos: [NEON, AI],
      links: [
        {
          cwd: '/Users/me/Desktop/.neon-ai-worktrees/feature-neon-6793',
          claudeSessionId: 'ai-sess',
          lastUsedAt: 1,
          repoPath: AI.path
        }
      ]
    })
    expect(plan.kind).toBe('choose')
    if (plan.kind !== 'choose') throw new Error('unreachable')
    expect(plan.candidates).toEqual([
      {
        repoId: 'r1',
        name: '2NEON',
        path: NEON.path,
        baseBranch: undefined,
        sessionId: undefined,
        sessionCwd: undefined
      },
      {
        repoId: 'r2',
        name: 'neon-ai',
        path: AI.path,
        baseBranch: undefined,
        sessionId: 'ai-sess',
        sessionCwd: '/Users/me/Desktop/.neon-ai-worktrees/feature-neon-6793'
      }
    ])
  })

  it('터미널 위치를 모를 때도 저장소가 하나면 그리로 간다', () => {
    const plan = resolveTaskDropPlan({ mappedRepos: [NEON], links: [] })
    expect(plan).toMatchObject({ kind: 'start', cwd: NEON.path, needsCd: true })
  })
})

describe('resolveTaskDropPlan — 매핑이 없을 때', () => {
  it('지금 터미널이 있는 폴더에서 시작한다 — 설정을 안 했다고 드롭이 죽으면 안 된다', () => {
    const plan = resolveTaskDropPlan({
      currentCwd: '/Users/me/Desktop/somewhere',
      mappedRepos: [],
      links: []
    })
    expect(plan).toEqual({
      kind: 'start',
      cwd: '/Users/me/Desktop/somewhere',
      repoName: 'somewhere',
      sessionId: undefined,
      needsCd: false
    })
  })

  it('그 폴더의 세션도 이어간다', () => {
    const plan = resolveTaskDropPlan({
      currentCwd: '/x/y',
      mappedRepos: [],
      links: [link('/x/y', 'sess')]
    })
    expect(plan).toMatchObject({ sessionId: 'sess' })
  })

  it('터미널 위치를 몰라도 있는 자리에서 실행한다 — 저장소 미지정 사용자가 드롭을 못 쓰면 안 된다', () => {
    expect(resolveTaskDropPlan({ mappedRepos: [], links: [] })).toEqual({
      kind: 'start',
      needsCd: false
    })
  })
})

describe('planFromCandidate', () => {
  it('워크트리에서 하던 세션이면 그 폴더로 간다 — 세션은 만들어진 폴더에서만 이어진다', () => {
    const plan = planFromCandidate({
      repoId: 'r2',
      name: 'neon-ai',
      path: AI.path,
      sessionId: 'wt-sess',
      sessionCwd: '/Users/me/Desktop/.neon-ai-worktrees/feature-neon-6793'
    })
    expect(plan).toMatchObject({
      cwd: '/Users/me/Desktop/.neon-ai-worktrees/feature-neon-6793',
      sessionId: 'wt-sess',
      needsCd: true,
      repo: { path: AI.path, name: 'neon-ai' }
    })
  })

  it('고른 저장소로 계획을 만든다', () => {
    const plan = planFromCandidate(
      { repoId: 'r1', name: '2NEON', path: NEON.path, sessionId: 's1' },
      '/tmp/elsewhere'
    )
    expect(plan).toEqual({
      kind: 'start',
      cwd: NEON.path,
      repoName: '2NEON',
      sessionId: 's1',
      needsCd: true,
      repo: { path: NEON.path, name: '2NEON', baseBranch: undefined }
    })
  })

  it('이미 그 폴더면 cd 하지 않는다', () => {
    const plan = planFromCandidate({ repoId: 'r1', name: '2NEON', path: NEON.path }, NEON.path)
    expect(plan.needsCd).toBe(false)
  })
})
