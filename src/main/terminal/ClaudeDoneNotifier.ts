import { BrowserWindow, Notification } from 'electron'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import { createAgentStatusTracker, type AgentStatusTracker } from '../../shared/terminal/agentTitle'
import { scanOscTitles } from '../../shared/terminal/oscTitle'
import {
  containsBell,
  isClaudeProcess,
  newDoneState,
  onOutput,
  shouldNotifyIdle,
  type ClaudeDoneState
} from '../../shared/terminal/claudeDone'

export interface ClaudeDoneSettings {
  /** 알림을 켤지 */
  enabled: boolean
  /** 앱 창이 포커스돼 있을 땐 알리지 않는다 (보고 있는데 알림이 뜨면 성가시다) */
  onlyWhenUnfocused: boolean
  /** 타이틀 신호가 없는 세션에서만 쓰는 폴백 — 출력이 이만큼 멎으면 끝난 것으로 본다 */
  idleSeconds: number
  /** 폴백(무출력 판정) 자체를 쓸지 */
  idleFallback: boolean
}

export const DEFAULT_CLAUDE_DONE_SETTINGS: ClaudeDoneSettings = {
  enabled: true,
  onlyWhenUnfocused: true,
  idleSeconds: 20,
  idleFallback: true
}

export interface ClaudeDoneNotifierDeps {
  getForeground: (sessionId: string) => string | null
  /** 세션 표시 이름(탭 이름 등) — 알림 제목에 쓴다 */
  getLabel: (sessionId: string) => string
  getSettings: () => ClaudeDoneSettings
  getWindow: () => BrowserWindow | null
  now?: () => number
  scheduler?: { setInterval: typeof setInterval; clearInterval: typeof clearInterval }
}

const TICK_MS = 2000
/** 같은 세션에 이 시간 안에는 다시 알리지 않는다 — 타이틀과 벨이 한 덩어리로 오기 때문(Orca 와 동일한 이유). */
const DEDUPE_MS = 5000
/** 벨은 곧 올 타이틀 전이에 자리를 내준다 — 내용이 있는 쪽이 이기게. */
const BELL_GRACE_MS = 250

interface SessionState {
  idle: ClaudeDoneState
  tracker: AgentStatusTracker
  /** OSC 파싱용 미완성 조각 */
  carry: string
  lastNotifiedAt: number
  bellTimer: ReturnType<typeof setTimeout> | null
  /** 알림 본문에 쓸 마지막 의미 있는 출력 */
  lastLine: string
}

/**
 * 터미널에서 돌던 claude 가 내 차례를 넘겼을 때 OS 알림을 띄운다.
 *
 * 신호는 세 가지이고 우선순위가 있다.
 *   1. **타이틀 working→idle 전이** — 에이전트가 직접 알려주는 신호라 가장 정확하다.
 *   2. **벨(BEL)** — 타이틀이 곧 올 수 있으니 250ms 기다렸다 쏜다.
 *   3. **무출력 폴백** — 타이틀 신호를 한 번도 못 본 세션에서만. 도구가 오래 도는 중의 정적을
 *      완료로 오해할 수 있어서, 타이틀을 주는 에이전트에는 쓰지 않는다.
 */
export class ClaudeDoneNotifier {
  private sessions = new Map<string, SessionState>()
  private timer: ReturnType<typeof setInterval> | null = null
  private now: () => number
  private scheduler: NonNullable<ClaudeDoneNotifierDeps['scheduler']>

  constructor(private deps: ClaudeDoneNotifierDeps) {
    this.now = deps.now ?? (() => Date.now())
    this.scheduler = deps.scheduler ?? { setInterval, clearInterval }
  }

  start(): void {
    if (this.timer) return
    this.timer = this.scheduler.setInterval(() => this.tick(), TICK_MS)
  }

  stop(): void {
    if (this.timer) {
      this.scheduler.clearInterval(this.timer)
      this.timer = null
    }
    for (const state of this.sessions.values()) {
      if (state.bellTimer) clearTimeout(state.bellTimer)
    }
  }

  /** PTY 출력 — TerminalManager 가 그대로 흘려준다. */
  handleOutput(sessionId: string, data: string): void {
    const state = this.stateFor(sessionId)
    const now = this.now()
    state.idle = onOutput(state.idle, now)

    const line = lastMeaningfulLine(data)
    if (line) state.lastLine = line

    const scan = scanOscTitles(data, state.carry)
    state.carry = scan.carry
    for (const title of scan.titles) state.tracker.handleTitle(title)

    if (containsBell(data)) this.scheduleBell(sessionId)
  }

