/**
 * Compare 뷰 — 두 HarnessModel diff 순수 함수 유틸리티.
 *
 * 비교 대상:
 * - 에이전트 (추가/제거/모델 변경/역할 변경)
 * - 레벨 체인 (agentChain 변경)
 * - 게이트 (추가/제거/phase 변경)
 * - 점수 (총점 및 6축 변화)
 *
 * 모든 함수는 순수함수로 vitest 에서 직접 테스트 가능하다.
 */

import type {
  HarnessModel,
  HarnessAgent,
  HarnessGate
} from '@shared/types/harness'

// ─────────────────────────────────────────────
// 공통 diff 타입
// ─────────────────────────────────────────────

/** diff 상태 */
export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

/** 에이전트 diff 항목 */
export interface AgentDiff {
  id: string
  displayName: string
  status: DiffStatus
  /** 변경된 필드 목록 (status='changed' 일 때만 의미 있음) */
  changedFields: string[]
  /** 기준 모델(left)의 에이전트. removed/changed 에 존재 */
  left?: HarnessAgent
  /** 비교 모델(right)의 에이전트. added/changed 에 존재 */
  right?: HarnessAgent
}

/** 레벨 체인 diff 항목 */
export interface LevelChainDiff {
  levelId: string
  levelName: string
  status: DiffStatus
  /** left 체인 */
  leftChain: string[]
  /** right 체인 */
  rightChain: string[]
  /** 체인에 추가된 에이전트 */
  addedAgents: string[]
  /** 체인에서 제거된 에이전트 */
  removedAgents: string[]
}

/** 게이트 diff 항목 */
export interface GateDiff {
  phase: string
  status: DiffStatus
  left?: HarnessGate
  right?: HarnessGate
  /** ruleCodes 변경 여부 */
  ruleCodesChanged: boolean
  /** blocking 변경 여부 */
  blockingChanged: boolean
}

/** 점수 축 diff 항목 */
export interface ScoreAxisDiff {
  key: string
  label: string
  leftValue?: number
  rightValue?: number
  leftMax?: number
  rightMax?: number
  /** 정규화 점수 변화 (rightPct - leftPct). 없으면 undefined */
  delta?: number
}

