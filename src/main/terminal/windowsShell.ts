import { win32 } from 'path'
import { statSync } from 'fs'

export type WindowsShellKind = 'pwsh' | 'powershell' | 'cmd'

/** 절대경로 후보를 검사하는 함수. WindowsApps App Execution Alias 스텁(0바이트)을 배제하기 위해 size 를 함께 본다. */
export type ShellProbe = (path: string) => { isFile: boolean; size: number } | undefined

export interface WindowsShellCandidate {
  file: string
  args: string[]
  kind: WindowsShellKind
}

const PWSH_ARGS = [
  '-NoLogo',
  '-NoExit',
  '-Command',
  '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); $OutputEncoding=[Console]::OutputEncoding'
]
const CMD_ARGS = ['/K', 'chcp 65001>nul']

function isUsableFile(probe: ShellProbe, path: string): boolean {
  try {
    const stat = probe(path)
    return !!stat && stat.isFile && stat.size > 0
  } catch {
    return false
  }
}

/** 실제 파일시스템을 보는 기본 probe (`statSync` 기반). TerminalManager 가 주입해서 사용한다. */
export const defaultShellProbe: ShellProbe = (path) => {
  try {
    const stat = statSync(path)
    return { isFile: stat.isFile(), size: stat.size }
  } catch {
    return undefined
  }
}

/**
 * Windows PTY 셸 후보를 우선순위대로 돌려준다 (pwsh → powershell → COMSPEC → bare cmd.exe).
 * 절대경로 후보는 0바이트 WindowsApps alias 스텁을 배제하고, 마지막 bare cmd.exe 는 probe 없이
 * 항상 포함해 체인이 비지 않게 한다 (ADR-v2-windows-fix-03 §1).
 */
export function detectWindowsShell(opts: { env: NodeJS.ProcessEnv; probe: ShellProbe }): WindowsShellCandidate[] {
  const { env, probe } = opts
  const candidates: WindowsShellCandidate[] = []

  const programFiles = env.ProgramFiles || 'C:\\Program Files'
  const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const programW6432 = env.ProgramW6432 || programFiles
  const systemRoot = env.SystemRoot || env.windir || 'C:\\Windows'
  const localAppData = env.LOCALAPPDATA || win32.join(env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local')

  // pwsh(PowerShell 7) — Program Files 계열 우선, Store 설치는 WindowsApps 아래 alias 스텁일 수 있어 마지막.
  const pwshPaths = [
    win32.join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    win32.join(programW6432, 'PowerShell', '7', 'pwsh.exe'),
    win32.join(programFilesX86, 'PowerShell', '7', 'pwsh.exe'),
    win32.join(localAppData, 'Microsoft', 'WindowsApps', 'pwsh.exe')
  ]
  const pwshHit = pwshPaths.find((p) => isUsableFile(probe, p))
  if (pwshHit) candidates.push({ file: pwshHit, args: [...PWSH_ARGS], kind: 'pwsh' })

  // powershell (inbox, Windows 기본 탑재)
  const powershellPath = win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  if (isUsableFile(probe, powershellPath)) {
    candidates.push({ file: powershellPath, args: [...PWSH_ARGS], kind: 'powershell' })
  }

  // COMSPEC — 사용자/시스템이 지정한 커맨드 프로세서
  const comspec = env.COMSPEC
  if (comspec && isUsableFile(probe, comspec)) {
    candidates.push({ file: comspec, args: [...CMD_ARGS], kind: 'cmd' })
  }

  // 최후 폴백 — probe 없이 항상 포함, PATH 해석에 의존
  candidates.push({ file: 'cmd.exe', args: [...CMD_ARGS], kind: 'cmd' })

  return candidates
}
