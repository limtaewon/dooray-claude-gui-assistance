import { describe, it, expect, vi, afterEach } from 'vitest'

// vi.mock factory 는 파일 상단으로 호이스팅되므로, factory 안에서 참조할 변수는 vi.hoisted 로 감싼다.
const { mockExistsSync } = vi.hoisted(() => ({ mockExistsSync: vi.fn() }))
vi.mock('fs', () => ({ existsSync: mockExistsSync, default: { existsSync: mockExistsSync } }))

import {
  resolveClaudeBin,
  getClaudeBin,
  resetClaudeBinCache,
  quoteWinShellArg,
  claudeSpawnCommand
} from './claudeBin'

afterEach(() => {
  mockExistsSync.mockReset()
})

describe('resolveClaudeBin — darwin', () => {
  it('CLAUDE_CLI_PATH 오버라이드가 최우선', () => {
    const bin = resolveClaudeBin({ platform: 'darwin', env: { CLAUDE_CLI_PATH: '/custom/claude' } })
    expect(bin).toBe('/custom/claude')
  })

  it('command -v 성공 시 그 경로 반환 (현행 동작 고정)', () => {
    mockExistsSync.mockReturnValue(true)
    const execImpl = vi.fn(() => Buffer.from('/opt/homebrew/bin/claude\n'))
    const bin = resolveClaudeBin({
      platform: 'darwin',
      home: '/Users/nhn',
      env: {},
      execFileSyncImpl: execImpl as never
    })
    expect(bin).toBe('/opt/homebrew/bin/claude')
    expect(execImpl).toHaveBeenCalledWith('/bin/zsh', ['-l', '-c', 'command -v claude'], { timeout: 5000 })
  })

  it('command -v 실패 + 후보 전부 부재 → 최종 claude 로 폴백', () => {
    mockExistsSync.mockReturnValue(false)
    const execImpl = vi.fn(() => { throw new Error('not found') })
    const bin = resolveClaudeBin({
      platform: 'darwin',
      home: '/Users/nhn',
      env: {},
      execFileSyncImpl: execImpl as never
    })
    expect(bin).toBe('claude')
  })

  it('command -v 실패 시 알려진 후보 경로 순회 (존재하는 것 선택)', () => {
    const execImpl = vi.fn(() => { throw new Error('not found') })
    mockExistsSync.mockImplementation((p: string) => p === '/opt/homebrew/bin/claude')
    const bin = resolveClaudeBin({
      platform: 'darwin',
      home: '/Users/nhn',
      env: {},
      execFileSyncImpl: execImpl as never
    })
    expect(bin).toBe('/opt/homebrew/bin/claude')
  })
})

describe('resolveClaudeBin — win32', () => {
  it('where 다중 결과 → .cmd 선택 (현행이 고르던 첫 줄이 아님을 단언)', () => {
    mockExistsSync.mockReturnValue(true)
    const execImpl = vi.fn(() =>
      Buffer.from('C:\\Users\\me\\AppData\\Roaming\\npm\\claude\r\nC:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd\r\n')
    )
    const bin = resolveClaudeBin({
      platform: 'win32',
      home: 'C:\\Users\\me',
      env: {},
      execFileSyncImpl: execImpl as never
    })
    expect(bin).toBe('C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd')
  })

  it('.cmd 없고 .exe 만 있으면 .exe 선택', () => {
    mockExistsSync.mockReturnValue(true)
    const execImpl = vi.fn(() => Buffer.from('C:\\Program Files\\claude\\claude.exe\r\n'))
    const bin = resolveClaudeBin({
      platform: 'win32',
      home: 'C:\\Users\\me',
      env: {},
      execFileSyncImpl: execImpl as never
    })
    expect(bin).toBe('C:\\Program Files\\claude\\claude.exe')
  })

  it('\\r 이 경로에 섞여 들어가지 않는다', () => {
    mockExistsSync.mockReturnValue(true)
    const execImpl = vi.fn(() => Buffer.from('C:\\claude\\claude.cmd\r\n'))
    const bin = resolveClaudeBin({
      platform: 'win32',
      home: 'C:\\Users\\me',
      env: {},
      execFileSyncImpl: execImpl as never
    })
    expect(bin.includes('\r')).toBe(false)
    expect(bin).toBe('C:\\claude\\claude.cmd')
  })

  it('.cmd/.exe/.bat 없고 확장자 없는 shim 만 있으면 최후 수단으로 그것을 선택 (npm sh shim 회피가 목적)', () => {
    const shimPath = 'C:\\Users\\me\\AppData\\Roaming\\npm\\claude'
    mockExistsSync.mockImplementation((p: unknown) => p === shimPath)
    const execImpl = vi.fn(() => Buffer.from(`${shimPath}\r\n`))
    const bin = resolveClaudeBin({
      platform: 'win32',
      home: 'C:\\Users\\me',
      env: {},
      execFileSyncImpl: execImpl as never
    })
    expect(bin).toBe(shimPath)
  })

  it('where 실패 + 후보 전부 부재 → 최종 claude.cmd 로 폴백', () => {
    mockExistsSync.mockReturnValue(false)
    const execImpl = vi.fn(() => { throw new Error('not found') })
    const bin = resolveClaudeBin({
      platform: 'win32',
      home: 'C:\\Users\\me',
      env: {},
      execFileSyncImpl: execImpl as never
    })
    expect(bin).toBe('claude.cmd')
  })
})

