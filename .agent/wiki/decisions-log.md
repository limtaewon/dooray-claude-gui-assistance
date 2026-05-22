# Decisions Log — Clauday

> 채택된 ADR (`feature/<도메인>/<task-id>/adr.md`) 의 *한 줄 요약 + 링크* 누적.
> Wiki 가 가장 자주 갱신하는 파일. integrator 가 매 PR 마지막에 자동 갱신.

## 형식

```
- YYYY-MM-DD — [<제목>](feature/<도메인>/<task-id>/adr.md) — <한 줄 요약>. <영향 도메인>.
```

## 시드 — 과거 큰 결정 (CLAUDE.md / CHANGELOG.md 기반 재구성)

> 아래는 본 워크플로우 도입 *이전* 의 결정들을 후행 재구성. 원본 ADR 파일은 없음 (PR/커밋 메시지 참조).

- 2026-05 — **AIService.runClaudeStream Windows 한정 stdin combine (v1.5.5)** — 큰 system prompt 가 cmd argv 파싱과 충돌해 stream-json 잘림. Windows 에서만 `--append-system-prompt` 를 argv 에서 빼서 stdin prefix 로 합침. 영향: ai-service.
- 2026-05 — **Raw stdout fallback (v1.5.4)** — 특정 Windows 환경에서 stream-json 미수신 시 평문 rawStdout 을 result 로 통과. 영향: ai-service.
- 2026-05 — **prompt 본문 → stdin (v1.5.2)** — Mac/Win 공통. argv 8KB 한계 회피. 영향: ai-service.
- 2026-05 — **CalDAV (tsdav) 로 캘린더 전환 (v1.5)** — 두레이 네이티브 API 의 토큰 변동/race 문제. ICS 텍스트를 단일 source. CalendarObjectsStore 디스크 영구 저장. listEvents 는 서버 호출 안 함. CTagPoller 3분 etag diff. 영향: caldav.
- 2026-05 — **MCP 비활성화 = 키 이동 (`_claudayDisabledMcp`)** — Claude Code 가 `disabled: true` 무시. mcpServers 밖으로 이동시켜 시야 차단. 영향: mcp-skills.
- 2026-04 — **두레이 봇 = 사용자 토큰 송신 + `[Clauday]` prefix 강제** — 봇 토큰 별도 발급 어려움. 본인 메시지로 보이므로 자동임을 명시. 영향: dooray-bot.
- 2026-04 — **채널별 작업 폴더 `~/Clauday-Workspaces/agent/{channelId}/`** — claude code cwd 분리로 작업 누수 차단. 영향: dooray-bot.
- 2026-04 — **HookServer secret 검증 (X-Clauday-Secret)** — 임의 endpoint 호출 차단. 영향: dooray-bot.
- 2026-04 — **PATH 보강 *append* (prepend 금지)** — 사용자 신버전을 우리 폴백 구버전이 가리는 회귀. terminal + ai-service 동일 정책. 영향: terminal, ai-service.
- 2026-04 — **`claude` 절대경로 우선 spawn** — 사용자 머신에 여러 claude 깔린 경우 PATH 검색이 구버전 잡음. `which/where` 로 정확한 경로 확보. 영향: ai-service, claude-chat.
- 2026-04 — **Ultra Agent 모드 — 단일 개발자 + 개인 레포 파일 저장** — 두레이 위키/태스크 생성 안 하고 모든 산출물은 본 레포에. intake / release-manager 비활성. PR 머지는 사용자 직접. 영향: 전체 (워크플로우).

## 갱신 규칙 (integrator 가 자동 수행)

1. PR 의 변경에 신규 `feature/**/adr.md` 가 있으면 위 형식으로 한 줄 추가
2. 최신이 위로 (chronological reverse)
3. 영향 도메인이 여러 개면 ", " 로 join
4. 본문 길이 200줄 초과 시 가장 오래된 시드 항목부터 *summarize.md* 같은 별도 파일로 이관 (선택)
