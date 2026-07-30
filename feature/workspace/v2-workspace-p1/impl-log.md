---
task: v2-workspace-p1
agent: main-process-engineer
date: 2026-07-30
---

# Impl Log — v2.0 C-1: 워크스페이스 도메인 모델 + 스토어 + GitService 확장

## [main] C-1

이번 라운드 스코프: S1(타입) · S2(gitRef/branchName/workspaceKey) · S3(runStateMachine) · M1(WorkspaceStore) ·
M2(GitService 확장 + `isPathInside`) + windows-fix 트랙 위임분(`GitService` 의 `w.path === worktreePath` →
`samePath()`). **AgentRunSpawner/WorkspaceService/hook handler/IPC·preload/index.ts/TerminalManager/renderer 는
다음 라운드**(브리핑 지시에 따라 이번 라운드 금지 목록).

### 변경한 파일

**shared (S1~S3, 신규)**
- `src/shared/types/workspace.ts` — 타입 선언 전용(런타임 export 0). `RepoRegistryEntry`/`AgentRunStatus`/`AgentRun`/`TaskWorkspace`/`TaskSessionLink`/`WorkspaceSettings`/`StartTaskParams`/`StartTaskResult`/`ResumeRunParams`/`CleanupRunParams`/`WorkspaceRunUpdatedPayload`
- `src/shared/workspace/gitRef.ts` — `isSafeGitRef(ref)`, 커맨드 인젝션 방지 + git ref 문법 합집합
- `src/shared/workspace/gitRef.test.ts` — 허용 10종 / 거부 24종(요구 15종 이상 충족)
- `src/shared/workspace/branchName.ts` — `DEFAULT_BRANCH_TEMPLATE`, `buildBranchName`, `resolveBranchNameConflict`
- `src/shared/workspace/branchName.test.ts` — 토큰 6건, taskNumber fallback, projectCode fallback, 한글 sanitize 3건, 충돌 off-by-one 3건, **계약 테스트 23종**(`isSafeGitRef` 통과)
- `src/shared/workspace/workspaceKey.ts` — `workspaceKey`/`parseWorkspaceKey`
- `src/shared/workspace/workspaceKey.test.ts` — 합성/분해/왕복 4건
- `src/shared/workspace/runStateMachine.ts` — `RunEvent`, `applyRunEvent`, `isLiveRun`, `isTerminalRun`
- `src/shared/workspace/runStateMachine.test.ts` — **6×7=42 조합 표 검증** + 시나리오 2건 + `failed` 되살림 2건 + live/terminal 판정

**main (M1/M2, 신규+수정)**
- `src/main/workspace/workspaceState.ts`(신규) — `WorkspaceState`, `DEFAULT_WORKSPACE_SETTINGS`, `makeRepoId`(FNV-1a 32bit), `migrateWorkspaceState`(순수 함수)
- `src/main/workspace/workspaceState.test.ts`(신규) — `makeRepoId` 결정성/win32 흡수/충돌 없음, 마이그레이션 빈값·깨진값·승격·멱등·no-op 8건
- `src/main/workspace/WorkspaceStore.ts`(신규) — storage 생성자 주입, CRUD, `saveWorkspace` 불변식 검사
- `src/main/workspace/WorkspaceStore.test.ts`(신규) — in-memory `Map` storage, CRUD 전종, 불변식 교정 4건
- `src/main/utils/paths.ts`(수정) — `isPathInside(parent, child, opts?)` 추가
- `src/main/utils/paths.test.ts`(수정) — 동일/하위/형제/win32/후행슬래시/UNC/platform 생략 8건 추가
- `src/main/git/GitService.ts`(수정)
  - `assertSafeRef` 를 `isSafeGitRef` 호출로 위임(throw 메시지 `유효하지 않은 git 참조: ${ref}` 동일 유지)
  - `deleteBranch(repoPath, branch, opts?)` 신설
  - `addToInfoExclude(worktreePath, patterns)` 신설(sentinel + 정확 라인 비교 멱등)
  - `fetchRemote(repoPath, remote?)` 신설
  - **windows-fix 트랙 위임분**: `createWorktree` 내부 두 곳(기존 워크트리 재사용 확인, 생성 후 조회)의 `w.path === worktreePath` 를 `samePath(w.path, worktreePath)` 로 교체
- `src/main/git/GitService.test.ts`(수정) — fs mock 에 `readFileSync`/`mkdirSync`/`promises.{writeFile,rename,unlink}` 추가(기존 22건 무영향 확인, 8건 추가로 33건). `deleteBranch` 4건, `addToInfoExclude` 4건, `fetchRemote` 3건 신설

### `DoorayTask.number` 검증 결과 (Step 0-1)

**브리핑 지시에 따라 실응답 검증은 수동 QA 로 이월했다** (`## [main] C-1` 스코프에서는 미수행). 대신 PRD AC11 방침대로
`taskId6` fallback 을 1급 경로로 구현·테스트했다:

- `buildBranchName` 에서 `taskNumber` 가 `undefined` 면 `{taskNumber}` 토큰이 `taskId.slice(-6)` 값으로 자동 치환된다
  (`branchName.test.ts` — `'taskNumber 없으면 taskId6 로 자동 대체'`).
