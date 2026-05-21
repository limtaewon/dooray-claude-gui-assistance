# 개발자 온보딩 가이드

Clauday는 Electron(메인 + 렌더러) + React 기반 데스크탑 앱이며, 두레이(Dooray)와 Claude Code를 한 창에 통합합니다. 이 문서는 신규 개발자가 효율적으로 온보딩하기 위한 체계적인 가이드입니다.

## 학습 경로

처음부터 끝까지 순서대로 읽기를 권장합니다. 각 문서는 다음 수준에서 필요한 선수 지식을 제공합니다.

### 1단계: 기본 이해 (1~2시간)
- **이 문서 (README.md)** — 전체 구조와 학습 순서
- **[architecture.md](./architecture.md)** — 3 프로세스 경계, 데이터 흐름, 디렉터리 구조

### 2단계: 통신 & 설정 (1시간)
- **[ipc.md](./ipc.md)** — IPC 채널 추가 절차, 패턴, 카탈로그
- **[conventions.md](./conventions.md)** — TypeScript, React, 로깅 규칙

### 3단계: 빌드 & 배포 (30분)
- **[native-modules.md](./native-modules.md)** — node-pty, keytar, electron-rebuild
- **[release.md](./release.md)** — 태그 기반 릴리즈 워크플로우

### 4단계: 주요 도메인 심화 (필요한 것만)
문제 공간별로 나뉘어 있습니다. 관련 기능을 개발할 때 해당 도메인 문서를 읽으세요.

- **[domains/dooray-bot.md](./domains/dooray-bot.md)** — `@clauday` 멘션, WebSocket, 채널별 워크스페이스
- **[domains/terminal.md](./domains/terminal.md)** — node-pty, 한글 IME, 세션 영속화
- **[domains/claude-chat.md](./domains/claude-chat.md)** — Claude Code 세션 관리, 채팅 UI 통합
- **[domains/mcp-skills.md](./domains/mcp-skills.md)** — MCP/Skills 활성/비활성 토글, 위키 공유
- **[domains/caldav.md](./domains/caldav.md)** — v1.5 CalDAV 캘린더, 로컬 동기화
- **[domains/ai-routing.md](./domains/ai-routing.md)** — 기능별 모델 선택, Haiku/Sonnet/Opus

### 5단계: 테스트 & 디버깅
- **[testing.md](./testing.md)** — Vitest + RTL, 모킹 정책, 테스트 추가 방법
- **[troubleshooting.md](./troubleshooting.md)** — 자주 나오는 빌드/런타임 이슈

## 핵심 컨셉

### 3 프로세스 경계
Clauday는 Electron의 3 프로세스로 나뉘어 있습니다.

- **Main (Node)**: 파일 시스템, 네이티브 모듈(node-pty, keytar), IPC 핸들러, 외부 API 호출
- **Preload (Node)**: Main과 Renderer 사이의 메시지 브릿지. `contextBridge`로 `window.api` 노출
- **Renderer (Chromium)**: React UI, 사용자 입력, 상태 관리

각 프로세스는 정확한 책임 경계가 있습니다. 자세한 내용은 [architecture.md](./architecture.md)를 참고하세요.

### IPC 패턴 (핵심)
새 기능을 추가할 때마다 renderer ↔ main 통신이 필요합니다.

1. **타입 정의**: `src/shared/types/ipc.ts`의 `IPC_CHANNELS`에 채널 상수 추가
2. **Preload 노출**: `src/preload/index.ts`에 `window.api.<도메인>.<메서드>` 추가
3. **Main 핸들러**: `src/main/index.ts`의 `ipcMain.handle()`로 로직 구현

패턴은 간단하지만 빼먹기 쉬운 부분이 많습니다. [ipc.md](./ipc.md)의 체크리스트를 반드시 읽으세요.

### 데이터 흐름
- **Top-down (Renderer → Main)**: 사용자 액션 → IPC invoke → Main 로직 → DB/API 호출
- **Bottom-up (Main → Renderer)**: 백그라운드 이벤트 → IPC on 구독 → UI 업데이트
- **양방향**: Terminal 출력, CalDAV 동기화, 와처 메시지 등

Preload에서 `ipcRenderer.on()` 핸들러를 공유하는 기법이 있습니다. [preload/index.ts:6-20](../../src/preload/index.ts)을 참고하세요.

## 프로젝트 구조

