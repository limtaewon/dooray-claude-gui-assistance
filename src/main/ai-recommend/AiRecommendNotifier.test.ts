import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// electron-store 메모리 mock — 다른 테스트와 동일 패턴
vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})

// electron Notification / BrowserWindow 도 mock
const notificationCtor = vi.fn()
const notificationShow = vi.fn()
const notificationOn = vi.fn()
vi.mock('electron', () => ({
  Notification: vi.fn().mockImplementation((opts: unknown) => {
    notificationCtor(opts)
    return { show: notificationShow, on: notificationOn }
  }),
  BrowserWindow: { getAllWindows: () => [] }
}))

import { AiRecommendNotifier } from './AiRecommendNotifier'

interface MockPost { id: string; subject?: string }
function makeTaskService(posts: MockPost[]): { listCommunityPosts: (projectId: string, page?: number, size?: number) => Promise<{ posts: MockPost[]; totalCount: number }> } {
  return {
    listCommunityPosts: vi.fn(async () => ({ posts, totalCount: posts.length }))
  }
}

describe('AiRecommendNotifier (#7)', () => {
  beforeEach(() => {
    notificationCtor.mockClear()
    notificationShow.mockClear()
    notificationOn.mockClear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('첫 폴링은 silent — 알림 X, cursor 만 초기화', async () => {
    const ts = makeTaskService([{ id: 'p3', subject: 'C' }, { id: 'p2', subject: 'B' }, { id: 'p1', subject: 'A' }])
    const n = new AiRecommendNotifier(ts as unknown as never)
    await n.start()
    expect(notificationShow).not.toHaveBeenCalled()
    n.stop()
  })

  it('두 번째 폴링에서 새 글이 있으면 알림 표시', async () => {
    // 첫 호출 결과
    let posts: MockPost[] = [{ id: 'p1', subject: 'A' }]
    const ts = {
      listCommunityPosts: vi.fn(async () => ({ posts, totalCount: posts.length }))
    }
    const n = new AiRecommendNotifier(ts as unknown as never)
    // 시간을 silent hours 아닌 정오로 (12시) 고정
    vi.setSystemTime(new Date(2026, 4, 19, 12, 0, 0))
    await n.start()
    expect(notificationShow).not.toHaveBeenCalled()
    // 두 번째 폴링에서 새 글 2개
    posts = [{ id: 'p3', subject: 'C' }, { id: 'p2', subject: 'B' }, { id: 'p1', subject: 'A' }]
    // poll 은 setInterval 안에서 1시간 뒤 — 시간을 advance 하지 않고 직접 poll 노출이 없으므로
    // start 가 setInterval 등록한 콜백을 직접 트리거하기 위해 vi.advanceTimersByTime
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    // 알림 호출 검증
    expect(notificationCtor).toHaveBeenCalled()
    const opts = notificationCtor.mock.calls[0][0] as { title: string; body: string }
    expect(opts.title).toContain('새 AI 사례')
    // 새 글 2개의 제목이 body 에 포함
    expect(opts.body).toContain('B')
    expect(opts.body).toContain('C')
    expect(notificationShow).toHaveBeenCalledTimes(1)
    n.stop()
  })

  it('silent hours (22시) 면 새 글 있어도 알림 보류, cursor 도 유지', async () => {
    let posts: MockPost[] = [{ id: 'p1', subject: 'A' }]
    const ts = { listCommunityPosts: vi.fn(async () => ({ posts, totalCount: posts.length })) }
    const n = new AiRecommendNotifier(ts as unknown as never)
    // 22시 (silent)
    vi.setSystemTime(new Date(2026, 4, 19, 23, 0, 0))
    await n.start()
    expect(notificationShow).not.toHaveBeenCalled()
    posts = [{ id: 'p2', subject: 'B' }, { id: 'p1', subject: 'A' }]
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    // silent — 알림 보류
    expect(notificationShow).not.toHaveBeenCalled()
    n.stop()
  })

  it('disable 시 폴링 자체가 안 돌고, 다시 enable 하면 start', async () => {
    const ts = makeTaskService([{ id: 'p1' }])
    const n = new AiRecommendNotifier(ts as unknown as never)
    n.setEnabled(false)
    expect(n.isEnabled()).toBe(false)
    await n.start()
    expect(ts.listCommunityPosts).not.toHaveBeenCalled()
    n.setEnabled(true)
    expect(n.isEnabled()).toBe(true)
  })

  it('listCommunityPosts 실패해도 throw 하지 않고 다음 폴링 대기', async () => {
    const ts = {
      listCommunityPosts: vi.fn(async () => { throw new Error('no token') })
    }
    const n = new AiRecommendNotifier(ts as unknown as never)
    await expect(n.start()).resolves.toBeUndefined()
    expect(notificationShow).not.toHaveBeenCalled()
    n.stop()
  })
})
