# 아키텍처 & 프로세스 경계

Clauday는 Electron의 3 프로세스(Main, Preload, Renderer) 기반 앱입니다. 각 프로세스가 정확한 책임을 가지고 있으며, 그 경계를 이해하는 것이 핵심입니다.

## 3 프로세스 개요

```
┌─────────────────────────────────────────────────────────┐
│  Electron 메인 윈도우 (Chromium)                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Renderer Process (React)                       │   │
│  │  - App.tsx (routing)                            │   │
│  │  - components/ (Dooray/Terminal/Session/...)    │   │
│  │  - hooks/ (useTheme, useAIProgress, ...)        │   │
│  │  - IPC client: window.api.<도메인>.<메서드>     │   │
│  └─────────────────────────────────────────────────┘   │
│                         ↕ (IPC invoke/on)              │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Preload Script (contextBridge)                 │   │
│  │  - window.api.<도메인> 객체 조립               │   │
│  │  - ipcRenderer.invoke() / on() 래핑            │   │
│  │  - 구독 핸들러 (terminal output, etc.)         │   │
│  └─────────────────────────────────────────────────┘   │
│                         ↕ (ipcMain handler)           │
├─────────────────────────────────────────────────────────┤
│  Main Process (Node.js)                                 │
│  ├─ src/main/index.ts (entry, IPC handlers ~1500줄)    │
│  ├─ dooray/ (Task/Wiki/Messenger/Bot)                  │
│  ├─ claude/ (Session/Chat/Attachment)                  │
│  ├─ terminal/ (TerminalManager + node-pty)             │
│  ├─ ai/ (AIService — Claude API 라우팅)               │
│  ├─ caldav/ (CalDAV 클라이언트 + 동기화)              │
│  ├─ config/ (MCP/Skills 관리)                          │
│  ├─ watcher/ (메신저 와처)                              │
│  └─ analytics/ (로컬 이벤트 트래킹)                     │
└─────────────────────────────────────────────────────────┘
         ↕ (외부 API/WebSocket/파일 시스템)
    [두레이 REST/WebSocket] [Anthropic API] [CalDAV] [Git]
```

## 각 프로세스의 책임

### Main Process (Node.js 런타임)

**역할**: 모든 "진짜" 일. 파일 시스템, 네이티브 모듈, 외부 API.

**핵심 파일**: `src/main/index.ts` (~1500줄)
- 서비스 인스턴스 생성 (`doorayClient`, `aiService`, `terminalManager` 등)
- `ipcMain.handle()` 핸들러 등록 (200+ 채널)
- 백그라운드 작업 (CalDAV sync, 와처 폴링, 봇 WebSocket)
- Electron 윈도우 라이프사이클 관리

**주요 서비스 클래스**:
- `DoorayClient` — 두레이 REST API 호출 (인증, 토큰 관리)
- `TerminalManager` — node-pty 관리, 세션 영속화
- `AIService` — Claude API 호출, 모델 라우팅
- `CalDAVClient` + `UnifiedCalendarService` — 캘린더 동기화
- `BotService` + `SocketModeClient` — WebSocket 기반 봇 모드
- `ClaudeChatService` — Claude Code CLI spawn, 메시지 스트리밍
- `WatcherService` — 메신저 메시지 필터링
- `ConfigWatcher` — MCP/Skills 파일 감시

**특징**:
- 모든 상태는 메모리 또는 파일 시스템에 저장 (electron-store, 파일)
- 에러는 console.error / console.warn으로 로깅
- 시간이 오래 걸리는 작업은 비동기 Promise 반환
- Renderer의 IPC 호출에 대해 항상 응답해야 함 (또는 timeout)

### Preload Script

**역할**: Main과 Renderer 사이의 메시지 브릿지. 보안 경계 유지.

**핵심 파일**: `src/preload/index.ts` (단일 파일)

**구조**:
```typescript
const api = {
  mcp: { list, add, update, delete },
  skills: { list, read, save, delete, ... },
  dooray: { setToken, projects, tasks, wiki, ... },
  terminal: { create, input, resize, kill, ... },
  // ... 20+ 도메인
}

contextBridge.exposeInMainWorld('api', api)
```

**특징**:
- `ipcRenderer.invoke()` — 동기 응답 필요한 메서드 (타임아웃: 기본 30초)
- `ipcRenderer.send()` — 응답 불필요한 메서드 (terminal input)
- `ipcRenderer.on()` — 구독식 이벤트 리스너 (terminal output, CalDAV sync, 와처 메시지)
- 구독 메모리 누수 방지 → 여러 리스너를 1개 global handler로 모은 후 Set으로 분배 (preload:6-20)

