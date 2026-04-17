import { useEffect, useState, useCallback } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'theme'

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
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
