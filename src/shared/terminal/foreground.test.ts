import { describe, it, expect } from 'vitest'
import { isPaneBusy } from './foreground'

describe('isPaneBusy', () => {
  it('셸이면 비어 있다', () => {
    expect(isPaneBusy('zsh')).toBe(false)
    expect(isPaneBusy('-zsh')).toBe(false)
    expect(isPaneBusy('/bin/bash')).toBe(false)
    expect(isPaneBusy('C:\\Windows\\System32\\cmd.exe')).toBe(false)
  })

  it('그 밖의 프로그램이면 사용 중 — 여기에 타이핑하면 그 프로그램 입력으로 먹힌다', () => {
    expect(isPaneBusy('claude')).toBe(true)
    expect(isPaneBusy('vim')).toBe(true)
    expect(isPaneBusy('node')).toBe(true)
  })

  it('이름을 모르면 막지 않는다 — 확인 실패가 드롭을 죽이면 안 된다', () => {
    expect(isPaneBusy(null)).toBe(false)
    expect(isPaneBusy(undefined)).toBe(false)
    expect(isPaneBusy('  ')).toBe(false)
  })
})
