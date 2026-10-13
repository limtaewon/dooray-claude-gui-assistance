---
task: v2.1-agentic
domain: dooray-bot
updated: 2026-10-13
---

# Impl log — @clauday 에이전트 강화 (v2.1)

## 모듈 지도 (구현 후)

```
Socket Mode 이벤트
 ├─ MentionDispatcher ─(처리 logId 기록·중복 방지)─▶ MentionPipeline.handle
 │     ▲ dispatchContext                              ├ STALE(3h) 안내 / tryReserve(busy 선점)
 │     │                                              ├ ContextCollector.collect (원글·첨부·인용·마스킹)
 │  MentionCatchUp.find ◀─ 소켓 ACTIVE(재연결)         ├ AgentWorkspaceManager (프롬프트·첨부·hook 설정·번들 스킬)
 │                                                    ├ MentionTurnTracker.begin → 진행 메시지 송신 → ProgressReporter.start
 │                                                    └ MentionTerminalSpawner.dispatch (acceptEdits | 자율)
 └─ ApprovalBroker.onReply (승인 대기 채널의 내 답장)

claude TUI hook ─▶ HookServer ─▶ ClaudeHookRouter
   UserPromptSubmit ─▶ MentionHookHandler → MentionTurnTracker.onPromptSubmit (멘션 턴 / 직접 입력)
   PreToolUse       ─▶ MentionHookHandler → ProgressReporter.onTool (단계)
   PermissionRequest─▶ (동기) MentionHookHandler.decide → ApprovalBroker.request → hook 응답
   Stop             ─▶ MentionHookHandler → ProgressReporter.stop → ResultPublisher.publish

소켓 상태 ─▶ BotSocketLog(JSONL) · AwakeKeeper(충전 중 잠자기 방지) · runMentionCatchUp
```

## 변경 파일

**신규 — `src/main/dooray/mention/agent/`**
`DoorayFormatter` (md→두레이 평문, 메시지 분할, 제목·요약) · `AgentCardBuilder` (완료 카드) · `ResultPublisher` (짧은 답/긴 답 글타래/진행 완료) · `SecretMasker` · `MentionTurnTracker` · `ProgressReporter` · `ApprovalBroker` · `bundledSkills` (+ 각 `*.test.ts`)

**신규 — 그 밖**
`dooray/mention/MentionPipeline.ts` (index.ts 의 멘션 처리 이전) · `dooray/mention/MentionCatchUp.ts` (+ `MentionCatchUpState`) · `dooray/socket-mode/BotSocketLog.ts` · `power/AwakeKeeper.ts` · `shared/types/bot.ts`

**변경**
- `dooray/MessengerService.ts` — sendMessage 가 logId 반환, `sendCard`·`updateMessage`·`createThreadAndSend`·`downloadChannelFile`·`listAllChannelsRaw`
- `dooray/mention/ContextCollector.ts` — 글타래 원글(캐시)·첨부·인용·글타래 답글 수·마스킹
- `dooray/mention/promptBuilder.ts` — 원글 섹션·첨부 경로·회신 형식·번들 스킬 안내
- `dooray/mention/ClaudayResponder.ts` — ```` ```md ```` 감싸기 제거, logId 반환
- `dooray/mention/MentionHookHandler.ts` — 도구 꼬리말 제거, 턴 판정, `decide`(승인), PreToolUse 진행
- `dooray/mention/MentionDispatcher.ts` — 처리 기록·`dispatchContext`·`matches`
- `dooray/mention/MentionTerminalSpawner.ts` — `tryReserve`/`release`, 권한 모드 플래그
- `dooray/mention/AgentWorkspaceManager.ts` — `saveAttachment`, 승인 모드, `syncBundledSkills`
- `dooray/mention/HookServer.ts` — permission_request 동기 응답 + 연결 끊김 abort
- `hooks/ClaudeHookRouter.ts` — `decide`/`setDecider`
- `claude/claudeDirSetup.ts` — UserPromptSubmit·PreToolUse·PermissionRequest hook, `DEFAULT_MENTION_POLICY`, permissions 합치기
- `dooray/mention/transcriptReader.ts` — 안 쓰는 `truncateForMessenger` 삭제
- `index.ts` — 위 모듈 연결, `BOT_GET_AGENT_STATUS`·`BOT_SET_KEEP_AWAKE`·`BOT_SET_PERMISSION_MODE`
- `shared/types/ipc.ts`, `preload/index.ts` — 위 IPC
- `renderer/.../Settings/SettingsView.tsx` — @clauday 권한 모드·깨어 있기·연결 상태
- `renderer/.../onboarding/tours.ts` — agent 투어 2단계, settings 투어 2단계(`bot-permission-mode`, `bot-keep-awake`)

## 기획과 달라진 점

| 기획 | 구현 | 이유 |
|---|---|---|
| 진행 체크리스트 = TodoWrite | 도구 이벤트 → 단계 | 2.1.296 대화형 세션에 할 일 도구 미노출(실측) |
| 3시간 초과 멘션은 "실행할까요?" 확인 | 안내만 | 답장 대기 장치는 승인 브로커 몫 — D9 결정 대기 |
| Drop 자동 발행·DropClient·Drop PAT 설정 | 없음 | D7 — 개인 스킬 + `internal-systems` 안내 |
| 승인 프리셋 3종(신중/균형/자율) | 2종(두레이 승인/자율) | 정책 하나를 먼저 실사용으로 검증 |

## 테스트가 잡아 고친 버그

- `SecretMasker` — `DB_PASSWORD=`·`ACCESS_TOKEN=` 같은 환경변수형 키, 따옴표 안 공백 값이 안 가려짐
- `DoorayFormatter` — `# C#` 제목 끝 `#` 잘림
- `MentionPipeline` — dispatch 실패 시 대기 턴이 남아 다음 Stop 이 오회신 대상
- `ApprovalBroker` — 판정 뒤에도 대기가 남아 같은 채널의 일반 대화 "승인"/"ok" 를 삼킴 · "no problem" 을 거절로 판정 · 이미 PC 에서 처리된 요청에 카드 송신 · 자동 거절 표기 10분(실제 9.5분)
- `ProgressReporter` — `execute_select` 를 "DB 변경 중" 으로 표기
- `DangerGate` — 래퍼 우회 미탐(`/bin/rm -rf`, `\rm`, `env … git push`, `bash -c "git push"`, `xargs rm -rf`, `find -exec rm -rf`/`-delete`), 따옴표 안 `;` 오탐, `(git push)` 서명 불일치, `execute_ddl` 미탐, `2>&1` 의 `&` 를 구분자로 오인
- `MentionTerminalSpawner` (기존 버그 B3) — 죽은 탭 기록을 지운 뒤 이전 세션을 읽어 `--resume` 불가. 기존 테스트가 이 동작을 정상으로 고정하고 있었다
- `DoorayFormatter` — 질문으로 끝나는 아주 긴 답(1,500자 초과)이 채널을 여러 조각으로 덮음 → 글타래로

