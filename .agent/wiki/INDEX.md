# Clauday LLM Wiki — INDEX

> Karpathy LLM Wiki 패턴의 *Wiki 계층*. LLM(=Ultra Agent)이 소유·갱신·유지보수한다.
> 하단 계층 (Raw Sources): `feature/<도메인>/<task-id>/prd.md`, `adr.md` — 불변.
> 본 Wiki 는 Raw Sources 가 쌓일 때마다 *합성*되어 누적 풍부해진다.

## 어떻게 쓰는가

- 새 세션이 시작되면 **반드시 INDEX.md → architecture.md 순으로** 읽어 프로젝트의 *방향성* 부터 흡수.
- 특정 도메인 작업 시 `domain-*.md` 만 추가로 읽으면 됨.
- 작업이 끝날 때 (integrator 단계) **반드시** `decisions-log.md` 및 영향받은 `domain-*.md` 를 갱신.

## 문서 지도

### 0. 전체 개요

- [architecture.md](architecture.md) — Electron 2층 (main / renderer) + preload, 빌드/패키징, 네이티브 모듈, IPC 흐름, 외부 시스템

### 1. 도메인별 깊이

| 도메인 | 핵심 책임 | 문서 |
|---|---|---|
| Electron IPC | main↔renderer 경계, contextBridge, 채널 상수 관리 | [domain-electron-ipc.md](domain-electron-ipc.md) |
| Terminal | node-pty + xterm, PATH 보강, 한글 UTF-8, 알트스크린 sanitize | [domain-terminal.md](domain-terminal.md) |
| Dooray Bot (@clauday) | Socket Mode WebSocket + 멘션 파이프라인 (Context → prompt → terminal spawn → hook → response) | [domain-dooray-bot.md](domain-dooray-bot.md) |
| Claude Chat | Claude CLI spawn + stream-json 파싱 + 세션 관리 + 첨부 | [domain-claude-chat.md](domain-claude-chat.md) |
| CalDAV Calendar (v1.5) | CalDAV (tsdav) + 로컬 캘린더 통합, etag diff 폴러 | [domain-caldav.md](domain-caldav.md) |
| MCP / Skills | Claude Code `~/.claude.json` mcpServers 활성-비활성 갈라치기, 스킬 공유 | [domain-mcp-skills.md](domain-mcp-skills.md) |
| AI Service | Anthropic 호출 라우팅, 모델 차등, Windows/Mac 분기 함정 | [domain-ai-service.md](domain-ai-service.md) |

### 2. 결정 이력

- [decisions-log.md](decisions-log.md) — 채택된 ADR 의 한 줄 요약 + 링크 누적 (Wiki 가 가장 자주 갱신하는 파일)

## 갱신 정책

1. 새 ADR 1건 채택 → `decisions-log.md` 에 1줄 추가 + ADR 경로 링크 (필수)
2. 도메인 핵심 메커니즘 변경 → 해당 `domain-*.md` 본문 *직접 수정* (덮어쓰기 가능, git 이력으로 추적)
3. 새 도메인 추가 → 본 INDEX 표 + `domain-*.md` 신규 작성
4. `architecture.md` 는 *큰 그림* 만 — 디테일은 도메인 문서로 위임. 큰 변화 (예: 빌드 시스템 교체) 가 아니면 잘 안 변함.

## 무엇을 *쓰지 않는가*

- 코드 그대로 복사 금지 — 코드는 진실의 원천. Wiki 는 *왜* 와 *어떻게 연결되는가* 만.
- 진행 중 작업 / TODO — `feature/**/prd.md` (Raw Sources) 의 영역.
- 비밀 (토큰, URL, 키) — 금지.
