import { describe, it, expect } from 'vitest'
import { shouldActivateDrag, TAB_DRAG_ACTIVATION_DISTANCE_PX } from './tabDragSensor'

describe('shouldActivateDrag', () => {
  it('11px 가 3번 연속이어도 임계값 미만이라 비활성', () => {
    expect(shouldActivateDrag([11, 11, 11])).toBe(false)
  })

  it('12px 가 2번 연속이면 활성', () => {
    expect(shouldActivateDrag([12, 12])).toBe(true)
  })

  it('20px 라도 샘플이 1개뿐이면 비활성 (연속 확인 미충족)', () => {
    expect(shouldActivateDrag([20])).toBe(false)
  })

  it('임계값 미만 샘플이 낀 뒤 연속이 끊기면 다시 세어야 활성된다', () => {
    // [12, 5, 12, 12] → index0 하나만 넘고 index1 에서 리셋, index2~3 에서 연속 2 달성
    expect(shouldActivateDrag([12, 5, 12, 12])).toBe(true)
  })

  it('기본 임계값은 12px', () => {
    expect(TAB_DRAG_ACTIVATION_DISTANCE_PX).toBe(12)
  })

  it('커스텀 임계값/샘플 수를 지정할 수 있다', () => {
    expect(shouldActivateDrag([5, 5, 5], 5, 3)).toBe(true)
    expect(shouldActivateDrag([5, 5], 5, 3)).toBe(false)
  })
})
