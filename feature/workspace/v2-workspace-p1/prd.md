---
task: v2-workspace-p1
domain: workspace, electron-ipc, dooray-bot, terminal
created: 2026-07-30
status: draft
target_version: 2.0.0
---

# PRD — v2.0 Workstream C-1 + C-2: 워크스페이스 도메인 모델 + 단일 run E2E

> 마스터 설계: `~/.claude/plans/toasty-sleeping-simon.md` §Workstream C-1 / C-2 (Phase 2, fan-out 제거 반영본).
> 선행: `feature/workspace/v2-workspace-p0/` (C-0 — `ClaudeHookRouter` / `claudeDirSetup` / `MentionHookHandler` 이미 머지됨).
> 동작 사양의 근거: `docs/mockups/v2/workspace-view.html`, `docs/mockups/v2/start-work-modal.html` (사용자 확정 목업).
> 본 트랙은 **main 중심**. 뷰(C-3)는 다음 Phase 이지만 **IPC/preload 표면은 이번에 완성**한다.

## 배경 / 문제

Clauday 의 차별점은 "두레이 태스크에서 곧장 격리된 작업 환경으로 진입한다"다. 그런데 현재는 그 사이가 전부 수동이다.

- `GitService.createWorktree({ newBranch, baseBranch })` 는 **API 가 이미 완비**돼 있는데 이를 부르는 UI 가 `BranchWorkspace`(수동 브랜치 선택) 하나뿐이고, 두레이 태스크와는 아무 연결이 없다.
- 태스크 ↔ 브랜치 ↔ 워크트리 ↔ claude 세션의 대응 관계를 **어디에도 저장하지 않는다.** 앱을 껐다 켜면 "이 워크트리가 어느 태스크였는지"가 사라진다.
- claude code 를 자동 기동하는 검증된 시퀀스는 `MentionTerminalSpawner` 안에 **두레이 채널 개념과 결합**된 채로 있다 (channelId / ChannelSessionStore / 두레이 채널 회신). 워크트리에서 같은 시퀀스를 쓰려면 채널이 필요 없는 형태가 있어야 한다.
- C-0 이 `ClaudeHookRouter` 를 만들어 "소유자를 cwd 로 판정해 hook 을 배타적으로 라우팅"하는 자리를 뚫어놨지만, 아직 **소유자가 멘션 하나**다. 워크트리에서 도는 claude 의 Stop hook 은 지금 아무도 받지 않는다 = 진행 상태를 알 방법이 없다.

그래서 이번 트랙은 **모델 + 단일 run E2E** 를 세운다. "태스크 하나 → 브랜치·워크트리 하나 → claude 세션 하나"가 시작되고, 상태가 남고, 앱을 재시작해도 이어붙고, 정리까지 되는 한 바퀴. 화면은 없어도 IPC 로 전 과정이 호출 가능해야 하며, 그래야 C-3 이 뷰만 얹으면 된다.

> **fan-out 은 스코프에서 제거됐다** (2026-07-30 사용자 결정). 동시성은 "여러 태스크(워크스페이스) 병렬"로만 존재하고, **활성 run 은 워크스페이스당 1개**다. `runs[]` 는 재시도/resume 이력이다. 타입에 `fanOut`/`judge` 계열 필드를 남기지 않는다 — 남기면 C-3 이 그 필드를 보고 UI 를 만든다.

## 목표 (Goals)

