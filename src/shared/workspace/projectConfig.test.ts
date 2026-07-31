import { describe, it, expect } from 'vitest'
import { resolveProjectConfig, withProjectOverride } from './projectConfig'

const BASE = {
  projectOverrides: {},
  branchTemplate: 'feature/{projectCode}-{taskNumber}',
  taskDropPromptTemplate: '전역 지시: {title}'
}

describe('resolveProjectConfig', () => {
  it('오버라이드가 없으면 전역 기본을 쓴다', () => {
    const config = resolveProjectConfig(BASE, 'p1')
    expect(config.branchTemplate).toBe('feature/{projectCode}-{taskNumber}')
    expect(config.promptTemplate).toBe('전역 지시: {title}')
    expect(config.source).toEqual({ branchTemplate: 'global', promptTemplate: 'global' })
    expect(config.repoIds).toEqual([])
  })

  it('프로젝트 값이 있으면 그것을 쓴다', () => {
    const config = resolveProjectConfig(
      { ...BASE, projectOverrides: { p1: { branchTemplate: 'nd/{taskNumber}', promptTemplate: '프로젝트 지시' } } },
      'p1'
    )
    expect(config.branchTemplate).toBe('nd/{taskNumber}')
    expect(config.promptTemplate).toBe('프로젝트 지시')
    expect(config.source).toEqual({ branchTemplate: 'project', promptTemplate: 'project' })
  })

  it('다른 프로젝트의 값에 영향받지 않는다', () => {
    const settings = { ...BASE, projectOverrides: { p1: { branchTemplate: 'nd/{taskNumber}' } } }
    expect(resolveProjectConfig(settings, 'p2').branchTemplate).toBe(BASE.branchTemplate)
  })

  it('빈 첫 지시 문구는 "지시 안 보냄" 이라는 선택이다 — 전역으로 되돌리지 않는다', () => {
    const config = resolveProjectConfig(
      { ...BASE, projectOverrides: { p1: { promptTemplate: '' } } },
      'p1'
    )
    expect(config.promptTemplate).toBe('')
    expect(config.source.promptTemplate).toBe('project')
  })

  it('빈 브랜치 템플릿은 전역으로 되돌린다 — 브랜치 이름은 비울 수 없다', () => {
    const config = resolveProjectConfig(
      { ...BASE, projectOverrides: { p1: { branchTemplate: '   ' } } },
      'p1'
    )
    expect(config.branchTemplate).toBe(BASE.branchTemplate)
    expect(config.source.branchTemplate).toBe('global')
  })

  it('전역도 비어 있으면 앱 기본값으로 떨어진다', () => {
    const config = resolveProjectConfig(
      { projectOverrides: {}, branchTemplate: '', taskDropPromptTemplate: '' },
      'p1'
    )
    expect(config.branchTemplate).toBeTruthy()
    // 전역 프롬프트가 빈 문자열이면 그대로 '지시 안 보냄'
    expect(config.promptTemplate).toBe('')
  })

  it('프로젝트가 쓰는 저장소 목록을 준다', () => {
    const config = resolveProjectConfig(
      { ...BASE, projectOverrides: { p1: { repoIds: ['r1', 'r2'] } } },
      'p1'
    )
    expect(config.repoIds).toEqual(['r1', 'r2'])
  })
})

describe('withProjectOverride', () => {
  it('기존 값과 합친다', () => {
    const next = withProjectOverride({ p1: { repoIds: ['r1'] } }, 'p1', { branchTemplate: 'x/{taskNumber}' })
    expect(next.p1).toEqual({ repoIds: ['r1'], branchTemplate: 'x/{taskNumber}' })
  })

  it('빈 브랜치 템플릿을 넣으면 키를 지워 전역으로 되돌린다', () => {
    const next = withProjectOverride({ p1: { branchTemplate: 'x' } }, 'p1', { branchTemplate: '' })
    expect(next.p1).toBeUndefined()
  })

  it('저장소를 모두 해제하면 키를 지운다', () => {
    const next = withProjectOverride({ p1: { repoIds: ['r1'] } }, 'p1', { repoIds: [] })
    expect(next.p1).toBeUndefined()
  })

  it('남은 값이 있으면 프로젝트 항목을 유지한다', () => {
    const next = withProjectOverride({ p1: { repoIds: ['r1'], branchTemplate: 'x' } }, 'p1', { branchTemplate: '' })
    expect(next.p1).toEqual({ repoIds: ['r1'] })
  })

  it('빈 첫 지시 문구는 유지한다 — 의미 있는 값이다', () => {
    const next = withProjectOverride({}, 'p1', { promptTemplate: '' })
    expect(next.p1).toEqual({ promptTemplate: '' })
  })

  it('다른 프로젝트를 건드리지 않는다', () => {
    const next = withProjectOverride({ p2: { repoIds: ['r9'] } }, 'p1', { repoIds: ['r1'] })
    expect(next.p2).toEqual({ repoIds: ['r9'] })
  })
})
