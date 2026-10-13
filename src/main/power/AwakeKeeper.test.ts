import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AwakeKeeper, type PowerApi } from './AwakeKeeper'

function makePower(onBattery = false) {
  let listener: (() => void) | null = null
  let nextId = 1
  const state = { onBattery }
  const api: PowerApi = {
    startBlocker: vi.fn(() => nextId++),
    stopBlocker: vi.fn(),
    isOnBattery: vi.fn(() => state.onBattery),
    onPowerSourceChange: vi.fn((l: () => void) => { listener = l })
  }
  return {
    api,
    state,
    /** 전원 상태를 바꾸고 powerMonitor 이벤트를 발생시킨다 */
    plug(onBat: boolean): void {
      state.onBattery = onBat
      listener?.()
    }
  }
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('AwakeKeeper — enabled × botActive × onAC', () => {
  // [enabled, botActive, onBattery, 기대 holding]
  it.each([
    [true, true, false, true],
    [true, true, true, false],
    [true, false, false, false],
    [true, false, true, false],
    [false, true, false, false],
    [false, true, true, false],
    [false, false, false, false],
    [false, false, true, false]
  ])('enabled=%s botActive=%s onBattery=%s → holding=%s', (enabled, botActive, onBattery, holding) => {
    const p = makePower(onBattery)
    const k = new AwakeKeeper(p.api)
    k.setEnabled(enabled)
    k.setBotActive(botActive)
    expect(k.getStatus().holding).toBe(holding)
    expect(vi.mocked(p.api.startBlocker).mock.calls.length).toBe(holding ? 1 : 0)
  })

  it('초기 상태는 enabled=true, botActive=false, 잡지 않음', () => {
    const p = makePower(false)
    const k = new AwakeKeeper(p.api)
    expect(k.getStatus()).toEqual({ enabled: true, holding: false, onAC: true, botActive: false })
    expect(p.api.startBlocker).not.toHaveBeenCalled()
  })

  it('getStatus 의 onAC 는 isOnBattery 의 반대', () => {
    const p = makePower(true)
    expect(new AwakeKeeper(p.api).getStatus().onAC).toBe(false)
  })

  it('이미 잡고 있으면 다시 시작하지 않는다 (중복 평가)', () => {
    const p = makePower(false)
    const k = new AwakeKeeper(p.api)
    k.setBotActive(true)
    k.setEnabled(true)
    k.setEnabled(true)
    expect(p.api.startBlocker).toHaveBeenCalledTimes(1)
  })

  it('봇이 끊기면 blocker 를 해제', () => {
    const p = makePower(false)
    const k = new AwakeKeeper(p.api)
    k.setBotActive(true)
    k.setBotActive(false)
    expect(p.api.stopBlocker).toHaveBeenCalledWith(1)
    expect(k.getStatus().holding).toBe(false)
  })

  it('설정을 끄면 해제하고, 다시 켜면 새 blocker', () => {
    const p = makePower(false)
    const k = new AwakeKeeper(p.api)
    k.setBotActive(true)
    k.setEnabled(false)
    expect(p.api.stopBlocker).toHaveBeenCalledWith(1)
    k.setEnabled(true)
    expect(p.api.startBlocker).toHaveBeenCalledTimes(2)
    expect(k.getStatus().holding).toBe(true)
  })
})

describe('AwakeKeeper — 전원 변화', () => {
  it('생성 시 전원 변화 리스너를 등록', () => {
    const p = makePower()
    new AwakeKeeper(p.api)
    expect(p.api.onPowerSourceChange).toHaveBeenCalledTimes(1)
  })

  it('AC → 배터리로 바뀌면 해제, 다시 AC 면 재시작', () => {
    const p = makePower(false)
    const k = new AwakeKeeper(p.api)
    k.setBotActive(true)
    expect(k.getStatus().holding).toBe(true)
    p.plug(true)
    expect(k.getStatus()).toMatchObject({ holding: false, onAC: false })
    expect(p.api.stopBlocker).toHaveBeenCalledWith(1)
    p.plug(false)
    expect(k.getStatus()).toMatchObject({ holding: true, onAC: true })
    expect(p.api.startBlocker).toHaveBeenCalledTimes(2)
  })

  it('배터리에서 시작한 뒤 충전기를 꽂으면 잡는다', () => {
    const p = makePower(true)
    const k = new AwakeKeeper(p.api)
    k.setBotActive(true)
    expect(k.getStatus().holding).toBe(false)
    p.plug(false)
    expect(k.getStatus().holding).toBe(true)
  })

  it('봇이 비활성이면 전원이 바뀌어도 아무것도 하지 않는다', () => {
    const p = makePower(true)
    const k = new AwakeKeeper(p.api)
    p.plug(false)
    p.plug(true)
    expect(p.api.startBlocker).not.toHaveBeenCalled()
    expect(k.getStatus().holding).toBe(false)
  })
})

describe('AwakeKeeper — onChange / dispose', () => {
  it('상태가 실제로 바뀔 때만 listener 호출', () => {
    const p = makePower(false)
    const k = new AwakeKeeper(p.api)
    const l = vi.fn()
    k.onChange(l)
    k.setBotActive(true)
    expect(l).toHaveBeenCalledTimes(1)
    expect(l).toHaveBeenLastCalledWith({ enabled: true, holding: true, onAC: true, botActive: true })
    k.setEnabled(true) // 변화 없음
    expect(l).toHaveBeenCalledTimes(1)
    k.setBotActive(false)
    expect(l).toHaveBeenCalledTimes(2)
    expect(l).toHaveBeenLastCalledWith(expect.objectContaining({ holding: false }))
  })

  it('전원 변화로 holding 이 바뀌면 알린다', () => {
    const p = makePower(false)
    const k = new AwakeKeeper(p.api)
    k.setBotActive(true)
    const l = vi.fn()
    k.onChange(l)
    p.plug(true)
    expect(l).toHaveBeenCalledWith(expect.objectContaining({ holding: false, onAC: false }))
  })

  it('구독 해제 후에는 호출되지 않는다', () => {
    const p = makePower(false)
    const k = new AwakeKeeper(p.api)
    const l = vi.fn()
    const off = k.onChange(l)
    off()
    k.setBotActive(true)
    expect(l).not.toHaveBeenCalled()
  })

  it('listener 가 throw 해도 다른 listener 는 호출된다', () => {
    const p = makePower(false)
    const k = new AwakeKeeper(p.api)
    const good = vi.fn()
    k.onChange(() => { throw new Error('x') })
    k.onChange(good)
    expect(() => k.setBotActive(true)).not.toThrow()
    expect(good).toHaveBeenCalled()
  })

  it('dispose 는 잡고 있던 blocker 를 해제, 두 번째는 no-op', () => {
    const p = makePower(false)
    const k = new AwakeKeeper(p.api)
    k.setBotActive(true)
    k.dispose()
    k.dispose()
    expect(p.api.stopBlocker).toHaveBeenCalledTimes(1)
    expect(k.getStatus().holding).toBe(false)
  })

  it('잡은 적 없으면 dispose 가 stopBlocker 를 부르지 않는다', () => {
    const p = makePower(false)
    new AwakeKeeper(p.api).dispose()
    expect(p.api.stopBlocker).not.toHaveBeenCalled()
  })
})
