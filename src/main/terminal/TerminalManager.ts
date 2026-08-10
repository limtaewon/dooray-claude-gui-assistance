import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import type {
  TerminalSession,
  TerminalCreateOptions,
  TerminalResizeOptions,
  TerminalExitPayload,
  TerminalOutputPayload,
  TerminalAttachResult
} from '../../shared/types/terminal'
import { mergePathIntoEnv, claudeExtraPaths } from '../utils/env'
import { detectWindowsShell, defaultShellProbe } from './windowsShell'

interface PtySession {
  pty: pty.IPty
  meta: TerminalSession
  outputBuffer: string[]  // 최근 출력 보관
  /** 마지막으로 내보낸 출력 청크 번호(1부터). 렌더러의 attach 따라잡기 기준점이다. */
  seq: number
}

const MAX_BUFFER_LINES = 5000
const PTY_COMMON_OPTIONS = { name: 'xterm-256color', cols: 120, rows: 30 } as const

/** win32 전용 — node-pty 의 useConptyDll 을 껐다 켰다 하는 모듈 전역 래치 (ADR-v2-windows-fix-03 §2). */
let conptyDllDisabled = false

/** 테스트 전용 — 래치 상태를 초기화한다. */
export function __resetConptyDllLatchForTest(): void {
  conptyDllDisabled = false
}

function looksLikeConptyDllError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /conpty/i.test(message) && /dll/i.test(message)
}

/**
 * PTY에 전달할 env 를 조립한다. PATH 보강은 mergePathIntoEnv/claudeExtraPaths 단일 정의를 쓴다
 * (append — 사용자 PATH 우선, ADR-v2-utils-03). win32 는 UTF-8/하이퍼링크용 env 를 추가로 얹고,
 * darwin/linux 의 LANG/LC_ALL/LC_CTYPE 강제는 그대로 유지한다(ADR-v2-windows-fix-03 §3).
 */
