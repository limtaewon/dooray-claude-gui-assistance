import { describe, it, expect } from 'vitest'
import type { RepoRegistryEntry, WorkspaceSettings } from '@shared/types/workspace'
import { needsSetup, resolveTaskSetupState } from './taskSetupState'

const REPO: RepoRegistryEntry = { id: 'r1', path: '/Users/me/2NEON', name: '2NEON' }

function settings(projectOverrides: WorkspaceSettings['projectOverrides'] = {}): WorkspaceSettings {
  return {
    branchTemplate: 'feature/{projectCode}-{taskNumber}',
    maxConcurrentRuns: 3,
    autoApproveDefault: false,
    transitionDoorayDefault: false,
    commentBranchDefault: false,
    projectOverrides,
    taskDropResume: true
  } as WorkspaceSettings
}

describe('resolveTaskSetupState', () => {
  it('볼 프로젝트를 안 골랐으면 거기서 멈춘다 — 목록이 빈 첫 번째 이유', () => {
    expect(resolveTaskSetupState({ projectIds: [], settings: settings(), repos: [REPO] })).toEqual({
      stage: 'no-project',
      projectsWithoutRepo: []
    })
  })

  it('저장소를 하나도 등록 안 했으면 그것부터 알린다', () => {
    const state = resolveTaskSetupState({ projectIds: ['p1'], settings: settings(), repos: [] })
    expect(state.stage).toBe('no-repo-registered')
  })

  it('프로젝트에 저장소를 안 붙였으면 그 프로젝트를 짚어준다', () => {
    const state = resolveTaskSetupState({
      projectIds: ['p1', 'p2'],
      settings: settings({ p1: { repoIds: ['r1'] } }),
      repos: [REPO]
    })
    expect(state).toEqual({ stage: 'project-without-repo', projectsWithoutRepo: ['p2'] })
  })

  it('없어진 저장소 id 만 남아 있으면 안 붙인 것으로 본다 — 저장소를 지워도 설정에는 id 가 남는다', () => {
    const state = resolveTaskSetupState({
      projectIds: ['p1'],
      settings: settings({ p1: { repoIds: ['deleted-repo'] } }),
      repos: [REPO]
    })
    expect(state).toEqual({ stage: 'project-without-repo', projectsWithoutRepo: ['p1'] })
  })

  it('설정을 아직 못 읽었으면 전부 미설정으로 본다 — 다 됐다고 속이지 않는다', () => {
    const state = resolveTaskSetupState({ projectIds: ['p1'], settings: null, repos: [REPO] })
    expect(state.stage).toBe('project-without-repo')
  })

  it('다 붙였으면 ready', () => {
    const state = resolveTaskSetupState({
      projectIds: ['p1'],
      settings: settings({ p1: { repoIds: ['r1'] } }),
      repos: [REPO]
    })
    expect(state).toEqual({ stage: 'ready', projectsWithoutRepo: [] })
    expect(needsSetup(state)).toBe(false)
  })

  it('ready 가 아니면 안내가 필요하다', () => {
    expect(needsSetup({ stage: 'no-project', projectsWithoutRepo: [] })).toBe(true)
    expect(needsSetup({ stage: 'no-repo-registered', projectsWithoutRepo: [] })).toBe(true)
  })
})
