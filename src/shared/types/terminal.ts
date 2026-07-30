export interface TerminalSession {
  id: string
  name: string
  pid: number
  cwd: string
  createdAt: number
}

export interface TerminalCreateOptions {
  cwd?: string
  command?: string
  args?: string[]
}

export interface TerminalResizeOptions {
  id: string
  cols: number
  rows: number
}

/** PTY 종료 통지 payload. signal 은 IPC 구조적 클론에서 undefined 가 소실되므로 null 로 정규화. */
export interface TerminalExitPayload {
  id: string
  exitCode: number
  signal: number | null
}