describe('resolveClaudeBin — platform 미지정 시 process.platform 사용', () => {
  it('win32', () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      mockExistsSync.mockReturnValue(false)
      const bin = resolveClaudeBin({ home: 'C:\\Users\\me', env: {}, execFileSyncImpl: vi.fn(() => { throw new Error('x') }) as never })
      expect(bin).toBe('claude.cmd')
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('darwin', () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      mockExistsSync.mockReturnValue(false)
      const bin = resolveClaudeBin({ home: '/Users/nhn', env: {}, execFileSyncImpl: vi.fn(() => { throw new Error('x') }) as never })
      expect(bin).toBe('claude')
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })
})

describe('getClaudeBin / resetClaudeBinCache', () => {
  it('모듈 로드 시 평가된 캐시를 재사용하다가 resetClaudeBinCache 로 재평가된다', () => {
    const noopExec = vi.fn(() => { throw new Error('x') })
    resetClaudeBinCache({ platform: 'darwin', home: '/Users/nhn', env: { CLAUDE_CLI_PATH: '/first' }, execFileSyncImpl: noopExec as never })
    expect(getClaudeBin()).toBe('/first')
    resetClaudeBinCache({ platform: 'darwin', home: '/Users/nhn', env: { CLAUDE_CLI_PATH: '/second' }, execFileSyncImpl: noopExec as never })
    expect(getClaudeBin()).toBe('/second')
  })
})

describe('quoteWinShellArg', () => {
  it('공백 없으면 그대로', () => {
    expect(quoteWinShellArg('C:\\claude\\claude.cmd')).toBe('C:\\claude\\claude.cmd')
  })

  it('공백 있으면 인용', () => {
    expect(quoteWinShellArg('C:\\Program Files\\claude.cmd')).toBe('"C:\\Program Files\\claude.cmd"')
  })

  it('이미 인용된 값은 그대로 (멱등)', () => {
    const quoted = '"C:\\Program Files\\claude.cmd"'
    expect(quoteWinShellArg(quoted)).toBe(quoted)
  })

  it('내부 큰따옴표는 "" 로 이스케이프', () => {
    expect(quoteWinShellArg('C:\\weird "name"\\claude.cmd')).toBe('"C:\\weird ""name""\\claude.cmd"')
  })

  it.each(['&', '|', '<', '>', '^', '(', ')'])('cmd 특수문자 %s 포함 시 인용', (ch) => {
    const value = `C:\\a${ch}b\\claude.cmd`
    expect(quoteWinShellArg(value)).toBe(`"${value}"`)
  })
})

describe('claudeSpawnCommand', () => {
  it('darwin — shell:false, windowsVerbatimArguments:false, 인용 없음', () => {
    const cmd = claudeSpawnCommand({ platform: 'darwin', bin: '/usr/local/bin/claude' })
    expect(cmd).toEqual({ command: '/usr/local/bin/claude', shell: false, windowsVerbatimArguments: false })
  })

  it('win32 — shell:true, windowsVerbatimArguments:true, 공백 경로가 인용됨', () => {
    const cmd = claudeSpawnCommand({ platform: 'win32', bin: 'C:\\Program Files\\claude\\claude.cmd' })
    expect(cmd).toEqual({
      command: '"C:\\Program Files\\claude\\claude.cmd"',
      shell: true,
      windowsVerbatimArguments: true
    })
  })

  it('opts 생략 시 platform 은 process.platform, bin 은 getClaudeBin() 캐시값을 사용', () => {
    const cmd = claudeSpawnCommand()
    if (process.platform === 'win32') {
      expect(cmd.shell).toBe(true)
      expect(cmd.windowsVerbatimArguments).toBe(true)
    } else {
      expect(cmd).toEqual({ command: getClaudeBin(), shell: false, windowsVerbatimArguments: false })
    }
  })
})
