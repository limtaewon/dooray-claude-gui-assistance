import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import type { TerminalSession, TerminalCreateOptions, TerminalResizeOptions } from '../../shared/types/terminal'

interface PtySession {
  pty: pty.IPty
  meta: TerminalSession
  outputBuffer: string[]  // 최근 출력 보관
}

const MAX_BUFFER_LINES = 5000

export class TerminalManager {
  private sessions: Map<string, PtySession> = new Map()
  private mainWindow: BrowserWindow | null = null

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  create(options: TerminalCreateOptions = {}): TerminalSession {
    const id = randomUUID()
    const shell = process.env.SHELL || '/bin/zsh'
    const command = options.command || shell
    const args = options.args || []
    const cwd = options.cwd || process.env.HOME || '/'

    const ptyProcess = pty.spawn(command, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: process.env as Record<string, string>
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

  dispose(): void {
    for (const [id] of this.sessions) {
      this.kill(id)
    }
  }
}
