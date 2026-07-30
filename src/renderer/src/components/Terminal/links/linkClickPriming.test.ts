import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import { installTerminalLinkifierClickPriming } from './linkClickPriming'

function makeFakeTerminal(): { el: HTMLDivElement; handleMouseMove: ReturnType<typeof vi.fn>; linkifier: Record<string, unknown> } {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const handleMouseMove = vi.fn()
  const linkifier = { _currentLink: undefined, _handleMouseMove: handleMouseMove, _lastBufferCell: 'stale', _activeLine: 3 }
  return { el, handleMouseMove, linkifier }
}

function mouseEvent(opts: MouseEventInit = {}): MouseEvent {
  return new MouseEvent('mousedown', { bubbles: true, ...opts })
}

describe('installTerminalLinkifierClickPriming', () => {
  beforeEach(() => { vi.stubGlobal('navigator', { platform: 'MacIntel' }) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('Cmd(mac)+클릭 mousedown 에서 linkifier 의 mousemove 핸들러를 프라이밍한다', () => {
    const { el, handleMouseMove, linkifier } = makeFakeTerminal()
    const terminal = { element: el, _core: { linkifier } } as unknown as Terminal
    installTerminalLinkifierClickPriming(terminal)

    el.dispatchEvent(mouseEvent({ button: 0, metaKey: true }))
    expect(handleMouseMove).toHaveBeenCalledTimes(1)
    // _currentLink 가 없었으므로 stale 캐시를 리셋했어야 한다.
    expect(linkifier._lastBufferCell).toBeUndefined()
    expect(linkifier._activeLine).toBe(-1)
  })

  it('modifier 없는 클릭은 무시한다', () => {
    const { el, handleMouseMove } = makeFakeTerminal()
    const terminal = { element: el, _core: { linkifier: {} } } as unknown as Terminal
    installTerminalLinkifierClickPriming(terminal)
    el.dispatchEvent(mouseEvent({ button: 0, metaKey: false }))
    expect(handleMouseMove).not.toHaveBeenCalled()
  })

  it('우클릭(button!=0)은 무시한다', () => {
    const { el, handleMouseMove } = makeFakeTerminal()
    const terminal = { element: el, _core: { linkifier: {} } } as unknown as Terminal
    installTerminalLinkifierClickPriming(terminal)
    el.dispatchEvent(mouseEvent({ button: 2, metaKey: true }))
    expect(handleMouseMove).not.toHaveBeenCalled()
  })

  it('linkifier 내부 구조가 없어도 예외 없이 동작한다', () => {
    const { el } = makeFakeTerminal()
    const terminal = { element: el, _core: {} } as unknown as Terminal
    installTerminalLinkifierClickPriming(terminal)
    expect(() => el.dispatchEvent(mouseEvent({ button: 0, metaKey: true }))).not.toThrow()
  })

  it('dispose 후에는 더 이상 반응하지 않는다', () => {
    const { el, handleMouseMove, linkifier } = makeFakeTerminal()
    const terminal = { element: el, _core: { linkifier } } as unknown as Terminal
    const disposable = installTerminalLinkifierClickPriming(terminal)
    disposable.dispose()
    el.dispatchEvent(mouseEvent({ button: 0, metaKey: true }))
    expect(handleMouseMove).not.toHaveBeenCalled()
  })
})
