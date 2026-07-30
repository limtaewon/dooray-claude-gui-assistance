/**
 * resolvePaneActivation 단위 테스트 — ADR-v2-terminal-p2-01 §1.
 *
 * 레거시 3호스트(TerminalView/MentionAgentView/BranchWorkspace)는 전부 `isActive={boolean}` 만
 * 넘긴다. 이 함수의 레거시 케이스가 기존 동작을 그대로 재현하는지가 B-3 무회귀의 근거다.
 */
import { describe, it, expect } from 'vitest'
import { resolvePaneActivation } from './paneActivation'

describe('resolvePaneActivation', () => {
  describe('레거시 isActive 단독 입력 (기존 3호스트 호환)', () => {
    it('isActive: true → visible/focused 둘 다 true', () => {
      expect(resolvePaneActivation({ isActive: true })).toEqual({ visible: true, focused: true })
    })

    it('isActive: false → visible/focused 둘 다 false', () => {
      expect(resolvePaneActivation({ isActive: false })).toEqual({ visible: false, focused: false })
    })

    it('isActive 미지정(아무것도 없음) → visible: true, focused: false', () => {
      expect(resolvePaneActivation({})).toEqual({ visible: true, focused: false })
    })
  })

  describe('신규 isVisible/isFocused 4조합', () => {
    it('{ isVisible: true, isFocused: true }', () => {
      expect(resolvePaneActivation({ isVisible: true, isFocused: true })).toEqual({ visible: true, focused: true })
    })

    it('{ isVisible: true, isFocused: false } → 보이지만 dim (split 의 정상 상태)', () => {
      expect(resolvePaneActivation({ isVisible: true, isFocused: false })).toEqual({ visible: true, focused: false })
    })

    it('{ isVisible: false, isFocused: false }', () => {
      expect(resolvePaneActivation({ isVisible: false, isFocused: false })).toEqual({ visible: false, focused: false })
    })

    it('{ isVisible: false, isFocused: true } → 필드는 서로 독립적으로 해석된다', () => {
      expect(resolvePaneActivation({ isVisible: false, isFocused: true })).toEqual({ visible: false, focused: true })
    })
  })

  describe('혼합 우선순위 — 명시적 신규 prop 이 isActive 보다 항상 우선', () => {
    it('isVisible 이 명시되면 isActive 는 focused 판정에만 폴백으로 쓰인다', () => {
      expect(resolvePaneActivation({ isVisible: false, isActive: true })).toEqual({ visible: false, focused: true })
    })

    it('isFocused 가 명시되면 isActive 는 visible 판정에만 폴백으로 쓰인다', () => {
      expect(resolvePaneActivation({ isFocused: false, isActive: true })).toEqual({ visible: true, focused: false })
    })

    it('isVisible/isFocused 가 모두 명시되면 isActive 는 완전히 무시된다', () => {
      expect(resolvePaneActivation({ isVisible: true, isFocused: false, isActive: false })).toEqual({
        visible: true,
        focused: false
      })
    })
  })
})
