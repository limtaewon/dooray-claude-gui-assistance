/**
 * dryRunUtils — 순수함수 단위 테스트
 *
 * 커버: formatProjectPath / buildTimeline / isDoorayTaskUrl /
 *       formatGates / hasMeaningfulResult / levelTone
 */

import { describe, it, expect } from 'vitest'
import {
  formatProjectPath,
  buildTimeline,
  isDoorayTaskUrl,
  parseDoorayTaskUrl,
  formatGates,
  hasMeaningfulResult,
  levelTone,
  LEVEL_LABEL,
  formatRelativeTime,
  formatRelativeCost
} from '../views/dryRunUtils'
import type { DryRunResult } from '@shared/types/harness'

// ─────────────────────────────────────────────
// formatProjectPath
// ─────────────────────────────────────────────

describe('formatProjectPath', () => {
  it('마지막 2개 세그먼트만 표시한다', () => {
    expect(formatProjectPath('/Users/alice/projects/my-app')).toBe('projects/my-app')
  })

  it('세그먼트가 1개이면 그 이름만 반환한다', () => {
    expect(formatProjectPath('/my-app')).toBe('my-app')
  })

  it('세그먼트가 정확히 2개이면 전체를 반환한다', () => {
    expect(formatProjectPath('/projects/my-app')).toBe('projects/my-app')
  })

  it('Windows 역슬래시 경로를 처리한다', () => {
    expect(formatProjectPath('C:\\Users\\alice\\projects\\my-app')).toBe('projects/my-app')
  })

  it('빈 문자열이면 빈 문자열을 반환한다', () => {
    expect(formatProjectPath('')).toBe('')
  })

  it('루트(/)만 있으면 원본을 반환한다', () => {
    // 슬래시만 있으면 split 후 빈 배열 → 원본 반환
    expect(formatProjectPath('/')).toBe('/')
  })
})

// ─────────────────────────────────────────────
// buildTimeline
// ─────────────────────────────────────────────

describe('buildTimeline', () => {
  it('빈 highlightPath 이면 빈 배열을 반환한다', () => {
    expect(buildTimeline([], [])).toEqual([])
  })

  it('병렬 그룹 없이 순차 단계만 생성한다', () => {
    const steps = buildTimeline(['a', 'b', 'c'], [])
    expect(steps).toHaveLength(3)
    expect(steps[0]).toEqual({ step: 1, agents: ['a'], parallel: false })
    expect(steps[2]).toEqual({ step: 3, agents: ['c'], parallel: false })
  })

  it('병렬 그룹에 속한 에이전트를 하나의 단계로 묶는다', () => {
    const steps = buildTimeline(['a', 'b', 'c'], [['b', 'c']])
    // a 는 단독, b+c 는 병렬 그룹으로 하나의 단계
    expect(steps).toHaveLength(2)
    expect(steps[1]).toMatchObject({ agents: ['b', 'c'], parallel: true })
  })

  it('이미 배치된 에이전트는 중복 추가하지 않는다', () => {
    const steps = buildTimeline(['a', 'b', 'a'], [])
    expect(steps).toHaveLength(2)
  })
})

// ─────────────────────────────────────────────
// isDoorayTaskUrl
// ─────────────────────────────────────────────

describe('isDoorayTaskUrl', () => {
  it('두레이 tasks URL 을 true 로 판별한다', () => {
    expect(isDoorayTaskUrl('https://nhnent.dooray.com/project/tasks/123456789')).toBe(true)
  })

  it('두레이 URL 이 아닌 문자열은 false 를 반환한다', () => {
    expect(isDoorayTaskUrl('결제 API에 PG 연동 추가')).toBe(false)
  })

  it('앞뒤 공백을 무시한다', () => {
    expect(isDoorayTaskUrl('  https://nhnent.dooray.com/project/tasks/999  ')).toBe(true)
  })
})

// ─────────────────────────────────────────────
// formatGates
// ─────────────────────────────────────────────

