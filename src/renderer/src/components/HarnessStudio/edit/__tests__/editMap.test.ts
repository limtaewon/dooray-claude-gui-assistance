/**
 * editMap.test.ts — buildEditMap 순수 로직 테스트
 *
 * 검증:
 * 1. reined 번들 에이전트: model=[FORM] + tools=[FORM] 매핑 정확성
 * 2. neon 번들 에이전트(model 키 없음): model 은 lock 폴백 없이 nameFile 로 form 매핑
 * 3. [LOCK] 필드: agents[].id, score
 * 4. [AI] 필드: agents[].role, reads, writes 등
 * 5. [RAW] 필드: controlFlow.gates, meta.author/tagline, artifacts.template
 * 6. formEditableCount 카운터 정확성
 * 7. SourceMap 없을 때 model/tools lock 폴백
 */

import { describe, it, expect } from 'vitest'
import { buildEditMap, findEditEntry } from '../editMap'
import type { HarnessModel } from '@shared/types/harness'
import type { AgentSourceMap } from '@shared/types/harness-edit'

// ─────────────────────────────────────────────
// 픽스처 빌더
// ─────────────────────────────────────────────

/** reined-fixture 기반 최소 HarnessModel 픽스처 */
function makeReinedModel(): HarnessModel {
  return {
    schemaVersion: 1,
    meta: {
      name: 'reined-fixture',
      source: '/path/to/reined-fixture',
      bundleHash: 'abc123',
      kind: 'bundle',
      author: 'Clauday Team',
      tagline: '테스트용 reined 번들',
    },
    agents: [
      {
        id: 'reined-fixture-developer',
        displayName: 'developer',
        role: '구현자',
        model: 'sonnet',
        modelSource: 'static',
        tools: ['Read', 'Edit', 'Write'],
        reads: ['story.md'],
        writes: ['impl-log.md'],
        phaseClass: 'dev',
      },
      {
        id: 'reined-fixture-qa',
        displayName: 'qa',
        role: 'QA',
        model: 'haiku',
        modelSource: 'static',
        tools: ['Read', 'Glob', 'Grep'],
        reads: ['impl-log.md'],
        writes: ['qa-report.md'],
        phaseClass: 'qa',
        riskNote: '거짓 완료 보고',
      },
    ],
    levels: [
      {
        id: 'L1',
        name: 'Standard Feature',
        agentChain: ['reined-fixture-developer', 'reined-fixture-qa'],
        requiredArtifacts: ['story', 'impl-log'],
      },
    ],
    triage: {
      questions: [{ id: 'Q1', text: '보안 요구사항?', meaning: '보안 영향 여부' }],
      rules: [{ when: 'Q1=Yes', then: 'L3' }],
    },
    artifacts: [
      {
        id: 'impl-log',
        consumers: ['reined-fixture-qa'],
        persist: 'git',
        template: { frontmatter: ['id', 'agent'], sections: ['## 구현 요약'] },
      },
    ],
    controlFlow: {
      gates: [{ phase: 'dev', ruleCodes: ['R501'], blocking: true }],
      hooks: [],
      parallelGroups: [],
      loops: [],
    },
    score: {
      axes: [{ key: 'enforcement', value: 3, max: 5 }],
      total: 42,
    },
    warnings: [],
    provenance: {
      'agents[0].model': 'static',
      'agents[0].role': 'ai',
    },
  }
}

/** reined-fixture AgentSourceMap */
function makeReinedSourceMap(): AgentSourceMap {
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
  }
}

/** neon-fixture 기반 최소 HarnessModel 픽스처 (model 키 없음) */
function makeNeonModel(): HarnessModel {
  return {
    schemaVersion: 1,
    meta: {
      name: 'neon-fixture',
      source: '/path/to/neon-fixture',
      bundleHash: 'def456',
      kind: 'bundle',
    },
    agents: [
      {
        id: 'neon-fixture-developer',
        displayName: 'developer',
        role: 'BE/FE 구현자',
        model: 'unknown',
        modelSource: 'absent',
        tools: ['Read', 'Edit', 'Write', 'mcp__mysql__query'],
        reads: [],
        writes: [],
      },
    ],
    levels: [],
    triage: { questions: [], rules: [] },
    artifacts: [],
    controlFlow: {
      gates: [],
      hooks: [],
      parallelGroups: [],
      loops: [],
    },
    warnings: [],
    provenance: {},
  }
}

/** neon-fixture AgentSourceMap — model 키 없으므로 modelFile=undefined */
function makeNeonSourceMap(): AgentSourceMap {
  return {
    'neon-fixture-developer': {
      nameFile: 'developer/SKILL.md',
      modelFile: undefined,
      toolsFile: 'developer/SKILL.md',
    },
  }
}

// ─────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────

