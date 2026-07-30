---
task: v2-workspace-p0
agent: renderer-engineer
date: 2026-07-30
---

## [renderer-engineer] extract

renderer 파트(R1~R2) — `TaskRow`/`taskStyles`/`DiffPanel`/`FileComparePanel` 무동작변경 추출. 브랜치 `feat/version-2.0`, 별도 브랜치 생성 없음. main 파트(claudeDirSetup/ClaudeHookRouter/MentionHookHandler)는 이번 라운드 대상 아님 — `src/main/**` 무접촉.

### 변경한 파일

**신규**
- `src/renderer/src/components/Dooray/taskStyles.ts` — `ProjectTaskView.tsx:11-76` 텍스트 그대로 추출. `WORKFLOW_ICONS`/`WORKFLOW_COLORS`/`WORKFLOW_BG_COLORS`/`getWorkflowName`/`tagStyle` export, `TAG_STYLE_CACHE`/`currentTheme`/`hexToHsl`·`theme-changed` 리스너는 비export 유지.
- `src/renderer/src/components/Dooray/TaskRow.tsx` — `ProjectTaskView.tsx:78-157` 텍스트 그대로 추출. memo comparator 를 `taskRowPropsAreEqual` named export 로 승격. default + named export 동시 제공.
- `src/renderer/src/components/Git/DiffPanel.tsx` — `BranchWorkspace.tsx:805-891` 텍스트 그대로 추출. prop 타입은 ADR-v2-workspace-p0-04 에 따라 `shared/types/git` 의 `GitDiffResult` 사용, `branch`/`repoPath` 는 인터페이스에만 유지(구조분해 안 함).
- `src/renderer/src/components/Git/FileComparePanel.tsx` — `BranchWorkspace.tsx:893-923` 텍스트 그대로 추출. prop 타입 `GitFileCompare`.
- `src/renderer/src/components/Dooray/taskStyles.test.ts` (10 tests, AC5) — 4단 폴백, tagStyle 빈값/캐시 히트/테마별 분기/`theme-changed` 무효화, `WORKFLOW_BG_COLORS` 키 5종.
- `src/renderer/src/components/Dooray/TaskRow.test.tsx` (14 tests, AC4) — 스냅샷 3종, 행 클릭/태그 클릭 stopPropagation, `workflowClass` 기본값, `taskRowPropsAreEqual` 6필드 단위 테스트.
- `src/renderer/src/components/Dooray/ProjectTaskView.test.tsx` (선택 스모크, 1 test) — 추출 후 조립 회귀 탐지용.
- `src/renderer/src/components/Git/DiffPanel.test.tsx` (6 tests, AC4) — 빈 상태/파일 목록/비교 버튼/patch 라인 색상 분기/스냅샷.
- `src/renderer/src/components/Git/FileComparePanel.test.tsx` (3 tests, AC4) — 좌우 브랜치 렌더/`onBack`/스냅샷.

**수정**
- `src/renderer/src/components/Dooray/ProjectTaskView.tsx` — 11-157 삭제 후 `TaskRow`/`taskStyles` import 로 교체. 죽은 import 제거: react `memo`, lucide `CheckCircle2`·`Circle`·`Clock`·`AlertCircle`(`ChevronRight` 는 필터 드롭다운에서 계속 사용 → 유지). 나머지 본문 무수정(581→약 430줄).
- `src/renderer/src/components/Git/BranchWorkspace.tsx` — 805-923 삭제 후 `DiffPanel`/`FileComparePanel` import 로 교체. 죽은 import 제거: lucide `Eye`(유일 사용처가 DiffPanel 내부였음). `CheckCircle2` 는 :384 clean 배지에서 계속 사용 → 유지. 로컬 `FileDiff`/`DiffResult`/`CompareResult` 인터페이스는 ADR-04 대로 삭제하지 않음(`ChangedFilesList`·state 가 계속 참조). 호출부 3곳(`<DiffPanel>` ×2, `<FileComparePanel>`) 무수정.

### 무동작변경 검증

