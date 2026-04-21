import { useEffect, useState, useCallback } from 'react'

export type Theme = 'dark' | 'light'
export type Palette = 'cool-minimal' | 'crisp-white' | 'soft-blue' | 'graphite' | 'paper'

export const PALETTES: readonly Palette[] = ['cool-minimal', 'crisp-white', 'soft-blue', 'graphite', 'paper'] as const
export const PALETTE_LABELS: Record<Palette, { name: string; description: string }> = {
  'cool-minimal': { name: 'Cool Minimal', description: '차가운 중성 — 기본값' },
  'crisp-white':  { name: 'Crisp White',  description: '거의 순백, 높은 대비' },
  'soft-blue':    { name: 'Soft Blue',    description: '은은한 블루 그레이 — 장시간 코딩' },
  'graphite':     { name: 'Graphite',     description: '짙은 중성 그레이' },
  'paper':        { name: 'Paper',        description: '따뜻한 웜 그레이 (종이 느낌)' }
}

const THEME_KEY = 'theme'
const PALETTE_KEY = 'light-palette'

/** 라이트 팔레트 인라인 주입 시 사용하는 변수 키 (레거시 ThemePicker 호환용) */
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

function normalizeTheme(v: unknown): Theme {
  return v === 'dark' ? 'dark' : 'light'
}

function normalizePalette(v: unknown): Palette {
  return PALETTES.includes(v as Palette) ? (v as Palette) : 'cool-minimal'
}

/** DOM에 테마/팔레트 속성 반영. 라이트 모드에만 data-palette 부여.
 *  디자인 시스템 CSS는 [data-theme='light'][data-palette='<id>'] 셀렉터로 동작. */
function applyToDom(theme: Theme, palette: Palette): void {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  if (theme === 'light') {
    root.setAttribute('data-palette', palette)
  } else {
    // 다크 모드에서는 팔레트가 의미 없음 + 레거시 인라인 스타일 제거
    root.removeAttribute('data-palette')
    clearPaletteInlineStyles()
  }
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme, palette } }))
}

/* ============================================================
   공유 상태 (모듈 레벨) + pub/sub
   저장소: localStorage (FOUC 방지) + electron-store (SIGTERM 대응)
   ============================================================ */
let sharedTheme: Theme = (() => {
  try { return normalizeTheme(localStorage.getItem(THEME_KEY)) } catch { return 'light' }
})()
let sharedPalette: Palette = (() => {
  try { return normalizePalette(localStorage.getItem(PALETTE_KEY)) } catch { return 'cool-minimal' }
})()

type Listener = (state: { theme: Theme; palette: Palette }) => void
const listeners = new Set<Listener>()

function persistTheme(next: Theme): void {
  try { localStorage.setItem(THEME_KEY, next) } catch { /* ok */ }
  try { window.api?.settings?.set?.(THEME_KEY, next) } catch { /* ok */ }
}
function persistPalette(next: Palette): void {
  try { localStorage.setItem(PALETTE_KEY, next) } catch { /* ok */ }
  try { window.api?.settings?.set?.(PALETTE_KEY, next) } catch { /* ok */ }
}

function notify(): void {
  const snapshot = { theme: sharedTheme, palette: sharedPalette }
  for (const fn of listeners) fn(snapshot)
}

function setSharedTheme(next: Theme): void {
  if (sharedTheme === next) return
  sharedTheme = next
  persistTheme(next)
  applyToDom(sharedTheme, sharedPalette)
  notify()
}
function setSharedPalette(next: Palette): void {
  if (sharedPalette === next) return
  sharedPalette = next
  persistPalette(next)
  applyToDom(sharedTheme, sharedPalette)
  notify()
}

export function useTheme(): {
  theme: Theme
  palette: Palette
  setTheme: (t: Theme) => void
  setPalette: (p: Palette) => void
  toggle: () => void
} {
  const [state, setLocal] = useState<{ theme: Theme; palette: Palette }>({
    theme: sharedTheme, palette: sharedPalette
  })

  useEffect(() => {
    if (sharedTheme !== state.theme || sharedPalette !== state.palette) {
      setLocal({ theme: sharedTheme, palette: sharedPalette })
    }
    const listener: Listener = (s) => setLocal(s)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setTheme = useCallback((t: Theme) => setSharedTheme(t), [])
  const setPalette = useCallback((p: Palette) => setSharedPalette(p), [])
  const toggle = useCallback(() => setSharedTheme(sharedTheme === 'dark' ? 'light' : 'dark'), [])

  return { theme: state.theme, palette: state.palette, setTheme, setPalette, toggle }
}

/** App 부트스트랩 동기 호출 — FOUC 방지 (localStorage 값으로 즉시 적용). */
export function initTheme(): void {
  try { sharedTheme = normalizeTheme(localStorage.getItem(THEME_KEY)) } catch { /* ok */ }
  try { sharedPalette = normalizePalette(localStorage.getItem(PALETTE_KEY)) } catch { /* ok */ }
  applyToDom(sharedTheme, sharedPalette)
}

/** 부트 이후 electron-store 값으로 교정 (localStorage가 flush 안된 경우 대비) */
export async function reconcileThemeFromStore(): Promise<void> {
  try {
    const [storedTheme, storedPalette] = await Promise.all([
      window.api?.settings?.get?.(THEME_KEY),
      window.api?.settings?.get?.(PALETTE_KEY)
    ])
    let changed = false
    if (storedTheme === 'dark' || storedTheme === 'light') {
      if (sharedTheme !== storedTheme) { sharedTheme = storedTheme; changed = true }
    } else if (sharedTheme) {
      window.api?.settings?.set?.(THEME_KEY, sharedTheme)
    }
    if (PALETTES.includes(storedPalette as Palette)) {
      if (sharedPalette !== storedPalette) { sharedPalette = storedPalette as Palette; changed = true }
    } else if (sharedPalette) {
      window.api?.settings?.set?.(PALETTE_KEY, sharedPalette)
    }
    if (changed) {
      try { localStorage.setItem(THEME_KEY, sharedTheme) } catch { /* ok */ }
      try { localStorage.setItem(PALETTE_KEY, sharedPalette) } catch { /* ok */ }
      applyToDom(sharedTheme, sharedPalette)
      notify()
    }
  } catch { /* ok */ }
}
