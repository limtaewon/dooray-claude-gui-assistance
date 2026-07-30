---
task: v2-workspace-p1
date: 2026-07-30
---

# Plan — v2.0 C-1 + C-2: 워크스페이스 도메인 모델 + 단일 run E2E

> 브랜치: `feat/version-2.0` (별도 브랜치를 파지 않는다).
> 전제 문서: 같은 폴더의 `prd.md`(AC1~AC15) · `adr.md`(ADR-v2-workspace-p1-01~06). **ADR 은 이 트랙의 전제다.** 구현 중 이견이 생기면 임의로 방향을 바꾸지 말고 `impl-log.md` 에 기록 후 architect 에게 반환한다.
> 선행 산출물: `feature/workspace/v2-workspace-p0/`(C-0 머지 완료 — `ClaudeHookRouter` / `MentionHookHandler` / `claudeDirSetup` 존재). A-0 유틸(`src/main/utils/paths.ts`, `atomicWrite.ts`) 도 이미 머지됨.
> 대원칙: **renderer 컴포넌트 0, 멘션 파이프라인 diff 0(조립부 2줄 제외), fan-out 흔적 0.**

## 분리 영역

| 파트 | 담당 | 주요 파일 | 선행 의존 |
|---|---|---|---|
| **S (shared 순수 모듈)** | main-process-engineer | `src/shared/types/workspace.ts`, `src/shared/workspace/{gitRef,branchName,runStateMachine,workspaceKey}.ts` | 없음 |
| **M (main 서비스)** | main-process-engineer | `src/main/workspace/*`, `src/main/git/GitService.ts`, `src/main/utils/paths.ts`, `src/main/dooray/TaskService.ts` | S |
| **I (IPC 표면)** | main-process-engineer | `src/shared/types/ipc.ts`, `src/main/index.ts`, `src/preload/index.ts`, `test/helpers/mockWindowApi.ts` | M |

한 명이 S → M → I 순서로 진행한다. **S1~S3 + M1 까지를 1차 커밋 단위**로 두면(순수 모듈 + 스토어, 외부 부수효과 0) 중간 인계가 가능하다.

## 다른 트랙과의 충돌 주의 (Phase 2 병렬)

`src/main/index.ts` 를 A-2(≈878-895 `CLAUDE_START_TASK`), B 트랙(≈950-1000 터미널 IPC)이 동시에 만진다.

- [ ] 착수 전 `git pull --rebase` 로 최신 `feat/version-2.0` 확보
- [ ] 이 트랙이 `index.ts` 에서 건드리는 영역은 **딱 3곳**임을 인지: ① import 블록(+5줄 이내) ② 조립부(≈176-195, `hookRouter` 등록 직후) ③ **파일 끝 Git 핸들러 블록 뒤에 워크스페이스 핸들러 블록 신설**
- [ ] 기존 핸들러 사이에 끼워 넣지 않는다(충돌면 최소화)
- [ ] `src/shared/types/ipc.ts` 는 **파일 맨 끝(`HARNESS_RESTORE_BACKUP` 뒤)에 새 섹션을 추가**한다. 중간 삽입 금지
- [ ] `src/preload/index.ts` 도 **`git` 블록 뒤에 `workspace` 블록 신설**(`git.deleteBranch` 한 줄만 기존 블록에 추가)

---

## Step 0 — 사전 검증 (구현 착수 전, 필수)

### 0-1. `DoorayTask.number` 실응답 확인 (PRD AC11 / 마스터 §C-4 리스크)

`number` 는 타입에만 있고 renderer 에서 렌더하는 곳이 0건이라 실응답 포함 여부가 확인된 적 없다.

- [ ] `src/main/index.ts` 의 `DOORAY_TASK_DETAIL` 핸들러(≈899)에 **임시** 진단 로그 추가
  ```ts
  const d = await taskService.getTaskDetail(projectId, taskId)
  console.log('[진단/삭제예정] taskDetail keys=', Object.keys(d), 'number=', d.number, 'projectCode=', d.projectCode)
  return d
  ```
- [ ] `npm run dev` → 두레이 태스크 뷰에서 태스크 1개 열기 → 터미널 로그 확인
- [ ] 결과를 impl-log 에 기록: `number` 존재 여부 / 실제 값 / `projectCode` 존재 여부 / 확인한 프로젝트
- [ ] **임시 로그 제거** (커밋에 남기지 않는다)
- [x] 결과와 무관하게 `taskId6` fallback 은 1급 경로로 구현한다(S2). `number` 가 없으면 기본 템플릿의 결과가 `feature/D-TF-382391` 형태가 됨을 impl-log 에 명시

### 0-2. 현행 확인 (읽기만)

- [ ] `src/main/hooks/ClaudeHookRouter.ts` — `addResolver` 등록 순서 = 우선순위, resolver throw 시 warn 후 다음, 매칭 0 이면 무로그 no-op
- [ ] `src/main/dooray/mention/MentionTerminalSpawner.ts:95-107` — 복제할 시퀀스와 상수(1500 / 3000 / 200)
- [ ] `src/main/claude/claudeDirSetup.ts` — `preApproveTrust(dir, opts?)` / `writeHookSettings(dir, hookConfig)` 시그니처와 반환값
- [x] `src/main/git/GitService.ts:32,138-176` — `assertSafeRef`, `createWorktree` 기본 경로 규칙
- [x] `src/main/utils/paths.ts` — `normalizePathForCompare` / `samePath`(A-0 머지본)

---

## [S] shared 순수 모듈

### S1 — `src/shared/types/workspace.ts` (ADR-01)

