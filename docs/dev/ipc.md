# IPC 채널: 통신 프로토콜 & 확장 가이드

Clauday의 Renderer ↔ Main 통신은 모두 IPC(Inter-Process Communication) 채널을 통합니다. 이 문서는 기존 채널을 이해하고 새로운 채널을 추가하는 방법을 설명합니다.

## 핵심 개념

### IPC 채널이란?
- **채널 상수**: `src/shared/types/ipc.ts`의 `IPC_CHANNELS` 객체에 정의된 문자열 키
- **Preload 노출**: `src/preload/index.ts`에서 `window.api.<도메인>.<메서드>`로 메서드화
- **Main 핸들러**: `src/main/index.ts`의 `ipcMain.handle()` 또는 `ipcMain.on()`으로 구현

### 통신 방식 (3가지)

#### 1. Invoke (요청 → 응답)
Renderer가 Main에 요청하고 응답을 받을 때까지 대기.
- Preload: `ipcRenderer.invoke(channel, args)`
- Main: `ipcMain.handle(channel, (event, args) => response)`
- 타입: `Promise<ResponseType>`

```typescript
// Renderer
const tasks = await window.api.dooray.tasks.list()  // 블로킹

// Preload
tasks: {
  list: (): Promise<DoorayTask[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASKS_LIST)
}

// Main
ipcMain.handle(IPC_CHANNELS.DOORAY_TASKS_LIST, async (_, projectIds) => {
  return await taskService.listTasks(projectIds)
})
```

#### 2. Send (비동기 메시지)
Renderer가 Main에 메시지를 보내지만 응답을 받지 않음.
- Preload: `ipcRenderer.send(channel, args)`
- Main: `ipcMain.on(channel, (event, args) => { ... })`
- 타입: `void`

```typescript
// Renderer (응답 대기 없음)
window.api.terminal.input(terminalId, 'ls\n')

// Preload
terminal: {
  input: (id: string, data: string): void =>
    ipcRenderer.send(IPC_CHANNELS.TERMINAL_INPUT, { id, data })
}

// Main
ipcMain.on(IPC_CHANNELS.TERMINAL_INPUT, (_, { id, data }) => {
  terminalManager.input(id, data)
})
```

#### 3. On (구독식 이벤트)
Main이 Renderer에 메시지를 보냄. Renderer는 여러 번 수신할 수 있음.
- Main: `mainWindow.webContents.send(channel, data)`
- Preload: `ipcRenderer.on(channel, (event, data) => handler(data))`
- Renderer: `window.api.<도메인>.on<Event>((data) => { ... })`
- 타입: `() => void` (cleanup 함수 반환)

```typescript
// Main (계속 보냄)
mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_OUTPUT, { id: 'term1', data: 'output' })

// Preload (구독 관리)
terminal: {
  onOutput: (callback: (payload) => void): (() => void) => {
    subscribeTerminalOutput(callback)  // cleanup 함수 반환
  }
}

// Renderer (구독)
useEffect(() => {
  const unsub = window.api.terminal.onOutput(({ id, data }) => {
    // 터미널 id의 출력 받음
  })
  return unsub  // cleanup
}, [])
```

## IPC 채널 추가 절차 (3단계)

새로운 기능을 위해 IPC 채널을 추가해야 한다면 이 순서를 반드시 따르세요.

### Step 1: 타입 정의 (shared/types/)

먼저 요청/응답 타입을 정의합니다. 기존 파일에 추가하거나 새 파일을 만듭니다.

**예 1: 기존 타입 활용**
```typescript
// shared/types/ipc.ts에 채널 상수 추가
export const IPC_CHANNELS = {
  // ... 기존 채널들
  
  // 새 채널 추가
  MY_FEATURE_GET: 'my-feature:get',
  MY_FEATURE_UPDATE: 'my-feature:update',
}
```

**예 2: 별도 타입 파일 필요**
```typescript
// shared/types/my-feature.ts (신규)
export interface MyFeatureData {
  id: string
  name: string
  config: Record<string, unknown>
}

export interface MyFeatureUpdateRequest {
  id: string
  name?: string
  config?: Record<string, unknown>
}

// shared/types/ipc.ts
export const IPC_CHANNELS = {
  MY_FEATURE_GET: 'my-feature:get',
  MY_FEATURE_UPDATE: 'my-feature:update',
  MY_FEATURE_DELETE: 'my-feature:delete',
}
```

**규칙**:
- `IPC_CHANNELS` 키는 camelCase (예: `MY_FEATURE_GET`)
- 채널 값은 `domain:action` 형식 (예: `'my-feature:get'`)
- 같은 도메인의 채널들을 함께 정의

### Step 2: Preload 노출 (src/preload/index.ts)

