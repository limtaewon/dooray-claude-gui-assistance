import { describe, it, expect } from 'vitest'
import { computeDashboardStats, selectFocusTasks, dueDateKey } from './dashboardStats'
import type { DoorayTask } from '../../../../shared/types/dooray'

const NOW = new Date('2026-08-03T04:00:00.000Z')

function task(over: Partial<DoorayTask> & { id: string }): DoorayTask {
  return {
    projectId: 'p1',
    subject: `태스크 ${over.id}`,
    workflowClass: 'registered',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over
  }
}

describe('computeDashboardStats', () => {
  it('빈 목록이면 모든 값이 0 이다', () => {
    const stats = computeDashboardStats([], NOW)
    expect(stats).toEqual({
      backlog: 0, registered: 0, working: 0, closed: 0,
      total: 0, dueToday: 0, longestWaitingDays: 0, donePercent: 0
    })
  })

  it('워크플로 class 별로 센다', () => {
    const stats = computeDashboardStats([
      task({ id: '1', workflowClass: 'working' }),
      task({ id: '2', workflowClass: 'working' }),
      task({ id: '3', workflowClass: 'closed' }),
      task({ id: '4', workflowClass: 'backlog' }),
      task({ id: '5', workflowClass: 'registered' })
    ], NOW)
    expect(stats.working).toBe(2)
    expect(stats.closed).toBe(1)
    expect(stats.backlog).toBe(1)
    expect(stats.registered).toBe(1)
    expect(stats.total).toBe(5)
  })

  it('오늘 마감 건수를 센다', () => {
    const stats = computeDashboardStats([
      task({ id: '1', dueDateAt: '2026-08-03T14:59:59.000Z' }),
      task({ id: '2', dueDateAt: '2026-08-04T14:59:59.000Z' }),
      task({ id: '3' })
    ], NOW)
    expect(stats.dueToday).toBe(1)
  })

  it('등록 상태에서 가장 오래 대기한 일수를 찾는다', () => {
    const stats = computeDashboardStats([
      task({ id: '1', workflowClass: 'registered', createdAt: '2026-05-05T04:00:00.000Z' }), // 90일
      task({ id: '2', workflowClass: 'registered', createdAt: '2026-07-20T04:00:00.000Z' }), // 14일
      // 진행 중은 '대기'가 아니므로 세지 않는다
      task({ id: '3', workflowClass: 'working', createdAt: '2020-01-01T00:00:00.000Z' })
    ], NOW)
    expect(stats.longestWaitingDays).toBe(90)
  })

  it('createdAt 이 깨져 있어도 죽지 않는다', () => {
    const stats = computeDashboardStats([
      task({ id: '1', workflowClass: 'registered', createdAt: 'not-a-date' })
    ], NOW)
    expect(stats.longestWaitingDays).toBe(0)
  })

  it('완료 비율을 소수 1자리로 낸다', () => {
    const tasks = Array.from({ length: 330 }, (_, i) =>
      task({ id: String(i), workflowClass: i < 312 ? 'closed' : 'working' })
    )
    expect(computeDashboardStats(tasks, NOW).donePercent).toBe(94.5)
  })

  it('total 이 0 이면 비율은 0 이다 (0 나눗셈 방지)', () => {
    expect(computeDashboardStats([], NOW).donePercent).toBe(0)
  })
})

describe('selectFocusTasks', () => {
  it('진행 중과 오늘 마감을 합치되 중복은 한 번만 넣는다', () => {
    const both = task({ id: 'both', workflowClass: 'working', dueDateAt: '2026-08-03T10:00:00.000Z' })
    const result = selectFocusTasks([
      both,
      task({ id: 'working', workflowClass: 'working' }),
      task({ id: 'due', dueDateAt: '2026-08-03T10:00:00.000Z' })
    ], NOW)
    expect(result.map((t) => t.id)).toEqual(['both', 'due', 'working'])
  })

  it('종료된 태스크는 오늘 마감이어도 제외한다', () => {
    // 배지 카운트만 closed 를 거르고 목록은 안 거르면 숫자와 줄 수가 어긋난다 (v2.0.3 회귀)
    const result = selectFocusTasks([
      task({ id: 'closed', workflowClass: 'closed', dueDateAt: '2026-08-03T10:00:00.000Z' }),
      task({ id: 'working', workflowClass: 'working' })
    ], NOW)
    expect(result.map((t) => t.id)).toEqual(['working'])
  })

  it('카운트와 목록 길이가 같다', () => {
    const tasks = [
      task({ id: 'a', workflowClass: 'working' }),
      task({ id: 'b', workflowClass: 'closed', dueDateAt: '2026-08-03T10:00:00.000Z' }),
      task({ id: 'c', dueDateAt: '2026-08-03T10:00:00.000Z' })
    ]
    const result = selectFocusTasks(tasks, NOW)
    expect(result.length).toBe(result.filter((t) => t.workflowClass !== 'closed').length)
  })

  it('limit 만큼만 자른다', () => {
    const tasks = Array.from({ length: 20 }, (_, i) => task({ id: String(i), workflowClass: 'working' }))
    expect(selectFocusTasks(tasks, NOW).length).toBe(10)
    expect(selectFocusTasks(tasks, NOW, 3).length).toBe(3)
  })
})

describe('dueDateKey', () => {
  it('두레이 마감일 문자열의 앞 10자와 같은 형식을 낸다', () => {
    expect(dueDateKey(NOW)).toBe('2026-08-03')
    expect(dueDateKey(NOW)).toBe('2026-08-03T14:59:59.000Z'.substring(0, 10))
  })
})