- 기본 템플릿(`feature/{projectCode}-{taskNumber}`) 기준, `number` 가 없는 두레이 태스크의 결과는
  예: `taskId='000000382391'` → **`feature/D-TF-382391`** 형태가 된다(brief 지침의 예시값과 동일 패턴 재확인).
- `number` 실응답 존재 여부(및 `projectCode` 존재 여부)는 다음 라운드 담당자 또는 QA 가 `npm run dev` 로 태스크
  상세를 열어 확인해야 한다 — 이 impl-log 에는 아직 값이 기록되지 않았다는 점을 **명시적으로 남긴다**.

### 테스트 / 커버리지

`npx vitest run` 전체 — **142 files / 2198 tests 전부 통과** (기존 141 files / 2193 tests 에서 본 라운드 신규 8 파일,
+ 신규 55 테스트 만큼 증가; 기존 파일 중 수정한 건 `GitService.test.ts`/`paths.test.ts` 뿐이고 둘 다 grep 로 diff 확인).

스코프 파일 커버리지(`npx vitest run --coverage`, 이번 라운드 파일만 필터):
- `src/main/workspace/**` — lines 99.39% / functions 100% (요구 80% 이상 충족)
- `src/shared/workspace/**` — lines 100% / functions 100% (요구 80% 이상 충족)
- `src/main/git/GitService.ts` — lines 85.39%(기존 파일 확장, 신규 모듈 기준 아님 — 참고용)
- `src/main/utils/paths.ts` — lines 100%

`npx tsc --noEmit -p tsconfig.node.json` (내 스코프가 속한 프로젝트) — **에러 0**.

`npm run typecheck`(node+web 둘 다) 는 현재 **web 쪽에서 에러 2건**이 나는데, `git stash push -u` 로 내 변경분만
분리해 재현한 결과 **동시 작업 중인 다른 트랙(세션/스킬/MCP 담당, `ClaudeSessionService.ts`/`claudeProjects.ts` 수정)의
파일에서만** 발생함을 확인했다(내 변경분을 스택에 넣고 뺀 상태에서도 동일 에러 재현 — 내 파일이 원인이 아님).
에러 내용: `File '.../claudeProjects.ts' is not listed within the file list of project 'tsconfig.web.json'`.
**AC1 의 `npm run typecheck` 전체 통과는 이 트랙 단독으로는 만족되지 않는다** — 다른 트랙과의 통합 시점에 재확인 필요.

### 발견했으나 고치지 않은 것

- `src/main/git/GitService.ts` 의 기존 `resolveGitCommonDir` 이전에는 없던 개념이라 새로 만들었는데, 이 메서드가
  `private` 라 M4(`WorkspaceService`)/M6(`cleanupRun`) 에서 직접 못 쓴다. 필요하면 `addToInfoExclude` 를 통해서만
  간접 사용 가능 — 다음 라운드에서 필요해지면(예: dirty 판정에 common-dir 필요) public 화 여부를 재검토할 것.
  파일:행 — `src/main/git/GitService.ts:326`. 재현 조건 — 없음(설계 관찰). 제안 — 다음 라운드에서 필요 시 `private` → 없음(그대로 두고 새 public 메서드로 감싸는 편이 캡슐화에 낫다). 넘길 트랙 — M4/M6 담당(다음 라운드).
- `WorkspaceStore.findWorkspaceByWorktree` 는 `worktreePath` 를 **정확 문자열 비교**(`===`)로 찾는다(`samePath`
  미사용). AC5/plan 이 이 메서드에 대해 win32 경로 흡수를 명시적으로 요구하지 않아 최소 구현으로 남겼다. hook
  resolver(M5, ADR-05 (b))는 이 메서드를 쓰지 않고 `isPathInside` 로 직접 `activeRun.worktreePath` 를 순회 비교하는
  설계이므로 실사용 경로에는 영향이 없다 — 다만 `findWorkspaceByWorktree` 를 다른 목적으로 쓸 일이 생기면(예:
  reconcile 의 외부 삭제 감지) 대소문자 이슈가 있을 수 있음을 남겨둔다. 파일:행 — `WorkspaceStore.ts:121`. 넘길
  트랙 — M6(`reconcile`) 담당.

없음 외 추가로 발견한 이슈 없음.

### 결정 사항 (해야 할 것)

- **`makeRepoId` 의 basename 추출은 Node `path.basename` 을 쓰지 않는다.** 대신 `lastPathSegment()` 라는 자체
  구현(백슬래시→슬래시 통일 후 마지막 세그먼트 추출)을 둔다. 이유: `path.basename` 은 **실행 중인 OS** 기준으로
  구분자를 해석하므로, `makeRepoId(absPath, platform)` 의 `platform` 인자와 실제 동작이 어긋난다(darwin 프로세스에서
  `platform:'win32'` 를 넘겨도 `path.basename` 은 여전히 `/` 만 구분자로 본다). 테스트로 실제로 잡힘
  (`makeRepoId — win32 대소문자/구분자 차이를 흡수한다`). ADR-03 (c) 의 "`slug(basename)`" 문구는 유지하되 구현
  디테일로 이 함수를 썼다 — ADR 이탈 아님(공개 시그니처/의미는 동일).
