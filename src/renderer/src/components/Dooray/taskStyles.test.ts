import { describe, it, expect, afterEach } from 'vitest'
import { getWorkflowName, tagStyle, WORKFLOW_BG_COLORS } from './taskStyles'
import type { DoorayTask } from '../../../../shared/types/dooray'

function makeTask(overrides: Partial<DoorayTask> = {}): DoorayTask {
  return {
    id: 't1',
    projectId: 'p1',
    subject: '제목',
    workflowClass: 'registered',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

describe('getWorkflowName — 4단 폴백', () => {
  it('workflow.name 최우선', () => {
    expect(getWorkflowName(makeTask({ workflow: { name: 'A' }, workflowName: 'B', workflowClass: 'working' }))).toBe('A')
  })

  it('workflow 없으면 workflowName', () => {
    expect(getWorkflowName(makeTask({ workflowName: 'B', workflowClass: 'working' }))).toBe('B')
  })

  it('workflow/workflowName 둘 다 없으면 workflowClass', () => {
    expect(getWorkflowName(makeTask({ workflowClass: 'working' }))).toBe('working')
  })

  it('전부 없으면 알 수 없음', () => {
    expect(getWorkflowName(makeTask({ workflowClass: '' as unknown as DoorayTask['workflowClass'] }))).toBe('알 수 없음')
  })
})

describe('tagStyle', () => {
  it('color 없으면 빈 객체', () => {
    expect(tagStyle(undefined)).toEqual({})
  })

  it("color 가 'ffffff' 면 빈 객체", () => {
    expect(tagStyle('ffffff')).toEqual({})
  })

  it('light/dark 테마에서 서로 다른 스타일', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const light = tagStyle('ff0000')
    document.documentElement.setAttribute('data-theme', 'dark')
    const dark = tagStyle('ff0000')
    expect(light).not.toEqual(dark)
  })

  it('같은 인자 재호출 시 캐시 히트로 동일 참조', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const a = tagStyle('00ff00')
    const b = tagStyle('00ff00')
    expect(a).toBe(b)
  })

  it('theme-changed 이벤트 이후 캐시가 비워져 새 참조', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const a = tagStyle('0000ff')
    window.dispatchEvent(new Event('theme-changed'))
    const b = tagStyle('0000ff')
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

describe('WORKFLOW_BG_COLORS', () => {
  it('워크플로 5종 키 보유', () => {
    expect(Object.keys(WORKFLOW_BG_COLORS).sort()).toEqual(
      ['backlog', 'closed', 'done', 'registered', 'working'].sort()
    )
  })
})
