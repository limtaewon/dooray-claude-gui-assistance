---
name: vitest-patterns
description: Clauday 의 vitest 단위 테스트 작성 패턴 (Electron main/preload 의존 코드, 시간 의존, 플랫폼 분기, IPC 핸들러). 테스트 작성 시 트리거.
---

# vitest-patterns

## 설정

- 러너: `vitest` (watch 모드 없음, `--run` 으로 1회 실행)
- 설정 파일: `vitest.config.ts`
- 커버리지: 라인 70% (thresholds)
- 명령:
  - `npm test` — 전체 1회
  - `npx vitest run <path>` — 특정 파일/디렉터리

## 파일 규칙

- 테스트는 대상 옆: `FooService.ts` ↔ `FooService.test.ts`
- 별도 위치: `test/` 디렉터리 (현재 적게 사용)
- describe 블록명 = 클래스 또는 함수 이름

## 기본 템플릿

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FooService } from './FooService'

describe('FooService', () => {
  let service: FooService

  beforeEach(() => {
    service = new FooService()
  })

  describe('list', () => {
    it('빈 상태에서 빈 배열 반환', () => {
      expect(service.list()).toEqual({ items: [] })
    })

    it('add 후 list 시 추가된 항목 포함', () => {
      service.add({ id: '1', name: 'a' })
      expect(service.list().items).toHaveLength(1)
    })
  })
})
```

## Electron 의존 코드

`electron` import 가 필요한 곳은 모듈 boundary 에서 mock:

```ts
vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/clauday-test') },
  BrowserWindow: vi.fn(),
  ipcMain: { handle: vi.fn() },
}))
```

권장: **electron 직접 의존을 service 클래스에서 분리**. service 는 인자로 `userDataPath` 같은 의존 받고, IPC 핸들러 어댑터에서만 `app.getPath` 등 호출.

## electron-store mock

```ts
vi.mock('electron-store', () => {
  const map = new Map()
  return {
    default: vi.fn().mockImplementation(() => ({
      get: (k: string) => map.get(k),
      set: (k: string, v: unknown) => { map.set(k, v) },
      delete: (k: string) => { map.delete(k) },
    })),
  }
})
```

## keytar mock

```ts
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(null),
    setPassword: vi.fn().mockResolvedValue(undefined),
    deletePassword: vi.fn().mockResolvedValue(true),
  },
}))
```

## child_process spawn / execFile mock

```ts
vi.mock('child_process', () => ({
  spawn: vi.fn().mockImplementation(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    stdin: { write: vi.fn(), end: vi.fn(), on: vi.fn() },
    on: vi.fn((event, cb) => {
      if (event === 'close') setTimeout(() => cb(0), 0)
    }),
    kill: vi.fn(),
  })),
  execFile: vi.fn(),
  execFileSync: vi.fn().mockReturnValue(Buffer.from('mock-output')),
}))
```

## 시간 의존 코드

```ts
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

it('3초 후 timeout', () => {
  const cb = vi.fn()
  setTimeout(cb, 3000)
  vi.advanceTimersByTime(3000)
  expect(cb).toHaveBeenCalled()
})
```

## 플랫폼 분기

```ts
const originalPlatform = process.platform

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
})

it('Mac 분기', () => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  // ... 검증
})

it('Windows 분기', () => {
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  // ... 검증
})
```

## 비동기

```ts
it('비동기 메서드', async () => {
  await expect(service.fetch()).resolves.toEqual(...)
  await expect(service.fail()).rejects.toThrow('reason')
})
```

## Snapshot — 가급적 *지양*

UI 컴포넌트 테스트가 아니라면 snapshot 보다 *명시적 assertion* 권장. snapshot 은 갱신 비용이 큼.

## 안티 패턴

- **같은 src/main/ 안의 다른 service 끼리 mock 금지**. 실제 인스턴스 사용.
- **expect(...).toBe(true)/false 만**: 무엇을 검증하는지 불명. 구체적인 값/구조로.
- **테스트마다 fixture 거대화**: 헬퍼 함수 추출.
- **테스트가 race 발생**: vitest 는 기본 병렬. 전역 상태 (electron-store mock 의 map 등) 는 beforeEach 에서 리셋.

## 커버리지 게이트

```
$ npm test
...
File           | % Stmts | % Branch | % Funcs | % Lines |
---------------|---------|----------|---------|---------|
All files      |   85.2  |    78.4  |   91.3  |   85.2  |
src/main/foo   |   72.4  |    65.0  |   80.0  |   72.4  |
src/main/bar   |   45.1  |    30.0  |   60.0  |   45.1  | ← 70% 미달 → 추가 테스트
```

신규 모듈로 *전체* 커버리지를 떨어뜨리지 말 것 (vitest.config thresholds 가 실패 시키지만, 그 전에 본인이 확인).
