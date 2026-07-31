import { describe, it, expect } from 'vitest'
import { createReplayGuard, REPLAY_CLEAR, POST_REPLAY_MODE_RESET } from './replay'

describe('createReplayGuard', () => {
  it('초기값은 비활성이다', () => {
    const guard = createReplayGuard()
    expect(guard.active).toBe(false)
  })

  it('on() 이후 active 가 true, off() 이후 다시 false', () => {
    const guard = createReplayGuard()
    guard.on()
    expect(guard.active).toBe(true)
    guard.off()
    expect(guard.active).toBe(false)
  })

  it('두 guard 인스턴스는 서로 독립적이다', () => {
    const a = createReplayGuard()
    const b = createReplayGuard()
    a.on()
    expect(a.active).toBe(true)
    expect(b.active).toBe(false)
  })
})

describe('상수', () => {
  it('REPLAY_CLEAR 는 화면 클리어 + 홈 커서 시퀀스다', () => {
    expect(REPLAY_CLEAR).toBe('\x1b[2J\x1b[3J\x1b[H')
  })

  it('POST_REPLAY_MODE_RESET 은 마우스 리포팅과 bracketed paste 해제 시퀀스를 포함한다', () => {
    expect(POST_REPLAY_MODE_RESET).toContain('\x1b[?1000l')
    expect(POST_REPLAY_MODE_RESET).toContain('\x1b[?2004l')
  })
})
