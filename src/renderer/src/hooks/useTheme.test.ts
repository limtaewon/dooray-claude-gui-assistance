import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// window.api.settings 모킹 — 모듈 import 전에 설치
const settingsStore: Record<string, unknown> = {}
beforeEach(() => {
  for (const k of Object.keys(settingsStore)) delete settingsStore[k]
  // localStorage 도 초기화
  localStorage.clear()
  ;(window as unknown as { api: unknown }).api = {
    settings: {
      get: vi.fn(async (k: string) => settingsStore[k]),
      set: vi.fn((k: string, v: unknown) => { settingsStore[k] = v })
    }
  }
  // DOM 속성 초기화
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-palette')
})
afterEach(() => {
  vi.restoreAllMocks()
})

async function loadModule(): Promise<typeof import('./useTheme')> {
  vi.resetModules()
  return await import('./useTheme')
}

describe('useTheme — initTheme', () => {
  it('localStorage 없으면 light/cool-minimal 기본', async () => {
    const m = await loadModule()
    m.initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-palette')).toBe('cool-minimal')
  })

  it('localStorage 에 dark 가 있으면 dark 적용', async () => {
    localStorage.setItem('theme', 'dark')
    const m = await loadModule()
    m.initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.hasAttribute('data-palette')).toBe(false)
  })

  it('잘못된 값은 정규화', async () => {
    localStorage.setItem('theme', 'invalid')
    localStorage.setItem('light-palette', 'unknown')
    const m = await loadModule()
    m.initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-palette')).toBe('cool-minimal')
  })
})

describe('useTheme — hook 동작', () => {
  it('setTheme 변경 시 DOM/localStorage 반영', async () => {
    const m = await loadModule()
    const { result } = renderHook(() => m.useTheme())
    act(() => result.current.setTheme('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('toggle 으로 dark/light 교차', async () => {
    const m = await loadModule()
    const { result } = renderHook(() => m.useTheme())
    const initial = result.current.theme
    act(() => result.current.toggle())
    expect(result.current.theme).not.toBe(initial)
    act(() => result.current.toggle())
    expect(result.current.theme).toBe(initial)
  })

  it('setPalette 변경 시 data-palette 갱신 (light 모드에서만)', async () => {
    const m = await loadModule()
    const { result } = renderHook(() => m.useTheme())
    act(() => result.current.setTheme('light'))
    act(() => result.current.setPalette('soft-blue'))
    expect(document.documentElement.getAttribute('data-palette')).toBe('soft-blue')
  })

  it('동일 값 set 은 no-op', async () => {
    const m = await loadModule()
    const { result } = renderHook(() => m.useTheme())
    act(() => result.current.setTheme('light'))
    const calls = (window.api as unknown as { settings: { set: ReturnType<typeof vi.fn> } }).settings.set.mock.calls.length
    act(() => result.current.setTheme('light'))
    expect((window.api as unknown as { settings: { set: ReturnType<typeof vi.fn> } }).settings.set.mock.calls.length).toBe(calls)
  })

  it('여러 hook 인스턴스가 상태 공유', async () => {
    const m = await loadModule()
    const a = renderHook(() => m.useTheme())
    const b = renderHook(() => m.useTheme())
    act(() => a.result.current.setTheme('dark'))
    expect(b.result.current.theme).toBe('dark')
  })
})

describe('useTheme — reconcileThemeFromStore', () => {
  it('store 에 dark 가 있으면 sharedTheme 갱신', async () => {
    settingsStore['theme'] = 'dark'
    const m = await loadModule()
    await m.reconcileThemeFromStore()
    const { result } = renderHook(() => m.useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('store 에 없으면 현재 값을 store 에 기록', async () => {
    const m = await loadModule()
    const setSpy = (window.api as unknown as { settings: { set: ReturnType<typeof vi.fn> } }).settings.set
    await m.reconcileThemeFromStore()
    expect(setSpy).toHaveBeenCalled()
  })

  it('store 에 비유효 값은 무시', async () => {
    settingsStore['theme'] = 'weird'
    const m = await loadModule()
    await m.reconcileThemeFromStore()
    const { result } = renderHook(() => m.useTheme())
    expect(result.current.theme).toBe('light')
  })
})