1. **도메인 모델 확정 (C-1)** — `src/shared/types/workspace.ts` 에 `RepoRegistryEntry` / `TaskWorkspace` / `AgentRun` / `StartTaskParams` 를 정의하고, 상태 전이는 `runStateMachine.ts` 순수 함수, 브랜치 이름은 `branchName.ts` 순수 함수로 분리한다. 세 파일 모두 renderer 가 직접 import 가능(브랜치명 미리보기·상태 배지에 IPC 불필요).
2. **영속화 (C-1)** — `WorkspaceStore`(electron-store `clauday-workspaces`, storage 생성자 주입). 기존 `settings.gitRepoPath` 를 첫 저장소로 **자동 승격**하는 마이그레이션 포함. C-3.5 가 쓸 `taskSessionLinks` 스키마도 이번에 확정(동작 구현은 이번 스코프 아님).
3. **단일 run E2E (C-2)** — `workspace:start-task` 한 번으로 `repo 결정 → 멱등 체크 → 태스크 상세 조회 → 브랜치명 생성 → 워크트리 생성 → .claude 준비 + info/exclude → 프롬프트 파일 → 터미널 spawn → (옵션) 두레이 상태 전환/댓글` 까지 끝난다.
4. **진행 상태 회수 (C-2)** — 워크트리에서 도는 claude 의 hook 을 `ClaudeHookRouter` 의 **resolver 2번**으로 받아 `Stop → awaiting-input(+claudeSessionId)`, `PostToolUse → running 복귀` 로 반영한다. **멘션 resolver 의 우선순위와 동작은 100% 보존**한다.
5. **생애주기 완결 (C-2)** — `resumeRun`(`claude --resume`) / `adoptRun` / `cleanupRun`(dirty 가드 + adopted 브랜치 삭제 가드) / `reconcile()`(부팅 시 휘발 상태 정리 + 외부 삭제 워크트리 감지).
6. **IPC 표면 완성** — `workspace:*` 채널 세트 + `dooray:project:workflows` + `git:delete-branch` 를 3+1 규칙대로 등록하고 preload 에 노출. renderer 컴포넌트는 이번에 만들지 않는다.

## 비목표 (Non-goals)

- **renderer 뷰 일체** — `WorkspaceView` / `StartWorkModal` / `WorkspaceSettings` / Sidebar 진입점은 C-3. 이번엔 `src/renderer/src/components/**` 를 만들지도 고치지도 않는다. (예외: `test/helpers/mockWindowApi.ts` 는 preload 표면이 늘었으므로 갱신 필요)
- **터미널 태스크 드로어 / 드래그&드롭 (C-3.5)** — `taskSessionLinks` **스키마만** 넣고 읽기/쓰기 서비스와 IPC 는 만들지 않는다.
- **fan-out / Run 비교 / AI 판정** — 백로그. 타입·스토어·IPC 어디에도 흔적을 남기지 않는다.
- **서브모듈 동시 브랜치 전환** — 마스터 §C-4 미결 항목. 워크스페이스 1개 = 저장소 1개가 이번 설계.
- **`push -u origin HEAD`** — 마스터 P2. `adoptRun` 은 상태만 바꾸고 git push 는 하지 않는다.
- **`MentionTerminalSpawner` 를 `AgentRunSpawner` 위로 재배선** — 멘션 파이프라인은 자동 E2E 가 없다. 이번엔 손대지 않는다(ADR-04).
- **`BranchWorkspace` / Git 뷰의 기존 동작 변경** — `settings.gitRepoPath` 는 계속 유효하고 Git 뷰는 그대로 돈다(레지스트리로 **승격**할 뿐 이관이 아니다).
- **ClaudeManual / CHANGELOG** — 사용자 가시 기능은 C-3 에서 완성된다. 문서는 Phase 4 일괄.

## 수락 기준 (Acceptance Criteria)

