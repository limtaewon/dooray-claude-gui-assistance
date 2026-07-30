import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { join, delimiter as pathDelimiter } from 'path'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import type {
  TerminalSession,
  TerminalCreateOptions,
  TerminalResizeOptions,
  TerminalExitPayload
} from '../../shared/types/terminal'
import { applySessionOrder } from './sessionOrder'

interface PtySession {
  pty: pty.IPty
  meta: TerminalSession
  outputBuffer: string[]  // 최근 출력 보관
}

const MAX_BUFFER_LINES = 5000

/**
 * 앱 재시작 후 복원 시 터미널이 깨져 보이는 문제 방지용 sanitizer.
 *
 * Why: pty 의 raw 출력에는 (a) TUI 앱(vim/htop/claude TUI)이 alternate screen
 * 으로 들어갔다 나오면서 누적한 화면 redraw, (b) 청크 경계에서 끊긴 미완성
 * ANSI escape sequence 가 섞여있다. 그대로 xterm.write 하면 화면이 난잡하다.
 *
 * 전략:
 *  1) alternate-screen exit (`\x1b[?1049l` / `?47l` / `?1047l`) 이 있으면 마지막
 *     exit 이후 출력만 남긴다 — TUI 가 끝난 시점 이후의 정상 셸 출력만 복원.
 *  2) 끝부분이 미완성 ESC 시퀀스로 잘렸으면 그 부분만 잘라낸다.
 */
