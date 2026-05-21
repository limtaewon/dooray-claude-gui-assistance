import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Node 26 의 실험적 localStorage 가 `--localstorage-file` 플래그 없으면 비활성이라
// jsdom 25 도 빈 채로 둠. 테스트 환경에서 localStorage 가 undefined 가 되어
// useFontSettings/useTheme 류 hook 테스트가 전부 실패하던 문제 → 메모리 폴리필 주입.
function ensureLocalStorage(): void {
  if (typeof window === 'undefined') return
  if (window.localStorage && typeof window.localStorage.clear === 'function') return
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, String(value))
  }
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
  Object.defineProperty(window, 'sessionStorage', { value: storage, configurable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true })
}
ensureLocalStorage()

afterEach(() => {
  cleanup()
  if (typeof localStorage !== 'undefined') localStorage.clear()
})
