import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Node 26 의 실험적 localStorage 가 `--localstorage-file` 플래그 없으면 비활성이라
// jsdom 25 도 빈 채로 둠. 테스트 환경에서 localStorage 가 undefined 가 되어
// useFontSettings/useTheme 류 hook 테스트가 전부 실패하던 문제 → 메모리 폴리필 주입.
//
// `window` 를 직접 참조하면 node tsconfig (lib=ESNext, no DOM) 에서 TS2304.
// test/ 가 node + web 양쪽 tsconfig include 에 들어있어 양쪽 모두 컴파일된다.
// 따라서 globalThis 만 사용하고 `as` 캐스팅으로 DOM 의존 없이 폴리필을 꽂는다.
function ensureLocalStorage(): void {
  const g = globalThis as unknown as { localStorage?: { clear?: () => void } | undefined }
  if (g.localStorage && typeof g.localStorage.clear === 'function') return
  const store = new Map<string, string>()
  const storage = {
    get length() { return store.size },
    clear: (): void => { store.clear() },
    getItem: (key: string): string | null => (store.has(key) ? (store.get(key) as string) : null),
    key: (index: number): string | null => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string): void => { store.delete(key) },
    setItem: (key: string, value: string): void => { store.set(key, String(value)) }
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true })
}
ensureLocalStorage()

afterEach(() => {
  cleanup()
  const g = globalThis as unknown as { localStorage?: { clear: () => void } }
  if (g.localStorage) g.localStorage.clear()
})
