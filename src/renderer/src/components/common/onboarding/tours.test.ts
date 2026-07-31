import { describe, it, expect } from 'vitest'
import { TOURS, tourLength } from './tours'
import { VIEW_ONBOARDING } from './viewOnboarding'

describe('TOURS', () => {
  it('온보딩 대상 메뉴가 모두 투어를 갖는다 — 허브에 눌러도 안 되는 카드를 두지 않는다', () => {
    for (const view of Object.keys(VIEW_ONBOARDING)) {
      expect(tourLength(view as keyof typeof TOURS)).toBeGreaterThan(0)
    }
    expect(tourLength('settings')).toBeGreaterThan(0)
  })

  it('모든 단계에 제목과 설명이 있다', () => {
    for (const [view, steps] of Object.entries(TOURS)) {
      for (const step of steps) {
        expect(step.title.trim(), `${view} 단계 제목`).not.toBe('')
        expect(step.body.trim(), `${view} 단계 설명`).not.toBe('')
      }
    }
  })

  it('설명이 한 줄짜리로 얄팍하지 않다 — 무엇을 어떻게 하는지까지 적는다', () => {
    for (const [view, steps] of Object.entries(TOURS)) {
      for (const step of steps) {
        expect(step.body.length, `${view} / ${step.title}`).toBeGreaterThan(30)
      }
    }
  })

  it('설치·공유가 헷갈리는 메뉴는 충분히 설명한다', () => {
    // MCP·스킬은 로컬/공유 구분과 등록 방법을 모르면 쓸 수 없다.
    expect(tourLength('mcp')).toBeGreaterThanOrEqual(8)
    expect(tourLength('skills')).toBeGreaterThanOrEqual(7)
    expect(tourLength('terminal')).toBeGreaterThanOrEqual(8)
  })

  it('앵커 이름은 중복되지 않는다 — 같은 값이면 엉뚱한 요소를 비춘다', () => {
    const anchors = Object.values(TOURS).flat().map((s) => s.anchor).filter(Boolean)
    expect(new Set(anchors).size).toBe(anchors.length)
  })
})
