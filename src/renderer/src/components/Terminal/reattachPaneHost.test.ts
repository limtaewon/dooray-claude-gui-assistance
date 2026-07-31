import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPaneHost, reattachPaneHost } from './reattachPaneHost'
import type { TerminalPaneHandle } from './TerminalPane'

function fakeHandle(): TerminalPaneHandle {
  return {
    focus: vi.fn(),
    fit: vi.fn(),
    captureScrollState: vi.fn().mockReturnValue(null),
    restoreScrollState: vi.fn(),
    serialize: vi.fn().mockReturnValue(''),
    disposeWebgl: vi.fn(),
    attachWebglIfAllowed: vi.fn()
  } as unknown as TerminalPaneHandle
}

describe('reattachPaneHost', () => {
  let slot: HTMLDivElement

  beforeEach(() => {
    slot = document.createElement('div')
    document.body.appendChild(slot)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('이미 그 slot 의 자식이면 아무 것도 하지 않는다', () => {
    const host = createPaneHost()
    slot.appendChild(host)
    const handle = fakeHandle()

    reattachPaneHost(host, slot, handle)

    expect(handle.captureScrollState).not.toHaveBeenCalled()
    expect(handle.focus).not.toHaveBeenCalled()
  })

  /**
   * split/close 로 트리가 바뀌면 slot div 가 새로 생겨 host 를 옮긴다. DOM 에서 떼어내는 순간
   * 그 안의 포커스가 사라져, 분할 직후 타이핑이 어디에도 들어가지 않았다.
   */
  it('옮기기 전에 포커스가 안에 있었으면 옮긴 뒤 되돌린다', () => {
    const host = createPaneHost()
    const textarea = document.createElement('textarea')
    host.appendChild(textarea)
    document.body.appendChild(host)
    textarea.focus()
    expect(host.contains(document.activeElement)).toBe(true)

    const handle = fakeHandle()
    reattachPaneHost(host, slot, handle)

    expect(host.parentElement).toBe(slot)
    expect(handle.focus).toHaveBeenCalledTimes(1)
  })

  it('포커스가 밖에 있었으면 건드리지 않는다 — 남의 입력칸을 뺏지 않는다', () => {
    const host = createPaneHost()
    document.body.appendChild(host)
    const outside = document.createElement('input')
    document.body.appendChild(outside)
    outside.focus()

    const handle = fakeHandle()
    reattachPaneHost(host, slot, handle)

    expect(host.parentElement).toBe(slot)
    expect(handle.focus).not.toHaveBeenCalled()
  })

  it('WebGL 은 떼기 전에 버리고 붙인 다음 프레임에 다시 붙인다', async () => {
    const host = createPaneHost()
    const handle = fakeHandle()
    const order: string[] = []

    reattachPaneHost(host, slot, handle, {
      disposeWebgl: () => order.push('dispose'),
      attachWebgl: () => order.push('attach')
    })

    expect(order).toEqual(['dispose'])
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    expect(order).toEqual(['dispose', 'attach'])
    expect(handle.fit).toHaveBeenCalled()
  })
})
