import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import { installTerminalLinkPtyMouseSuppression } from './ptyMouseSuppression'

/**
 * xterm 5.5 DOM 구조를 흉내낸다: element(PTY 마우스 리포팅·선택 리스너) > .xterm-screen(Linkifier 리스너) > target.
 * linkifier 리스너는 xterm 이 open 때 붙이므로 설치 전에 등록한다.
 */
function makeFakeTerminal(): { el: HTMLDivElement; screen: HTMLDivElement; target: HTMLDivElement; linkifierDown: ReturnType<typeof vi.fn>; terminal: Terminal } {
  const el = document.createElement('div')
  const screen = document.createElement('div')
  screen.className = 'xterm-screen'
  const target = document.createElement('div')
  screen.appendChild(target)
  el.appendChild(screen)
  document.body.appendChild(el)
  const linkifierDown = vi.fn()
  screen.addEventListener('mousedown', linkifierDown)
  const terminal = { element: el } as unknown as Terminal
  return { el, screen, target, linkifierDown, terminal }
}

function mouseEvent(type: string, opts: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, ...opts })
}

describe('installTerminalLinkPtyMouseSuppression', () => {
  beforeEach(() => { vi.stubGlobal('navigator', { platform: 'MacIntel' }) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('억제 대상이면 PTY 마우스 리포팅(terminal.element)에는 닿지 않는다', () => {
    const { el, target, terminal } = makeFakeTerminal()
    installTerminalLinkPtyMouseSuppression(terminal, () => true)
    const ptyListener = vi.fn()
    el.addEventListener('mousedown', ptyListener)
    target.dispatchEvent(mouseEvent('mousedown', { button: 0, metaKey: true }))
    expect(ptyListener).not.toHaveBeenCalled()
  })

  it('억제해도 링크 감지기(.xterm-screen)는 mousedown 을 받는다 — 못 받으면 ⌘클릭이 툴팁만 뜨고 안 열린다 (B1 회귀)', () => {
    const { el, target, linkifierDown, terminal } = makeFakeTerminal()
    installTerminalLinkPtyMouseSuppression(terminal, () => true)
    el.addEventListener('mousedown', vi.fn())
    target.dispatchEvent(mouseEvent('mousedown', { button: 0, metaKey: true }))
    expect(linkifierDown).toHaveBeenCalledTimes(1)
  })

  it('shouldSuppressMouseEvent 가 false 면 전파를 막지 않는다', () => {
    const { el, target, terminal } = makeFakeTerminal()
    installTerminalLinkPtyMouseSuppression(terminal, () => false)
    const innerListener = vi.fn()
    el.addEventListener('mousedown', innerListener)
    target.dispatchEvent(mouseEvent('mousedown', { button: 0, metaKey: true }))
    expect(innerListener).toHaveBeenCalledTimes(1)
  })

  it('modifier 없는 클릭은 억제하지 않는다', () => {
    const { el, target, terminal } = makeFakeTerminal()
    installTerminalLinkPtyMouseSuppression(terminal, () => true)
    const innerListener = vi.fn()
    el.addEventListener('mousedown', innerListener)
    target.dispatchEvent(mouseEvent('mousedown', { button: 0, metaKey: false }))
    expect(innerListener).toHaveBeenCalledTimes(1)
  })

  it('Alt 조합은 URL 활성화로 취급하지 않아 억제하지 않는다', () => {
    const { el, target, terminal } = makeFakeTerminal()
    installTerminalLinkPtyMouseSuppression(terminal, () => true)
    const innerListener = vi.fn()
    el.addEventListener('mousedown', innerListener)
    target.dispatchEvent(mouseEvent('mousedown', { button: 0, metaKey: true, altKey: true }))
    expect(innerListener).toHaveBeenCalledTimes(1)
  })

  it('mouseup 은 절대 막지 않는다 — 링크 activate 회귀 방지', () => {
    const { el, target, terminal } = makeFakeTerminal()
    installTerminalLinkPtyMouseSuppression(terminal, () => true)
    const innerListener = vi.fn()
    el.addEventListener('mouseup', innerListener)
    target.dispatchEvent(mouseEvent('mouseup', { button: 0, metaKey: true }))
    expect(innerListener).toHaveBeenCalledTimes(1)
  })

  it('dispose 후에는 더 이상 전파를 막지 않는다', () => {
    const { el, target, terminal } = makeFakeTerminal()
    const disposable = installTerminalLinkPtyMouseSuppression(terminal, () => true)
    disposable.dispose()
    const innerListener = vi.fn()
    el.addEventListener('mousedown', innerListener)
    target.dispatchEvent(mouseEvent('mousedown', { button: 0, metaKey: true }))
    expect(innerListener).toHaveBeenCalledTimes(1)
  })
})
