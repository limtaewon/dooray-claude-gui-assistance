# 테스트 전략 & Vitest + RTL

Clauday는 **Vitest** (Vue/React용 고속 테스트 러너)와 **React Testing Library** (RTL, 사용자 관점 테스트)를 사용합니다.

## 테스트 인프라

### 설치된 도구

```json
{
  "devDependencies": {
    "vitest": "^2.1.9",
    "@vitest/coverage-v8": "^2.1.9",
    "@testing-library/react": "^16.3.2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/user-event": "^14.6.1",
    "jsdom": "^25.0.1"
  }
}
```

### 실행 명령

```bash
npm run test           # 감시 모드 (파일 변경 시 자동 재실행)
npm run test:run       # 한 번만 실행 (CI용)
npm run test:coverage  # 커버리지 리포트 생성 (coverage/)
```

## 테스트 구조

### 테스트 파일 위치

Main과 Renderer 테스트를 분리합니다.

```
src/
  main/
    dooray/
      DoorayClient.ts
      DoorayClient.test.ts       ← Main 테스트
    mention/
      promptBuilder.ts
      promptBuilder.test.ts      ← Main 테스트
  
  renderer/src/
    components/
      TaskCard.tsx
      TaskCard.test.tsx          ← Renderer 테스트
    hooks/
      useTheme.ts
      useTheme.test.ts           ← Renderer 테스트
```

**규칙**:
- 파일과 같은 디렉토리에 위치
- 파일명: `<name>.test.ts` 또는 `<name>.test.tsx`

### 테스트 파일 구조

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TaskService } from './TaskService'
import type { DoorayTask } from '@shared/types/dooray'

describe('TaskService', () => {
  let service: TaskService
  let mockClient: DoorayClient

  beforeEach(() => {
    // 테스트 전 설정
    mockClient = {
      request: vi.fn()
    } as unknown as DoorayClient
    service = new TaskService(mockClient)
  })

  afterEach(() => {
    // 테스트 후 정리
    vi.clearAllMocks()
  })

  describe('list', () => {
    it('should return tasks for given project IDs', async () => {
      // Arrange: 테스트 데이터 준비
      const projectIds = ['proj1', 'proj2']
      const expectedTasks: DoorayTask[] = [
        { id: 'task1', subject: 'Task 1', status: 'working' }
      ]

      // Mock 설정
      vi.mocked(mockClient.request).mockResolvedValue({
        data: expectedTasks
      })

      // Act: 함수 실행
      const result = await service.list(projectIds)

      // Assert: 결과 검증
      expect(result).toEqual(expectedTasks)
      expect(mockClient.request).toHaveBeenCalledWith(
        '/v1/tasks',
        expect.objectContaining({ projectIds })
      )
    })

    it('should throw error on network failure', async () => {
      // Network 에러 시뮬레이션
      vi.mocked(mockClient.request).mockRejectedValue(
        new Error('Network error')
      )

      // 에러 발생 확인
      await expect(service.list(['proj1'])).rejects.toThrow('Network error')
    })
  })
})
```

## 모킹 정책

IPC, 네이티브 모듈, 외부 API는 모두 모킹합니다.

### 1. Electron IPC Mock

Renderer 테스트에서 `window.api`를 모킹합니다.

```typescript
// test-setup.ts
global.window = {
  api: {
    dooray: {
      tasks: {
        list: vi.fn()
      }
    }
  }
} as unknown as Window & typeof globalThis

// TaskList.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { TaskList } from './TaskList'

describe('TaskList', () => {
  it('loads and displays tasks', async () => {
    // IPC mock 설정
    vi.mocked(window.api.dooray.tasks.list).mockResolvedValue([
      { id: '1', subject: 'Task 1', status: 'working' }
    ])

    // 컴포넌트 렌더
    render(<TaskList />)

    // 로딩 완료 대기
    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument()
    })

    // IPC 호출 확인
    expect(window.api.dooray.tasks.list).toHaveBeenCalled()
  })
})
```

### 2. node-pty Mock

```typescript
// TerminalManager.test.ts
import * as pty from 'node-pty'
import { vi } from 'vitest'

