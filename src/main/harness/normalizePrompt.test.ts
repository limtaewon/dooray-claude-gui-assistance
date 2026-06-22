import { describe, it, expect } from 'vitest'
import {
  buildNormalizeSystemPrompt,
  buildNormalizeUserPrompt,
  buildEstimateSystemPrompt,
  buildEstimateUserPrompt
} from './normalizePrompt'
import type { HarnessModel, HarnessTriage } from '../../shared/types/harness'

// ─────────────────────────────────────────────────────────────────────────────
// buildNormalizeSystemPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('buildNormalizeSystemPrompt', () => {
  it('비어있지 않은 문자열 반환', () => {
    const prompt = buildNormalizeSystemPrompt()
    expect(prompt.length).toBeGreaterThan(100)
  })

  it('[AI] 필드 키워드를 포함한다 — role/reads/writes/phaseClass', () => {
    const prompt = buildNormalizeSystemPrompt()
    expect(prompt).toContain('role')
    expect(prompt).toContain('reads')
    expect(prompt).toContain('writes')
    expect(prompt).toContain('phaseClass')
  })

  it('[S] 필드 덮어쓰기 금지 지시 포함', () => {
    const prompt = buildNormalizeSystemPrompt()
    expect(prompt).toContain('[S]')
    expect(prompt).toMatch(/덮어쓰지 않는다|건드리지 않|건드리지 말/)
  })

  it('JSON only 강제 지시 포함', () => {
    const prompt = buildNormalizeSystemPrompt()
    expect(prompt).toMatch(/JSON\s*만|순수\s*JSON|JSON only/)
  })

  it('HarnessModel 주요 섹션(levels, triage, score) 포함', () => {
    const prompt = buildNormalizeSystemPrompt()
    expect(prompt).toContain('levels')
    expect(prompt).toContain('triage')
    expect(prompt).toContain('score')
  })

  it('provenance 기록 지시 포함', () => {
    const prompt = buildNormalizeSystemPrompt()
    expect(prompt).toContain('provenance')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildNormalizeUserPrompt — 머지 계약 검증
// ─────────────────────────────────────────────────────────────────────────────

describe('buildNormalizeUserPrompt', () => {
  const minimalSkeleton: Partial<HarnessModel> = {
    schemaVersion: 1,
    meta: {
      name: 'test-bundle',
      source: '/path/to/bundle',
      bundleHash: 'abc123',
      kind: 'bundle'
    },
    agents: [
      {
        id: 'test-developer',
        displayName: 'developer',
        role: '',               // [AI] 비어있음
        model: 'sonnet',
        modelSource: 'static',
        tools: ['Bash', 'Read'],
        reads: [],              // [AI] 비어있음
        writes: []              // [AI] 비어있음
      }
    ],
    levels: [],
    triage: { questions: [], rules: [] },
    artifacts: [],
    controlFlow: { gates: [], hooks: [], parallelGroups: [], loops: [] },
    warnings: [],
    provenance: { 'meta.name': 'static', 'agents[0].model': 'static' }
  }

  it('비어있지 않은 문자열 반환', () => {
    const prompt = buildNormalizeUserPrompt(minimalSkeleton, '번들 원문')
    expect(prompt.length).toBeGreaterThan(50)
  })

  it('스켈레톤 JSON 이 포함된다', () => {
    const prompt = buildNormalizeUserPrompt(minimalSkeleton, '번들 원문')
    expect(prompt).toContain('test-bundle')
    expect(prompt).toContain('abc123')
  })

  it('rawBundleText 가 포함된다', () => {
    const bundleText = '## SKILL.md 내용\n역할: 개발자\n도구: Bash'
    const prompt = buildNormalizeUserPrompt(minimalSkeleton, bundleText)
    expect(prompt).toContain('SKILL.md 내용')
    expect(prompt).toContain('역할: 개발자')
  })

  it('[S] 필드 건드리지 말 것 지시 포함', () => {
    const prompt = buildNormalizeUserPrompt(minimalSkeleton, '')
    expect(prompt).toMatch(/건드리지 말|[S]\s*필드|이미 채워/)
  })

  it('비어있는 [AI] 필드만 채우라 지시 포함', () => {
    const prompt = buildNormalizeUserPrompt(minimalSkeleton, '')
    expect(prompt).toMatch(/비어있|undefined|AI.*필드/)
  })

  it('provenance 맵 기록 요청 포함', () => {
    const prompt = buildNormalizeUserPrompt(minimalSkeleton, '')
    expect(prompt).toContain('provenance')
  })

  it('스켈레톤이 비어있어도 오류 없이 동작', () => {
    expect(() => buildNormalizeUserPrompt({}, '원문')).not.toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildEstimateSystemPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('buildEstimateSystemPrompt', () => {
  it('비어있지 않은 문자열 반환', () => {
    const prompt = buildEstimateSystemPrompt()
    expect(prompt.length).toBeGreaterThan(50)
  })

  it('JSON only 강제 포함', () => {
    const prompt = buildEstimateSystemPrompt()
    expect(prompt).toMatch(/JSON\s*만|순수\s*JSON/)
  })

  it('Q 코드 노출 금지 지시 포함', () => {
    const prompt = buildEstimateSystemPrompt()
    expect(prompt).toMatch(/Q\s*코드.*노출.*금지|노출하지 말|Q1.*금지/)
  })

  it('출력 형식(level/answers/rationale) 포함', () => {
    const prompt = buildEstimateSystemPrompt()
    expect(prompt).toContain('level')
    expect(prompt).toContain('answers')
    expect(prompt).toContain('rationale')
  })

  it('L0~L3 레벨 값 포함', () => {
    const prompt = buildEstimateSystemPrompt()
    expect(prompt).toContain('L0')
    expect(prompt).toContain('L3')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildEstimateUserPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('buildEstimateUserPrompt', () => {
  const fullTriage: HarnessTriage = {
    questions: [
      { id: 'Q1', text: '보안 요구사항이 있습니까?', meaning: '보안 필요 여부' },
      { id: 'Q2', text: '아키텍처 변경이 포함됩니까?', meaning: '구조 변경 범위' }
    ],
    rules: [
      { when: 'Q1=Yes AND Q2=Yes', then: 'L3' },
      { when: 'Q1=No AND Q2=No', then: 'L0' }
    ],
    securityOverride: 'Q1=Yes 이면 L3 이상 강제'
  }

  const emptyTriage: HarnessTriage = {
    questions: [],
    rules: []
  }

  it('비어있지 않은 문자열 반환', () => {
    const prompt = buildEstimateUserPrompt('OAuth 도입', fullTriage)
    expect(prompt.length).toBeGreaterThan(50)
  })

  it('태스크 텍스트가 포함된다', () => {
    const prompt = buildEstimateUserPrompt('OAuth 2.0 도입 태스크', fullTriage)
    expect(prompt).toContain('OAuth 2.0 도입 태스크')
  })

  it('triage 질문이 포함된다', () => {
    const prompt = buildEstimateUserPrompt('태스크', fullTriage)
    expect(prompt).toContain('보안 요구사항이 있습니까?')
    expect(prompt).toContain('아키텍처 변경이 포함됩니까?')
  })

  it('판정 규칙이 포함된다', () => {
    const prompt = buildEstimateUserPrompt('태스크', fullTriage)
    expect(prompt).toContain('L3')
    expect(prompt).toContain('L0')
  })

  it('securityOverride 가 포함된다', () => {
    const prompt = buildEstimateUserPrompt('태스크', fullTriage)
    expect(prompt).toContain('Q1=Yes 이면 L3 이상 강제')
  })

  it('질문/규칙 없는 triage 도 오류 없이 동작', () => {
    expect(() => buildEstimateUserPrompt('태스크', emptyTriage)).not.toThrow()
    const prompt = buildEstimateUserPrompt('태스크', emptyTriage)
    expect(prompt).toContain('태스크')
  })

  it('securityOverride 없으면 보안 오버라이드 섹션 미포함', () => {
    const prompt = buildEstimateUserPrompt('태스크', emptyTriage)
    expect(prompt).not.toContain('보안 오버라이드 조건')
  })

  it('Q 코드 노출 금지 지시가 답변 요청에 있다', () => {
    const prompt = buildEstimateUserPrompt('태스크', fullTriage)
    expect(prompt).toMatch(/Q\s*코드.*금지|Q코드.*노출/)
  })
})