```
docs/dev/
  README.md                 ← 지금 읽는 파일
  architecture.md           ← 프로세스 경계, 디렉터리 설계
  ipc.md                    ← IPC 채널 추가 절차
  conventions.md            ← 코드 스타일, 컨벤션
  testing.md                ← 테스트 전략, Vitest + RTL
  native-modules.md         ← node-pty, keytar, electron-rebuild
  release.md                ← GitHub Actions 릴리즈 파이프라인
  troubleshooting.md        ← 빌드/런타임 문제 해결
  domains/
    dooray-bot.md           ← @clauday 멘션, Socket Mode WebSocket
    terminal.md             ← TerminalManager, 한글 IME 보정
    claude-chat.md          ← ClaudeSessionService, 채팅 UI
    mcp-skills.md           ← MCP/Skills 토글 동작
    caldav.md               ← CalDAV 캘린더 통합
    ai-routing.md           ← AIService 모델 선택 규칙
```

## 개발 시작하기

### 필수 사전 준비
- Node.js 20+
- Python 3.11+ (node-gyp 호환)
- macOS 또는 Windows
- Claude Code CLI 인증 완료 (`claude login`)

### 로컬 개발 환경
```bash
# 1. 의존성 설치 (postinstall에서 node-pty, keytar 재빌드)
npm install

# 2. 개발 모드 시작
npm run dev

# 3. (별도 터미널) TypeScript 타입 체크
npm run typecheck
```

자세한 빌드 명령은 프로젝트 루트의 `package.json`을 참고하세요.

## 코드 리뷰 체크리스트

새로운 코드를 작성할 때 다음을 항상 확인하세요.

### IPC 추가 시
- [ ] `IPC_CHANNELS`에 채널 상수 추가 (타입 안전성)
- [ ] Preload에서 `contextBridge` 노출 확인
- [ ] Main에서 `ipcMain.handle()` 또는 `ipcMain.on()` 핸들러 등록
- [ ] 에러 처리 및 Renderer 쪽 타입 확인

### React 컴포넌트 추가 시
- [ ] 함수형 컴포넌트 + hooks 사용 (클래스 X)
- [ ] 디자인 시스템 컴포넌트 우선 사용 (`components/common/ds/`)
- [ ] 한글 주석/문구 자연스러운지 확인
- [ ] 경로 별칭 사용 (`@`, `@shared`)

### Main 서비스 추가 시
- [ ] 에러 로깅 규칙 준수 (`[ClassName]` prefix)
- [ ] 비동기 작업 타입 명시
- [ ] Renderer 쪽 IPC 타입과 일치하는지 확인

더 자세한 내용은 [conventions.md](./conventions.md)를 참고하세요.

## 문제 해결

### "Type 'ClaudayResponse' is not assignable to type..."
- IPC 채널의 요청/응답 타입 불일치. [ipc.md](./ipc.md)의 타입 정의 확인

### node-pty/keytar 빌드 실패
- `npm install` 시점에서 실패했으면 Python 버전 확인. [native-modules.md](./native-modules.md) 참고

### CalDAV 동기화 느림
- 처음 연결 시 `fullSync()`는 대량의 일정을 받는다. [domains/caldav.md](./domains/caldav.md) 참고

더 많은 문제는 [troubleshooting.md](./troubleshooting.md)에 정리되어 있습니다.

## 문서 업데이트

이 문서들은 코드와 함께 진화합니다.

- 새로운 도메인 추가 → `domains/{name}.md` 신설
- 새로운 컨벤션 추가 → [conventions.md](./conventions.md) 갱신
- 테스트 전략 변경 → [testing.md](./testing.md) 갱신

PR 작성 시 해당 문서도 함께 업데이트하면, 팀 전체가 같은 이해도를 유지할 수 있습니다.

## 참고 문서

프로젝트 루트의 다음 파일들도 개발에 도움이 됩니다.

- `README.md` — 사용자용 기능 소개 (스크린샷)
- `CHANGELOG.md` — 버전별 변경 이력 및 설계 결정
- `CLAUDE.md` — 기술 스택, 주요 도메인, 코드 컨벤션 (간단 버전)

## 더 알아보기

- [Electron 공식 가이드](https://www.electronjs.org/docs)
- [node-pty 문서](https://github.com/microsoft/node-pty)
- [tsdav 문서](https://github.com/ndom91/tsdav) (CalDAV 클라이언트)
- [Claude Code CLI](https://docs.anthropic.com/claude/reference/claude-code)

## 질문 & 피드백

- 개발 중 막히는 부분 → 해당 도메인 문서 확인 후, 없으면 [troubleshooting.md](./troubleshooting.md) 참고
- 문서 오류/누락 → PR로 수정해주세요
- 새로운 컨벤션 제안 → 팀 논의 후 문서화

즐거운 개발 되세요!