- [ ] **AC1** — `npm run typecheck`(node+web) · `npm run test:run` 전체 통과. 기존 테스트 수정은 `src/main/index.test.ts`(채널 카탈로그 추가분) · `test/helpers/mockWindowApi.ts` · `src/main/git/GitService.test.ts`(fs mock 확장) 3개로 한정.
- [ ] **AC2** — `src/shared/types/workspace.ts` 는 **타입 선언 전용**(런타임 export 0, `import type` 으로만 소비 가능). `fanOut`·`judge`·`runCount` 류 필드 0건. `TaskWorkspace.activeRunId` 로 활성 run 이 **최대 1개**임이 타입/불변식 수준에서 표현된다.
- [ ] **AC3** — `runStateMachine.test.ts` 가 `(status × event)` **전 조합**을 표로 검증한다(허용 전이 + 무시 전이 각각). `spawning→running→awaiting-input→running(PostToolUse 복귀)→adopted` 시나리오 1건과 terminal 상태(`adopted`/`discarded`) 흡수 1건 포함.
- [ ] **AC4** — `branchName.test.ts`: ① 토큰 치환 4종(`{projectCode}`/`{taskNumber}`/`{taskId6}`/`{subject}`) ② `taskNumber` 부재 시 `taskId6` fallback ③ 충돌 시 `-2`, `-2`도 있으면 `-3` (off-by-one 고정) ④ 한글/공백/특수문자 subject → sanitize 후에도 빈 세그먼트가 남지 않음 ⑤ **계약 테스트**: 생성된 이름 20종 이상이 전부 `GitService` 의 ref 검증(`isSafeGitRef`)을 통과.
- [ ] **AC5** — `WorkspaceStore` 는 storage 를 **생성자 주입**받고, 테스트는 `new Store()` 를 만들지 않는다(디스크 무접촉). 마이그레이션: `gitRepoPath` 가 있고 레지스트리가 비어 있으면 첫 repo 로 승격, **2회 실행해도 항목이 늘지 않음**(멱등), 이미 같은 path 가 등록돼 있으면 no-op. `taskSessionLinks` 필드가 스키마에 존재하고 기본값이 `{}`.
- [ ] **AC6** — `AgentRunSpawner.test.ts`(fake timer): ① 기본 — `create(cwd) → boot 대기 → 'claude\r' → ready 대기 → 프롬프트 → 200ms → '\r'` 순서와 대기 시간이 주입한 delays 와 정확히 일치 ② `autoApprove: true` 일 때만 `--dangerously-skip-permissions` 포함 (기본은 **미포함**) ③ `resumeSessionId` 지정 시 `claude --resume <sid>` ④ **프롬프트 빈 값이면 `claude` 만 실행하고 자동 타이핑 0회**.
- [ ] **AC7** — `WorkspaceService.startTask` (git/dooray/spawner 전부 fake): ① 호출 순서가 계획대로 ② **멱등** — 같은 `projectId:taskId` 로 재호출 시 워크트리를 새로 만들지 않고 기존 활성 run 을 반환(`reused: true`) ③ 두레이 상태 전환/댓글/fetch 실패는 **startTask 를 실패시키지 않고** `warnings[]` 로 반환 ④ spawn 실패 시 run 은 `failed` 로 남고 워크트리는 **삭제되지 않는다** ⑤ `maxConcurrentRuns` 초과 시 거부 ⑥ 워크트리 경로가 멘션 `agentRoot` 내부면 거부.
- [ ] **AC8** — hook 라우팅: ① `hookRouter` 에 **멘션 resolver 가 먼저, workspace resolver 가 두 번째**로 등록되고 멘션 채널 cwd 는 여전히 멘션이 가져간다(우선순위 회귀 테스트) ② 워크트리 하위 깊은 cwd 가 **경로 세그먼트 기준 최장 매칭**으로 올바른 run 에 붙는다(형제 경로 `<worktree>-foo` 는 매칭되지 않는다) ③ 활성 run 이 없는 워크스페이스의 경로는 `null`(무로그 무시) ④ `Stop` → `awaiting-input` + `transcript_path` basename 에서 `claudeSessionId` 추출 + `lastAssistantText` 저장 ⑤ `PostToolUse` → `awaiting-input` 이던 run 만 `running` 으로 복귀하고, **상태가 안 바뀌는 PostToolUse 는 스토어에 쓰지 않는다**.
- [ ] **AC9** — 생애주기: `resumeRun` 은 `.claude` 설정을 **현재 port/secret 으로 다시 쓴 뒤** `claude --resume` 로 새 터미널을 띄운다 / `adoptRun` 후 `cleanupRun` 은 **브랜치를 삭제하지 않는다**(가드) / dirty 워크트리는 `force` 없이는 거부 / `reconcile()` 은 모든 run 의 `terminalSessionId` 를 null 로 만들고, 워크트리가 사라진 run 을 `discarded` 로 정리한다.
- [ ] **AC10** — IPC 3+1: 신규 채널이 `IPC_CHANNELS` · `src/preload/index.ts` · `src/main/index.ts` 3곳에 모두 있고, `index.test.ts` 의 ① 미지 채널 0 ② 중복 등록 0 ③ **push 전용 `workspace:run:updated` 는 `ipcMain.handle` 에 없음** 이 통과한다.
- [ ] **AC11** — `DoorayTask.number` **실응답 검증 결과가 impl-log 에 기록**된다(존재 여부 + 샘플 값 + 확인 방법). 존재하든 아니든 `taskId6` fallback 경로는 테스트로 커버된다.
- [ ] **AC12** — `npm run test:coverage` 70% 라인 게이트 유지. 신규 `src/main/workspace/**` · `src/shared/workspace/**` 는 **라인 80% 이상**(순수 모듈이 다수라 달성 가능; 미달 시 이유를 impl-log 에).
- [ ] **AC13** — 수동 QA 1회(실 저장소 + 실 두레이 태스크): 작업 시작 → 브랜치·워크트리 생성 확인 → 터미널에서 claude 기동 확인 → 지시 1회 → 응답 후 run 이 `awaiting-input` → 앱 재시작 → `reconcile` 후 resume → `cleanupRun` 으로 워크트리·브랜치 정리. 각 단계의 스토어 상태를 `clauday-workspaces.json` 으로 확인.
- [ ] **AC14** — 멘션 봇 회귀 수동 QA 1회: resolver 2개가 등록된 상태에서 `@clauday` 멘션 → 응답 회신 → 재멘션 `--resume` 이 그대로 동작.
- [ ] **AC15** — `git diff --stat` 에 `src/renderer/src/components/**` 변경 0건.