- `migrateWorkspaceState` 의 승격 조건에서 "같은 경로 미등록" 검사를 별도 코드로 두지 않았다. `repos.length === 0`
  이 이미 그 조건을 함의하므로(비어 있으면 무엇이든 미등록) 중복 검사는 항상 참이 되는 죽은 분기였다 — ADR-03 (d)
  의 의도(멱등 승격)는 `repos.length === 0` 단독 조건으로 100% 동일하게 달성됨을 테스트로 확인
  (`2회 실행해도 항목이 늘지 않는다`).
- `GitService.deleteBranch` 의 `force` 기본값은 `false`(안전 삭제 `-d`)로 정했다. plan 의 테스트 스니펫이 `-D` 예시만
  보여 모호했는데, "정리는 명시적 사용자 행동이어야 한다"(ADR-06 결과 섹션)와 대칭되게 **기본은 보수적**으로 잡았다.
  `force: true` 를 넘겨야 `-D`. 다음 라운드(M6 `cleanupRun`)가 브랜치를 지울 때 이 기본값을 인지하고 명시적으로
  `force` 를 넘겨야 한다.
- `addToInfoExclude` 의 "정확히 같은 라인" 판정은 **패턴별 개별 라인** 기준이다(sentinel 유무와 무관하게 패턴 라인만
  있으면 그 패턴은 건너뛴다). sentinel 자체가 없고 패턴만 남아있는 손상된 상태에서도 패턴 중복 추가는 막되, sentinel
  은 그때 한 번 더 붙지 않는다(이미 있으면 재사용).
- `addToInfoExclude` 는 **동기 fs 읽기(`readFileSync`/`mkdirSync`) + 비동기 원자적 쓰기(`writeFileAtomic`)** 조합을
  썼다 — `GitService` 의 기존 스타일(`existsSync` 동기 사용)과 일관되게 유지하면서, 실제 파일 쓰기만 A-0 의 원자적
  쓰기 유틸을 재사용했다.

### 제약 (하지 말 것)

- **`GitService` 는 이 라운드까지가 내 파트다.** windows-fix 트랙이 `:150`/`:173` 을 나에게 위임했던 것처럼, 이후
  라운드가 `GitService` 를 추가로 만질 필요가 있으면(예: dirty 판정 헬퍼) 새 메서드를 추가하는 방식으로 — 기존
  메서드(특히 `assertSafeRef`/`createWorktree`/`deleteBranch`/`addToInfoExclude`/`fetchRemote`)의 시그니처는
  바꾸지 말 것. 바꾸면 이 라운드의 테스트 33건이 계약 기준점 역할을 못 한다.
- **`isSafeGitRef` 의 규칙을 완화하지 말 것.** `branchName.ts` 의 계약 테스트(23종)와 `GitService.test.ts` 의 기존
  거부 케이스(3건, 무수정)가 이 규칙에 의존한다. 규칙을 바꾸려면 두 테스트 스위트를 함께 재검토해야 한다.
- **`runStateMachine.applyRunEvent` 는 throw 하지 않는다.** hook 핸들러(M5, 다음 라운드)가 이 계약에 의존한다 —
  늦게 온 이벤트를 무시하는 것이 handler 쪽 책임이 아니라 상태머신 쪽 책임이다.
- **`WorkspaceStore` 는 여전히 `electron-store`/디스크를 모른다.** 다음 라운드가 `index.ts` 에서
  `new WorkspaceStore(new Store({ name: 'clauday-workspaces' }), { legacyGitRepoPath: store.get('gitRepoPath', '') })`
  로 조립하면 된다 — 이 트랙에서 `index.ts` 를 만지지 않았으므로 조립 코드는 아직 어디에도 없다.
- **`WORKSPACE_HOOK_KIND`, `hookConfig` thunk, `AgentRunSpawner`, `WorkspaceService`, IPC 채널/preload 는 이 커밋에
  없다.** 다음 라운드가 M3~M7 + I 를 이어서 진행한다.

### C-3/다음 라운드 인계용 요약

- **shared 모듈 최종 표면**: `isSafeGitRef(ref): boolean`, `buildBranchName(input): string`,
  `resolveBranchNameConflict(base, taken): string`, `workspaceKey(projectId, taskId): WorkspaceKey`,
  `parseWorkspaceKey(key)`, `applyRunEvent(status, event): AgentRunStatus | null`, `isLiveRun`, `isTerminalRun` —
  renderer 가 전부 `import type`/직접 함수 import 로 IPC 없이 쓸 수 있다(AC1/AC2 조건 충족).
- **`WorkspaceStore` 메서드 표면**: `getState / listRepos / addRepo / updateRepo / removeRepo / getSettings /
  setSettings / setProjectRepo / listWorkspaces / getWorkspace / saveWorkspace / findRunById /
  findWorkspaceByWorktree / getTaskSessionLink / setTaskSessionLink` — `WorkspaceService`(M4) 가 이걸 그대로 감싸면
  된다.
- **`GitService` 신규 메서드 시그니처**: `deleteBranch(repoPath, branch, opts?: {force?: boolean})`,
  `addToInfoExclude(worktreePath, patterns: string[]): Promise<boolean>`, `fetchRemote(repoPath, remote?: string)`.
