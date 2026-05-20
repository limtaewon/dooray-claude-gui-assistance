# Clauday

두레이(Dooray) × Claude Code 통합 데스크탑 앱. Electron + React + TypeScript.

## 기술 스택

- **런타임**: Electron 33 (Chromium + Node), `electron-vite` 빌드
- **UI**: React 18, React Router 6, TailwindCSS, lucide-react, recharts
- **터미널**: `@xterm/xterm` (renderer) + `node-pty` (main, native)
- **에디터**: `@monaco-editor/react`
- **저장소**: `electron-store` (JSON), `keytar` (OS keychain, native)
- **외부 연동**: 두레이 REST API, 두레이 Socket Mode(WebSocket via `ws`), CalDAV(`tsdav`), Claude Code CLI(spawn)
- **언어**: TypeScript (strict)

## 디렉터리 구조

```
src/
  main/         Electron main process (Node)
    ai/         AIService (Anthropic 호출 라우팅)
    analytics/  로컬 사용량/이벤트 트래킹
    caldav/     CalDAV 클라이언트 + 캘린더 통합 (v1.5)
    claude/    Claude Code 세션·채팅·첨부 서비스
    config/    MCP/Skills 매니저 + ConfigWatcher
    dooray/    DoorayClient, Task/Wiki/Messenger Service
      mention/      @clauday 멘션 처리 파이프라인
      socket-mode/  두레이 봇 WebSocket
    git/       워크트리/브랜치 관리
    holiday/   공휴일 처리
    skills/    스킬 스토어/공유
    terminal/  TerminalManager (node-pty wrapper)
    usage/     Claude Code 사용량 파서
    watcher/   메신저 와처
    index.ts   Electron entry, IPC 핸들러 등록 (≈1500줄)
  preload/     contextBridge IPC API 노출 (index.ts 단일 파일)
  renderer/    React UI
    src/
      App.tsx              View 라우팅(`activeView` state 기반)
      components/          뷰별 컴포넌트 (Dooray/Terminal/Sessions/MCP/Skills/...)
      hooks/               useTheme, useFontSettings, useAIProgress
      design-system.css    공용 디자인 토큰
  shared/      main↔renderer 공용 타입 (`types/`), 위키 저장소 기본값
```

## 경로 별칭 (renderer 전용)

- `@` → `src/renderer/src`
- `@shared` → `src/shared`

main/preload는 별칭 없이 상대 경로(`../shared/...`)를 사용합니다.

## 빌드 & 개발

```bash
npm install          # postinstall: electron-rebuild로 node-pty, keytar 리빌드
npm run dev          # electron-vite dev
npm run build        # 타입 체크 없이 vite 빌드 (tsc 별도 실행 안 함)
npm run dist         # macOS dmg
npm run dist:win     # Windows exe
npm run dist:all     # mac + win
npm run icons        # scripts/generate-icons.mjs
```

빌드 산출물: `out/` (개발용), `release/` (배포 패키지).

## IPC 패턴

- 채널 상수는 `src/shared/types/ipc.ts` 의 `IPC_CHANNELS` 에 모아둠.
- renderer 는 `window.api.<도메인>.<메서드>` 형태로 호출 (preload `contextBridge`).
- 새 IPC 추가 시 ① shared/types에 타입 → ② preload에서 노출 → ③ main/index.ts 에 `ipcMain.handle` 등록.

## 네이티브 모듈

- `node-pty`, `keytar` 는 OS별 prebuild 필요. `package.json` 의 `postinstall` 이 `electron-rebuild -f -w node-pty,keytar` 실행.
- `electron-builder` 의 `asarUnpack` 으로 두 모듈은 asar에서 풀려서 패키징됨.

## 주요 도메인 노트

