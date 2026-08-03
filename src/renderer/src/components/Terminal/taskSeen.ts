import type { DoorayTask } from '@shared/types/dooray'

/**
 * "지난번에 본 뒤로 바뀐 업무" 판정.
 *
 * 두레이는 상태 변경·댓글·본문 수정을 모두 `updatedAt` 갱신으로 남긴다. 그래서 업무마다
 * 마지막으로 본 `updatedAt` 만 적어두면 추가 API 호출 없이 "그 뒤로 뭔가 있었다" 를 안다.
 * 무엇이 바뀌었는지(댓글인지 상태인지)까지는 이 값으로 알 수 없다 — 업무를 열어야 보인다.
 */

/** `taskId` → 마지막으로 확인한 `updatedAt`. */
export type TaskSeenMap = Record<string, string>

export function isTaskSeenMap(value: unknown): value is TaskSeenMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string')
}

function stampOf(task: DoorayTask): string {
  return task.updatedAt || task.createdAt || ''
}

/**
 * 지금 목록에서 배지를 붙일 업무 id.
 *
 * 기록이 아예 없으면(첫 실행·설정 초기화) 아무것도 표시하지 않는다 — 처음 켰는데 전부
 * "변경됨" 이면 배지가 신호가 아니라 배경이 된다. 그 대신 이번 목록을 기준선으로 삼는다.
 */
export function changedTaskIds(tasks: DoorayTask[], seen: TaskSeenMap): Set<string> {
  if (Object.keys(seen).length === 0) return new Set()
  const changed = new Set<string>()
  for (const task of tasks) {
    const last = seen[task.id]
    // 기록에 없는 업무 = 지난번엔 없던 것(새로 배정됨). 이것도 알려줄 값어치가 있다.
    if (last === undefined || last !== stampOf(task)) changed.add(task.id)
  }
  return changed
}

/** 기준선이 없을 때만 지금 목록으로 만든다. 있으면 그대로 둔다(있는 배지를 지우지 않는다). */
export function ensureSeenBaseline(tasks: DoorayTask[], seen: TaskSeenMap): TaskSeenMap {
  if (Object.keys(seen).length > 0) return seen
  return markAllSeen(tasks)
}

/** 업무 하나를 확인 처리 — 상세를 열었을 때. */
export function markSeen(seen: TaskSeenMap, task: DoorayTask): TaskSeenMap {
  return { ...seen, [task.id]: stampOf(task) }
}

/**
 * 지금 목록을 모두 확인 처리.
 *
 * 목록에 없는 id 는 버린다 — 담당에서 빠진 업무의 기록을 계속 이고 가면 저장값이 끝없이 는다.
 */
export function markAllSeen(tasks: DoorayTask[]): TaskSeenMap {
  const next: TaskSeenMap = {}
  for (const task of tasks) next[task.id] = stampOf(task)
  return next
}
