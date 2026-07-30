---
task: v2-workspace-p0
domain: dooray-bot, claude-chat, renderer-only
created: 2026-07-30
status: accepted
target_version: 2.0.0
---

# PRD — v2.0 Workstream C-0: 선행 추출 리팩터 + ClaudeHookRouter

> 마스터 설계: `~/.claude/plans/toasty-sleeping-simon.md` §Workstream C-0 (Phase 1).
> 본 트랙은 **무동작변경(behavior-preserving) 리팩터 전용**. 새 기능·새 IPC·새 UI 0건.

## 배경 / 문제

v2.0 Workstream C(통합 워크스페이스 뷰 + 병렬 에이전트)는 기존 코드 4곳을 재사용하는 것을 전제로 설계됐다. 그런데 그 4곳이 전부 **재사용 불가능한 형태로 묶여 있다**.

1. `TaskRow` — 태스크 목록의 행 컴포넌트. `ProjectTaskView.tsx:87` 의 **비export 로컬 memo**. C-3(워크스페이스 좌측 태스크 목록)과 C-3.5(터미널 태스크 드로어) 두 곳이 이걸 그대로 써야 하는데 import 할 수가 없다.
2. `DiffPanel` / `FileComparePanel` — `BranchWorkspace.tsx:806/894` 의 비export 로컬 컴포넌트. C-3 우측 패널 "변경사항" 탭이 DiffPanel 을 재사용해야 한다.
3. `AgentWorkspaceManager.preApproveTrust` / `writeHookSettings` — **private 메서드**. C-2 `WorkspaceService.startTask` 가 워크트리에 동일한 trust + hook settings 를 깔아야 하는데, 채널(channelId/CLAUDE.md/tasks) 개념에 묶인 클래스를 통째로 끌어올 수는 없다.
4. `handleClaudeHook` — `index.ts:190-298` 의 **모듈 클로저**. cwd → channelId 단일 경로로 하드코딩돼 있고, `turnBuffers` 를 비롯한 상태를 index.ts 모듈 스코프에 들고 있어 단위 테스트가 불가능하다. C-2 의 workspace run 은 같은 Stop hook 을 다른 소유자(worktreePath)로 받아야 한다.

이 4건을 C-1/C-2/C-3 안에서 "기능 추가와 함께" 처리하면, 기능 버그와 이동 중 회귀가 같은 diff 에 섞여 원인 분리가 불가능해진다. 특히 4번은 **@clauday 멘션 봇의 응답 회수 경로 전체**(Stop hook → 두레이 회신 → markIdle → claudeSessionId 보존)라서, 조용히 깨지면 사용자에게는 "봇이 답을 안 한다"로만 보인다 — 자동 검출 수단이 현재 0.

그래서 추출만 먼저, 동작 변화 0으로 못 박고, 그 위에 C-1~C-3.5 를 쌓는다.

## 목표 (Goals)

1. **재사용 경계 4개 확보** — 후속 트랙이 `import` 한 줄로 쓸 수 있는 모듈 4개(`TaskRow`, `Git/DiffPanel`+`Git/FileComparePanel`, `claude/claudeDirSetup`, `hooks/ClaudeHookRouter`)를 만든다.
2. **hook 수신을 소유자 기반 라우팅으로 일반화** — `resolver(cwd) → route{kind,id}` first-match 체인 + `kind` 별 핸들러. resolver 1번은 기존 멘션 agentRoot prefix 매칭을 **동작 100% 보존**한 이식. C-2 는 resolver 2번(worktreePath 최장 매칭)만 추가하면 되는 상태로 남긴다.
3. **멘션 파이프라인에 회귀 안전망 신설** — 현재 테스트 0인 `handleClaudeHook` 경로에 characterization 테스트를 붙인다. 최소 커버: `composeStopMessage` 본문 구성, `channelSessionStore.setClaudeSessionId` 보존, `markIdle` 호출, 도구 버퍼 누적/비움.
4. **관측 가능한 동작 변화 0** — 렌더 결과, IPC 채널 목록, 파일 쓰기 내용, 두레이 송신 본문, 로그 출력이 추출 전후 동일.

## 비목표 (Non-goals)

