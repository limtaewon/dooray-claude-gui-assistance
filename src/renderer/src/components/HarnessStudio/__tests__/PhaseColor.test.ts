import { describe, it, expect } from 'vitest'
import {
  phaseTokens,
  isKnownPhaseClass,
  PHASE_TOKEN_MAP
} from '../shared/PhaseColor'
import type { PhaseClass } from '../shared/PhaseColor'

describe('PhaseColor — phaseTokens', () => {
  it('알려진 모든 phaseClass 에 대해 bg/fg/border 를 반환한다', () => {
    const known: PhaseClass[] = [
      'analyst', 'pm', 'architect', 'sm', 'dev',
      'qa', 'security', 'release', 'orchestrator', 'other'
    ]
    for (const phase of known) {
      const tokens = phaseTokens(phase)
      expect(tokens.bg).toBeTruthy()
      expect(tokens.fg).toBeTruthy()
      expect(tokens.border).toBeTruthy()
    }
  })

  // 페이즈 색은 bg(틴트)·accent(강조)에 담기고, fg 는 가독성 위해 text-primary 를 쓴다.
  it('analyst 는 violet 토큰을 사용한다', () => {
    const tokens = phaseTokens('analyst')
    expect(tokens.bg).toContain('violet')
    expect(tokens.accent).toContain('violet')
  })

  it('dev 는 emerald 토큰을 사용한다', () => {
    const tokens = phaseTokens('dev')
    expect(tokens.bg).toContain('emerald')
    expect(tokens.accent).toContain('emerald')
  })

  it('security 는 red 토큰을 사용한다', () => {
    const tokens = phaseTokens('security')
    expect(tokens.bg).toContain('red')
    expect(tokens.accent).toContain('red')
  })

  it('architect 와 qa 는 blue 토큰을 사용한다', () => {
    expect(phaseTokens('architect').bg).toContain('blue')
    expect(phaseTokens('qa').bg).toContain('blue')
  })

  it('unknown string → 폴백 토큰(bg-surface) 반환', () => {
    const tokens = phaseTokens('unknown-phase')
    expect(tokens.bg).toContain('bg-surface')
  })

  it('null → 폴백 토큰 반환', () => {
    const tokens = phaseTokens(null)
    expect(tokens.bg).toContain('bg-surface')
  })

  it('undefined → 폴백 토큰 반환', () => {
    const tokens = phaseTokens(undefined)
    expect(tokens.bg).toContain('bg-surface')
  })

  it('빈 문자열 → 폴백 토큰 반환', () => {
    const tokens = phaseTokens('')
    expect(tokens.bg).toContain('bg-surface')
  })
})

describe('PhaseColor — isKnownPhaseClass', () => {
  it('알려진 phaseClass 는 true', () => {
    expect(isKnownPhaseClass('dev')).toBe(true)
    expect(isKnownPhaseClass('qa')).toBe(true)
    expect(isKnownPhaseClass('orchestrator')).toBe(true)
    expect(isKnownPhaseClass('other')).toBe(true)
  })

  it('알 수 없는 phaseClass 는 false', () => {
    expect(isKnownPhaseClass('unknown')).toBe(false)
    expect(isKnownPhaseClass('')).toBe(false)
    expect(isKnownPhaseClass('ANALYST')).toBe(false) // 대소문자 구분
  })
})

describe('PhaseColor — PHASE_TOKEN_MAP 완결성', () => {
  it('10개 phaseClass 모두 정의됨', () => {
    const expectedKeys: PhaseClass[] = [
      'analyst', 'pm', 'architect', 'sm', 'dev',
      'qa', 'security', 'release', 'orchestrator', 'other'
    ]
    for (const key of expectedKeys) {
      expect(PHASE_TOKEN_MAP).toHaveProperty(key)
    }
  })

  it('모든 항목이 bg/fg/border/accent 를 가진다', () => {
    for (const [key, tokens] of Object.entries(PHASE_TOKEN_MAP)) {
      expect(tokens.bg, `${key}.bg`).toBeTruthy()
      expect(tokens.fg, `${key}.fg`).toBeTruthy()
      expect(tokens.border, `${key}.border`).toBeTruthy()
      expect(tokens.accent, `${key}.accent`).toBeTruthy()
    }
  })

  it('모든 색상 값은 CSS 변수/color-mix 표현이다', () => {
    for (const [, tokens] of Object.entries(PHASE_TOKEN_MAP)) {
      // bg/border 는 color-mix(... var()) 합성, fg/accent 는 var() 직접.
      expect(tokens.bg).toMatch(/^(var|color-mix)\(/)
      expect(tokens.fg).toMatch(/^var\(/)
      expect(tokens.border).toMatch(/^(var|color-mix)\(/)
      expect(tokens.accent).toMatch(/^var\(/)
    }
  })
})
