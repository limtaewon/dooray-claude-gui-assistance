import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})

let hasCreds = true
vi.mock('./CredentialStore', () => ({
  CalDAVCredentialStore: {
    has: () => hasCreds
  }
}))

import { CTagPoller } from './CTagPoller'

beforeEach(() => {
  hasCreds = true
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('CTagPoller', () => {
  it('start 시 즉시 한 번 tick + 주기 호출', async () => {
    const incrementalSync = vi.fn().mockResolvedValue({ anyChange: false })
    const poller = new CTagPoller({ incrementalSync } as never)
    poller.start()
    // 즉시 호출 확인 — 마이크로태스크 한 사이클
    await Promise.resolve()
    expect(incrementalSync.mock.calls.length).toBeGreaterThanOrEqual(1)
    const after = incrementalSync.mock.calls.length
    await vi.advanceTimersByTimeAsync(180_000)
    expect(incrementalSync.mock.calls.length).toBeGreaterThan(after)
    poller.stop()
  })

  it('start 중복 호출은 no-op', () => {
    const incrementalSync = vi.fn().mockResolvedValue({ anyChange: false })
    const poller = new CTagPoller({ incrementalSync } as never)
    poller.start()
    const before = incrementalSync.mock.calls.length
    poller.start()
    expect(incrementalSync.mock.calls.length).toBe(before)
    poller.stop()
  })

  it('자격증명 없으면 sync 호출 skip', async () => {
    hasCreds = false
    const incrementalSync = vi.fn()
    const poller = new CTagPoller({ incrementalSync } as never)
    poller.start()
    await vi.runOnlyPendingTimersAsync()
    expect(incrementalSync).not.toHaveBeenCalled()
    poller.stop()
  })

  it('이미 running 중이면 중복 호출 skip (재진입 방지)', async () => {
    let resolveSync: (v: unknown) => void = () => {}
    const incrementalSync = vi.fn(() => new Promise((res) => { resolveSync = res }))
    const poller = new CTagPoller({ incrementalSync } as never)
    poller.start()
    // 첫 호출은 running, 두 번째는 skip
    await vi.advanceTimersByTimeAsync(180_000)
    expect(incrementalSync).toHaveBeenCalledTimes(1)
    resolveSync({ anyChange: false })
    poller.stop()
  })

  it('anyChange=true 면 변경 로그', async () => {
    const incrementalSync = vi.fn().mockResolvedValue({ anyChange: true })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const poller = new CTagPoller({ incrementalSync } as never)
    poller.start()
    await vi.runOnlyPendingTimersAsync()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('변경 감지'))
    logSpy.mockRestore()
    poller.stop()
  })

  it('sync 실패해도 polling 계속', async () => {
    const incrementalSync = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue({ anyChange: false })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const poller = new CTagPoller({ incrementalSync } as never)
    poller.start()
    await Promise.resolve()
    const after = incrementalSync.mock.calls.length
    await vi.advanceTimersByTimeAsync(180_000)
    expect(errSpy).toHaveBeenCalled()
    expect(incrementalSync.mock.calls.length).toBeGreaterThan(after)
    errSpy.mockRestore()
    poller.stop()
  })

  it('stop 후에는 더 이상 tick 안 됨', async () => {
    const incrementalSync = vi.fn().mockResolvedValue({ anyChange: false })
    const poller = new CTagPoller({ incrementalSync } as never)
    poller.start()
    await vi.runOnlyPendingTimersAsync()
    poller.stop()
    const before = incrementalSync.mock.calls.length
    await vi.advanceTimersByTimeAsync(45_000 * 5)
    expect(incrementalSync.mock.calls.length).toBe(before)
  })
})
