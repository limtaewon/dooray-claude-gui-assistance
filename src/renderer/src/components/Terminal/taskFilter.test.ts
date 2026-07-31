import { describe, it, expect } from 'vitest'
import type { DoorayTask } from '@shared/types/dooray'
import {
  EMPTY_TASK_FILTER,
  activeFilterChips,
  clearDetailFilters,
  collectFacets,
  detailFilterCount,
  filterTasks,
  scopedTasks,
  toggleFacetValue,
  toggleFilterFacet
} from './taskFilter'

function task(patch: Partial<DoorayTask> & { id: string }): DoorayTask {
  return {
    projectId: 'p1',
    subject: '제목',
    workflowClass: 'working',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...patch
  }
}

const TASKS: DoorayTask[] = [
  task({
    id: 't1',
    subject: '로그인 화면 개선',
    number: 101,
    workflowClass: 'working',
    workflowName: '진행중',
    tags: [{ id: 'g1', name: '긴급' }],
    milestone: { name: '1차 오픈' }
  }),
  task({
    id: 't2',
    subject: '결제 오류 수정',
    number: 202,
    workflowClass: 'registered',
    workflowName: '접수',
    tags: [{ id: 'g1', name: '긴급' }, { id: 'g2', name: 'QA' }],
    milestone: { name: '2차 오픈' }
  }),
  task({
    id: 't3',
    subject: '문서 정리',
    number: 303,
    workflowClass: 'closed',
    workflowName: '완료',
    tags: [{ id: 'g2', name: 'QA' }]
  })
]

describe('taskFilter — 갈래와 검색어', () => {
  it('내 업무는 완료를 빼고, 완료는 완료만 남긴다', () => {
    expect(scopedTasks(TASKS, EMPTY_TASK_FILTER).map((t) => t.id)).toEqual(['t1', 't2'])
    expect(scopedTasks(TASKS, { ...EMPTY_TASK_FILTER, scope: 'done' }).map((t) => t.id)).toEqual(['t3'])
    expect(scopedTasks(TASKS, { ...EMPTY_TASK_FILTER, scope: 'all' })).toHaveLength(3)
  })

  it('검색어는 제목과 업무 번호 양쪽에 걸린다', () => {
    const byTitle = filterTasks(TASKS, { ...EMPTY_TASK_FILTER, scope: 'all', query: '결제' })
    expect(byTitle.map((t) => t.id)).toEqual(['t2'])

    const byNumber = filterTasks(TASKS, { ...EMPTY_TASK_FILTER, scope: 'all', query: '303' })
    expect(byNumber.map((t) => t.id)).toEqual(['t3'])
  })

  it('대소문자를 가리지 않는다', () => {
    const upper = [task({ id: 'u1', subject: 'Login Retry' })]
    expect(filterTasks(upper, { ...EMPTY_TASK_FILTER, query: 'login' })).toHaveLength(1)
  })
})

describe('taskFilter — 상세 필터', () => {
  it('같은 축 안은 OR 로 묶인다', () => {
    const state = { ...EMPTY_TASK_FILTER, scope: 'all' as const, workflows: ['진행중', '접수'] }
    expect(filterTasks(TASKS, state).map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('축이 다르면 AND 로 좁힌다', () => {
    const state = {
      ...EMPTY_TASK_FILTER,
      scope: 'all' as const,
      tags: ['긴급'],
      milestones: ['2차 오픈']
    }
    expect(filterTasks(TASKS, state).map((t) => t.id)).toEqual(['t2'])
  })

  it('단계 필터를 걸면 단계가 없는 업무는 빠진다', () => {
    const state = { ...EMPTY_TASK_FILTER, scope: 'all' as const, milestones: ['1차 오픈'] }
    expect(filterTasks(TASKS, state).map((t) => t.id)).toEqual(['t1'])
  })

  it('이름이 없는 태그는 id 로 대신 걸린다', () => {
    const noName = [task({ id: 'n1', tags: [{ id: 'raw-tag' }] })]
    const state = { ...EMPTY_TASK_FILTER, tags: ['raw-tag'] }
    expect(filterTasks(noName, state)).toHaveLength(1)
  })
})

describe('taskFilter — 고를 수 있는 값', () => {
  it('상태는 진행 순서대로, 태그는 많이 쓴 순으로 나온다', () => {
    const facets = collectFacets(scopedTasks(TASKS, { ...EMPTY_TASK_FILTER, scope: 'all' }))

    expect(facets.workflows.map((f) => f.value)).toEqual(['진행중', '접수', '완료'])
    expect(facets.tags).toEqual([
      { value: '긴급', count: 2, color: undefined },
      { value: 'QA', count: 2, color: undefined }
    ])
    expect(facets.milestones.map((f) => f.value)).toEqual(['1차 오픈', '2차 오픈'])
  })

  it('건수는 지금 갈래 안에서만 센다', () => {
    const facets = collectFacets(scopedTasks(TASKS, EMPTY_TASK_FILTER))
    expect(facets.tags.find((f) => f.value === 'QA')?.count).toBe(1)
    expect(facets.workflows.map((f) => f.value)).not.toContain('완료')
  })

  it('목록에 없어진 선택값도 0건으로 남긴다 — 걸어둔 필터를 풀 수 있어야 한다', () => {
    const selected = { ...EMPTY_TASK_FILTER, tags: ['사라진태그'] }
    const facets = collectFacets(scopedTasks(TASKS, selected), selected)

    expect(facets.tags.find((f) => f.value === '사라진태그')).toEqual({ value: '사라진태그', count: 0 })
  })

  it('단계가 없는 프로젝트면 단계 후보도 비어 있다', () => {
    const facets = collectFacets([task({ id: 'x1' })])
    expect(facets.milestones).toEqual([])
  })
})

describe('taskFilter — 상태 조작', () => {
  it('같은 값을 다시 고르면 빠진다', () => {
    expect(toggleFacetValue(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleFacetValue(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('축을 지정해 토글하면 다른 축은 그대로다', () => {
    const next = toggleFilterFacet({ ...EMPTY_TASK_FILTER, tags: ['긴급'] }, 'workflows', '진행중')
    expect(next.workflows).toEqual(['진행중'])
    expect(next.tags).toEqual(['긴급'])
  })

  it('개수와 지우기는 갈래·검색어를 건드리지 않는다', () => {
    const state = {
      ...EMPTY_TASK_FILTER,
      scope: 'all' as const,
      query: '결제',
      workflows: ['진행중'],
      tags: ['긴급', 'QA']
    }
    expect(detailFilterCount(state)).toBe(3)

    const cleared = clearDetailFilters(state)
    expect(detailFilterCount(cleared)).toBe(0)
    expect(cleared.scope).toBe('all')
    expect(cleared.query).toBe('결제')
  })

  it('걸린 필터는 상태 → 태그 → 단계 순으로 늘어놓는다', () => {
    const chips = activeFilterChips({
      ...EMPTY_TASK_FILTER,
      workflows: ['진행중'],
      tags: ['긴급'],
      milestones: ['1차 오픈']
    })
    expect(chips).toEqual([
      { key: 'workflows', value: '진행중' },
      { key: 'tags', value: '긴급' },
      { key: 'milestones', value: '1차 오픈' }
    ])
  })
})
