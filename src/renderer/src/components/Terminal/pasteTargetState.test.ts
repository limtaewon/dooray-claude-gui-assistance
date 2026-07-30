/**
 * pasteTargetState 회귀 테스트 (v2.0 B-4, ADR-v2-terminal-p2-02 §9 — Orca adapted).
 */
import { describe, it, expect } from 'vitest'
import { beginPaste, isPasteTargetValid } from './pasteTargetState'
import type { PasteToken } from './pasteTargetState'

const base: PasteToken = { tabId: 't1', leafId: 'l1', sessionId: 's1', generation: 0 }

describe('pasteTargetState', () => {
  it('beginPaste 는 입력을 그대로 복사한 새 객체를 반환한다', () => {
    const token = beginPaste(base)
    expect(token).toEqual(base)
    expect(token).not.toBe(base)
  })

  it('4필드 모두 일치하면 valid', () => {
    expect(isPasteTargetValid(base, { ...base })).toBe(true)
  })

  it('tabId 불일치 → invalid', () => {
    expect(isPasteTargetValid(base, { ...base, tabId: 't2' })).toBe(false)
  })

  it('leafId 불일치(같은 탭 안에서 다른 pane 으로 포커스 이동) → invalid', () => {
    expect(isPasteTargetValid(base, { ...base, leafId: 'l2' })).toBe(false)
  })

  it('sessionId 불일치 → invalid', () => {
    expect(isPasteTargetValid(base, { ...base, sessionId: 's2' })).toBe(false)
  })

  it('generation 불일치(복원 중 재바인딩) → invalid', () => {
    expect(isPasteTargetValid(base, { ...base, generation: 1 })).toBe(false)
  })

  it('current 가 null 이면(타겟을 조회할 수 없음) invalid', () => {
    expect(isPasteTargetValid(base, null)).toBe(false)
  })
})
