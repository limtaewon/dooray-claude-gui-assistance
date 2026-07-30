import { describe, it, expect } from 'vitest'
import { makeRepoId, migrateWorkspaceState, DEFAULT_WORKSPACE_SETTINGS } from './workspaceState'

describe('makeRepoId — 결정성', () => {
  it('같은 경로는 항상 같은 id', () => {
    const a = makeRepoId('/Users/nhn/repo', 'darwin')
    const b = makeRepoId('/Users/nhn/repo', 'darwin')
    expect(a).toBe(b)
  })

  it('다른 경로는 다른 id', () => {
    const a = makeRepoId('/Users/nhn/repo-a', 'darwin')
    const b = makeRepoId('/Users/nhn/repo-b', 'darwin')
    expect(a).not.toBe(b)
  })

  it('win32 대소문자/구분자 차이를 흡수한다', () => {
    const a = makeRepoId('C:\\Users\\nhn\\Repo', 'win32')
    const b = makeRepoId('c:/users/nhn/repo', 'win32')
    expect(a).toBe(b)
  })

  it('basename 을 slug 접두사로 포함한다', () => {
    expect(makeRepoId('/Users/nhn/My Cool Repo', 'darwin')).toMatch(/^my-cool-repo-[0-9a-f]{8}$/)
  })
})

describe('migrateWorkspaceState — 기본 상태', () => {
  it('빈 raw → 기본 상태', () => {
    const state = migrateWorkspaceState(null, {})
    expect(state.schemaVersion).toBe(1)
    expect(state.repos).toEqual([])
    expect(state.projectRepoMap).toEqual({})
    expect(state.workspaces).toEqual({})
    expect(state.taskSessionLinks).toEqual({})
    expect(state.settings).toEqual(DEFAULT_WORKSPACE_SETTINGS)
  })

  it('깨진 raw(문자열) → 기본 상태', () => {
    const state = migrateWorkspaceState('not-an-object', {})
    expect(state.repos).toEqual([])
  })

  it('깨진 raw(배열) → 기본 상태', () => {
    const state = migrateWorkspaceState([1, 2, 3], {})
    expect(state.repos).toEqual([])
  })

  it('taskSessionLinks 기본값은 {}', () => {
    expect(migrateWorkspaceState(undefined, {}).taskSessionLinks).toEqual({})
  })
})

describe('migrateWorkspaceState — legacyGitRepoPath 승격', () => {
  it('repos 가 비어 있으면 첫 저장소로 승격', () => {
    const state = migrateWorkspaceState(null, { legacyGitRepoPath: '/Users/nhn/my-repo' })
    expect(state.repos).toHaveLength(1)
    expect(state.repos[0].path).toBe('/Users/nhn/my-repo')
    expect(state.repos[0].name).toBe('my-repo')
  })

  it('2회 실행해도 항목이 늘지 않는다(멱등)', () => {
    const first = migrateWorkspaceState(null, { legacyGitRepoPath: '/Users/nhn/my-repo' })
    const second = migrateWorkspaceState(first, { legacyGitRepoPath: '/Users/nhn/my-repo' })
    expect(second.repos).toHaveLength(1)
    expect(second.repos[0]).toEqual(first.repos[0])
  })

  it('legacyGitRepoPath 없으면 승격하지 않는다', () => {
    const state = migrateWorkspaceState(null, {})
    expect(state.repos).toEqual([])
  })

  it('repos 가 이미 있으면 승격하지 않는다(빈 문자열 포함 방어)', () => {
    const raw = { repos: [{ id: 'x', path: '/other/repo', name: 'other' }] }
    const state = migrateWorkspaceState(raw, { legacyGitRepoPath: '/Users/nhn/my-repo' })
    expect(state.repos).toHaveLength(1)
    expect(state.repos[0].path).toBe('/other/repo')
  })

  it('legacyGitRepoPath 가 이미 등록된 경로와 같으면(빈 repos 아님) no-op', () => {
    const raw = { repos: [{ id: 'a', path: '/Users/nhn/my-repo', name: 'my-repo' }] }
    const state = migrateWorkspaceState(raw, { legacyGitRepoPath: '/Users/nhn/my-repo' })
    expect(state.repos).toHaveLength(1)
  })

  it('gitRepoPath 값 자체는 이 함수의 관심사가 아니다 — 호출부(index.ts)가 별도로 유지', () => {
    // migrateWorkspaceState 는 WorkspaceState 만 반환하고 clauday-data 스토어를 모른다.
    const state = migrateWorkspaceState(null, { legacyGitRepoPath: '/x' })
    expect(Object.keys(state)).not.toContain('gitRepoPath')
  })
})
