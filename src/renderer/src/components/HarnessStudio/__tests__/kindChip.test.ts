import { describe, it, expect } from 'vitest'
import { KIND_LABELS } from '../import/ScanStep'
import type { HarnessKind } from '../import/ScanStep'

describe('ScanStep — KIND_LABELS 매핑', () => {
  const kinds: HarnessKind[] = ['bundle', 'overlay', 'partial-skill', 'task']

  it('모든 HarnessKind 에 대한 한국어 레이블이 있음', () => {
    for (const kind of kinds) {
      expect(KIND_LABELS[kind]).toBeTruthy()
      expect(KIND_LABELS[kind].length).toBeGreaterThan(0)
    }
  })

  it('bundle 은 "번들"', () => {
    expect(KIND_LABELS['bundle']).toBe('번들')
  })

  it('overlay 는 "오버레이"', () => {
    expect(KIND_LABELS['overlay']).toBe('오버레이')
  })

  it('partial-skill 은 "부분 스킬"', () => {
    expect(KIND_LABELS['partial-skill']).toBe('부분 스킬')
  })

  it('task 는 "태스크"', () => {
    expect(KIND_LABELS['task']).toBe('태스크')
  })
})
