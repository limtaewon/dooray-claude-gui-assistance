/** Claude Code 가 세션 기록을 지우기까지의 기본 일수 — settings.json 에 값이 없을 때 적용된다. */
export const DEFAULT_CLEANUP_PERIOD_DAYS = 30

/** 설정으로 넣을 수 있는 보관 기간 범위. 0 일은 즉시 삭제라 허용하지 않는다. */
export const MIN_CLEANUP_PERIOD_DAYS = 1
export const MAX_CLEANUP_PERIOD_DAYS = 3650

/** 화면에서 바로 고를 수 있는 값 — 직접 입력도 함께 제공한다. */
export const CLEANUP_PERIOD_PRESETS = [30, 90, 180, 365] as const

/**
 * 보관 기간 설정의 현재 상태.
 *
 * `source` 가 'unreadable' 이면 settings.json 을 파싱하지 못한 것이다 — 이때 덮어쓰면 사용자의
 * 다른 설정(hooks·permissions 등)이 통째로 날아가므로 저장을 막아야 한다.
 */
export interface ClaudeRetentionState {
  /** 실제 적용 중인 보관 일수 */
  days: number
  source: 'settings' | 'default' | 'unreadable'
  /** 설정 파일 절대 경로 — 화면에서 어디를 고치는지 알린다 */
  settingsPath: string
  /** source 가 'unreadable' 일 때의 사유 */
  error?: string
}
