# Domain — Claude Chat (Claude Code CLI 통합)

> Clauday 내부의 *Claude Code 채팅 UI* — 사용자가 Clauday 창 안에서 claude code 와 대화. CLI 를 spawn 해서 stream-json 을 파싱한다.

## 핵심 파일

- `src/main/claude/ClaudeChatService.ts` — claude CLI spawn + stream-json 파서 + 이벤트 emit
- `src/main/claude/ClaudeSessionService.ts` — `~/.claude/projects/<cwd-hash>/<sessionId>.jsonl` 파싱 + 메타 캐싱 + `customTitle`/`starred` 영속화
- `src/main/claude/AttachmentService.ts` — 클립보드 이미지/임시 파일을 절대 경로로 저장 (채팅 첨부)
- `src/main/claude/sessionPreview.ts` — 첫 user 메시지로 title fallback

## CLI 호출 모델

```
사용자 입력
   ↓ IPC (CLAUDE_CHAT_SEND)
ClaudeChatService.send()
   ↓ child_process.spawn
claude -r <sessionId> -p "<message>" --output-format stream-json --verbose
   ↓ stdout (line-delimited JSON)
   ↓ 파서: stream_event / assistant / user / result
   ↓ IPC push (CLAUDE_CHAT_EVENT) — text_delta / tool_use / tool_result / final
사용자 UI (실시간 갱신)
```

## stream-json 파싱 케이스

- `type: "stream_event"`, `event.type: "content_block_delta"`, `delta.type: "text_delta"` — 본문 청크. `delta.text` 를 누적.
- `type: "assistant"`, content 가 array — text 블록 / tool_use 블록 분리해서 노출. tool_use 는 `🔧 tool(input요약)` 라인으로.
- `type: "user"`, content 의 `tool_result` — MCP 응답. 요약(120자) 만 `↳ ✓/❌ <brief>` 로.
- `type: "result"` — 최종 메타 (duration, cost, session_id, is_error).
- `thinking_delta` — *무시* (사용자에 노출 X).

## 세션 모델

- **세션 = `~/.claude/projects/<cwd-base64>/<uuid>.jsonl`**. claude 가 자동 관리.
- Clauday 는 *읽기 전용*. 메타(title/customTitle/starred/lastActivityAt/messageCount) 만 `electron-store` 에 사이드카로 저장.
- `claude -r <sessionId>` 로 resume.

## CLI 경로 탐색

`resolveClaudePath()`:
1. `process.env.CLAUDE_CLI_PATH` (오버라이드)
2. `which claude` / `where claude` (사용자 셸의 PATH)
3. 알려진 절대 경로 (`~/.claude/local/claude`, `/opt/homebrew/bin/claude`, ...)
4. 단순 `claude` (PATH 폴백)

**절대경로 우선 이유**: 사용자에 따라 claude 가 여러 곳에 깔려있는데, spawn 시점에 우리 PATH 보강 때문에 *구버전* 이 잡혀 신규 옵션이 "unknown option" 으로 실패하는 케이스 방지.

## 첨부 (AttachmentService)

- 클립보드 이미지 → `userData/attachments/<timestamp>-<hash>-<filename>.png` 저장 → 절대 경로 반환
- 채팅 메시지 본문에 그 절대 경로를 명시하면 claude 가 Read tool 로 직접 읽음

## 함정

- **`-r <sessionId>` 가 무효**: 세션 jsonl 이 없으면 claude 가 새 세션을 시작. 호출 전 SessionService 로 존재 확인.
- **stream-json 라인 미수신 (특정 Windows 환경)**: ai-service 와 같은 문제. `domain-ai-service.md` 의 raw stdout fallback 패턴 참고. ClaudeChatService 는 *대화 중* 끊김에 더 민감 — 더 엄격한 진단/로깅 필요.
- **PTY vs spawn**: 채팅 CLI 호출은 PTY 가 아니라 spawn (stdout 만 파싱). 사용자 인터랙티브가 필요한 명령(/login 등) 은 *터미널 탭*에서.
- **세션 jsonl 의 streaming 잠금**: claude 가 쓰는 도중 우리가 읽으면 마지막 줄 truncated 가능. sessionPreview 는 끝에서부터 안전하게 파싱.

## 갱신 정책

- 새 stream_event type 추가 / CLI 옵션 표준 변경 시 본 문서 갱신
- 세션 메타 schema 변경 시 본 문서 + electron-store 마이그레이션 명시
