/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/src/components/terminal-pane/terminal-path-exists-cache.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: Orca 원본은 SSH/원격 런타임 연결별로 캐시 키를 분기한다(`connectionId`/`runtimeEnvironmentId`).
 * Clauday 는 로컬 PTY 만 다루므로 그 분기를 걷어내고 ADR-v2-terminal-p2-05 §레이어 5 가 명시한
 * `cwd + '\0' + candidate` 단일 키로 단순화했다. LRU 축출(재삽입으로 순서 갱신) 로직은 원본과 동일.
 */

import type { TerminalResolvedPath } from '@shared/types/terminal'

/** 렌더러 링크 존재 검증 캐시 상한 — hover 마다 IPC 가 폭주하지 않게 한다 (함정 #6). */
export const TERMINAL_PATH_EXISTS_CACHE_MAX_ENTRIES = 1024

export type CachedPathResolution = Pick<TerminalResolvedPath, 'resolved' | 'kind'>

export function getPathExistsCacheKey(cwd: string, candidate: string): string {
  return `${cwd}\0${candidate}`
}

/** 읽으면서 최근 사용으로 갱신한다(LRU) — Map 의 삽입 순서를 재사용하는 표준 기법. */
export function readPathExistsCache(
  cache: Map<string, CachedPathResolution>,
  key: string
): CachedPathResolution | undefined {
  const value = cache.get(key)
  if (value !== undefined) {
    cache.delete(key)
    cache.set(key, value)
  }
  return value
}

/** 음수(미존재) 결과도 캐시한다 — 그래야 존재하지 않는 경로가 hover 마다 다시 IPC 를 타지 않는다. */
export function writePathExistsCache(
  cache: Map<string, CachedPathResolution>,
  key: string,
  value: CachedPathResolution
): void {
  if (cache.has(key)) {
    cache.delete(key)
  } else {
    while (cache.size >= TERMINAL_PATH_EXISTS_CACHE_MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value
      if (oldestKey === undefined) break
      cache.delete(oldestKey)
    }
  }
  cache.set(key, value)
}