- **`isPathInside(parent, child, opts?)`** — `src/main/utils/paths.ts`. M5 의 hook resolver 가
  `isPathInside(run.worktreePath, cwd)` 로 쓰면 된다(세그먼트 기준, 형제 경로 오탐 없음).
- **워크트리 실제 경로 형태**: `GitService.createWorktree` 기본 경로 규칙 그대로(무변경) — `<repo 부모>/.{repoName}-worktrees/{branch-with-slash-replaced-by-dash}`.

## 참조

- `feature/workspace/v2-workspace-p1/prd.md` — AC1~AC15
- `feature/workspace/v2-workspace-p1/adr.md` — ADR-v2-workspace-p1-01(도메인 모델) / 02(gitRef+branchName) /
  03(WorkspaceStore) / 05(hook resolver, `isPathInside` 근거) / 06((c)워크트리 경로, (d) info/exclude, (f) IPC 표면 — 다음 라운드 참조용)
- `feature/workspace/v2-workspace-p1/plan.md` — S1/S2/S3/M1/M2 체크리스트
- `src/main/utils/paths.ts` — A-0 `normalizePathForCompare`/`samePath` (이번에 `isPathInside` 추가)
- `src/main/utils/atomicWrite.ts` — A-0 `writeFileAtomic` (`addToInfoExclude` 가 재사용)

---

## [main-process-engineer] C-2

이번 라운드 스코프: M3(`AgentRunSpawner`) · M4(`WorkspaceService.startTask`) · M5(`WorkspaceHookHandler` +
라우터 등록) · M6(resume/adopt/cleanup/reconcile + 터미널 exit 구독) · M7(`TaskService.getProjectWorkflows` public
화) · I1(IPC 16 handle + 1 push + preload `workspace` 섹션 + `index.test.ts`/`mockWindowApi.ts` 갱신). C-1 이
남긴 shared 모듈·`WorkspaceStore`·`GitService` 확장·`isPathInside` 를 그대로 소비했고 시그니처는 하나도 바꾸지 않았다.

### 변경한 파일

**main (신규)**
- `src/main/workspace/AgentRunSpawner.ts` — `SpawnDelays`/`DEFAULT_SPAWN_DELAYS`(1500/3000/200), `AgentSpawnRequest`,
  `buildOneLine`(export 순수 함수), `AgentRunSpawner.spawn()`
- `src/main/workspace/AgentRunSpawner.test.ts` — 기본 시퀀스/autoApprove/resume/빈 프롬프트/`buildOneLine`/tabName
  60자 컷/실 sleep 0 지연 통합 14건
- `src/main/workspace/WorkspaceService.ts` — `WorkspaceError`(7 코드) · `WorkspaceServiceDeps`(전부 생성자 주입) ·
  repo/settings CRUD 위임 · `resolveRunByCwd`/`recordStop`/`recordToolActivity`(hook 핸들러가 위임 호출) ·
  `startTask`(17단계) · `resumeRun`/`adoptRun`/`cleanupRun`/`reconcile` · 터미널 exit 구독(`addExitListener`) +
  `dispose()` · `addChangeListener`(push 구독)
- `src/main/workspace/WorkspaceService.test.ts` — 39건(정상 경로 순서/멱등/best-effort 경고 4종/spawn 실패/동시 실행
  상한/agentRoot 거부/repo 결정 3분기/git 저장소 아님/커스텀 브랜치명/resume/adopt+cleanup/dirty 가드/reconcile 3종/
  exit listener/repo·settings CRUD)
- `src/main/workspace/WorkspaceHookHandler.ts` — `WORKSPACE_HOOK_KIND='workspace-run'`, `resolve`/`handle` — 로직은
  전부 `WorkspaceService`(`resolveRunByCwd`/`recordStop`/`recordToolActivity`)에 위임하는 얇은 어댑터
- `src/main/workspace/WorkspaceHookHandler.test.ts` — resolve 5건(정확 일치/하위 3단계/형제 경로/활성 run 없음/중첩
  워크트리 2개) + handle 5건(stop 정상/fallback reader/terminal 상태 무시) + post_tool_use 2건 + 알 수 없는 이벤트 1건
- `src/main/workspace/hookPriority.test.ts` — 실제 `ClaudeHookRouter` + `MentionHookHandler` + `WorkspaceHookHandler`
  조합으로 우선순위 회귀 3건(멘션 cwd/워크트리 cwd/무관 cwd) — AC8-①

**main (수정)**
- `src/main/dooray/TaskService.ts` — `getProjectWorkflows(projectId): Promise<DoorayWorkflow[]>` 추가(`loadWorkflows`
  캐시 Map → 배열 변환, private 메서드 본문 무수정)
