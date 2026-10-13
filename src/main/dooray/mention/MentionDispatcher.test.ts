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

describe('MentionDispatcher — 중복 실행 방지 (processed)', () => {
  function makeProcessed(initial: string[] = []) {
    const set = new Set(initial)
    return { has: vi.fn((id: string) => set.has(id)), add: vi.fn((id: string) => { set.add(id) }), set }
  }
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 5))

  it('handle 경로: 처음 보는 logId 는 실행하고 processed 에 기록', async () => {
    const processed = makeProcessed()
    const dd = new MentionDispatcher(bot as never, taskService as never, processed)
    const h = vi.fn()
    dd.onMention(h)
    dd.start()
    await bot.emit(makeEvent({ logId: 'L1' }))
    await flush()
    expect(h).toHaveBeenCalledOnce()
    expect(processed.add).toHaveBeenCalledWith('L1')
  })

  it('handle 경로: 같은 logId 가 두 번 오면 한 번만 실행', async () => {
    const processed = makeProcessed()
    const dd = new MentionDispatcher(bot as never, taskService as never, processed)
    const h = vi.fn()
    dd.onMention(h)
    dd.start()
    await bot.emit(makeEvent({ logId: 'L1' }))
    await flush()
    await bot.emit(makeEvent({ logId: 'L1' }))
    await flush()
    expect(h).toHaveBeenCalledOnce()
  })

  it('handle 경로: 이미 처리된 logId 는 건너뜀', async () => {
    const processed = makeProcessed(['L1'])
    const dd = new MentionDispatcher(bot as never, taskService as never, processed)
    const h = vi.fn()
    dd.onMention(h)
    dd.start()
    await bot.emit(makeEvent({ logId: 'L1' }))
    await flush()
    expect(h).not.toHaveBeenCalled()
    expect(processed.add).not.toHaveBeenCalled()
  })

  it('handle 로 처리한 멘션을 catch-up(dispatchContext)이 다시 실행하지 않는다', async () => {
    const processed = makeProcessed()
    const dd = new MentionDispatcher(bot as never, taskService as never, processed)
    const h = vi.fn()
    dd.onMention(h)
    dd.start()
    await bot.emit(makeEvent({ logId: 'L1' }))
    await flush()
    expect(await dd.dispatchContext({ channelId: 'c1', senderId: 'me', logId: 'L1', text: '@clauday x' })).toBe(false)
    expect(h).toHaveBeenCalledOnce()
  })

  it('dispatchContext 로 처리한 멘션이 뒤늦게 소켓으로 와도 다시 실행하지 않는다', async () => {
    const processed = makeProcessed()
    const dd = new MentionDispatcher(bot as never, taskService as never, processed)
    const h = vi.fn()
    dd.onMention(h)
    dd.start()
    expect(await dd.dispatchContext({ channelId: 'c1', senderId: 'me', logId: 'L2', text: '@clauday x' })).toBe(true)
    await bot.emit(makeEvent({ logId: 'L2' }))
    await flush()
    expect(h).toHaveBeenCalledOnce()
  })

  it('processed 를 주지 않은 디스패처는 중복 제거 없이 동작', async () => {
    const h = vi.fn()
    d.onMention(h)
    const ctx = { channelId: 'c1', senderId: 'me', logId: 'L', text: '@clauday x' }
    expect(await d.dispatchContext(ctx)).toBe(true)
    expect(await d.dispatchContext(ctx)).toBe(true)
    expect(h).toHaveBeenCalledTimes(2)
  })
})

describe('MentionDispatcher.dispatchContext / matches / getMyMemberId', () => {
  it('핸들러에 ctx 를 그대로 넘기고 true 반환', async () => {
    const h = vi.fn()
    d.onMention(h)
    const ctx = { channelId: 'c1', senderId: 'me', logId: 'L', text: '@clauday x', delayedMs: 5000 }
    expect(await d.dispatchContext(ctx)).toBe(true)
    expect(h).toHaveBeenCalledWith(ctx)
  })

  it('disabled 면 false, 핸들러·processed 모두 건드리지 않음', async () => {
    const add = vi.fn()
    const dd = new MentionDispatcher(bot as never, taskService as never, { has: () => false, add })
    const h = vi.fn()
    dd.onMention(h)
    dd.setEnabled(false)
    expect(await dd.dispatchContext({ channelId: 'c1', senderId: 'me', logId: 'L', text: '@clauday x' })).toBe(false)
    expect(h).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
  })

  it('핸들러가 던져도 true (다른 핸들러는 계속)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const b = vi.fn()
    d.onMention(vi.fn().mockRejectedValue(new Error('x')))
    d.onMention(b)
    expect(await d.dispatchContext({ channelId: 'c1', senderId: 'me', logId: 'L', text: '@clauday' })).toBe(true)
    expect(b).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('matches: 맨 앞 단독 토큰만 true (공백·줄바꿈·대소문자 허용)', () => {
    expect(d.matches('@clauday 안녕')).toBe(true)
    expect(d.matches('  @Clauday\n해줘')).toBe(true)
    expect(d.matches('@clauday')).toBe(true)
    expect(d.matches('안녕 @clauday')).toBe(false)
    expect(d.matches('@claudaybot')).toBe(false)
    expect(d.matches('')).toBe(false)
  })

  it('matches 는 setTrigger 를 따른다', () => {
    d.setTrigger('@Bot')
    expect(d.matches('@bot 해줘')).toBe(true)
    expect(d.matches('@clauday 해줘')).toBe(false)
  })

  it('getMyMemberId: 조회 후 캐시, 실패 시 null', async () => {
    expect(await d.getMyMemberId()).toBe('me')
    expect(await d.getMyMemberId()).toBe('me')
    expect(taskService.getMyMemberIdPublic).toHaveBeenCalledTimes(1)

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    taskService.getMyMemberIdPublic.mockRejectedValueOnce(new Error('x'))
    const fresh = new MentionDispatcher(bot as never, taskService as never)
    expect(await fresh.getMyMemberId()).toBeNull()
    errSpy.mockRestore()
  })
})
