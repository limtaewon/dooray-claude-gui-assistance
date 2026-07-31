/**
 * status 엔트리 상한. 무시되지 않은 거대 폴더가 있는 저장소는 status 출력만으로 렌더러를 얼릴 수
 * 있어, 이 수를 넘으면 git 을 중단하고 '변경이 너무 많음' 상태로 전환한다.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/shared/git-status-limit.ts`. Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: 없음 (verbatim).
 */
export const DEFAULT_GIT_STATUS_LIMIT = 1_000

export function resolveGitStatusLimit(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : DEFAULT_GIT_STATUS_LIMIT
}

export function capGitStatusEntries<T>(
  entries: T[],
  limit: number,
  previous: { didHitLimit?: boolean; statusLength?: number } = {}
): { entries: T[]; didHitLimit?: true; statusLength?: number } {
  const exceededLimit = limit > 0 && entries.length > limit
  if (!exceededLimit && previous.didHitLimit !== true) {
    return { entries }
  }
  return {
    entries: exceededLimit ? entries.slice(0, limit) : entries,
    didHitLimit: true,
    statusLength: Math.max(previous.statusLength ?? 0, entries.length)
  }
}
