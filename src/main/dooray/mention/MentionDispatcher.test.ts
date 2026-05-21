import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MentionDispatcher } from './MentionDispatcher'

function makeBotService() {
  let listener: ((ev: unknown) => void) | null = null
  return {
    addEventListener: vi.fn((cb: (ev: unknown) => void) => {
      listener = cb
      return () => { listener = null }
    }),
    emit: (ev: unknown) => listener?.(ev),
    hasListener: () => !!listener
  }
}

function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'message',
    text: '@clauday 안녕',
    channelId: 'c1',
    senderId: 'me',
    logId: 'log1',
    sentAt: '2026-05-13T10:00:00Z',
    raw: {},
    ...overrides
  }
}

const taskService = {
  getMyMemberIdPublic: vi.fn().mockResolvedValue('me')
}

let bot: ReturnType<typeof makeBotService>
let d: MentionDispatcher

beforeEach(() => {
  bot = makeBotService()
  taskService.getMyMemberIdPublic.mockClear().mockResolvedValue('me')
  d = new MentionDispatcher(bot as never, taskService as never)
})

describe('MentionDispatcher 기본', () => {
  it('trigger 정규화: @prefix/공백/대소문자 제거', () => {
    d.setTrigger('  @ClaudayBot  ')
    expect(d.getTrigger()).toBe('claudaybot')
  })

  it('trigger 비어있으면 기본값', () => {
    d.setTrigger('')
    expect(d.getTrigger()).toBe('clauday')
  })

  it('setEnabled / isEnabled', () => {
    d.setEnabled(false)
    expect(d.isEnabled()).toBe(false)
    d.setEnabled(true)
    expect(d.isEnabled()).toBe(true)
  })

  it('start() 는 1회만 구독', () => {
    d.start()
    d.start()
    expect(bot.addEventListener).toHaveBeenCalledTimes(1)
  })

  it('stop() 후 다시 start 가능', () => {
    d.start()
    d.stop()
    d.start()
    expect(bot.addEventListener).toHaveBeenCalledTimes(2)
  })

  it('handler 등록 unsubscribe 가능', async () => {
    const h = vi.fn()
    const off = d.onMention(h)
    d.start()
    off()
    await bot.emit(makeEvent())
    await new Promise((r) => setTimeout(r, 5))
    expect(h).not.toHaveBeenCalled()
  })
})

describe('MentionDispatcher 매칭', () => {
  it('맨 앞 @clauday + 공백 통과', async () => {
    const h = vi.fn()
    d.onMention(h)
    d.start()
    await bot.emit(makeEvent({ text: '@clauday 도와줘' }))
    await new Promise((r) => setTimeout(r, 5))
    expect(h).toHaveBeenCalledOnce()
  })

  it('@clauday 단독도 매칭', async () => {
    const h = vi.fn()
    d.onMention(h)
    d.start()
    await bot.emit(makeEvent({ text: '@clauday' }))
    await new Promise((r) => setTimeout(r, 5))
    expect(h).toHaveBeenCalled()
  })

  it('@claudaybot 처럼 trigger 가 연속되면 거부', async () => {
    const h = vi.fn()
    d.onMention(h)
    d.start()
    await bot.emit(makeEvent({ text: '@claudaybot hi' }))
    await new Promise((r) => setTimeout(r, 5))
    expect(h).not.toHaveBeenCalled()
  })

  it('중간 위치 멘션 거부', async () => {
    const h = vi.fn()
    d.onMention(h)
    d.start()
    await bot.emit(makeEvent({ text: '안녕 @clauday' }))
    await new Promise((r) => setTimeout(r, 5))
    expect(h).not.toHaveBeenCalled()
  })

  it('대소문자 무시', async () => {
    const h = vi.fn()
    d.onMention(h)
    d.start()
    await bot.emit(makeEvent({ text: '@CLAUDAY 도와줘' }))
    await new Promise((r) => setTimeout(r, 5))
    expect(h).toHaveBeenCalled()
  })

  it('enabled=false 면 무시', async () => {
    const h = vi.fn()
    d.onMention(h)
    d.setEnabled(false)
    d.start()
    await bot.emit(makeEvent())
    await new Promise((r) => setTimeout(r, 5))
    expect(h).not.toHaveBeenCalled()
  })

  it('type !== message 면 무시', async () => {
    const h = vi.fn()
    d.onMention(h)
    d.start()
    await bot.emit(makeEvent({ type: 'reaction' }))
    await new Promise((r) => setTimeout(r, 5))
    expect(h).not.toHaveBeenCalled()
  })

  it('필수 필드 누락 시 무시', async () => {
    const h = vi.fn()
    d.onMention(h)
    d.start()
    await bot.emit(makeEvent({ logId: undefined }))
    await new Promise((r) => setTimeout(r, 5))
    expect(h).not.toHaveBeenCalled()
  })

  it('senderId !== myMemberId 면 무시', async () => {
    const h = vi.fn()
    d.onMention(h)
    d.start()
    await bot.emit(makeEvent({ senderId: 'other' }))
    await new Promise((r) => setTimeout(r, 5))
    expect(h).not.toHaveBeenCalled()
  })

  it('getMyMemberId 실패 시 무시 (보류)', async () => {
    taskService.getMyMemberIdPublic.mockRejectedValueOnce(new Error('boom'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const h = vi.fn()
    d.onMention(h)
    d.start()
    await bot.emit(makeEvent())
    await new Promise((r) => setTimeout(r, 5))
    expect(h).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('myMemberId 한 번 캐시되면 재호출 안 함', async () => {
    const h = vi.fn()
    d.onMention(h)
    d.start()
    await bot.emit(makeEvent())
    await bot.emit(makeEvent())
    await new Promise((r) => setTimeout(r, 5))
    expect(taskService.getMyMemberIdPublic).toHaveBeenCalledTimes(1)
  })

  it('thread 메타 추출', async () => {
    const h = vi.fn()
    d.onMention(h)
    d.start()
    await bot.emit(makeEvent({
      raw: {
        references: { channelMap: { c1: { type: 'thread', title: '스레드 제목', parentChannelId: 'parent-c' } } }
      }
    }))
    await new Promise((r) => setTimeout(r, 5))
    expect(h).toHaveBeenCalled()
    const ctx = h.mock.calls[0][0]
    expect(ctx.isThread).toBe(true)
    expect(ctx.channelDisplayName).toBe('🧵 스레드 제목')
    expect(ctx.parentChannelId).toBe('parent-c')
  })

  it('일반 채널 메타 (thread 아님)', async () => {
    const h = vi.fn()
    d.onMention(h)
    d.start()
    await bot.emit(makeEvent({
      raw: { references: { channelMap: { c1: { type: 'channel', title: '일반' } } } }
    }))
    await new Promise((r) => setTimeout(r, 5))
    const ctx = h.mock.calls[0][0]
    expect(ctx.isThread).toBe(false)
    expect(ctx.channelDisplayName).toBe('일반')
  })

  it('handler 에러는 다른 handler 진행을 막지 않음', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const a = vi.fn().mockRejectedValue(new Error('boom'))
    const b = vi.fn()
    d.onMention(a)
    d.onMention(b)
    d.start()
    await bot.emit(makeEvent())
    await new Promise((r) => setTimeout(r, 5))
    expect(b).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