- baseline 추출: `git show HEAD:...` (HEAD=`0a37775`) 로 4블록(`taskstyles.before` 66줄, `taskrow.before` 80줄, `diffpanel.before` 87줄, `filecompare.before` 31줄) 스크래치패드에 확보 후 신규 파일과 `diff -u` 비교.
- `taskStyles.ts` / `TaskRow.tsx` — 차이는 전부 허용 변형(1) `export` 키워드 추가, (2) import 문 신설(`React.CSSProperties` 표기는 그대로 유지해 diff 0), (3) memo comparator → `taskRowPropsAreEqual` named function 승격(조건식 6줄 원본 그대로, 위치만 함수 상단으로 이동). 그 외 차이 0.
- `DiffPanel.tsx` / `FileComparePanel.tsx` — 함수 본문(JSX·로직·문자열·분기 순서)은 baseline 과 완전히 동일. 차이는 (1) import 신설, (2) ADR-v2-workspace-p0-04 가 명시적으로 규정한 시그니처 변경(`DiffResult`/`CompareResult` 로컬 타입 → `GitDiffResult`/`GitFileCompare` shared 타입, `DiffPanel` 파라미터를 인라인 구조분해에서 `DiffPanelProps` 인터페이스 참조로 변경하되 실제 구조분해는 `{ result, onFileCompare }` 만) 뿐. 이 변경은 일반 "허용 변형 4종" 목록에는 없지만 ADR-04 본문이 코드 스니펫으로 직접 지정한 이 트랙 고유의 결정이라 별도 항목으로 기록한다(아래 "결정 사항" 참조). 함수 본문 텍스트는 diff 로 재확인해도 0.
- `npm run typecheck` (node + web) — 통과, 0 에러.
- `npm run test:run` (전체) — 120 files / 1722 tests 전부 통과, 0 실패. 착수 전 베이스라인은 113 files / 1654 tests(전부 통과)였음. 증가분(7 files / 68 tests)에는 이 트랙의 신규 5개 테스트 파일(34 tests)과, 같은 저장소에서 **병렬 진행 중인 다른 트랙**(`v2-terminal-p1` 등, `src/main/terminal/sessionOrder.ts` 등)이 커밋하지 않고 작업 중인 변경이 섞여 있음 — `git status`로 확인, 본 트랙 범위 밖이라 상세 검증 생략. 본 트랙이 만든 파일만 좁혀 실행한 결과는 5 files / 34 tests 전부 통과(별도 확인 완료).
- `git diff --stat` — `src/renderer/src/components/Dooray/ProjectTaskView.tsx`, `src/renderer/src/components/Git/BranchWorkspace.tsx` 2개 파일만 수정. `src/shared/**`, `src/preload/**`, `src/main/**` 변경 0(본 트랙 기준 — 위에서 언급한 병렬 트랙의 무관 변경은 별개).

### 발견했으나 고치지 않은 것

- `src/renderer/src/components/Dooray/ProjectTaskView.tsx:4` — lucide `ChevronLeft` import 가 파일 전체에서 미사용(추출 이전 원본에도 이미 존재하던 dead import, `git show HEAD:.../ProjectTaskView.tsx`에서도 동일하게 미사용 확인). 재현: `grep -n "ChevronLeft" ProjectTaskView.tsx` → import 선언 1건 외 사용처 0. 제안 수정: import 목록에서 `ChevronLeft` 제거. 이번 추출 대상(11-157행) 밖이고 plan.md 의 명시적 죽은 import 제거 목록에도 없어 손대지 않음(ADR-05). 넘길 트랙: C-3(`ProjectTaskView` 추가 분해 시 같이 정리).

### 결정 사항 (해야 할 것)

