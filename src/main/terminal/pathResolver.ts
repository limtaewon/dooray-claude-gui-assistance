import { promises as fs } from 'fs'
import { resolve } from 'path'
import { expandHome } from '../utils/paths'
import type { TerminalResolvedPath } from '../../shared/types/terminal'

const STAT_TIMEOUT_MS = 300

interface StatKind {
  isFile: boolean
  isDirectory: boolean
}

/** 정지한 네트워크 마운트 방어 — 300ms 안에 stat 이 안 끝나면 미존재로 취급한다. */
async function statWithTimeout(path: string): Promise<StatKind | null> {
  return Promise.race([
    fs.stat(path).then(
      (s): StatKind => ({ isFile: s.isFile(), isDirectory: s.isDirectory() }),
      () => null
    ),
    new Promise<null>((resolvePromise) => {
      setTimeout(() => resolvePromise(null), STAT_TIMEOUT_MS)
    })
  ])
}

/**
 * 링크 후보 배치의 존재를 검증한다 — `~` 확장 → `cwd` 기준 절대경로 변환 → stat.
 * 응답은 요청과 같은 순서로 반환한다 (ADR-v2-terminal-p2-05 §레이어 5).
 */
export async function resolveCandidates(params: {
  cwd: string
  candidates: string[]
}): Promise<TerminalResolvedPath[]> {
  const { cwd, candidates } = params
  return Promise.all(
    candidates.map(async (candidate): Promise<TerminalResolvedPath> => {
      const expanded = expandHome(candidate)
      const absolute = resolve(cwd, expanded)
      const stat = await statWithTimeout(absolute)
      const kind: TerminalResolvedPath['kind'] = !stat ? null : stat.isDirectory ? 'directory' : stat.isFile ? 'file' : null
      return { candidate, resolved: absolute, kind }
    })
  )
}