**보안**:
- `contextBridge.exposeInMainWorld`로만 main ↔ renderer 통신 노출
- 민감한 작업(토큰 저장)은 main의 keytar 또는 electron-store로만 처리
- renderer는 파일 시스템 직접 접근 X

### Renderer Process (React/Chromium)

**역할**: 사용자 UI. 상태 관리, 이벤트 핸들링, 렌더링.

**핵심 파일**:
- `src/renderer/src/App.tsx` — View 라우팅 (activeView state 기반)
- `src/renderer/src/components/` — 뷰별 컴포넌트
  - Dooray/ (Dashboard, Briefing, Watcher, Task Detail)
  - Terminal/ (터미널 탭, xterm 렌더링)
  - Claude/ (Chat UI, Session Sidebar)
  - Settings/ (설정 패널)
  - 등등

**구조**:
```typescript
// renderer에서는 항상 IPC를 통해 main과 통신
const projects = await window.api.dooray.projects.list()
const tasks = await window.api.dooray.tasks.list(projectIds)

// 이벤트 구독
window.api.terminal.onOutput(({ id, data }) => {
  // 터미널 출력 받아서 xterm에 write
})

// 상태 관리: useState, Context, 또는 atom (프로젝트마다 다름)
const [activeView, setActiveView] = useState('dooray')
```

**특징**:
- React 18, React Router 6
- hooks 기반 함수형 컴포넌트만 사용 (클래스 X)
- TailwindCSS + 디자인 시스템 컴포넌트 (`components/common/ds/`)
- 경로 별칭: `@` = `src/renderer/src`, `@shared` = `src/shared`

**제약**:
- 파일 시스템 접근 X (main의 IPC를 통해서만 가능)
- 네이티브 모듈 직접 사용 X
- 장시간 블로킹 작업 X (UI 반응성)

## 디렉터리 구조 & 책임

### `src/` 루트
```
src/
  main/              ← Main process 서비스
  preload/           ← Preload script
  renderer/          ← Renderer/React
  shared/            ← 공용 타입 (main ↔ renderer 양쪽에서 import)
```

### `src/main/` 상세

```
main/
  index.ts                    ← 진입점 (1500줄). 서비스 초기화 + IPC 핸들러
  ai/AIService.ts             ← Claude API 호출 + 모델 라우팅 (Haiku/Sonnet/Opus)
  analytics/AnalyticsService  ← 로컬 사용 이벤트 트래킹
  caldav/                     ← CalDAV 캘린더 통합 (v1.5)
    CalDAVClient.ts           ← tsdav wrapper
    UnifiedCalendarService.ts ← 원격(CalDAV) + 로컬 통합
    LocalEventStore.ts        ← 로컬 일정 DB
    CTagPoller.ts             ← 변경 감지 폴링
    ical.ts                   ← iCalendar 파싱
    CredentialStore.ts        ← 인증 정보 (keytar)
  claude/                     ← Claude Code 통합
    ClaudeSessionService.ts   ← 세션 메타 + 이름 영속화
    ClaudeChatService.ts      ← claude CLI spawn + 메시지 스트리밍
    AttachmentService.ts      ← 첨부 파일 저장
  config/                     ← MCP/Skills 매니저
    McpConfigManager.ts       ← ~/.claude/mcp.json 읽기/쓰기
    SkillsManager.ts          ← ~/.claude/skills/ 감시
    ConfigWatcher.ts          ← chokidar 파일 감시
  dooray/                     ← 두레이 통합
    DoorayClient.ts           ← REST API 호출 래퍼
    TaskService.ts            ← 태스크 CRUD
    WikiService.ts            ← 위키 페이지 CRUD
    WikiStorageService.ts     ← 위키 기반 공유 저장소
    MessengerService.ts       ← 메신저 채널/메시지
    socket-mode/
      SocketModeClient.ts     ← WebSocket 연결 관리
      BotService.ts           ← 봇 설정/라이프사이클
      types.ts                ← 이벤트 타입
    mention/                  ← @clauday 멘션 처리
      MentionDispatcher.ts    ← 수신 라우팅
      ContextCollector.ts     ← 메시지 수집
      promptBuilder.ts        ← Claude 프롬프트 조립
      MentionTerminalSpawner  ← claude CLI spawn
      ClaudayResponder.ts     ← 응답 송신
      HookServer.ts           ← Claude 훅 수신
      ChannelSessionStore.ts  ← 채널별 세션 추적
      AgentWorkspaceManager   ← 워크스페이스 디렉토리 관리
      ... 등등
  git/GitService.ts           ← Git 워크트리/브랜치 관리
  holiday/HolidayService.ts   ← 공휴일 캐싱
  skills/                     ← 스킬 저장소
    SkillStore.ts             ← 파일 시스템 저장소
    SharedSkillsService.ts    ← 위키 공유
  terminal/TerminalManager.ts ← node-pty, 세션 관리
  usage/UsageParser.ts        ← Claude 사용량 파싱
  watcher/WatcherService.ts   ← 메신저 필터링 + 폴링
```