- `DiffPanel`/`FileComparePanel` 의 prop 타입은 ADR-v2-workspace-p0-04 코드 스니펫을 그대로 구현했다 — `DiffPanelProps` 를 별도 export 인터페이스로 승격하고 `result`/`onFileCompare` 만 구조분해, `branch`/`repoPath` 는 인터페이스에만 남기고 "표시 라벨용 — 현재 렌더에는 미사용(호출처 계약 유지, ADR-v2-workspace-p0-04)" 주석을 각각 남겼다(ADR 원문의 두 번째 주석 "동상"은 "상동" 오타로 판단해 전체 문구를 명시적으로 다시 씀 — 이 인터페이스는 baseline 추출 대상이 아닌 신규 코드라 텍스트 동일성 제약과 무관).
- `TaskRow` 의 memo comparator(`taskRowPropsAreEqual`)는 `TaskRow` 함수 선언보다 **앞에** 배치했다(원본은 `memo(...)` 두 번째 인자로 뒤에 인라인). 함수 선언 호이스팅으로 동작에는 영향 없음 — 가독성을 위한 선택.
- `ProjectTaskView` 스모크 렌더 테스트(선택 항목)를 추가해 import 재배선 이후에도 태스크 목록이 정상 조립되는지 확인했다.

### 제약 (하지 말 것)

- `ChevronLeft` dead import 등 이번에 발견한 기존 결함은 수정하지 않았다(ADR-05, 무동작변경 원칙).
- `BranchWorkspace`/`ProjectTaskView` 본체의 추가 분해는 하지 않았다(비목표, plan.md 명시).
- `src/main/**`, `src/preload/**`, `src/shared/**` 는 읽기만 했고 수정하지 않았다.
- `BranchWorkspace.tsx` 의 로컬 `FileDiff`/`DiffResult`/`CompareResult` 인터페이스는 shared 타입과 중복이지만 삭제하지 않았다(ADR-04, C-3 이월).

### 참조

- ADR-v2-workspace-p0-03(TaskRow/taskStyles 분리), ADR-v2-workspace-p0-04(Git 패널 prop 타입 계약), ADR-v2-workspace-p0-05(무동작변경 정의)
- 원본 위치(HEAD `0a37775`): `ProjectTaskView.tsx:11-76`(taskStyles), `:78-157`(TaskRow), `BranchWorkspace.tsx:805-891`(DiffPanel), `:893-923`(FileComparePanel)
- plan.md `[renderer] R1`/`R2` 체크박스 전부 `[x]` 처리

## [main-process-engineer] hook-router

main 파트(M1~M4) — `claudeDirSetup` 추출(ADR-02), `ClaudeHookRouter` 신설(ADR-01), 멘션 로직을 `MentionHookHandler` 로 이사(ADR-01), `index.ts` hook 조립부 재배선. 브랜치 `feat/version-2.0`, 별도 브랜치 생성 없음. renderer 파트는 이번 라운드 대상 아님 — `src/renderer/**` 무접촉.

착수 시점 HEAD는 `23c043f`(renderer 파트 병합 이후 문서 커밋). 대상 6블록 중 main 몫인 `mentionhook.before`(`index.ts:183-298`)와 `claudedirsetup.before`(`AgentWorkspaceManager.ts:84-143`)는 두 커밋 사이에 변경 이력이 없어(`git log --oneline -- <파일>` 확인, 각각 최종 수정 `ab7cff5`) HEAD 그대로 baseline 으로 사용. 병행 중인 터미널 트랙(`v2-terminal-p1`)이 `index.ts` 에 `TERMINAL_REORDER` 3줄을 라인 958 부근(hook 블록과 무관한 하류 위치)에 추가해뒀으나, hook 블록(183-298)·조립부(≈182)·`setHandler`(:380 부근) 라인 번호는 baseline 과 완전히 동일했다(브리핑의 "±3 이동" 우려와 달리 실측은 영향 없음 — grep 으로 재확인 후 진행).

### 변경한 파일

