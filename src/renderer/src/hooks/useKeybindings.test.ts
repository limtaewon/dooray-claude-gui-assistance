import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { installMockWindowApi, resetMockWindowApi } from '../../../../test/helpers/mockWindowApi'
import { isEditableTarget, resetKeybindingCache, useShortcut } from './useKeybindings'

function press(init: Partial<KeyboardEventInit> & { key: string }, target?: EventTarget): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  ;(target ?? window).dispatchEvent(e)
  return e
}

describe('isEditableTarget', () => {
  it('input/textarea 는 편집 대상', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    expect(isEditableTarget(input)).toBe(true)
    input.remove()
  })

  it('xterm helper textarea 는 예외 — 터미널은 자체 처리하므로 전역 단축키를 막지 않는다', () => {
    const ta = document.createElement('textarea')
    ta.className = 'xterm-helper-textarea'
    expect(isEditableTarget(ta)).toBe(false)
  })

  it('일반 요소는 아니다', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})

describe('useShortcut', () => {
  beforeEach(() => {
    installMockWindowApi()
    resetKeybindingCache()
    window.api.system = { platform: 'darwin', osRelease: '23.0.0' }
    vi.mocked(window.api.settings.get).mockResolvedValue(null)
  })
  afterEach(() => {
    resetMockWindowApi()
    resetKeybindingCache()
  })

  it('기본 조합에 반응한다', async () => {
    const fn = vi.fn()
    renderHook(() => useShortcut('global.commandPalette', fn))
    await vi.waitFor(() => {
      press({ key: 'k', metaKey: true })
      expect(fn).toHaveBeenCalled()
    })
  })

  it('다른 조합에는 반응하지 않는다', async () => {
    const fn = vi.fn()
    renderHook(() => useShortcut('global.commandPalette', fn))
    await new Promise((r) => setTimeout(r, 10))

    press({ key: 'k', ctrlKey: true })
    press({ key: 'j', metaKey: true })
    expect(fn).not.toHaveBeenCalled()
  })

  it('enabled=false 면 등록하지 않는다', async () => {
    const fn = vi.fn()
    renderHook(() => useShortcut('global.commandPalette', fn, { enabled: false }))
    await new Promise((r) => setTimeout(r, 10))

    press({ key: 'k', metaKey: true })
    expect(fn).not.toHaveBeenCalled()
  })

  it('이미 처리된(defaultPrevented) 키는 무시한다 — ⌘K 이중 발화 방지', async () => {
    const fn = vi.fn()
    renderHook(() => useShortcut('global.commandPalette', fn))
    await new Promise((r) => setTimeout(r, 10))

    const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })
    e.preventDefault()
    window.dispatchEvent(e)

    expect(fn).not.toHaveBeenCalled()
  })

  it('사용자 오버라이드가 기본 조합을 대체한다', async () => {
    vi.mocked(window.api.settings.get).mockResolvedValue({ 'global.commandPalette': ['Mod+Shift+P'] })
    const fn = vi.fn()
    renderHook(() => useShortcut('global.commandPalette', fn))

    await vi.waitFor(() => {
      press({ key: 'p', metaKey: true, shiftKey: true })
      expect(fn).toHaveBeenCalled()
    })

    fn.mockClear()
    press({ key: 'k', metaKey: true })
    expect(fn).not.toHaveBeenCalled()
  })

  it('빈 배열 오버라이드는 비활성', async () => {
    vi.mocked(window.api.settings.get).mockResolvedValue({ 'global.commandPalette': [] })
    const fn = vi.fn()
    renderHook(() => useShortcut('global.commandPalette', fn))
    await new Promise((r) => setTimeout(r, 20))

    press({ key: 'k', metaKey: true })
    expect(fn).not.toHaveBeenCalled()
  })
})
