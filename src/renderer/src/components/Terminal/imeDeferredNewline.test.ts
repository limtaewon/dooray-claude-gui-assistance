import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createDeferredEnterSender,
  isEnterCode,
  isMultilineNewlineChord,
  sendAfterComposition
} from './imeDeferredNewline'

describe('isEnterCode / isMultilineNewlineChord', () => {
  it('물리 Enter 키를 code 로 판별한다 — 조합 중엔 e.key 가 Process 라 쓸 수 없다', () => {
    expect(isEnterCode('Enter')).toBe(true)
    expect(isEnterCode('NumpadEnter')).toBe(true)
    expect(isEnterCode('KeyD')).toBe(false)
  })

  it('Shift/Alt+Enter 만 멀티라인 개행으로 본다', () => {
    const base = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }
    expect(isMultilineNewlineChord({ ...base, shiftKey: true })).toBe(true)
    expect(isMultilineNewlineChord({ ...base, altKey: true })).toBe(true)
    expect(isMultilineNewlineChord(base)).toBe(false)
    // Cmd/Ctrl 조합은 다른 기능이 소유한다
    expect(isMultilineNewlineChord({ ...base, shiftKey: true, metaKey: true })).toBe(false)
    expect(isMultilineNewlineChord({ ...base, shiftKey: true, ctrlKey: true })).toBe(false)
  })
})

describe('sendAfterComposition', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('compositionend 를 기다렸다가 보낸다 — 개행이 먼저 도착해 글자가 밀리는 버그의 핵심', () => {
    const el = document.createElement('div')
    const send = vi.fn()

    sendAfterComposition(el, send)
    expect(send).not.toHaveBeenCalled()

    el.dispatchEvent(new Event('compositionend'))
    expect(send).not.toHaveBeenCalled() // 커밋 글리프 flush 를 위해 한 tick 미룬다
    vi.advanceTimersByTime(0)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('compositionend 가 오지 않아도 폴백 시간 뒤에는 보낸다', () => {
    const send = vi.fn()
    sendAfterComposition(document.createElement('div'), send, { fallbackMs: 200 })

    vi.advanceTimersByTime(199)
    expect(send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1 + 1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('compositionend 와 폴백이 겹쳐도 한 번만 보낸다', () => {
    const el = document.createElement('div')
    const send = vi.fn()
    sendAfterComposition(el, send, { fallbackMs: 50 })

    el.dispatchEvent(new Event('compositionend'))
    vi.advanceTimersByTime(200)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('엘리먼트가 없으면 다음 tick 에 바로 보낸다', () => {
    const send = vi.fn()
    sendAfterComposition(null, send)
    vi.advanceTimersByTime(0)
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('createDeferredEnterSender', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const enter = { code: 'Enter', timeStamp: 1234 }

  it('조합 종료 후 개행을 보내고, 같은 native 이벤트의 재발행 Enter 를 흡수한다', () => {
    const el = document.createElement('div')
    const send = vi.fn()
    const sender = createDeferredEnterSender()

    sender.defer(enter, el, send)
    el.dispatchEvent(new Event('compositionend'))
    vi.advanceTimersByTime(0)
    expect(send).toHaveBeenCalledTimes(1)

    // Chromium 이 같은 timeStamp 로 Enter 를 한 번 더 발행 → 흡수해서 이중 개행을 막는다
    expect(sender.absorb(enter)).toBe(true)
    // 크레딧은 1회분만 — 그 다음은 정상 Enter 로 통과
    expect(sender.absorb(enter)).toBe(false)
  })

  it('지연시킨 적 없는 Enter 는 흡수하지 않는다', () => {
    const sender = createDeferredEnterSender()
    expect(sender.absorb({ code: 'Enter', timeStamp: 99 })).toBe(false)
  })

  it('짝이 다른 Enter 가 오면 묵은 크레딧을 버려 영구 흡수를 막는다', () => {
    const el = document.createElement('div')
    const sender = createDeferredEnterSender()

    sender.defer(enter, el, vi.fn())
    vi.advanceTimersByTime(300)

    // 다른 timeStamp → 흡수 안 되고, 이전 크레딧도 폐기된다
    expect(sender.absorb({ code: 'Enter', timeStamp: 5678 })).toBe(false)
    expect(sender.absorb(enter)).toBe(false)
  })

  it('clear 후에는 아무것도 흡수하지 않는다', () => {
    const sender = createDeferredEnterSender()
    sender.defer(enter, document.createElement('div'), vi.fn())
    sender.clear()
    expect(sender.absorb(enter)).toBe(false)
  })
})
