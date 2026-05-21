import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => {
  const onMock = vi.fn()
  const showMock = vi.fn()
  let supported = true
  class FakeNotification {
    static isSupported(): boolean { return supported }
    static __setSupported(v: boolean): void { supported = v }
    static __reset(): void { onMock.mockClear(); showMock.mockClear(); supported = true }
    static __on(): typeof onMock { return onMock }
    static __show(): typeof showMock { return showMock }
    on = onMock
    show = showMock
    constructor(_opts: Record<string, unknown>) {}
  }
  return { Notification: FakeNotification }
})

import { notifyMention } from './MentionNotifier'
// 모킹된 모듈의 헬퍼에 접근
import * as electron from 'electron'
const Notification = (electron as unknown as { Notification: {
  __reset: () => void; __setSupported: (v: boolean) => void; __on: () => ReturnType<typeof vi.fn>; __show: () => ReturnType<typeof vi.fn>
} }).Notification

beforeEach(() => {
  Notification.__reset()
})

describe('notifyMention', () => {
  it('알림 지원 시 show() 호출', () => {
    notifyMention(null, { channelName: '채널', preview: 'hi' })
    expect(Notification.__show()).toHaveBeenCalled()
  })

  it('알림 미지원 시 no-op', () => {
    Notification.__setSupported(false)
    notifyMention(null, { channelName: '채널', preview: 'hi' })
    expect(Notification.__show()).not.toHaveBeenCalled()
  })

  it('preview 길이가 길어도 throw 하지 않음', () => {
    expect(() => notifyMention(null, { channelName: 'c', preview: 'x'.repeat(500) })).not.toThrow()
  })

  it('클릭 핸들러 등록', () => {
    notifyMention(null, { channelName: 'c', preview: '' })
    expect(Notification.__on()).toHaveBeenCalledWith('click', expect.any(Function))
  })

  it('클릭 시 mainWindow 가 destroyed 면 no-op', () => {
    const win = { isDestroyed: () => true, isMinimized: vi.fn(), restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
    notifyMention(win as never, { channelName: 'c', preview: '' })
    const cb = Notification.__on().mock.calls.at(-1)![1] as () => void
    expect(() => cb()).not.toThrow()
    expect(win.focus).not.toHaveBeenCalled()
  })

  it('클릭 시 minimized 면 restore + show + focus', () => {
    const win = { isDestroyed: () => false, isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
    notifyMention(win as never, { channelName: 'c', preview: '' })
    const cb = Notification.__on().mock.calls.at(-1)![1] as () => void
    cb()
    expect(win.restore).toHaveBeenCalled()
    expect(win.show).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
  })

  it('클릭 시 minimized 아니면 restore 안 함', () => {
    const win = { isDestroyed: () => false, isMinimized: () => false, restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
    notifyMention(win as never, { channelName: 'c', preview: '' })
    const cb = Notification.__on().mock.calls.at(-1)![1] as () => void
    cb()
    expect(win.restore).not.toHaveBeenCalled()
    expect(win.show).toHaveBeenCalled()
  })
})