- `src/main/dooray/TaskService.test.ts` — `getProjectWorkflows` 정상 변환 1건 + API 실패 시 `[]` 1건
- `src/main/index.ts` — ① import 6줄(워크스페이스 4클래스 + `claudeDirSetup` 함수 2개 + `shared/types/workspace`
  타입 묶음 1줄, 계획의 "5줄 이내" 가이드보다 1~2줄 많음 — 타입 묶음까지 합쳐 실질적으로는 응집된 한 블록) ② 조립부:
  `gitService`/`analyticsService` 선언 **직후**(계획 문서의 "hookRouter 바로 뒤"가 아니라 `gitService` 의존성 때문에
  한 블록 뒤로 이동 — 결정 사항 참조)에 `workspaceStore`/`agentRunSpawner`/`workspaceService`/`workspaceHookHandler`
  생성 + `hookRouter.addResolver`/`setHandler` 2줄 등록 ③ `createWindow()` 안에 `workspaceService.addChangeListener`
  push 배선 + `void workspaceService.reconcile()` ④ `dooray:project:workflows` 핸들러 1줄(Dooray 블록) ⑤
  `git:delete-branch` 핸들러 1줄(Git 블록) ⑥ 파일 끝 Git 핸들러 블록 뒤에 `workspaceHandle` 래퍼 + 13개 핸들러 신설
  블록. 기존 핸들러 사이에는 끼워 넣지 않았다.
- `src/preload/index.ts` — `git.deleteBranch` 1줄 추가 + `git` 블록 뒤 `workspace: {...}` 블록 신설(repos/settings/
  setProjectRepo/list/get/startTask/run.{resume,adopt,cleanup}/reconcile/onRunUpdated) + `dooray.projectWorkflows`
  1줄 + import type 2블록(`DoorayWorkflow`, workspace 타입 12종)

**shared (수정)**
- `src/shared/types/workspace.ts` — `AddRepoParams`/`ResumeRunResult`/`AdoptRunResult`/`CleanupRunResult`/
  `ReconcileResult` 5개 인터페이스 append(런타임 export 0 유지, AC2 재확인). S1 이 만든 타입은 필드 하나 안 건드림.
- `src/shared/types/dooray.ts` — `DoorayWorkflow { id; name; class }` 추가
- `src/shared/types/ipc.ts` — 파일 맨 끝(`HARNESS_RESTORE_BACKUP` 뒤)에 워크스페이스 섹션 추가: 16 handle
  (`WORKSPACE_REPOS_LIST/_ADD/_UPDATE/_REMOVE`, `WORKSPACE_SETTINGS_GET/_SET`, `WORKSPACE_PROJECT_REPO_SET`,
  `WORKSPACE_LIST`, `WORKSPACE_GET`, `WORKSPACE_START_TASK`, `WORKSPACE_RUN_RESUME/_ADOPT/_CLEANUP`,
  `WORKSPACE_RECONCILE`, `DOORAY_PROJECT_WORKFLOWS`, `GIT_DELETE_BRANCH`) + 1 push(`WORKSPACE_RUN_UPDATED`,
  `/** main → renderer push 전용 */` 주석)

**테스트 인프라 (수정)**
- `test/helpers/mockWindowApi.ts` — `dooray.projectWorkflows` 1줄 + `git.deleteBranch` 1줄 + `workspace` 네임스페이스
  전체(repos/settings/setProjectRepo/list/get/startTask/run/reconcile/onRunUpdated) 스텁
- `src/main/index.test.ts` — `makeStubClass` 에 `addExitListener`(unsubscribe 반환)와 `getProjectWorkflows`(`[]`)
  추가(둘 다 없으면 `WorkspaceService` 생성자가 `TerminalManager.addExitListener` 호출 시점에 즉시 throw해 import
  테스트 전체가 깨짐 — 실제로 추가 전에 재현 확인함). `critical channels` 에 `WORKSPACE_START_TASK`, `event-only
  channels` 에 `WORKSPACE_RUN_UPDATED` 추가 + `WORKSPACE_RUN_UPDATED` 가 `ipcMain.handle` 에 없음을 확인하는 전용
  테스트 1건 신설(AC10)

### 테스트 / 커버리지

`npx vitest run` 전체 — **160 files / 2448 tests 전부 통과** (세션 내 병렬 진행 중인 다른 트랙들의 변경분 포함, 회귀 0).

스코프 커버리지(`npx vitest run --coverage`):
- `src/main/workspace/**` — lines 94.99% / branches 84.66% / functions 97.05% (요구 80% 이상 충족)
- `src/shared/workspace/**` — lines 100% / branches 98.36% / functions 100% (요구 80% 이상 충족, C-1 분과 합산)
- 전체 `All files` — lines 82.13% (요구 70% 이상 충족)

`npx tsc --noEmit -p tsconfig.node.json` — 작업 도중 한때 **내 스코프 밖** 에러 1건(`src/main/terminal/
snapshotStore.test.ts:160`, 병렬 terminal 트랙 WIP)이 보였다. 내 변경분만 남기고 stash 로 나머지를 되돌려
격리 검증한 결과 내 파일(`src/main/workspace/**`, `index.ts`, `src/preload/index.ts`,
`src/shared/types/{workspace,dooray,ipc}.ts`) 기인 에러는 0건이었음을 그 시점에 확인. 이후 병렬 트랙이 자체
수정을 완료하면서 **`npm run typecheck`(node+web) 최종 실행 결과 에러 0 — AC1 완전 충족**(재현: 이 impl-log
작성 시점에 `npm run typecheck` 직접 실행해 확인).

### 발견했으나 고치지 않은 것