**신규**
- `src/main/claude/claudeDirSetup.ts` — `AgentWorkspaceManager.ts:84-143` 의 `writeHookSettings`/`preApproveTrust` private 메서드를 모듈 함수로 추출(ADR-02). 상수 3개(`CLAUDE_LOCAL_SETTINGS_DIR`/`_FILE`, `CLAUDE_USER_CONFIG` export) 동반 이동. 반환값 도입: `writeHookSettings` → `boolean`(기록 여부), `preApproveTrust` → `TrustResult`(`'written'|'already-trusted'|'no-config'|'failed'`). tmp→rename atomic write 그대로(A-0 `atomicWrite` 유틸 미사용 — 트랙 충돌 회피, plan 명시).
- `src/main/claude/claudeDirSetup.test.ts` (9 tests, AC8) — `writeHookSettings(dir, null)` 의 `.claude` 미생성, matcher/URL/헤더 값, 멱등, port/secret 변경 시 재기록, `preApproveTrust` 4분기(no-config/already-trusted/written/failed) + `console.warn` spy. 전 케이스 `mkdtempSync` tmp 경로만 사용.
- `src/main/hooks/ClaudeHookRouter.ts` — cwd resolver first-match + kind 핸들러 라우터(ADR-01). `addResolver`/`setHandler`/`dispatch`. resolver 전부 null → 무로그 no-op, 미등록 kind → `console.warn`, 핸들러 예외는 전파(미포착), resolver 예외는 warn 후 다음 resolver 로 계속.
- `src/main/hooks/ClaudeHookRouter.test.ts` (7 tests, AC6) — first-match 우선순위, 전부 null, 미등록 kind, 핸들러 reject 전파, Promise await, resolver throw 후 계속, `setHandler` 재호출 덮어쓰기.
- `src/main/dooray/mention/MentionHookHandler.ts` — `index.ts:183-298` 의 `turnBuffers`/`handleClaudeHook`/`composeStopMessage`/`extractChannelIdFromCwd`/`extractAssistantMessage`/`formatToolDetail` 을 클래스로 이사(ADR-01). `turnBuffers` 는 인스턴스 필드, `extractChannelIdFromCwd` 로직은 `resolve(cwd): HookRoute | null` 로 흡수(결과를 `{kind: MENTION_HOOK_KIND, id}` 로 래핑), `handleClaudeHook` 본문은 `handle(ev, route)` 로 이동하며 channelId 추출부만 `route.id` 참조로 치환. `composeStopMessage`/`extractAssistantMessage`/`formatToolDetail` 은 본문 100% 동일한 named export 순수 함수. 의존은 생성자 주입(`getAgentRoot` thunk, `sessions`/`responder` Pick 타입, `readTranscript` 기본값 `readLastAssistantText`). `markIdle` 은 `try/finally` 로 감싸지 않아 `send` 실패 시 스킵되는 현행 동작 보존(ADR-05).
- `src/main/dooray/mention/MentionHookHandler.test.ts` (25 tests, AC7 — 이 트랙의 핵심 회귀 안전망) — resolve 7종(빈 cwd/밖/자기자신/하위/tasks 하위/thunk 반영/형제경로 버그 고정), handle 도구 누적·9건 초과·버퍼 비움, `last_assistant_message` 3형태, transcript fallback, 응답 없음 폴백, `setClaudeSessionId`, orgId 유무 2종, send→markIdle 호출 순서(`invocationCallOrder`), send reject 시 markIdle 미호출 + reject 전파, 알 수 없는 event 무시. 순수 함수 3종 보조 테스트 4건 추가.