- [x] 파일 신설. **타입 선언 전용**(런타임 값 export 0 — 상수·함수는 `src/shared/workspace/` 로)
- [x] `export type WorkspaceKey = string` + JSDoc 1줄(`'${projectId}:${taskId}'`)
- [x] `RepoRegistryEntry { id; path; name; defaultBaseBranch?; branchPrefix? }`
- [x] `AgentRunStatus = 'spawning'|'running'|'awaiting-input'|'failed'|'adopted'|'discarded'`
- [x] `AgentRun` — ADR-01 (c) 의 필드 그대로. **수명 주석 필수**: `terminalSessionId`(휘발, reconcile 이 null) / `claudeSessionId`(영속, resume 용)
- [x] `TaskWorkspace` — ADR-01 (b) 그대로. `activeRunId: string | null`
- [x] `TaskSessionLink { cwd: string; claudeSessionId: string; lastUsedAt: number }` — C-3.5 용 스키마 선반영(이번 트랙은 읽기/쓰기 안 함, 주석에 명시)
- [x] `WorkspaceSettings { branchTemplate; defaultBaseBranch; maxConcurrentRuns; autoApproveDefault; transitionDoorayDefault; commentBranchDefault; lastStart? }`
  - [x] 기본값은 타입이 아니라 `src/shared/workspace/defaults.ts` 또는 `WorkspaceStore` 상수로 (타입 파일에 런타임 값 금지) — `src/main/workspace/workspaceState.ts` 의 `DEFAULT_WORKSPACE_SETTINGS` 로 구현
  - [x] `transitionDoorayDefault` 기본 `true`, `commentBranchDefault` 기본 `false`, `maxConcurrentRuns` 기본 `4`, `autoApproveDefault` 기본 `false`, `branchTemplate` 기본 `'feature/{projectCode}-{taskNumber}'` (ADR-06 (e))
- [x] `StartTaskParams { projectId; taskId; repoId?; baseBranch?; branchName?; prompt?; autoApprove?; transitionDooray?; commentBranch?; fetchBeforeCreate?; rememberRepoForProject? }`
  - [x] `fetchBeforeCreate` 는 모달 목업의 "생성 전에 fetch" 토글 근거 — 지금 타입에 넣어 Phase 3 의 shared 타입 breaking change 를 예방
- [x] `StartTaskResult { workspace; run; reused; warnings: string[] }`
- [x] `ResumeRunParams { runId; prompt? }` / `CleanupRunParams { runId; force?; deleteBranch? }`
- [x] `WorkspaceRunUpdatedPayload { workspace; runId; reason: 'created'|'status'|'session'|'removed' }`
- [x] **금지 확인**: `fanOut`, `judge`, `runCount`, `variants` 류 필드 0건 (`grep -i "fanout\|judge" src/shared/types/workspace.ts` → 0)

### S2 — `gitRef.ts` + `branchName.ts` (ADR-02)

- [x] `src/shared/workspace/gitRef.ts` 신설
  - [x] `isSafeGitRef(ref: string): boolean` — 거부 조건 합집합
    - 기존 `assertSafeRef` 규칙: 빈 문자열 / `-` 로 시작 / `..` 포함 / `[;|&$` + 백틱 + `\n\r]` 포함
    - git ref 문법: 공백·제어문자 / `~ ^ : ? * [ \\` 포함 / `//` 연속 / `/` 로 시작하거나 끝남 / `.` 로 끝남 / `.lock` 로 끝남 / `@{` 포함 / 이름이 `@` 하나
  - [x] JSDoc 1~2줄: "커맨드 인젝션 방지 + git ref 문법의 합집합. `GitService.assertSafeRef` 와 `branchName` 생성기가 공유하는 단일 규칙"
- [x] `src/main/git/GitService.ts` 수정 — `assertSafeRef` 본문을 `if (!isSafeGitRef(ref)) throw new Error(\`유효하지 않은 git 참조: ${ref}\`)` 로 교체
  - [x] **throw 메시지 문자열 동일 유지** / 호출 지점 무변경 / 함수 시그니처 무변경
  - [x] 기존 `GitService.test.ts` 무수정 통과 확인(규칙이 합집합이라 기존 거부 케이스는 계속 거부)
- [x] `src/shared/workspace/branchName.ts` 신설
  - [x] `DEFAULT_BRANCH_TEMPLATE = 'feature/{projectCode}-{taskNumber}'`
  - [x] `buildBranchName(input: BranchNameInput): string` — 토큰 `{projectCode}` `{taskNumber}` `{taskId6}` `{subject}` `{prefix}`, 미지 토큰은 빈 문자열
  - [x] `taskNumber` 없음 → `taskId6`(taskId 뒤 6자) 로 자동 대체 / `projectCode` 빈 값 → `'task'`
  - [x] sanitize: 허용 `[A-Za-z0-9._/-]`, 그 외 `-`, 연속 `-` 축약, 세그먼트 앞뒤 `-._` 제거, 빈 세그먼트 삭제, 전체가 비면 `task-{taskId6}`
  - [x] 결과가 `isSafeGitRef` 를 만족하지 않으면 **마지막 방어로** `task-{taskId6}` 반환(그런 입력이 있으면 테스트로 잡히도록 `console.warn` 대신 테스트 케이스 추가)
  - [x] `resolveBranchNameConflict(base, taken): string` — 없으면 base, 있으면 `-2`부터 증가
- [x] `src/shared/workspace/workspaceKey.ts` — `workspaceKey(projectId, taskId): WorkspaceKey` + `parseWorkspaceKey(key)` (`:` 는 두레이 id 에 없음 — 첫 `:` 기준 split)
- [x] `src/shared/workspace/branchName.test.ts`
  - [x] 토큰 4종 치환 각각 1건 + `{prefix}` 1건
  - [x] `taskNumber: undefined` → `taskId6` 사용 확인 (AC4-②)
  - [x] 충돌: `taken=['feature/a']` → `feature/a-2` / `taken=['feature/a','feature/a-2']` → `feature/a-3` / `taken=[]` → `feature/a` (off-by-one 고정, AC4-③)
  - [x] 한글 제목 `'[iOS] 메일 목록 디자인 개선'` → 결과에 빈 세그먼트·연속 `-` 없음
  - [x] `projectCode: ''` → `task` 대체
  - [x] **계약 테스트**: 입력 20종(한글/이모지/공백/`..`/선행 `-`/300자/빈 값/슬래시 다수) 을 순회하며 `expect(isSafeGitRef(buildBranchName(x))).toBe(true)` (AC4-⑤) — 23종으로 구현
