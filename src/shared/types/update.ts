/**
 * 앱 업데이트 상태. Windows 와 macOS 가 서로 다른 경로를 타지만 렌더러는 이 한 가지 모양만 본다.
 *
 * - Windows: electron-updater 가 배경으로 받아서 재시작 때 설치까지 한다 (downloaded → 설치 가능)
 * - macOS: 앱이 dmg 를 직접 받아 Finder 에서 열어준다 (downloaded → 사용자가 드래그)
 *   ad-hoc 서명(`identity: "-"`)이라 Squirrel.Mac 의 자동 설치는 서명 검증에서 막힌다.
 */
export type UpdateStage =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  stage: UpdateStage
  /** 현재 실행 중인 앱 버전 (예: '2.0.4') */
  currentVersion: string
  /** 받을 수 있는 최신 버전. 없으면 null */
  latestVersion: string | null
  /** 릴리즈 노트 페이지 URL. 「자세히 보기」가 여는 곳 */
  releaseUrl: string | null
  /** 0~100. stage 가 'downloading' 일 때만 의미가 있다 */
  progressPercent: number
  /** stage 가 'error' 일 때 사용자에게 보여줄 한 줄 */
  message: string | null
  /**
   * 재시작만으로 설치가 끝나는지. Windows 는 true, macOS 는 false(dmg 를 열어 직접 옮겨야 함).
   * 버튼 문구를 「재시작하고 설치」/「받기」로 가르는 기준.
   */
  canInstallInPlace: boolean
}

/** GitHub Releases API 응답 중 우리가 쓰는 부분만 */
export interface GithubRelease {
  tag_name: string
  html_url: string
  prerelease: boolean
  draft: boolean
  assets: Array<{ name: string; browser_download_url: string; size: number }>
}
