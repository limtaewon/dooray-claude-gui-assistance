/** 요청 순서대로 재배치. 존재하지 않는 id 는 무시하고, 요청에 없는 id 는 기존 상대 순서로 뒤에 붙인다. */
export function applySessionOrder(currentIds: string[], desiredIds: string[]): string[] {
  const currentSet = new Set(currentIds)
  const seen = new Set<string>()
  const ordered: string[] = []

  for (const id of desiredIds) {
    if (currentSet.has(id) && !seen.has(id)) {
      ordered.push(id)
      seen.add(id)
    }
  }
  for (const id of currentIds) {
    if (!seen.has(id)) ordered.push(id)
  }

  return ordered
}