**수정**
- `src/main/dooray/mention/AgentWorkspaceManager.ts` — private `writeHookSettings`/`preApproveTrust` 삭제, 상수 3개 제거, `ensureChannel` 이 `this.deps.preApproveTrust(channelDir)` → `this.deps.writeHookSettings(channelDir, this.hookConfig)` 순서로 위임(순서 보존, 반환값은 무시 — ADR-02 명시). 선택적 deps seam 추가: `constructor(root = DEFAULT_ROOT, private deps: ClaudeDirSetupDeps = { preApproveTrust, writeHookSettings })` — 기존 호출부 `new AgentWorkspaceManager()` 무수정. 죽은 import 정리: `fs` 에서 `readFileSync`/`renameSync` 제거(`mkdirSync`/`writeFileSync`/`existsSync` 만 남김).
- `src/main/dooray/mention/AgentWorkspaceManager.test.ts` — **테스트만 수정** deps seam 으로 `preApproveTrust` 를 항상 스텁(`vi.fn((): TrustResult => 'no-config')`) 주입해 개발자의 실제 `~/.claude.json` 오염을 제거(ADR-02). `writeHookSettings` 는 홈을 건드리지 않아 실물 그대로 주입, 기존 파일 내용/멱등 단언 유지. `ensureChannel`/`writeTaskPrompt`/`setHookConfig` 를 호출하는 모든 테스트 케이스에 `testDeps` 를 2번째 인자로 전달(9곳). `getAgentRoot`/`setRoot` 만 쓰는 3개 케이스는 `ensureChannel` 을 호출하지 않아 무수정. 실행 전후 `~/.claude.json` checksum 이 동일함을 별도로 확인(오염 제거 검증).
- `src/main/index.ts` — import 블록: `HookServer` 는 유지하되 `type HookEventPayload` 를 드롭, `readLastAssistantText`/`truncateForMessenger`/`relative,sep,basename` import 2줄 전체 삭제(MentionHookHandler 가 내부적으로 소유), `ClaudeHookRouter`/`{MentionHookHandler, MENTION_HOOK_KIND}` import 2줄 추가. hook 블록(구 183-298, 116줄)을 삭제하고 그 자리에 8줄 조립부 신설: `hookRouter`/`mentionHookHandler` 생성 후 `hookRouter.addResolver((cwd) => mentionHookHandler.resolve(cwd))` + `hookRouter.setHandler(MENTION_HOOK_KIND, (ev, route) => mentionHookHandler.handle(ev, route))`. `getAgentRoot` 는 값이 아닌 `() => agentWorkspace.getAgentRoot()` thunk로 주입(부팅 후 `:270` 부근의 `setRoot(customWorkspaceRoot)` 가 조립보다 늦게 실행되므로 필수). `hookServer.setHandler((ev) => handleClaudeHook(ev))` → `hookServer.setHandler((ev) => hookRouter.dispatch(ev))` 1줄 교체. `grep -n "handleClaudeHook\|turnBuffers\|extractChannelIdFromCwd\|composeStopMessage\|extractAssistantMessage\|formatToolDetail" src/main/index.ts` → 0건(AC9). 이 diff 는 병행 중인 터미널 트랙이 앞서 넣어둔 `TERMINAL_REORDER` IPC 3줄(라인 958 부근, hook 조립과 무관)과는 물리적으로 분리되어 있음 — `git diff` 로 재확인.

### 무동작변경 검증

- baseline 추출: `git show HEAD:src/main/index.ts | sed -n '183,298p'` (116줄) → `mentionhook.before`, `git show HEAD:src/main/dooray/mention/AgentWorkspaceManager.ts | sed -n '84,143p'` (60줄) → `claudedirsetup.before`. HEAD=`23c043f`.
- `claudeDirSetup.ts` — `diff` 결과: (1) `export` 키워드 추가(허용 변형 1) (2) `this.hookConfig` → `hookConfig` 인자, 반환값 추가(허용 변형 4, ADR-02 명시) (3) **허용 목록에 없는 추가 변형 1건**: `writeHookSettings` 의 첫 인자를 ADR-02 가 지정한 대로 `dir: string` 으로 명명했더니, 원본 본문의 `.claude` 하위 경로를 가리키던 지역변수 `const dir = join(channelDir, CLAUDE_LOCAL_SETTINGS_DIR)` 와 이름이 충돌(동일 스코프 재선언 컴파일 에러)해 그 지역변수만 `hookSettingsDir` 로 개명했다. 본문 로직·문자열·분기 순서는 100% 동일 — 아래 "결정 사항"에 사유 기록.
- `MentionHookHandler.ts` — `composeStopMessage`/`extractAssistantMessage`/`formatToolDetail` 3개는 baseline 과 `diff` 로 재확인해도 `export` 키워드 추가 + `pathBasename` → `basename` import 재명명(허용 변형 1·2) 외 차이 0. `resolve`/`handle`(구 `extractChannelIdFromCwd`+`handleClaudeHook`)은 ADR-01 이 설계 단계에서부터 "모듈 함수 → 클래스 메서드 + route 래핑" 전환을 명시한 구조 변경이라 baseline 과 완전한 텍스트 동일성 대상이 아니다(ADR-02 의 "private 메서드 → 모듈 함수" 케이스와 같은 성격의 필수 시그니처 변경). 내부 로직·주석·분기 순서·문자열은 전부 원본 그대로 옮겼음을 라인 단위로 재확인.
- `npm run typecheck` (node + web) — 통과, 0 에러.
- `npm run test:run` — 127 files / 1878 tests 전부 통과. 이 중 이번 라운드 신규분은 `claudeDirSetup.test.ts`(9) + `ClaudeHookRouter.test.ts`(7) + `MentionHookHandler.test.ts`(25) = 41 tests. `src/main/index.test.ts` 는 무수정으로 8 tests 통과(채널 카탈로그 대조 불변) — 단, 병행 중인 터미널 트랙이 이미 추가해둔 `TERMINAL_REORDER` 케이스 1건이 포함되어 있음(본 트랙과 무관, 손대지 않음).
- `npm run test:coverage` — 전체 79.81% lines / 81.96% branches / 90.45% functions(게이트 70%/70%/80% 전부 상회, AC10). 신규 모듈: `claudeDirSetup.ts` 100% lines, `ClaudeHookRouter.ts` 100% lines, `MentionHookHandler.ts` 94.94% lines(미커버 라인은 `readTranscript` 기본값 분기 등 방어적 코드).
- `git diff --stat` — main 파트가 만든 변경은 신규 5 + 수정 3 = 8개 파일. `src/shared/**`/`src/preload/**` 에는 손대지 않음(diff 0). 단, 같은 브랜치에서 병행 중인 다른 트랙(v2-terminal-p1 등)의 무관 변경이 `src/preload/index.ts`/`src/shared/types/ipc.ts`/`src/shared/types/terminal.ts` 등에 이미 있어 전체 `git diff --stat` 출력에는 섞여 보인다 — 확인 결과 전부 `TERMINAL_REORDER`/터미널 관련이며 본 트랙 파일 목록 밖.
- `~/.claude.json` 오염 제거 검증: `AgentWorkspaceManager.test.ts` 실행 전후 파일 checksum(`shasum`) 동일 확인(ADR-02 목표 달성).