describe('buildEditMap — reined 번들', () => {
  const model = makeReinedModel()
  const sourceMap = makeReinedSourceMap()
  const editMap = buildEditMap(model, sourceMap)

  it('agents[0].model 은 form 모드이고 대상 파일이 _agents/reined-fixture-developer.md 이다', () => {
    const entry = findEditEntry(editMap, 'agents[0].model')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('form')
    expect(entry?.target?.relPath).toBe('_agents/reined-fixture-developer.md')
    expect(entry?.target?.locator).toBe('model')
  })

  it('agents[0].tools 는 form 모드이고 locator 가 tools 이다 (_agents/*.md)', () => {
    const entry = findEditEntry(editMap, 'agents[0].tools')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('form')
    expect(entry?.target?.locator).toBe('tools')
  })

  it('agents[0].id 는 lock 모드이다', () => {
    const entry = findEditEntry(editMap, 'agents[0].id')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('lock')
  })

  it('agents[0].role 은 ai 모드이다', () => {
    const entry = findEditEntry(editMap, 'agents[0].role')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('ai')
  })

  it('agents[0].phaseClass 는 ai 모드이다', () => {
    const entry = findEditEntry(editMap, 'agents[0].phaseClass')
    expect(entry?.mode).toBe('ai')
  })

  it('score 는 lock 모드이다', () => {
    const entry = findEditEntry(editMap, 'score')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('lock')
    expect(entry?.reason).toContain('자동 계산')
  })

  it('controlFlow.gates[phase=dev] 는 raw 모드이다', () => {
    const entry = editMap.entries.find((e) => e.fieldPath === 'controlFlow.gates[phase=dev]')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('raw')
  })

  it('artifacts[0].template 은 raw 모드이다', () => {
    const entry = editMap.entries.find((e) => e.fieldPath === 'artifacts[0].template')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('raw')
  })

  it('meta.author 는 raw 모드이다', () => {
    const entry = findEditEntry(editMap, 'meta.author')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('raw')
  })

  it('meta.tagline 는 raw 모드이다', () => {
    const entry = findEditEntry(editMap, 'meta.tagline')
    expect(entry?.mode).toBe('raw')
  })

  it('formEditableCount 는 에이전트 수 × 2 (model + tools) 이다', () => {
    // 2 에이전트 × 2 = 4 form 항목
    expect(editMap.formEditableCount).toBe(4)
  })

  it('levels[0].agentChain 은 ai 모드이다', () => {
    const entry = editMap.entries.find((e) => e.fieldPath === 'levels[0].agentChain')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('ai')
  })

  it('agents[1].riskNote 는 ai 모드이다', () => {
    const entry = findEditEntry(editMap, 'agents[1].riskNote')
    expect(entry?.mode).toBe('ai')
  })
})

describe('buildEditMap — neon 번들 (model 키 없음)', () => {
  const model = makeNeonModel()
  const sourceMap = makeNeonSourceMap()
  const editMap = buildEditMap(model, sourceMap)

  it('agents[0].model 은 form 모드 — modelFile 없으면 nameFile(developer/SKILL.md) 로 폴백', () => {
    const entry = findEditEntry(editMap, 'agents[0].model')
    expect(entry).toBeDefined()
    expect(entry?.mode).toBe('form')
    expect(entry?.target?.relPath).toBe('developer/SKILL.md')
    expect(entry?.target?.locator).toBe('model')
  })

  it('agents[0].tools 는 SKILL.md 파일이므로 allowed-tools locator 를 사용한다', () => {
    const entry = findEditEntry(editMap, 'agents[0].tools')
    expect(entry?.mode).toBe('form')
    expect(entry?.target?.locator).toBe('allowed-tools')
    expect(entry?.target?.relPath).toBe('developer/SKILL.md')
  })

  it('score 없으면 score 항목이 entries 에 포함되지 않는다', () => {
    const entry = findEditEntry(editMap, 'score')
    expect(entry).toBeUndefined()
  })
})

describe('buildEditMap — SourceMap 없을 때 lock 폴백', () => {
  const model = makeReinedModel()
  const emptySourceMap: AgentSourceMap = {}
  const editMap = buildEditMap(model, emptySourceMap)

  it('SourceMap 이 비어있으면 agents[0].model 은 lock 으로 폴백한다', () => {
    const entry = findEditEntry(editMap, 'agents[0].model')
    expect(entry?.mode).toBe('lock')
    expect(entry?.reason).toContain('파악할 수 없습니다')
  })

  it('SourceMap 이 비어있으면 agents[0].tools 도 lock 으로 폴백한다', () => {
    const entry = findEditEntry(editMap, 'agents[0].tools')
    expect(entry?.mode).toBe('lock')
  })

  it('formEditableCount 는 0 이다', () => {
    expect(editMap.formEditableCount).toBe(0)
  })
})

describe('findEditEntry', () => {
  it('없는 fieldPath 는 undefined 를 반환한다', () => {
    const editMap = buildEditMap(makeNeonModel(), makeNeonSourceMap())
    expect(findEditEntry(editMap, 'nonexistent.field')).toBeUndefined()
  })
})
