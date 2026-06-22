/**
 * skillsUtils — 순수함수 단위 테스트
 */

import { describe, it, expect } from 'vitest'
import {
  buildRationalizationRows,
  buildBlockUsageMap,
  categorizeTools,
  modelToChipTone,
  phaseClassLabel,
  collectAllSignals,
  filterWarnings
} from '../views/skillsUtils'
import type { HarnessAgent, HarnessModel } from '@shared/types/harness'

// ─── 테스트 픽스처 ───────────────────────────────────────────────

const makeAgent = (overrides: Partial<HarnessAgent> = {}): HarnessAgent => ({
  id: 'test-agent',
  displayName: 'test-agent',
  role: '테스트 역할',
  model: 'sonnet',
  modelSource: 'static',
  tools: [],
  reads: [],
  writes: [],
  ...overrides
})

// ─── buildRationalizationRows ────────────────────────────────────

describe('buildRationalizationRows', () => {
  it('riskNote 가 있는 에이전트만 포함한다', () => {
    const agents: HarnessAgent[] = [
      makeAgent({ id: 'a', displayName: 'a', riskNote: '위험 A' }),
      makeAgent({ id: 'b', displayName: 'b', riskNote: undefined }),
      makeAgent({ id: 'c', displayName: 'c', riskNote: '위험 C' })
    ]
    const rows = buildRationalizationRows(agents)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.agentId)).toContain('a')
    expect(rows.map((r) => r.agentId)).toContain('c')
  })

  it('빈 배열 입력 시 빈 배열 반환', () => {
    expect(buildRationalizationRows([])).toEqual([])
  })

  it('riskNote 가 있는 에이전트가 없으면 빈 배열 반환', () => {
    const agents = [makeAgent({ riskNote: undefined })]
    expect(buildRationalizationRows(agents)).toEqual([])
  })

  it('pattern 필드에 riskNote 값이 담긴다', () => {
    const agents = [makeAgent({ riskNote: '과도한 파일 수정' })]
    const rows = buildRationalizationRows(agents)
    expect(rows[0].pattern).toBe('과도한 파일 수정')
  })

  it('phaseClass 알파벳 순으로 정렬한다', () => {
    const agents: HarnessAgent[] = [
      makeAgent({ id: 'z', displayName: 'z', riskNote: '위험', phaseClass: 'qa' }),
      makeAgent({ id: 'a', displayName: 'a', riskNote: '위험', phaseClass: 'analyst' })
    ]
    const rows = buildRationalizationRows(agents)
    expect(rows[0].agentId).toBe('a')
    expect(rows[1].agentId).toBe('z')
  })
})

// ─── buildBlockUsageMap ──────────────────────────────────────────

describe('buildBlockUsageMap', () => {
  it('writes 에 block 포함된 경로를 뽑는다', () => {
    const agents = [
      makeAgent({ displayName: 'dev', writes: ['blocks/pipeline.sh'], reads: [] })
    ]
    const result = buildBlockUsageMap(agents)
    expect(result).toHaveLength(1)
    expect(result[0].blockPath).toBe('blocks/pipeline.sh')
    expect(result[0].usedBy).toContain('dev')
  })

  it('reads 에 block 포함된 경로도 포함한다', () => {
    const agents = [
      makeAgent({ displayName: 'qa', writes: [], reads: ['_blocks/check.sh'] })
    ]
    const result = buildBlockUsageMap(agents)
    expect(result).toHaveLength(1)
    expect(result[0].usedBy).toContain('qa')
  })

  it('같은 블록을 여러 에이전트가 사용하면 모두 포함', () => {
    const agents = [
      makeAgent({ id: 'a', displayName: 'dev', writes: ['blocks/x.sh'], reads: [] }),
      makeAgent({ id: 'b', displayName: 'qa', writes: ['blocks/x.sh'], reads: [] })
    ]
    const result = buildBlockUsageMap(agents)
    expect(result[0].usedBy).toHaveLength(2)
  })

  it('block 없으면 빈 배열 반환', () => {
    const agents = [makeAgent({ writes: ['src/main.ts'], reads: ['README.md'] })]
    expect(buildBlockUsageMap(agents)).toEqual([])
  })
})