### 발견했으나 고치지 않은 것

- `src/main/dooray/mention/MentionHookHandler.ts` (구 `index.ts:244-251` `extractChannelIdFromCwd`, 현 `resolve()`) — `cwd.startsWith(agentRoot)` 만으로 소속을 판정해 형제 경로(`<agentRoot>-sibling`)에서 `path.relative` 결과가 `'..'` 로 나와 channelId 가 `'..'` 이 된다. PRD/ADR-05 가 이미 식별한 기존 결함으로, `MentionHookHandler.test.ts` 의 "형제 경로(prefix 매칭 오류)" 케이스로 현행 동작을 고정하고 `// 현행 동작 고정 (ADR-v2-workspace-p0-05) — 개선은 후속` 주석을 남겼다. 넘길 트랙: C-2(`resolver` 2개 등록 시 우선순위/경계 재검토와 함께 처리 권장).
- `src/main/dooray/mention/MentionHookHandler.ts` `handle()` — `claudayResponder.send()` 가 reject 하면 `markIdle` 호출이 스킵되어 채널이 `busy` 상태로 남는다(기존 `index.ts` 의 동일 동작). `try/finally` 로 감싸 "고치는" 행위는 plan/ADR-05 가 명시적으로 금지 — `send reject 시 markIdle 미호출 + handle 이 reject` 테스트로 현행 동작만 고정. 넘길 트랙: 후속 이슈로 별도 처리(멘션 파이프라인 안정화 트랙).
- `src/main/dooray/mention/AgentWorkspaceManager.test.ts:2` — `mkdirSync` import 가 이번 수정 이전부터 파일 어디에도 사용되지 않는 죽은 import 였다(재현: `grep -n mkdirSync AgentWorkspaceManager.test.ts` → import 선언 1건 외 사용처 0). 이번 트랙의 수정 범위(deps seam 주입)와 무관하고 plan 이 지정한 정리 대상도 아니라 손대지 않음(ADR-05). 넘길 트랙: 다음에 이 테스트 파일을 여는 트랙에서 정리.

### 결정 사항 (해야 할 것)

