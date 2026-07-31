import { describe, it, expect } from 'vitest'
import { EXPERIMENTAL_VIEWS, resolveOrderedItems } from './Sidebar'

describe('resolveOrderedItems — 실험실 게이팅', () => {
  it('켜지 않으면 실험실 항목이 목록에 없다', () => {
    const views = resolveOrderedItems(null).map((i) => i.view)
    for (const view of EXPERIMENTAL_VIEWS) expect(views).not.toContain(view)
  })

  it('켜면 나온다', () => {
    const views = resolveOrderedItems(null, ['harness']).map((i) => i.view)
    expect(views).toContain('harness')
  })

  it('숨김 설정은 실험실을 켜도 이긴다 — 사용자가 직접 숨긴 것이다', () => {
    const views = resolveOrderedItems({ order: [], hidden: ['harness'] }, ['harness']).map((i) => i.view)
    expect(views).not.toContain('harness')
  })

  it('실험실이 아닌 항목은 그대로 나온다', () => {
    const views = resolveOrderedItems(null).map((i) => i.view)
    expect(views).toContain('terminal')
    expect(views).toContain('dooray')
  })
})