/** 전체 diff 결과 */
export interface HarnessDiff {
  /** 기준 모델 이름 */
  leftName: string
  /** 비교 모델 이름 */
  rightName: string
  agents: AgentDiff[]
  levels: LevelChainDiff[]
  gates: GateDiff[]
  scores: ScoreAxisDiff[]
  /** 총점 변화 */
  scoreTotalDelta?: number
  /** 변경 요약 카운트 */
  summary: {
    agentsAdded: number
    agentsRemoved: number
    agentsChanged: number
    levelsChanged: number
    gatesAdded: number
    gatesRemoved: number
    gatesChanged: number
  }
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
// 에이전트 diff
// ─────────────────────────────────────────────

/**
 * 두 HarnessAgent 를 비교해 변경된 필드 목록을 반환한다.
 *
 * 비교 필드: model, role, phaseClass, tools (길이/내용), riskNote
 */
export function diffAgentFields(left: HarnessAgent, right: HarnessAgent): string[] {
  const changed: string[] = []

  if (left.model !== right.model) changed.push('model')
  if (left.role !== right.role) changed.push('role')
  if ((left.phaseClass ?? '') !== (right.phaseClass ?? '')) changed.push('phaseClass')
  if (left.tools.join(',') !== right.tools.join(',')) changed.push('tools')
  if ((left.riskNote ?? '') !== (right.riskNote ?? '')) changed.push('riskNote')
  if (left.escalation !== right.escalation) changed.push('escalation')

  return changed
}

/**
 * 두 모델의 에이전트 목록을 비교해 AgentDiff 배열을 반환한다.
 *
 * id 기준으로 추가/제거/변경/미변경을 판정한다.
 */
export function diffAgents(leftModel: HarnessModel, rightModel: HarnessModel): AgentDiff[] {
  const leftMap = new Map(leftModel.agents.map((a) => [a.id, a]))
  const rightMap = new Map(rightModel.agents.map((a) => [a.id, a]))
  const allIds = new Set([...leftMap.keys(), ...rightMap.keys()])

  const result: AgentDiff[] = []

  for (const id of allIds) {
    const left = leftMap.get(id)
    const right = rightMap.get(id)

    if (!left && right) {
      result.push({ id, displayName: right.displayName, status: 'added', changedFields: [], right })
    } else if (left && !right) {
      result.push({ id, displayName: left.displayName, status: 'removed', changedFields: [], left })
    } else if (left && right) {
      const changedFields = diffAgentFields(left, right)
      const status: DiffStatus = changedFields.length > 0 ? 'changed' : 'unchanged'
      result.push({ id, displayName: left.displayName, status, changedFields, left, right })
    }
  }

  // added → removed → changed → unchanged 순 정렬
  const ORDER: Record<DiffStatus, number> = { added: 0, removed: 1, changed: 2, unchanged: 3 }
  return result.sort((a, b) => ORDER[a.status] - ORDER[b.status])
}

// ─────────────────────────────────────────────
// 레벨 체인 diff
// ─────────────────────────────────────────────

/**
 * 두 모델의 레벨 체인을 비교해 LevelChainDiff 배열을 반환한다.
 *
 * id 기준으로 추가/제거/변경을 판정한다.
 * 체인 비교는 순서를 포함한 문자열 비교.
 */
export function diffLevelChains(leftModel: HarnessModel, rightModel: HarnessModel): LevelChainDiff[] {
  const leftMap = new Map(leftModel.levels.map((l) => [l.id, l]))
  const rightMap = new Map(rightModel.levels.map((l) => [l.id, l]))
  const allIds = new Set([...leftMap.keys(), ...rightMap.keys()])

  const result: LevelChainDiff[] = []

  for (const levelId of allIds) {
    const left = leftMap.get(levelId)
    const right = rightMap.get(levelId)

    if (!left && right) {
      result.push({
        levelId,
        levelName: right.name,
        status: 'added',
        leftChain: [],
        rightChain: right.agentChain,
        addedAgents: right.agentChain,
        removedAgents: []
      })
    } else if (left && !right) {
      result.push({
        levelId,
        levelName: left.name,
        status: 'removed',
        leftChain: left.agentChain,
        rightChain: [],
        addedAgents: [],
        removedAgents: left.agentChain
      })
    } else if (left && right) {
      const leftSet = new Set(left.agentChain)
      const rightSet = new Set(right.agentChain)
      const addedAgents = right.agentChain.filter((id) => !leftSet.has(id))
      const removedAgents = left.agentChain.filter((id) => !rightSet.has(id))
      const chainChanged = left.agentChain.join(',') !== right.agentChain.join(',')

      result.push({
        levelId,
        levelName: left.name,
        status: chainChanged ? 'changed' : 'unchanged',
        leftChain: left.agentChain,
        rightChain: right.agentChain,
        addedAgents,
        removedAgents
      })
    }
  }

  return result.sort((a, b) => a.levelId.localeCompare(b.levelId))
}

// ─────────────────────────────────────────────
// 게이트 diff
// ─────────────────────────────────────────────

/**
 * 두 모델의 게이트 목록을 비교해 GateDiff 배열을 반환한다.
 *
 * phase 기준으로 추가/제거/변경을 판정한다.
 */
export function diffGates(leftModel: HarnessModel, rightModel: HarnessModel): GateDiff[] {
  const leftMap = new Map(leftModel.controlFlow.gates.map((g) => [g.phase, g]))
  const rightMap = new Map(rightModel.controlFlow.gates.map((g) => [g.phase, g]))
  const allPhases = new Set([...leftMap.keys(), ...rightMap.keys()])

  const result: GateDiff[] = []

  for (const phase of allPhases) {
    const left = leftMap.get(phase)
    const right = rightMap.get(phase)

    if (!left && right) {
      result.push({ phase, status: 'added', right, ruleCodesChanged: false, blockingChanged: false })
    } else if (left && !right) {
      result.push({ phase, status: 'removed', left, ruleCodesChanged: false, blockingChanged: false })
    } else if (left && right) {
      const ruleCodesChanged = left.ruleCodes.join(',') !== right.ruleCodes.join(',')
      const blockingChanged = left.blocking !== right.blocking
      const status: DiffStatus = ruleCodesChanged || blockingChanged ? 'changed' : 'unchanged'
      result.push({ phase, status, left, right, ruleCodesChanged, blockingChanged })
    }
  }

  const ORDER: Record<DiffStatus, number> = { added: 0, removed: 1, changed: 2, unchanged: 3 }
  return result.sort((a, b) => ORDER[a.status] - ORDER[b.status])
}

// ─────────────────────────────────────────────
// 점수 diff
// ─────────────────────────────────────────────

/**
 * 두 모델의 점수를 비교해 ScoreAxisDiff 배열을 반환한다.
 *
 * 두 모델 중 하나라도 score 가 없으면 해당 모델 쪽 값이 undefined 로 처리된다.
 */
export function diffScores(leftModel: HarnessModel, rightModel: HarnessModel): {
  axes: ScoreAxisDiff[]
  totalDelta?: number
} {
  const leftAxes = leftModel.score?.axes ?? []
  const rightAxes = rightModel.score?.axes ?? []
  const allKeys = new Set([...leftAxes.map((a) => a.key), ...rightAxes.map((a) => a.key)])

  const axes: ScoreAxisDiff[] = []

  for (const key of allKeys) {
    const left = leftAxes.find((a) => a.key === key)
    const right = rightAxes.find((a) => a.key === key)

    const leftPct = left && left.max > 0 ? Math.round((left.value / left.max) * 100) : undefined
    const rightPct = right && right.max > 0 ? Math.round((right.value / right.max) * 100) : undefined
    const delta = leftPct !== undefined && rightPct !== undefined ? rightPct - leftPct : undefined

    axes.push({
      key,
      label: axisLabel(key),
      leftValue: left?.value,
      rightValue: right?.value,
      leftMax: left?.max,
      rightMax: right?.max,
      delta
    })
  }

  const leftTotal = leftModel.score?.total
  const rightTotal = rightModel.score?.total
  const totalDelta = leftTotal !== undefined && rightTotal !== undefined
    ? rightTotal - leftTotal
    : undefined

  return { axes, totalDelta }
}

// ─────────────────────────────────────────────
// 전체 diff
// ─────────────────────────────────────────────

/**
 * 두 HarnessModel 을 비교해 전체 diff 결과를 반환한다.
 *
 * @param leftModel  기준 모델 (현재 열린 모델)
 * @param rightModel 비교 모델 (선택한 cached 모델)
 */
export function diffModels(leftModel: HarnessModel, rightModel: HarnessModel): HarnessDiff {
  const agents = diffAgents(leftModel, rightModel)
  const levels = diffLevelChains(leftModel, rightModel)
  const gates = diffGates(leftModel, rightModel)
  const { axes: scores, totalDelta } = diffScores(leftModel, rightModel)

  return {
    leftName: leftModel.meta.name,
    rightName: rightModel.meta.name,
    agents,
    levels,
    gates,
    scores,
    scoreTotalDelta: totalDelta,
    summary: {
      agentsAdded:    agents.filter((a) => a.status === 'added').length,
      agentsRemoved:  agents.filter((a) => a.status === 'removed').length,
      agentsChanged:  agents.filter((a) => a.status === 'changed').length,
      levelsChanged:  levels.filter((l) => l.status !== 'unchanged').length,
      gatesAdded:     gates.filter((g) => g.status === 'added').length,
      gatesRemoved:   gates.filter((g) => g.status === 'removed').length,
      gatesChanged:   gates.filter((g) => g.status === 'changed').length
    }
  }
}
