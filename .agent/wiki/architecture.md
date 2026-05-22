# Architecture — Clauday 전체 그림

## 1. 한 줄 요약

**Electron 33** + **TypeScript strict** 로 만든 데스크탑 앱. 두레이 ↔ Claude Code CLI ↔ 사용자 UI 를 한 창에 묶는다. `electron-vite` 빌드, native 모듈 두 개(`node-pty`, `keytar`)는 `electron-rebuild` 로 OS별 prebuild.

## 2. 프로세스 모델

```
┌─────────────────────────────────────────────────────────────────┐
│ Electron App (clauday)                                           │
│                                                                  │
│  ┌──────────────┐  contextBridge   ┌──────────────────────────┐  │
│  │  Renderer    │ ◀─── IPC ───▶   │  Main (Node)             │  │
│  │  (React)     │                  │                          │  │
│  │              │                  │  • ai/         AIService │  │
│  │  components/ │                  │  • terminal/   node-pty  │  │
│  │  hooks/      │                  │  • claude/     CLI spawn │  │
│  │              │                  │  • dooray/     REST + WS │  │
│  │  Tailwind +  │                  │  • caldav/     tsdav     │  │
│  │  Monaco +    │                  │  • config/     MCP/Skill │  │
│  │  xterm.js    │                  │  • watcher/    채널 폴러 │  │
│  └──────────────┘                  └──────────────────────────┘  │
│         ▲                                  │                      │
│         │  exposed via                     │  spawn / fetch       │
│         │  window.api.<도메인>.<메서드>   ▼                      │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  Preload (contextBridge) — IPC API 노출 단일 입구        │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
         │                                  │
         │ 사용자 GUI                        │
         ▼                                  ▼
   ┌──────────┐                    ┌─────────────────────┐
   │ 키보드/  │                    │ 외부 시스템         │
   │ 마우스   │                    │ • 두레이 REST       │
   └──────────┘                    │ • 두레이 Socket WS  │
                                   │ • CalDAV            │
                                   │ • Claude CLI (자식) │
                                   │ • Anthropic API     │
                                   └─────────────────────┘
```

### 왜 2층인가

- **렌더러**는 Chromium 안에서 도는 일반 웹앱. React 18 + Tailwind + lucide-react + recharts + Monaco + xterm 으로 구성.
- **메인**은 Node 프로세스. Native 모듈 / 파일 시스템 / 자식 프로세스 / 네트워크 직접 접근. 모든 *위험한 것* 은 여기에.
- **preload** 가 두 세계의 *유일한 경계*. `contextBridge.exposeInMainWorld('api', { ... })` 로 노출되는 함수만 렌더러가 호출 가능. nodeIntegration 은 끈 상태.

## 3. 빌드 파이프라인

| 명령 | 효과 |
|---|---|
| `npm install` | postinstall: `electron-rebuild -f -w node-pty,keytar` 자동 실행 → OS별 native ABI 맞춤 |
| `npm run dev` | `electron-vite dev` — HMR 가능, 메인/preload/렌더러 모두 watch |
| `npm run build` | `electron-vite build` (vite 만 — `tsc` 별도 실행 *안 함*. 타입 검증은 `npx tsc --noEmit` 별도) |
| `npm run dist` | macOS dmg/zip |
| `npm run dist:win` | Windows exe |
| `npm run icons` | `scripts/generate-icons.mjs` |

산출물: 개발 `out/`, 배포 `release/`.

## 4. 네이티브 모듈

- **`node-pty`** — 터미널 의사단말 (PTY). 메인 프로세스의 `TerminalManager` 가 spawn.
- **`keytar`** — OS keychain 접근 (두레이 토큰 / CalDAV 비밀번호 안전 저장).
- 둘 다 `electron-builder.asarUnpack` 에 등록 → asar 압축에서 풀려 패키징됨.

## 5. IPC 흐름 (전체)

핵심 채널 상수는 `src/shared/types/ipc.ts` 의 `IPC_CHANNELS` 한 곳에 모두 등록. 어떤 IPC 든 추가 시 *반드시*:

1. `src/shared/types/ipc.ts` 의 `IPC_CHANNELS` 에 채널 키 추가
2. `src/preload/index.ts` 에서 `contextBridge` 로 함수 노출
3. `src/main/index.ts` 에서 `ipcMain.handle(channel, fn)` 등록

이 3곳을 어긋나게 두면 렌더러에서 `window.api.xxx is not a function` 로 죽거나, "no handler registered" 가 뜸.

## 6. 외부 시스템

| 시스템 | 통신 방식 | 인증 | 위치 |
|---|---|---|---|
| 두레이 REST | HTTPS (electron `net`) | `dooray-api <token>` 헤더 | `src/main/dooray/DoorayClient.ts` 등 |
| 두레이 Socket Mode | WebSocket (`ws`) | open API 토큰 | `src/main/dooray/socket-mode/SocketModeClient.ts` |
| CalDAV | tsdav | username + app password (keytar) | `src/main/caldav/CalDAVClient.ts` |
| Claude Code CLI | child_process spawn | `claude` 가 자체 keychain | `src/main/ai/AIService.ts`, `claude/ClaudeChatService.ts` |
| Anthropic API (위 CLI 경유) | claude CLI 가 처리 | `ANTHROPIC_API_KEY` env or keychain | (간접) |

## 7. 데이터 저장

| 저장소 | 위치 | 용도 |
|---|---|---|
| `electron-store` JSON | userData/config.json 등 | 설정, 세션 메타, 와처 상태 |
| `keytar` (OS keychain) | OS 별 | 토큰/비밀번호 |
| 파일 시스템 (userData) | `attachments/`, `logs/` 등 | 첨부, CLI 진단 로그 |
| Claude Code 디스크 | `~/.claude/projects/` | 세션 jsonl 들 (Clauday 가 *읽기만* 함) |
| CalendarObjectsStore | userData | CalDAV ICS 원본 영구 저장 |

## 8. 사용자 가시 / 가시 안 가시 변경의 구분

- **사용자 가시**: 새 패널, 새 단축키, 새 토글, 새 메뉴, 텍스트 문구 변경 → **DOD 에 의해 `ClaudeManual.tsx` 의 `SECTIONS` 갱신 의무**.
- **내부 리팩터**: 매뉴얼 갱신 면제. 하지만 `decisions-log.md` 갱신은 의무.

## 9. 큰 변경이 일어났을 때 update 해야 할 곳

| 변경 종류 | update 대상 |
|---|---|
| IPC 채널 추가/삭제 | `domain-electron-ipc.md` (필수) + 본 문서 *변경 없음* |
| 새 외부 시스템 | 본 문서 §6 표 + `domain-<system>.md` 신규 |
| 빌드 시스템 교체 | 본 문서 §3 |
| 네이티브 모듈 추가 | 본 문서 §4 + asarUnpack 확인 |
| 새 도메인 (예: 사진 동기화) | INDEX.md + 신규 `domain-*.md` |

## 10. 참조

- 레포 루트 `CLAUDE.md` — 프로젝트 헌법 + Windows/Mac 분기 함정
- `decisions-log.md` — 결정 이력
- `domain-*.md` — 도메인별 깊이
