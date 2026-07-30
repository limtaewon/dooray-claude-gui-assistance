import { describe, it, expect } from 'vitest'
import { homedir } from 'os'
import { expandHome, samePath, normalizePathForCompare } from './paths'

describe('expandHome', () => {
  const home = '/Users/nhn'

  it('단독 ~ 은 홈으로 치환', () => {
    expect(expandHome('~', { home })).toBe('/Users/nhn')
  })

  it('~/a 는 홈/a 로 치환', () => {
    expect(expandHome('~/a', { home })).toBe('/Users/nhn/a')
  })

  it('win32: ~\\a 는 홈\\a 로 치환', () => {
    expect(expandHome('~\\a', { home, platform: 'win32' })).toBe('/Users/nhn\\a')
  })

  it('darwin 에서 ~\\a 는 확장하지 않는다', () => {
    expect(expandHome('~\\a', { home, platform: 'darwin' })).toBe('~\\a')
  })

  it('~user/a 는 확장하지 않는다', () => {
    expect(expandHome('~user/a', { home })).toBe('~user/a')
  })

  it('절대경로는 그대로', () => {
    expect(expandHome('/abs', { home })).toBe('/abs')
  })

  it('~ 가 선두가 아니면 그대로', () => {
    expect(expandHome('a/~/b', { home })).toBe('a/~/b')
  })

  it('home 주입이 반영된다', () => {
    expect(expandHome('~/proj', { home: '/custom/home' })).toBe('/custom/home/proj')
  })

  it('빈 문자열은 그대로', () => {
    expect(expandHome('', { home })).toBe('')
  })

  it('home 옵션 생략 시 실제 os.homedir() 을 사용한다', () => {
    expect(expandHome('~')).toBe(homedir())
  })
})

describe('expandHome — platform 옵션 생략 시 process.platform 사용', () => {
  const home = '/Users/nhn'

  it('win32: ~\\a 가 확장된다', () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      expect(expandHome('~\\a', { home })).toBe('/Users/nhn\\a')
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })

  it('darwin: ~\\a 는 확장되지 않는다', () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      expect(expandHome('~\\a', { home })).toBe('~\\a')
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })
})

describe('samePath — darwin', () => {
  it('대소문자를 구분한다', () => {
    expect(samePath('/A', '/a', { platform: 'darwin' })).toBe(false)
  })

  it('같은 경로는 true', () => {
    expect(samePath('/Users/nhn/proj', '/Users/nhn/proj', { platform: 'darwin' })).toBe(true)
  })

  it('서로 다른 경로는 false', () => {
    expect(samePath('/Users/nhn/proj', '/Users/nhn/other', { platform: 'darwin' })).toBe(false)
  })
})

describe('samePath — win32', () => {
  it('대소문자를 무시한다 (드라이브 문자 포함)', () => {
    expect(samePath('C:\\Users', 'c:/users', { platform: 'win32' })).toBe(true)
  })

  it('git porcelain 경로(C:/repo/wt) 와 path.join 산출(C:\\repo\\wt) 이 같다고 판정', () => {
    expect(samePath('C:/repo/wt', 'C:\\repo\\wt', { platform: 'win32' })).toBe(true)
  })

  it('후행 구분자 유무를 무시한다', () => {
    expect(samePath('C:\\repo\\wt\\', 'C:\\repo\\wt', { platform: 'win32' })).toBe(true)
  })

  it('연속 구분자를 축약한다', () => {
    expect(samePath('C:\\repo\\\\wt', 'C:\\repo\\wt', { platform: 'win32' })).toBe(true)
  })

  it('드라이브 루트는 후행 구분자를 지우지 않는다', () => {
    expect(normalizePathForCompare('C:/', 'win32')).toBe('c:/')
  })

  it('서로 다른 경로는 false', () => {
    expect(samePath('C:\\repo\\wt', 'C:\\repo\\other', { platform: 'win32' })).toBe(false)
  })
})

describe('samePath — 루트 경로 엣지', () => {
  it('루트 / 는 후행 구분자 제거 대상이 아니다', () => {
    expect(normalizePathForCompare('/', 'darwin')).toBe('/')
    expect(samePath('/', '/', { platform: 'darwin' })).toBe(true)
  })
})

describe('samePath — win32 UNC 경로', () => {
  it('백슬래시 UNC 와 슬래시 UNC 표현이 같다고 판정 (선행 // 보존)', () => {
    expect(normalizePathForCompare('\\\\server\\share', 'win32')).toBe('//server/share')
    expect(samePath('\\\\server\\share\\p', '//server/share/p', { platform: 'win32' })).toBe(true)
  })

  it('공유 이름이 다른 UNC 경로는 false', () => {
    expect(samePath('\\\\server\\share\\p', '\\\\server\\other\\p', { platform: 'win32' })).toBe(false)
  })
})

describe('normalizePathForCompare — platform 인자 생략 시 process.platform 사용', () => {
  it('win32 로 설정하면 대소문자를 무시한다 (기본 파라미터 분기)', () => {
    const orig = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    try {
      expect(normalizePathForCompare('C:\\Repo')).toBe('c:/repo')
    } finally {
      Object.defineProperty(process, 'platform', { value: orig, configurable: true })
    }
  })
})