- workspace 도메인 타입/서비스/스토어/IPC/UI 신규 — 전부 C-1 이후 몫. `src/shared/types/workspace.ts` 를 이번에 만들지 않는다.
- **발견된 기존 결함의 수정** — 이번 트랙에서 고치지 않는다(ADR-05). 테스트로 현행 동작을 고정하고 후속 이슈로 넘긴다. (예: `extractChannelIdFromCwd` 의 형제 경로 오매칭, `claudayResponder.send` 실패 시 `markIdle` 스킵)
- `HookServer` 의 물리적 이동(`dooray/mention/` → `hooks/`) — 채널/테스트 churn 대비 이득 없음. C-2 에서 재검토.
- `BranchWorkspace` / `ProjectTaskView` 본체의 추가 분해(680줄·581줄 완화) — 이번엔 지정된 3개 컴포넌트만 들어낸다.
- `MentionTerminalSpawner` 의 일반화(C-2 `AgentRunSpawner`), 터미널 관련 일체(Workstream B).
- 사용자 가시 변화가 없으므로 `ClaudeManual.tsx` SECTIONS 갱신 대상 아님. CHANGELOG 는 v2.0 사이클 마감(Phase 4)에서 일괄.

## 수락 기준 (Acceptance Criteria)

- [ ] AC1 — `npm run test:run` 전체 통과. 기존 테스트는 **한 건도 수정하지 않고** 통과 (예외: ADR-02 의 `AgentWorkspaceManager.test.ts` deps 주입 항목은 테스트만 변경 허용, 프로덕션 경로 무변경).
- [ ] AC2 — `npm run typecheck` (node + web 양쪽) 통과.
- [ ] AC3 — 추출 6블록이 **텍스트 동일**. `git show HEAD:<원본>` 기준 baseline 과 새 파일 본문을 `diff` 했을 때 차이가 plan.md §"허용 변형 목록" 4종 외에는 0.
- [ ] AC4 — 신규 렌더러 테스트: `TaskRow` 3 fixture 스냅샷 + 태그 클릭 `stopPropagation`(행 onSelect 미발화), `DiffPanel` 빈/비어있지 않음/patch 색상, `FileComparePanel` 좌우 브랜치 + onBack.
- [ ] AC5 — 신규 `taskStyles` 테스트: `tagStyle` light/dark 분기, `'ffffff'`·undefined → `{}`, 캐시 히트 시 동일 참조, `theme-changed` 이벤트 후 새 참조, `getWorkflowName` 4단 폴백.
- [ ] AC6 — 신규 `ClaudeHookRouter` 테스트: resolver 등록 순서 first-match, 전부 null → 핸들러 미호출·무예외, 미등록 kind → `console.warn` 1회·무예외, 핸들러 예외는 **전파**(HookServer 가 잡는 현행 경로 유지), `dispatch` 가 핸들러 Promise 를 await.
- [ ] AC7 — 신규 `MentionHookHandler` 회귀 테스트(핵심): ① `post_tool_use` 누적 후 `stop` 에서 `— 사용 도구:` 요약 포함, 9건 이상 `외 N건`, 버퍼 비움(연속 stop 2회째엔 도구 라인 없음) ② `last_assistant_message` 3형태(string / `{content:[{type:'text'}]}` / `{message:{...}}`) 파싱 ③ 비어 있고 `transcript_path` 있으면 transcript fallback ④ `transcript_path` basename 에서 `.jsonl` 제거 후 `setClaudeSessionId` 호출 ⑤ `send` → `markIdle` **순서** 보존 ⑥ 응답 없음 → `'응답 완료.'` ⑦ orgId = `sessions.get(channelId)?.organizationId`, 세션 없으면 undefined ⑧ resolve: 빈 cwd/agentRoot 밖/agentRoot 자기 자신 → null, `<agentRoot>/123[/tasks]` → `123`.
- [ ] AC8 — 신규 `claudeDirSetup` 테스트: `writeHookSettings(dir, null)` 은 `.claude` 디렉터리조차 만들지 않음, 정상 시 URL/`X-Clauday-Secret`/matcher 문자열 동일, 동일 내용 재호출 시 재기록 안 함(멱등), `preApproveTrust` 의 no-config/already-trusted/written/failed 4분기 + 실패 시 `console.warn`.
- [ ] AC9 — `src/main/index.ts` 에서 `handleClaudeHook`·`composeStopMessage`·`extractChannelIdFromCwd`·`extractAssistantMessage`·`formatToolDetail`·`turnBuffers` 6개가 **전부 삭제**되고, 그로 인해 죽은 import(`transcriptReader` 2개, `path` 의 relative/sep/basename, `HookEventPayload` 타입) 도 함께 제거됨. 남는 hook 관련 코드는 조립부 ≤ 8줄.
- [ ] AC10 — `vitest run --coverage` 의 70% 라인 게이트 유지(신규 main 모듈 3개가 게이트를 끌어내리지 않음).
- [ ] AC11 — 수동 QA 1회: 실제 두레이 채널에서 `@clauday` 멘션 → 터미널 spawn → 응답 회신 → 채널 메시지에 `[Clauday]` prefix + 도구 요약 라인 확인 → 같은 채널 재멘션 시 `--resume` 로 이어붙는지 확인(= `claudeSessionId` 보존).
- [ ] AC12 — 수동 QA 1회: Git 뷰(변경사항/브랜치 비교/파일 비교 3패널)와 두레이 태스크 뷰(목록·태그 필터 클릭·선택 하이라이트)를 눈으로 비교. 폰트/여백/색상 차이 0.

