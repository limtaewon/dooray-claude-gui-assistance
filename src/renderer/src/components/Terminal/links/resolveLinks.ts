/**
 * 링크 존재 검증 오케스트레이션 (ADR-v2-terminal-p2-05 §레이어 5) — 후보 배치를 캐시로 먼저
 * 거르고, 남은 것만 `TERMINAL_RESOLVE_PATH` 1회 invoke 로 묻는다. `preferLongestNonOverlappingLinks`
 * 는 Orca `terminal-link-handlers.ts` 의 동명 함수(정렬+그리디 선택 알고리즘)를 그대로 가져왔다
 * (Portions adapted from Orca, Copyright (c) 2026 Lovecast Inc., MIT License — 파일 나머지는
 * Clauday 고유의 배치 invoke 오케스트레이션이라 파일 전체를 이식으로 등재하지 않았다. 상세는
 * THIRD-PARTY-NOTICES.md 비고란 참조).
 */

import type { TerminalResolvePathRequest, TerminalResolvedPath } from '@shared/types/terminal'
import { getPathExistsCacheKey, readPathExistsCache, writePathExistsCache } from './pathExistsCache'
import type { CachedPathResolution } from './pathExistsCache'

export interface ResolveFileLinkCandidatesParams {
  /** 한 줄(논리 라인)에서 뽑은 후보 pathText 전체 — 중복은 호출자가 제거하지 않아도 된다. */
  candidates: string[]
  sessionId?: string
  /** OSC7 로 알아낸 cwd — 없으면 main 이 pid probe/spawn cwd 로 판단한다. */
  cwdHint?: string
  cache: Map<string, CachedPathResolution>
  resolvePath: (req: TerminalResolvePathRequest) => Promise<TerminalResolvedPath[]>
}

/** 캐시 버킷 키 — 실제 해석된 cwd 를 아직 모르므로 cwdHint(또는 sessionId)로 근사한다. */
function cacheBucketFor(sessionId: string | undefined, cwdHint: string | undefined): string {
  if (cwdHint) return cwdHint
  if (sessionId) return `session:${sessionId}`
  return 'unknown'
}

/**
 * 후보 배열의 존재 여부를 캐시 우선으로 확인하고, 캐시 미스만 모아 1회 배치 invoke 한다.
 * 결과는 캐시에 적재(음수 포함)한 뒤 `candidate → 해석 결과` 맵으로 반환한다.
 */
export async function resolveFileLinkCandidates(
  params: ResolveFileLinkCandidatesParams
): Promise<Map<string, CachedPathResolution>> {
  const { candidates, sessionId, cwdHint, cache, resolvePath } = params
  const bucket = cacheBucketFor(sessionId, cwdHint)
  const unique = Array.from(new Set(candidates))
  const result = new Map<string, CachedPathResolution>()
  const misses: string[] = []

  for (const candidate of unique) {
    const key = getPathExistsCacheKey(bucket, candidate)
    const cached = readPathExistsCache(cache, key)
    if (cached) result.set(candidate, cached)
    else misses.push(candidate)
  }

  if (misses.length === 0) return result

  let resolved: TerminalResolvedPath[]
  try {
    resolved = await resolvePath({ sessionId, cwdHint, candidates: misses })
  } catch (e) {
    console.warn('[terminal-link] resolvePath IPC 실패 — 이번 hover 는 링크 없음', e)
    return result
  }

  for (const entry of resolved) {
    const value: CachedPathResolution = { resolved: entry.resolved, kind: entry.kind }
    writePathExistsCache(cache, getPathExistsCacheKey(bucket, entry.candidate), value)
    result.set(entry.candidate, value)
  }
  return result
}

interface BufferSpan {
  range: { start: { x: number; y: number }; end: { x: number; y: number } }
  text: string
}

function bufferRangesOverlap(left: BufferSpan['range'], right: BufferSpan['range']): boolean {
  const leftStartsAfterRightEnds = left.start.y > right.end.y || (left.start.y === right.end.y && left.start.x > right.end.x)
  const rightStartsAfterLeftEnds = right.start.y > left.end.y || (right.start.y === left.end.y && right.start.x > left.end.x)
  return !leftStartsAfterRightEnds && !rightStartsAfterLeftEnds
}

/**
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/src/components/terminal-pane/terminal-link-handlers.ts — `preferLongestNonOverlappingLinks`
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 *
 * 겹치는 후보 중 텍스트가 가장 긴 것부터 채택하고, 이미 채택된 버퍼 범위(x/y)와 겹치면 버린다 —
 * 짧은 부분 문자열이 긴 경로를 가리는 것을 막는다(G15). hard-wrap/soft-wrap 후보는 서로 다른
 * 논리 라인(문자열 인덱스 공간이 다름)에서 나올 수 있어, 버퍼 좌표로 매핑된 뒤에 비교해야 한다.
 */
export function preferLongestNonOverlappingLinks<T extends BufferSpan>(candidates: T[]): T[] {
  const byLengthDescending = [...candidates].sort(
    (a, b) =>
      b.text.length - a.text.length ||
      a.range.start.y - b.range.start.y ||
      a.range.start.x - b.range.start.x
  )
  const selected: T[] = []
  for (const candidate of byLengthDescending) {
    if (!selected.some((s) => bufferRangesOverlap(s.range, candidate.range))) selected.push(candidate)
  }
  return selected.sort((a, b) => a.range.start.y - b.range.start.y || a.range.start.x - b.range.start.x)
}

/** 비동기 검증이 끝난 시점에 라인이 바뀌었는지 확인한다 — 다르면 stale, 결과를 폐기해야 한다. */
export function isFingerprintStale(expectedFingerprint: string, actualFingerprint: string): boolean {
  return expectedFingerprint !== actualFingerprint
}