function buildPtyEnv(isWindows: boolean): Record<string, string> {
  const pathEnv = mergePathIntoEnv(process.env, claudeExtraPaths(), { position: 'append' })
  return {
    ...pathEnv,
    ...(isWindows
      ? {
          PYTHONUTF8: '1',
          TERM_PROGRAM: 'Clauday',
          FORCE_HYPERLINK: '1'
        }
      : {
          LANG: process.env.LANG || 'ko_KR.UTF-8',
          LC_ALL: process.env.LC_ALL || process.env.LANG || 'ko_KR.UTF-8',
          LC_CTYPE: process.env.LC_CTYPE || process.env.LANG || 'ko_KR.UTF-8'
        }),
    TERM: 'xterm-256color'
  } as Record<string, string>
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

  /**
   * win32 전용 — detectWindowsShell 후보를 순서대로 spawn 시도한다.
   * ConPTY DLL 오류로 실패하면 같은 후보를 useConptyDll:false 로 1회 더 재시도하고,
   * 성공하면 래치를 걸어 이후 모든 스폰이 처음부터 false 를 쓰게 한다 (ADR-v2-windows-fix-03 §2).
   */
  private spawnWindowsShell(cwd: string, env: Record<string, string>): pty.IPty {
    const candidates = detectWindowsShell({ env: process.env, probe: defaultShellProbe })
    let lastError: unknown = new Error('[TerminalManager] Windows PTY 후보가 없습니다')

    for (const candidate of candidates) {
      try {
        return pty.spawn(candidate.file, candidate.args, {
          ...PTY_COMMON_OPTIONS,
          cwd,
          env,
          useConptyDll: !conptyDllDisabled
        })
      } catch (error) {
        lastError = error
        console.warn('[TerminalManager] PTY 스폰 실패', { file: candidate.file, error })
        if (conptyDllDisabled || !looksLikeConptyDllError(error)) continue

        conptyDllDisabled = true
        try {
          return pty.spawn(candidate.file, candidate.args, {
            ...PTY_COMMON_OPTIONS,
            cwd,
            env,
            useConptyDll: false
          })
        } catch (retryError) {
          lastError = retryError
          console.warn('[TerminalManager] PTY 스폰 실패 (ConPTY DLL 비활성화 재시도)', {
            file: candidate.file,
            error: retryError
          })
        }
      }
    }
    throw lastError
  }

  create(options: TerminalCreateOptions = {}): TerminalSession {
    const id = randomUUID()
    const isWindows = process.platform === 'win32'
    // 사라진 폴더로 spawn 하면 node-pty 가 그대로 죽는다 — 워크트리를 지우고 나서 그 세션을
    // 다시 열 때 실제로 일어난다. 홈으로 떨어뜨리고 로그를 남겨 터미널 자체는 열리게 한다.
    const requestedCwd = options.cwd
    const cwd = requestedCwd && existsSync(requestedCwd) ? requestedCwd : homedir()
    if (requestedCwd && cwd !== requestedCwd) {
      console.warn(`[Terminal] 폴더가 없어 홈에서 시작합니다 cwd=${requestedCwd}`)
    }
    const env = buildPtyEnv(isWindows)

    let ptyProcess: pty.IPty
    if (options.command) {
      // 사용자가 명시적으로 커맨드를 준 경우 — 플랫폼 무관 그대로 spawn(로그인 셸 강제 없음, 이 커맨드에
      // -l 이 안 맞을 수 있어서). args 는 node-pty 에 그대로 전달한다(문자열 분해 금지, ADR-v2-windows-fix-04 §2).
      ptyProcess = pty.spawn(options.command, options.args ?? [], { ...PTY_COMMON_OPTIONS, cwd, env })
    } else if (isWindows) {
      ptyProcess = this.spawnWindowsShell(cwd, env)
    } else {
      // 로그인 셸로 띄워서 .zprofile/.bash_profile(NVM_DIR, homebrew shellenv 등)이 실행되도록 한다.
      // 이게 빠지면 .zshrc의 nvm.sh 로드가 실패해 hook/MCP에서 node를 못 찾는다.
      ptyProcess = pty.spawn(process.env.SHELL || '/bin/zsh', ['-l'], { ...PTY_COMMON_OPTIONS, cwd, env })
    }

    const meta: TerminalSession = {
      id,
      name: options.name ?? (options.command ? options.command : 'Terminal'),
      pid: ptyProcess.pid,
      cwd,
      createdAt: Date.now()
    }

    const session: PtySession = { pty: ptyProcess, meta, outputBuffer: [], seq: 0 }

    ptyProcess.onData((data: string) => {
      // 버퍼에 저장
      session.outputBuffer.push(data)
      session.seq += 1
      if (session.outputBuffer.length > MAX_BUFFER_LINES) {
        session.outputBuffer = session.outputBuffer.slice(-MAX_BUFFER_LINES)
      }

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        const payload: TerminalOutputPayload = { id, data, seq: session.seq }
        this.mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_OUTPUT, payload)
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

  /** 세션의 PTY pid 조회 — 존재하지 않으면 null. pid cwd probe(M-B) 등 조회 전용 용도. */
  /**
   * pane 에서 지금 돌고 있는 프로그램 이름 — 셸이면 프롬프트가 비어 있다는 뜻.
   * node-pty 가 주는 값이라 플랫폼별로 정확도가 다르다. 판정은 `isPaneBusy` 가 한다.
   */
  getForegroundProcess(id: string): string | null {
    const session = this.sessions.get(id)
    if (!session) return null
    try {
      return session.pty.process || null
    } catch {
      return null
    }
  }

  getPid(id: string): number | null {
    const session = this.sessions.get(id)
    return session ? session.pty.pid : null
  }

  listSessions(): TerminalSession[] {
    return Array.from(this.sessions.values()).map((s) => s.meta)
  }

  // 세션의 출력 버퍼 가져오기
  getOutput(id: string): string {
    const session = this.sessions.get(id)
    return session ? session.outputBuffer.join('') : ''
  }

  /**
   * pane 이 붙을 때 지금까지의 출력과 그 마지막 청크 번호를 함께 준다.
   * 렌더러는 구독보다 늦게 붙을 수 있어 초기 출력(셸 프롬프트)을 라이브 이벤트로는 못 받는다 —
   * 여기서 따라잡고, 이보다 큰 seq 의 수신분만 이어 쓰면 중복 없이 이어진다.
   */
  attach(id: string): TerminalAttachResult {
    const session = this.sessions.get(id)
    if (!session) {
      console.warn('[TerminalManager] attach — 없는 세션', { sessionId: id })
      return { data: '', seq: 0 }
    }
    return { data: session.outputBuffer.join(''), seq: session.seq }
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
