/** @clauday 대기 상태 — 설정 화면의 "깨어 있기" 영역에 쓴다 (기획 §5.8). */
/** @clauday 권한 — approval: 물어야 할 동작은 두레이 답장으로 승인 / bypass: 권한 확인 없이 실행(예전 동작) */
export type MentionPermissionMode = 'approval' | 'bypass'

export interface BotAgentStatus {
  permissionMode: MentionPermissionMode
  /** 깨어 있기 설정 (기본 켬) */
  keepAwake: boolean
  /** 지금 잠자기를 막고 있는지 — 봇 연결 + 전원 연결 중일 때만 */
  awakeHolding: boolean
  onAC: boolean
  /** 최근 24시간 동안 소켓이 끊긴 횟수 */
  disconnects24h: number
  /** 마지막 놓친 멘션 찾기 결과 */
  lastCatchUp: { at: number; found: number; ran: number; skippedStale: number } | null
}
