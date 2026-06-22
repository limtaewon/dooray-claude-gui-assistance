/**
 * levelPath — 레벨별 하이라이트 경로 결정론적 계산 (순수 함수)
 *
 * HarnessModel 과 levelId 를 받아 FlowCanvas 가 하이라이트할 에이전트 경로,
 * 병렬 그룹, 게이트, 예상 시간/비용 상대값을 결정론적으로 계산한다.
 *
 * AI 호출 없음. triage.rules / securityOverride 를 그대로 적용.
 *
 * 비용/시간은 L0 기준 상대값 (1.0 = L0 기준). 절대값이 아님.
 *
 * 참조: arch.md §3.2 — AI 는 레벨 추정값만, 나머지는 모델에서 결정론적으로 계산.
 */

import type { HarnessModel, HarnessLevelId, HarnessLevel } from '../../shared/types/harness'

// ─────────────────────────────────────────────────────────────────────────────
// 출력 타입
// ─────────────────────────────────────────────────────────────────────────────

/**
 * levelPath 가 계산한 결과.
 * DryRunEstimator 가 이 결과를 DryRunResult 에 병합한다.
 */
export interface LevelPathResult {
  /** 하이라이트할 에이전트 ID 배열 (핸드오프 순서) */
  highlightPath: string[]
  /** 병렬 실행 그룹 — agentChain 의 parallelInChain 에서 추출 */
  parallelGroups: string[][]
  /** 이 레벨에서 통과해야 하는 게이트 phase 목록 */
  gates: string[]
  /**
   * L0 대비 예상 소요 시간 상대값.
   * L0=1.0, L1=2.0, L2=3.5, L3=6.0 으로 결정론적으로 산출.
   * 에이전트 체인 길이가 L0 대비 두 배 이상이면 추가 가중치.
   */
  estTimeRel: number
  /**
   * L0 대비 예상 AI 호출 비용 상대값.
   * agentChain 길이 * 레벨 가중치로 계산.
   * L0 체인 길이가 0 이면 기본값 1.0.
   */
  estCostRel: number
}

// ─────────────────────────────────────────────────────────────────────────────
// 레벨별 기본 시간/비용 가중치 (결정론적)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 레벨별 기본 시간 상대값 (L0 기준).
 * 경험적 추정 — L0 는 단순 작업, L3 는 복잡한 대규모 작업.
 */
const LEVEL_TIME_WEIGHT: Record<HarnessLevelId, number> = {
  L0: 1.0,
  L1: 2.0,
  L2: 3.5,
  L3: 6.0,
}

/**
 * 레벨별 기본 비용 가중치.
 * 에이전트 수 * 레벨 계수로 비용을 추산한다.
 */
const LEVEL_COST_WEIGHT: Record<HarnessLevelId, number> = {
  L0: 1.0,
  L1: 1.8,
  L2: 3.0,
  L3: 5.5,
}

// ─────────────────────────────────────────────────────────────────────────────
// 보안 오버라이드 판정 (결정론적)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * securityOverride 조건 문자열에서 security 에이전트가 필수인지 판정.
 *
 * 지원하는 패턴:
 * - "L3 OR Q3=Yes" → 레벨이 L3 이거나 Q3=Yes 로 추정된 경우 필수
 * - "L3" → L3 레벨이면 무조건 security 필수
 * - 그 외 산문 → 언급 여부로 간단 판정
 *
 * @param securityOverride - triage.securityOverride 문자열 (optional)
 * @param levelId - 추정된 레벨
 * @returns security 에이전트 필수 여부
 */
