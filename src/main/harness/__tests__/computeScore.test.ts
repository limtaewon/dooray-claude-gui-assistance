/**
 * computeScore 테스트 — 구조 기반 결정론 6축 점수.
 *
 * 핵심: 동일 입력 → 동일 출력(결정론), 신호 증가 → 점수 증가(단조), 0~10 클램프.
 */

import { describe, it, expect } from 'vitest'
import { computeHarnessScore } from '../computeScore'
import type { ScorableModel } from '../computeScore'

function makeModel(overrides: Partial<ScorableModel> = {}): ScorableModel {
  return {
    agents: [],
    levels: [],
    artifacts: [],
    controlFlow: { gates: [], hooks: [], parallelGroups: [], loops: [] },
    ...overrides
  }
}

describe('computeHarnessScore', () => {
  it('동일 입력은 동일 결과(결정론)', () => {
    const m = makeModel({
      controlFlow: {
        gates: [{ phase: 'dev', ruleCodes: ['R1'], blocking: true }],
        hooks: [{ file: 'h.sh' }],
        loops: ['QA RETURN'],
        parallelGroups: []
      }
    })
    expect(computeHarnessScore(m)).toEqual(computeHarnessScore(m))
  })

  it('6축 + total + rationale 을 반환', () => {
    const s = computeHarnessScore(makeModel())
    expect(s.axes.map((a) => a.key)).toEqual([
      'enforcement', 'controlFlow', 'stateManagement', 'blockingGates', 'feedbackLoops', 'observability'
    ])
    expect(typeof s.total).toBe('number')
    expect(s.rationale).toContain('결정론')
    s.axes.forEach((a) => {
      expect(a.value).toBeGreaterThanOrEqual(0)
      expect(a.value).toBeLessThanOrEqual(10)
      expect(a.max).toBe(10)
      expect(a.note).toBeTruthy()
    })
  })

  it('빈 모델은 대부분 0점, total 0', () => {
    const s = computeHarnessScore(makeModel())
    expect(s.total).toBe(0)
  })

  it('차단 게이트가 많을수록 blockingGates 점수가 오른다(단조)', () => {
    const axisVal = (m: ScorableModel): number =>
      computeHarnessScore(m).axes.find((a) => a.key === 'blockingGates')!.value
    const few = makeModel({ controlFlow: { gates: [{ phase: 'a', ruleCodes: [], blocking: true }], hooks: [], parallelGroups: [], loops: [] } })
    const many = makeModel({
      controlFlow: {
        gates: [1, 2, 3, 4].map((i) => ({ phase: `p${i}`, ruleCodes: [], blocking: true })),
        hooks: [], parallelGroups: [], loops: []
      }
    })
    expect(axisVal(many)).toBeGreaterThan(axisVal(few))
  })

  it('loops 가 많을수록 feedbackLoops 점수가 오른다', () => {
    const axisVal = (m: ScorableModel): number =>
      computeHarnessScore(m).axes.find((a) => a.key === 'feedbackLoops')!.value
    const none = makeModel()
    const some = makeModel({ controlFlow: { gates: [], hooks: [], parallelGroups: [], loops: ['l1', 'l2'] } })
    expect(axisVal(some)).toBeGreaterThan(axisVal(none))
  })

  it('상태기계 존재 시 stateManagement 점수가 오른다', () => {
    const axisVal = (m: ScorableModel): number =>
      computeHarnessScore(m).axes.find((a) => a.key === 'stateManagement')!.value
    const withSm = makeModel({
      controlFlow: { gates: [], hooks: [], parallelGroups: [], loops: [], stateMachine: { transitions: [{ from: 'a', on: 'x', to: 'b' }] } }
    })
    expect(axisVal(withSm)).toBeGreaterThan(axisVal(makeModel()))
  })

  it('점수는 10 을 넘지 않는다(클램프)', () => {
    const huge = makeModel({
      controlFlow: {
        gates: Array.from({ length: 20 }, (_, i) => ({ phase: `p${i}`, ruleCodes: [], blocking: true })),
        hooks: Array.from({ length: 20 }, (_, i) => ({ file: `h${i}.sh` })),
        parallelGroups: ['a', 'b'],
        loops: Array.from({ length: 20 }, (_, i) => `l${i}`)
      }
    })
    computeHarnessScore(huge).axes.forEach((a) => expect(a.value).toBeLessThanOrEqual(10))
  })
})
