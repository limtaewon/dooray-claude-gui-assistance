import type { DoorayTask } from '@shared/types/dooray'
import { getWorkflowName } from '../Dooray/taskStyles'

/**
 * 작업 패널 업무 목록의 검색·필터 계산.
 *
 * 좁은 패널이라 필터 UI 는 팝오버로 접어두고, 판정은 여기 순수 함수에 모아 UI 없이 검증한다.
 */

/** 큰 갈래 — 칩으로 늘 보이는 1차 구분. */
export type TaskScope = 'mine' | 'all' | 'done'

export interface TaskFilterState {
  scope: TaskScope
  query: string
  /** 상태(워크플로우) 이름. 같은 축 안은 OR, 축끼리는 AND. */
  workflows: string[]
  tags: string[]
  /** 두레이의 '단계' = 마일스톤 이름 */
  milestones: string[]
}

/** 상세 검색에서 여러 값을 고를 수 있는 축. */
export type TaskFacetKey = 'workflows' | 'tags' | 'milestones'

export const TASK_FACET_LABELS: Record<TaskFacetKey, string> = {
  workflows: '상태',
  tags: '태그',
  milestones: '단계'
}

export const EMPTY_TASK_FILTER: TaskFilterState = {
  scope: 'mine',
  query: '',
  workflows: [],
  tags: [],
  milestones: []
}

export interface TaskFacetOption {
  value: string
  /** 현재 갈래·검색어 안에서 이 값을 가진 업무 수 */
  count: number
  /** 태그 색(두레이 hex, `#` 없음). 상태·단계에는 없다. */
  color?: string
}

export type TaskFacets = Record<TaskFacetKey, TaskFacetOption[]>

/** 진행 순서대로 — 상태 목록은 건수보다 흐름 순서가 읽기 쉽다. */
const WORKFLOW_CLASS_ORDER: Record<string, number> = {
  working: 0,
  registered: 1,
  backlog: 2,
  done: 3,
  closed: 4
}

function tagNamesOf(task: DoorayTask): string[] {
  return (task.tags ?? []).map((tag) => tag.name || tag.id).filter((name) => name.length > 0)
}

function milestoneNameOf(task: DoorayTask): string {
  return task.milestone?.name?.trim() ?? ''
}

function matchesScope(task: DoorayTask, scope: TaskScope): boolean {
  if (scope === 'done') return task.workflowClass === 'closed'
  if (scope === 'mine') return task.workflowClass !== 'closed'
  return true
}

function matchesQuery(task: DoorayTask, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return task.subject.toLowerCase().includes(q) || String(task.number ?? '').includes(q)
}

function matchesFacets(task: DoorayTask, state: TaskFilterState): boolean {
  if (state.workflows.length > 0 && !state.workflows.includes(getWorkflowName(task))) return false
  if (state.tags.length > 0 && !tagNamesOf(task).some((name) => state.tags.includes(name))) return false
  if (state.milestones.length > 0 && !state.milestones.includes(milestoneNameOf(task))) return false
  return true
}

/** 갈래 + 검색어까지만 적용한 목록 — 상세 필터 후보를 뽑는 모집단이다. */
export function scopedTasks(tasks: DoorayTask[], state: TaskFilterState): DoorayTask[] {
  return tasks.filter((task) => matchesScope(task, state.scope) && matchesQuery(task, state.query))
}

/** 갈래 · 검색어 · 상세 필터를 모두 적용한 최종 목록. */
export function filterTasks(tasks: DoorayTask[], state: TaskFilterState): DoorayTask[] {
  return scopedTasks(tasks, state).filter((task) => matchesFacets(task, state))
}

function sortedByCount(map: Map<string, TaskFacetOption>): TaskFacetOption[] {
  return Array.from(map.values()).sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value, 'ko')
  )
}

/**
 * 목록에서 고를 수 있는 상세 필터 값과 건수.
 *
 * `selected` 를 주면 지금 목록에 없는 선택값도 0건으로 남긴다 — 안 그러면 걸어둔 필터가
 * 화면에서 사라져 결과만 0건인 채로 풀 방법이 없다.
 */
export function collectFacets(tasks: DoorayTask[], selected?: TaskFilterState): TaskFacets {
  const workflows = new Map<string, TaskFacetOption & { order: number }>()
  const tags = new Map<string, TaskFacetOption>()
  const milestones = new Map<string, TaskFacetOption>()

  for (const task of tasks) {
    const wfName = getWorkflowName(task)
    const wf = workflows.get(wfName)
    if (wf) wf.count++
    else
      workflows.set(wfName, {
        value: wfName,
        count: 1,
        order: WORKFLOW_CLASS_ORDER[task.workflowClass] ?? 2
      })

    for (const tag of task.tags ?? []) {
      const name = tag.name || tag.id
      if (!name) continue
      const existing = tags.get(name)
      if (existing) existing.count++
      else tags.set(name, { value: name, count: 1, color: tag.color })
    }

    const milestone = milestoneNameOf(task)
    if (milestone) {
      const existing = milestones.get(milestone)
      if (existing) existing.count++
      else milestones.set(milestone, { value: milestone, count: 1 })
    }
  }

  if (selected) {
    for (const value of selected.workflows) {
      if (!workflows.has(value)) workflows.set(value, { value, count: 0, order: 5 })
    }
    for (const value of selected.tags) {
      if (!tags.has(value)) tags.set(value, { value, count: 0 })
    }
    for (const value of selected.milestones) {
      if (!milestones.has(value)) milestones.set(value, { value, count: 0 })
    }
  }

  return {
    workflows: Array.from(workflows.values())
      .sort((a, b) => a.order - b.order || b.count - a.count || a.value.localeCompare(b.value, 'ko'))
      .map(({ value, count }) => ({ value, count })),
    tags: sortedByCount(tags),
    // 단계는 '1차 오픈' → '2차 오픈' 처럼 이름 자체에 순서가 있다.
    milestones: Array.from(milestones.values()).sort((a, b) => a.value.localeCompare(b.value, 'ko'))
  }
}

/** 이미 고른 값이면 빼고, 아니면 더한다. */
export function toggleFacetValue(selected: string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
}

export function toggleFilterFacet(
  state: TaskFilterState,
  key: TaskFacetKey,
  value: string
): TaskFilterState {
  return { ...state, [key]: toggleFacetValue(state[key], value) }
}

/** 갈래·검색어를 뺀, 상세 검색으로 고른 값의 총 개수. */
export function detailFilterCount(state: TaskFilterState): number {
  return state.workflows.length + state.tags.length + state.milestones.length
}

export function clearDetailFilters(state: TaskFilterState): TaskFilterState {
  return { ...state, workflows: [], tags: [], milestones: [] }
}

export interface ActiveFilterChip {
  key: TaskFacetKey
  value: string
}

/** 지금 걸린 상세 필터를 축 순서대로 늘어놓는다 — 검색창 아래 칩으로 그대로 쓴다. */
export function activeFilterChips(state: TaskFilterState): ActiveFilterChip[] {
  const keys: TaskFacetKey[] = ['workflows', 'tags', 'milestones']
  return keys.flatMap((key) => state[key].map((value) => ({ key, value })))
}
