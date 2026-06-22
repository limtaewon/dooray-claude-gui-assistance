/**
 * gateRuleGroups — 순수함수 단위 테스트.
 *
 * 과제에서 제시한 neon analyst 게이트 예시 코드들이
 * 기대 카테고리로 분류되는지 검증한다.
 */

import { describe, it, expect } from 'vitest'
import { categorizeRule, groupRuleDetails } from '../views/gateRuleGroups'
import type { RuleCategory } from '../views/gateRuleGroups'

// ─── categorizeRule ───────────────────────────────────────────────

describe('categorizeRule', () => {
  // 산출물 존재
  it('NEON-G01 "brief.md 없음" → existence', () => {
    expect(categorizeRule('NEON-G01', 'brief.md 없음')).toBe<RuleCategory>('existence')
  })

  // 필수 섹션
  it('NEON-G10 "\'## 결정 사항\' 누락" → section', () => {
    expect(categorizeRule('NEON-G10', "'## 결정 사항' 누락")).toBe<RuleCategory>('section')
  })
  it('NEON-G11 "\'## 제약\' 누락" → section', () => {
    expect(categorizeRule('NEON-G11', "'## 제약' 누락")).toBe<RuleCategory>('section')
  })
  it('NEON-G12 "\'## 참조\' 누락" → section', () => {
    expect(categorizeRule('NEON-G12', "'## 참조' 누락")).toBe<RuleCategory>('section')
  })

  // 내용 검증
  it('NEON-G20 "brief.md 측정지표 누락" → content', () => {
    expect(categorizeRule('NEON-G20', 'brief.md 측정지표 누락')).toBe<RuleCategory>('content')
  })

  // 도메인·코드 규약 — message 키워드
  it('NEON-AOP01 "@Transactional 금지 — AOP 규약" → domain', () => {
    expect(categorizeRule('NEON-AOP01', '@Transactional 금지 — AOP 규약')).toBe<RuleCategory>('domain')
  })

  // 도메인·코드 규약 — code 패턴
  it('AOP01 → domain (code 패턴)', () => {
    expect(categorizeRule('AOP01', '어노테이션 금지')).toBe<RuleCategory>('domain')
  })
  it('LYR01 → domain (code 패턴)', () => {
    expect(categorizeRule('LYR01', '레이어 위반')).toBe<RuleCategory>('domain')
  })
  it('PUSH01 → domain (code 패턴)', () => {
    expect(categorizeRule('PUSH01', '직접 push 금지')).toBe<RuleCategory>('domain')
  })
  it('SEC01 → domain (code 패턴)', () => {
    expect(categorizeRule('SEC01', '보안 검사')).toBe<RuleCategory>('domain')
  })

  // domain 우선순위 — message 에 '없음' 있어도 code 패턴으로 domain
  it('AOP01 "파일 없음" → domain (code 패턴 우선)', () => {
    expect(categorizeRule('AOP01', '파일 없음')).toBe<RuleCategory>('domain')
  })

  // message 에 '규약' 키워드
  it('R001 "규약 위반" → domain (message 키워드)', () => {
    expect(categorizeRule('R001', '규약 위반')).toBe<RuleCategory>('domain')
  })

  // message 에 '레이어' 키워드
  it('R002 "레이어 의존성 위반" → domain', () => {
    expect(categorizeRule('R002', '레이어 의존성 위반')).toBe<RuleCategory>('domain')
  })

  // message 에 'push' (소문자)
  it('R003 "직접 push 금지" → domain', () => {
    expect(categorizeRule('R003', '직접 push 금지')).toBe<RuleCategory>('domain')
  })

  // message 에 '존재'
  it('R010 "파일 존재 여부 확인" → existence', () => {
    expect(categorizeRule('R010', '파일 존재 여부 확인')).toBe<RuleCategory>('existence')
  })

  // message 에 '섹션'
  it('R020 "필수 섹션 검사" → section', () => {
    expect(categorizeRule('R020', '필수 섹션 검사')).toBe<RuleCategory>('section')
  })

  // 나머지는 content
  it('R099 "추적성 항목 누락" → content', () => {
    expect(categorizeRule('R099', '추적성 항목 누락')).toBe<RuleCategory>('content')
  })
  it('R100 "AC 미충족" → content', () => {
    expect(categorizeRule('R100', 'AC 미충족')).toBe<RuleCategory>('content')
  })
})