- **@clauday 봇** (`src/main/dooray/socket-mode/`, `src/main/dooray/mention/`): 두레이 WebSocket 으로 멘션 수신 → `ContextCollector` 로 최근 메시지 수집 → `promptBuilder` 로 프롬프트 합성 → `MentionTerminalSpawner` 가 Claude Code CLI 를 spawn → `HookServer` 의 stop hook으로 응답 수집 → `ClaudayResponder` 가 채팅방에 회신. 채널별 작업 폴더는 `~/Clauday-Workspaces/agent/{channelId}/`.
- **터미널** (`src/main/terminal/TerminalManager.ts`): 로그인 셸로 `node-pty` 스폰. `LANG=ko_KR.UTF-8` 강제, Unicode11 + IME 폭 보정. 세션 이름은 `electron-store` 에 영속화.
- **Claude Code 채팅** (`src/main/claude/`): 세션 메타는 `ClaudeSessionService`, 메시지 스트리밍은 `ClaudeChatService`. `claude -r {sessionId}` 로 resume.
- **MCP / Skills 관리**: 활성/비활성 토글은 실제로 Claude Code 가 보는 설정 파일을 갈라치기 — 비활성 항목은 별도 보관함으로 옮겨서 로드되지 않게 함. 공유는 두레이 위키(`WikiStorageService`)에 컨테이너 페이지 자동 생성.
- **캘린더 (v1.5)**: 두레이 네이티브 API 대신 CalDAV(`tsdav`) 로 전환. `UnifiedCalendarService` 가 원격(CalDAV) + 로컬(`LocalEventStore`) 통합. `CTagPoller` 로 변경 감지.
- **AI 모델 라우팅** (`src/main/ai/AIService.ts`): 기능별 모델 선택. 짧은 요약은 Haiku, 브리핑/위키 분석은 Sonnet, 추천/설계는 Opus.

## 코드 컨벤션

- TypeScript strict, 타입은 `shared/types/` 에 우선 정의 후 main/renderer 양쪽에서 import.
- React 컴포넌트는 함수형 + hooks. 클래스 컴포넌트는 `ErrorBoundary` 외에는 사용하지 않음.
- 디자인 토큰 / 공용 컴포넌트는 `components/common/ds`. 새 UI는 가급적 디자인 시스템 컴포넌트를 재사용.
- 한글 주석 OK. 사용자 문구는 자연스러운 한국어로.

## 기능 추가 시 필수 작업 (Definition of Done)

새 기능 / 새 모듈을 추가하거나 사용자 가시 동작을 변경할 때 아래 둘은 같은 PR 안에 반드시 포함한다.

1. **테스트 코드 작성**
   - 새 모듈(`src/main/**`, `src/shared/**` 의 유틸/서비스)은 vitest 단위 테스트 동봉. 회귀 방지 목적의 표본 케이스만이라도 1개 이상.
   - 버그 수정은 그 버그를 재현하는 테스트를 먼저 (또는 같이) 추가 — off-by-one, 정규식, 시간대 등 회귀가 자주 나는 영역은 특히 필수.
   - IPC 핸들러처럼 electron 의존이 큰 코드는 핵심 로직만 순수 함수로 분리해서 테스트.
   - 단위 게이트는 70% 라인 커버리지 (`vitest.config.ts` 의 thresholds) — 신규 모듈로 떨어뜨리지 말 것.

2. **매뉴얼 업데이트**
   - 사용자 가시 기능이면 `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx` 의 `SECTIONS` 배열 안 해당 영역(또는 새 섹션)에 한국어로 짧게 추가.
   - 단축키/토글/새 패널 같이 발견이 어려운 기능은 반드시 매뉴얼에. 내부 구조 변경만은 매뉴얼 대상 X.
   - 큰 사이클이 끝나면 `CHANGELOG.md` 에 항목 추가, 사용자에게 보이는 변경은 `README.md` 의 스크린샷/스펙도 점검.

## 릴리즈

태그 푸시(`vX.Y.Z`)가 트리거. `.github/workflows/release.yml` 이 macOS(dmg/zip) + Windows(exe) 빌드 후 GitHub Release 자동 업로드. main 머지만으로는 배포되지 않음.

## 참고 문서

- `README.md` — 사용자용 기능 소개 (스크린샷 포함)
- `CHANGELOG.md` — 버전별 변경 이력
- `handoff/` — 마이그레이션 / 핸드오프 노트
- `docs/screenshots/` — README 용 스크린샷
