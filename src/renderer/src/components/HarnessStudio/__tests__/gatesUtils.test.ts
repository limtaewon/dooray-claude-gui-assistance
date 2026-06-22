/**
 * gatesUtils — 순수함수 단위 테스트
 */

import { describe, it, expect } from 'vitest'
import {
  buildConstraintLayers,
  partitionGates,
  groupRuleCodes,
  groupStateMachineByFrom,
  hookEventTone
} from '../views/gatesUtils'
import type { HarnessControlFlow, HarnessGate } from '@shared/types/harness'

// ─── 테스트 픽스처 ───────────────────────────────────────────────

const emptyControlFlow: HarnessControlFlow = {
  gates: [],
  hooks: [],
  parallelGroups: [],
  loops: []
}

const makeGate = (overrides: Partial<HarnessGate> = {}): HarnessGate => ({
  phase: 'dev',
  ruleCodes: [],
  blocking: false,
  ...overrides
})

// ─── buildConstraintLayers ───────────────────────────────────────

describe('buildConstraintLayers', () => {
  it('4개 레이어를 반환한다', () => {
    const layers = buildConstraintLayers(emptyControlFlow)
    expect(layers).toHaveLength(4)
    expect(layers.map((l) => l.key)).toEqual(['gate', 'hook', 'signal', 'loop'])
  })

  it('gates 가 있으면 gate 레이어 hasData=true', () => {
    const cf: HarnessControlFlow = {
      ...emptyControlFlow,
      gates: [makeGate()]
    }
    const layers = buildConstraintLayers(cf)
    const gateLayer = layers.find((l) => l.key === 'gate')!
    expect(gateLayer.hasData).toBe(true)
    expect(gateLayer.count).toBe(1)
  })

  it('gates/hooks 는 runtimeEnforced=true', () => {
    const layers = buildConstraintLayers(emptyControlFlow)
    expect(layers.find((l) => l.key === 'gate')!.runtimeEnforced).toBe(true)
    expect(layers.find((l) => l.key === 'hook')!.runtimeEnforced).toBe(true)
  })

  it('signal/loop 은 runtimeEnforced=false', () => {
    const layers = buildConstraintLayers(emptyControlFlow)
    expect(layers.find((l) => l.key === 'signal')!.runtimeEnforced).toBe(false)
    expect(layers.find((l) => l.key === 'loop')!.runtimeEnforced).toBe(false)
  })

  it('signalEnum 이 있으면 signal count 에 반영', () => {
    const cf: HarnessControlFlow = {
      ...emptyControlFlow,
      signalEnum: {
        dev: ['IMPL_COMPLETE', 'BLOCKED'],
        qa: ['QA_PASS']
      }
    }
    const layers = buildConstraintLayers(cf)
    const signalLayer = layers.find((l) => l.key === 'signal')!
    expect(signalLayer.count).toBe(3)
    expect(signalLayer.hasData).toBe(true)
  })
})

// ─── partitionGates ──────────────────────────────────────────────

describe('partitionGates', () => {
  it('blocking / non-blocking 분리', () => {
    const gates: HarnessGate[] = [
      makeGate({ phase: 'dev', blocking: true }),
      makeGate({ phase: 'qa', blocking: false }),
      makeGate({ phase: 'release', blocking: true })
    ]
    const { blocking, nonBlocking } = partitionGates(gates)
    expect(blocking).toHaveLength(2)
    expect(nonBlocking).toHaveLength(1)
  })

  it('빈 배열 입력 시 모두 빈 배열', () => {
    const { blocking, nonBlocking } = partitionGates([])
    expect(blocking).toEqual([])
    expect(nonBlocking).toEqual([])
  })
})

// ─── groupRuleCodes ──────────────────────────────────────────────

describe('groupRuleCodes', () => {
  it('R5xx 계열 코드를 R-series 그룹으로 분류', () => {
    const groups = groupRuleCodes(['R501', 'R502', 'R601'])
    const rSeries = groups.find((g) => g.prefix === 'R-series')!
    expect(rSeries.codes).toContain('R501')
    expect(rSeries.codes).toContain('R601')
  })

  it('NEON-G 계열 코드를 NEON-G 그룹으로 분류', () => {
    const groups = groupRuleCodes(['NEON-G01', 'NEON-G10'])
    const neon = groups.find((g) => g.prefix === 'NEON-G')!
    expect(neon.codes).toContain('NEON-G01')
  })

  it('그 외 코드는 Other 그룹으로 분류', () => {
    const groups = groupRuleCodes(['AOP01', 'LYR01'])
    const other = groups.find((g) => g.prefix === 'Other')!
    expect(other.codes).toHaveLength(2)
  })

  it('혼합 코드도 올바르게 분류', () => {
    const groups = groupRuleCodes(['R501', 'NEON-G01', 'AOP01'])
    expect(groups).toHaveLength(3)
  })

  it('빈 배열 → 빈 배열', () => {
    expect(groupRuleCodes([])).toEqual([])
  })
})

// ─── groupStateMachineByFrom ─────────────────────────────────────

describe('groupStateMachineByFrom', () => {
  it('stateMachine 없으면 빈 배열', () => {
    expect(groupStateMachineByFrom(undefined)).toEqual([])
  })

  it('transitions 를 from 기준으로 그루핑', () => {
    const sm = {
      transitions: [
        { from: 'dev', on: 'IMPL_COMPLETE', to: 'qa' },
        { from: 'dev', on: 'BLOCKED', to: 'sm' },
        { from: 'qa', on: 'QA_PASS', to: 'release' }
      ]
    }
    const groups = groupStateMachineByFrom(sm)
    expect(groups).toHaveLength(2)
    const devGroup = groups.find((g) => g.from === 'dev')!
    expect(devGroup.transitions).toHaveLength(2)
    const qaGroup = groups.find((g) => g.from === 'qa')!
    expect(qaGroup.transitions).toHaveLength(1)
  })

  it('알파벳 순 정렬', () => {
    const sm = {
      transitions: [
        { from: 'z-state', on: 'X', to: 'a-state' },
        { from: 'a-state', on: 'Y', to: 'z-state' }
      ]
    }
    const groups = groupStateMachineByFrom(sm)
    expect(groups[0].from).toBe('a-state')
    expect(groups[1].from).toBe('z-state')
  })
})

// ─── hookEventTone ───────────────────────────────────────────────

describe('hookEventTone', () => {
  it('SubagentStop → orange', () => {
    expect(hookEventTone('SubagentStop')).toBe('orange')
    expect(hookEventTone('Stop')).toBe('orange')
  })

  it('PreToolUse → blue', () => {
    expect(hookEventTone('PreToolUse')).toBe('blue')
    expect(hookEventTone('pre-tool-use')).toBe('blue')
  })

  it('undefined → neutral', () => {
    expect(hookEventTone(undefined)).toBe('neutral')
  })

  it('기타 이벤트 → neutral', () => {
    expect(hookEventTone('PostToolUse')).toBe('neutral')
  })
})
