import { describe, it, expect } from 'vitest'
import { workspaceKey, parseWorkspaceKey } from './workspaceKey'

describe('workspaceKey', () => {
  it('projectId 와 taskId 를 : 로 합성한다', () => {
    expect(workspaceKey('3939278413760414173', '3963946691142582049')).toBe(
      '3939278413760414173:3963946691142582049'
    )
  })
})

describe('parseWorkspaceKey', () => {
  it('합성키를 projectId/taskId 로 분해한다', () => {
    expect(parseWorkspaceKey('proj-1:task-1')).toEqual({ projectId: 'proj-1', taskId: 'task-1' })
  })

  it('taskId 자체에 : 이 있어도 첫 : 기준으로만 분리한다', () => {
    expect(parseWorkspaceKey('proj-1:task:with:colons')).toEqual({
      projectId: 'proj-1',
      taskId: 'task:with:colons'
    })
  })

  it(': 이 없으면 전체를 projectId 로, taskId 는 빈 문자열', () => {
    expect(parseWorkspaceKey('no-colon')).toEqual({ projectId: 'no-colon', taskId: '' })
  })

  it('workspaceKey 로 만든 값을 다시 parseWorkspaceKey 로 되돌릴 수 있다(왕복)', () => {
    const key = workspaceKey('p1', 't1')
    expect(parseWorkspaceKey(key)).toEqual({ projectId: 'p1', taskId: 't1' })
  })
})
