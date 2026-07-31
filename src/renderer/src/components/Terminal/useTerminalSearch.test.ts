import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useTerminalSearch from './useTerminalSearch'
import { MAX_SEARCH_QUERY_LENGTH } from './terminalSearch'

function makeAddon(): { findNext: ReturnType<typeof vi.fn>; findPrevious: ReturnType<typeof vi.fn>; clearDecorations: ReturnType<typeof vi.fn> } {
  return {
    findNext: vi.fn().mockReturnValue(true),
    findPrevious: vi.fn().mockReturnValue(true),
    clearDecorations: vi.fn()
  }
}

describe('useTerminalSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('openSearch 로 open 상태가 true 가 된다', () => {
    const searchAddonRef = { current: makeAddon() } as unknown as Parameters<typeof useTerminalSearch>[0]['searchAddonRef']
    const terminalRef = { current: { focus: vi.fn() } } as unknown as Parameters<typeof useTerminalSearch>[0]['terminalRef']
    const { result } = renderHook(() => useTerminalSearch({ sessionId: 's1', searchAddonRef, terminalRef }))

    expect(result.current.open).toBe(false)
    act(() => result.current.openSearch())
    expect(result.current.open).toBe(true)
  })

  it('쿼리 입력 시 120ms 디바운스 후 findNext 가 호출된다', () => {
    const addon = makeAddon()
    const searchAddonRef = { current: addon } as unknown as Parameters<typeof useTerminalSearch>[0]['searchAddonRef']
    const terminalRef = { current: { focus: vi.fn() } } as unknown as Parameters<typeof useTerminalSearch>[0]['terminalRef']
    const { result } = renderHook(() => useTerminalSearch({ sessionId: 's1', searchAddonRef, terminalRef }))

    act(() => result.current.setQuery('error'))
    expect(addon.findNext).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(120))
    expect(addon.findNext).toHaveBeenCalledWith('error', expect.any(Object))
  })

  it('토글 변경 시 새 옵션으로 재검색이 예약된다', () => {
    const addon = makeAddon()
    const searchAddonRef = { current: addon } as unknown as Parameters<typeof useTerminalSearch>[0]['searchAddonRef']
    const terminalRef = { current: { focus: vi.fn() } } as unknown as Parameters<typeof useTerminalSearch>[0]['terminalRef']
    const { result } = renderHook(() => useTerminalSearch({ sessionId: 's1', searchAddonRef, terminalRef }))

    act(() => result.current.setQuery('foo'))
    act(() => vi.advanceTimersByTime(120))
    addon.findNext.mockClear()

    act(() => result.current.toggleOption('caseSensitive'))
    expect(result.current.toggles.caseSensitive).toBe(true)
    act(() => vi.advanceTimersByTime(120))
    expect(addon.findNext).toHaveBeenCalledWith('foo', expect.objectContaining({ caseSensitive: true }))
  })

  it('닫으면 clearDecorations 가 호출되고 터미널이 focus 된다', () => {
    const addon = makeAddon()
    const focus = vi.fn()
    const searchAddonRef = { current: addon } as unknown as Parameters<typeof useTerminalSearch>[0]['searchAddonRef']
    const terminalRef = { current: { focus } } as unknown as Parameters<typeof useTerminalSearch>[0]['terminalRef']
    const { result } = renderHook(() => useTerminalSearch({ sessionId: 's1', searchAddonRef, terminalRef }))

    act(() => result.current.openSearch())
    act(() => result.current.closeSearch())

    expect(result.current.open).toBe(false)
    expect(addon.clearDecorations).toHaveBeenCalled()
    expect(focus).toHaveBeenCalled()
  })

  it('IME 조합 중에는 재검색이 발화하지 않는다', () => {
    const addon = makeAddon()
    const searchAddonRef = { current: addon } as unknown as Parameters<typeof useTerminalSearch>[0]['searchAddonRef']
    const terminalRef = { current: { focus: vi.fn() } } as unknown as Parameters<typeof useTerminalSearch>[0]['terminalRef']
    const { result } = renderHook(() => useTerminalSearch({ sessionId: 's1', searchAddonRef, terminalRef }))

    act(() => result.current.onCompositionStart())
    act(() => result.current.setQuery('세'))
    act(() => vi.advanceTimersByTime(200))
    expect(addon.findNext).not.toHaveBeenCalled()

    act(() => result.current.onCompositionEnd('세션'))
    act(() => vi.advanceTimersByTime(120))
    expect(addon.findNext).toHaveBeenCalledWith('세션', expect.any(Object))
  })

  it('2048자를 넘는 쿼리는 잘려서 상태에 반영되고 잘린 값으로 검색된다', () => {
    const addon = makeAddon()
    const searchAddonRef = { current: addon } as unknown as Parameters<typeof useTerminalSearch>[0]['searchAddonRef']
    const terminalRef = { current: { focus: vi.fn() } } as unknown as Parameters<typeof useTerminalSearch>[0]['terminalRef']
    const { result } = renderHook(() => useTerminalSearch({ sessionId: 's1', searchAddonRef, terminalRef }))

    const overlong = 'a'.repeat(MAX_SEARCH_QUERY_LENGTH + 500)
    act(() => result.current.setQuery(overlong))

    expect(result.current.query).toHaveLength(MAX_SEARCH_QUERY_LENGTH)
    act(() => vi.advanceTimersByTime(120))
    expect(addon.findNext).toHaveBeenCalledWith(result.current.query, expect.any(Object))
    expect((addon.findNext.mock.calls[0][0] as string).length).toBe(MAX_SEARCH_QUERY_LENGTH)
  })

  it('정규식 토글 + 잘못된 패턴이면 hasError 가 true 이고 findNext 를 호출하지 않는다', () => {
    const addon = makeAddon()
    const searchAddonRef = { current: addon } as unknown as Parameters<typeof useTerminalSearch>[0]['searchAddonRef']
    const terminalRef = { current: { focus: vi.fn() } } as unknown as Parameters<typeof useTerminalSearch>[0]['terminalRef']
    const { result } = renderHook(() => useTerminalSearch({ sessionId: 's1', searchAddonRef, terminalRef }))

    act(() => result.current.toggleOption('regex'))
    act(() => result.current.setQuery('('))
    act(() => vi.advanceTimersByTime(120))

    expect(result.current.hasError).toBe(true)
    expect(result.current.countLabel).toBe('오류')
    expect(addon.findNext).not.toHaveBeenCalled()
  })
})
