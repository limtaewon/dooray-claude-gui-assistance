/**
 * paneDividerDrag 순수 계산부 테스트 (v2.0 B-4). 실제 pointer 드래그 시퀀스는 jsdom 신뢰도가
 * 낮아 수동 QA 로 검증한다 — plan.md B-4 Gate 2 참조.
 */
import { describe, it, expect } from 'vitest'
import { adaptiveMinPx, clampRatio, ratioFromPointer, MIN_PANE_PX } from './paneDividerDrag'

describe('paneDividerDrag — 순수 계산', () => {
  describe('adaptiveMinPx', () => {
    it('충분히 큰 컨테이너는 고정 최소값(120px)', () => {
      expect(adaptiveMinPx(2000)).toBe(MIN_PANE_PX)
    })
    it('작은 컨테이너는 total/2 로 더 좁아진다', () => {
      expect(adaptiveMinPx(100)).toBe(50)
    })
    it('0 이하 컨테이너는 0', () => {
      expect(adaptiveMinPx(0)).toBe(0)
    })
  })

  describe('clampRatio', () => {
    it('범위 안의 ratio 는 그대로', () => {
      expect(clampRatio(0.5, 1000)).toBe(0.5)
    })
    it('최소 비율 아래로는 못 내려간다', () => {
      const r = clampRatio(0.01, 1000) // minRatio = 120/1000 = 0.12
      expect(r).toBeCloseTo(0.12, 5)
    })
    it('최대 비율 위로는 못 올라간다', () => {
      const r = clampRatio(0.99, 1000)
      expect(r).toBeCloseTo(0.88, 5)
    })
    it('total 이 0 이하면 0.5 로 폴백', () => {
      expect(clampRatio(0.9, 0)).toBe(0.5)
    })
    it('컨테이너가 너무 작아 min 비율이 50% 를 넘으면 0.5 로 고정', () => {
      expect(clampRatio(0.9, 50)).toBe(0.5)
    })
  })

  describe('ratioFromPointer', () => {
    it('컨테이너 정중앙 포인터 → 0.5', () => {
      expect(ratioFromPointer(500, 0, 1000)).toBe(0.5)
    })
    it('컨테이너 시작점 포인터는 적응형 최소값으로 clamp', () => {
      expect(ratioFromPointer(0, 0, 1000)).toBeCloseTo(0.12, 5)
    })
    it('컨테이너 끝점 포인터는 적응형 최대값으로 clamp', () => {
      expect(ratioFromPointer(1000, 0, 1000)).toBeCloseTo(0.88, 5)
    })
    it('컨테이너 오프셋(containerStartPx)을 반영한다', () => {
      expect(ratioFromPointer(600, 100, 1000)).toBe(0.5)
    })
    it('total 이 0 이면 0.5', () => {
      expect(ratioFromPointer(10, 0, 0)).toBe(0.5)
    })
  })
})
