import type { BrowserWindow } from 'electron'
import type { TerminalManager } from '../../terminal/TerminalManager'
import type { TerminalSession } from '../../../shared/types/terminal'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import type { ChannelSessionStore } from './ChannelSessionStore'

export interface SpawnRequest {
  channelId: string
  channelName: string
  /** claude code의 cwd. 채널 폴더 (~/Clauday-Workspaces/agent/{channelId}/) */
  channelDir: string
  /** 채널 폴더 기준 상대 경로 (예: tasks/{logId}.md) */
  promptRelPath: string
  /** 멘션 텍스트에서 @clauday를 제거한 사용자의 실제 요청 */
  userRequest: string
}

const CLAUDE_BOOT_DELAY_MS = 1500
const CLAUDE_READY_DELAY_MS = 3000
/** 기존 탭에 추가 입력하기 전 잠깐 대기 (입력창 포커스/렌더 안정화 여유) */
const REUSE_DELAY_MS = 250
/** busy 자동 해제 시간 — 30분 안에 끝난다고 가정 */
const BUSY_TIMEOUT_MS = 30 * 60 * 1000

/**
 * 두레이 멘션 → 새/기존 터미널 + claude code 세션 + 파일 기반 prompt 입력.
 *
 * 흐름:
 *  - HIT (channelId의 탭이 살아있음):
 *      → 그 탭 활성화 + "{promptRelPath} 읽고 진행해\r" 입력
 *  - MISS (없음/죽음):
 *      → 새 터미널 (cwd: channelDir)
 *      → 1.5s 후 "claude\r" (인터랙티브 진입)
 *      → 3.0s 후 "{promptRelPath} 읽고 진행해\r"
 *      → ChannelSessionStore에 tabId 저장
 *
 * paste 호환성 회피:
 *  - prompt는 별도 파일(tasks/{logId}.md)에 저장
 *  - 터미널 입력은 한 줄(파일 경로 안내)만 흘려보냄 → 줄바꿈/특수문자 이슈 없음
 *  - claude는 그 파일을 읽어 컨텍스트로 사용 (cwd의 CLAUDE.md도 자동 로드)
 */
export class MentionTerminalSpawner {
  private mainWindow: BrowserWindow | null = null
  /** channelId → 선점 시각. 멘션 수신~dispatch 사이의 경쟁을 막는다 */
  private reserved = new Map<string, number>()

  constructor(
    private terminalManager: TerminalManager,
    private sessionStore: ChannelSessionStore
  ) {}

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  /**
   * 채널이 진행 중인지 판정.
   *  - sessionStore.busy && tab 살아있음 && timeout 미경과 → busy
   *  - 위 조건 어긋나면 stale로 보고 자동 idle 처리
   */
  checkBusy(channelId: string): { busy: boolean; sinceMs: number } {
    const reservedAt = this.reserved.get(channelId)
    if (reservedAt !== undefined) return { busy: true, sinceMs: Date.now() - reservedAt }
    const cur = this.sessionStore.get(channelId)
    if (!cur || !cur.busy) return { busy: false, sinceMs: 0 }
    const alive = this.terminalManager.listSessions().some((s) => s.id === cur.tabId)
    if (!alive) {
      this.sessionStore.markIdle(channelId)
      return { busy: false, sinceMs: 0 }
    }
    const sinceMs = Date.now() - (cur.busySince || 0)
    if (sinceMs > BUSY_TIMEOUT_MS) {
      this.sessionStore.markIdle(channelId)
      return { busy: false, sinceMs: 0 }
    }
    return { busy: true, sinceMs }
  }

  /**
   * busy 확인과 선점을 한 번에 — 확인 뒤 컨텍스트 수집(await) 동안 같은 채널 멘션이 또 들어와도 통과하지 못한다.
   * 선점은 dispatch 가 끝나 세션 저장소의 busy 로 넘어가거나 release 로 풀린다.
   */
  tryReserve(channelId: string): { ok: true } | { ok: false; sinceMs: number } {
    const state = this.checkBusy(channelId)
    if (state.busy) return { ok: false, sinceMs: state.sinceMs }
    this.reserved.set(channelId, Date.now())
    return { ok: true }
  }

  release(channelId: string): void {
    this.reserved.delete(channelId)
  }