## 함께 고친 버그

- **B1 터미널 ⌘클릭** — 원인은 마우스 트래킹 자체가 아니라 `ptyMouseSuppression.ts` 가 `terminal.element` **캡처 단계**에서 mousedown 을 끊어 자식 `.xterm-screen` 의 xterm Linkifier 까지 막은 것. Linkifier 는 mousedown 에 "누른 링크" 를 기억하고 mouseup 에 같은 링크일 때만 activate 하므로 툴팁만 뜨고 안 열렸다(URL 링크도 동일). `.xterm-screen` **버블 단계**로 옮겨 Linkifier 는 받고 PTY 리포팅(`terminal.element`)으로는 안 올라가게 함. xterm 내부 필드는 건드리지 않음. 회귀 테스트: 실제 DOM 구조(element > .xterm-screen > target)로 Linkifier 수신 확인.
- **B2 멘션 hook 경로** — `MentionHookHandler.resolve` 가 `startsWith(agentRoot)` 만 봐서 형제 폴더를 채널 `..` 로 잡던 것을 경로 경계(`agentRoot + sep`)까지 보도록.

## 실기 확인

### 1차 — 2026-10-13 18:14~18:21, 개인 채널, `npm run dev`
| 항목 | 결과 |
|---|---|
| 짧은 답 회신·진행 메시지 `✅ 완료 · m:ss ↓` | ✅ |
| 진행 단계 표시 `⏳ 작업 중 · 0:13 · 🟧 두레이 승인 대기 중` | ✅ |
| 승인 카드 → "승인" / "항상 승인" 답장 | ✅ 동작. 단 **너무 잦음** — `mdfind`·`wc`·`shasum` 같은 읽기 명령까지 승인 요구 → D11·ADR-08 |
| 버튼 | 없음(A안 설계대로). 사용자 질문 — 답장 방식 안내 |
| 회신 가독성 | ❌ 빽빽한 문단, 긴 경로 칩이 두 줄로 꺾임, 선택지 덩어리 → D12 |
| 질문으로 끝난 답 | ❌ 600자 초과로 카드+글타래로 갈라져 질문이 글타래에 숨음 → `endsWithQuestion` |
| 백그라운드 하위 에이전트 | ❌ 메인 턴 종료 후 하위 에이전트의 권한 요청이 PC 다이얼로그에만 뜨고, 완료 응답이 두레이로 안 나가 "멈춤" → 턴 소유 유지(ADR-08) |
| 에이전트 질문에 답하기 | ⚠️ "1" 만 보내면 무반응, "@clauday 1" 필요 → plan 6-1 |
| Drop 업로드 | 사용자 선택 후 "재무서비스개발팀" 프로젝트에 게시됨 — 정리 여부 사용자 확인 대기 |