vi.mock('node-pty', () => ({
  spawn: vi.fn((shell, args, opts) => {
    return {
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      on: vi.fn((event, cb) => {
        if (event === 'data') {
          // 비동기로 데이터 이벤트 시뮬레이션
          setImmediate(() => cb('shell output'))
        }
      })
    }
  })
}))

describe('TerminalManager', () => {
  it('creates PTY session', () => {
    const manager = new TerminalManager()
    const session = manager.create()

    expect(pty.spawn).toHaveBeenCalledWith(
      expect.any(String),  // shell
      [],
      expect.any(Object)   // options
    )
  })
})
```

### 3. keytar Mock

```typescript
// CredentialStore.test.ts
vi.mock('keytar', () => ({
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn()
}))

import keytar from 'keytar'

describe('CredentialStore', () => {
  it('saves and retrieves credentials', async () => {
    vi.mocked(keytar.setPassword).mockResolvedValue(true)
    vi.mocked(keytar.getPassword).mockResolvedValue('saved-token')

    const store = new CredentialStore()
    await store.save('my-service', 'my-account', 'token123')
    const retrieved = await store.get('my-service', 'my-account')

    expect(retrieved).toBe('token123')
  })
})
```

### 4. electron-store Mock

```typescript
// Store 사용하는 서비스 테스트
vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data = new Map()
      get(key: string) { return this.data.get(key) }
      set(key: string, value: any) { this.data.set(key, value) }
      delete(key: string) { this.data.delete(key) }
    }
  }
})
```

### 5. WebSocket Mock (두레이 봇 Socket Mode)

```typescript
// SocketModeClient.test.ts
vi.mock('ws', () => ({
  default: class MockWebSocket {
    on = vi.fn()
    send = vi.fn()
    close = vi.fn()
  }
}))
```

### 6. CalDAV Mock (tsdav)

```typescript
// CalDAVClient.test.ts
vi.mock('tsdav', () => ({
  DAVClient: class MockDAVClient {
    fetchCalendars = vi.fn()
    fetchCalendarObjects = vi.fn()
    createCalendarObject = vi.fn()
  }
}))
```

## Main vs Renderer 테스트

### Main 테스트 (서비스 로직)

```typescript
// src/main/dooray/TaskService.test.ts
describe('TaskService', () => {
  // 순수 함수/비동기 로직 테스트
  // IPC 미포함 (Main은 직접 호출)
  
  it('validates task data', () => {
    const task = { id: '1', subject: 'Test', status: 'working' }
    expect(TaskService.isValid(task)).toBe(true)
  })

  it('formats task for API', () => {
    const task = { /* ... */ }
    const formatted = TaskService.formatForAPI(task)
    expect(formatted).toHaveProperty('id')
    expect(formatted).toHaveProperty('subject')
  })
})
```

### Renderer 테스트 (UI 컴포넌트)

```typescript
// src/renderer/src/components/TaskCard.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('TaskCard', () => {
  // 사용자 상호작용 테스트
  // 렌더링, 클릭, 입력 등
  
  it('displays task and handles click', async () => {
    const mockOnSelect = vi.fn()
    const task = { id: '1', subject: 'Test Task', status: 'working' }

    render(<TaskCard task={task} onSelect={mockOnSelect} />)

    // 텍스트 확인
    expect(screen.getByText('Test Task')).toBeInTheDocument()

    // 클릭
    await userEvent.click(screen.getByRole('button'))

    // 콜백 확인
    expect(mockOnSelect).toHaveBeenCalledWith(task)
  })

  it('shows loading state', () => {
    render(<TaskCard loading={true} />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })
})
```

## 테스트 작성 가이드

### Good: 사용자 관점 테스트 (권장)

```typescript
// ✅ 좋은 예: 사용자가 보는 것을 테스트
it('allows user to create task', async () => {
  render(<TaskForm onSubmit={mockSubmit} />)

  // 사용자 입력
  await userEvent.type(
    screen.getByLabelText('제목'),
    'New Task'
  )

  // 제출
  await userEvent.click(screen.getByRole('button', { name: '생성' }))

  // 결과 확인
  expect(mockSubmit).toHaveBeenCalledWith({ subject: 'New Task' })
})
```

### Bad: 구현 세부사항 테스트 (피하기)

```typescript
// ❌ 나쁜 예: 구현 세부사항에 의존
it('sets state and calls handler', async () => {
  const wrapper = mount(<TaskForm onSubmit={mockSubmit} />)

  // 컴포넌트 내부 state에 직접 접근
  wrapper.vm.taskTitle = 'New Task'
  await wrapper.vm.$nextTick()

  // 리팩터링하면 이 테스트는 깨짐
  expect(wrapper.vm.isSubmitting).toBe(true)
})
```

### 비동기 테스트

```typescript
// ✅ 좋은 예: waitFor 사용
it('loads tasks asynchronously', async () => {
  vi.mocked(window.api.dooray.tasks.list)
    .mockResolvedValue([{ id: '1', subject: 'Task' }])

  render(<TaskList />)

  // 로딩 완료 대기
  await waitFor(() => {
    expect(screen.getByText('Task')).toBeInTheDocument()
  })
})