- **`runStateMachine` 의 `running` 행에는 `spawn-failed` 전이가 없다** — `reconcile`/터미널 exit 구독에서
  "claudeSessionId 없는 워크트리 존재 run" 을 이벤트로 번역할 때 plan(M6 체크리스트)의 문면은 "없는 running →
  failed" 를 기대하지만, ADR-01(d) 의 전이표 원문은 `running` 행에 `spawn-failed` 를 두지 않았다(오직 `spawning`
  만 `spawn-failed → failed`). `applyRunEvent` 는 이 트랙에서 수정 금지 대상(이전 라운드가 42종합 테이블로 고정,
  hook 핸들러 계약)이라 상태머신을 확장하지 않고 **실제 계약대로 구현**했다 — `running` + 세션 없음은 상태를
  유지한 채 `terminalSessionId` 만 `null` 로 detach 된다. 이는 ADR-01(c) 의 "`terminalSessionId === null` 이
  detached 의 유일한 판별자, 재연결 버튼은 status 가 아니라 이 필드로 판단" 설계와 완전히 정합적이라 실사용에는
  문제가 없다고 판단했지만, plan 문면과 구현이 다른 지점이라 **architect 재검토가 필요**하다. 재현: `reconcile()`
  또는 exit listener 트리거 시 `run.status==='running' && !run.claudeSessionId` 조합. 테스트로 실제 동작을
  고정해뒀다(`WorkspaceService.test.ts` — `'claudeSessionId 없이 이미 running 인 run 은 상태 유지 + terminalSessionId
  만 detach'`, `'워크트리가 아직 spawning 단계에서 세션 없이 재시작되면 failed 로'`). 파일:행 —
  `src/shared/workspace/runStateMachine.ts:22-26`(`running` 전이 테이블). 넘길 대상 — architect(ADR supersede
  여부 판단) 또는 C-3 담당(상태머신 확장이 필요해지면).
- **`WorkspaceService.startTask` 의 agentRoot 충돌 예측(`predictWorktreePath`) 이 `GitService.createWorktree` 의
  내부 경로 공식을 로컬에 복제**한다(`repoName = basename(repoPath)`, `.{repoName}-worktrees/{branch-dashed}`).
  ADR-06 (c)/(M4 plan) 이 "워크트리 생성 *전에* 예상 경로로 먼저 검사하는 쪽이 낫다"고 명시했는데, `GitService` 가
  이 공식을 별도 public 메서드로 노출하지 않아 부득이 복제했다 — C-1 impl-log 가 "GitService 는 이 라운드까지가
  내 파트, 필요 시 새 메서드로 감싸는 편이 캡슐화에 낫다"고 남긴 조언과 같은 종류의 트레이드오프다. 두 공식이
  갈라지면(예: `createWorktree` 의 경로 규칙이 바뀌면) 이 예측이 조용히 틀려질 수 있다 — `AgentRunSpawner.ts`
  상단 주석과 같은 성격의 "드리프트 방지 장치"가 없다. 파일:행 — `src/main/workspace/WorkspaceService.ts` 의
  `predictWorktreePath`(비export 헬퍼) / `src/main/git/GitService.ts:149-152`(`createWorktree` 의 원본 공식).
  넘길 대상 — 다음 라운드가 `GitService` 를 또 만질 일이 생기면 `GitService.predictWorktreePath(repoPath, branch)`
  같은 public 헬퍼로 승격해 양쪽이 같은 함수를 쓰게 할 것.
- **`resumeRun` 은 `preApproveTrust` 의 반환값(`TrustResult`)을 확인하지 않는다** — `startTask` 는 `'failed'` 면
  warning 을 남기지만 `resumeRun` 은 호출만 하고 무시한다(plan 이 resumeRun 단계에 이 항목을 명시하지 않았다).
  재현 조건 — 흔치 않음(`~/.claude.json` 파싱 실패 등). 제안 — 다음에 `resumeRun` 을 만지는 김에 동일 warning
  패턴을 추가. 넘길 트랙 — C-3(설정 화면에서 resume 실패 토스트를 다루게 될 때).

### 결정 사항 (해야 할 것)

- **`predictWorktreePath` + `isPathInside`/문자열 접두사 이중 검사로 agentRoot 충돌을 "부수효과 0" 지점에서
  막는다.** `git.createWorktree` 호출 *전에* 예측 경로를 검사해 위반이면 throw — 실제로 워크트리가 생기지 않는다
  (`WorkspaceService.test.ts` 의 `git.createWorktree 미호출` 단언으로 고정). ADR-05(a) 의 "isPathInside(agentRoot,
  worktreePath) 또는 접두사 문자열 관계면 거부" 를 그대로 구현 — `isPathInside` 만으로는 세그먼트 경계가 있는
  경우만 잡히므로, 정확한 문자열 접두사 비교(`normalizePathForCompare` 후 `startsWith`)를 **추가로** 병행해 형제
  경로(`<agentRoot>-2` 류)까지 보수적으로 차단한다.
