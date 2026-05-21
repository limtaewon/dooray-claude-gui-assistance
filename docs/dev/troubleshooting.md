# 트러블슈팅: 자주 나오는 문제와 해결

개발 중 마주치는 빌드, 런타임, IPC 문제들을 정리했습니다.

## 빌드 & 설치

### npm install 실패: "node-pty binding.gyp 없음"

**증상**:
```
gyp ERR! not ok
gyp ERR! while trying to run make
```

**원인**: C++ 컴파일 환경 부재 또는 구성 오류

**해결책**:
```bash
# 1) Python 3.11+ 확인
python3 --version

# 2) C++ 컴파일러 설치
# macOS
xcode-select --install

# Windows
# Visual Studio Build Tools 설치
# https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022

# 3) npm 캐시 초기화
npm cache clean --force
rm -rf node_modules package-lock.json

# 4) 재설치
npm install
```

### npm install 성공했지만 keytar 로드 실패

**증상**:
```
Error: The specified module could not be found
  at Module._load (internal/modules/node_loader.js:498:23)
  at Module._extensions..node
```

**원인**: keytar 네이티브 바이너리가 빌드되지 않음

**확인**:
```bash
ls -la node_modules/keytar/build/Release/
# keytar.node 파일이 없음

# 또는 Windows
dir node_modules\keytar\build\Release
# keytar.node 없음
```

**해결책** (강제 재빌드):
```bash
npm rebuild keytar --build-from-source

# 또는
npm install --build-from-source
```

### 타입 에러: "Cannot find module @shared/types"

**증상**:
```
TSError: ⨯ Type error: Cannot find module '@shared/types/dooray'
```

**원인**: Renderer 경로 별칭이 Main에서 작동하지 않음

**확인**: 파일이 main 또는 preload에서 import되고 있는가?

**해결책**:
```typescript
// ❌ 나쁜 예 (Main에서)
import type { DoorayTask } from '@shared/types/dooray'

// ✅ 좋은 예 (Main에서)
import type { DoorayTask } from '../../shared/types/dooray'

// ✅ OK (Renderer에서만)
import type { DoorayTask } from '@shared/types/dooray'
```

## 런타임 에러

### Terminal이 렌더링되지 않음

**증상**: Terminal 탭을 열어도 xterm 창이 안 보임, 또는 하얀 화면만 표시

**원인**: 
1. `fit()` 호출 순서 문제
2. 스타일 누락
3. PTY 생성 실패

**디버그**:
```typescript
// Terminal.tsx에서
useEffect(() => {
  console.log('[Terminal] 마운트됨', { width, height })
  
  if (terminalRef.current) {
    console.log('[Terminal] xterm 초기화')
    // xterm 로그 활성화
    term.attachCustomKeyEventHandler((event) => {
      console.log('[xterm] keydown:', event.key)
      return true
    })
  }
}, [])

// main의 TerminalManager에서
ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, async () => {
  console.log('[TerminalManager] CREATE 시작')
  try {
    const session = this.create()
    console.log('[TerminalManager] 세션 생성:', session.id)
    return session
  } catch (err) {
    console.error('[TerminalManager] CREATE 실패:', err)
    throw err
  }
})
```

**해결책**:
```typescript
// 1) xterm CSS import 확인
import '@xterm/xterm/css/xterm.css'

// 2) fit() 호출 시점 (DOM 렌더링 후)
useEffect(() => {
  if (terminalRef.current && term) {
    setTimeout(() => {
      term.fit()  // 약간의 지연 추가
    }, 100)
  }
}, [width, height])

// 3) PTY 생성 에러 로그 확인
// main 콘솔에서 [TerminalManager] 로그 확인
```

### IPC invoke timeout: "Error invoking remote method"

**증상**:
```
Error: Error invoking remote method 'dooray:tasks:list': 
  Error: Timeout of 30000 ms exceeded
```

**원인**: Main의 IPC 핸들러가 응답하지 않음

**디버그**:
```typescript
// Main 콘솔 로그 확인
// 1) 핸들러가 등록되었는가?
console.log('[main] IPC 핸들러 등록 시작')
ipcMain.handle(IPC_CHANNELS.DOORAY_TASKS_LIST, async () => {
  console.log('[main] DOORAY_TASKS_LIST 호출됨')
  // ...
  console.log('[main] 응답 준비', result)
  return result
})

// 2) 핸들러 내부에서 에러 발생?
try {
  return await taskService.list()
} catch (err) {
  console.error('[main] DOORAY_TASKS_LIST 에러:', err)
  throw err  // Renderer로 전파
}
```

**해결책**:
```typescript
// Renderer에서 타임아웃 증대
const response = await Promise.race([
  window.api.dooray.tasks.list(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Custom timeout')), 60000)
  )
])
```

### CalDAV 동기화가 느림

**증상**: fullSync() 호출 후 30초 이상 기다려야 함

**원인**: 첫 연결 시 대량의 일정을 다운로드 중

**해결책**:
```typescript
// Renderer에서 진행률 구독
useEffect(() => {
  const unsub = window.api.caldav.onSyncProgress((progress) => {
    if ('current' in progress) {
      console.log(`동기화 중: ${progress.current}/${progress.total}`)
    } else {
      console.log(`동기화 ${progress.stage}: ${progress.message}`)
    }
  })
  return unsub
}, [])

// Main에서 최적화
// CTagPoller 대신 폴링 간격 조정
// UnifiedCalendarService에서 incremental sync 활용
```

### 두레이 토큰 에러: "Invalid token" / "Unauthorized"

**증상**:
```
Error: 401 Unauthorized
  at DoorayClient.request()
```

