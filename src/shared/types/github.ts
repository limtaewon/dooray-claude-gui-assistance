/** GitHub 연동 — 토큰은 OS 키체인에만 두고 렌더러로는 계정 정보만 오간다. */
export interface GitHubAccount {
  login: string
  name: string | null
  avatarUrl: string | null
  profileUrl: string
}

/** 어디서 온 자격증명인가 — `gh` 는 GitHub CLI 로그인, `token` 은 앱에 직접 넣은 PAT. */
export type GitHubAuthSource = 'gh' | 'token'

export interface GitHubStatus {
  connected: boolean
  account?: GitHubAccount
  source?: GitHubAuthSource
  /** 실패 사유 (토큰 만료·권한 부족 등) */
  error?: string
  /** 저장된 토큰은 있는데 거절당한 경우 — 다시 넣으라고 안내한다 */
  hasStoredToken?: boolean
  /** `gh` 가 설치돼 있는지 — 안내 문구를 가른다 */
  ghAvailable?: boolean
}