`window.api.<도메인>.<메서드>`로 메서드를 조립합니다.

**Invoke 메서드 (요청-응답)**
```typescript
// src/preload/index.ts
import type { MyFeatureData, MyFeatureUpdateRequest } from '../shared/types/my-feature'

const api = {
  myFeature: {
    get: (id: string): Promise<MyFeatureData> =>
      ipcRenderer.invoke(IPC_CHANNELS.MY_FEATURE_GET, id),
    
    update: (req: MyFeatureUpdateRequest): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MY_FEATURE_UPDATE, req),
    
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.MY_FEATURE_DELETE, id),
  }
}

// Renderer에서 사용
await window.api.myFeature.get('id-123')
```

**Send 메서드 (단방향)**
```typescript
const api = {
  myFeature: {
    notify: (message: string): void =>
      ipcRenderer.send(IPC_CHANNELS.MY_FEATURE_NOTIFY, message)
  }
}

// Renderer에서
window.api.myFeature.notify('hello')  // 응답 없음
```

**On 메서드 (구독)**
```typescript
const myFeatureHandlers = new Set<(data: MyFeatureEvent) => void>()
let myFeatureSubscribed = false

function subscribeMyFeatureEvent(cb: (data: MyFeatureEvent) => void): () => void {
  myFeatureHandlers.add(cb)
  if (!myFeatureSubscribed) {
    myFeatureSubscribed = true
    ipcRenderer.on(IPC_CHANNELS.MY_FEATURE_EVENT, (_, data: MyFeatureEvent) => {
      for (const h of myFeatureHandlers) {
        try { h(data) } catch { /* ignore */ }
      }
    })
  }
  return () => { myFeatureHandlers.delete(cb) }
}

const api = {
  myFeature: {
    onEvent: (cb: (data: MyFeatureEvent) => void): (() => void) =>
      subscribeMyFeatureEvent(cb)
  }
}

// Renderer에서
const unsub = window.api.myFeature.onEvent((data) => {
  console.log(data)
})
// 정리 시
unsub()
```

**타입 export 확인**:
```typescript
// preload 끝에
export type CloverAPI = typeof api
// Renderer에서 window.api의 타입이 자동 완성됨
```

### Step 3: Main 핸들러 (src/main/index.ts)

IPC 채널을 처리하는 로직을 구현합니다. 약 1500줄 파일이므로 도메인별로 섹션을 나누어 추가하세요.

**Invoke 핸들러**
```typescript
// src/main/index.ts (또는 도메인 서비스 클래스에 로직 구현)

// MyFeatureService 클래스 생성 (선택사항)
class MyFeatureService {
  async get(id: string): Promise<MyFeatureData> {
    // 파일/DB/API 접근
    return { id, name: '...', config: {} }
  }
  
  async update(req: MyFeatureUpdateRequest): Promise<void> {
    // 유효성 검사 + 저장
    if (!req.id) throw new Error('ID required')
    // ...
  }
}

// src/main/index.ts에서
const myFeatureService = new MyFeatureService()

// IPC 핸들러 등록
ipcMain.handle(IPC_CHANNELS.MY_FEATURE_GET, async (_, id: string) => {
  try {
    return await myFeatureService.get(id)
  } catch (err) {
    console.error('[MyFeatureService] GET 실패:', err)
    throw err  // Renderer에 에러 전파
  }
})

ipcMain.handle(IPC_CHANNELS.MY_FEATURE_UPDATE, async (_, req: MyFeatureUpdateRequest) => {
  try {
    await myFeatureService.update(req)
  } catch (err) {
    console.error('[MyFeatureService] UPDATE 실패:', err)
    throw err
  }
})

ipcMain.handle(IPC_CHANNELS.MY_FEATURE_DELETE, async (_, id: string) => {
  try {
    await myFeatureService.delete(id)
  } catch (err) {
    console.error('[MyFeatureService] DELETE 실패:', err)
    throw err
  }
})
```

**Send 핸들러**
```typescript
ipcMain.on(IPC_CHANNELS.MY_FEATURE_NOTIFY, (_, message: string) => {
  console.log('[MyFeature] 알림:', message)
  // 응답 불필요
})
```

**Event 브로드캐스트**
```typescript
// Main에서 특정 시점에 Renderer로 메시지 전송
// (예: 파일 변경 감지, 외부 API 이벤트)
myFeatureService.onEvent((event) => {
  mainWindow.webContents.send(IPC_CHANNELS.MY_FEATURE_EVENT, event)
})
```

**에러 처리**:
```typescript
ipcMain.handle(IPC_CHANNELS.MY_FEATURE_GET, async (_, id: string) => {
  try {
    // ...
  } catch (err) {
    // Renderer에서 catch할 수 있도록 Error 객체 전파
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[MyFeatureService] 조회 실패: ${message}`)
    throw new Error(message)  // Renderer의 await에서 catch됨
  }
})

