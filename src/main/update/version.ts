import type { GithubRelease } from '../../shared/types/update'

/** 파싱된 semver. prerelease 는 있으면 문자열로 보관한다. */
interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string | null
}

/**
 * 'v2.0.4' / '2.0.4' / '2.1.0-beta.1' 을 파싱한다. 형식이 아니면 null.
 * 릴리즈 태그와 package.json 버전 양쪽에 같은 파서를 쓴다.
 */
export function parseVersion(raw: string): ParsedVersion | null {
  const match = raw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null
  }
}

/**
 * a 가 b 보다 크면 양수, 작으면 음수, 같으면 0.
 * prerelease 가 붙은 쪽이 정식 릴리즈보다 낮다 (2.1.0-beta.1 < 2.1.0).
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return 0

  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  if (left.patch !== right.patch) return left.patch - right.patch

  if (left.prerelease === right.prerelease) return 0
  // 정식 릴리즈가 prerelease 보다 높다
  if (left.prerelease === null) return 1
  if (right.prerelease === null) return -1
  return left.prerelease < right.prerelease ? -1 : 1
}

/** latest 가 current 보다 높은 정식 버전인지. 파싱 실패하면 false(=업데이트 없음)로 본다. */
export function isNewerVersion(latest: string, current: string): boolean {
  if (!parseVersion(latest) || !parseVersion(current)) return false
  return compareVersions(latest, current) > 0
}

/**
 * 릴리즈 목록에서 설치 가능한 최신 정식 릴리즈를 고른다.
 * draft·prerelease 는 건너뛴다 — 사용자에게 베타를 밀어 넣지 않는다.
 */
export function pickLatestStable(releases: readonly GithubRelease[]): GithubRelease | null {
  let best: GithubRelease | null = null
  for (const release of releases) {
    if (release.draft || release.prerelease) continue
    if (!parseVersion(release.tag_name)) continue
    if (!best || compareVersions(release.tag_name, best.tag_name) > 0) best = release
  }
  return best
}

/**
 * 릴리즈에서 이 플랫폼이 받을 파일을 고른다.
 * macOS 는 dmg, Windows 는 exe. arm64/x64 구분은 파일명에 아키텍처가 있으면 맞춰 고른다.
 */
export function pickAssetForPlatform(
  release: GithubRelease,
  platform: NodeJS.Platform,
  arch: string
): { name: string; url: string } | null {
  const wanted = platform === 'darwin' ? '.dmg' : platform === 'win32' ? '.exe' : null
  if (!wanted) return null

  const candidates = release.assets.filter((a) => a.name.toLowerCase().endsWith(wanted))
  if (candidates.length === 0) return null

  // 아키텍처가 파일명에 박힌 빌드가 있으면 그쪽을 먼저 고른다
  const archTag = arch === 'arm64' ? 'arm64' : 'x64'
  const archMatch = candidates.find((a) => a.name.toLowerCase().includes(archTag))
  const chosen = archMatch ?? candidates[0]
  return { name: chosen.name, url: chosen.browser_download_url }
}
