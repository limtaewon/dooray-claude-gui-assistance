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
