# 코드 컨벤션 & 스타일 가이드

Clauday의 코드는 일관된 스타일을 유지하기 위해 명확한 컨벤션을 따릅니다. 이 문서는 새로운 기능 개발 시 준수할 규칙들을 정리합니다.

## TypeScript & 타입 안전성

### 엄격한 타입 (Strict Mode)

프로젝트는 `tsconfig.json`에서 TypeScript strict 모드가 활성화되어 있습니다.

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

**규칙**:
1. **모든 변수에 타입 명시** (any 금지)
   ```typescript
   // ❌ 나쁜 예
   const data = fetchSomething()  // any 추론

   // ✅ 좋은 예
   const data: MyDataType = fetchSomething()
   ```

2. **null/undefined 명확히 처리**
   ```typescript
   // ❌ 나쁜 예
   const value = getValue()
   return value.toString()  // null이면 에러

   // ✅ 좋은 예
   const value = getValue()
   return value?.toString() ?? ''  // 안전
   ```

3. **Generic 사용**
   ```typescript
   // ❌ 나쁜 예
   async function list(): Promise<any[]> {
     return fetch('...').then(r => r.json())
   }

   // ✅ 좋은 예
   async function list<T>(): Promise<T[]> {
     return fetch('...').then(r => r.json())
   }
   ```

### 공용 타입 정의 (shared/types/)

Main과 Renderer에서 공유하는 타입은 반드시 `src/shared/types/`에 정의합니다.

```typescript
// ✅ 좋은 예
// shared/types/dooray.ts
export interface DoorayTask {
  id: string
  subject: string
  status: 'registered' | 'working' | 'completed'
  assigneeIds?: string[]
}

// main에서 import
import type { DoorayTask } from '../../shared/types/dooray'

// renderer에서 import (별칭 사용)
import type { DoorayTask } from '@shared/types/dooray'
```

**규칙**:
- `shared/types/`의 타입은 **데이터 구조만** (로직 없음)
- 도메인별 파일로 정리 (예: `dooray.ts`, `terminal.ts`, `caldav.ts`)
- 재사용 가능한 소타입은 별도 정의
  ```typescript
  // shared/types/common.ts
  export interface PagedResult<T> {
    items: T[]
    total: number
    page: number
  }
  
  // shared/types/dooray.ts
  export type DoorayTasksResult = PagedResult<DoorayTask>
  ```

### 타입 검증 (Runtime)

API 응답이나 사용자 입력은 반드시 검증합니다.

```typescript
// ❌ 나쁜 예
const response = await fetch(url)
const data = await response.json()
return data as DoorayTask[]  // 타입만 강제

// ✅ 좋은 예
const response = await fetch(url)
const data = await response.json()

// 최소한의 검증
if (!Array.isArray(data)) throw new Error('Invalid response format')
for (const item of data) {
  if (!item.id || !item.subject) throw new Error('Missing required field')
}
return data as DoorayTask[]
```

## React & 컴포넌트 작성

### 함수형 컴포넌트 + Hooks

모든 React 컴포넌트는 **함수형**이고 **hooks를 사용**합니다. 클래스 컴포넌트는 `ErrorBoundary` 외에는 금지됩니다.

```typescript
// ❌ 나쁜 예: 클래스 컴포넌트
class TaskList extends React.Component {
  state = { tasks: [] }
  componentDidMount() { /* ... */ }
  render() { return <div>{...}</div> }
}

// ✅ 좋은 예: 함수형 + hooks
export function TaskList() {
  const [tasks, setTasks] = useState<DoorayTask[]>([])
  
  useEffect(() => {
    window.api.dooray.tasks.list().then(setTasks)
  }, [])
  
  return <div>{tasks.map(t => <TaskCard key={t.id} task={t} />)}</div>
}
```

### 컴포넌트 구조

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { DoorayTask } from '@shared/types/dooray'

// Props 타입 명시
interface TaskListProps {
  projectId: string
  onSelect?: (task: DoorayTask) => void
}

