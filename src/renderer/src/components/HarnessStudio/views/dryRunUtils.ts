/**
 * dryRunUtils — DryRunPanel 에서 사용하는 순수 가공 함수 모음.
 *
 * 모든 함수는 side-effect 없이 입력→출력만 처리한다.
 * vitest 에서 electron/preload 없이 테스트할 수 있다.
 */

import type { DryRunResult, HarnessLevelId } from '@shared/types/harness'

// ─────────────────────────────────────────────
// 레벨 표시 매핑
// ─────────────────────────────────────────────

/** 레벨 ID → 표시 라벨 매핑 (이름이 없을 때 폴백) */
export const LEVEL_LABEL: Record<HarnessLevelId, string> = {
  L0: 'L0 — 최소 복잡도',
  L1: 'L1 — 표준',
  L2: 'L2 — 고복잡도',
  L3: 'L3 — 최대 복잡도'
}

/** 레벨 ID → Chip tone 매핑 */
export type LevelTone = 'emerald' | 'blue' | 'orange' | 'red'

export function levelTone(level: HarnessLevelId): LevelTone {
  switch (level) {
    case 'L0': return 'emerald'
    case 'L1': return 'blue'
    case 'L2': return 'orange'
    case 'L3': return 'red'
  }
}

// ─────────────────────────────────────────────
// 예상 시간/비용 상대값 → 표시 문자열
// ─────────────────────────────────────────────

/**
 * estTimeRel (L0 기준 1.0) 을 사용자 친화적인 표시 문자열로 변환한다.
 * 예) 1.0 → "L0 기준" / 2.5 → "L0 대비 약 2.5배" / 4.0 → "L0 대비 약 4배"
 *
 * 상대값임을 항상 표시 문자열에 포함한다(UI 에서 "(상대값)" 별도 표기와 중복 방지를 위해
 * 여기서는 배수만 반환하고 단위 맥락은 UI 가 부여).
 */
export function formatRelativeTime(estTimeRel: number): string {
  if (estTimeRel <= 0) return '-'
  if (estTimeRel === 1) return '1.0× (L0 기준)'
  const rounded = Math.round(estTimeRel * 10) / 10
  return `약 ${rounded}×`
}

/**
 * estCostRel (L0 기준 1.0) 을 표시 문자열로 변환한다.
 * 예) 1.0 → "1.0× (L0 기준)" / 3.2 → "약 3.2×"
 */
export function formatRelativeCost(estCostRel: number): string {
  if (estCostRel <= 0) return '-'
  if (estCostRel === 1) return '1.0× (L0 기준)'
  const rounded = Math.round(estCostRel * 10) / 10
  return `약 ${rounded}×`
}

// ─────────────────────────────────────────────
// 타임라인 빌더
// ─────────────────────────────────────────────

/** 타임라인 단계 하나 */
export interface TimelineStep {
  /** 단계 표시 인덱스 (1-based) */
  step: number
  /**
   * 단계에 포함된 에이전트 ID 배열.
   * 길이 1 = 순차 단계, 길이 > 1 = 병렬 그룹.
   */
  agents: string[]
  /** 병렬 실행 여부 */
  parallel: boolean
}

/**
 * highlightPath 와 parallelGroups 로 타임라인 단계 배열을 만든다.
 *
 * 알고리즘:
 * 1. parallelGroups 로 병렬 그룹 집합 구성
 * 2. highlightPath 를 순서대로 순회
 * 3. 이미 배치된 병렬 그룹 에이전트는 건너뜀 (중복 방지)
 * 4. 병렬 그룹에 속한 첫 번째 에이전트를 만나면 그룹 전체를 하나의 단계로 묶음
 * 5. 단독 에이전트는 개별 단계로
 *
 * @param highlightPath - 하이라이트 에이전트 ID 배열 (순서 = 실행 순서)
 * @param parallelGroups - 병렬 그룹 배열
 * @returns 타임라인 단계 배열
 */
export function buildTimeline(
  highlightPath: string[],
  parallelGroups: string[][]
): TimelineStep[] {
  if (highlightPath.length === 0) return []

  // 에이전트 ID → 소속 병렬 그룹 인덱스
  const agentToGroup = new Map<string, number>()
  for (let g = 0; g < parallelGroups.length; g++) {
    for (const agentId of parallelGroups[g]) {
      agentToGroup.set(agentId, g)
    }
  }

  const steps: TimelineStep[] = []
  const placedAgents = new Set<string>()
  let stepIdx = 1

  for (const agentId of highlightPath) {
    if (placedAgents.has(agentId)) continue

    const groupIdx = agentToGroup.get(agentId)
    if (groupIdx !== undefined) {
      // 병렬 그룹 — 그룹 내 에이전트 중 highlightPath 에 포함된 것만 묶기
      const groupMembers = parallelGroups[groupIdx].filter((id) =>
        highlightPath.includes(id)
      )
      for (const id of groupMembers) placedAgents.add(id)
      steps.push({ step: stepIdx++, agents: groupMembers, parallel: true })
    } else {
      placedAgents.add(agentId)
      steps.push({ step: stepIdx++, agents: [agentId], parallel: false })
    }
  }

  return steps
}

// ─────────────────────────────────────────────
// 두레이 URL 판별
// ─────────────────────────────────────────────

/**
 * 입력 문자열이 두레이 태스크 URL 인지 판별한다.
 * 예) https://nhnent.dooray.com/xxx/tasks/123456789
 */
export function isDoorayTaskUrl(text: string): boolean {
  return /https?:\/\/[^/]*dooray\.com\/.+\/tasks\/\d+/i.test(text.trim())
}

// ─────────────────────────────────────────────
// 게이트 표시 라벨
// ─────────────────────────────────────────────

/**
 * 게이트 phase 배열을 표시용 라벨 문자열로 변환한다.
 * 예) ['dev', 'qa'] → 'dev → qa'
 */
export function formatGates(gates: string[]): string {
  if (gates.length === 0) return '없음'
  return gates.join(' → ')
}

// ─────────────────────────────────────────────
// DryRunResult 유효성 검사
// ─────────────────────────────────────────────

/**
 * DryRunResult 가 표시에 충분한 데이터를 갖고 있는지 확인한다.
 * highlightPath 가 비어있으면 경로 하이라이트 불가.
 */
export function hasMeaningfulResult(result: DryRunResult): boolean {
  return (
    Boolean(result.level) &&
    Boolean(result.rationale) &&
    result.highlightPath.length > 0
  )
}
