import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const settingsStore: Record<string, unknown> = {}

beforeEach(() => {
  for (const k of Object.keys(settingsStore)) delete settingsStore[k]
  localStorage.clear()
  ;(window as unknown as { api: unknown }).api = {
    settings: {
      get: vi.fn(async (k: string) => settingsStore[k]),
      set: vi.fn((k: string, v: unknown) => { settingsStore[k] = v })
    }
  }
})

async function loadModule(): Promise<typeof import('./useFontSettings')> {
  vi.resetModules()
  return await import('./useFontSettings')
}

describe('useFontSettings — 기본', () => {
  it('초기값 default/1.0', async () => {
    const m = await loadModule()
    const { result } = renderHook(() => m.useFontSettings())
    expect(result.current.settings.family).toBe('default')
    expect(result.current.settings.scale).toBe(1.0)
  })

  it('localStorage 잘못된 값 → 기본', async () => {
    localStorage.setItem('fontSettings', '{"family":"none","scale":"abc"}')
    const m = await loadModule()
    const { result } = renderHook(() => m.useFontSettings())
    expect(result.current.settings.family).toBe('default')
    expect(result.current.settings.scale).toBe(1.0)
  })

  it('localStorage 손상 JSON → 기본', async () => {
    localStorage.setItem('fontSettings', 'not-json')
    const m = await loadModule()
    const { result } = renderHook(() => m.useFontSettings())
    expect(result.current.settings.family).toBe('default')
  })
})

describe('useFontSettings — setter', () => {
  it('setFamily', async () => {
    const m = await loadModule()
    const { result } = renderHook(() => m.useFontSettings())
    act(() => result.current.setFamily('pretendard'))
    expect(result.current.settings.family).toBe('pretendard')
    expect(JSON.parse(localStorage.getItem('fontSettings')!).family).toBe('pretendard')
  })

  it('setScale — 범위 클램프', async () => {
    const m = await loadModule()
    const { result } = renderHook(() => m.useFontSettings())
    act(() => result.current.setScale(2.0))  // upper clamp
    expect(result.current.settings.scale).toBe(1.6)
    act(() => result.current.setScale(0.5))  // lower clamp
    expect(result.current.settings.scale).toBe(0.75)
    act(() => result.current.setScale(1.2))  // in range
    expect(result.current.settings.scale).toBe(1.2)
  })

  it('reset 으로 기본값 복원', async () => {
    const m = await loadModule()
    const { result } = renderHook(() => m.useFontSettings())
    act(() => result.current.setFamily('notoSansKr'))
    act(() => result.current.setScale(1.3))
    act(() => result.current.reset())
    expect(result.current.settings.family).toBe('default')
    expect(result.current.settings.scale).toBe(1.0)
  })

  it('동일 값 set 은 no-op (변경 없음)', async () => {
    const m = await loadModule()
    const { result } = renderHook(() => m.useFontSettings())
    const setSpy = (window.api as unknown as { settings: { set: ReturnType<typeof vi.fn> } }).settings.set
    const before = setSpy.mock.calls.length
    act(() => result.current.setFamily('default'))
    expect(setSpy.mock.calls.length).toBe(before)
  })

  it('CSS var 적용', async () => {
    const m = await loadModule()
    const { result } = renderHook(() => m.useFontSettings())
    act(() => result.current.setScale(1.25))
    expect(document.documentElement.style.getPropertyValue('--app-font-scale')).toBe('1.25')
  })

  it('여러 hook 인스턴스가 상태 공유', async () => {
    const m = await loadModule()
    const a = renderHook(() => m.useFontSettings())
    const b = renderHook(() => m.useFontSettings())
    act(() => a.result.current.setFamily('serif'))
    expect(b.result.current.settings.family).toBe('serif')
  })
})

describe('useFontSettings — reconcile', () => {
  it('store 값 우선 적용', async () => {
    settingsStore['fontSettings'] = JSON.stringify({ family: 'sans', scale: 1.1 })
    const m = await loadModule()
    await m.reconcileFontFromStore()
    const { result } = renderHook(() => m.useFontSettings())
    expect(result.current.settings.family).toBe('sans')
    expect(result.current.settings.scale).toBe(1.1)
  })

  it('store 비어있으면 현재 값을 저장', async () => {
    const m = await loadModule()
    await m.reconcileFontFromStore()
    expect(settingsStore['fontSettings']).toBeTruthy()
  })

  it('store JSON 손상은 안전 무시', async () => {
    settingsStore['fontSettings'] = 'not-json'
    const m = await loadModule()
    await m.reconcileFontFromStore()
    // throw 하지 않으면 OK
    expect(true).toBe(true)
  })
})

describe('useFontSettings — initFontSettings', () => {
  it('initFontSettings 호출 시 CSS var 적용', async () => {
    localStorage.setItem('fontSettings', JSON.stringify({ family: 'pretendard', scale: 1.1 }))
    const m = await loadModule()
    m.initFontSettings()
    expect(document.documentElement.style.getPropertyValue('--app-font-scale')).toBe('1.1')
    expect(document.documentElement.style.getPropertyValue('--app-font-family')).toContain('Pretendard')
  })
})

describe('FONT_FAMILY_LABELS', () => {
  it('모든 family 에 라벨 매핑', async () => {
    const m = await loadModule()
    for (const key of ['default', 'pretendard', 'appleSystem', 'notoSansKr', 'sans', 'serif'] as const) {
      expect(m.FONT_FAMILY_LABELS[key]).toBeTruthy()
    }
  })
})
