/**
 * 터미널 auto-follow 판단 회귀 테스트.
 *
 * 회귀 배경: b4d701e 가 매 출력마다 무조건 scrollToBottom 을 호출해, 사용자가 위로 스크롤해
 * 읽는 중에도 바닥으로 끌려가는 문제(v1.7)가 생겼다. 바닥에 있을 때만 따라가야 한다.
 */
import { describe, it, expect } from 'vitest'
import { shouldFollowOutput } from './scrollFollow'

describe('shouldFollowOutput', () => {
  it('바닥에 있으면(viewportY === baseY) 따라 내려간다', () => {
    expect(shouldFollowOutput(100, 100)).toBe(true)
  })

  it('위로 스크롤해 읽는 중이면(viewportY < baseY) 따라가지 않는다 — v1.7 회귀 방지', () => {
    expect(shouldFollowOutput(40, 100)).toBe(false)
  })

  it('스크롤백이 없는 초기 상태(둘 다 0)는 바닥으로 본다', () => {
    expect(shouldFollowOutput(0, 0)).toBe(true)
  })

  it('viewportY 가 baseY 보다 크면(경계) 바닥으로 본다', () => {
    expect(shouldFollowOutput(101, 100)).toBe(true)
  })
})