// ❌ 나쁜 예: setTimeout 사용 (비결정적)
it('loads tasks', (done) => {
  // ...
  setTimeout(() => {
    expect(screen.getByText('Task')).toBeInTheDocument()
    done()
  }, 100)  // 타이밍 불안정
})
```

## 커버리지 기준

```bash
npm run test:coverage
```

결과: `coverage/` 디렉토리에 HTML 리포트 생성

**커버리지 임계치** (권장):
- **Statements**: 70% 이상
- **Branches**: 65% 이상
- **Functions**: 70% 이상
- **Lines**: 70% 이상

**주의**:
- 100% 커버리지는 필요 없음 (비용 대비 효율 낮음)
- UI 컴포넌트는 60% 수준도 괜찮음
- 핵심 비즈니스 로직은 80%+ 권장

## CI/CD 통합

### GitHub Actions에서 테스트

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - run: npm install
      - run: npm run test:run
      - run: npm run test:coverage
      
      # 커버리지 리포트 업로드 (선택)
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

## 자주 묻는 질문

**Q: "Cannot find module 'electron'" 에러**

A: Renderer 테스트는 jsdom 환경이므로 Electron 전역이 없습니다.

```typescript
// test에서만
if (typeof window === 'undefined') {
  const { mockElectron } = await import('./mocks')
  global.window = mockElectron
}
```

**Q: "window.api is not defined"**

A: Preload가 테스트 환경에 로드되지 않으므로 수동으로 mock 설정

```typescript
beforeEach(() => {
  global.window = {
    api: { /* mock */ }
  } as any
})
```

**Q: 테스트가 느려요**

A: 
1. 불필요한 대기 제거 (`waitFor` 대신 명시적 조건)
2. 모킹 최적화 (최소한의 구현)
3. 병렬 테스트 실행 (Vitest 기본)

**Q: 스냅샷 테스트는?**

A: Clauday에서는 스냅샷 테스트를 권장하지 않습니다. UI 변경 시마다 스냅샷 업데이트가 부담스럽습니다.

대신 사용자 관점 테스트를 우선하세요.

## 체크리스트

새 기능 추가 시:

- [ ] 단위 테스트 작성 (비즈니스 로직)
- [ ] 통합 테스트 작성 (IPC 호출)
- [ ] UI 테스트 작성 (렌더링, 상호작용)
- [ ] `npm run test:run` 통과
- [ ] 커버리지 확인 (decrease 없는지)
- [ ] Mock 설정 정확한지 검증

## 참고

- [Vitest 공식 가이드](https://vitest.dev/)
- [React Testing Library 가이드](https://testing-library.com/react)
- [jest-dom matchers](https://github.com/testing-library/jest-dom)
