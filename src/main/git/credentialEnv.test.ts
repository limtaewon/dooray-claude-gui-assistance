import { describe, it, expect } from 'vitest'
import { appendGitConfigEnv, nonInteractiveGitEnv, readValidGitConfigEnvCount } from './credentialEnv'

describe('readValidGitConfigEnvCount', () => {
  it('아무것도 없으면 0 부터 시작할 수 있다', () => {
    expect(readValidGitConfigEnvCount({})).toBe(0)
  })

  it('COUNT 없이 인덱스 키만 있으면 모호하므로 null', () => {
    expect(readValidGitConfigEnvCount({ GIT_CONFIG_KEY_0: 'a' })).toBeNull()
  })

  it('COUNT 와 키·값 쌍이 정확히 맞아야 인정한다', () => {
    expect(
      readValidGitConfigEnvCount({
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'core.x',
        GIT_CONFIG_VALUE_0: '1'
      })
    ).toBe(1)
  })

  it('COUNT 와 실제 쌍 수가 어긋나면 null', () => {
    expect(readValidGitConfigEnvCount({ GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'a', GIT_CONFIG_VALUE_0: 'b' })).toBeNull()
  })

  it('COUNT 를 넘어서는 dangling 인덱스가 있으면 null', () => {
    expect(
      readValidGitConfigEnvCount({
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'a',
        GIT_CONFIG_VALUE_0: 'b',
        GIT_CONFIG_KEY_5: 'c',
        GIT_CONFIG_VALUE_5: 'd'
      })
    ).toBeNull()
  })

  it('숫자가 아닌 COUNT 는 null', () => {
    expect(readValidGitConfigEnvCount({ GIT_CONFIG_COUNT: 'x' })).toBeNull()
  })
})

describe('appendGitConfigEnv', () => {
  it('기존 항목 뒤에 이어붙이고 COUNT 를 갱신한다', () => {
    const next = appendGitConfigEnv(
      { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'user.name', GIT_CONFIG_VALUE_0: 'me' },
      [['credential.interactive', 'false']]
    )
    expect(next.GIT_CONFIG_COUNT).toBe('2')
    expect(next.GIT_CONFIG_KEY_0).toBe('user.name')
    expect(next.GIT_CONFIG_KEY_1).toBe('credential.interactive')
    expect(next.GIT_CONFIG_VALUE_1).toBe('false')
  })

  it('프로토콜이 깨져 있으면 아예 손대지 않는다 — 호출자 데이터를 덮는 것이 더 위험하다', () => {
    const broken = { GIT_CONFIG_COUNT: '9', GIT_CONFIG_KEY_0: 'a' }
    expect(appendGitConfigEnv(broken, [['x', 'y']])).toEqual(broken)
  })
})

describe('nonInteractiveGitEnv', () => {
  it('대화형 자격증명 경로를 전부 막는다', () => {
    const env = nonInteractiveGitEnv({})
    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
    expect(env.GIT_ASKPASS).toBe('')
    expect(env.SSH_ASKPASS).toBe('')
    // GCM 은 위 가드를 무시하고 GUI 를 띄운다
    expect(env.GCM_INTERACTIVE).toBe('never')
    expect(env.GIT_CONFIG_COUNT).toBe('2')
  })

  it('사용자가 설정한 askpass 는 존중한다', () => {
    expect(nonInteractiveGitEnv({ GIT_ASKPASS: '/my/askpass' }).GIT_ASKPASS).toBe('/my/askpass')
  })

  it('SSH 는 BatchMode 로 즉시 실패시키되 호출자 지정이 있으면 건드리지 않는다', () => {
    expect(nonInteractiveGitEnv({}).GIT_SSH_COMMAND).toBe('ssh -o BatchMode=yes')
    expect(nonInteractiveGitEnv({ GIT_SSH_COMMAND: 'ssh -i key' }).GIT_SSH_COMMAND).toBe('ssh -i key')
  })

  it('로케일을 C 로 고정한다 — 한국어 환경에서 stderr 패턴 매칭이 깨지는 것을 막는다', () => {
    const env = nonInteractiveGitEnv({ LC_ALL: 'ko_KR.UTF-8', LANGUAGE: 'ko' })
    expect(env.LC_ALL).toBe('C')
    expect(env.LANGUAGE).toBe('')
  })

  it('나머지 환경변수는 그대로 통과시킨다', () => {
    expect(nonInteractiveGitEnv({ PATH: '/usr/bin' }).PATH).toBe('/usr/bin')
  })
})
