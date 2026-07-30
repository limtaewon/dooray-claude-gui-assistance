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
