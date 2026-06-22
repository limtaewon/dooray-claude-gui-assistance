/**
 * Doctor 패널 — 순수 함수 정합 점검 유틸리티.
 *
 * AI 없이 HarnessModel 정적 정합성을 검사한다.
 * 점검 항목:
 * 1. 어떤 레벨 체인에도 포함되지 않는 에이전트 (orphan agents)
 * 2. 소비자가 없는 산출물 (unclaimed outputs)
 * 3. 생산자가 없는 산출물 (missing producers)
 * 4. 게이트 phase 와 실제 에이전트 간 불일치 (gate-phase mismatch)
 * 5. model = 'unknown' 인 에이전트
 * 6. score 결측 (score 자체가 없거나 axes 가 비어있음)
 * 7. 레벨 체인에 정의되지 않은 에이전트 참조
 *
 * 점검 결과는 PASS / WARN / FAIL 세 등급으로 분류한다.
 * - FAIL: 실행 시 명확한 오류로 이어질 수 있음
 * - WARN: 동작은 가능하나 의도를 확인해야 함
 * - PASS: 이상 없음
 *
 * 6축 약점 요약은 score.axes 를 참고해 가장 낮은 축을 순서대로 반환한다.
 */

import type { HarnessModel, HarnessAgent, HarnessArtifact } from '@shared/types/harness'

// ─────────────────────────────────────────────
// 결과 타입
// ─────────────────────────────────────────────

/** 단일 점검 결과 등급 */
export type CheckSeverity = 'PASS' | 'WARN' | 'FAIL'

/** 단일 점검 결과 항목 */
export interface CheckResult {
  /** 점검 항목 식별 키 */
  key: string
  /** 한국어 제목 */
  title: string
  /** PASS / WARN / FAIL */
  severity: CheckSeverity
  /** 구체적인 내용 설명 (문제가 없으면 PASS 메시지) */
  detail: string
  /**
   * 문제 대상 목록 (에이전트 id, 산출물 id 등).
   * severity=PASS 이면 빈 배열.
   */
  items: string[]
}

/** 6축 약점 요약 단일 항목 */
export interface WeakAxisSummary {
  /** 축 키 */
  key: string
  /** 한국어 축 이름 */
  label: string
  /** 정규화 점수 (0~100) */
  percent: number
  /** AI 추정 근거 노트 */
  note?: string
}

/** Doctor 전체 점검 결과 */
export interface DoctorReport {
  checks: CheckResult[]
  /** 전체 요약 등급 — checks 중 가장 심각한 등급 */
  overallSeverity: CheckSeverity
  /** 6축 약점 요약 (점수 낮은 순). score 없으면 빈 배열 */
  weakAxes: WeakAxisSummary[]
  /** 총 FAIL 수 */
  failCount: number
  /** 총 WARN 수 */
  warnCount: number
}

// ─────────────────────────────────────────────
// 6축 레이블 (scoreUtils 와 동기화)
// ─────────────────────────────────────────────

const AXIS_LABELS: Record<string, string> = {
  enforcement:   '강제력',
  controlFlow:   '제어흐름',
  state:         '상태',
  blockingGate:  '차단게이트',
  feedbackLoop:  '피드백루프',
  observability: '관측가능성'
}

function axisLabel(key: string): string {
  return AXIS_LABELS[key] ?? key
}

// ─────────────────────────────────────────────
// 개별 점검 함수
// ─────────────────────────────────────────────

/**
 * 어떤 레벨 체인에도 포함되지 않는 에이전트를 점검한다.
 *
 * 전체 레벨 agentChain 의 합집합에 없는 에이전트는 고아(orphan) 에이전트다.
 * 레벨이 하나도 없으면 점검 대상이 없으므로 PASS.
 */
export function checkOrphanAgents(model: HarnessModel): CheckResult {
  const key = 'orphan-agents'
  const title = '체인 미포함 에이전트'

  if (model.levels.length === 0) {
    return {
      key, title, severity: 'WARN',
      detail: '레벨 정의가 없어 에이전트 체인 포함 여부를 확인할 수 없습니다.',
      items: []
    }
  }

  const chainAgentSet = new Set<string>()
  for (const level of model.levels) {
    for (const agentId of level.agentChain) {
      chainAgentSet.add(agentId)
    }
  }

  const orphans = model.agents
    .filter((a) => !chainAgentSet.has(a.id))
    .map((a) => a.id)

  if (orphans.length === 0) {
    return {
      key, title, severity: 'PASS',
      detail: '모든 에이전트가 최소 하나의 레벨 체인에 포함되어 있습니다.',
      items: []
    }
  }

  return {
    key, title, severity: 'WARN',
    detail: `${orphans.length}개 에이전트가 어떤 레벨 체인에도 포함되지 않습니다.`,
    items: orphans
  }
}

