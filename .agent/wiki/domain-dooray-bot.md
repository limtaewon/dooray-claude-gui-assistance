# Domain — Dooray Bot (@clauday)

> Clauday 가 두레이 채널에 *상주봇* 으로 들어가서 `@clauday <요청>` 멘션을 받아 Claude Code CLI 를 띄우는 흐름.
> Ultra Agent 와는 *별개* (Ultra Agent 는 *외부* 메신저 채널에 결합된 다른 Claude Code 인스턴스). 본 도메인은 Clauday *내장* 봇.

## 전체 흐름

```
[두레이 채널] @clauday 도와줘
   │  Socket Mode WS
   ▼
SocketModeClient   ─ events ─▶  BotService  ─ raw event ─▶  MentionDispatcher
                                                                 │ (trigger='clauday')
                                                                 ▼
                                              ContextCollector (최근 대화 fetch)
                                                                 │
                                                                 ▼
                                              promptBuilder (md 파일 본문 합성)
                                                                 │
                                                                 ▼
                              AgentWorkspaceManager (~/Clauday-Workspaces/agent/{channelId}/)
                                  CLAUDE.md, .claude/settings.local.json, tasks/{logId}.md 준비
                                                                 │
                                                                 ▼
                              MentionTerminalSpawner ── 터미널 spawn ──▶  claude code CLI
                                                                              │
                                                                              │ Stop hook (HTTP POST → loopback)
                                                                              ▼
                                                                       HookServer  (127.0.0.1, X-Clauday-Secret 검증)
                                                                              │
                                                                              ▼
                                                              transcriptReader (~/.claude/projects/<...>.jsonl)
                                                                              │
                                                                              ▼
                                                                ClaudayResponder
                                                                  (MessengerService 로
                                                                   [Clauday] prefix + ```md
                                                                   감싸서 채널 회신)
```

## 핵심 파일

- `src/main/dooray/socket-mode/SocketModeClient.ts` — WebSocket 핸들러. ping/reconnect/session-limit close 처리.
- `src/main/dooray/socket-mode/BotService.ts` — 봇 설정(도메인/enabled) + SocketModeClient 라이프사이클 + renderer 이벤트 전파.
- `src/main/dooray/mention/MentionDispatcher.ts` — trigger 매칭 (`@clauday`).
- `src/main/dooray/mention/ContextCollector.ts` — 최근 채널 메시지 fetch.
- `src/main/dooray/mention/promptBuilder.ts` — 컨텍스트 → md 본문 변환 (정형 가드라인 X, 자유 응답 허용).
- `src/main/dooray/mention/AgentWorkspaceManager.ts` — 채널별 작업 폴더 준비.
- `src/main/dooray/mention/MentionTerminalSpawner.ts` — 터미널 새 탭 / 기존 탭 재사용 결정 + claude 명령 입력.
- `src/main/dooray/mention/HookServer.ts` — loopback HTTP. claude code 의 `type:"http"` hook 수신.
- `src/main/dooray/mention/transcriptReader.ts` — claude 의 jsonl 파싱.
- `src/main/dooray/mention/ClaudayResponder.ts` — 채널에 송신. `[Clauday]` prefix 강제 + 코드블록/일반 영역 split 후 일반은 ```md``` 로 wrap.

## 디자인 결정

### 1. 봇 토큰이 아니라 사용자 토큰으로 송신
두레이 봇 토큰은 별도 발급이 까다로워 *현재 모드* 는 사용자 본인의 두레이 API 토큰으로 채널 메시지 송신. 채널엔 "본인이 쓴 메시지"로 보임 → 자동임을 알리기 위해 `[Clauday]` prefix 강제.

### 2. 채널별 작업 폴더 (`~/Clauday-Workspaces/agent/{channelId}/`)
- claude code 의 `cwd` 가 채널마다 분리 → 한 채널의 작업이 다른 채널로 누수 안 됨.
- `CLAUDE.md` (채널별 헌법), `.claude/settings.local.json` (이 폴더 trust), `tasks/{logId}.md` (이번 요청의 컨텍스트) 가 그 안에 자동 생성.

### 3. HookServer 의 secret 검증
claude code 가 어떤 외부 endpoint 든 부를 수 있으니, 임의 호출을 차단. `HookServer` 가 부팅 시 랜덤 secret 생성 → `.claude/settings.local.json` 의 hook 정의에 `X-Clauday-Secret: <secret>` 헤더로 박아둠 → 들어오는 요청에서 비교.

### 4. Stop hook 으로 응답 회수
claude code 의 작업이 끝나면 *stop hook* 이 발사. 그게 HookServer 를 두드리고, 우리는 그 시점에 해당 채널의 jsonl 을 읽어 마지막 assistant 메시지를 채널로 회신.

### 5. 코드블록 wrapping (두레이 highlight)
두레이 메신저는 ```{lang}``` 코드 펜스 안에서만 syntax highlight. 일반 markdown(헤더/리스트/테이블) 도 ```md``` 안에 넣어야 보기 좋음. ClaudayResponder 가 응답을 코드블록/일반 영역으로 split → 일반 영역만 ```md``` 로 감쌈.

## Socket Mode 세부

- WS path: `WS_PATH` 상수 (types.ts)
- ping 주기: `PING_INTERVAL_MS`
- session limit close 시: `STANDBY_RETRY_INTERVAL_MS` 후 재시도
- `electron.net` 으로 WS request (Electron 의 시스템 프록시 통합)

## 함정

- **여러 클라이언트 = session limit**: 두레이 동일 토큰으로 여러 WS 동시 접속 차단. 재접속 시 standby retry.
- **워크스페이스 폴더 권한**: macOS 의 보호 디렉터리 (Documents/Downloads) 에 만들면 권한 프롬프트 발생. `~/Clauday-Workspaces/` 가 적절.
- **transcript jsonl 의 마지막 메시지**: 항상 assistant 가 아닐 수 있음 (사용자 메시지로 끝날 수도). 마지막 assistant 만 추려서 응답.
- **TUI 진입 (claude TUI 모드) → 응답 회수 실패**: stop hook 은 -p 모드에서만 안정적. 채널 멘션 응답은 `claude -p` 비대화형 권장.

## 갱신 정책

- 새 hook 종류 / secret 정책 변경 / 코드블록 wrapping 정책 변경 시 본 문서 갱신