- [x] `src/shared/workspace/gitRef.test.ts` — 허용 10종 / 거부 15종(위 조건 각각 1개 이상) — 허용 10 / 거부 24 로 구현

### S3 — `runStateMachine.ts` (ADR-01 (d))

- [x] `src/shared/workspace/runStateMachine.ts` 신설
  - [x] `RunEvent` 7종 / `applyRunEvent(status, event): AgentRunStatus | null` — ADR-01 의 전이표 그대로
  - [x] `isLiveRun(status)` / `isTerminalRun(status)`
  - [x] **throw 금지** — 불법 전이는 `null`
- [x] `src/shared/workspace/runStateMachine.test.ts`
  - [x] `(6 status × 7 event) = 42` 조합 전부를 표 데이터로 검증 (AC3)
  - [x] 시나리오 1: `spawning -(spawn-succeeded)→ running -(stop)→ awaiting-input -(tool-activity)→ running -(adopt)→ adopted`
  - [x] 시나리오 2: terminal 흡수 — `adopted`/`discarded` 에 7 이벤트 전부 넣어도 전부 `null`
  - [x] `failed -(tool-activity)→ running`, `failed -(stop)→ awaiting-input` 이 허용됨(ADR 근거 주석 1줄)

---

## [M] main 서비스

### M1 — `WorkspaceStore` + 마이그레이션 (ADR-03)

- [x] `src/main/workspace/workspaceState.ts` 신설 (순수)
  - [x] `WorkspaceState` 인터페이스 + `DEFAULT_WORKSPACE_SETTINGS` 상수
  - [x] `makeRepoId(absPath): string` — `slug(basename)` + `-` + FNV-1a 32bit hex 8자리(`normalizePathForCompare` 적용 후 해시) — basename 추출은 `path.basename` 대신 platform 인자를 실제로 존중하는 자체 헬퍼 사용(impl-log 결정 사항 참조)
  - [x] `migrateWorkspaceState(raw: unknown, opts: { legacyGitRepoPath?: string }): WorkspaceState`
    - [x] `raw` 가 없거나 형태가 깨졌으면 빈 상태로 시작(throw 금지)
    - [x] `schemaVersion` 없으면 0 으로 보고 1 로 올림
    - [x] 승격 조건: `legacyGitRepoPath` 비어있지 않음 + `repos.length === 0` + 같은 경로 미등록 → `repos[0]` 추가(`name = basename`)
    - [x] **`gitRepoPath` 를 지우지 않는다**(Git 뷰가 계속 사용)
- [x] `src/main/workspace/WorkspaceStore.ts` 신설
  - [x] `WorkspaceStorage { get<T>(key, fallback): T; set(key, value): void }` 인터페이스 export
  - [x] `constructor(storage: WorkspaceStorage, opts?: { legacyGitRepoPath?: string })` — 생성 시 1회 마이그레이션 후 저장
  - [x] 메서드: `getState()` / `listRepos()` / `addRepo(entry)` / `updateRepo(id, patch)` / `removeRepo(id)` / `getSettings()` / `setSettings(patch)` / `setProjectRepo(projectId, repoId)` / `listWorkspaces()` / `getWorkspace(key)` / `saveWorkspace(ws)` / `findRunById(runId)` / `findWorkspaceByWorktree(path)` / `getTaskSessionLink(key)` / `setTaskSessionLink(key, link)`
  - [x] `saveWorkspace` 에 **불변식 검사**: `activeRunId` 가 존재하지 않거나 live 가 아니면 `console.warn('[WorkspaceStore] activeRunId 불일치 workspaceId=… runId=…')` 후 `null` 로 교정 저장 (ADR-03 (e))
  - [x] 쓰기는 항상 전체 상태 read-modify-write. `updatedAt` 갱신은 `saveWorkspace` 안에서
  - [x] `new Store()` 를 **클래스 안에서 만들지 않는다**
- [x] `src/main/workspace/workspaceState.test.ts`
  - [x] `makeRepoId` 결정성(같은 경로 2회 동일) + 대소문자/구분자 차이 흡수(win32 옵션) + 다른 경로 충돌 없음
  - [x] 마이그레이션: 빈 raw → 기본 상태 / 깨진 raw(문자열, 배열) → 기본 상태 / 승격 1건 / **2회 실행 멱등** / 이미 같은 path 있으면 no-op / `repos` 가 이미 있으면 승격 안 함 (AC5)
- [x] `src/main/workspace/WorkspaceStore.test.ts`
  - [x] in-memory storage(`Map` 기반) 주입 — **디스크·electron-store 무접촉**
  - [x] CRUD 각 메서드 1건 이상 + `taskSessionLinks` 기본값 `{}` 확인
  - [x] 불변식 교정 1건(`activeRunId` 가 discarded run 을 가리킴 → null 로 저장 + warn spy)

### M2 — `GitService` 확장 + `isPathInside` (ADR-02/05/06)

- [x] `src/main/utils/paths.ts` 에 `isPathInside(parent, child, opts?): boolean` 추가
  - [x] `normalizePathForCompare` 로 양쪽 정규화 후 `child === parent || child.startsWith(parent + '/')`
  - [x] 형제 경로(`/a/b-foo`)는 false, 동일 경로는 true
  - [x] `paths.test.ts` 에 케이스 추가: 동일/하위/형제/win32 대소문자/후행 슬래시/UNC 1건씩
