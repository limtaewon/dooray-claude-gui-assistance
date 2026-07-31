/**
 * 터미널 탭 자동 이름 (Warp 식). 셸이 OSC 0/2 로 보내는 창 제목을 다듬어 탭 라벨로 쓴다.
 * 사용자가 직접 이름을 바꾼 탭은 호출부가 갱신하지 않는다.
 */

/** 제목에서 걷어낼 잡음 — 셸이 붙이는 사용자@호스트, 경로 접두 등 */
const USER_AT_HOST = /^[\w.-]+@[\w.-]+\s*[:—-]\s*/
const TRAILING_DASH_TAIL = /\s*[—-]\s*(zsh|bash|fish|sh|pwsh|powershell|cmd)\s*$/i

/** 라벨이 너무 길면 앞부분만 남긴다 — 탭바가 밀리지 않게 */
const MAX_LABEL = 28

/** 홈 경로를 `~` 로 접고 마지막 세그먼트만 남긴다. */
function basenameOf(path: string): string {
  const cleaned = path.replace(/[/\\]+$/, '')
  const seg = cleaned.split(/[/\\]/).pop() || cleaned
  return seg || '~'
}

/**
 * OSC 제목 → 탭 라벨. 셸/프로그램마다 형식이 달라 다음 순서로 정리한다:
 * `user@host: /path` → 경로의 마지막 세그먼트, 순수 경로 → 마지막 세그먼트, 그 외 → 원문(트림).
 * 의미 없는 값(빈 문자열, 셸 이름만)은 null 을 반환해 호출부가 기존 이름을 유지하게 한다.
 */
export function tabNameFromTitle(raw: string): string | null {
  let title = (raw || '').trim()
  if (!title) return null

  title = title.replace(USER_AT_HOST, '').replace(TRAILING_DASH_TAIL, '').trim()
  if (!title) return null

  // 순수 경로면 마지막 세그먼트만
  if (/^[~/]/.test(title) || /^[A-Za-z]:[\\/]/.test(title)) title = basenameOf(title)

  // 셸 이름만 온 경우는 정보가 없다 — 기존 이름 유지
  if (/^(zsh|bash|fish|sh|pwsh|powershell|cmd|login)$/i.test(title)) return null

  return title.length > MAX_LABEL ? `${title.slice(0, MAX_LABEL - 1)}…` : title
}

/** cwd 로부터 만드는 기본 라벨 — 제목을 못 받았을 때 쓴다. */
export function tabNameFromCwd(cwd?: string): string {
  return cwd ? basenameOf(cwd) : '~'
}