  async dispatch(req: SpawnRequest): Promise<{ tabId: string; reused: boolean }> {
    try {
      return await this.dispatchInner(req)
    } finally {
      this.release(req.channelId)
    }
  }

  private async dispatchInner(req: SpawnRequest): Promise<{ tabId: string; reused: boolean }> {
    // 먼저 읽는다 — findReusableTabId 가 죽은 탭의 기록을 지우면 이어받을 claude 세션 id 까지 사라진다
    const prev = this.sessionStore.get(req.channelId)
    const reuseTabId = this.findReusableTabId(req.channelId)

    if (reuseTabId) {
      this.activate(reuseTabId)
      await sleep(REUSE_DELAY_MS)
      await this.sendOneLinerThenEnter(reuseTabId, this.buildOneLiner(req.promptRelPath, req.userRequest))
      this.sessionStore.touch(req.channelId)
      this.sessionStore.markBusy(req.channelId)
      return { tabId: reuseTabId, reused: true }
    }

    const meta = this.terminalManager.create({ cwd: req.channelDir })
    const tabName = `Clauday ▸ ${req.channelName}`.slice(0, 60)
    this.terminalManager.setName(meta.id, tabName)
    this.notifyRenderer({ ...meta, name: tabName })
    this.sessionStore.set(req.channelId, meta.id, req.channelName)
    this.sessionStore.markBusy(req.channelId)

    await sleep(CLAUDE_BOOT_DELAY_MS)
    // 같은 채널의 이전 claude 세션이 있으면 --resume으로 이어받기 → 채널 1:1 영구 보장.
    // 권한 확인은 건너뛴다 — 무인 실행이라 다이얼로그가 뜨면 멈춘다. 위험 동작만 PreToolUse hook 이 잡아
    // 두레이 승인을 받는다(DangerGate, 기획 §5.1 · D11).
    const permFlag = '--dangerously-skip-permissions'
    const claudeCmd = prev?.claudeSessionId
      ? `claude --resume ${prev.claudeSessionId} ${permFlag}\r`
      : `claude ${permFlag}\r`
    this.terminalManager.input(meta.id, claudeCmd)

    await sleep(CLAUDE_READY_DELAY_MS)
    await this.sendOneLinerThenEnter(meta.id, this.buildOneLiner(req.promptRelPath, req.userRequest))

    return { tabId: meta.id, reused: false }
  }

  private findReusableTabId(channelId: string): string | null {
    const cur = this.sessionStore.get(channelId)
    if (!cur) return null
    const alive = this.terminalManager.listSessions().some((s) => s.id === cur.tabId)
    if (!alive) {
      this.sessionStore.clear(channelId)
      return null
    }
    return cur.tabId
  }

  private buildOneLiner(promptRelPath: string, userRequest: string): string {
    // claude TUI는 한 chunk에 텍스트+\r을 같이 받으면 submit이 안 된다 (입력창에만 남음).
    // 그래서 \r은 sendOneLinerThenEnter()에서 분리해서 별도 input 호출로 전송한다.
    const safeReq = userRequest.replace(/[\r\n]+/g, ' ').trim()
    if (!safeReq) {
      return `${promptRelPath} 파일의 채팅 컨텍스트를 읽고, 사용자가 멘션한 의도가 모호하니 무엇을 도와드릴지 짧게 물어봐주세요.`
    }
    return `${promptRelPath} 파일의 채팅을 배경 컨텍스트로 참고하고, 사용자의 요청을 수행해줘: "${safeReq}"`
  }

  /** 텍스트 입력 → 짧은 sleep → Enter 별도 전송. claude TUI submit 호환. */
  private async sendOneLinerThenEnter(tabId: string, line: string): Promise<void> {
    this.terminalManager.input(tabId, line)
    await sleep(200)
    this.terminalManager.input(tabId, '\r')
  }

  private activate(tabId: string): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send(IPC_CHANNELS.MENTION_TERMINAL_FOCUS, { id: tabId })
    if (this.mainWindow.isMinimized()) this.mainWindow.restore()
    this.mainWindow.show()
  }

  private notifyRenderer(meta: TerminalSession): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send(IPC_CHANNELS.MENTION_TERMINAL_OPENED, meta)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