- [x] `src/main/git/GitService.ts` 확장
  - [x] `deleteBranch(repoPath, branch, opts?: { force?: boolean }): Promise<void>` — `assertSafeRef` 후 `git branch -D|-d -- <branch>`. 실패 메시지는 git stderr 그대로 전달
  - [x] `addToInfoExclude(worktreePath, patterns: string[]): Promise<boolean>` (ADR-06 (d))
    - [x] `git rev-parse --git-common-dir` 로 공용 디렉터리 해석(상대 경로면 worktreePath 기준 resolve)
    - [x] `info/exclude` 읽기 → **정확히 같은 라인이 이미 있으면 skip** → 없으면 sentinel 주석 + 패턴 append → `writeFileAtomic`(A-0)
    - [x] 반환값: 실제로 쓴 경우 true (호출부가 로그에 사용)
  - [x] `fetchRemote(repoPath, remote = 'origin'): Promise<void>` — `git fetch --prune <remote>`. 호출부에서 best-effort 처리
  - [x] **(windows-fix 트랙 위임분)** `createWorktree` 의 `w.path === worktreePath` 경로 비교 2곳을 `samePath()` 로 교체
- [x] `src/main/git/GitService.test.ts` 확장
  - [x] 기존 `vi.mock('fs')` 팩토리에 `readFileSync`/`mkdirSync`/`promises` 등 새로 필요한 멤버 추가(기존 `existsSync` 기본 true 유지) — **기존 테스트 무영향 확인**
  - [x] `deleteBranch`: 정상 argv(`['branch','-D','--','feature/x']`) / 위험 ref(`-x`, `a..b`, `a;rm`) throw
  - [x] `addToInfoExclude`: 파일 없음 → 생성 / 이미 있음 → 재기록 안 함(false) / `--git-common-dir` 가 상대 경로일 때 resolve / 실패 시 throw 하고 호출부가 warning 처리
  - [x] `fetchRemote`: argv 확인

### M3 — `AgentRunSpawner` (ADR-04)

- [ ] `src/main/workspace/AgentRunSpawner.ts` 신설
  - [ ] 파일 상단 주석: 출처(`MentionTerminalSpawner.dispatch()`)와 "타이밍 상수를 바꾸려면 양쪽을 같이 본다"
  - [ ] `SpawnDelays` / `DEFAULT_SPAWN_DELAYS = { bootMs: 1500, readyMs: 3000, submitMs: 200 }`
  - [ ] `constructor(terminals: Pick<TerminalManager,'create'|'input'|'setName'>, delays = DEFAULT_SPAWN_DELAYS, sleep = defaultSleep)`
  - [ ] `spawn(req: AgentSpawnRequest): Promise<{ terminalSessionId: string }>`
    1. `terminals.create({ cwd })` → `setName(tabName.slice(0, 60))`
    2. `sleep(bootMs)`
    3. `input(id, claudeCommand)` — `claude` + (`--resume <sid>` if resumeSessionId) + (`--dangerously-skip-permissions` **if autoApprove only**) + `\r`
    4. `prompt` 가 빈 문자열이면 **여기서 종료**(ready 대기·타이핑 없음)
    5. `sleep(readyMs)` → `input(id, oneLine)` → `sleep(submitMs)` → `input(id, '\r')`
  - [ ] `buildOneLine(prompt, promptPath?)` 를 **export 순수 함수**로: 개행→공백 접기, 2000자 초과 시 자르고 `` (전체 프롬프트: <path>) `` 꼬리 추가
  - [ ] `MENTION_TERMINAL_OPENED` 등 렌더러 push 를 **하지 않는다**
- [ ] `src/main/workspace/AgentRunSpawner.test.ts` (fake sleep 주입 — 호출 인자 기록)
  - [ ] 기본: 호출 순서 `create → setName → sleep(boot) → input('claude\r') → sleep(ready) → input(prompt) → sleep(submit) → input('\r')` (AC6-①)
  - [ ] `autoApprove: false`(기본) → argv 에 `--dangerously-skip-permissions` **없음** / `true` → 있음 (AC6-②)
  - [ ] `resumeSessionId` → `claude --resume <sid>\r` (AC6-③)
  - [ ] `prompt: ''` → `input` 은 1회(claude 실행)뿐, `sleep(readyMs)` 미호출 (AC6-④)
  - [ ] `buildOneLine`: 개행 접기 / 2000자 컷 + 꼬리 / 빈 프롬프트 처리
  - [ ] `DEFAULT_SPAWN_DELAYS` 값 3개를 숫자로 고정(멘션 상수와의 드리프트 감지, ADR-04)

### M4 — `WorkspaceService.startTask` (ADR-06)

- [ ] `src/main/workspace/WorkspaceService.ts` 신설. 의존은 **전부 생성자 주입**
  ```ts
  new WorkspaceService({
    store, git, tasks, spawner, terminals,
    getHookConfig: () => hookServer.getPort() ? { port, secret } : null,   // 반드시 thunk (ADR-05 (d))
    getWorkspaceRoot: () => agentWorkspace.getRoot(),                       // 프롬프트 파일 위치
    getAgentRoot: () => agentWorkspace.getAgentRoot(),                      // 경로 충돌 방어
    claudeDir: { preApproveTrust, writeHookSettings },                      // 테스트 대체용 seam
    now: () => Date.now(), newRunId: () => randomUUID()
  })
  ```
