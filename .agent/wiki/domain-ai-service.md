# Domain — AI Service (Anthropic 호출 라우팅)

> Clauday 의 모든 LLM 호출을 단일 게이트웨이 (`AIService`) 에서 처리. **Windows/Mac 분기 함정이 가장 큰 운영 리스크**.

## 핵심 파일

- `src/main/ai/AIService.ts` (≈1500줄) — 모델 선택 + claude CLI spawn + stream-json 파싱 + 진행 이벤트
- `src/main/utils/cliLogger.ts` — 진단 로그 (`userData/logs/claude-cli.log`)
- `src/main/utils/procText.ts` — utf-8/euc-kr 자동 판별 + benign stderr 분류

## 기능별 모델 라우팅

`AIModelConfig` 의 키별로 사용자 오버라이드 가능. 기본값(코드에 박힘):

| Feature | 기본 모델 | 비고 |
|---|---|---|
| ask | sonnet | 범용 |
| briefing | **opus** + agentic | 외부 grounding fetch 필요 |
| summarizeTask | haiku | 짧은 요약 |
| wiki* (proofread/improve/structure/summarize/draft) | sonnet | 위키 가공 |
| report | sonnet | 생성형 보고서 |
| calendarAnalysis | sonnet | |
| sessionSummary (insights) | sonnet | |
| generateSkill | sonnet | |
| messengerCompose | sonnet | |
| recommend | sonnet | |

## ⚠ Windows/Mac 분기 함정 (가장 큰 리스크)

`AIService.runClaudeStream()` 은 **의도적으로 다른 경로** 를 탄다. 한쪽만 보고 통일하면 다른 쪽이 회귀로 깨진다.

### Mac/Linux 경로

- `spawn(CLAUDE_CLI, argv, { shell: false })`
- `windowsVerbatimArguments: false`
- argv 에 `--append-system-prompt <content>` 그대로 전달 → claude 가 system prompt 캐싱 적용
- `-p` prompt 본문만 stdin 분리 (양쪽 공통, argv 길이 한계 회피)

### Windows 경로

- `spawn(CLAUDE_CLI, argv, { shell: true, windowsVerbatimArguments: true })` — `claude.cmd` 가 .cmd 라 shell 필요
- `windowsVerbatimArguments: true` 로 cmd codepage 변환 차단 (한글 mojibake 방지)
- **argv 에서 `--append-system-prompt` 제거하고 stdin 의 prefix 로 합침**:
  ```
  [시스템 지시 — 반드시 준수]
  {system prompt}

  ---

  [사용자 요청]
  {user prompt}
  ```
- Why: v1.5.4 진단에서 system prompt 본문(3000+ chars) 의 공백/개행이 cmd 인자 파싱과 충돌해 뒤의 `--output-format stream-json` 잘림 → claude 가 평문 응답.
- 트레이드오프: claude 의 system prompt 캐싱 효과 X. 하지만 응답 정상.

### 자주 무너지는 함정

1. **"양쪽 일관성" 함정** — "더 깔끔하니까 Mac 도 stdin 으로 통일" → Mac 캐싱 깨짐. 두 경로의 동기가 다름.
2. **테스트 한쪽만** — `process.platform` 분기는 vitest 가 Mac 으로 도는 한 Windows 경로 미검증. 양쪽 케이스 `Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })` 로 명시.
3. **shell:true 의존성** — Windows shell:true 는 cmd.exe 가 끼는데 codepage/argv escape 문제 만든다. 손대지 말고 stdin 사용량 늘리는 방향.
4. **진단 로그 빠뜨림** — 모든 호출은 `cliLogger.startCliCall` 로 진단 남김. 새 분기 추가 시 platform/argv 가 로그에 자연스럽게 남는지 확인.

## stream-json 파싱

`domain-claude-chat.md` 와 동일. 차이점: AIService 는 *비대화형* (-p 단발) 호출, ClaudeChatService 는 *대화형*.

### 비치명 stderr (benign)

claude 의 "Warning: no stdin data received in 3s, proceeding without it" 류는 정상 동작 중 발생. `isBenignStderr()` 가 일관 판정 → exit 0 + 결과 비었으면 *빈 결과로 통과* (에러로 노출 X).

### Raw stdout fallback (v1.5.4)

stream-json 라인이 아예 안 들어오는 환경(특정 Windows 머신) → `rawStdout` 누적 (200KB cap) → close 시 finalResult/accumulated 모두 비어있고 rawStdout 에 텍스트 있으면 그걸 result 로 통째 사용. 정상 모드에선 진입 자체 X → 회귀 위험 0.

## 에이전틱 모드 (agentic: true)

`generateBriefing` 등에서 사용. 광범위 read-only 도구 허용:

- 허용: Bash, WebSearch, WebFetch, Read, mcp__dooray-mcp__*, mcp__mcp-clickhouse__*, mcp__mysql-nfi__*
- 차단: Edit, Write, TodoWrite, Task

LLM 이 사용자 스킬 + MCP + 웹으로 직접 grounding data fetch.

## 스킬 주입

`buildSystemPrompt(base, target)`:
- target 별 스킬을 `skillLoader(target)` 로 가져옴
- `[사용자 정의 규칙 — 반드시 준수]` 섹션으로 base 뒤에 붙임
- target → 매핑은 `FEATURE_TO_TARGET` 상수

## 진행 이벤트

`AI_PROGRESS` IPC push:
- `thinking` — 시작
- `streaming` — 청크 (chunk 필드 포함)
- `parsing` — 결과 가공
- `done` — 완료

renderer 의 `useAIProgress` hook 이 구독.

## 함정 (위 분기 외)

- **maxBuffer 5MB**: `runClaude` (비스트리밍) 의 stdout buffer. 큰 위키 본문 등은 stream 으로.
- **타임아웃 120초 기본**: agentic / 큰 작업은 명시적으로 `timeoutMs: 300000` 또는 `timeoutMs: null` (무제한).
- **사용자 ANTHROPIC_API_KEY 주입**: 패키징 앱에서 keychain 접근 불가 케이스 대비. `setUserAnthropicApiKey()` 로 주입 → enrichedEnv 가 env 에 박음.
- **DISABLE_OMC=1**: OMC 의 ultrawork 세션 복원 훅이 매번 75k 토큰 로드 → 비활성.

## 갱신 정책

- **분기 정책 변경 시 본 문서가 최우선 갱신 대상.** 레포 루트 `CLAUDE.md` 의 가이드와 동기 유지.
- 새 feature key 추가 시 §"기능별 모델 라우팅" 표 갱신
- 새 benign stderr 패턴 추가 시 명시
