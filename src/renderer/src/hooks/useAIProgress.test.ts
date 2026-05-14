import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAIProgress, formatElapsed } from './useAIProgress'

type Listener = (ev: Record<string, unknown>) => void
let listeners: Listener[] = []

beforeEach(() => {
  listeners = []
  ;(window as unknown as { api: unknown }).api = {
    ai: {
      onProgress: (cb: Listener) => {
        listeners.push(cb)
        return () => { listeners = listeners.filter((l) => l !== cb) }
      }
    }
  }
})

function emit(ev: Record<string, unknown>): void {
  for (const l of listeners) l(ev)
}

describe('useAIProgress', () => {
  it('초기 상태는 idle', () => {
    const { result } = renderHook(() => useAIProgress())
    expect(result.current.progress.stage).toBe('idle')
    expect(result.current.isActive).toBe(false)
  })

  it('start() 후 collecting 단계', () => {
    const { result } = renderHook(() => useAIProgress())
    let reqId = ''
    act(() => { reqId = result.current.start() })
    expect(reqId).toMatch(/^req_/)
    expect(result.current.progress.stage).toBe('collecting')
    expect(result.current.isActive).toBe(true)
  })

  it('progress 이벤트 — 같은 requestId 만 반영', () => {
    const { result } = renderHook(() => useAIProgress())
    let reqId = ''
    act(() => { reqId = result.current.start() })
    act(() => emit({ requestId: 'other', stage: 'streaming', message: 'noise', elapsedMs: 100 }))
    expect(result.current.progress.message).toBe('준비 중...')
    act(() => emit({ requestId: reqId, stage: 'streaming', message: 'work', elapsedMs: 500, chunk: 'hello' }))
    expect(result.current.progress.message).toBe('work')
    expect(result.current.progress.streamedText).toBe('hello')
  })

  it('streamedText 누적', () => {
    const { result } = renderHook(() => useAIProgress())
    let reqId = ''
    act(() => { reqId = result.current.start() })
    act(() => emit({ requestId: reqId, stage: 'streaming', message: 'x', elapsedMs: 1, chunk: 'A' }))
    act(() => emit({ requestId: reqId, stage: 'streaming', message: 'x', elapsedMs: 2, chunk: 'B' }))
    expect(result.current.progress.streamedText).toBe('AB')
  })

  it('done() 으로 idle 복귀', () => {
    const { result } = renderHook(() => useAIProgress())
    act(() => { result.current.start() })
    act(() => { result.current.done() })
    expect(result.current.progress.stage).toBe('idle')
    expect(result.current.isActive).toBe(false)
  })

  it('stage=done 이면 isActive=false', () => {
    const { result } = renderHook(() => useAIProgress())
    let reqId = ''
    act(() => { reqId = result.current.start() })
    act(() => emit({ requestId: reqId, stage: 'done', message: '완료', elapsedMs: 1000 }))
    expect(result.current.isActive).toBe(false)
  })

  it('stage=error 이면 isActive=false', () => {
    const { result } = renderHook(() => useAIProgress())
    let reqId = ''
    act(() => { reqId = result.current.start() })
    act(() => emit({ requestId: reqId, stage: 'error', message: '실패', elapsedMs: 100 }))
    expect(result.current.isActive).toBe(false)
  })
})

describe('formatElapsed', () => {
  it('60초 미만 → "N초"', () => {
    expect(formatElapsed(0)).toBe('0초')
    expect(formatElapsed(30_000)).toBe('30초')
  })

  it('60초 이상 → "분 초"', () => {
    expect(formatElapsed(75_000)).toBe('1분 15초')
    expect(formatElapsed(125_000)).toBe('2분 5초')
  })
})
