import { describe, it, expect } from 'vitest'
import type { DoorayTask } from '@shared/types/dooray'
import { DEFAULT_TASK_SORT, isTaskSortKey, sortTasks } from './taskSort'

function task(over: Partial<DoorayTask> & { id: string }): DoorayTask {
  return {
    projectId: 'p1',
    subject: over.id,
    workflowClass: 'registered',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over
  }
}

const ids = (list: DoorayTask[]): string[] => list.map((t) => t.id)

describe('sortTasks', () => {
  it('최근 변경순은 updatedAt 이 늦은 것부터 — 프로젝트가 섞여도 시간만 본다', () => {
    const tasks = [
      task({ id: 'old', projectId: 'p1', updatedAt: '2026-08-01T00:00:00Z' }),
      task({ id: 'new', projectId: 'p2', updatedAt: '2026-08-03T10:56:31Z' }),
      task({ id: 'mid', projectId: 'p1', updatedAt: '2026-08-02T00:00:00Z' })
    ]
    expect(ids(sortTasks(tasks, 'updated'))).toEqual(['new', 'mid', 'old'])
  })

  it('updatedAt 이 없거나 깨진 업무는 최근순에서 맨 아래로 간다', () => {
    const tasks = [
      task({ id: 'broken', updatedAt: 'not-a-date' }),
      task({ id: 'empty', updatedAt: '' }),
      task({ id: 'real', updatedAt: '2026-08-02T00:00:00Z' })
    ]
    expect(ids(sortTasks(tasks, 'updated'))[0]).toBe('real')
  })

  it('마감 임박순은 가까운 날짜부터, 마감 없는 업무는 뒤로 민다', () => {
    const tasks = [
      task({ id: 'none' }),
      task({ id: 'later', dueDateAt: '2026-09-01T00:00:00Z' }),
      task({ id: 'soon', dueDateAt: '2026-08-05T00:00:00Z' })
    ]
    expect(ids(sortTasks(tasks, 'due'))).toEqual(['soon', 'later', 'none'])
  })

  /** 둘 다 마감이 없으면 Infinity - Infinity = NaN 이다. 그 자리에서도 순서가 안정적이어야 한다. */
  it('마감이 둘 다 없어도 순서가 흔들리지 않는다', () => {
    const tasks = [task({ id: 'a', number: 1 }), task({ id: 'b', number: 2 })]
    const once = ids(sortTasks(tasks, 'due'))
    const twice = ids(sortTasks([...tasks].reverse(), 'due'))
    expect(once).toEqual(twice)
    expect(once).toHaveLength(2)
  })

  it('상태순은 진행 중 → 할 일 → 대기 → 완료 순', () => {
    const tasks = [
      task({ id: 'closed', workflowClass: 'closed' }),
      task({ id: 'backlog', workflowClass: 'backlog' }),
      task({ id: 'working', workflowClass: 'working' }),
      task({ id: 'registered', workflowClass: 'registered' })
    ]
    expect(ids(sortTasks(tasks, 'workflow'))).toEqual(['working', 'registered', 'backlog', 'closed'])
  })

  it('값이 같으면 순서가 흔들리지 않는다 — 새로고침마다 목록이 뒤집히면 안 된다', () => {
    const tasks = [
      task({ id: 'a', number: 1, updatedAt: '2026-08-01T00:00:00Z' }),
      task({ id: 'b', number: 2, updatedAt: '2026-08-01T00:00:00Z' })
    ]
    const once = ids(sortTasks(tasks, 'updated'))
    const twice = ids(sortTasks([...tasks].reverse(), 'updated'))
    expect(once).toEqual(twice)
  })

  it('원본 배열을 건드리지 않는다', () => {
    const tasks = [
      task({ id: 'a', updatedAt: '2026-08-01T00:00:00Z' }),
      task({ id: 'b', updatedAt: '2026-08-03T00:00:00Z' })
    ]
    sortTasks(tasks, 'updated')
    expect(ids(tasks)).toEqual(['a', 'b'])
  })
})

describe('isTaskSortKey', () => {
  it('저장값이 오염됐으면 거른다 — 기본값으로 떨어질 수 있어야 한다', () => {
    expect(isTaskSortKey(DEFAULT_TASK_SORT)).toBe(true)
    expect(isTaskSortKey('due')).toBe(true)
    expect(isTaskSortKey('없는키')).toBe(false)
    expect(isTaskSortKey(null)).toBe(false)
    expect(isTaskSortKey(3)).toBe(false)
  })
})
