import { describe, it, expect, vi } from 'vitest'
import { detectWindowsShell, type ShellProbe } from './windowsShell'

const ENV_BASE: NodeJS.ProcessEnv = {
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  ProgramW6432: 'C:\\Program Files',
  SystemRoot: 'C:\\Windows',
  LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
  COMSPEC: 'C:\\Windows\\System32\\cmd.exe'
}

const PWSH_PATH = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
const POWERSHELL_PATH = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
const WINDOWSAPPS_PWSH = 'C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe'

function makeProbe(existing: Record<string, number>): ShellProbe {
  return (path: string) => {
    const size = existing[path]
    if (size === undefined) return undefined
    return { isFile: true, size }
  }
}

describe('detectWindowsShell', () => {
  it('pwsh 실존 → 1순위', () => {
    const probe = makeProbe({ [PWSH_PATH]: 1024, [POWERSHELL_PATH]: 2048 })
    const result = detectWindowsShell({ env: ENV_BASE, probe })
    expect(result[0]).toEqual({ file: PWSH_PATH, args: expect.any(Array), kind: 'pwsh' })
  })

  it('WindowsApps\\pwsh.exe 만 존재하고 size 0 → 후보에서 제외되고 powershell 로 내려감', () => {
    const probe = makeProbe({ [WINDOWSAPPS_PWSH]: 0, [POWERSHELL_PATH]: 2048 })
    const result = detectWindowsShell({ env: ENV_BASE, probe })
    expect(result.find((c) => c.kind === 'pwsh')).toBeUndefined()
    expect(result[0].kind).toBe('powershell')
    expect(result[0].file).toBe(POWERSHELL_PATH)
  })

  it('pwsh/powershell 부재 → COMSPEC → 그것도 없으면 bare cmd.exe', () => {
    const probeWithComspec = makeProbe({ [ENV_BASE.COMSPEC as string]: 4096 })
    const withComspec = detectWindowsShell({ env: ENV_BASE, probe: probeWithComspec })
    expect(withComspec.map((c) => c.kind)).toEqual(['cmd', 'cmd'])
    expect(withComspec[0].file).toBe(ENV_BASE.COMSPEC)
    expect(withComspec[withComspec.length - 1]).toEqual({ file: 'cmd.exe', args: expect.any(Array), kind: 'cmd' })

    const probeNone = makeProbe({})
    const noneFound = detectWindowsShell({ env: ENV_BASE, probe: probeNone })
    expect(noneFound).toEqual([{ file: 'cmd.exe', args: expect.any(Array), kind: 'cmd' }])
  })

  it('후보마다 args 가 kind 에 맞는다 — cmd 후보에 -NoLogo 가 붙지 않는다', () => {
    const probe = makeProbe({ [PWSH_PATH]: 1024, [ENV_BASE.COMSPEC as string]: 4096 })
    const result = detectWindowsShell({ env: ENV_BASE, probe })
    const pwshCandidate = result.find((c) => c.kind === 'pwsh')!
    const cmdCandidates = result.filter((c) => c.kind === 'cmd')

    expect(pwshCandidate.args).toContain('-NoLogo')
    for (const c of cmdCandidates) {
      expect(c.args).not.toContain('-NoLogo')
      expect(c.args.join(' ')).toContain('chcp 65001')
    }
  })

  it('probe 가 예외를 던져도 (권한 오류) 다음 후보로 넘어간다', () => {
    const throwing: ShellProbe = vi.fn(() => {
      throw new Error('EPERM')
    })
    const result = detectWindowsShell({ env: ENV_BASE, probe: throwing })
    // 모든 절대경로 후보가 예외로 실패하고, bare cmd.exe 만 남는다.
    expect(result).toEqual([{ file: 'cmd.exe', args: expect.any(Array), kind: 'cmd' }])
  })
})