/**
 * 소비자가 없는 산출물을 점검한다.
 *
 * producer 가 있으나 consumers 가 비어있는 산출물은 "unclaimed output" 이다.
 * persist='dooray' 인 경우는 외부 소비를 가정하므로 제외한다.
 */
export function checkUnclaimedOutputs(artifacts: HarnessArtifact[]): CheckResult {
  const key = 'unclaimed-outputs'
  const title = '소비자 없는 산출물'

  const unclaimed = artifacts
    .filter((a) => a.producer && a.consumers.length === 0 && a.persist !== 'dooray')
    .map((a) => a.id)

  if (unclaimed.length === 0) {
    return {
      key, title, severity: 'PASS',
      detail: '소비자 없는 산출물이 없습니다.',
      items: []
    }
  }

  return {
    key, title, severity: 'WARN',
    detail: `${unclaimed.length}개 산출물에 소비자가 없습니다. 핸드오프 체인이 불완전할 수 있습니다.`,
    items: unclaimed
  }
}

/**
 * 생산자가 없는 산출물을 점검한다.
 *
 * producer 가 undefined/빈 문자열이고 consumers 가 있는 산출물은 문제다.
 * consumers 도 없으면 고립 산출물이므로 별도 경고.
 */
export function checkMissingProducers(artifacts: HarnessArtifact[]): CheckResult {
  const key = 'missing-producers'
  const title = '생산자 없는 산출물'

  const noProducer = artifacts
    .filter((a) => !a.producer)
    .map((a) => a.id)

  if (noProducer.length === 0) {
    return {
      key, title, severity: 'PASS',
      detail: '모든 산출물에 생산자 에이전트가 지정되어 있습니다.',
      items: []
    }
  }

  // consumers 가 있으면 FAIL (아무도 만들지 않는데 누군가 읽는 상황)
  const withConsumers = artifacts
    .filter((a) => !a.producer && a.consumers.length > 0)
    .map((a) => a.id)

  const severity: CheckSeverity = withConsumers.length > 0 ? 'FAIL' : 'WARN'
  const detail = withConsumers.length > 0
    ? `${withConsumers.length}개 산출물에 생산자 없이 소비자가 존재합니다.`
    : `${noProducer.length}개 산출물에 생산자가 지정되지 않았습니다.`

  return { key, title, severity, detail, items: noProducer }
}

/**
 * 게이트 phase 이름과 실제 에이전트 displayName/id 간 불일치를 점검한다.
 *
 * gate.phase 가 어떤 에이전트의 id 나 displayName 과도 일치하지 않으면 불일치.
 */
export function checkGatePhaseAlignment(model: HarnessModel): CheckResult {
  const key = 'gate-phase-mismatch'
  const title = '게이트-페이즈 불일치'

  if (model.controlFlow.gates.length === 0) {
    return {
      key, title, severity: 'PASS',
      detail: '점검할 게이트가 없습니다.',
      items: []
    }
  }

  const agentIdentifiers = new Set<string>()
  for (const agent of model.agents) {
    agentIdentifiers.add(agent.id)
    if (agent.displayName) agentIdentifiers.add(agent.displayName)
  }

  const mismatched = model.controlFlow.gates
    .filter((g) => !agentIdentifiers.has(g.phase))
    .map((g) => g.phase)

  if (mismatched.length === 0) {
    return {
      key, title, severity: 'PASS',
      detail: '모든 게이트 phase 가 에이전트와 일치합니다.',
      items: []
    }
  }

  return {
    key, title, severity: 'FAIL',
    detail: `${mismatched.length}개 게이트의 phase 가 어떤 에이전트와도 일치하지 않습니다.`,
    items: mismatched
  }
}

/**
 * model = 'unknown' 인 에이전트를 점검한다.
 *
 * unknown 이면 AI 추정에도 실패한 상태로, 비용 예측 오류로 이어질 수 있다.
 */
export function checkUnknownModels(agents: HarnessAgent[]): CheckResult {
  const key = 'unknown-models'
  const title = 'model 미확인 에이전트'

  const unknowns = agents
    .filter((a) => a.model === 'unknown')
    .map((a) => a.id)

  if (unknowns.length === 0) {
    return {
      key, title, severity: 'PASS',
      detail: '모든 에이전트의 모델이 확인되었습니다.',
      items: []
    }
  }

  return {
    key, title, severity: 'WARN',
    detail: `${unknowns.length}개 에이전트의 모델이 'unknown' 입니다. Dry-run 비용 예측이 부정확할 수 있습니다.`,
    items: unknowns
  }
}

