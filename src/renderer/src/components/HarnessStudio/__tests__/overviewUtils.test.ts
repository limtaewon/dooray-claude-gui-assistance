/**
 * overviewUtils — 결정론 로직 단위 테스트
 *
 * 커버: buildChainSentence / buildLevelFlowSentence /
 *       buildLevelFlowParagraph / buildTriageSummary /
 *       buildCompareSummaryLines
 */

import { describe, it, expect } from 'vitest'
import {
  buildChainSentence,
  buildLevelFlowSentence,
  buildLevelFlowParagraph,
  buildTriageSummary,
  buildCompareSummaryLines
} from '../views/overviewUtils'
import type { HarnessModel, HarnessLevel, HarnessTriage } from '@shared/types/harness'

// ─────────────────────────────────────────────
// buildChainSentence
// ─────────────────────────────────────────────

describe('buildChainSentence', () => {
  it('에이전트 ID 를 → 로 연결한다', () => {
    const map = { 'a': '분석가', 'b': '개발자' }
    expect(buildChainSentence(['a', 'b'], map)).toBe('분석가 → 개발자')
  })

  it('맵에 없는 ID 는 그대로 사용한다', () => {
    const map = { 'a': '분석가' }
    expect(buildChainSentence(['a', 'unknown-agent'], map)).toBe('분석가 → unknown-agent')
  })

  it('빈 체인이면 "(에이전트 체인 없음)" 반환', () => {
    expect(buildChainSentence([], {})).toBe('(에이전트 체인 없음)')
  })

  it('단일 에이전트이면 화살표 없이 이름만', () => {
    expect(buildChainSentence(['dev'], { dev: '개발자' })).toBe('개발자')
  })
})

// ─────────────────────────────────────────────
// buildLevelFlowSentence
// ─────────────────────────────────────────────

describe('buildLevelFlowSentence', () => {
  it('레벨 id + name + 체인 문장 조립', () => {
    const level: HarnessLevel = {
      id: 'L1',
      name: 'Standard',
      agentChain: ['analyst', 'dev'],
      requiredArtifacts: []
    }
    const map = { analyst: '분석가', dev: '개발자' }
    const result = buildLevelFlowSentence(level, map)
    expect(result).toBe('L1 · Standard: 분석가 → 개발자')
  })

  it('name 없으면 id 만 표시', () => {
    const level: HarnessLevel = {
      id: 'L0',
      name: '',
      agentChain: ['dev'],
      requiredArtifacts: []
    }
    const result = buildLevelFlowSentence(level, { dev: '개발자' })
    expect(result).toBe('L0: 개발자')
  })
})

// ─────────────────────────────────────────────
// buildLevelFlowParagraph
// ─────────────────────────────────────────────

describe('buildLevelFlowParagraph', () => {
  it('레벨이 없으면 hasLevels=false, lines=[]', () => {
    const model = {
      levels: [],
      agents: []
    } as unknown as HarnessModel
    const result = buildLevelFlowParagraph(model)
    expect(result.hasLevels).toBe(false)
    expect(result.lines).toHaveLength(0)
  })

  it('레벨이 있으면 hasLevels=true, lines 길이 = 레벨 수', () => {
    const model = {
      levels: [
        { id: 'L0', name: 'Minimal', agentChain: ['dev'], requiredArtifacts: [] },
        { id: 'L1', name: 'Standard', agentChain: ['analyst', 'dev'], requiredArtifacts: [] }
      ],
      agents: [
        { id: 'dev', displayName: '개발자', role: '', model: 'sonnet', modelSource: 'static', tools: [], reads: [], writes: [] },
        { id: 'analyst', displayName: '분석가', role: '', model: 'haiku', modelSource: 'static', tools: [], reads: [], writes: [] }
      ]
    } as unknown as HarnessModel
    const result = buildLevelFlowParagraph(model)
    expect(result.hasLevels).toBe(true)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]).toContain('L0')
    expect(result.lines[0]).toContain('개발자')
    expect(result.lines[1]).toContain('분석가')
    expect(result.lines[1]).toContain('개발자')
  })
})

// ─────────────────────────────────────────────
// buildTriageSummary
// ─────────────────────────────────────────────

