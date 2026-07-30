import { homedir } from 'os'
import { win32, posix, delimiter as pathDelimiter } from 'path'
import { normalizePathForCompare } from './paths'

export type PathMergeOptions = {
  /** 기본 'append' — decisions-log 의 확립된 정책(사용자 신버전을 우리 폴백이 가리지 않도록) */
  position?: 'append' | 'prepend'
  delimiter?: string
  platform?: NodeJS.Platform
}

const DEFAULT_PATH_WIN = ''
const DEFAULT_PATH_OTHER = '/usr/bin:/bin'

/** claude CLI 와 그 자식 프로세스가 필요로 하는 PATH 후보를 플랫폼별로 돌려준다. 4곳 복제본의 합집합(근거: ADR-v2-utils-03). */
export function claudeExtraPaths(opts?: { home?: string; platform?: NodeJS.Platform }): string[] {
  const home = opts?.home ?? homedir()
  const platform = opts?.platform ?? process.platform

  // path.join 은 실행 중인 OS 의 구분자를 쓰므로, 주입된 platform 과 다른 OS 에서 테스트할 때
  // 구분자가 어긋난다. win32/posix 구현을 명시적으로 골라 platform 주입을 실질적으로 만든다.
  const join = platform === 'win32' ? win32.join : posix.join

  if (platform === 'win32') {
    return [
      join(home, '.claude', 'local'),
      join(home, '.claude', 'bin'),
      join(home, 'AppData', 'Roaming', 'npm'),
      join(home, 'AppData', 'Local', 'npm')
    ]
  }
  return [
    join(home, '.claude', 'local'),
    join(home, '.claude', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    join(home, '.local', 'bin'),
    join(home, '.npm-global', 'bin'),
    join(home, '.nvm', 'versions', 'node', 'current', 'bin')
  ]
}

/**
 * base 환경변수의 PATH 키를 대소문자 무시로 찾아 그 키만 갱신한 새 객체를 돌려준다.
 * Windows 의 `Path`/`PATH` 키 중복(둘 중 하나만 자식에 유효 적용되는 문제)을 구조적으로 차단한다 (근거: ADR-v2-utils-03).
 */
export function mergePathIntoEnv(
  base: NodeJS.ProcessEnv,
  extraPaths: readonly string[],
  opts?: PathMergeOptions
): NodeJS.ProcessEnv {
  const platform = opts?.platform ?? process.platform
  const delimiter = opts?.delimiter ?? pathDelimiter
  const position = opts?.position ?? 'append'
  const isWindows = platform === 'win32'

  const result: NodeJS.ProcessEnv = { ...base }

  const pathKeys = Object.keys(base).filter((k) => k.toUpperCase() === 'PATH')
  if (pathKeys.length > 1) {
    console.warn(`[env] PATH 키 중복 발견 (${pathKeys.join(', ')}) — 첫 번째만 갱신`)
  }
  const existingKey = pathKeys[0]
  const key = existingKey ?? (isWindows ? 'Path' : 'PATH')
  const currentValue = existingKey ? base[existingKey] : undefined
  const baseValue = currentValue ?? (isWindows ? DEFAULT_PATH_WIN : DEFAULT_PATH_OTHER)

  const existingSegments = baseValue.split(delimiter).filter((s) => s.length > 0)
  const seen = new Set(existingSegments.map((s) => normalizePathForCompare(s, platform)))
  const toAdd = extraPaths.filter((p) => p.length > 0).filter((p) => {
    const norm = normalizePathForCompare(p, platform)
    if (seen.has(norm)) return false
    seen.add(norm)
    return true
  })

  const merged = position === 'prepend' ? [...toAdd, ...existingSegments] : [...existingSegments, ...toAdd]
  result[key] = merged.join(delimiter)
  return result
}
