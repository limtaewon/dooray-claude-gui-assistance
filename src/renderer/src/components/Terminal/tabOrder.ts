/**
 * 터미널 탭 순서/MRU 규칙 — 순수 함수만. TerminalView 의 세션 엔트리 배열 순서가
 * 탭 순서의 단일 진실이며, 별도 tabOrder state 는 두지 않는다 (ADR-04 §결정 4).
 */

/** activeId 를 overId 위치로 옮긴다. 모르는 id 이거나 동일 id 면 원본 배열을 그대로 반환한다. */
export function moveTab(ids: string[], activeId: string, overId: string): string[] {
  if (activeId === overId) return ids
  const fromIndex = ids.indexOf(activeId)
  const toIndex = ids.indexOf(overId)
  if (fromIndex === -1 || toIndex === -1) return ids

  const next = ids.slice()
  next.splice(fromIndex, 1)
  next.splice(toIndex, 0, activeId)
  return next
}

/** MRU(최근 사용) 스택 맨 앞으로 id 를 승격한다. 중복은 제거하고 cap 을 넘으면 오래된 항목부터 버린다. */
export function pushMru(mru: string[], id: string, cap = 50): string[] {
  const next = [id, ...mru.filter((x) => x !== id)]
  return next.length > cap ? next.slice(0, cap) : next
}

/**
 * 탭을 닫은 뒤 활성화할 다음 탭 id.
 * MRU 스택에서 아직 남아있는 항목 우선 → 오른쪽 이웃 → 왼쪽 이웃 → 남은 탭이 없으면 null.
 * order 는 closedId 를 제거하기 "전" 순서를 넘겨야 이웃 탐색이 가능하다.
 */
export function pickNextActiveTab(order: string[], closedId: string, mru: string[]): string | null {
  const remaining = order.filter((id) => id !== closedId)
  if (remaining.length === 0) return null

  for (const id of mru) {
    if (id !== closedId && remaining.includes(id)) return id
  }

  const closedIndex = order.indexOf(closedId)
  if (closedIndex === -1) return remaining[remaining.length - 1]

  for (let i = closedIndex + 1; i < order.length; i++) {
    if (remaining.includes(order[i])) return order[i]
  }
  for (let i = closedIndex - 1; i >= 0; i--) {
    if (remaining.includes(order[i])) return order[i]
  }
  return remaining[0]
}
