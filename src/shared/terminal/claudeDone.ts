/**
 * "터미널의 claude 가 내 차례를 넘겼다" 판정.
 *
 * claude 는 일을 하는 동안 TUI 를 계속 다시 그린다(진행 표시·토큰 카운터). 그래서 **출력이 멎는
 * 것**이 곧 "끝났거나 내 입력을 기다린다" 는 신호다. 둘을 굳이 가르지 않는다 — 사용자 입장에서
 * 둘 다 "돌아가서 봐야 하는 순간" 이고, 그게 이 알림의 목적이다.
 *
 * 벨(BEL, `\x07`)은 claude 알림 설정이 terminal bell 일 때 오는 즉시 신호라 따로 받는다.
 */
export interface ClaudeDoneState {
  /** 마지막으로 PTY 출력이 있었던 시각 */
  lastOutputAt: number
  /** 이번 차례에 의미 있는 출력이 있었는지 — 아무것도 안 하고 떠 있는 세션은 알리지 않는다 */
  sawOutput: boolean
  /** 이번 차례에 이미 알렸는지 */
  notified: boolean
}

export interface ClaudeDoneOptions {
  /** 출력이 이만큼 멎으면 끝난 것으로 본다 */
  idleMs: number
}

export function newDoneState(now: number): ClaudeDoneState {
  return { lastOutputAt: now, sawOutput: false, notified: false }
}

/** 출력이 오면 상태 갱신 — 다시 움직였으니 다음 차례를 또 알릴 수 있다. */
export function onOutput(state: ClaudeDoneState, now: number): ClaudeDoneState {
  return { lastOutputAt: now, sawOutput: true, notified: false }
}

/**
 * 지금 알려야 하는지.
 *
 * 조건: claude 가 떠 있고, 이번 차례에 출력이 있었고, 그 뒤로 `idleMs` 만큼 조용하고, 아직 안 알렸을 때.
 */
export function shouldNotifyIdle(
  state: ClaudeDoneState,
  foreground: string | null | undefined,
  now: number,
  options: ClaudeDoneOptions
): boolean {
  if (!isClaudeProcess(foreground)) return false
  if (!state.sawOutput || state.notified) return false
  return now - state.lastOutputAt >= options.idleMs
}

/** 지금 그 pane 에서 도는 게 claude 인지. 이름은 플랫폼마다 경로가 붙어 오기도 한다. */
export function isClaudeProcess(foreground: string | null | undefined): boolean {
  if (!foreground) return false
  const name = foreground.trim().toLowerCase().split(/[\\/]/).pop() ?? ''
  return name === 'claude' || name === 'claude.exe' || name.startsWith('claude ')
}

/** 출력에 벨이 섞여 있는지 — claude 가 terminal bell 로 알림을 보내는 경우. */
export function containsBell(data: string): boolean {
  return data.includes('\u0007')
}
