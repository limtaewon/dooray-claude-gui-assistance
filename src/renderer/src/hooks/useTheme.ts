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
  // 다크 모드에서는 ThemePicker의 라이트 팔레트 인라인 스타일이 남아있으면
  // [data-theme='dark'] 규칙이 덮어쓰이지 못하므로 제거.
  if (theme === 'dark') {
    clearPaletteInlineStyles()
  } else {
    // 라이트로 돌아오면 저장된 팔레트 다시 주입 (FOUC 재방지)
    // 동적 import로 순환 참조 방지
    import('../components/Settings/ThemePicker').then((m) => m.initLightPalette()).catch(() => {})
  }
  // 테마 전환 이벤트 브로드캐스트 (캐시 가진 컴포넌트들이 무효화할 수 있게)
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme }))
}

function readStored(): Theme {
  const v = localStorage.getItem(STORAGE_KEY)
  // 기본값: light
  return v === 'dark' ? 'dark' : 'light'
}

export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>(() => readStored())

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = useCallback((t: Theme) => setThemeState(t), [])
  const toggle = useCallback(() => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')), [])

  return { theme, setTheme, toggle }
}

// App 부트스트랩에서 한번 호출하여 FOUC 방지
export function initTheme(): void {
  applyTheme(readStored())
}