// Export는 상단
export function TaskList({ projectId, onSelect }: TaskListProps) {
  // 1) 상태
  const [tasks, setTasks] = useState<DoorayTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 2) 구독 및 부작용
  useEffect(() => {
    const loadTasks = async () => {
      setLoading(true)
      try {
        const data = await window.api.dooray.tasks.list([projectId])
        setTasks(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    loadTasks()
  }, [projectId])

  // 3) 콜백
  const handleSelect = useCallback((task: DoorayTask) => {
    onSelect?.(task)
  }, [onSelect])

  // 4) 렌더링
  if (loading) return <div>로딩 중...</div>
  if (error) return <div className="text-red-600">{error}</div>

  return (
    <div>
      {tasks.map(task => (
        <div key={task.id} onClick={() => handleSelect(task)}>
          {task.subject}
        </div>
      ))}
    </div>
  )
}
```

### 디자인 시스템 컴포넌트 우선 사용

새로운 UI는 반드시 `src/renderer/src/components/common/ds/` (디자인 시스템)의 컴포넌트부터 확인하고 재사용하세요.

```typescript
// ❌ 나쁜 예: 커스텀 버튼
<button className="bg-blue-600 text-white px-4 py-2 rounded">
  저장
</button>

// ✅ 좋은 예: DS 버튼 재사용
import { Button } from '@/components/common/ds'
<Button variant="primary" onClick={handleSave}>
  저장
</Button>
```

**주요 DS 컴포넌트**:
- `Button` (primary/secondary/ghost/danger/ai 변형)
- `Card`, `Modal`, `Input`, `Chip`, `Badge`
- `Avatar`, `Kbd`, `SegTabs`
- `StateViews` (EmptyView, LoadingView, ErrorView)

### Props 분해 & 기본값

```typescript
// Props 명시적 분해
interface MyComponentProps {
  title: string
  description?: string
  variant?: 'primary' | 'secondary'
}

export function MyComponent({
  title,
  description,
  variant = 'primary'
}: MyComponentProps) {
  return <div>{title}</div>
}
```

### Key Props (리스트 렌더링)

항상 안정적인 key를 사용합니다.

```typescript
// ✅ 좋은 예
{items.map(item => (
  <Item key={item.id} data={item} />
))}

// ❌ 나쁜 예: index를 key로 사용 (리스트 변경 시 문제)
{items.map((item, i) => (
  <Item key={i} data={item} />
))}
```

## 경로 별칭 (Path Aliases)

### Renderer에서만 사용 가능

Renderer 코드에서는 경로 별칭을 사용하여 가독성을 높입니다.

```typescript
// ✅ 좋은 예: Renderer
import { TaskList } from '@/components/Dooray/TaskList'
import type { DoorayTask } from '@shared/types/dooray'
import { useTheme } from '@/hooks/useTheme'

// ❌ 나쁜 예: 상대 경로 (깊으면 읽기 어려움)
import { TaskList } from '../../../components/Dooray/TaskList'
import type { DoorayTask } from '../../../../shared/types/dooray'
```

### Main/Preload에서는 상대 경로

Main과 Preload는 별칭이 없으므로 상대 경로를 사용합니다.

```typescript
// ✅ Main에서
import { DoorayClient } from '../dooray/DoorayClient'
import type { DoorayTask } from '../../shared/types/dooray'

// ✅ Preload에서
import { IPC_CHANNELS } from '../shared/types/ipc'
import type { DoorayTask } from '../shared/types/dooray'
```

## 한글 & 주석

### 한글 주석은 OK

프로젝트는 한글 주석을 허용합니다. 자연스럽고 명확하게 작성하세요.

```typescript
// ✅ 좋은 예
// 두레이 API 토큰을 keytar에 저장하고 재연결 시도
async function reconnect() {
  const token = await doorayClient.getToken()
  if (!token) return
  // ...
}

// ❌ 나쁜 예: 부자연스러운 한글/영어 혼합
// 토큰을 GET해서 API에 request하고 response를 parse
```

### 사용자 문구는 자연스러운 한국어

UI 메시지, 버튼 레이블, 알림 문구는 반드시 자연스러운 한국어입니다.

```typescript
// ✅ 좋은 예
setError('태스크를 불러올 수 없습니다. 잠깐 후 다시 시도하세요.')
<Button>두레이 연결</Button>
<span>메신저 와처를 활성화했습니다.</span>

// ❌ 나쁜 예: 어색한 표현
setError('Task load failed. Retry later.')  // 영어
setError('작업을 불러올수없습니다')  // 띄어쓰기 오류
<Button>To Dooray</Button>  // 영어
```

## 에러 핸들링 & 로깅

### 콘솔 로깅 규칙

로그는 `[ServiceName]` 프리픽스로 시작하여 어디서 나온 로그인지 명확하게 합니다.

```typescript
// Main 서비스 (DoorayClient.ts)
class DoorayClient {
  async getToken(): Promise<string> {
    try {
      const token = await store.get('dooray-token')
      return token
    } catch (err) {
      console.error('[DoorayClient] 토큰 조회 실패:', err)
      throw err
    }
  }
}

// Main 진입점 (index.ts)
ipcMain.handle(IPC_CHANNELS.DOORAY_TOKEN_GET, async () => {
  try {
    return await doorayClient.getToken()
  } catch (err) {
    console.error('[main] DOORAY_TOKEN_GET 핸들러 실패:', err)
    throw err
  }
})
```

**로그 레벨**:
- `console.log()` — 정보성 (앱 시작, 기능 활성화 등)
- `console.warn()` — 주의 (폴백 동작, 부분 실패)
- `console.error()` — 에러 (기능 비활성, 사용자 개입 필요)

### Renderer에서의 에러 처리

사용자에게 친화적인 메시지를 표시합니다.

```typescript
export function TaskPanel() {
  const [error, setError] = useState<string | null>(null)

  const loadTasks = async () => {
    try {
      const tasks = await window.api.dooray.tasks.list()
      setTasks(tasks)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[TaskPanel] 태스크 로드 실패:', message)
      
      // 사용자에게 친화적인 메시지
      if (message.includes('network')) {
        setError('네트워크 연결을 확인하세요.')
      } else if (message.includes('token')) {
        setError('인증이 필요합니다. 설정에서 토큰을 확인하세요.')
      } else {
        setError('태스크를 불러올 수 없습니다.')
      }
    }
  }

  return error ? <div className="text-red-600">{error}</div> : <div>...</div>
}
```

## 비동기 처리 패턴

### async/await 사용 (Promise보다 선호)

```typescript
// ✅ 좋은 예
async function loadData() {
  try {
    const data = await window.api.dooray.tasks.list()
    setData(data)
  } catch (err) {
    handleError(err)
  }
}

// ❌ 나쁜 예: then/catch (콜백 지옥)
function loadData() {
  window.api.dooray.tasks.list()
    .then(data => setData(data))
    .catch(err => handleError(err))
}
```

### 타임아웃 처리

오래 걸리는 작업에는 타임아웃을 설정합니다.

```typescript
// Utility 함수
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    )
  ])
}

