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
/** busy 자동 해제 시간 — 30분 안에 끝난다고 가정. 길어지면 사용자가 reset 명령으로 강제 해제 */
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

  async dispatch(req: SpawnRequest): Promise<{ tabId: string; reused: boolean }> {
    const reuseTabId = this.findReusableTabId(req.channelId)
    const prev = this.sessionStore.get(req.channelId)

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
    // 같은 채널의 이전 claude 세션이 있으면 --resume으로 이어받기 → 채널 1:1 영구 보장
    // --dangerously-skip-permissions: 멘션 자동 처리 도중 권한 다이얼로그가 뜨면 사용자 입력 없이는
    // 작업이 멈춰버린다. 두레이 멘션 워크플로우는 자동화가 본질이므로 권한을 우회한다.
    const skipPerms = '--dangerously-skip-permissions'
    const claudeCmd = prev?.claudeSessionId
      ? `claude --resume ${prev.claudeSessionId} ${skipPerms}\r`
      : `claude ${skipPerms}\r`
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
