import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { homedir } from 'os'
import { join, delimiter as pathDelimiter } from 'path'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import type { TerminalSession, TerminalCreateOptions, TerminalResizeOptions } from '../../shared/types/terminal'

interface PtySession {
  pty: pty.IPty
  meta: TerminalSession
  outputBuffer: string[]  // 최근 출력 보관
}

const MAX_BUFFER_LINES = 5000

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
  return [...extraPaths, currentPath].join(pathDelimiter)
}

export class TerminalManager {
  private sessions: Map<string, PtySession> = new Map()
  private mainWindow: BrowserWindow | null = null
  /** 외부 output listener — 멘션 작업 종료 마커 감지 등에 사용 */
  private outputListeners: Set<(id: string, data: string) => void> = new Set()

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  /** PTY 출력 listener 등록. unsubscribe 함수 반환. */
  addOutputListener(cb: (id: string, data: string) => void): () => void {
    this.outputListeners.add(cb)
    return () => { this.outputListeners.delete(cb) }
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
    })

    ptyProcess.onExit(() => {
      this.sessions.delete(id)
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
    if (session) {
      session.pty.kill()
      this.sessions.delete(id)
    }
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
      output: s.outputBuffer.join('')
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
