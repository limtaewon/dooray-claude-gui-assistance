/**
 * scoreUtils — 순수함수 단위 테스트
 *
 * score undefined 시 분기 포함.
 */

import { describe, it, expect } from 'vitest'
import {
  buildRadarData,
  scoreToGrade,
  findWeakestAxis,
  axisLabel,
  AXIS_LABELS
} from '../views/scoreUtils'
import type { HarnessScore, HarnessScoreAxis } from '@shared/types/harness'

// ─── 테스트 픽스처 ───────────────────────────────────────────────

const makeAxis = (overrides: Partial<HarnessScoreAxis> = {}): HarnessScoreAxis => ({
  key: 'enforcement',
  value: 3,
  max: 5,
  ...overrides
})

const makeScore = (overrides: Partial<HarnessScore> = {}): HarnessScore => ({
  axes: [
    makeAxis({ key: 'enforcement', value: 4, max: 5 }),
    makeAxis({ key: 'controlFlow', value: 3, max: 5 }),
    makeAxis({ key: 'state', value: 2, max: 5 }),
    makeAxis({ key: 'blockingGate', value: 5, max: 5 }),
    makeAxis({ key: 'feedbackLoop', value: 1, max: 5 }),
    makeAxis({ key: 'observability', value: 3, max: 5 })
  ],
  total: 18,
  ...overrides
})

// ─── axisLabel ───────────────────────────────────────────────────

describe('axisLabel', () => {
  it('알려진 키는 한국어로 반환', () => {
    expect(axisLabel('enforcement')).toBe('강제력')
    expect(axisLabel('observability')).toBe('관측가능성')
    expect(axisLabel('feedbackLoop')).toBe('피드백루프')
  })

  it('모든 AXIS_LABELS 키가 한국어 레이블 가짐', () => {
    for (const [, label] of Object.entries(AXIS_LABELS)) {
      expect(label).toBeTruthy()
      expect(label.length).toBeGreaterThan(0)
    }
  })

  it('알 수 없는 키는 원본 key 반환', () => {
    expect(axisLabel('unknown-key')).toBe('unknown-key')
  })
})

// ─── buildRadarData ──────────────────────────────────────────────

describe('buildRadarData', () => {
  it('value 를 0~100 으로 정규화한다', () => {
    const axes = [makeAxis({ value: 3, max: 5 })]
    const data = buildRadarData(axes)
    expect(data[0].value).toBe(60) // 3/5 * 100
  })

  it('max=0 이면 value=0 처리', () => {
    const axes = [makeAxis({ value: 0, max: 0 })]
    const data = buildRadarData(axes)
    expect(data[0].value).toBe(0)
  })

  it('raw / max 를 보존한다', () => {
    const axes = [makeAxis({ value: 4, max: 5 })]
    const data = buildRadarData(axes)
    expect(data[0].raw).toBe(4)
    expect(data[0].max).toBe(5)
  })

  it('axis 레이블을 한국어로 변환한다', () => {
    const axes = [makeAxis({ key: 'enforcement' })]
    const data = buildRadarData(axes)
    expect(data[0].axis).toBe('강제력')
  })

  it('value 가 max 를 넘어도 100 으로 클램핑', () => {
    const axes = [makeAxis({ value: 6, max: 5 })]
    const data = buildRadarData(axes)
    expect(data[0].value).toBeLessThanOrEqual(100)
  })

  it('빈 배열 → 빈 배열', () => {
    expect(buildRadarData([])).toEqual([])
  })
})

// ─── scoreToGrade ────────────────────────────────────────────────

describe('scoreToGrade', () => {
  it('80% 이상 → S 등급', () => {
    // total=24, maxTotal=30 → 80%
    const score = makeScore({
      axes: [
        makeAxis({ key: 'a', value: 24, max: 30 })
      ],
      total: 24
    })
    const result = scoreToGrade(score)
    expect(result.grade).toBe('S')
    expect(result.percent).toBeGreaterThanOrEqual(80)
  })

  it('60% 이상 80% 미만 → A 등급', () => {
    const score = makeScore({
      axes: [makeAxis({ key: 'a', value: 18, max: 30 })],
      total: 18
    })
    const result = scoreToGrade(score)
    expect(result.grade).toBe('A')
  })

  it('40% 이상 60% 미만 → B 등급', () => {
    const score = makeScore({
      axes: [makeAxis({ key: 'a', value: 12, max: 30 })],
      total: 12
    })
    const result = scoreToGrade(score)
    expect(result.grade).toBe('B')
  })

  it('40% 미만 → C 등급', () => {
    const score = makeScore({
      axes: [makeAxis({ key: 'a', value: 6, max: 30 })],
      total: 6
    })
    const result = scoreToGrade(score)
    expect(result.grade).toBe('C')
  })

  it('axes 가 비어있어도 크래시 안 함 (totalMax=0)', () => {
    const score = makeScore({ axes: [], total: 0 })
    const result = scoreToGrade(score)
    expect(result.percent).toBe(0)
  })

  it('각 등급에 tone 이 있다', () => {
    const validTones = ['emerald', 'blue', 'yellow', 'orange']
    const grades = ['S', 'A', 'B', 'C'] as const
    const percents = [90, 70, 50, 20]
    grades.forEach((_, i) => {
      const score = makeScore({
        axes: [makeAxis({ key: 'a', value: percents[i], max: 100 })],
        total: percents[i]
      })
      const result = scoreToGrade(score)
      expect(validTones).toContain(result.tone)
    })
  })
})

// ─── findWeakestAxis ─────────────────────────────────────────────

describe('findWeakestAxis', () => {
  it('정규화 점수가 가장 낮은 축을 반환', () => {
    const axes = [
      makeAxis({ key: 'high', value: 4, max: 5 }),      // 80%
      makeAxis({ key: 'low', value: 1, max: 5 }),         // 20%
      makeAxis({ key: 'mid', value: 3, max: 5 })          // 60%
    ]
    const weakest = findWeakestAxis(axes)
    expect(weakest?.key).toBe('low')
  })

  it('빈 배열 → null', () => {
    expect(findWeakestAxis([])).toBeNull()
  })

  it('단일 축이면 그것을 반환', () => {
    const axes = [makeAxis({ key: 'only', value: 3, max: 5 })]
    expect(findWeakestAxis(axes)?.key).toBe('only')
  })

  it('max=0 인 축은 0% 로 계산 (크래시 없음)', () => {
    const axes = [
      makeAxis({ key: 'normal', value: 3, max: 5 }),
      makeAxis({ key: 'zero-max', value: 0, max: 0 })
    ]
    const weakest = findWeakestAxis(axes)
    // zero-max 는 0%로 가장 약함
    expect(weakest?.key).toBe('zero-max')
  })
})
