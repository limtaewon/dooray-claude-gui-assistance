/**
 * Overview 패널 — 결정론 로직 유틸리티.
 *
 * AI 호출 없이 HarnessModel 에서 즉시 생성할 수 있는
 * 평어 한국어 설명 문장 빌더.
 *
 * 모든 함수는 순수함수라 vitest 에서 직접 테스트 가능.
 */

import type { HarnessModel, HarnessLevel, HarnessTriage } from '@shared/types/harness'

// ─────────────────────────────────────────────
// 레벨 흐름 문장 빌더
// ─────────────────────────────────────────────

/**
 * 에이전트 체인 배열을 "분석 → 기획 → 설계" 형태의 한국어 문장으로 조립한다.
 *
 * displayName 조회를 위해 agentDisplayNameMap 을 받는다.
 * 매핑에 없는 id 는 id 그대로 사용한다.
 */
export function buildChainSentence(
  agentChain: string[],
  agentDisplayNameMap: Record<string, string>
): string {
  if (agentChain.length === 0) return '(에이전트 체인 없음)'
  return agentChain
    .map((id) => agentDisplayNameMap[id] ?? id)
    .join(' → ')
}

/**
 * 단일 레벨 정보를 평어 설명 문장으로 변환한다.
 *
 * 예) "L2 · Standard Feature: 분석가 → 기획자 → 개발자 → QA"
 */
export function buildLevelFlowSentence(
  level: HarnessLevel,
  agentDisplayNameMap: Record<string, string>
): string {
  const chain = buildChainSentence(level.agentChain, agentDisplayNameMap)
  const name = level.name ? `${level.id} · ${level.name}` : level.id
  return `${name}: ${chain}`
}

/**
 * 모델 전체 레벨 목록을 평어 문단으로 조립한다.
 *
 * 레벨이 없으면 안내 메시지를 반환한다.
 */
export function buildLevelFlowParagraph(model: HarnessModel): { lines: string[]; hasLevels: boolean } {
  if (model.levels.length === 0) {
    return { lines: [], hasLevels: false }
  }

  const displayNameMap: Record<string, string> = {}
  for (const agent of model.agents) {
    displayNameMap[agent.id] = agent.displayName || agent.id
  }

  const lines = model.levels.map((level) =>
    buildLevelFlowSentence(level, displayNameMap)
  )

  return { lines, hasLevels: true }
}

// ─────────────────────────────────────────────
// Triage 한 줄 설명
// ─────────────────────────────────────────────

/**
 * Triage 구조를 한 줄 요약 문장으로 변환한다.
 *
 * 규칙 수가 있으면 "N가지 질문, M개 규칙으로 레벨을 자동 판정합니다."
 * 없으면 "트리아지 정보가 없습니다."
 */
export function buildTriageSummary(triage: HarnessTriage): string {
  const qCount = triage.questions.length
  const rCount = triage.rules.length

  if (qCount === 0 && rCount === 0) return '트리아지 정보가 없습니다.'

  const parts: string[] = []
  if (qCount > 0) parts.push(`${qCount}가지 질문`)
  if (rCount > 0) parts.push(`${rCount}개 규칙`)

  return `${parts.join(', ')}으로 레벨(L0~L3)을 자동 판정합니다.`
}

// ─────────────────────────────────────────────
// Compare 평어 요약 빌더
// ─────────────────────────────────────────────

export interface CompareSummaryLine {
  /** 핵심 변화 한 줄 */
  text: string
  /** 변화 방향: 'positive' | 'negative' | 'neutral' */
  direction: 'positive' | 'negative' | 'neutral'
}

/**
 * 두 HarnessModel 의 diff 요약 카운트로 평어 한 줄 요약 배열을 생성한다.
 *
 * 반환값이 비어있으면 "두 하네스 사이에 감지된 구조 차이가 없습니다."로 표시한다.
 */
export function buildCompareSummaryLines(
  leftName: string,
  rightName: string,
  summary: {
    agentsAdded: number
    agentsRemoved: number
    agentsChanged: number
    levelsChanged: number
    gatesAdded: number
    gatesRemoved: number
    gatesChanged: number
  },
  scoreTotalDelta?: number
): CompareSummaryLine[] {
  const lines: CompareSummaryLine[] = []

  const agentNetDiff = summary.agentsAdded - summary.agentsRemoved
  if (agentNetDiff > 0) {
    lines.push({
      text: `${rightName} 는 ${leftName} 대비 에이전트가 ${agentNetDiff}명 더 많습니다.`,
      direction: 'neutral'
    })
  } else if (agentNetDiff < 0) {
    lines.push({
      text: `${rightName} 는 ${leftName} 대비 에이전트가 ${Math.abs(agentNetDiff)}명 더 적습니다.`,
      direction: 'neutral'
    })
  }

  if (summary.agentsChanged > 0) {
    lines.push({
      text: `에이전트 ${summary.agentsChanged}명의 모델·역할이 변경됐습니다.`,
      direction: 'neutral'
    })
  }

  if (summary.levelsChanged > 0) {
    lines.push({
      text: `레벨 체인 ${summary.levelsChanged}개가 달라졌습니다.`,
      direction: 'neutral'
    })
  }

  const gateNetDiff = summary.gatesAdded - summary.gatesRemoved
  if (gateNetDiff > 0) {
    lines.push({
      text: `게이트 ${gateNetDiff}개가 추가됐습니다 (강제 범위 확대).`,
      direction: 'positive'
    })
  } else if (gateNetDiff < 0) {
    lines.push({
      text: `게이트 ${Math.abs(gateNetDiff)}개가 제거됐습니다 (강제 범위 축소).`,
      direction: 'negative'
    })
  }

  if (summary.gatesChanged > 0) {
    lines.push({
      text: `게이트 ${summary.gatesChanged}개의 규칙 또는 blocking 설정이 바뀌었습니다.`,
      direction: 'neutral'
    })
  }

  if (scoreTotalDelta !== undefined && scoreTotalDelta !== 0) {
    if (scoreTotalDelta > 0) {
      lines.push({
        text: `종합 점수가 ${scoreTotalDelta}점 올랐습니다.`,
        direction: 'positive'
      })
    } else {
      lines.push({
        text: `종합 점수가 ${Math.abs(scoreTotalDelta)}점 내렸습니다.`,
        direction: 'negative'
      })
    }
  }

  return lines
}