// 사용
const tasks = await withTimeout(
  window.api.dooray.tasks.list(),
  10000  // 10초
)
```

### 동시 실행 (Promise.all)

여러 독립적인 작업은 동시에 실행합니다.

```typescript
// ✅ 좋은 예: 병렬 실행
const [tasks, projects, events] = await Promise.all([
  window.api.dooray.tasks.list(),
  window.api.dooray.projects.list(),
  window.api.calendar.listEvents({ from, to })
])

// ❌ 나쁜 예: 순차 실행 (느림)
const tasks = await window.api.dooray.tasks.list()
const projects = await window.api.dooray.projects.list()
const events = await window.api.calendar.listEvents({ from, to })
```

## 파일 이름 규칙

### PascalCase (클래스, 컴포넌트)

```
src/main/dooray/DoorayClient.ts       // 클래스
src/main/dooray/TaskService.ts        // 클래스
src/renderer/src/components/TaskCard.tsx  // React 컴포넌트
```

### camelCase (유틸리티, 함수)

```
src/main/dooray/mention/promptBuilder.ts  // 함수 export
src/renderer/src/hooks/useTheme.ts        // 커스텀 hook
```

### 인덱스 파일

```
src/main/index.ts                     // Main 진입점
src/preload/index.ts                  // Preload 스크립트
src/renderer/src/components/common/ds/index.ts  // 디자인 시스템 export
```

## Import 정렬

Imports는 다음 순서로 정렬합니다.

```typescript
// 1) 표준 라이브러리
import { join } from 'path'
import { useState, useEffect } from 'react'

// 2) 외부 라이브러리
import { app, ipcMain } from 'electron'
import type { DoorayTask } from '@xterm/xterm'

// 3) 내부 모듈 (절대 경로)
import { DoorayClient } from '../dooray/DoorayClient'
import type { MyFeatureData } from '@shared/types/my-feature'

// 4) 상대 경로 (드문 경우)
import { helper } from './helper'
```

## 주의할 점

### 1. null vs undefined 구분

```typescript
// ❌ 혼용 (일관성 없음)
let value = null
if (value === undefined) { }

// ✅ 명확한 선택
let value: string | null = null  // null을 기본값으로 사용
let value: string | undefined    // undefined를 기본값으로 사용 (선택사항)
```

### 2. as 타입 강제 최소화

```typescript
// ❌ 위험
const obj = data as MyType  // 검증 없음

// ✅ 검증 후
if (!data || typeof data.id !== 'string') {
  throw new Error('Invalid data')
}
const obj = data as MyType
```

### 3. 글로벌 상태 남용 금지

```typescript
// ❌ 나쁜 예: 글로벌 변수
let globalTasks: DoorayTask[] = []

// ✅ 좋은 예: 컴포넌트 state 또는 Context
const [tasks, setTasks] = useState<DoorayTask[]>([])
```

## 체크리스트

코드 리뷰 전에 다음을 확인하세요.

- [ ] TypeScript strict 모드 위반 없음 (tsc --noEmit 통과)
- [ ] 모든 변수/함수에 명시적 타입 정의
- [ ] 공용 타입은 `shared/types/`에 정의
- [ ] React 컴포넌트는 함수형 + hooks
- [ ] 디자인 시스템 컴포넌트 우선 사용
- [ ] 한글 주석/문구가 자연스러운가
- [ ] 에러 처리 + 콘솔 로깅 완료
- [ ] IPC 타입 검증 완료
- [ ] 경로 별칭 사용 (Renderer만)
- [ ] Import 정렬 및 정리

## 참고

더 자세한 내용은 프로젝트 루트의 `CLAUDE.md`를 참고하세요.
