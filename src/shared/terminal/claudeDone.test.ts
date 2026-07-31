import { describe, it, expect } from 'vitest'
import {
  containsBell,
  isClaudeProcess,
  newDoneState,
  onOutput,
  shouldNotifyIdle
} from './claudeDone'

const NOW = 1_800_000_000_000
const OPTS = { idleMs: 10_000 }

describe('isClaudeProcess', () => {
  it('claude 만 대상으로 본다', () => {
    expect(isClaudeProcess('claude')).toBe(true)
    expect(isClaudeProcess('/usr/local/bin/claude')).toBe(true)
    expect(isClaudeProcess('claude.exe')).toBe(true)
  })

  it('셸이나 다른 프로그램은 아니다 — 빌드 로그 끝났다고 알리면 성가시다', () => {
    expect(isClaudeProcess('zsh')).toBe(false)
    expect(isClaudeProcess('vim')).toBe(false)
    expect(isClaudeProcess(null)).toBe(false)
  })
})

describe('shouldNotifyIdle', () => {
  it('출력이 멎고 시간이 지나면 알린다', () => {
    const state = onOutput(newDoneState(NOW), NOW)
    expect(shouldNotifyIdle(state, 'claude', NOW + 10_000, OPTS)).toBe(true)
  })

  it('아직 조용해지지 않았으면 안 알린다', () => {
    const state = onOutput(newDoneState(NOW), NOW)
    expect(shouldNotifyIdle(state, 'claude', NOW + 9_000, OPTS)).toBe(false)
  })

  it('한 번도 출력이 없던 세션은 알리지 않는다 — 그냥 띄워둔 claude', () => {
    const state = newDoneState(NOW)
    expect(shouldNotifyIdle(state, 'claude', NOW + 60_000, OPTS)).toBe(false)
  })

  it('이미 알렸으면 다시 알리지 않는다', () => {
    const state = { ...onOutput(newDoneState(NOW), NOW), notified: true }
    expect(shouldNotifyIdle(state, 'claude', NOW + 60_000, OPTS)).toBe(false)
  })

  it('다시 움직이면 다음 차례를 또 알릴 수 있다', () => {
    const notified = { ...onOutput(newDoneState(NOW), NOW), notified: true }
    const moved = onOutput(notified, NOW + 30_000)
    expect(moved.notified).toBe(false)
    expect(shouldNotifyIdle(moved, 'claude', NOW + 40_000, OPTS)).toBe(true)
  })

  it('claude 가 아니면 안 알린다', () => {
    const state = onOutput(newDoneState(NOW), NOW)
    expect(shouldNotifyIdle(state, 'zsh', NOW + 60_000, OPTS)).toBe(false)
  })
})

describe('containsBell', () => {
  it('벨 문자를 알아본다 — claude 알림이 terminal bell 이면 즉시 신호다', () => {
    expect(containsBell('done\u0007')).toBe(true)
    expect(containsBell('평범한 출력')).toBe(false)
  })
})