describe('formatGates', () => {
  it('빈 배열이면 "없음" 을 반환한다', () => {
    expect(formatGates([])).toBe('없음')
  })

  it('게이트 목록을 → 로 연결한다', () => {
    expect(formatGates(['dev', 'qa'])).toBe('dev → qa')
  })

  it('단일 게이트는 그대로 반환한다', () => {
    expect(formatGates(['security'])).toBe('security')
  })
})

// ─────────────────────────────────────────────
// hasMeaningfulResult
// ─────────────────────────────────────────────

const makeResult = (overrides: Partial<DryRunResult> = {}): DryRunResult => ({
  level: 'L1',
  rationale: '충분한 근거',
  highlightPath: ['agent-a'],
  parallelGroups: [],
  gates: [],
  answers: [],
  estTimeRel: 2,
  estCostRel: 2,
  ...overrides
})

describe('hasMeaningfulResult', () => {
  it('level, rationale, highlightPath 모두 있으면 true', () => {
    expect(hasMeaningfulResult(makeResult())).toBe(true)
  })

  it('highlightPath 가 비어있으면 false', () => {
    expect(hasMeaningfulResult(makeResult({ highlightPath: [] }))).toBe(false)
  })

  it('rationale 이 없으면 false', () => {
    expect(hasMeaningfulResult(makeResult({ rationale: '' }))).toBe(false)
  })
})

// ─────────────────────────────────────────────
// levelTone
// ─────────────────────────────────────────────

describe('levelTone', () => {
  it('L0 → emerald', () => expect(levelTone('L0')).toBe('emerald'))
  it('L1 → blue',    () => expect(levelTone('L1')).toBe('blue'))
  it('L2 → orange',  () => expect(levelTone('L2')).toBe('orange'))
  it('L3 → red',     () => expect(levelTone('L3')).toBe('red'))
})

// ─────────────────────────────────────────────
// LEVEL_LABEL
// ─────────────────────────────────────────────

describe('LEVEL_LABEL', () => {
  it('L0 ~ L3 모두 레이블이 존재한다', () => {
    const ids = ['L0', 'L1', 'L2', 'L3'] as const
    for (const id of ids) {
      expect(LEVEL_LABEL[id]).toBeTruthy()
    }
  })
})

// ─────────────────────────────────────────────
// formatRelativeTime / formatRelativeCost
// ─────────────────────────────────────────────

describe('formatRelativeTime', () => {
  it('0 이하이면 "-" 를 반환한다', () => {
    expect(formatRelativeTime(0)).toBe('-')
  })

  it('1.0 이면 L0 기준 문자열을 반환한다', () => {
    expect(formatRelativeTime(1)).toContain('L0 기준')
  })

  it('2.5 이면 약 2.5× 를 포함한다', () => {
    expect(formatRelativeTime(2.5)).toContain('2.5')
  })
})

describe('formatRelativeCost', () => {
  it('0 이하이면 "-" 를 반환한다', () => {
    expect(formatRelativeCost(0)).toBe('-')
  })

  it('1.0 이면 L0 기준 문자열을 반환한다', () => {
    expect(formatRelativeCost(1)).toContain('L0 기준')
  })
})

describe('parseDoorayTaskUrl', () => {
  it('웹 UI URL 에서 projectId/taskId 추출', () => {
    const r = parseDoorayTaskUrl('https://nhnent.dooray.com/task/1425907308209203105/4335185821487949036?to=3533031628905444136')
    expect(r).toEqual({ projectId: '1425907308209203105', taskId: '4335185821487949036' })
  })
  it('형식 불일치는 null', () => {
    expect(parseDoorayTaskUrl('결제 API 추가')).toBeNull()
    expect(parseDoorayTaskUrl('https://nhnent.dooray.com/project/tasks/123')).toBeNull()
  })
})

describe('isDoorayTaskUrl — 웹 UI 형식', () => {
  it('/task/{pid}/{tid} 형식도 인식', () => {
    expect(isDoorayTaskUrl('https://nhnent.dooray.com/task/1425907308209203105/4335185821487949036?to=x')).toBe(true)
  })
})