## 영향 도메인

- **workspace** (신규) — `src/shared/types/workspace.ts`, `src/shared/workspace/*`, `src/main/workspace/*`. wiki `domain-workspace.md` 는 이 트랙의 integrator 가 신설.
- **electron-ipc** — 채널 16(handle) + 1(push) 신설, preload `api.workspace.*` 신설, `api.git.deleteBranch` / `api.dooray.projectWorkflows` 추가.
- **dooray-bot** — `ClaudeHookRouter` 에 resolver 2번 등록(멘션 resolver 뒤). 멘션 코드 자체는 **무수정**. `MentionHookHandler` 의 named export 순수 함수(`extractAssistantMessage`)를 workspace 가 재사용.
- **terminal** — `TerminalManager.create/input/kill/addExitListener` 소비자 추가. 터미널 도메인 코드 무수정.
- **claude-chat** — `claudeDirSetup`(trust + hook settings) 을 워크트리에 적용하는 두 번째 소비자 등장. 모듈 무수정.
- **ai-service** — **영향 없음.** `AIService.runClaudeStream` 및 Windows/Mac 분기 코드에 손대지 않는다(claude `-p` 신규 호출부 0 — AI 판정이 스코프에서 빠졌으므로).

## 리스크 / 제약

- **딜레이 기반 TUI 입력은 머신 부하에 취약** — boot 1.5s / ready 3.0s 가 느린 머신에서 부족하면 프롬프트가 유실된다. — 완화: delays 를 주입 가능한 상수로 두고(설정화는 C-3), 실패해도 **사용자가 터미널에서 직접 입력할 수 있다**는 것이 TUI 방식의 안전망. 프롬프트 원본은 파일로 남으므로 복사 가능.
- **`DoorayTask.number` 미검증** — 타입에는 있으나 renderer 어디에서도 렌더하지 않아 실응답 포함 여부가 확인된 적이 없다(grep 결과 사용처 0). — 완화: **plan 1단계에서 실응답 확인**(임시 로그 → 확인 → 로그 제거)하고, `taskId6` fallback 을 1급 경로로 구현·테스트.
- **`.git/info/exclude` 는 워크트리별이 아니라 공용(common dir)이다** — 여기에 쓰면 메인 저장소와 다른 모든 워크트리에 영향이 간다. — 완화: 패턴을 `.claude/settings.local.json` **한 줄로 최소화**하고 sentinel 주석 + 정확한 라인 중복 검사로 멱등하게, 실패해도 startTask 는 계속(warnings).
- **멘션 resolver 의 형제 경로 버그(`'..'`)가 그대로 살아 있다** (C-0 이 의도적으로 보존, ADR-v2-workspace-p0-05). 멘션이 **1순위**이므로, `agentRoot` 접두사를 가진 경로에 워크트리를 만들면 workspace resolver 에 도달하지 못한다. — 완화: `startTask` 가 **워크트리 경로가 agentRoot 내부/접두사면 거부**한다(예방을 라우팅이 아니라 생성 시점에 둔다). 멘션 resolver 수정은 여전히 비목표.
- **electron-store 쓰기 빈도** — PostToolUse 는 초당 여러 번 올 수 있다. 매번 디스크에 쓰면 SSD 마모 + 렌더러 push 폭주. — 완화: **상태 전이가 실제로 일어난 경우에만** 쓰기/push. `lastActivityAt` 같은 고빈도 필드를 스키마에 넣지 않는다.
- **두레이 쓰기(상태 전환·댓글)는 남의 데이터를 바꾼다** — 실패했는데 조용하면 사용자는 전환된 줄 안다. — 완화: `warnings[]` 로 반환 + `console.warn` 에 taskId 포함(전역 규약 §4/§5). 기본값은 상태 전환 ON / 댓글 OFF.
- **`index.ts` 동시 편집** — 같은 Phase 2 에서 A-2(`CLAUDE_START_TASK` ≈878-895), B 트랙(터미널 IPC ≈950-1000)이 같은 파일을 만진다. — 완화: 이 트랙은 **조립부(≈176-195)** 와 **핸들러 블록 신설(파일 끝 Git 핸들러 뒤)** 에만 손대고, import 는 5줄 이내로 추가.
- **worktree 위치가 목업 2종에서 서로 다르게 그려져 있다** (`start-work-modal` = `.{repo}-worktrees/`, `workspace-view` = `~/Clauday-Workspaces/...`). — 결정: **`GitService.createWorktree` 기본 경로(저장소 형제 `.{repo}-worktrees/`)** 를 채택(ADR-06). C-3 이 workspace-view 의 경로 라벨을 실제 값으로 렌더하면 자연히 해소된다.
- **"이왕 하는 김에" 유혹** — C-0 이 기록한 기존 결함(멘션 형제 경로, send 실패 시 markIdle 스킵)을 이 트랙에서 고치고 싶어진다. — 제약: 고치지 않는다. 이 트랙은 신규 코드에 대한 책임만 진다.