### `src/shared/types/` 공용 타입

```
shared/types/
  ipc.ts                      ← IPC_CHANNELS 상수 (타입 안전성)
  ai.ts                       ← AIBriefing, AIReport, AIModelConfig
  caldav.ts                   ← CalDAVCalendar, CalDAVEvent
  calendar.ts                 ← UnifiedCalendar, LocalCalendar
  claude-chat.ts              ← ClaudeChatSendRequest, ClaudeChatEvent
  dooray.ts                   ← DoorayProject, DoorayTask, DoorayWiki
  git.ts                      ← GitWorktree, GitBranch, GitDiffResult
  mcp.ts                      ← McpServerConfig
  messenger.ts                ← DoorayChannel, DoorayMessage
  skills.ts                   ← Skill, SkillSaveRequest
  terminal.ts                 ← TerminalSession, TerminalResizeOptions
  watcher.ts                  ← Watcher, CollectedMessage
  ... 등등
```

**규칙**: Main과 Renderer가 같은 타입을 사용하는 경우 `shared/types/`에 정의. 그렇지 않으면 해당 프로세스 디렉토리에만.

### `src/renderer/src/` 상세

```
renderer/src/
  App.tsx                     ← 라우팅 (activeView state)
  components/
    common/
      ds/                     ← 디자인 시스템 (Button, Card, Modal, ...)
    Dooray/                   ← 대시보드, 브리핑, 와처, 태스크 상세
    Terminal/                 ← 터미널 UI + xterm 통합
    Claude/                   ← 세션 사이드바 + 채팅창
    Settings/                 ← 설정 패널 (테마, 토큰, MCP, ...)
    ... 등등
  hooks/
    useTheme.ts               ← 테마/팔레트 상태 관리
    useFontSettings.ts        ← 폰트 설정
    useAIProgress.ts          ← AI 요청 진행률
  design-system.css           ← 공용 디자인 토큰 (색상, 간격, 타이포그래피)
```

## 데이터 흐름

### 1. Top-Down (Renderer → Main → API)

**예: 태스크 목록 조회**

```
Renderer (DoorayAssistant.tsx)
  ↓ await window.api.dooray.tasks.list(projectIds)
Preload
  ↓ ipcRenderer.invoke(IPC_CHANNELS.DOORAY_TASKS_LIST, projectIds)
Main (index.ts)
  ↓ ipcMain.handle(IPC_CHANNELS.DOORAY_TASKS_LIST, (_, ids) => {...})
TaskService
  ↓ taskService.listTasks(ids)
DoorayClient
  ↓ fetch('https://api.dooray.com/v1/tasks', ...)
API Response
  ↓ 타입 검증 후 DoorayTask[] 변환
Preload
  ↓ 응답 data
Renderer
  ↓ setTasks(data)
UI 업데이트
```

**타입 흐름**:
1. `src/shared/types/dooray.ts`에서 `DoorayTask` 정의
2. Renderer에서 `await window.api.dooray.tasks.list(): Promise<DoorayTask[]>`
3. Main에서 응답: `return await taskService.listTasks(ids): Promise<DoorayTask[]>`
4. Preload는 투명 전달 (타입 안전성 위임)

### 2. Bottom-Up (Main → Renderer 이벤트 구독)

**예: 터미널 출력**

```
Main (TerminalManager)
  ↓ pty.write() 받음
  ↓ ptySession.outputBuffer에 저장
  ↓ mainWindow.webContents.send(IPC_CHANNELS.TERMINAL_OUTPUT, {id, data})
Preload (구독 핸들러 수집)
  ↓ Set<handlers> 에서 각 handler 호출
Renderer (TerminalPane.tsx)
  ↓ window.api.terminal.onOutput((payload) => { xterm.write(payload.data) })
  ↓ xterm 렌더링 업데이트
```

**구독 처리 (메모리 효율)**:

