import { describe, it, expect, vi, afterEach } from 'vitest'
import { homedir } from 'os'
import { join, delimiter, posix } from 'path'
import { mergePathIntoEnv, claudeExtraPaths } from './env'

describe('mergePathIntoEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('win32: Path 키만 있으면 결과에도 Path 키 하나뿐 — PATH 키를 새로 만들지 않는다', () => {
    const result = mergePathIntoEnv({ Path: 'C:\\a' }, ['C:\\extra'], { platform: 'win32', delimiter: ';' })
    expect(Object.keys(result)).toEqual(['Path'])
    expect(result.Path).toBe('C:\\a;C:\\extra')
  })

  it('darwin: PATH 키 갱신, Path 키 미생성', () => {
    const result = mergePathIntoEnv({ PATH: '/a' }, ['/b'], { platform: 'darwin', delimiter: ':' })
    expect(Object.keys(result)).toEqual(['PATH'])
    expect(result.PATH).toBe('/a:/b')
  })

  it('Path 와 PATH 가 동시에 있으면 첫 키만 갱신 + warn 1회', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = mergePathIntoEnv({ Path: 'x', PATH: 'y' }, ['z'], { platform: 'win32', delimiter: ';' })
    expect(result.Path).toBe('x;z')
    expect(result.PATH).toBe('y') // 그대로 남음(우리가 손대지 않음)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('PATH 키 부재 + win32 → Path 신설, 기본값 빈 문자열', () => {
    const result = mergePathIntoEnv({}, ['C:\\extra'], { platform: 'win32', delimiter: ';' })
    expect(Object.keys(result)).toEqual(['Path'])
    expect(result.Path).toBe('C:\\extra')
  })

  it('PATH 키 부재 + darwin → PATH 신설, 기본값 /usr/bin:/bin', () => {
    const result = mergePathIntoEnv({}, ['/extra'], { platform: 'darwin', delimiter: ':' })
    expect(result.PATH).toBe('/usr/bin:/bin:/extra')
  })

  it('position append (기본) — extra 가 뒤에 붙는다', () => {
    const result = mergePathIntoEnv({ PATH: '/a' }, ['/b', '/c'], { platform: 'darwin', delimiter: ':' })
    expect(result.PATH).toBe('/a:/b:/c')
  })

  it('position prepend — extra 가 앞에 붙는다', () => {
    const result = mergePathIntoEnv({ PATH: '/a' }, ['/b', '/c'], { platform: 'darwin', delimiter: ':', position: 'prepend' })
    expect(result.PATH).toBe('/b:/c:/a')
  })

  it('darwin 은 중복 제거 시 대소문자를 구분한다', () => {
    const result = mergePathIntoEnv({ PATH: '/A/bin' }, ['/a/bin', '/A/bin'], { platform: 'darwin', delimiter: ':' })
    expect(result.PATH).toBe('/A/bin:/a/bin')
  })

  it('win32 은 중복 제거 시 대소문자를 무시한다', () => {
    const result = mergePathIntoEnv({ Path: 'C:\\Bin' }, ['c:\\bin', 'C:\\Other'], { platform: 'win32', delimiter: ';' })
    expect(result.Path).toBe('C:\\Bin;C:\\Other')
  })

  it('빈 세그먼트를 만들지 않는다', () => {
    const result = mergePathIntoEnv({ PATH: '' }, ['/extra'], { platform: 'darwin', delimiter: ':' })
    expect(result.PATH).toBe('/extra')
    expect(result.PATH?.startsWith(':')).toBe(false)
  })

  it('base 객체를 변형하지 않는다', () => {
    const base = { PATH: '/a' }
    const before = JSON.stringify(base)
    const result = mergePathIntoEnv(base, ['/b'], { platform: 'darwin', delimiter: ':' })
    expect(JSON.stringify(base)).toBe(before)
    expect(result).not.toBe(base)
  })
})

describe('claudeExtraPaths', () => {
  it('darwin 스냅샷 — homebrew/sbin·nvm·npm-global 포함, 중복 없음', () => {
    const paths = claudeExtraPaths({ home: '/Users/nhn', platform: 'darwin' })
    expect(paths).toEqual([
      '/Users/nhn/.claude/local',
      '/Users/nhn/.claude/bin',
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/Users/nhn/.local/bin',
      '/Users/nhn/.npm-global/bin',
      '/Users/nhn/.nvm/versions/node/current/bin'
    ])
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('win32 스냅샷 — AppData Roaming/Local npm 포함', () => {
    const paths = claudeExtraPaths({ home: 'C:\\Users\\nhn', platform: 'win32' })
    expect(paths).toEqual([
      'C:\\Users\\nhn\\.claude\\local',
      'C:\\Users\\nhn\\.claude\\bin',
      'C:\\Users\\nhn\\AppData\\Roaming\\npm',
      'C:\\Users\\nhn\\AppData\\Local\\npm'
    ])
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('home 주입이 반영된다', () => {
    const paths = claudeExtraPaths({ home: '/custom', platform: 'darwin' })
    expect(paths[0]).toBe('/custom/.claude/local')
  })
})

describe('claudeExtraPaths / mergePathIntoEnv — platform·home 옵션 생략 시 process.platform 사용', () => {
  it('win32 로 설정하면 claudeExtraPaths 가 win32 목록을 반환', () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      const paths = claudeExtraPaths({ home: 'C:\\Users\\nhn' })
      expect(paths).toContain('C:\\Users\\nhn\\AppData\\Roaming\\npm')
      expect(paths).not.toContain('/opt/homebrew/bin')
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('darwin 로 설정하면 claudeExtraPaths 가 darwin 목록을 반환', () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const paths = claudeExtraPaths({ home: '/Users/nhn' })
      expect(paths).toContain('/opt/homebrew/bin')
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('win32 로 설정하면 mergePathIntoEnv 가 Path 키를 신설한다 (platform 옵션 생략)', () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      const result = mergePathIntoEnv({}, ['C:\\extra'], { delimiter: ';' })
      expect(Object.keys(result)).toEqual(['Path'])
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('darwin 으로 설정하면 mergePathIntoEnv 가 PATH 키를 신설한다 (platform 옵션 생략)', () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      const result = mergePathIntoEnv({}, ['/extra'], { delimiter: ':' })
      expect(Object.keys(result)).toEqual(['PATH'])
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('claudeExtraPaths — home 옵션 생략 시 실제 os.homedir() 을 사용', () => {
    // platform 을 주입하므로 경로 구분자도 그 platform 것이어야 한다 —
    // Windows 러너에서 posix join 을 기대하면 실패한다.
    const paths = claudeExtraPaths({ platform: 'darwin' })
    expect(paths[0]).toBe(posix.join(homedir(), '.claude', 'local'))
  })

  it('mergePathIntoEnv — delimiter 옵션 생략 시 path.delimiter 를 사용', () => {
    const result = mergePathIntoEnv({ PATH: `/a${delimiter}/b` }, ['/c'], { platform: 'darwin' })
    expect(result.PATH).toBe(`/a${delimiter}/b${delimiter}/c`)
  })
})