- **`resolveRunByCwd`/`recordStop`/`recordToolActivity` 를 `WorkspaceHookHandler` 가 아니라 `WorkspaceService`
  에 둔다.** 브리핑이 이 이름(`resolveRunByCwd`)을 `WorkspaceService` 책임으로 명시하기도 했고, "로직은 항상
  service 클래스에, hook 핸들러는 얇은 어댑터로" 원칙과도 맞다 — `WorkspaceHookHandler` 는 hook payload 파싱
  (transcript_path → claudeSessionId, extractAssistantMessage/fallback reader) 만 하고 상태 전이·스토어 쓰기는
  전부 서비스에 위임한다. 덕분에 `hookPriority.test.ts` 가 실제 서비스+스토어 조합으로 resolve 의 경로 매칭
  로직(세그먼트 최장 매칭)을 목이 아니라 실동작으로 검증할 수 있었다.
- **`startTask` 의 두레이 상태 전환/댓글은 spawn 성공 여부와 무관하게 항상 시도한다** (plan 의 단계 순서 ⑯/⑰이
  spawn 실패 분기를 언급하지 않음). spawn 이 실패해도 브랜치/워크트리는 유효하므로 두레이 쪽에 "작업 시작" 신호를
  보내는 것이 사용자 기대에 맞다고 판단했다.
- **`addRepo` 의 `name` 기본값은 Node `path.basename` 을 그대로 쓴다** (M1 의 `makeRepoId`/`lastPathSegment` 같은
  platform 파라미터 흡수 로직을 재사용하지 않음). 이 메서드는 실제 실행 중인 OS 에서 실제 로컬 경로를 받는
  런타임 전용 경로이고(테스트처럼 `platform` 을 인위적으로 바꿔 부를 일이 없음), `makeRepoId` 자체는 여전히
  플랫폼 인자를 받는 결정적 함수를 그대로 쓴다 — 두 관심사(표시용 이름 vs id 결정성)를 분리해 두는 것이 맞다고
  판단했다.