function sanitizeForRestore(raw: string): string {
  const altExit = /\x1b\[\?(?:1049|47|1047)l/g
  let lastEnd = -1
  let m: RegExpExecArray | null
  while ((m = altExit.exec(raw)) !== null) lastEnd = m.index + m[0].length
  let out = lastEnd >= 0 ? raw.slice(lastEnd) : raw

  const lastEsc = out.lastIndexOf('\x1b')
  if (lastEsc >= 0) {
    const trail = out.slice(lastEsc)
    // 정상 종결: CSI/SGR 등은 `@`-`~` (0x40-0x7E) 로 끝, OSC 는 BEL(\x07) 또는 ST 로 끝.
    const finalized = /[\x40-\x7E]/.test(trail.slice(2)) || trail.includes('\x07')
    if (!finalized) out = out.slice(0, lastEsc)
  }
  return out
}

/**
 * PTY에 전달할 PATH 보강.
 * Electron 패키징 앱은 GUI에서 실행되기 때문에 부모 프로세스의 PATH가
 * 로그인 셸 환경과 다르다. .zshrc/.zprofile이 정상적으로 실행되지 않을 때를
 * 대비해 homebrew, .claude/local, npm-global 등을 미리 끼워둔다.
 */
function enrichedTerminalPath(): string {
  const home = homedir()
  const isWindows = process.platform === 'win32'
  const extraPaths = isWindows
    ? [
        join(home, '.claude', 'local'),
        join(home, '.claude', 'bin'),
        join(home, 'AppData', 'Roaming', 'npm'),
        join(home, 'AppData', 'Local', 'npm'),
      ]
    : [
        join(home, '.claude', 'local'),
        join(home, '.claude', 'bin'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/opt/homebrew/sbin',
        join(home, '.local', 'bin'),
        join(home, '.npm-global', 'bin'),
        // nvm 기본 경로 (버전별 심볼릭이 깔리지 않은 경우 대비)
        join(home, '.nvm', 'versions', 'node', 'current', 'bin'),
      ]
  const currentPath = process.env.PATH || (isWindows ? '' : '/usr/bin:/bin')
  // 사용자 PATH 우선, extraPaths 는 fallback. PTY 안에서 .zshrc 가 다시 실행되면 사용자 PATH 가
  // 한 번 더 갱신되니, 우리가 prepend 해서 사용자가 의도하지 않은 구버전 바이너리를 가리는 일이
  // 없게 한다.
  return [currentPath, ...extraPaths].join(pathDelimiter)
}

export class TerminalManager {
  private sessions: Map<string, PtySession> = new Map()
  private mainWindow: BrowserWindow | null = null
  /** 외부 output listener — 멘션 작업 종료 마커 감지 등에 사용 */
  private outputListeners: Set<(id: string, data: string) => void> = new Set()
  /** 외부 exit listener — addOutputListener 와 대칭 (C-2 AgentRunSpawner 등이 사용 예정) */
  private exitListeners: Set<(payload: TerminalExitPayload) => void> = new Set()
  /** kill() 로 예약된 "의도적 종료" id — onExit 에서 소비되면 통지를 생략한다 (ADR-v2-terminal-p1-01) */
  private suppressedExitIds: Set<string> = new Set()

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  /** PTY 출력 listener 등록. unsubscribe 함수 반환. */
  addOutputListener(cb: (id: string, data: string) => void): () => void {
    this.outputListeners.add(cb)
    return () => { this.outputListeners.delete(cb) }
  }

  /** PTY 종료 listener 등록. unsubscribe 함수 반환. */
  addExitListener(cb: (payload: TerminalExitPayload) => void): () => void {
    this.exitListeners.add(cb)
    return () => { this.exitListeners.delete(cb) }
  }

  create(options: TerminalCreateOptions = {}): TerminalSession {
    const id = randomUUID()
    const isWindows = process.platform === 'win32'
    const defaultShell = isWindows
      ? (process.env.COMSPEC || 'cmd.exe')
      : (process.env.SHELL || '/bin/zsh')
    const command = options.command || defaultShell
    // 사용자가 명시적 command를 주지 않은 경우, 로그인 셸로 띄워서
    // .zprofile/.bash_profile(NVM_DIR, homebrew shellenv 등)이 실행되도록 한다.
    // 이게 빠지면 .zshrc의 nvm.sh 로드가 실패해 hook/MCP에서 node를 못 찾는다.
    const isDefaultUnixShell = !options.command && !isWindows
    const args = options.args || (isDefaultUnixShell ? ['-l'] : [])
    const cwd = options.cwd || homedir()

    const ptyProcess = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: {
        ...process.env,
        // 패키징 앱에서 LANG 미설정 시 한글 깨짐 방지 (macOS/Linux only)
        ...(isWindows ? {} : {
          LANG: process.env.LANG || 'ko_KR.UTF-8',
          LC_ALL: process.env.LC_ALL || process.env.LANG || 'ko_KR.UTF-8',
          LC_CTYPE: process.env.LC_CTYPE || process.env.LANG || 'ko_KR.UTF-8',
        }),
        PATH: enrichedTerminalPath(),
        TERM: 'xterm-256color',
      } as Record<string, string>
    })

    const meta: TerminalSession = {
      id,
      name: options.command ? `${options.command}` : 'Terminal',
      pid: ptyProcess.pid,
      cwd,
      createdAt: Date.now()
    }

    const session: PtySession = { pty: ptyProcess, meta, outputBuffer: [] }

    ptyProcess.onData((data: string) => {
      // 버퍼에 저장
      session.outputBuffer.push(data)
      if (session.outputBuffer.length > MAX_BUFFER_LINES) {
        session.outputBuffer = session.outputBuffer.slice(-MAX_BUFFER_LINES)
      }

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_OUTPUT, { id, data })
      }

      for (const listener of this.outputListeners) {
        try {
          listener(id, data)
        } catch (error) {
          console.warn('[TerminalManager] output listener 실패', { sessionId: id, error })
        }
      }
    })

    let exitHandled = false
    ptyProcess.onExit(({ exitCode, signal }) => {
      if (exitHandled) return
      exitHandled = true
      this.sessions.delete(id)
      if (this.suppressedExitIds.delete(id)) return // 의도적 종료 — 통지 생략

      const payload: TerminalExitPayload = { id, exitCode: exitCode ?? 0, signal: signal ?? null }
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, payload)
      }
      for (const listener of this.exitListeners) {
        try {
          listener(payload)
        } catch (error) {
          console.warn('[TerminalManager] exit listener 실패', { sessionId: id, error })
        }
      }
    })

    this.sessions.set(id, session)
    return meta
  }

  input(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (session) session.pty.write(data)
  }

  resize(options: TerminalResizeOptions): void {
    const session = this.sessions.get(options.id)
    if (!session) return
    // cols/rows가 양수일 때만 resize (node-pty가 0 이하에서 throw)
    if (options.cols > 0 && options.rows > 0) {
      try { session.pty.resize(options.cols, options.rows) } catch { /* ignore */ }
    }
  }

  kill(id: string): void {
    const session = this.sessions.get(id)
    if (!session) return // 이미 사라진 id — 억제 예약을 새로 만들지 않는다 (누수 방지)
    this.suppressedExitIds.add(id)
    session.pty.kill()
    this.sessions.delete(id)
  }

  /** 렌더러의 탭 순서를 세션 Map 순서에 반영. 유효한 id 가 하나도 없으면 no-op. */
  reorder(ids: string[]): void {
    const currentIds = Array.from(this.sessions.keys())
    if (!ids.some((id) => this.sessions.has(id))) {
      console.warn('[TerminalManager] reorder — 요청에 유효한 세션 id 가 없음', { ids })
      return
    }
    const newOrder = applySessionOrder(currentIds, ids)
    const rebuilt = new Map<string, PtySession>()
    for (const orderedId of newOrder) {
      rebuilt.set(orderedId, this.sessions.get(orderedId)!)
    }
    this.sessions = rebuilt
  }

  listSessions(): TerminalSession[] {
    return Array.from(this.sessions.values()).map((s) => s.meta)
  }

  // 세션의 출력 버퍼 가져오기
  getOutput(id: string): string {
    const session = this.sessions.get(id)
    return session ? session.outputBuffer.join('') : ''
  }

  // 모든 세션의 메타+출력을 저장 가능한 형태로 반환
  exportSessions(): Array<{ meta: TerminalSession; output: string }> {
    return Array.from(this.sessions.values()).map((s) => ({
      meta: s.meta,
      output: sanitizeForRestore(s.outputBuffer.join(''))
    }))
  }

  // 탭 이름 변경 (UI 표시용 — 출력에는 영향 없음)
  setName(id: string, name: string): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    session.meta.name = name
    return true
  }

  dispose(): void {
    for (const [id] of this.sessions) {
      this.kill(id)
    }
  }
}
