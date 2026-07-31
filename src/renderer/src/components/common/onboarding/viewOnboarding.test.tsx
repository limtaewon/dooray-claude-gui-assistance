import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VIEW_ONBOARDING, ViewOnboarding, type OnboardingViewId } from './viewOnboarding'
import { CUSTOMIZABLE_NAV_ITEMS } from '../../Layout/Sidebar'

/** 온보딩 대상이 아닌 메뉴 — 화면 자체가 설명이라 별도 안내가 필요 없다. */
const EXEMPT = new Set(['settings', 'onboarding', 'workspace'])

describe('온보딩 커버리지', () => {
  it('사이드바의 모든 메뉴가 온보딩 문구를 가진다 — 메뉴를 추가하면 여기서 걸린다', () => {
    const missing = CUSTOMIZABLE_NAV_ITEMS.map((item) => item.view)
      .filter((view) => !EXEMPT.has(view))
      .filter((view) => !(view in VIEW_ONBOARDING))
    expect(missing, `온보딩 누락: ${missing.join(', ')}`).toEqual([])
  })

  it('모든 문구에 제목·설명이 채워져 있다', () => {
    for (const [id, copy] of Object.entries(VIEW_ONBOARDING)) {
      expect(copy.title, id).toBeTruthy()
      expect(copy.description, id).toBeTruthy()
    }
  })

  it('스텝은 최대 3개로 유지한다 — 첫 화면에서 읽히지 않으면 온보딩이 아니다', () => {
    for (const [id, copy] of Object.entries(VIEW_ONBOARDING)) {
      expect(copy.steps.length, id).toBeLessThanOrEqual(3)
    }
  })

  it('도메인 식별색은 Claude(주황)/두레이(파랑) 둘 중 하나만 쓴다', () => {
    for (const [id, copy] of Object.entries(VIEW_ONBOARDING)) {
      if (copy.accent) expect(['claude', 'dooray'], id).toContain(copy.accent)
    }
  })
})

describe('ViewOnboarding 렌더', () => {
  it('레지스트리 문구와 스텝을 그린다', () => {
    render(<ViewOnboarding view="mcp" />)
    expect(screen.getByText(VIEW_ONBOARDING.mcp.title)).toBeInTheDocument()
    expect(screen.getByText(VIEW_ONBOARDING.mcp.description)).toBeInTheDocument()
    expect(screen.getByText(VIEW_ONBOARDING.mcp.steps[0].title)).toBeInTheDocument()
  })

  it('description 을 넘기면 레지스트리 문구를 덮어쓴다', () => {
    render(<ViewOnboarding view="mcp" description="다른 안내" />)
    expect(screen.getByText('다른 안내')).toBeInTheDocument()
    expect(screen.queryByText(VIEW_ONBOARDING.mcp.description)).not.toBeInTheDocument()
  })

  it('액션 버튼을 그리고 클릭을 전달한다', () => {
    const onClick = vi.fn()
    render(<ViewOnboarding view="skills" actions={[{ label: '스킬 추가', onClick }]} />)
    fireEvent.click(screen.getByRole('button', { name: '스킬 추가' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('hint 가 있는 메뉴는 하단 힌트를 그린다', () => {
    render(<ViewOnboarding view="sessions" />)
    expect(screen.getByText(VIEW_ONBOARDING.sessions.hint as string)).toBeInTheDocument()
  })

  it('모든 메뉴가 렌더 중 터지지 않는다', () => {
    for (const id of Object.keys(VIEW_ONBOARDING) as OnboardingViewId[]) {
      const { unmount } = render(<ViewOnboarding view={id} />)
      expect(screen.getByText(VIEW_ONBOARDING[id].title)).toBeInTheDocument()
      unmount()
    }
  })
})
