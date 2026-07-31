import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createQuitFlushCoordinator } from './quitFlush'

function makeEvent(): { preventDefault: ReturnType<typeof vi.fn> } {
  return { preventDefault: vi.fn() }
}

describe('createQuitFlushCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('① 응답 없음 → 700ms 후 캐시 저장 + app.quit() 1회', () => {
    const persist = vi.fn()
    const quit = vi.fn()
    const requestFlush = vi.fn()
    const coordinator = createQuitFlushCoordinator({
      hasLiveWindow: () => true,
      requestFlush,
      persist,
      quit
    })

    const event = makeEvent()
    coordinator.onBeforeQuit(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(requestFlush).toHaveBeenCalledTimes(1)
    expect(persist).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(699)
    expect(persist).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(coordinator.done).toBe(true)
  })

  it('② 응답 도착 → 즉시 저장(persist 는 호출 안 됨, 저장은 SAVE_STATE 핸들러 몫) + 타이머 취소 + quit', () => {
    const persist = vi.fn()
    const quit = vi.fn()
    const coordinator = createQuitFlushCoordinator({
      hasLiveWindow: () => true,
      requestFlush: vi.fn(),
      persist,
      quit
    })

    coordinator.onBeforeQuit(makeEvent())
    coordinator.onSnapshotArrived()

    expect(quit).toHaveBeenCalledTimes(1)
    expect(persist).not.toHaveBeenCalled() // 타임아웃 캐시 폴백만 persist() 를 쓴다
    expect(coordinator.done).toBe(true)

    // 타이머가 취소되었으므로 700ms 가 지나도 quit 이 더 불리지 않는다
    vi.advanceTimersByTime(1000)
    expect(quit).toHaveBeenCalledTimes(1)
  })

  it('③ 2회차 before-quit 은 preventDefault 하지 않는다', () => {
    const quit = vi.fn()
    const coordinator = createQuitFlushCoordinator({
      hasLiveWindow: () => true,
      requestFlush: vi.fn(),
      persist: vi.fn(),
      quit
    })

    coordinator.onBeforeQuit(makeEvent())
    coordinator.onSnapshotArrived()
    expect(coordinator.done).toBe(true)

    const secondEvent = makeEvent()
    coordinator.onBeforeQuit(secondEvent)
    expect(secondEvent.preventDefault).not.toHaveBeenCalled()
  })

  it('④ 창 없음 → 대기 없이 즉시 캐시 경로, preventDefault/quit 은 호출 안 함', () => {
    const persist = vi.fn()
    const quit = vi.fn()
    const requestFlush = vi.fn()
    const coordinator = createQuitFlushCoordinator({
      hasLiveWindow: () => false,
      requestFlush,
      persist,
      quit
    })

    const event = makeEvent()
    coordinator.onBeforeQuit(event)

    expect(persist).toHaveBeenCalledTimes(1)
    expect(requestFlush).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled() // 기본 종료 흐름이 그대로 진행되므로 우리가 quit() 을 부를 필요 없음
    expect(coordinator.done).toBe(true)
  })

  it('onSnapshotArrived 가 quit 대기 중이 아닐 때 호출돼도(평상시 저장) done/quit 에 영향 없음', () => {
    const quit = vi.fn()
    const coordinator = createQuitFlushCoordinator({
      hasLiveWindow: () => true,
      requestFlush: vi.fn(),
      persist: vi.fn(),
      quit
    })

    coordinator.onSnapshotArrived()

    expect(quit).not.toHaveBeenCalled()
    expect(coordinator.done).toBe(false)
  })

  it('timeoutMs 커스텀 값을 존중한다', () => {
    const persist = vi.fn()
    const quit = vi.fn()
    const coordinator = createQuitFlushCoordinator({
      hasLiveWindow: () => true,
      requestFlush: vi.fn(),
      persist,
      quit,
      timeoutMs: 100
    })

    coordinator.onBeforeQuit(makeEvent())
    vi.advanceTimersByTime(99)
    expect(quit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(quit).toHaveBeenCalledTimes(1)
  })
})
