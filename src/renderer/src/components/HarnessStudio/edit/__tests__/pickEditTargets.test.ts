/**
 * pickEditTargets.test.ts — NL 명령 → AI 편집 대상 추정 테스트
 *
 * 검증:
 * 1. 에이전트명 매칭 (한국어/영어, displayName/id 모두)
 * 2. 게이트 페이즈 매칭 (fileTree 포함 오버로드)
 * 3. 범용 model/tools 키워드 → 모든 에이전트 파일
 * 4. 모호 명령 → 빈 배열 폴백
 * 5. SourceMap 없을 때 빈 배열 반환
 * 6. 에이전트 id 의 세그먼트 매칭 (reined-bmad-developer 에서 developer 매칭)
 * 7. 중복 제거
 */

import { describe, it, expect } from 'vitest'
import { pickEditTargets, pickEditTargetsWithFileTree } from '../pickEditTargets'
import type { HarnessModel } from '@shared/types/harness'
import type { AgentSourceMap } from '@shared/types/harness-edit'

// ─────────────────────────────────────────────
// 픽스처
// ─────────────────────────────────────────────

function makeModel(): HarnessModel {
  return {
    schemaVersion: 1,
    meta: {
      name: 'reined-fixture',
      source: '/path/to/reined-fixture',
      bundleHash: 'abc',
      kind: 'bundle',
    },
    agents: [
      {
        id: 'reined-fixture-developer',
        displayName: 'developer',
        role: '구현자',
        model: 'sonnet',
        modelSource: 'static',
        tools: ['Read', 'Edit'],
        reads: [],
        writes: [],
      },
      {
        id: 'reined-fixture-qa',
        displayName: 'qa',
        role: 'QA',
        model: 'haiku',
        modelSource: 'static',
        tools: ['Read', 'Glob'],
        reads: [],
        writes: [],
      },
      {
        id: 'reined-fixture-security',
        displayName: 'security',
        role: '보안 검토자',
        model: 'opus',
        modelSource: 'static',
        tools: ['Read'],
        reads: [],
        writes: [],
      },
    ],
    levels: [],
    triage: { questions: [], rules: [] },
    artifacts: [],
    controlFlow: {
      gates: [
        { phase: 'dev', ruleCodes: ['R501'], blocking: true },
        { phase: 'qa', ruleCodes: ['R520'], blocking: true },
      ],
      hooks: [],
      parallelGroups: [],
      loops: [],
    },
    warnings: [],
    provenance: {},
  }
}

function makeSourceMap(): AgentSourceMap {
  return {
    'reined-fixture-developer': {
      nameFile: '_agents/reined-fixture-developer.md',
      modelFile: '_agents/reined-fixture-developer.md',
      toolsFile: '_agents/reined-fixture-developer.md',
    },
    'reined-fixture-qa': {
      nameFile: '_agents/reined-fixture-qa.md',
      modelFile: '_agents/reined-fixture-qa.md',
      toolsFile: '_agents/reined-fixture-qa.md',
    },
    'reined-fixture-security': {
      nameFile: '_agents/reined-fixture-security.md',
      modelFile: '_agents/reined-fixture-security.md',
      toolsFile: undefined,
    },
  }
}

const FILE_TREE = [
  '_agents/reined-fixture-developer.md',
  '_agents/reined-fixture-qa.md',
  '_agents/reined-fixture-security.md',
  '_core/concepts.md',
  '_hooks/gate.sh',
  '_hooks/neon-bmad-gate-check.sh',
]

// ─────────────────────────────────────────────
// 에이전트명 매칭
// ─────────────────────────────────────────────

describe('pickEditTargets — 에이전트명 매칭', () => {
  const model = makeModel()
  const sourceMap = makeSourceMap()

  it('displayName "developer" 포함 명령 → developer 파일 반환', () => {
    const result = pickEditTargets('developer 에이전트의 모델을 opus 로 변경해줘', model, sourceMap)
    expect(result).toContain('_agents/reined-fixture-developer.md')
    // qa 파일은 포함되지 않음
    expect(result).not.toContain('_agents/reined-fixture-qa.md')
  })

  it('displayName "qa" 포함 명령 → qa 파일 반환', () => {
    const result = pickEditTargets('qa 에이전트 도구 목록을 수정해줘', model, sourceMap)
    expect(result).toContain('_agents/reined-fixture-qa.md')
    expect(result).not.toContain('_agents/reined-fixture-developer.md')
  })

  it('id 전체 포함 명령 → 해당 에이전트 파일 반환', () => {
    const result = pickEditTargets('reined-fixture-security 의 model 을 sonnet 으로', model, sourceMap)
    expect(result).toContain('_agents/reined-fixture-security.md')
  })

  it('id 세그먼트 "security" 매칭 → security 파일 반환', () => {
    const result = pickEditTargets('보안검토자(security) 에이전트를 opus 모델로 변경', model, sourceMap)
    expect(result).toContain('_agents/reined-fixture-security.md')
  })

  it('결과는 중복 없이 반환된다 (nameFile=modelFile=toolsFile 동일해도)', () => {
    const result = pickEditTargets('developer 를 opus 로', model, sourceMap)
    const unique = new Set(result)
    expect(unique.size).toBe(result.length)
  })

  it('SourceMap 에 toolsFile=undefined 인 경우 nameFile/modelFile 만 포함', () => {
    const result = pickEditTargets('security 에이전트', model, sourceMap)
    expect(result).toContain('_agents/reined-fixture-security.md')
    // undefined 값은 포함되지 않음
    expect(result.every((r) => r !== undefined)).toBe(true)
  })
})