/**
 * score 결측 여부를 점검한다.
 *
 * model.score 가 없거나 axes 가 비어있으면 점수 추정 불가.
 */
export function checkScoreCoverage(model: HarnessModel): CheckResult {
  const key = 'score-missing'
  const title = '점수(Score) 결측'

  if (!model.score) {
    return {
      key, title, severity: 'WARN',
      detail: '6축 점수가 없습니다. 하네스를 다시 가져와 AI 정규화를 실행하면 Opus가 점수를 추정합니다.',
      items: []
    }
  }

  if (model.score.axes.length === 0) {
    return {
      key, title, severity: 'WARN',
      detail: 'score 객체는 있으나 axes 배열이 비어있습니다.',
      items: []
    }
  }

  const missingAxes = model.score.axes.filter((a) => a.max === 0 || a.value < 0).map((a) => a.key)
  if (missingAxes.length > 0) {
    return {
      key, title, severity: 'WARN',
      detail: `${missingAxes.length}개 축의 점수 데이터가 잘못되었습니다.`,
      items: missingAxes
    }
  }

  return {
    key, title, severity: 'PASS',
    detail: `6축 점수가 모두 있습니다 (총점 ${model.score.total}).`,
    items: []
  }
}

/**
 * 레벨 체인에 정의되지 않은 에이전트 참조를 점검한다.
 *
 * agentChain 에 있는 에이전트 ID 가 model.agents 에 없으면 FAIL.
 */
export function checkUndefinedChainAgents(model: HarnessModel): CheckResult {
  const key = 'undefined-chain-agents'
  const title = '체인 미정의 에이전트 참조'

  if (model.levels.length === 0) {
    return {
      key, title, severity: 'PASS',
      detail: '레벨이 없으므로 점검할 체인이 없습니다.',
      items: []
    }
  }

  const agentIds = new Set(model.agents.map((a) => a.id))
  const undefinedRefs = new Set<string>()

  for (const level of model.levels) {
    for (const agentId of level.agentChain) {
      if (!agentIds.has(agentId)) {
        undefinedRefs.add(agentId)
      }
    }
  }

  const refs = Array.from(undefinedRefs)

  if (refs.length === 0) {
    return {
      key, title, severity: 'PASS',
      detail: '모든 레벨 체인의 에이전트가 정의되어 있습니다.',
      items: []
    }
  }

  return {
    key, title, severity: 'FAIL',
    detail: `${refs.length}개 에이전트 ID가 레벨 체인에서 참조되나 agents 목록에 없습니다.`,
    items: refs
  }
}

// ─────────────────────────────────────────────
// 6축 약점 요약
// ─────────────────────────────────────────────

/**
 * score.axes 를 정규화 점수 오름차순으로 정렬해 약점 요약을 반환한다.
 *
 * score 가 없으면 빈 배열을 반환한다.
 */
export function buildWeakAxesSummary(model: HarnessModel): WeakAxisSummary[] {
  if (!model.score || model.score.axes.length === 0) return []

  return model.score.axes
    .map((axis) => ({
      key: axis.key,
      label: axisLabel(axis.key),
      percent: axis.max > 0 ? Math.round((axis.value / axis.max) * 100) : 0,
      note: axis.note
    }))
    .sort((a, b) => a.percent - b.percent)
}

// ─────────────────────────────────────────────
// 전체 Doctor 보고서 생성
// ─────────────────────────────────────────────

/**
 * HarnessModel 전체 정합 점검을 실행하고 DoctorReport 를 반환한다.
 *
 * AI 없이 순수 정적 분석만 수행한다.
 * 점검 순서: 에이전트 체인 → 산출물 → 게이트 → 모델 → 점수
 */
export function runDoctorChecks(model: HarnessModel): DoctorReport {
  const checks: CheckResult[] = [
    checkOrphanAgents(model),
    checkUndefinedChainAgents(model),
    checkUnclaimedOutputs(model.artifacts),
    checkMissingProducers(model.artifacts),
    checkGatePhaseAlignment(model),
    checkUnknownModels(model.agents),
    checkScoreCoverage(model)
  ]

  const failCount = checks.filter((c) => c.severity === 'FAIL').length
  const warnCount = checks.filter((c) => c.severity === 'WARN').length

  let overallSeverity: CheckSeverity = 'PASS'
  if (failCount > 0) overallSeverity = 'FAIL'
  else if (warnCount > 0) overallSeverity = 'WARN'

  return {
    checks,
    overallSeverity,
    weakAxes: buildWeakAxesSummary(model),
    failCount,
    warnCount
  }
}