- `claudeDirSetup.writeHookSettings` 의 첫 매개변수명을 ADR-02 코드 스니펫 그대로 `dir` 로 채택했다. 원본 private 메서드 본문에는 `.claude` 서브폴더 경로를 담는 지역변수도 `dir` 이었는데(`const dir = join(channelDir, CLAUDE_LOCAL_SETTINGS_DIR)`), 매개변수와 이름이 같아지며 동일 스코프 재선언이 되어 TypeScript 컴파일 에러가 났다. 지역변수만 `hookSettingsDir` 로 개명해 해소했다 — ADR/plan 이 지정한 "허용 변형 4종"에 명시적으로는 없지만, ADR-02 가 못박은 매개변수명을 그대로 지키기 위해 불가피하게 파생된 변경이라 판단해 그대로 두었다(본문 로직·분기·문자열은 완전 동일). ADR 수정은 하지 않음 — 이 impl-log 기록으로 갈음.
- `MentionHookHandler` 는 ADR-01 설계대로 클래스로 구현했고, `resolve`/`handle` 은 원본 함수 로직을 그대로 옮기되 시그니처만 라우터 계약(`HookRoute` 반환/`route` 인자)에 맞춰 바꿨다. `composeStopMessage`/`extractAssistantMessage`/`formatToolDetail` 3개는 클래스 밖 named export 순수 함수로 유지해(ADR-01 명시) 향후 C-2 가 `MentionHookHandler` 인스턴스 없이도 재사용할 수 있게 했다.
- `AgentWorkspaceManager` 의 `ensureChannel` 은 `this.deps.preApproveTrust`/`this.deps.writeHookSettings` 반환값을 그대로 무시한다 — ADR-02 가 "호출부는 무시하므로 동작 변화 0" 이라고 명시한 전제를 그대로 따랐다. C-2 의 `WorkspaceService.startTask` 가 이 반환값을 로그에 활용할 수 있다.
- `index.ts` 조립부는 plan 이 제시한 순서(라우터 생성 → 핸들러 생성 → resolver 등록 → kind 핸들러 등록)를 그대로 유지했고, `getAgentRoot` 는 값이 아닌 thunk 로 주입했다(부팅 후 `setRoot` 반영 보장).

### 제약 (하지 말 것)

- `MentionHookHandler.handle()` 의 `markIdle` 호출을 `try/finally` 로 감싸지 않았다 — `send` 실패 시 markIdle 이 스킵되는 현행 동작을 보존해야 한다(ADR-05). 후속 트랙도 이 지점을 "버그 수정" 대상으로 건드리지 말 것 — 고치려면 별도 이슈/트랙에서 테스트와 함께.
- `getAgentRoot` 를 `index.ts` 조립부에서 값(string)으로 주입하지 않았다 — 반드시 `() => agentWorkspace.getAgentRoot()` thunk 유지. 값으로 바꾸면 커스텀 workspace root 사용자에서 멘션이 전부 무시된다(PRD 리스크 항목).
- A-0 트랙의 `atomicWrite` 유틸을 `claudeDirSetup.ts` 에 도입하지 않았다 — tmp→rename 패턴을 원본 그대로 두었다(트랙 충돌 회피, plan 명시). A-0 완료 후 그쪽에서 흡수할 것.
- `AgentWorkspaceManager` 의 로컬 결함(형제 경로 오매칭, send-reject 시 markIdle 스킵)을 수정하지 않았다 — 위 "발견했으나 고치지 않은 것" 참고, 손대려면 별도 트랙.
- `src/renderer/**`, `src/shared/**`, `src/preload/**` 는 손대지 않았다(main 파트 스코프 100% 준수).

### 참조

- ADR-v2-workspace-p0-01(ClaudeHookRouter/MentionHookHandler), ADR-v2-workspace-p0-02(claudeDirSetup 추출 + deps seam), ADR-v2-workspace-p0-05(무동작변경 정의)
- 원본 위치(HEAD `23c043f`, `AgentWorkspaceManager.ts` 최종 수정 `ab7cff5`): `index.ts:183-298`(hook 클로저), `index.ts:378-381`(조립부 원위치), `AgentWorkspaceManager.ts:84-143`(private 메서드)
- plan.md `[main] M1`~`M4` 및 `[공통] V` 체크박스 전부 `[x]` 처리(수동 QA AC11/AC12 는 실행 환경 필요 — integrator/사용자 수행 필요로 남김)