  forget(sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (state?.bellTimer) clearTimeout(state.bellTimer)
    this.sessions.delete(sessionId)
  }

  private stateFor(sessionId: string): SessionState {
    const existing = this.sessions.get(sessionId)
    if (existing) return existing

    const state: SessionState = {
      idle: newDoneState(this.now()),
      // 타이틀 전이는 그 자리에서 확정 신호다 — 유예 없이 바로 알린다.
      tracker: createAgentStatusTracker({ onIdle: () => this.notify(sessionId, 'title') }),
      carry: '',
      lastNotifiedAt: 0,
      bellTimer: null,
      lastLine: ''
    }
    this.sessions.set(sessionId, state)
    return state
  }

  private scheduleBell(sessionId: string): void {
    const state = this.stateFor(sessionId)
    if (state.bellTimer) return
    state.bellTimer = setTimeout(() => {
      state.bellTimer = null
      // 그 사이 타이틀 전이가 알렸으면 dedupe 가 막는다.
      if (isClaudeProcess(this.deps.getForeground(sessionId))) this.notify(sessionId, 'bell')
    }, BELL_GRACE_MS)
  }

  private tick(): void {
    const settings = this.deps.getSettings()
    if (!settings.enabled || !settings.idleFallback) return
    const now = this.now()
    const options = { idleMs: Math.max(3, settings.idleSeconds) * 1000 }

    for (const [sessionId, state] of this.sessions) {
      // 타이틀을 주는 에이전트에는 폴백을 쓰지 않는다 — 오탐의 근원이다.
      if (state.tracker.hasEvidence()) continue
      if (!shouldNotifyIdle(state.idle, this.deps.getForeground(sessionId), now, options)) continue
      state.idle = { ...state.idle, notified: true }
      this.notify(sessionId, 'idle')
    }
  }

  private notify(sessionId: string, source: 'title' | 'bell' | 'idle'): void {
    const settings = this.deps.getSettings()
    if (!settings.enabled) return

    const state = this.stateFor(sessionId)
    const now = this.now()
    // 타이틀·벨이 같은 순간에 오는 것이 정상이라 세션 단위로 한 번만 통과시킨다.
    if (now - state.lastNotifiedAt < DEDUPE_MS) return
    state.lastNotifiedAt = now

    const win = this.deps.getWindow()
    // 보고 있는 창에 알림을 띄우면 방해만 된다. 렌더러에는 항상 알려서 탭 표시는 남긴다.
    win?.webContents.send(IPC_CHANNELS.TERMINAL_CLAUDE_DONE, { sessionId, source })
    if (settings.onlyWhenUnfocused && win && !win.isDestroyed() && win.isFocused()) return

    try {
      const notification = new Notification({
        title: `${this.deps.getLabel(sessionId)} — claude 작업 완료`,
        body: state.lastLine || '확인이 필요합니다',
        silent: false
      })
      notification.on('click', () => {
        const target = this.deps.getWindow()
        if (!target || target.isDestroyed()) return
        if (target.isMinimized()) target.restore()
        target.show()
        target.focus()
        target.webContents.send(IPC_CHANNELS.TERMINAL_FOCUS_SESSION, { sessionId })
      })
      notification.show()
    } catch (err) {
      console.warn('[ClaudeDone] OS 알림 실패:', err)
    }
  }
}

// eslint-disable-next-line no-control-regex -- ANSI 이스케이프를 지우는 목적
const ANSI_RE = /\u001b\[[0-9;?]*[a-zA-Z]|\u001b\][\s\S]*?(?:\u0007|\u001b\\)|[\u0000-\u0008\u000b-\u001f]/g

/** 알림 본문에 쓸 마지막 한 줄 — TUI 장식(테두리·스피너)만 있는 줄은 건너뛴다. */
export function lastMeaningfulLine(data: string): string {
  const lines = data.replace(ANSI_RE, '').split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].replace(/[\u2500-\u257f\u2800-\u28ff]/g, '').trim()
    if (line.length >= 2) return line.slice(0, 140)
  }
  return ''
}
