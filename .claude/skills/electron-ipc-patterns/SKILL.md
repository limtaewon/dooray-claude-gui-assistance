---
name: electron-ipc-patterns
description: Clauday 에 IPC 채널을 추가하거나 수정할 때 따라야 하는 3+1 규칙 패턴. 새 IPC 작업 진입 시 항상 트리거.
---

# electron-ipc-patterns

> Clauday 의 IPC 는 *한 곳에서* 누락되면 전체가 깨진다. 본 스킬은 그 누락을 막는 체크리스트.

## 트리거 조건

- 새 IPC 채널 추가
- 기존 채널의 payload/result 타입 변경
- 채널 삭제 (deprecation)

## 핵심 자료

- `src/shared/types/ipc.ts` — `IPC_CHANNELS` 단일 카탈로그
- `src/preload/index.ts` — contextBridge expose
- `src/main/index.ts` — `ipcMain.handle` 등록
- `.agent/wiki/domain-electron-ipc.md` — 상세 도메인

## 새 채널 추가 절차

### 1. shared 타입 정의

```ts
// src/shared/types/<domain>.ts (없으면 신규)
export interface FooListResult {
  items: FooItem[]
}

// src/shared/types/ipc.ts
export const IPC_CHANNELS = {
  // ... 기존 ...
  FOO_LIST: 'foo:list',  // ← 추가
} as const
```

### 2. preload 노출

```ts
// src/preload/index.ts
import { IPC_CHANNELS } from '../shared/types/ipc'

contextBridge.exposeInMainWorld('api', {
  // ... 기존 ...
  foo: {
    list: (): Promise<FooListResult> => ipcRenderer.invoke(IPC_CHANNELS.FOO_LIST),
  },
})
```

`window.api` 의 타입은 `src/renderer/src/types/window.d.ts` (있으면) 에 동기.

### 3. main 핸들러 등록

```ts
// src/main/index.ts
import { fooService } from './foo/FooService'

// ... 부팅 시 ...
ipcMain.handle(IPC_CHANNELS.FOO_LIST, async () => {
  return fooService.list()  // 얇은 어댑터만, 로직은 service 안
})
```

### 4. 단위 테스트 (service)

```ts
// src/main/foo/FooService.test.ts
import { describe, it, expect } from 'vitest'
import { FooService } from './FooService'

describe('FooService.list', () => {
  it('빈 상태에서 빈 배열 반환', () => {
    expect(new FooService().list()).toEqual({ items: [] })
  })
})
```

## main → renderer push (요청-응답 아닌 경우)

```ts
// main
mainWindow.webContents.send(IPC_CHANNELS.FOO_EVENT, payload)

// preload
contextBridge.exposeInMainWorld('api', {
  foo: {
    onEvent: (cb: (payload: FooEvent) => void): (() => void) => {
      const listener = (_: unknown, p: FooEvent): void => cb(p)
      ipcRenderer.on(IPC_CHANNELS.FOO_EVENT, listener)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.FOO_EVENT, listener)
    },
  },
})
```

**반드시 unsubscribe 함수 반환**. 컴포넌트 unmount 시 누수 방지.

## 함정

- **`undefined` 직렬화 안 됨**: 옵셔널 필드는 `null` 명시 또는 필드 자체 생략.
- **Date 객체**: string 으로 직렬화. 양쪽 타입 정의에서 `string` 으로.
- **Buffer**: Uint8Array 로 직렬화. 양쪽 타입 정의에서 명시.
- **handler 의 throw**: 렌더러 측 `await` 가 reject. swallow 금지 — 사용자에게 정확한 에러 메시지 전달.
- **순서**: 위 1→2→3→4 순서. 1 빠뜨리면 타입에러로 잡힘 (좋음). 2 빠뜨리면 런타임 "is not a function". 3 빠뜨리면 "No handler registered".

## 채널 삭제 (deprecation)

1. 사용처 grep — 0개여야 함
2. main 핸들러 삭제
3. preload 함수 삭제
4. shared 채널 상수 삭제
5. payload 타입은 다른 곳에서 안 쓰면 같이 삭제

`@deprecated` 주석으로 유예 없이 바로 삭제 가능 — 개인 레포 모드 (외부 API 호환성 불필요).

## 매뉴얼 갱신

새 IPC 가 *사용자에게 보이는 기능* 의 일부면 → `ClaudeManual.tsx` SECTIONS 갱신 의무.
