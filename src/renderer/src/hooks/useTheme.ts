import { useEffect, useState, useCallback } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'theme'

/** ThemePicker가 인라인으로 주입하는 라이트 팔레트 변수 키 목록 */
const PALETTE_VAR_KEYS = [
  '--bg-sidebar', '--bg-base', '--bg-surface', '--bg-surface-raised',
  '--bg-primary', '--bg-surface-hover', '--bg-subtle', '--bg-hover',
  '--bg-active', '--bg-border', '--bg-border-light', '--bg-border-strong',
  '--text-primary', '--text-secondary', '--text-tertiary'
]

function clearPaletteInlineStyles(): void {
  const root = document.documentElement
  for (const k of PALETTE_VAR_KEYS) root.style.removeProperty(k)
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
  if (theme === 'dark') {
    clearPaletteInlineStyles()
  } else {
    import('../components/Settings/ThemePicker').then((m) => m.initLightPalette()).catch(() => {})
  }
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme }))
}

function normalize(v: unknown): Theme {
  return v === 'dark' ? 'dark' : 'light'
}

/** 공유 테마 상태 (모듈 레벨).
 * 저장소는 localStorage + electron-store 이중 기록:
 * - localStorage: 빠른 FOUC 방지용 (initTheme 동기 실행)
 * - electron-store: 신뢰할 수 있는 영속성 (Chromium localStorage flush 지연 문제 회피)
 * 읽을 때는 electron-store 우선, 없으면 localStorage. */
let sharedTheme: Theme = (() => {
  try { return normalize(localStorage.getItem(STORAGE_KEY)) } catch { return 'light' }
})()
const listeners = new Set<(t: Theme) => void>()

function persistTheme(next: Theme): void {
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ok */ }
  try { window.api?.settings?.set?.(STORAGE_KEY, next) } catch { /* ok */ }
}

function setSharedTheme(next: Theme): void {
  if (sharedTheme === next) return
  console.log(`[useTheme] ${sharedTheme} → ${next}`)
  sharedTheme = next
  persistTheme(next)
  applyTheme(next)
  for (const fn of listeners) fn(next)
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const [theme, setLocal] = useState<Theme>(sharedTheme)

  useEffect(() => {
    if (sharedTheme !== theme) setLocal(sharedTheme)
    const listener = (t: Theme): void => setLocal(t)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setTheme = useCallback((t: Theme) => setSharedTheme(t), [])
  const toggle = useCallback(() => setSharedTheme(sharedTheme === 'dark' ? 'light' : 'dark'), [])

  return { theme, setTheme, toggle }
}

/** App 부트스트랩에서 동기 호출 — FOUC 방지용 (localStorage 값으로 즉시 적용). */
export function initTheme(): void {
  let v: Theme = 'light'
  try { v = normalize(localStorage.getItem(STORAGE_KEY)) } catch { /* ok */ }
  sharedTheme = v
  applyTheme(v)
}

/** 앱 부트스트랩 이후 electron-store의 영속 값으로 교정 (localStorage보다 우선).
 * main 프로세스의 store는 디스크 즉시 기록되어 SIGTERM에도 안전. */
export async function reconcileThemeFromStore(): Promise<void> {
  try {
    const stored = await window.api?.settings?.get?.(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') {
      if (sharedTheme !== stored) {
        console.log(`[useTheme] reconcile localStorage=${sharedTheme} → store=${stored}`)
        sharedTheme = stored
        try { localStorage.setItem(STORAGE_KEY, stored) } catch { /* ok */ }
        applyTheme(stored)
        for (const fn of listeners) fn(stored)
      }
    } else if (sharedTheme) {
      // store가 비어있으면 현재 값을 store에 기록
      window.api?.settings?.set?.(STORAGE_KEY, sharedTheme)
    }
  } catch { /* ok */ }
}
