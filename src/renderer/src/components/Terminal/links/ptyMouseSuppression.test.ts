import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import { installTerminalLinkPtyMouseSuppression } from './ptyMouseSuppression'

function makeFakeTerminal(): { el: HTMLDivElement; terminal: Terminal } {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const terminal = { element: el } as unknown as Terminal
  return { el, terminal }
}

function mouseEvent(type: string, opts: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, ...opts })
}

describe('installTerminalLinkPtyMouseSuppression', () => {
  beforeEach(() => { vi.stubGlobal('navigator', { platform: 'MacIntel' }) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('억제 대상이면 mousedown 의 전파를 끊는다(xterm 내부 리스너에 도달 못 함)', () => {
    const { el, terminal } = makeFakeTerminal()
    installTerminalLinkPtyMouseSuppression(terminal, () => true)

    // xterm 내부 마우스 리포팅 리스너를 흉내내는 버블 단계 리스너 — 도달하면 안 된다.
    const innerListener = vi.fn()
    el.addEventListener('mousedown', innerListener)

    el.dispatchEvent(mouseEvent('mousedown', { button: 0, metaKey: true }))
    expect(innerListener).not.toHaveBeenCalled()
  })

  it('shouldSuppressMouseEvent 가 false 면 전파를 막지 않는다', () => {
    const { el, terminal } = makeFakeTerminal()
    installTerminalLinkPtyMouseSuppression(terminal, () => false)
    const innerListener = vi.fn()
    el.addEventListener('mousedown', innerListener)
    el.dispatchEvent(mouseEvent('mousedown', { button: 0, metaKey: true }))
    expect(innerListener).toHaveBeenCalledTimes(1)
  })

  it('modifier 없는 클릭은 억제하지 않는다', () => {
    const { el, terminal } = makeFakeTerminal()
    installTerminalLinkPtyMouseSuppression(terminal, () => true)
    const innerListener = vi.fn()
    el.addEventListener('mousedown', innerListener)
    el.dispatchEvent(mouseEvent('mousedown', { button: 0, metaKey: false }))
    expect(innerListener).toHaveBeenCalledTimes(1)
  })

  it('Alt 조합은 URL 활성화로 취급하지 않아 억제하지 않는다', () => {
    const { el, terminal } = makeFakeTerminal()
    installTerminalLinkPtyMouseSuppression(terminal, () => true)
    const innerListener = vi.fn()
    el.addEventListener('mousedown', innerListener)
    el.dispatchEvent(mouseEvent('mousedown', { button: 0, metaKey: true, altKey: true }))
    expect(innerListener).toHaveBeenCalledTimes(1)
  })

  it('mouseup 은 절대 막지 않는다 — 링크 activate 회귀 방지', () => {
    const { el, terminal } = makeFakeTerminal()
    installTerminalLinkPtyMouseSuppression(terminal, () => true)
    const innerListener = vi.fn()
    el.addEventListener('mouseup', innerListener)
    el.dispatchEvent(mouseEvent('mouseup', { button: 0, metaKey: true }))
    expect(innerListener).toHaveBeenCalledTimes(1)
  })

  it('dispose 후에는 더 이상 전파를 막지 않는다', () => {
    const { el, terminal } = makeFakeTerminal()
    const disposable = installTerminalLinkPtyMouseSuppression(terminal, () => true)
    disposable.dispose()
    const innerListener = vi.fn()
    el.addEventListener('mousedown', innerListener)
    el.dispatchEvent(mouseEvent('mousedown', { button: 0, metaKey: true }))
    expect(innerListener).toHaveBeenCalledTimes(1)
  })
})
