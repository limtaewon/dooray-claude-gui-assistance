/*
 * TabPointerSensor 는 dnd-kit 의 PointerSensor(https://github.com/clauderic/dnd-kit) 클래스를
 * 상속하는 파생물입니다.
 * Copyright (c) 2021 Claudéric Demers — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: activationConstraint(distance) 를 12px 상수로 고정해 탭 더블클릭 rename 과 구분.
 * (v2.0 B-4 ADR-06 소급 등재 — p1 도입분)
 */
import { PointerSensor } from '@dnd-kit/core'

/** 탭 드래그 활성화까지 필요한 최소 이동 거리(px) — TabPointerSensor 의 activationConstraint 와 동일 값 유지. */
export const TAB_DRAG_ACTIVATION_DISTANCE_PX = 12

/**
 * 12px 이상 이동이 연속 2샘플 확인되어야 드래그로 판정한다 (더블클릭 rename 오작동 방지, ADR-04).
 *
 * dnd-kit 의 `activationConstraint: { distance }` 는 초기 pointerdown 좌표로부터의 누적 거리를
 * pointermove 마다 단일 샘플로 검사하는 내부(private) 로직이라 서브클래싱으로 가로챌 수 없다.
 * 이 함수는 그 판정 정책을 순수 함수로 문서화·검증하는 용도이며, 실제 런타임 게이팅은
 * `TabPointerSensor` 에 설정한 동일한 12px 임계값(activationConstraint)이 수행한다.
 */
export function shouldActivateDrag(distances: number[], thresholdPx = TAB_DRAG_ACTIVATION_DISTANCE_PX, requiredSamples = 2): boolean {
  if (distances.length < requiredSamples) return false
  let consecutive = 0
  for (const d of distances) {
    if (d >= thresholdPx) {
      consecutive++
      if (consecutive >= requiredSamples) return true
    } else {
      consecutive = 0
    }
  }
  return false
}

/**
 * 터미널 탭 전용 PointerSensor — 12px 이동 전에는 드래그를 시작하지 않아
 * 탭 라벨의 더블클릭 rename/연필/X 버튼과 충돌하지 않는다.
 * 사용: `useSensor(TabPointerSensor, { activationConstraint: { distance: TAB_DRAG_ACTIVATION_DISTANCE_PX } })`
 */
export class TabPointerSensor extends PointerSensor {
  static activators = PointerSensor.activators
}
