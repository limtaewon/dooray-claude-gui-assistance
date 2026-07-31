/**
 * GitHub 연동 — 앱이 토큰을 받지 않는다. `gh` CLI 의 로그인을 그대로 본다.
 *
 * 이미 CLI 로 로그인한 사람에게 PAT 를 또 만들라고 하는 건 같은 일을 두 번 시키는 것이고,
 * 앱이 토큰을 따로 보관하면 관리 대상이 하나 더 생긴다.
 */
export interface GitHubAccount {
  /** github.com 또는 GHES 호스트 */
  host: string
  login: string
  /** 토큰 스코프 — 부족하면 무엇을 못 하는지 알려준다 */
  scopes: string[]
  /** 여러 계정이 로그인돼 있을 때 지금 활성인 것 */
  active: boolean
  /**
   * `GITHUB_TOKEN`/`GH_TOKEN` 환경변수가 키체인 로그인을 가리고 있으면 그 이름.
   * 이 상태에서는 `gh auth refresh` 가 조용히 무시되므로 사용자에게 알려야 한다.
   */
  envToken: string | null
}

export type GitHubCliState = 'not-installed' | 'not-authenticated' | 'connected'

export interface GitHubStatus {
  state: GitHubCliState
  accounts: GitHubAccount[]
  /** `gh --version` 첫 줄 */
  version?: string
  /** 확인 자체가 실패한 경우 */
  error?: string
}