// ─── groupRuleDetails ─────────────────────────────────────────────

describe('groupRuleDetails', () => {
  it('undefined 입력 → 빈 배열', () => {
    expect(groupRuleDetails(undefined)).toEqual([])
  })

  it('빈 배열 입력 → 빈 배열', () => {
    expect(groupRuleDetails([])).toEqual([])
  })

  it('neon analyst 예시: 6개 규칙이 4개 그룹으로 분류된다', () => {
    const ruleDetails = [
      { code: 'NEON-G01', message: 'brief.md 없음' },
      { code: 'NEON-G20', message: 'brief.md 측정지표 누락' },
      { code: 'NEON-G10', message: "'## 결정 사항' 누락" },
      { code: 'NEON-G11', message: "'## 제약' 누락" },
      { code: 'NEON-G12', message: "'## 참조' 누락" },
      { code: 'NEON-AOP01', message: '@Transactional 금지 — AOP 규약' }
    ]
    const groups = groupRuleDetails(ruleDetails)

    // 빈 그룹 없음 → 4개 그룹 (existence / section / content / domain)
    expect(groups).toHaveLength(4)

    const existenceGroup = groups.find((g) => g.category === 'existence')
    expect(existenceGroup).toBeDefined()
    expect(existenceGroup!.rules).toHaveLength(1)
    expect(existenceGroup!.rules[0].code).toBe('NEON-G01')

    const sectionGroup = groups.find((g) => g.category === 'section')
    expect(sectionGroup).toBeDefined()
    expect(sectionGroup!.rules).toHaveLength(3)
    const sectionCodes = sectionGroup!.rules.map((r) => r.code)
    expect(sectionCodes).toContain('NEON-G10')
    expect(sectionCodes).toContain('NEON-G11')
    expect(sectionCodes).toContain('NEON-G12')

    // NEON-G20 "brief.md 측정지표 누락" → 내용 검증
    const contentGroup = groups.find((g) => g.category === 'content')
    expect(contentGroup).toBeDefined()
    expect(contentGroup!.rules).toHaveLength(1)
    expect(contentGroup!.rules[0].code).toBe('NEON-G20')

    const domainGroup = groups.find((g) => g.category === 'domain')
    expect(domainGroup).toBeDefined()
    expect(domainGroup!.rules).toHaveLength(1)
    expect(domainGroup!.rules[0].code).toBe('NEON-AOP01')
  })

  it('그룹 순서: existence → section → content → domain → other', () => {
    const ruleDetails = [
      { code: 'NEON-AOP01', message: '@Transactional 금지' },
      { code: 'NEON-G20', message: '측정지표 누락' },
      { code: 'NEON-G01', message: 'brief.md 없음' },
      { code: 'NEON-G10', message: "'## 결정 사항' 누락" }
    ]
    const groups = groupRuleDetails(ruleDetails)
    const categories = groups.map((g) => g.category)
    // existence < section < content < domain 순서 보장
    const existenceIdx = categories.indexOf('existence')
    const sectionIdx = categories.indexOf('section')
    const contentIdx = categories.indexOf('content')
    const domainIdx = categories.indexOf('domain')

    if (existenceIdx !== -1 && sectionIdx !== -1) {
      expect(existenceIdx).toBeLessThan(sectionIdx)
    }
    if (sectionIdx !== -1 && domainIdx !== -1) {
      expect(sectionIdx).toBeLessThan(domainIdx)
    }
    if (contentIdx !== -1 && domainIdx !== -1) {
      expect(contentIdx).toBeLessThan(domainIdx)
    }
  })

  it('한국어 레이블이 포함된다', () => {
    const ruleDetails = [{ code: 'NEON-G01', message: 'brief.md 없음' }]
    const groups = groupRuleDetails(ruleDetails)
    expect(groups[0].label).toBe('산출물 존재')
  })

  it('빈 그룹은 결과에 포함되지 않는다', () => {
    // content 만 있는 경우 → 1개 그룹만 반환
    const ruleDetails = [{ code: 'R099', message: '추적성 항목 누락' }]
    const groups = groupRuleDetails(ruleDetails)
    expect(groups).toHaveLength(1)
    expect(groups[0].category).toBe('content')
  })
})
