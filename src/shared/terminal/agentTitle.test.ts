import { describe, it, expect, vi } from 'vitest'
import { createAgentStatusTracker, detectAgentStatusFromTitle } from './agentTitle'

describe('detectAgentStatusFromTitle', () => {
  it('claude — ✳ 로 시작하면 idle, 스피너가 있으면 working', () => {
    expect(detectAgentStatusFromTitle('✳ claude')).toBe('idle')
    expect(detectAgentStatusFromTitle('⠇ Thinking… (12s)')).toBe('working')
  })

  it('gemini 기호', () => {
    expect(detectAgentStatusFromTitle('✦ gemini')).toBe('working')
    expect(detectAgentStatusFromTitle('◇ gemini')).toBe('idle')
    expect(detectAgentStatusFromTitle('✋ gemini')).toBe('idle')
  })

  it('키워드는 에이전트 이름이 함께 있을 때만 믿는다', () => {
    expect(detectAgentStatusFromTitle('claude — working')).toBe('working')
    expect(detectAgentStatusFromTitle('claude — done')).toBe('idle')
    // 평범한 셸 타이틀은 상태가 아니다
    expect(detectAgentStatusFromTitle('npm run build')).toBeNull()
    expect(detectAgentStatusFromTitle('~/Desktop/2NEON')).toBeNull()
  })

  it('단어 경계 — reworking·~/codex/ready 는 오탐이 아니다', () => {
    expect(detectAgentStatusFromTitle('claude reworking-plan')).toBeNull()
    expect(detectAgentStatusFromTitle('claude ~/codex/ready')).toBeNull()
  })

  it('`claude agents` 는 명령줄이지 상태가 아니다', () => {
    expect(detectAgentStatusFromTitle('claude agents')).toBeNull()
    expect(detectAgentStatusFromTitle('/usr/local/bin/claude agents')).toBeNull()
  })

  it('빈 값은 null', () => {
    expect(detectAgentStatusFromTitle('')).toBeNull()
    expect(detectAgentStatusFromTitle('   ')).toBeNull()
  })
})

describe('createAgentStatusTracker', () => {
  it('working → idle 전이에서만 알린다', () => {
    const onIdle = vi.fn()
    const tracker = createAgentStatusTracker({ onIdle })

    tracker.handleTitle('⠇ claude working')
    expect(onIdle).not.toHaveBeenCalled()

    tracker.handleTitle('✳ claude')
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('처음부터 idle 이면 알리지 않는다 — 그냥 띄워둔 claude', () => {
    const onIdle = vi.fn()
    const tracker = createAgentStatusTracker({ onIdle })

    tracker.handleTitle('✳ claude')
    tracker.handleTitle('✳ claude')

    expect(onIdle).not.toHaveBeenCalled()
  })

  it('일하는 동안 타이틀이 여러 번 바뀌어도 한 번만', () => {
    const onIdle = vi.fn()
    const tracker = createAgentStatusTracker({ onIdle })

    tracker.handleTitle('⠇ claude working')
    tracker.handleTitle('⠋ claude working')
    tracker.handleTitle('✳ claude')
    tracker.handleTitle('✳ claude')

    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('셸로 돌아가면(에이전트 종료) 완료로 치지 않는다', () => {
    const onIdle = vi.fn()
    const tracker = createAgentStatusTracker({ onIdle })

    tracker.handleTitle('⠇ claude working')
    tracker.handleTitle('~/Desktop/2NEON')

    expect(onIdle).not.toHaveBeenCalled()
  })

  it('다음 차례도 알린다', () => {
    const onIdle = vi.fn()
    const onWorking = vi.fn()
    const tracker = createAgentStatusTracker({ onIdle, onWorking })

    tracker.handleTitle('⠇ claude working')
    tracker.handleTitle('✳ claude')
    tracker.handleTitle('⠇ claude working')
    tracker.handleTitle('✳ claude')

    expect(onIdle).toHaveBeenCalledTimes(2)
    expect(onWorking).toHaveBeenCalledTimes(2)
  })

  it('에이전트 타이틀을 본 적 있는지 알려준다 — 폴백 판정을 켤지의 근거', () => {
    const tracker = createAgentStatusTracker({ onIdle: () => {} })
    expect(tracker.hasEvidence()).toBe(false)
    tracker.handleTitle('npm run build')
    expect(tracker.hasEvidence()).toBe(false)
    tracker.handleTitle('✳ claude')
    expect(tracker.hasEvidence()).toBe(true)
  })
})