여러 Renderer 컴포넌트가 같은 이벤트를 구독할 때:
- Preload에서 1개의 `ipcRenderer.on()` 글로벌 리스너
- `Set<handlers>`에 모든 콜백 누적
- 각 핸들러 등록/해제 시 cleanup 함수 반환
- 이렇게 하면 IPC 호출 수를 최소화

예시 ([preload/index.ts:6-21](../../src/preload/index.ts)):
```typescript
const terminalOutputHandlers = new Set<(payload) => void>()
let terminalOutputSubscribed = false

function subscribeTerminalOutput(cb) {
  terminalOutputHandlers.add(cb)
  if (!terminalOutputSubscribed) {
    terminalOutputSubscribed = true
    ipcRenderer.on(IPC_CHANNELS.TERMINAL_OUTPUT, (_, payload) => {
      for (const h of terminalOutputHandlers) {
        try { h(payload) } catch { /* ignore */ }
      }
    })
  }
  return () => { terminalOutputHandlers.delete(cb) }
}
```

### 3. 양방향: Dialog & 사용자 입력

**예: 폴더 선택 → Main에서 파일 시스템 작업**

```
Renderer (클릭 이벤트)
  ↓ await window.api.dialog.selectFolder()
Main
  ↓ dialog.showOpenDialog({properties: ['openDirectory']})
OS Dialog (native)
  ↓ 사용자 선택
Main
  ↓ return filePath
Renderer
  ↓ setSelectedPath(filePath)
```

## 경계 및 제약

### Renderer에서 금지된 것
1. **파일 시스템 직접 접근** → Main IPC 사용
2. **네이티브 모듈 사용** (node-pty, keytar, child_process) → Main에서만
3. **장시간 블로킹** → UI 반응성 저하
4. **외부 API 직접 호출** → Main IPC로 위임

### Main에서 주의할 것
1. **UI 업데이트** → Renderer로만 전달 (webContents.send)
2. **동기 블로킹** → 비동기 Promise 사용
3. **타입 검증** → shared/types에서 import하고 실행 시 validate
4. **에러 전파** → try-catch로 감싸고 명확한 메시지로 Renderer에 전달

## 프로세스 간 타입 안전성

### Good: 공용 타입 정의
```typescript
// shared/types/dooray.ts
export interface DoorayTask {
  id: string
  subject: string
  status: 'registered' | 'working' | 'completed'
}

// main에서 import & 사용
import type { DoorayTask } from '../../shared/types/dooray'
const tasks: DoorayTask[] = await taskService.list()

// renderer에서 import & 사용
import type { DoorayTask } from '@shared/types/dooray'
const tasks = await window.api.dooray.tasks.list()
```

### Bad: 프로세스별 중복 정의
```
// main의 types와 renderer의 types가 다르면
// IPC를 통과한 데이터가 예상과 다를 수 있음
```

## 라이프사이클 & 초기화 순서

### App 시작
1. **Electron main process 시작** (`npm run dev`)
2. **src/main/index.ts 실행** — 모든 서비스 인스턴스 생성
3. **BrowserWindow 생성** — preload 스크립트 로드
4. **Renderer process 시작** — App.tsx 마운트
5. **IPC 채널 listening 준비** — main의 `ipcMain.handle()` 등록 완료
6. **UI 렌더링** — React 마운트, 첫 IPC 호출 가능

### 주의점
- `ipcMain.handle()` 등록 전에 Renderer의 IPC 호출이 오면 timeout
- Main의 서비스 초기화 실패 → 전체 앱 기능 마비 → 에러 로깅 필수

### App 종료
1. **윈도우 닫기** → preload 정리, Renderer 언마운트
2. **Main 서비스 정리** (필요시) — 파일 저장, 연결 종료
3. **node-pty 세션 종료** — TerminalManager 정리
4. **electron 프로세스 종료**

## 요약: "어느 층에 코드를 넣을까?"

| 요구사항 | 어디에 넣을까? | 이유 |
|---------|---------|------|
| 파일 읽기/쓰기 | Main | Renderer는 접근 불가 |
| node-pty 사용 | Main | 네이티브 모듈 |
| 외부 API 호출 | Main | Renderer는 CORS 제약 |
| UI 렌더링 | Renderer | React/Chromium만 가능 |
| 사용자 입력 처리 | Renderer | 이벤트 핸들러 |
| 모달/다이얼로그 | Renderer (UI) + Main (파일 접근) | 분리 |
| 상태 관리 | Renderer (UI 상태) + electron-store (영속 상태) | 필요에 따라 |

보다 자세한 내용은 [ipc.md](./ipc.md)에서 IPC 패턴을 참고하세요.