describe('buildTriageSummary', () => {
  it('질문/규칙 모두 없으면 안내 메시지', () => {
    const triage: HarnessTriage = { questions: [], rules: [] }
    expect(buildTriageSummary(triage)).toBe('트리아지 정보가 없습니다.')
  })

  it('질문 3개 규칙 2개이면 "3가지 질문, 2개 규칙으로..."', () => {
    const triage: HarnessTriage = {
      questions: [
        { id: 'Q1', text: '보안 요구사항?', meaning: '' },
        { id: 'Q2', text: '아키텍처 변경?', meaning: '' },
        { id: 'Q3', text: '신규 API?', meaning: '' }
      ],
      rules: [
        { when: 'Q1=Yes', then: 'L3' },
        { when: 'Q2=Yes', then: 'L2' }
      ]
    }
    const result = buildTriageSummary(triage)
    expect(result).toContain('3가지 질문')
    expect(result).toContain('2개 규칙')
    expect(result).toContain('L0~L3')
  })

  it('질문만 있어도 동작', () => {
    const triage: HarnessTriage = {
      questions: [{ id: 'Q1', text: '?', meaning: '' }],
      rules: []
    }
    const result = buildTriageSummary(triage)
    expect(result).toContain('1가지 질문')
    expect(result).not.toContain('0개 규칙')
  })
})

// ─────────────────────────────────────────────
// buildCompareSummaryLines
// ─────────────────────────────────────────────

describe('buildCompareSummaryLines', () => {
  it('변경 없으면 빈 배열', () => {
    const summary = {
      agentsAdded: 0, agentsRemoved: 0, agentsChanged: 0,
      levelsChanged: 0,
      gatesAdded: 0, gatesRemoved: 0, gatesChanged: 0
    }
    expect(buildCompareSummaryLines('A', 'B', summary)).toHaveLength(0)
  })

  it('에이전트 추가 시 neutral 방향 한 줄 포함', () => {
    const summary = {
      agentsAdded: 3, agentsRemoved: 0, agentsChanged: 0,
      levelsChanged: 0,
      gatesAdded: 0, gatesRemoved: 0, gatesChanged: 0
    }
    const lines = buildCompareSummaryLines('left', 'right', summary)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0].text).toContain('3명')
    expect(lines[0].direction).toBe('neutral')
  })

  it('점수 상승 시 positive 방향', () => {
    const summary = {
      agentsAdded: 0, agentsRemoved: 0, agentsChanged: 0,
      levelsChanged: 0,
      gatesAdded: 0, gatesRemoved: 0, gatesChanged: 0
    }
    const lines = buildCompareSummaryLines('A', 'B', summary, 10)
    const scoreLine = lines.find((l) => l.text.includes('점수'))
    expect(scoreLine).toBeDefined()
    expect(scoreLine!.direction).toBe('positive')
  })

  it('점수 하락 시 negative 방향', () => {
    const summary = {
      agentsAdded: 0, agentsRemoved: 0, agentsChanged: 0,
      levelsChanged: 0,
      gatesAdded: 0, gatesRemoved: 0, gatesChanged: 0
    }
    const lines = buildCompareSummaryLines('A', 'B', summary, -5)
    const scoreLine = lines.find((l) => l.text.includes('점수'))
    expect(scoreLine!.direction).toBe('negative')
  })

  it('게이트 추가 시 positive, 게이트 제거 시 negative', () => {
    const summaryWithGateAdd = {
      agentsAdded: 0, agentsRemoved: 0, agentsChanged: 0,
      levelsChanged: 0,
      gatesAdded: 2, gatesRemoved: 0, gatesChanged: 0
    }
    const linesAdd = buildCompareSummaryLines('A', 'B', summaryWithGateAdd)
    const gateLineAdd = linesAdd.find((l) => l.text.includes('게이트'))
    expect(gateLineAdd!.direction).toBe('positive')

    const summaryWithGateRemove = {
      agentsAdded: 0, agentsRemoved: 0, agentsChanged: 0,
      levelsChanged: 0,
      gatesAdded: 0, gatesRemoved: 1, gatesChanged: 0
    }
    const linesRemove = buildCompareSummaryLines('A', 'B', summaryWithGateRemove)
    const gateLineRemove = linesRemove.find((l) => l.text.includes('게이트'))
    expect(gateLineRemove!.direction).toBe('negative')
  })
})
