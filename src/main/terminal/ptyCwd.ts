import { execFile } from 'child_process'
import { readlink } from 'fs/promises'

const TTL_MS = 3000

/** 문제가 생기면 이 한 줄로 즉시 끌 수 있는 킬 스위치 (ADR-v2-terminal-p2-05 §pid cwd probe). */
const PTY_CWD_PROBE_ENABLED = true

interface CacheEntry {
  value: string | null
  expiresAt: number
}

const cache = new Map<number, CacheEntry>()
const inFlight = new Map<number, Promise<string | null>>()

function probeDarwin(pid: number): Promise<string | null> {
  return new Promise((resolvePromise) => {
    execFile('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'], (error, stdout) => {
      if (error) {
        console.warn('[ptyCwd] lsof 실패', { pid, error: error.message })
        resolvePromise(null)
        return
      }
      const line = stdout.split('\n').find((l) => l.startsWith('n'))
      resolvePromise(line ? line.slice(1) : null)
    })
  })
}

async function probeLinux(pid: number): Promise<string | null> {
  try {
    return await readlink(`/proc/${pid}/cwd`)
  } catch (error) {
    console.warn('[ptyCwd] /proc/<pid>/cwd 읽기 실패', { pid, error })
    return null
  }
}

/**
 * PTY 프로세스의 현재 cwd 를 조회한다 (darwin: lsof, linux: /proc, win32: 미지원 → null).
 * TTL 3초 캐시 + 같은 pid 동시 요청 단일 비행. 실패는 조용히 null (링크 cwd 후보 중 하나일 뿐이라
 * 실패가 기능을 막지 않아야 한다) — ADR-v2-terminal-p2-05.
 */
export async function probePtyCwd(
  pid: number,
  opts?: { platform?: NodeJS.Platform; now?: () => number }
): Promise<string | null> {
  if (!PTY_CWD_PROBE_ENABLED) return null

  const platform = opts?.platform ?? process.platform
  const now = opts?.now ?? Date.now
  if (platform === 'win32') return null

  const cached = cache.get(pid)
  if (cached && cached.expiresAt > now()) return cached.value

  const existingFlight = inFlight.get(pid)
  if (existingFlight) return existingFlight

  const flight = (platform === 'darwin' ? probeDarwin(pid) : probeLinux(pid)).then((value) => {
    cache.set(pid, { value, expiresAt: now() + TTL_MS })
    inFlight.delete(pid)
    return value
  })

  inFlight.set(pid, flight)
  return flight
}

/** 테스트 전용 — TTL 캐시/단일비행 상태를 초기화한다. */
export function __resetPtyCwdCacheForTest(): void {
  cache.clear()
  inFlight.clear()
}
