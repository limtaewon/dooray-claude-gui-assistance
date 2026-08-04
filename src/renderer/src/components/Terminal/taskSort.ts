import type { DoorayTask } from '@shared/types/dooray'

/**
 * 작업 패널 업무 목록의 정렬.
 *
 * 왜 클라이언트 정렬인가: 이 패널은 여러 프로젝트의 업무를 한 목록에 합쳐 보여준다.
 * 두레이 API 는 프로젝트 단위로만 정렬해주므로 합친 뒤 다시 세우지 않으면
 * "프로젝트 A 의 최근 것들 → 프로젝트 B 의 최근 것들" 처럼 프로젝트별로 뭉쳐 나온다.
 */

export type TaskSortKey = 'updated' | 'created' | 'due' | 'workflow'

export const TASK_SORT_LABELS: Record<TaskSortKey, string> = {
  updated: '최근 변경순',
  created: '등록순',
  due: '마감 임박순',
  workflow: '상태순'
}

/** 셀렉트에 그리는 순서 — 기본값이 맨 앞이다. */
export const TASK_SORT_KEYS: TaskSortKey[] = ['updated', 'created', 'due', 'workflow']

export const DEFAULT_TASK_SORT: TaskSortKey = 'updated'

export function isTaskSortKey(value: unknown): value is TaskSortKey {
  return typeof value === 'string' && (TASK_SORT_KEYS as string[]).includes(value)
}

/** 진행 중인 것이 위 — 상태순은 "지금 손대야 하는 것" 부터 보려는 정렬이다. */
const WORKFLOW_ORDER: Record<DoorayTask['workflowClass'], number> = {
  working: 0,
  registered: 1,
  backlog: 2,
  closed: 3
}

/**
 * ISO 문자열 → 비교용 숫자. 값이 없거나 못 읽으면 `fallback`.
 *
 * 두레이는 `updatedAt` 이 비어 오는 업무가 있다(마이그레이션된 오래된 글 등).
 * 그런 것을 0 으로 두면 최근순에서 맨 아래로 가라앉는데, 그게 의도한 자리다.
 */
function time(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? fallback : ms
}

/** 같은 값일 때 목록이 새로고침마다 흔들리지 않도록 고정 순서를 준다. */
function stableTiebreak(a: DoorayTask, b: DoorayTask): number {
  return (b.number ?? 0) - (a.number ?? 0) || a.id.localeCompare(b.id)
}

const COMPARATORS: Record<TaskSortKey, (a: DoorayTask, b: DoorayTask) => number> = {
  updated: (a, b) => time(b.updatedAt, 0) - time(a.updatedAt, 0) || stableTiebreak(a, b),
  created: (a, b) => time(b.createdAt, 0) - time(a.createdAt, 0) || stableTiebreak(a, b),
  // 마감이 없는 업무는 "급하지 않다" — 날짜가 있는 것들 뒤로 보낸다.
  // 둘 다 마감이 없으면 Infinity - Infinity = NaN 이 된다. NaN 이 falsy 라 `||` 로도 결과는
  // 맞지만 그건 우연이다 — 누가 `??` 로 바꾸면 조용히 깨진다. 그래서 명시적으로 가른다.
  due: (a, b) => {
    const da = time(a.dueDateAt, Number.POSITIVE_INFINITY)
    const db = time(b.dueDateAt, Number.POSITIVE_INFINITY)
    if (da !== db) return da < db ? -1 : 1
    return stableTiebreak(a, b)
  },
  workflow: (a, b) =>
    (WORKFLOW_ORDER[a.workflowClass] ?? 9) - (WORKFLOW_ORDER[b.workflowClass] ?? 9) ||
    time(b.updatedAt, 0) - time(a.updatedAt, 0) ||
    stableTiebreak(a, b)
}

/** 원본을 건드리지 않고 정렬한 새 배열을 준다. */
export function sortTasks(tasks: DoorayTask[], key: TaskSortKey): DoorayTask[] {
  return [...tasks].sort(COMPARATORS[key])
}
