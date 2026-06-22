/**
 * Score 패널 — 순수 함수 유틸리티.
 *
 * HarnessScore 데이터를 recharts RadarChart 에 맞게 변환한다.
 * 어떤 프레임워크에도 의존하지 않아 vitest 에서 직접 테스트할 수 있다.
 */

import type { HarnessScore, HarnessScoreAxis } from '@shared/types/harness'

/** recharts RadarChart 에 전달할 단일 데이터 포인트 */
export interface RadarDataPoint {
  /** 축 레이블 (한국어) */
  axis: string
  /** 정규화된 점수 (0~100 스케일) */
  value: number
  /** 원본 점수 */
  raw: number
  /** 최대값 */
  max: number
  /** 근거 노트 */
  note?: string
}

/** 6축 키 → 한국어 레이블 매핑 */
export const AXIS_LABELS: Record<string, string> = {
  enforcement:      '강제력',
  controlFlow:      '제어흐름',
  state:            '상태',
  blockingGate:     '차단게이트',
  feedbackLoop:     '피드백루프',
  observability:    '관측가능성'
}

/**
 * 6축 키에서 한국어 레이블을 반환.
 *
 * 알 수 없는 키는 원본 key 를 그대로 반환한다.
 */
export function axisLabel(key: string): string {
  return AXIS_LABELS[key] ?? key
}

/**
 * HarnessScoreAxis 배열을 recharts 데이터 포인트 배열로 변환.
 *
 * 각 축을 0~100 으로 정규화해 다른 max 값을 가진 축도 동일 스케일로 비교 가능하게 한다.
 * max 가 0 이면 value=0 으로 처리(ZeroDivision 방지).
 */
export function buildRadarData(axes: HarnessScoreAxis[]): RadarDataPoint[] {
  return axes.map((axis) => {
    const normalizedValue = axis.max > 0 ? Math.round((axis.value / axis.max) * 100) : 0
    return {
      axis: axisLabel(axis.key),
      value: Math.min(100, Math.max(0, normalizedValue)),
      raw: axis.value,
      max: axis.max,
      note: axis.note
    }
  })
}

/**
 * score 총점을 등급 레이블로 변환.
 *
 * 총점은 각 axes 의 value 합산. max 는 axes 의 max 합산 기준.
 * 정규화 백분율로 등급 판정:
 * - 80% 이상: S (최우수)
 * - 60% 이상: A (우수)
 * - 40% 이상: B (보통)
 * - 그 외: C (개선 필요)
 */
export type ScoreGrade = 'S' | 'A' | 'B' | 'C'

export interface ScoreGradeResult {
  grade: ScoreGrade
  percent: number
  label: string
  tone: 'emerald' | 'blue' | 'yellow' | 'orange'
}

export function scoreToGrade(score: HarnessScore): ScoreGradeResult {
  const totalMax = score.axes.reduce((acc, a) => acc + a.max, 0)
  const percent = totalMax > 0 ? Math.round((score.total / totalMax) * 100) : 0

  if (percent >= 80) return { grade: 'S', percent, label: '최우수', tone: 'emerald' }
  if (percent >= 60) return { grade: 'A', percent, label: '우수',   tone: 'blue' }
  if (percent >= 40) return { grade: 'B', percent, label: '보통',   tone: 'yellow' }
  return { grade: 'C', percent, label: '개선 필요', tone: 'orange' }
}

/**
 * axes 배열에서 가장 약한 축(정규화 점수 가장 낮은)을 반환.
 *
 * 빈 배열이면 null 을 반환한다.
 */
export function findWeakestAxis(axes: HarnessScoreAxis[]): HarnessScoreAxis | null {
  if (axes.length === 0) return null
  return axes.reduce((weakest, current) => {
    const currentNorm = current.max > 0 ? current.value / current.max : 0
    const weakestNorm = weakest.max > 0 ? weakest.value / weakest.max : 0
    return currentNorm < weakestNorm ? current : weakest
  })
}