// ─────────────────────────────────────────────
// 게이트 페이즈 매칭 (fileTree 포함)
// ─────────────────────────────────────────────

describe('pickEditTargetsWithFileTree — 게이트 페이즈 매칭', () => {
  const model = makeModel()
  const sourceMap = makeSourceMap()

  it('"게이트" 키워드 포함 → 게이트 스크립트 파일 반환', () => {
    const result = pickEditTargetsWithFileTree(
      'dev 게이트에 새 규칙을 추가해줘',
      model,
      sourceMap,
      FILE_TREE,
    )
    expect(result.some((r) => r.includes('gate'))).toBe(true)
  })

  it('"gate" 영어 키워드도 인식한다 (에이전트명 미포함 명령)', () => {
    // 에이전트명 없는 순수 게이트 키워드
    const result = pickEditTargetsWithFileTree(
      'add a new rule to the gate script',
      model,
      sourceMap,
      FILE_TREE,
    )
    expect(result.some((r) => r.includes('gate'))).toBe(true)
  })

  it('phase 이름 "dev" 포함 명령도 게이트 파일 반환', () => {
    const result = pickEditTargetsWithFileTree('dev 페이즈 규칙 수정', model, sourceMap, FILE_TREE)
    expect(result.some((r) => r.includes('gate'))).toBe(true)
  })

  it('에이전트명이 먼저 매칭되면 게이트 파일을 반환하지 않는다', () => {
    // developer 명칭이 있으면 에이전트 파일이 우선
    const result = pickEditTargetsWithFileTree(
      'developer 에이전트 gate 규칙',
      model,
      sourceMap,
      FILE_TREE,
    )
    // developer 에이전트 파일 포함
    expect(result).toContain('_agents/reined-fixture-developer.md')
  })
})

// ─────────────────────────────────────────────
// 범용 model/tools 키워드
// ─────────────────────────────────────────────

describe('pickEditTargets — 범용 키워드', () => {
  const model = makeModel()
  const sourceMap = makeSourceMap()

  it('"모델" 키워드만 있으면 모든 에이전트 파일을 반환한다', () => {
    const result = pickEditTargets('모든 에이전트의 모델을 sonnet 으로 통일', model, sourceMap)
    expect(result).toContain('_agents/reined-fixture-developer.md')
    expect(result).toContain('_agents/reined-fixture-qa.md')
    expect(result).toContain('_agents/reined-fixture-security.md')
  })

  it('"tools" 키워드만 있으면 모든 에이전트 파일을 반환한다', () => {
    const result = pickEditTargets('tools 목록을 정리해줘', model, sourceMap)
    expect(result.length).toBeGreaterThan(0)
  })

  it('"model" 영어 키워드도 인식한다', () => {
    const result = pickEditTargets('change all agent model to haiku', model, sourceMap)
    expect(result.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────
// 모호 명령 → 빈 배열
// ─────────────────────────────────────────────

describe('pickEditTargets — 모호 명령 폴백', () => {
  const model = makeModel()

  it('에이전트/게이트/model/tools 관련 키워드가 없으면 빈 배열을 반환한다', () => {
    const result = pickEditTargets('번들 전체를 검토해줘', model, undefined)
    expect(result).toEqual([])
  })

  it('SourceMap 없이 에이전트 매칭해도 빈 배열을 반환한다', () => {
    // SourceMap 없으면 파일 경로를 모름
    const result = pickEditTargets('developer 에이전트 수정', model, undefined)
    expect(result).toEqual([])
  })

  it('빈 명령은 빈 배열을 반환한다', () => {
    const result = pickEditTargets('', model, makeSourceMap())
    expect(result).toEqual([])
  })

  it('의미없는 명령도 빈 배열을 반환한다', () => {
    const result = pickEditTargets('???', model, makeSourceMap())
    expect(result).toEqual([])
  })
})

// ─────────────────────────────────────────────
// 엣지 케이스
// ─────────────────────────────────────────────

describe('pickEditTargets — 엣지 케이스', () => {
  const model = makeModel()
  const sourceMap = makeSourceMap()

  it('에이전트가 없는 모델은 빈 배열을 반환한다', () => {
    const emptyModel: HarnessModel = {
      ...model,
      agents: [],
      controlFlow: { ...model.controlFlow, gates: [] },
    }
    const result = pickEditTargets('developer 를 변경해줘', emptyModel, sourceMap)
    expect(result).toEqual([])
  })

  it('대소문자 무관하게 매칭된다', () => {
    const result = pickEditTargets('DEVELOPER 에이전트', model, sourceMap)
    expect(result).toContain('_agents/reined-fixture-developer.md')
  })
})