export function isSecurityRequired(
  securityOverride: string | undefined,
  levelId: HarnessLevelId
): boolean {
  if (!securityOverride) return false

  const norm = securityOverride.toLowerCase()

  // "L3 OR Q3=Yes" 또는 "L3" 패턴 — L3 이면 security 필수
  if (norm.includes('l3')) {
    if (levelId === 'L3') return true
  }

  // 직접 level 이름 패턴 — "L2 이상" 등
  if ((norm.includes('l2 이상') || norm.includes('l2+')) && (levelId === 'L2' || levelId === 'L3')) {
    return true
  }

  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// 게이트 매핑 (결정론적)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 에이전트 체인에 포함된 에이전트 phase 와 일치하는 게이트 목록을 추출한다.
 *
 * HarnessGate.phase 가 에이전트 id 또는 displayName 과 부분 일치하면 포함.
 * 대소문자 무관 매칭.
 *
 * @param model - HarnessModel
 * @param agentIds - 이 레벨의 에이전트 체인
 * @returns 매칭된 게이트 phase 목록 (중복 제거)
 */
function extractGates(model: HarnessModel, agentIds: string[]): string[] {
  if (!model.controlFlow.gates || model.controlFlow.gates.length === 0) return []

  const chainLower = agentIds.map((id) => id.toLowerCase())
  const found: string[] = []

  for (const gate of model.controlFlow.gates) {
    const phaseLower = gate.phase.toLowerCase()
    // 에이전트 id 중 하나라도 gate.phase 를 포함하거나, gate.phase 가 에이전트 id 를 포함
    const matches = chainLower.some(
      (agentId) => agentId.includes(phaseLower) || phaseLower.includes(agentId)
    )
    if (matches && !found.includes(gate.phase)) {
      found.push(gate.phase)
    }
  }

  return found
}

// ─────────────────────────────────────────────────────────────────────────────
// 예상 시간/비용 계산 (결정론적)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 에이전트 체인 길이를 기반으로 비용 상대값을 계산한다.
 *
 * 계산식: (체인 길이 / L0 체인 길이) * LEVEL_COST_WEIGHT[levelId]
 * L0 체인 길이가 0 이면 LEVEL_COST_WEIGHT[levelId] 그대로.
 *
 * @param model - HarnessModel (L0 체인 길이 기준으로 사용)
 * @param levelId - 추정 레벨
 * @param chainLength - 이 레벨 에이전트 체인 길이
 */
function calcCostRel(model: HarnessModel, levelId: HarnessLevelId, chainLength: number): number {
  const l0Level = model.levels.find((l) => l.id === 'L0')
  const l0ChainLen = l0Level ? l0Level.agentChain.length : 0

  if (l0ChainLen === 0 || chainLength === 0) {
    return LEVEL_COST_WEIGHT[levelId]
  }

  const ratio = chainLength / l0ChainLen
  return Math.round(ratio * LEVEL_COST_WEIGHT[levelId] * 10) / 10
}

// ─────────────────────────────────────────────────────────────────────────────
// 핵심 순수 함수
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HarnessModel 과 levelId 를 받아 FlowCanvas 하이라이트 경로와
 * 예상 시간/비용 상대값을 결정론적으로 계산한다.
 *
 * 처리 순서:
 * 1. levelId 에 해당하는 HarnessLevel 을 조회한다.
 *    - 없으면 빈 결과 반환 (크래시 금지).
 * 2. agentChain 을 highlightPath 로 사용.
 * 3. securityOverride 판정 → security 에이전트가 필요하면 체인에 추가.
 *    (이미 있으면 위치 유지, 없으면 뒤에 추가)
 * 4. architect 에이전트 모델 오버라이드:
 *    - triage.rules 에 L3 규칙이 있고 levelId === 'L3' 이면 architect 에이전트를 opus 로 표시.
 *    (이 함수는 순수 경로 계산만 하므로 모델 변경은 하지 않음 — 메모로만 gates 에 반영)
 * 5. parallelInChain 에서 parallelGroups 추출.
 * 6. 게이트 매핑.
 * 7. estTimeRel / estCostRel 계산.
 *
 * @param model - 정규화된 HarnessModel
 * @param levelId - AI(Haiku) 가 추정한 레벨
 * @returns LevelPathResult
 */
export function levelPath(model: HarnessModel, levelId: HarnessLevelId): LevelPathResult {
  // 레벨 조회
  const level: HarnessLevel | undefined = model.levels.find((l) => l.id === levelId)

  if (!level || level.agentChain.length === 0) {
    // 레벨 정의 없음 또는 빈 체인 — 기본값 반환 (degradation)
    return {
      highlightPath: [],
      parallelGroups: [],
      gates: [],
      estTimeRel: LEVEL_TIME_WEIGHT[levelId],
      estCostRel: LEVEL_COST_WEIGHT[levelId],
    }
  }

  // highlightPath: agentChain 기본값
  let highlightPath: string[] = [...level.agentChain]

  // securityOverride 판정 — security 에이전트 추가 필요 여부
  if (isSecurityRequired(model.triage.securityOverride, levelId)) {
    // security 에이전트 id 후보 탐색 (phaseClass='security' 또는 id 에 'security' 포함)
    const securityAgent = model.agents.find(
      (a) => a.phaseClass === 'security' || a.id.toLowerCase().includes('security')
    )
    if (securityAgent && !highlightPath.includes(securityAgent.id)) {
      highlightPath = [...highlightPath, securityAgent.id]
    }
  }

  // parallelGroups: HarnessLevel.parallelInChain 에서 추출
  const parallelGroups: string[][] = level.parallelInChain ? [...level.parallelInChain] : []

  // gates: 에이전트 체인에 속하는 게이트 매핑
  const gates = extractGates(model, highlightPath)

  // 예상 시간 (결정론적)
  const estTimeRel = LEVEL_TIME_WEIGHT[levelId]

  // 예상 비용 (agentChain 길이 기반)
  const estCostRel = calcCostRel(model, levelId, highlightPath.length)

  return {
    highlightPath,
    parallelGroups,
    gates,
    estTimeRel,
    estCostRel,
  }
}
