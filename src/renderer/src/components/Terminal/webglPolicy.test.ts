import { describe, it, expect, beforeEach } from 'vitest'
import {
  shouldAttachWebgl,
  setGlobalWebglFailure,
  resetGlobalWebglFailure,
  getGlobalWebglFailure
} from './webglPolicy'

const allowed = {
  setting: 'webgl' as const,
  isVisible: true,
  globalFailureLatch: false,
  paneLossCount: 0,
  deferred: false
}

describe('shouldAttachWebgl', () => {
  it('5조건이 모두 만족되면 true', () => {
    expect(shouldAttachWebgl(allowed)).toBe(true)
  })

  it('setting이 dom이면 false (다른 조건 무관)', () => {
    expect(shouldAttachWebgl({ ...allowed, setting: 'dom' })).toBe(false)
  })

  it('isVisible이 false면 false (함정 #4 — hidden pane 미부착)', () => {
    expect(shouldAttachWebgl({ ...allowed, isVisible: false })).toBe(false)
  })

  it('globalFailureLatch가 true면 false', () => {
    expect(shouldAttachWebgl({ ...allowed, globalFailureLatch: true })).toBe(false)
  })

  it('paneLossCount가 0보다 크면 false (같은 가시성 구간 재시도 금지)', () => {
    expect(shouldAttachWebgl({ ...allowed, paneLossCount: 1 })).toBe(false)
  })

  it('deferred가 true면 false (리페어런트/복원 replay 진행 중)', () => {
    expect(shouldAttachWebgl({ ...allowed, deferred: true })).toBe(false)
  })
})

describe('전역 실패 래치', () => {
  beforeEach(() => resetGlobalWebglFailure())

  it('초기값은 false', () => {
    expect(getGlobalWebglFailure()).toBe(false)
  })

  it('setGlobalWebglFailure() 이후 true, resetGlobalWebglFailure() 이후 다시 false', () => {
    setGlobalWebglFailure()
    expect(getGlobalWebglFailure()).toBe(true)
    resetGlobalWebglFailure()
    expect(getGlobalWebglFailure()).toBe(false)
  })
})
