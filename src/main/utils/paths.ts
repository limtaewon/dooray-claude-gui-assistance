import { homedir } from 'os'

/**
 * `~`, `~/...`, `~\...`(win32) 를 홈 디렉터리로 확장한다.
 * `~user` 형태는 우리가 해석할 수 없는 다른 사용자의 홈이므로 확장하지 않고 원본을 그대로 돌려준다.
 */
export function expandHome(p: string, opts?: { home?: string; platform?: NodeJS.Platform }): string {
  if (!p) return p
  const home = opts?.home ?? homedir()
  const platform = opts?.platform ?? process.platform

  if (p === '~') return home
  if (p.startsWith('~/')) return home + p.slice(1)
  if (platform === 'win32' && p.startsWith('~\\')) return home + p.slice(1)
  return p
}

const WIN_DRIVE_ROOT_RE = /^[a-zA-Z]:\/$/

/** 경로 비교용으로 정규화한다 — 구분자 통일, 연속 구분자 축약, win32 대소문자 무시. UNC 선행 `//` 는 보존. */
export function normalizePathForCompare(p: string, platform: NodeJS.Platform = process.platform): string {
  let s = p.replace(/\\/g, '/')
  const isUnc = s.startsWith('//')
  s = s.replace(/\/{2,}/g, '/')
  if (isUnc) s = '/' + s

  if (s.length > 1 && s.endsWith('/') && !WIN_DRIVE_ROOT_RE.test(s)) {
    s = s.slice(0, -1)
  }
  if (platform === 'win32') s = s.toLowerCase()
  return s
}

/** 두 경로가 같은 위치를 가리키는지 비교한다. win32 는 구분자·대소문자·후행 구분자를 무시. */
export function samePath(a: string, b: string, opts?: { platform?: NodeJS.Platform }): boolean {
  const platform = opts?.platform ?? process.platform
  return normalizePathForCompare(a, platform) === normalizePathForCompare(b, platform)
}

/**
 * `child` 가 `parent` 와 같거나 그 하위 경로인지 판정한다. 경로 세그먼트 기준이라
 * 형제 경로(`/a/b-foo` 는 `/a/b` 의 하위가 아님)를 오판하지 않는다.
 */
export function isPathInside(parent: string, child: string, opts?: { platform?: NodeJS.Platform }): boolean {
  const platform = opts?.platform ?? process.platform
  const p = normalizePathForCompare(parent, platform)
  const c = normalizePathForCompare(child, platform)
  if (c === p) return true
  const parentWithSep = p.endsWith('/') ? p : `${p}/`
  return c.startsWith(parentWithSep)
}