- [ ] `WorkspaceError extends Error { code: WorkspaceErrorCode }` — `REPO_NOT_FOUND | NOT_A_REPO | CONCURRENCY_LIMIT | PATH_INSIDE_AGENT_ROOT | RUN_NOT_FOUND | DIRTY_WORKTREE | ADOPTED_BRANCH_GUARD`. **message 는 그대로 사용자에게 보여줄 한국어 문장**
- [ ] `startTask(params: StartTaskParams): Promise<StartTaskResult>` 단계 순서
  - [ ] ① repo 결정: `params.repoId` → `projectRepoMap[projectId]` → repos 가 1개면 그것 → 아니면 `REPO_NOT_FOUND` throw
  - [ ] ② `rememberRepoForProject` 면 `setProjectRepo` 저장
  - [ ] ③ 멱등: 기존 워크스페이스의 `activeRunId` 가 live 면 즉시 `{ reused: true }` 반환(부수효과 0)
  - [ ] ④ 동시 실행 상한: 전체 live run 수 ≥ `settings.maxConcurrentRuns` → `CONCURRENCY_LIMIT` throw
  - [ ] ⑤ (옵션) `fetchBeforeCreate` → `git.fetchRemote` (실패 = warning)
  - [ ] ⑥ `tasks.getTaskDetail(projectId, taskId)` → `subject`/`number` 확보. `projectCode` 가 없으면 `tasks.getProjectInfo(projectId).code` 로 보강(실패 = 빈 값 → `'task'` 폴백)
  - [ ] ⑦ 브랜치명: `params.branchName` 이 있으면 `isSafeGitRef` 검증 후 사용, 없으면 `buildBranchName` → `resolveBranchNameConflict(base, 로컬 브랜치 ∪ 워크트리 브랜치)`
  - [ ] ⑧ baseBranch: `params.baseBranch` → `repo.defaultBaseBranch` → `settings.defaultBaseBranch` → `undefined`(= `HEAD`)
  - [ ] ⑨ `git.createWorktree({ repoPath, branch, newBranch: true, baseBranch })` — **`path` 를 넘기지 않는다**(ADR-06 (c))
  - [ ] ⑩ 생성된 `worktreePath` 가 `isPathInside(getAgentRoot(), worktreePath)` 이거나 접두사 관계면 `PATH_INSIDE_AGENT_ROOT` throw (ADR-05 (a)) — **워크트리 생성 전에 예상 경로로 먼저 검사할 수 있으면 그쪽이 낫다**
  - [ ] ⑪ `claudeDir.preApproveTrust(worktreePath)` + `claudeDir.writeHookSettings(worktreePath, getHookConfig())` — 반환값을 로그에 남긴다(실패 = warning)
  - [ ] ⑫ `git.addToInfoExclude(worktreePath, ['.claude/settings.local.json'])` (실패 = warning)
  - [ ] ⑬ 프롬프트 파일: `prompt` 가 비어있지 않으면 `<workspaceRoot>/workspace/{runId}/prompt.md` 에 저장(`mkdirSync(recursive)`)
  - [ ] ⑭ run 을 `spawning` 으로 저장 + `activeRunId` 설정 + `reason:'created'` push
  - [ ] ⑮ `spawner.spawn(...)` → 성공 시 `spawn-succeeded`(→running) + `terminalSessionId` 저장 / 실패 시 `spawn-failed`(→failed) + `error` 저장, **워크트리 삭제 금지**
  - [ ] ⑯ (옵션) 두레이 상태 전환: `tasks.getProjectWorkflows(projectId)` 에서 `class === 'working'` 첫 항목 → `updateTaskStatus`. 없거나 실패 = warning
  - [ ] ⑰ (옵션) 댓글: `` [Clauday] `<branch>` 에서 작업을 시작했습니다. `` (실패 = warning)
- [ ] 모든 warning 은 `console.warn('[Workspace] … taskId=… runId=…')` 동반(전역 규약 §5)
- [ ] `src/main/workspace/WorkspaceService.test.ts` — git/tasks/spawner/claudeDir 전부 fake
  - [ ] 정상 경로 호출 순서 검증(AC7-①)
  - [ ] 멱등: 2회 호출 → `createWorktree` 1회, 2번째 `reused: true` (AC7-②)
  - [ ] 두레이 전환 실패 / 댓글 실패 / fetch 실패 / exclude 실패 → 각각 `warnings` 1건 + startTask 는 성공 (AC7-③)
  - [ ] spawn reject → run.status `failed`, `removeWorktree` **미호출**, `error` 메시지 저장 (AC7-④)
  - [ ] live run 4개 상태에서 5번째 → `CONCURRENCY_LIMIT` (AC7-⑤)
  - [ ] agentRoot 안에 떨어지는 worktreePath → `PATH_INSIDE_AGENT_ROOT` (AC7-⑥)
  - [ ] repo 결정 3분기(param / projectRepoMap / 단일 repo) + 미결정 throw
  - [ ] `getHookConfig` 가 null 을 돌려주는 시점(hook 서버 미기동)에도 startTask 는 성공하고 warning 1건

### M5 — workspace hook 핸들러 + 라우터 등록 (ADR-05)

- [ ] `src/main/workspace/WorkspaceHookHandler.ts` 신설
  - [ ] `export const WORKSPACE_HOOK_KIND = 'workspace-run'`
  - [ ] `resolve(cwd): HookRoute | null` — 활성 run 만 순회 → `isPathInside(run.worktreePath, cwd)` → **worktreePath 가 가장 긴 후보** 채택 → `{ kind, id: runId, meta: { workspaceId, worktreePath } }`
  - [ ] `handle(ev, route)` — `stop` / `post_tool_use` 분기 (ADR-05 (c))
    - [ ] `stop`: `transcript_path` basename 에서 `.jsonl` 제거 → `claudeSessionId` / `extractAssistantMessage(ev.raw.last_assistant_message)` → 비면 `readLastAssistantText(transcript_path)` → `lastAssistantText` / `applyRunEvent(status,'stop')`
    - [ ] `post_tool_use`: `applyRunEvent(status,'tool-activity')` 가 null 이면 **아무것도 하지 않음**(쓰기·push 0)
    - [ ] 그 외 event 무시
  - [ ] `extractAssistantMessage` / `readLastAssistantText` 는 `dooray/mention/` 에서 **import**(복제 금지)
