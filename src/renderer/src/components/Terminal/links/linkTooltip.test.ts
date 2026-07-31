import { describe, it, expect } from 'vitest'
import { createLinkTooltip } from './linkTooltip'

describe('createLinkTooltip', () => {
  it('컨테이너 안에 xterm-hover 클래스를 가진 엘리먼트를 붙인다', () => {
    const container = document.createElement('div')
    createLinkTooltip(container)
    const el = container.querySelector('.xterm-hover')
    expect(el).not.toBeNull()
    expect((el as HTMLElement).style.display).toBe('none')
  })

  it('show() 는 텍스트와 커서 근처 위치를 반영해 보여준다', () => {
    const container = document.createElement('div')
    const tooltip = createLinkTooltip(container)
    const event = new MouseEvent('mousemove', { clientX: 100, clientY: 50 })
    tooltip.show('/Users/x/file.ts:12', event)
    const el = container.querySelector('.xterm-hover') as HTMLElement
    expect(el.textContent).toBe('/Users/x/file.ts:12')
    expect(el.style.display).toBe('')
    expect(el.style.left).toBe('114px')
    expect(el.style.top).toBe('64px')
  })

  it('hide() 는 다시 숨긴다', () => {
    const container = document.createElement('div')
    const tooltip = createLinkTooltip(container)
    const event = new MouseEvent('mousemove', { clientX: 0, clientY: 0 })
    tooltip.show('x', event)
    tooltip.hide()
    const el = container.querySelector('.xterm-hover') as HTMLElement
    expect(el.style.display).toBe('none')
  })
})