## 영향 도메인

- **dooray-bot** — hook 라우팅 재편(`ClaudeHookRouter` 신설, 멘션 로직 `MentionHookHandler` 로 이동), `AgentWorkspaceManager` 가 `.claude` 준비를 위임.
- **claude-chat** — `src/main/claude/claudeDirSetup.ts` 신설(claude code 의 `~/.claude.json` trust + 폴더별 `settings.local.json` 준비 책임을 이 도메인으로 귀속).
- **renderer-only** — `Dooray/TaskRow.tsx`, `Dooray/taskStyles.ts`, `Git/DiffPanel.tsx`, `Git/FileComparePanel.tsx` 신설.
- **electron-ipc** — 영향 없음(채널 신설·삭제 0). `index.test.ts` 의 채널 카탈로그 대조 결과가 변하지 않아야 한다는 의미에서만 관련.
- **ai-service** — 영향 없음. `AIService.runClaudeStream` 및 Windows/Mac 분기 코드에 손대지 않는다.

## 리스크 / 제약

- **멘션 파이프라인 회귀가 사용자에게 조용히 보인다** ("봇이 답 안 함"). — 완화: AC7 characterization 테스트 + AC11 실채널 수동 QA. 그리고 `handle()` 안에 `try/finally` 를 넣어 `markIdle` 을 "고치는" 행위 금지(ADR-05) — 현행 실패 모드까지 동일해야 회귀 판정이 가능하다.
- **`getAgentRoot()` 는 부팅 후 늦게 바뀐다.** `index.ts:376` 에서 사용자 커스텀 root 를 `agentWorkspace.setRoot()` 로 적용하는 시점이 라우터 조립보다 **뒤**다. deps 로 값(string)을 넘기면 커스텀 root 사용자에서 멘션이 전부 무시된다. — 완화: 반드시 thunk(`getAgentRoot: () => agentWorkspace.getAgentRoot()`) 로 주입. plan 에 체크박스로 고정하고 테스트에서 "resolve 도중 root 변경이 반영된다"를 검증.
- **테스트가 개발자의 실제 `~/.claude.json` 을 오염시키고 있다** (현행 `AgentWorkspaceManager.test.ts` → `ensureChannel` → `preApproveTrust` 가 홈 설정에 tmp 경로를 계속 추가). 추출 시 configPath 주입 seam 을 만들어 신규 테스트는 절대 홈을 건드리지 않게 한다(ADR-02).
- **다른 트랙과 `index.ts` 동시 편집.** A(≈983-995, ≈1350-1361, ≈1515-1520)·B(≈950-980)와 물리적으로 분리돼 있으나, 파일 상단 import 블록(1-75줄)은 공통 충돌면. — 완화: C-0 은 import 삭제 3줄 + 추가 2줄로 최소화, C-0 을 Phase 1 내에서 우선 머지(후속 트랙의 베이스).
- **"이왕 옮기는 김에" 유혹.** 추출 중 발견되는 결함(형제 경로 오매칭, 미사용 prop `branch`/`repoPath`, 로컬 타입 3중 중복 등)을 고치면 AC3 텍스트 동일성이 깨지고 회귀 원인 분리가 불가능해진다. — 완화: ADR-05 가 "발견은 impl-log 에 기록, 수정은 금지" 를 명문화.
- **memo comparator 이동 누락.** `TaskRow` 의 커스텀 비교 함수(6필드)가 빠지면 렌더 결과는 같아 보이지만 대량 목록에서 성능만 조용히 나빠진다. — 완화: comparator 를 named export 로 승격해 6필드 전부 단위 테스트.

## 참조

- 마스터 설계 `~/.claude/plans/toasty-sleeping-simon.md` — §Workstream C-0 / C-1 / C-2 / C-3 / C-3.5, §작업 순서 Phase 1
- 본 디렉터리 `adr.md` (ADR-v2-workspace-p0-01 ~ 05), `plan.md`
- `.agent/wiki/domain-dooray-bot.md` — 멘션 파이프라인 전체 흐름 / Stop hook 응답 회수 / HookServer secret
- `.agent/wiki/architecture.md` §5 IPC 흐름, §8 사용자 가시/내부 리팩터 구분
- 원본 위치: `src/main/index.ts:183-298`(hook 클로저), `src/main/index.ts:378-381`(조립부), `src/main/dooray/mention/AgentWorkspaceManager.ts:84-143`, `src/renderer/src/components/Dooray/ProjectTaskView.tsx:11-157`, `src/renderer/src/components/Git/BranchWorkspace.tsx:805-923`
