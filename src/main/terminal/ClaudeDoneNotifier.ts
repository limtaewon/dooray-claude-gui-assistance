import { BrowserWindow, Notification } from 'electron'
import { IPC_CHANNELS } from '../../shared/types/ipc'
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
  /** 출력이 이만큼 멎으면 끝난 것으로 본다 */
  idleSeconds: number
}

export const DEFAULT_CLAUDE_DONE_SETTINGS: ClaudeDoneSettings = {
  enabled: true,
  onlyWhenUnfocused: true,
  idleSeconds: 12
}

export interface ClaudeDoneNotifierDeps {
  /** 세션의 현재 포그라운드 프로그램 이름 */
  getForeground: (sessionId: string) => string | null
  /** 세션 표시 이름(탭 이름 등) — 알림 본문에 쓴다 */
  getLabel: (sessionId: string) => string
  getSettings: () => ClaudeDoneSettings
  getWindow: () => BrowserWindow | null
  now?: () => number
  /** 테스트에서 타이머를 직접 돌리기 위해 주입 */
  scheduler?: { setInterval: typeof setInterval; clearInterval: typeof clearInterval }
}

const TICK_MS = 2000

/**
 * 터미널에서 돌던 claude 가 내 차례를 넘겼을 때 OS 알림을 띄운다.
 *
 * 판정은 **출력이 멎었는지**로 한다(`claudeDone.ts`). 훅을 사용자의 저장소에 심지 않아도 되고,
 * 우리가 시작하지 않은 claude 에도 그대로 동작한다. 벨(BEL)이 오면 기다리지 않고 바로 알린다.
 */
export class ClaudeDoneNotifier {
  private states = new Map<string, ClaudeDoneState>()
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
    if (!this.timer) return
    this.scheduler.clearInterval(this.timer)
    this.timer = null
  }

  /** PTY 출력 — TerminalManager 가 그대로 흘려준다. */
  handleOutput(sessionId: string, data: string): void {
    const now = this.now()
    const prev = this.states.get(sessionId) ?? newDoneState(now)
    const next = onOutput(prev, now)
    this.states.set(sessionId, next)

    // 벨은 claude 가 "끝났다" 고 직접 보내는 신호다 — idle 을 기다릴 이유가 없다.
    if (containsBell(data) && isClaudeProcess(this.deps.getForeground(sessionId))) {
      this.states.set(sessionId, { ...next, notified: true })
      this.notify(sessionId)
    }
  }

  forget(sessionId: string): void {
    this.states.delete(sessionId)
  }

  private tick(): void {
    const settings = this.deps.getSettings()
    if (!settings.enabled) return
    const now = this.now()
    const options = { idleMs: Math.max(3, settings.idleSeconds) * 1000 }

    for (const [sessionId, state] of this.states) {
      if (!shouldNotifyIdle(state, this.deps.getForeground(sessionId), now, options)) continue
      this.states.set(sessionId, { ...state, notified: true })
      this.notify(sessionId)
    }
  }

  private notify(sessionId: string): void {
    const settings = this.deps.getSettings()
    if (!settings.enabled) return

    const win = this.deps.getWindow()
    // 보고 있는 창에 알림을 띄우면 방해만 된다. 대신 렌더러에는 항상 알려서 탭 배지를 띄운다.
    win?.webContents.send(IPC_CHANNELS.TERMINAL_CLAUDE_DONE, { sessionId })
    if (settings.onlyWhenUnfocused && win && !win.isDestroyed() && win.isFocused()) return

    try {
      const notification = new Notification({
        title: 'claude 작업 완료',
        body: `${this.deps.getLabel(sessionId)} — 확인이 필요합니다`,
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