- [ ] `src/main/index.ts` 조립부(≈176-195, 기존 `hookRouter.setHandler(MENTION_HOOK_KIND, …)` **바로 뒤**)
  - [ ] `hookRouter.addResolver((cwd) => workspaceHookHandler.resolve(cwd))` — **멘션 뒤에 등록**(순서 = 우선순위)
  - [ ] `hookRouter.setHandler(WORKSPACE_HOOK_KIND, (ev, route) => workspaceHookHandler.handle(ev, route))`
  - [ ] 위 2줄 위에 주석 1줄: "멘션이 1순위 — C-0 의 보존 약속(ADR-v2-workspace-p0-01). 워크트리는 agentRoot 밖이므로 충돌 없음"
- [ ] `src/main/workspace/WorkspaceHookHandler.test.ts`
  - [ ] resolve: 워크트리 정확 일치 / 하위 3단계 / 형제 `<worktree>-2` → null (AC8-②) / 활성 run 없음 → null (AC8-③) / 중첩 워크트리 2개 → 긴 쪽 선택
  - [ ] `stop`: 상태 `running` → `awaiting-input`, `claudeSessionId` 추출, `lastAssistantText` 저장, `reason:'status'` push 1회 (AC8-④)
  - [ ] `stop`: `last_assistant_message` 비어 있고 `transcript_path` 있으면 fallback reader 사용
  - [ ] `post_tool_use`: `awaiting-input` → `running` + push 1회 / `running` 상태에서는 **store.set 0회, push 0회** (AC8-⑤)
  - [ ] terminal 상태(`adopted`) run 에 늦은 `stop` → 변화 0
- [ ] **우선순위 회귀 테스트**(`src/main/workspace/hookPriority.test.ts` 또는 기존 라우터 테스트 확장, AC8-①)
  - [ ] 라우터에 멘션 resolver → workspace resolver 순으로 등록한 실제 조합에서, 멘션 채널 cwd(`<agentRoot>/123/tasks`)가 **mention 핸들러**로 간다
  - [ ] 워크트리 cwd 는 workspace 핸들러로 간다
  - [ ] 둘 다 아닌 cwd → 아무 핸들러도 호출 안 됨, warn 0

### M6 — resume / adopt / cleanup / reconcile + 터미널 exit 구독 (ADR-01/06)

- [ ] `resumeRun({ runId, prompt? })`
  - [ ] run/워크스페이스 조회 실패 → `RUN_NOT_FOUND`
  - [ ] 워크트리 존재 확인(없으면 `discard` 처리 후 throw)
  - [ ] **`writeHookSettings(worktreePath, getHookConfig())` 재실행** — port/secret 은 부팅마다 바뀐다 (AC9)
  - [ ] `preApproveTrust` 도 재호출(멱등)
  - [ ] `spawner.spawn({ cwd, tabName, prompt: prompt ?? '', autoApprove: run.autoApprove, resumeSessionId: run.claudeSessionId })`
  - [ ] `applyRunEvent(status,'resume')` → `running`, `terminalSessionId` 갱신, push
- [ ] `adoptRun(runId)` — `applyRunEvent(…,'adopt')`, `workspace.status = 'adopted'`, `endedAt`, `activeRunId = null`, push. **git 조작 없음**
- [ ] `cleanupRun({ runId, force, deleteBranch })`
  - [ ] `git.getWorktreeStatus` 로 dirty 판정 → dirty 인데 `force` 아니면 `DIRTY_WORKTREE` throw
  - [ ] `git.removeWorktree({ repoPath, worktreePath, force })`
  - [ ] `deleteBranch` 요청이어도 run.status 가 `adopted` 면 **브랜치 삭제 금지** → warning (`ADOPTED_BRANCH_GUARD` 는 throw 대신 warning 으로 — 워크트리 정리는 계속되어야 한다)
  - [ ] 프롬프트 파일 디렉터리(`<workspaceRoot>/workspace/{runId}/`) 제거(실패 = warning)
  - [ ] 상태: `adopted` 면 유지, 아니면 `applyRunEvent(…,'discard')` → `discarded`. `activeRunId = null`, 워크스페이스에 live run 이 없고 adopted 도 아니면 `archived`
- [ ] `reconcile(): Promise<{ detached: number; discarded: number }>`
  - [ ] 모든 run 의 `terminalSessionId = null`
  - [ ] live run: 워크트리가 없으면 `discard`, 있으면 `claudeSessionId` 유무로 `stop`(→awaiting-input) 또는 `spawn-failed`(→failed) 이벤트 번역 (ADR-01 (d))
  - [ ] 결과를 `console.log('[Workspace] reconcile detached=… discarded=…')` 로 1줄 요약
- [ ] 터미널 종료 구독 — `terminals.addExitListener(payload => …)`(B-1 기존 API)
  - [ ] 해당 `terminalSessionId` 를 가진 run 을 찾아 `terminalSessionId = null` + live 면 `claudeSessionId` 유무로 위와 같은 번역 + push
  - [ ] 구독 해제 함수를 서비스에 보관(`dispose()`)
- [ ] `WorkspaceService.test.ts` 확장 (AC9)
  - [ ] resume 이 `writeHookSettings` 를 **다시** 호출하고 `--resume` 으로 spawn
  - [ ] adopt 후 cleanup(`deleteBranch: true`) → `deleteBranch` 미호출 + warning 1건, 상태는 `adopted` 유지
  - [ ] dirty + `force:false` → throw / `force:true` → `removeWorktree({force:true})`
  - [ ] reconcile: terminalSessionId 전부 null / 워크트리 없는 run → discarded / claudeSessionId 있는 running → awaiting-input / 없는 running → failed
  - [ ] exit listener: 살아 있던 run 이 detached 되고 push 1회

### M7 — `TaskService.getProjectWorkflows()` public 화