## 참조

- 마스터 설계 `~/.claude/plans/toasty-sleeping-simon.md` — §C-1, §C-2, §C-3(표면 요구), §C-3.5(taskSessionLinks 스키마), §C-4(리스크), §검증
- `feature/workspace/v2-workspace-p0/` — `adr.md`(ADR-01 라우터 계약 / ADR-02 claudeDirSetup / ADR-05 결함 보존), `impl-log.md`(보존된 버그 2건, thunk 주입 교훈)
- 목업 `docs/mockups/v2/workspace-view.html`(run 카드 액션: 추가 지시 / 재연결 / 채택 / 휴지통 정리), `docs/mockups/v2/start-work-modal.html`(모달 필드 = `StartTaskParams` 의 근거)
- `.agent/wiki/domain-electron-ipc.md` — 3+1 규칙, push 채널 규약
- `.agent/wiki/domain-dooray-bot.md` — HookServer secret / Stop hook 응답 회수 / ClaudeHookRouter 위치
- `.agent/wiki/domain-terminal.md` — PTY 생성·exit 통지(B-1 `addExitListener`)
- 기존 코드: `src/main/git/GitService.ts`(worktree API 완비), `src/main/dooray/mention/MentionTerminalSpawner.ts`(검증된 spawn 시퀀스), `src/main/claude/claudeDirSetup.ts`, `src/main/hooks/ClaudeHookRouter.ts`, `src/main/utils/paths.ts`(A-0 `samePath`), `src/main/utils/atomicWrite.ts`
