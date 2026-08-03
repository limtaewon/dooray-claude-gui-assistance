import { describe, it, expect } from 'vitest'
import type { DoorayTask } from '@shared/types/dooray'
import {
  changedTaskIds,
  ensureSeenBaseline,
  isTaskSeenMap,
  markAllSeen,
  markSeen
} from './taskSeen'

function task(id: string, updatedAt: string): DoorayTask {
  return {
    id,
    projectId: 'p1',
    subject: id,
    workflowClass: 'working',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt
  }
}

describe('changedTaskIds', () => {
  it('기준선 이후 updatedAt 이 바뀐 업무만 집는다', () => {
    const tasks = [task('a', '2026-08-03T10:56:31Z'), task('b', '2026-08-01T00:00:00Z')]
    const seen = { a: '2026-08-02T00:00:00Z', b: '2026-08-01T00:00:00Z' }
    expect([...changedTaskIds(tasks, seen)]).toEqual(['a'])
  })

  it('기준선에 없던 업무(새로 배정됨)도 알린다', () => {
    const tasks = [task('old', '2026-08-01T00:00:00Z'), task('new', '2026-08-03T00:00:00Z')]
    expect([...changedTaskIds(tasks, { old: '2026-08-01T00:00:00Z' })]).toEqual(['new'])
  })

  it('기록이 아예 없으면(첫 실행) 아무것도 표시하지 않는다', () => {
    const tasks = [task('a', '2026-08-03T00:00:00Z'), task('b', '2026-08-03T00:00:00Z')]
    expect(changedTaskIds(tasks, {}).size).toBe(0)
  })

  it('updatedAt 이 없으면 createdAt 으로 판정한다 — 없는 값끼리 비교해 늘 변경으로 뜨면 안 된다', () => {
    const legacy: DoorayTask = {
      id: 'legacy',
      projectId: 'p1',
      subject: 'legacy',
      workflowClass: 'working',
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: ''
    }
    const seen = markAllSeen([legacy])
    expect(changedTaskIds([legacy], seen).size).toBe(0)
  })
})

describe('ensureSeenBaseline', () => {
  it('기록이 없으면 지금 목록을 기준선으로 삼는다', () => {
    const tasks = [task('a', '2026-08-03T00:00:00Z')]
    expect(ensureSeenBaseline(tasks, {})).toEqual({ a: '2026-08-03T00:00:00Z' })
  })

  it('기록이 있으면 그대로 둔다 — 이미 뜬 배지를 새로고침이 지우면 안 된다', () => {
    const tasks = [task('a', '2026-08-03T00:00:00Z')]
    const seen = { a: '2026-08-01T00:00:00Z' }
    expect(ensureSeenBaseline(tasks, seen)).toBe(seen)
  })
})

describe('markSeen / markAllSeen', () => {
  it('연 업무 하나만 확인 처리하고 나머지 배지는 남긴다', () => {
    const a = task('a', '2026-08-03T00:00:00Z')
    const b = task('b', '2026-08-03T00:00:00Z')
    const seen = { a: '2026-08-01T00:00:00Z', b: '2026-08-01T00:00:00Z' }
    const next = markSeen(seen, a)
    expect([...changedTaskIds([a, b], next)]).toEqual(['b'])
  })

  it('모두 읽음은 목록에 없는 기록을 버린다 — 저장값이 끝없이 늘지 않게', () => {
    const next = markAllSeen([task('a', '2026-08-03T00:00:00Z')])
    expect(next).toEqual({ a: '2026-08-03T00:00:00Z' })
  })
})

describe('isTaskSeenMap', () => {
  it('저장값이 오염됐으면 거른다', () => {
    expect(isTaskSeenMap({ a: '2026-08-01T00:00:00Z' })).toBe(true)
    expect(isTaskSeenMap({})).toBe(true)
    expect(isTaskSeenMap({ a: 3 })).toBe(false)
    expect(isTaskSeenMap([])).toBe(false)
    expect(isTaskSeenMap(null)).toBe(false)
  })
})
