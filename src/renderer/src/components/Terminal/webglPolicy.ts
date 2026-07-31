/**
 * WebGL attach 게이트 (v2.0 B-6, ADR-v2-terminal-p2-04 §1) — 5조건을 순수 함수 하나로 모은다.
 * 하나라도 어긋나면 false — 호출자는 false 일 때 반드시 dispose 를 호출해야 한다(캔버스에 마지막
 * 프레임이 남는 stale frame 을 막기 위해서다, ADR §대안 5).
 */
/** 터미널 렌더러 사용자 설정. 실제 attach 판정은 `shouldAttachWebgl` 이 pane 별로 한다. */
export type TerminalRendererSetting = 'webgl' | 'dom'

export interface ShouldAttachWebglInput {
  /** 사용자 설정 — 'dom' 이면 항상 false. */
  setting: 'webgl' | 'dom'
  /** ADR-01 의 visible(포커스 아님) — 숨김 pane 에는 절대 attach 하지 않는다(함정 #4). */
  isVisible: boolean
  /** 모듈 전역 — WebGL 초기화 자체가 throw 한 적이 있으면 앱 수명 동안 true. */
  globalFailureLatch: boolean
  /** 이 pane 이 현재 가시성 구간에서 겪은 context loss 횟수 — reveal/wake 에서만 0 으로 리셋. */
  paneLossCount: number
  /** DOM 리페어런트/복원 replay 진행 중이면 true — 이 구간 동안은 판정을 보류한다. */
  deferred: boolean
}

export function shouldAttachWebgl(input: ShouldAttachWebglInput): boolean {
  return (
    input.setting === 'webgl' &&
    input.isVisible &&
    !input.globalFailureLatch &&
    input.paneLossCount === 0 &&
    !input.deferred
  )
}

// 모듈 전역 실패 래치 — WebGL 초기화(`new WebglAddon()`/`loadAddon`)가 throw 하면 세운다.
// 유일한 탈출구는 사용자가 설정을 dom → webgl 로 재토글하는 명시적 의사(ADR §3).
let globalWebglFailure = false

export function setGlobalWebglFailure(): void {
  globalWebglFailure = true
}

/** 테스트·설정 재토글(dom→webgl) 전용 리셋. */
export function resetGlobalWebglFailure(): void {
  globalWebglFailure = false
}

export function getGlobalWebglFailure(): boolean {
  return globalWebglFailure
}