**원인**: 
1. 토큰 만료
2. 토큰 재생성 (사용자가 변경함)
3. 네트워크 끊김

**확인** (Settings):
- 두레이 토큰이 설정되어 있는가?
- 토큰이 유효한가? (Settings → "토큰 검증" 버튼)

**해결책**:
```typescript
// Settings에서 토큰 재입력
// 또는 IPC로 프로그래밍
await window.api.dooray.setToken(newToken)

// 토큰 검증
const { valid, error } = await window.api.dooray.validateToken()
if (!valid) {
  console.error('토큰 검증 실패:', error)
}
```

### Bot (Socket Mode) 연결 실패

**증상**: "Bot state: DISCONNECTED, lastError: ..."

**원인**:
1. 도메인 설정 안 함
2. 두레이 토큰 없음
3. 네트워크 불안정

**확인** (Settings → "두레이 봇"):
- 도메인 입력됨? (예: `nhnent.dooray.com`)
- 두레이 토큰 있음?

**디버그**:
```typescript
// Main에서 로그
const status = await botService.getStatus()
console.log('[BotService] 상태:', status)
// { state: 'CONNECTING', lastError: null, ready: false }

// Renderer에서 구독
window.api.bot.onStateUpdate((status) => {
  console.log('[Bot] 상태 변화:', status)
})
```

**해결책**:
```typescript
// 1) 도메인 설정
await window.api.bot.setConfig({ domain: 'nhnent.dooray.com' })

// 2) 시간 지연 후 다시 시도 (재연결 로직)
setTimeout(() => {
  window.api.bot.start()
}, 2000)

// 3) 네트워크 확인
// ping dooray.com
```

## 성능 & 메모리

### 앱이 느려짐 / 메모리 누수

**증상**: 시간이 지나면서 CPU/메모리 사용량 증가

**원인**:
1. 이벤트 리스너 미정리 (cleanup)
2. 폴링 누적
3. 큰 데이터 캐싱

**디버그** (DevTools):
```typescript
// Renderer에서 메모리 확인
window.performance.memory
// { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit }

// 주기적으로 로깅
setInterval(() => {
  const mem = window.performance.memory
  console.log(`메모리: ${(mem.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`)
}, 5000)
```

**해결책**:
```typescript
// 1) useEffect cleanup 필수
useEffect(() => {
  const unsub = window.api.terminal.onOutput(({ id, data }) => {
    // ...
  })
  return () => unsub()  // 정리!
}, [])

// 2) 폴링 간격 조정
// WatcherService에서
this.pollInterval = 30000  // 30초 (기본 5초는 너무 자주)

// 3) 캐시 크기 제한
class MyService {
  private cache = new Map()
  private maxCacheSize = 100

  put(key: string, value: any) {
    if (this.cache.size > this.maxCacheSize) {
      const oldest = this.cache.keys().next().value
      this.cache.delete(oldest)
    }
    this.cache.set(key, value)
  }
}
```

### Terminal이 많아질수록 느려짐

**원인**: 각 터미널의 출력 버퍼가 메모리 차지, 이벤트 핸들러 누적

**해결책**:
```typescript
// src/main/terminal/TerminalManager.ts에서
const MAX_BUFFER_LINES = 5000

// 또는 Renderer에서 터미널 개수 제한
if (terminals.length > 10) {
  // 경고 표시 또는 가장 오래된 것 정리
}
```

## 배포 & 패키징

### dmg 빌드 실패: "code sign error" (macOS)

**증상**:
```
Error: The specified item could not be found.
```

**원인**: Apple 인증서 missing

**상황별 처리**:
1. **CI/CD (자동 서명)**: secrets에 `MAC_CSC_LINK` / `MAC_CSC_KEY_PASSWORD` 설정 필요
2. **로컬 개발**: unsigned 상태로 진행 (테스트용 가능)

**임시 해결** (unsigned dmg):
```bash
npm run build
electron-builder --mac --publish never
# release/Clauday-*.dmg (unsigned)
```

### exe 빌드 실패: "NSIS 오류" (Windows)

**증상**:
```
Error: NSIS unpacking failed: A:\.nsis...
```

**원인**: 네이티브 모듈 압축 문제 또는 권한 부족

**해결책**:
```bash
# 캐시 초기화
rm -rf node_modules dist out release

# 재설치 + 재빌드 (관리자 cmd)
npm install
npm run build
npm run dist:win
```

## 데이터 손상

### electron-store 파일 손상

**증상**: 앱 시작 시 JSON parse 에러

**증상**:
```
Error: Unexpected token } in JSON at position ...
```

**해결책**:
```bash
# 손상된 파일 삭제 (macOS)
rm ~/Library/Application\ Support/Clauday/clauday-data.json

# Windows
rm %APPDATA%\Clauday\clauday-data.json

# Linux
rm ~/.config/Clauday/clauday-data.json

# 앱 재시작 → 기본값으로 초기화
```

### CalDAV 캐시 손상

**증상**: 일정이 안 보임 또는 중복 표시

**해결책**:
```bash
# 로컬 ICS 캐시 삭제
rm -rf ~/.clauday/caldav-cache/

# 또는 Settings에서 CalDAV 정리
# Settings → Calendar → Disconnect → 재연결

# 재연결 시 fullSync 자동 실행
```

## 안내 & 참고

더 자세한 정보는 다음을 참고하세요:

- [architecture.md](./architecture.md) — 프로세스 경계 이해
- [ipc.md](./ipc.md) — IPC 타입 검증
- [native-modules.md](./native-modules.md) — 네이티브 모듈 빌드
- [domains/](./domains/) — 도메인별 깊은 이해

## 피드백

앞으로 나올 만한 문제를 더 추가하려면 PR을 제출해주세요.