- [ ] `src/shared/types/dooray.ts` 에 `DoorayWorkflow { id: string; name: string; class: string }` 추가
- [ ] `TaskService.getProjectWorkflows(projectId): Promise<DoorayWorkflow[]>` — private `loadWorkflows` 의 Map 을 **배열로 변환해 반환**(Map 은 IPC 직렬화 부적합). 캐시는 그대로 재사용, private 메서드 본문 무수정
- [ ] 빈 결과는 `[]` 반환(전역 규약 §2 — null 금지)
- [ ] `src/main/dooray/TaskService.test.ts` 에 케이스 추가: 정상 변환 1건 + API 실패 시 `[]`

---

## [I] IPC 표면 (3+1 규칙)

### I1 — 채널 · 핸들러 · preload

- [ ] `src/shared/types/ipc.ts` **파일 끝**에 섹션 추가 (16 handle + 1 push, ADR-06 (f))
  ```
  // Workspace (v2.0 C-2) — 두레이 태스크 ↔ 워크트리 ↔ 에이전트 run
  WORKSPACE_REPOS_LIST / _ADD / _UPDATE / _REMOVE
  WORKSPACE_SETTINGS_GET / _SET
  WORKSPACE_PROJECT_REPO_SET
  WORKSPACE_LIST / WORKSPACE_GET
  WORKSPACE_START_TASK
  WORKSPACE_RUN_RESUME / _ADOPT / _CLEANUP
  WORKSPACE_RECONCILE
  WORKSPACE_RUN_UPDATED   ← push 전용. handle 등록 금지 주석 필수
  DOORAY_PROJECT_WORKFLOWS
  GIT_DELETE_BRANCH
  ```
  - [ ] 값 문자열은 `workspace:repos:list` 형태(도메인:리소스:액션 규약)
  - [ ] `WORKSPACE_RUN_UPDATED` 에 `/** main → renderer push 전용 */` 주석
- [ ] `src/main/index.ts`
  - [ ] import 추가(≤5줄): `WorkspaceStore`, `WorkspaceService`, `AgentRunSpawner`, `WorkspaceHookHandler`(+`WORKSPACE_HOOK_KIND`)
  - [ ] 조립부: `const workspaceStore = new WorkspaceStore(new Store({ name: 'clauday-workspaces' }), { legacyGitRepoPath: store.get('gitRepoPath', '') as string })`
  - [ ] `workspaceService.addChangeListener(payload => mainWindow?.webContents.send(IPC_CHANNELS.WORKSPACE_RUN_UPDATED, payload))` — **electron 의존은 index.ts 에만**(서비스는 리스너만 제공)
  - [ ] `createWindow()` 안에서 `void workspaceService.reconcile().catch(err => console.error('[Workspace] reconcile 실패:', err))`
  - [ ] 핸들러 블록은 **Git 핸들러 뒤**에 신설. `gitHandle` 과 같은 형태의 `workspaceHandle` 래퍼로 에러 메시지 정규화
  - [ ] `git:delete-branch` 는 기존 `gitHandle` 로 Git 블록에 1줄 추가
  - [ ] `dooray:project:workflows` 는 Dooray 핸들러 블록에 1줄 추가
- [ ] `src/preload/index.ts`
  - [ ] `git` 블록에 `deleteBranch(repoPath, branch, opts?)` 1줄 추가
  - [ ] `dooray` 블록에 `projectWorkflows(projectId)` 1줄 추가
  - [ ] `git` 블록 **뒤에** `workspace: { repos: {…}, settings: {…}, setProjectRepo, list, get, startTask, run: { resume, adopt, cleanup }, reconcile, onRunUpdated }` 신설
  - [ ] `onRunUpdated(cb)` 는 **unsubscribe 함수 반환**(`ipcRenderer.removeListener`) — 기존 `onMentionOpened` 패턴 그대로
  - [ ] 모든 메서드에 shared 타입 명시(`import type { … } from '../shared/types/workspace'`)
- [ ] `test/helpers/mockWindowApi.ts` 에 `workspace` 네임스페이스 + `git.deleteBranch` + `dooray.projectWorkflows` 스텁 추가(renderer 테스트가 깨지지 않게)
- [ ] `src/main/index.test.ts` 갱신 (AC10)
  - [ ] `critical channels` 목록에 `WORKSPACE_START_TASK` 추가
  - [ ] `event-only channels` 목록에 `WORKSPACE_RUN_UPDATED` 추가
  - [ ] 신규 서비스 3종에 대한 `vi.mock`/스텁 필요 여부 확인(`makeStubClass` 에 `addChangeListener`, `reconcile`, `dispose` 추가)
  - [ ] `every registered channel is a known IPC_CHANNELS value` / `unique` 통과 확인

---

## [공통] V — 검증 게이트

- [ ] `npm run typecheck` (node + web) 통과
- [ ] `npm run test:run` 전체 통과. 수정된 기존 테스트는 `index.test.ts` / `mockWindowApi.ts` / `GitService.test.ts`(fs mock 확장) / `TaskService.test.ts`(추가) 4개뿐임을 `git diff --stat` 으로 확인
- [ ] `npm run test:coverage` — 70% 라인 게이트 유지 + `src/main/workspace/**`·`src/shared/workspace/**` 라인 80% 이상 (AC12, 미달 시 사유를 impl-log 에)
- [ ] `grep -rn "fanout\|fanOut\|judgeRuns" src/shared src/main | wc -l` → 0 (AC2)
- [ ] `git diff --stat -- src/renderer/src/components` → 변경 0 (AC15)
- [ ] `git diff -- src/main/dooray/mention/` → **조립부 외 변경 0**(멘션 파일 자체는 무수정. `index.ts` 의 resolver 등록 2줄만)
- [ ] **수동 QA A (AC13)** — 실 저장소 + 실 태스크 1건
  - [ ] `npm run dev` → 임시 스크립트/콘솔에서 `window.api.workspace.startTask({...})` 호출(뷰가 없으므로 devtools 콘솔 사용)
  - [ ] `git -C <repo> worktree list` 에 새 워크트리, `git branch` 에 새 브랜치
  - [ ] 새 터미널에서 claude 가 뜨고 프롬프트가 한 줄로 입력·submit 됨
  - [ ] 응답 후 `clauday-workspaces.json` 의 run 이 `awaiting-input` + `claudeSessionId` 존재
  - [ ] `cat "$(git -C <worktree> rev-parse --git-common-dir)/info/exclude"` 에 우리 2줄이 **정확히 1회**
  - [ ] `git -C <worktree> status` 가 깨끗(= `.claude/settings.local.json` 이 안 보임)
  - [ ] 앱 재시작 → `reconcile` 로그 확인 → `workspace.run.resume` → `claude --resume` 으로 이어짐
  - [ ] `workspace.run.cleanup({ deleteBranch: true })` → 워크트리·브랜치 제거 확인