// Renderer에서
try {
  const data = await window.api.myFeature.get(id)
} catch (err) {
  setError(err.message)
}
```

## 주요 IPC 채널 카탈로그

이미 추가된 채널들의 개요입니다. 자세한 내용은 각 도메인 문서를 참고하세요.

### Dooray (두레이 REST API)
| 채널 | 형식 | 설명 |
|-----|------|------|
| `dooray:token:*` | invoke | 토큰 저장/조회/검증 |
| `dooray:projects:list` | invoke | 프로젝트 목록 |
| `dooray:tasks:list` | invoke | 태스크 목록 (페이지네이션 지원) |
| `dooray:tasks:partial` | on | 프로젝트별 점진 로딩 이벤트 |
| `dooray:task:create` | invoke | 빠른 태스크 생성 |
| `dooray:wiki:storage:*` | invoke | 위키 저장소 (스킬/MCP 공유) |
| `dooray:messenger:channels` | invoke | 메신저 채널 목록 |
| `dooray:messenger:send` | invoke | 메시지 송신 |

### Terminal (터미널 관리)
| 채널 | 형식 | 설명 |
|-----|------|------|
| `terminal:create` | invoke | 새 터미널 세션 생성 |
| `terminal:input` | send | 입력 전송 |
| `terminal:resize` | send | 크기 조정 |
| `terminal:kill` | invoke | 세션 종료 |
| `terminal:list` | invoke | 활성 세션 목록 |
| `terminal:output` | on | 터미널 출력 구독 |
| `terminal:restore` | invoke | 저장된 세션 복원 |

### Claude (Claude Code 통합)
| 채널 | 형식 | 설명 |
|-----|------|------|
| `claude:chat:send` | invoke | 채팅 메시지 전송 |
| `claude:chat:event` | on | 스트리밍 이벤트 구독 |
| `claude:session:list` | invoke | 디스크 세션 목록 |
| `claude:session:load` | invoke | 세션 메시지 로드 |
| `claude:session:rename` | invoke | 세션 이름 변경 |
| `claude:attachment:save` | invoke | 첨부 파일 저장 |

### AI (Claude API)
| 채널 | 형식 | 설명 |
|-----|------|------|
| `ai:available` | invoke | 인증 상태 확인 |
| `ai:ask` | invoke | 프롬프트 실행 |
| `ai:briefing` | invoke | AI 브리핑 생성 |
| `ai:progress` | on | 진행 상황 구독 |
| `ai:model-config:*` | invoke | 모델 설정 조회/저장 |

### CalDAV (캘린더, v1.5)
| 채널 | 형식 | 설명 |
|-----|------|------|
| `caldav:test-connect` | invoke | 연결 테스트 |
| `caldav:save-credentials` | invoke | 자격증명 저장 |
| `caldav:list-calendars` | invoke | 캘린더 목록 |
| `caldav:list-events` | invoke | 일정 조회 |
| `caldav:full-sync` | invoke | 전체 동기화 |
| `caldav-updated` | on | 데이터 변경 알림 |

### MCP & Skills
| 채널 | 형식 | 설명 |
|-----|------|------|
| `mcp:list` | invoke | MCP 서버 목록 |
| `mcp:add` / `update` / `delete` | invoke | MCP 추가/수정/삭제 |
| `skills:list` | invoke | 스킬 목록 |
| `skills:save` | invoke | 스킬 저장 |
| `skills:import` | invoke | 파일에서 import |

### Watcher (메신저 모니터링)
| 채널 | 형식 | 설명 |
|-----|------|------|
| `watcher:list` | invoke | 와처 규칙 목록 |
| `watcher:create` / `update` / `delete` | invoke | 규칙 관리 |
| `watcher:messages` | invoke | 수집된 메시지 |
| `watcher:new-messages` | on | 새 메시지 이벤트 |

### Bot (두레이 봇, Socket Mode)
| 채널 | 형식 | 설명 |
|-----|------|------|
| `bot:get-config` | invoke | 봇 설정 조회 |
| `bot:set-config` | invoke | 봇 설정 저장 |
| `bot:get-status` | invoke | 연결 상태 |
| `bot:start` / `stop` | invoke | 시작/중지 |
| `bot:state-update` | on | 상태 변화 알림 |
| `bot:event` | on | WebSocket 이벤트 |

더 자세한 카탈로그는 [src/shared/types/ipc.ts](../../src/shared/types/ipc.ts)를 참고하세요.

## 에러 처리 패턴

### Main에서 에러 로깅
```typescript
ipcMain.handle(IPC_CHANNELS.MY_FEATURE_GET, async (_, id: string) => {
  try {
    return await myFeatureService.get(id)
  } catch (err) {
    // 1) 표준 로그 (개발자용)
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[MyFeatureService] GET 실패: ${message}`)
    
    // 2) 사용자 친화 메시지와 함께 throw
    throw new Error(`기능을 불러올 수 없습니다: ${message}`)
  }
})
```

### Renderer에서 에러 처리
```typescript
try {
  const data = await window.api.myFeature.get(id)
  setData(data)
} catch (err) {
  // Main에서 throw한 Error 메시지
  const errorMsg = err instanceof Error ? err.message : String(err)
  setError(errorMsg)
  
  // IPC 자체 실패 (타임아웃 등)
  if (errorMsg.includes('remote method')) {
    setError('앱과의 통신 실패. 잠깐 후 다시 시도하세요.')
  }
}
```

## 성능 최적화

### 1. 배치 요청
많은 항목을 한 번에 요청하는 것이 여러 번 호출하는 것보다 효율적입니다.

```typescript
// 나쁜 예
for (const id of ids) {
  const item = await window.api.myFeature.get(id)  // N개 호출
}

// 좋은 예
const items = await window.api.myFeature.getBatch(ids)  // 1회 호출
```

### 2. 이벤트 구독 (폴링 대신)
```typescript
// 나쁜 예: 폴링
setInterval(async () => {
  const status = await window.api.myFeature.getStatus()
  setStatus(status)
}, 1000)

// 좋은 예: 이벤트 구독
useEffect(() => {
  const unsub = window.api.myFeature.onStatusChanged((status) => {
    setStatus(status)
  })
  return unsub
}, [])
```

### 3. 캐싱
Main에서 자주 읽는 데이터는 메모리 캐시를 활용합니다.

```typescript
class MyFeatureService {
  private cache: Map<string, MyFeatureData> = new Map()
  
  async get(id: string): Promise<MyFeatureData> {
    if (this.cache.has(id)) {
      return this.cache.get(id)!
    }
    const data = await this.fetchFromFile(id)
    this.cache.set(id, data)
    return data
  }
  
  invalidateCache(id: string): void {
    this.cache.delete(id)
  }
}
```

## IPC 추가 체크리스트

새로운 IPC 채널을 추가할 때 이 체크리스트를 사용하세요.

- [ ] **Step 1: 타입 정의**
  - [ ] `src/shared/types/ipc.ts`의 `IPC_CHANNELS`에 채널 상수 추가
  - [ ] 필요시 별도 타입 파일 생성 (예: `src/shared/types/my-feature.ts`)
  - [ ] 요청/응답 타입 정의 (interface)

- [ ] **Step 2: Preload 노출**
  - [ ] `src/preload/index.ts`에 도메인 객체 추가 (없으면 신규 생성)
  - [ ] 메서드 시그니처 작성 (invoke/send/on 구분)
  - [ ] 타입 import 확인

- [ ] **Step 3: Main 핸들러**
  - [ ] `src/main/index.ts`에 `ipcMain.handle()` 또는 `ipcMain.on()` 등록
  - [ ] 에러 처리 및 콘솔 로깅
  - [ ] 타입 검증 (꼭 필요한 경우)

- [ ] **테스트**
  - [ ] Renderer에서 `await window.api.<도메인>.<메서드>()` 호출 테스트
  - [ ] 성공/실패 케이스 확인
  - [ ] 타입 오류 없는지 확인

- [ ] **문서화**
  - [ ] [domains/](./domains/) 문서에 채널 설명 추가 (필요시)
  - [ ] 코드 주석 추가 (non-obvious 로직)

## 자주 묻는 질문

**Q: Invoke 타임아웃이 자주 나요.**
A: Main의 핸들러가 오래 걸리거나 응답하지 않을 수 있습니다. `console.error`로 Main 로그를 확인하세요. 필요시 비동기 작업을 백그라운드로 이동하고 On 이벤트로 결과를 전달할 수 있습니다.

**Q: 구독 이벤트를 cleanup 못 하면 어떻게 되나요?**
A: 메모리 누수. 여러 번 호출할 때마다 핸들러가 중첩되어 같은 이벤트가 반복 호출됩니다. 항상 `useEffect` cleanup에서 `unsub()`을 호출하세요.

**Q: 민감한 데이터(토큰)를 어떻게 다루나요?**
A: Main에서만 처리. Renderer는 절대 로컬 스토리지에 저장하지 마세요. `keytar`(OS 키체인) 또는 `electron-store` 암호화로 Main에 저장하세요.

더 자세한 질문은 [troubleshooting.md](./troubleshooting.md)를 참고하세요.