- **`index.ts` 의 워크스페이스 조립부 위치를 계획 문서보다 한 블록 뒤로 옮겼다.** 계획은 "`hookRouter.setHandler
  (MENTION_HOOK_KIND, …)` 바로 뒤" 를 지목했지만, `WorkspaceService` 는 `gitService`(당시 아직 미선언)와
  `taskService` 를 생성자 주입받아야 한다. 기존 `gitService = new GitService()` 줄을 앞으로 옮기는 대신(그
  줄의 위치를 다른 트랙이 참조할 수도 있어 최소 변경 원칙에 반함), 워크스페이스 조립 전체를 `gitService`/
  `analyticsService` 선언 **직후**로 옮겨 기존 줄은 하나도 이동시키지 않았다. `hookRouter.addResolver`/
  `setHandler` 2줄도 이 블록 안에서 함께 등록된다(멘션 등록 줄과 물리적으로 붙어있지는 않지만, 여전히 "멘션이
  1순위" 주석과 함께 명시).

### 제약 (하지 말 것)

- **`runStateMachine.ts` 는 여전히 건드리지 않았다.** "발견했으나 고치지 않은 것" 의 `running.spawn-failed` 갭은
  이 트랙에서 고치지 않는다 — 상태 전이 규칙 변경은 ADR supersede 를 요구하는 결정이라 architect 승인 없이
  임의로 바꾸지 않았다. 다음에 이 표를 만지는 사람은 `WorkspaceService.test.ts` 의 위 2건 테스트를 함께
  재검토해야 한다(현재 계약을 고정하는 회귀 테스트이므로, 표가 바뀌면 이 테스트들의 기대값도 바뀌어야 정상).
- **`predictWorktreePath` 의 공식을 `GitService.createWorktree` 와 별개로 두 번 계산하고 있다는 사실을 인지할
  것.** 한쪽만 고치면 agentRoot 사전 검사가 조용히 무력화된다(검사는 통과했는데 실제 워크트리는 다른 경로에
  생기는 식). `GitService` 의 경로 공식을 바꿀 계획이 있다면 반드시 `WorkspaceService.ts` 의 동명 헬퍼도 같이
  본다.
- **`WorkspaceHookHandler` 에 상태 전이/스토어 접근 로직을 다시 넣지 말 것.** `resolveRunByCwd`/`recordStop`/
  `recordToolActivity` 는 `WorkspaceService` 의 public 메서드로 고정했다 — 핸들러가 다시 `store` 를 직접 참조하게
  되돌리면 `hookPriority.test.ts`/`WorkspaceHookHandler.test.ts` 양쪽의 실서비스 통합 검증 의도가 깨진다.
- **`src/main/dooray/mention/**` 파일은 이번에도 무수정.** `extractAssistantMessage`/`readLastAssistantText` 는
  import 만 했다(재사용, 복제 아님). 멘션 회귀는 `hookPriority.test.ts` 3건 + 기존 `MentionHookHandler.test.ts`
  전량 무변경 통과로 확인됨.
- **`AgentRunSpawner`/`WorkspaceService` 의 생성자 시그니처를 바꾸지 말 것.** `index.ts` 조립부와 세 벌의 테스트
  스위트(AgentRunSpawner/WorkspaceService/WorkspaceHookHandler/hookPriority)가 전부 이 시그니처를 전제로 한다.
  C-3 이 renderer 를 붙일 때 IPC 표면(preload)만 보고 만들면 되고, 이 클래스들을 직접 import 할 필요는 없다.

### C-3 인계용 요약

**preload 표면** (`window.api.workspace`, `window.api.git.deleteBranch`, `window.api.dooray.projectWorkflows`):
```
workspace.repos.{list,add,update,remove}
workspace.settings.{get,set}
workspace.setProjectRepo(projectId, repoId)
workspace.list() / workspace.get(key)
workspace.startTask(params: StartTaskParams): Promise<StartTaskResult>
workspace.run.{resume,adopt,cleanup}
workspace.reconcile(): Promise<{ detached, discarded }>
workspace.onRunUpdated(cb): () => void   // unsubscribe 반환, WorkspaceRunUpdatedPayload
git.deleteBranch(repoPath, branch, opts?: { force? })
dooray.projectWorkflows(projectId): Promise<DoorayWorkflow[]>
```

**`warnings[]` 문구 목록** (전부 `console.warn('[Workspace] <문구> taskId=… [runId=…]')` 와 함께 기록됨. 문구는
그대로 토스트에 노출 가능한 한국어 완결문):
- `원격 fetch 실패: <원인>`
- `.claude hook 설정 쓰기 실패: <원인>`
- `hook 서버가 아직 시작되지 않아 진행 상태 갱신이 동작하지 않을 수 있습니다.`
- `claude trust 사전 등록에 실패했습니다.`
- `.git/info/exclude 갱신 실패: <원인>`
- `claude 자동 기동 실패: <원인>`
- `두레이 워크플로우 중 "진행중" 단계를 찾지 못해 상태를 전환하지 못했습니다.`
- `두레이 상태 전환 실패: <원인>`
- `두레이 댓글 작성 실패: <원인>`
- (`resumeRun`) `.claude hook 설정 갱신 실패: <원인>` / `hook 서버가 아직 시작되지 않아 …`
- (`cleanupRun`) `워크트리 제거 실패: <원인>` / `채택(adopted)된 run 의 브랜치는 삭제하지 않습니다.` /
  `브랜치 삭제 실패: <원인>` / `프롬프트 파일 정리 실패: <원인>` / `repoId=… 를 찾을 수 없어 워크트리/브랜치
  정리를 건너뜁니다.`

**`StartTaskResult` 예시 JSON** (성공 경로, `warnings` 없음):
```json
{
  "workspace": {
    "id": "3937566592764168179:4058716649250948860",
    "projectId": "3937566592764168179",
    "taskId": "4058716649250948860",
    "taskNumber": 2619,
    "subject": "[iOS] 메일 목록 디자인 개선",
    "repoId": "myrepo-a1b2c3d4",
    "status": "active",
    "branch": "feature/D-TF-2619",
    "activeRunId": "a3f1...",
    "runs": [ { "runId": "a3f1...", "status": "running", "...": "..." } ],
    "createdAt": 1780000000000,
    "updatedAt": 1780000000123
  },
  "run": {
    "runId": "a3f1...",
    "workspaceId": "3937566592764168179:4058716649250948860",
    "repoId": "myrepo-a1b2c3d4",
    "branch": "feature/D-TF-2619",
    "baseBranch": "HEAD",
    "worktreePath": "/Users/x/dev/.myrepo-worktrees/feature-D-TF-2619",
    "status": "running",
    "prompt": "",
    "autoApprove": false,
    "terminalSessionId": "term-uuid",
    "startedAt": 1780000000000
  },
  "reused": false,
  "warnings": []
}
```

**워크트리 실제 경로 형태** (C-1 이 이미 남긴 것과 동일, C-2 에서도 무변경 확인): `GitService.createWorktree` 기본
경로 — `<repo 부모 디렉터리>/.{repoName}-worktrees/{branch, '/' → '-'}`. 예:
`~/dev/.dooray-claude-gui-assistance-worktrees/feature-D-TF-2619`.

**프롬프트 파일 위치**: `prompt` 가 비어있지 않을 때만 생성 — `<agentWorkspace.getRoot()>/workspace/{runId}/
prompt.md` (기본 `~/Clauday-Workspaces/workspace/{runId}/prompt.md`). 워크트리 밖이라 `git status` 에 안 잡힌다.

**hook resolver 등록 순서** (index.ts 조립부): 멘션 → 워크스페이스. `WORKSPACE_HOOK_KIND = 'workspace-run'`.

## 참조 (C-2)

- `feature/workspace/v2-workspace-p1/adr.md` — ADR-v2-workspace-p1-04(AgentRunSpawner) / 05(hook resolver) /
  06(startTask 단계·IPC 표면)
- `feature/workspace/v2-workspace-p1/plan.md` — M3~M7, I1 체크리스트
- 위 "## [main] C-1" 섹션 — shared 모듈/`WorkspaceStore`/`GitService` 확장 표면(이번 라운드가 그대로 소비)
- `src/main/dooray/mention/MentionTerminalSpawner.ts` — `AgentRunSpawner` 시퀀스 출처(1500/3000/200)
- `src/main/dooray/mention/MentionHookHandler.ts`, `transcriptReader.ts` — `extractAssistantMessage`/
  `readLastAssistantText` re-export 없이 직접 import