- [ ] **수동 QA B (AC14)** — 실 두레이 채널에서 `@clauday` 멘션 → 응답 회신 정상 → 재멘션 `--resume` 정상(resolver 2개 등록 후 회귀 없음)

---

## impl-log 규약 (append-only)

`feature/workspace/v2-workspace-p1/impl-log.md` 한 파일에 **작업자가 각자 append**. 남의 섹션 수정·삭제 금지, 항상 파일 맨 아래에 추가.

- [ ] 첫 작성자가 frontmatter 생성
  ```yaml
  ---
  task: v2-workspace-p1
  agent: main-process-engineer
  date: 2026-07-XX
  ---
  ```
- [ ] 섹션 제목은 `## [<agent>] <파트>` 형식 (예: `## [main-process-engineer] shared+store`)
- [ ] 각 섹션 필수 항목
  - `변경한 파일` — 신규/수정/삭제 구분, 파일마다 1~2줄
  - **`DoorayTask.number 검증 결과`** — Step 0-1 의 실측(존재 여부/값/확인 방법). **1차 작성자 필수** (AC11)
  - `테스트/커버리지` — `test:run` 수치, 신규 모듈별 커버리지
  - `발견했으나 고치지 않은 것` — 파일:행 · 재현 조건 · 제안 수정 · 넘길 트랙. 없으면 `없음 — 명시적 기록`
  - `결정 사항 (해야 할 것)` — ADR 과 다르게 구현한 부분은 **반드시** 사유와 함께. ADR 수정 금지(필요하면 새 ADR 로 supersede)
  - `제약 (하지 말 것)` — 후속 트랙(C-3/C-3.5)에 넘길 전제
  - `참조` — ADR 번호, 원본 파일:행
- [ ] C-3 에 넘길 항목을 반드시 남길 것: preload 표면 요약, `warnings[]` 문구 목록, `StartTaskResult` 예시 JSON, 워크트리 실제 경로 형태

## 산출물 체크 (integrator 인계 전)

- [ ] `plan.md` 의 모든 체크박스 `[x]`
- [ ] `impl-log.md` 존재 + 필수 섹션 전부
- [ ] `qa-report.md` — test-engineer 수행 (AC13/AC14 수동 QA 결과 포함)
- [ ] `.agent/wiki/decisions-log.md` 에 ADR 6건 한 줄 요약 추가 (integrator)
- [ ] **`.agent/wiki/domain-workspace.md` 신설** (integrator) — 최소 목차: 핵심 파일 / 상태 전이 다이어그램 / hook resolver 우선순위(멘션 1순위) / 워크트리·프롬프트 파일 위치 규칙 / `info/exclude` 부작용 / 알려진 제약(agentRoot 내부 금지, 타이밍 의존)
- [ ] `.agent/wiki/INDEX.md` 표에 workspace 행 추가 (integrator)
- [ ] `.agent/wiki/domain-electron-ipc.md` §"공용 IPC 도메인 한눈에" 에 `Workspace` 묶음 1줄 추가 (integrator)
- [ ] `.agent/wiki/domain-dooray-bot.md` — resolver 가 2개가 되었음을 hook 흐름 설명에 1줄 반영 (integrator)
- [ ] `ClaudeManual.tsx` / `CHANGELOG.md` — **이번 트랙 대상 아님**(사용자 가시 UI 는 C-3). Phase 4 일괄

## 참조

- `prd.md`(AC1~AC15) · `adr.md`(ADR-v2-workspace-p1-01~06) — 같은 폴더
- 마스터 설계 `~/.claude/plans/toasty-sleeping-simon.md` §C-1 / §C-2 / §C-4 / §검증
- 선행: `feature/workspace/v2-workspace-p0/adr.md`(라우터 계약·claudeDirSetup·결함 보존), `impl-log.md`(thunk 주입 교훈, 보존된 결함 2건)
- 목업: `docs/mockups/v2/start-work-modal.html`(모달 필드), `docs/mockups/v2/workspace-view.html`(run 카드 액션)
- 재사용 대상 코드: `src/main/git/GitService.ts`, `src/main/dooray/mention/MentionTerminalSpawner.ts`(시퀀스 출처), `src/main/claude/claudeDirSetup.ts`, `src/main/hooks/ClaudeHookRouter.ts`, `src/main/dooray/mention/MentionHookHandler.ts`(`extractAssistantMessage`), `src/main/dooray/mention/transcriptReader.ts`(`readLastAssistantText`), `src/main/utils/paths.ts`, `src/main/utils/atomicWrite.ts`
- 테스트 인프라: `test/helpers/mockWindowApi.ts`, `src/main/index.test.ts`(electron 모킹 + 채널 카탈로그), `src/main/git/GitService.test.ts`(execFile mock 패턴), `src/main/claude/claudeDirSetup.test.ts`(tmpdir 패턴)