// ─── categorizeTools ─────────────────────────────────────────────

describe('categorizeTools', () => {
  it('mcp__ 접두어 → mcp 카테고리', () => {
    const result = categorizeTools(['mcp__x__ask_codex'])
    expect(result[0].category).toBe('mcp')
  })

  it('Bash 계열 → bash 카테고리', () => {
    const result = categorizeTools(['Bash', 'Execute', 'RunShell'])
    expect(result.every((t) => t.category === 'bash')).toBe(true)
  })

  it('Read/Write/Edit → file 카테고리', () => {
    const result = categorizeTools(['Read', 'Write', 'Edit', 'CreateFile'])
    expect(result.every((t) => t.category === 'file')).toBe(true)
  })

  it('그 외 → other 카테고리', () => {
    const result = categorizeTools(['WebSearch', 'CustomTool'])
    expect(result.every((t) => t.category === 'other')).toBe(true)
  })

  it('빈 배열 입력 시 빈 배열 반환', () => {
    expect(categorizeTools([])).toEqual([])
  })
})

// ─── modelToChipTone ─────────────────────────────────────────────

describe('modelToChipTone', () => {
  it('haiku → neutral', () => expect(modelToChipTone('haiku')).toBe('neutral'))
  it('sonnet → blue', () => expect(modelToChipTone('sonnet')).toBe('blue'))
  it('opus → orange', () => expect(modelToChipTone('opus')).toBe('orange'))
  it('unknown → neutral', () => expect(modelToChipTone('unknown')).toBe('neutral'))
})

// ─── phaseClassLabel ─────────────────────────────────────────────

describe('phaseClassLabel', () => {
  it('알려진 phaseClass 는 한국어로 반환', () => {
    expect(phaseClassLabel('dev')).toBe('개발자')
    expect(phaseClassLabel('qa')).toBe('QA')
    expect(phaseClassLabel('architect')).toBe('아키텍트')
  })

  it('undefined 입력 시 기타 반환', () => {
    expect(phaseClassLabel(undefined)).toBe('기타')
  })

  it('알 수 없는 값은 기타 반환', () => {
    expect(phaseClassLabel('unknown-phase')).toBe('기타')
  })
})

// ─── collectAllSignals ───────────────────────────────────────────

describe('collectAllSignals', () => {
  it('모든 에이전트의 signals 를 중복 없이 합친다', () => {
    const agents: HarnessAgent[] = [
      makeAgent({ signals: ['IMPL_COMPLETE', 'BLOCKED'] }),
      makeAgent({ signals: ['BLOCKED', 'ESCALATE'] })
    ]
    const result = collectAllSignals(agents)
    expect(result).toContain('IMPL_COMPLETE')
    expect(result).toContain('BLOCKED')
    expect(result).toContain('ESCALATE')
    // 중복 없음
    expect(result.filter((s) => s === 'BLOCKED')).toHaveLength(1)
  })

  it('signals 없는 에이전트 포함해도 빈 배열 반환 안 함', () => {
    const agents = [
      makeAgent({ signals: ['A'] }),
      makeAgent({ signals: undefined })
    ]
    expect(collectAllSignals(agents)).toEqual(['A'])
  })

  it('빈 배열 입력 시 빈 배열 반환', () => {
    expect(collectAllSignals([])).toEqual([])
  })
})

// ─── filterWarnings ──────────────────────────────────────────────

describe('filterWarnings', () => {
  const mockModel = {
    warnings: [
      '체인 추출 실패: triage.md 없음',
      'AI 정규화 부분 실패: levels[1]',
      '체인 추출 실패: L2'
    ]
  } as unknown as HarnessModel

  it('prefix 없으면 전체 반환', () => {
    expect(filterWarnings(mockModel)).toHaveLength(3)
  })

  it('prefix 로 필터링', () => {
    const result = filterWarnings(mockModel, '체인 추출')
    expect(result).toHaveLength(2)
    expect(result.every((w) => w.startsWith('체인 추출'))).toBe(true)
  })

  it('매칭 없으면 빈 배열', () => {
    expect(filterWarnings(mockModel, '없는 prefix')).toEqual([])
  })
})
