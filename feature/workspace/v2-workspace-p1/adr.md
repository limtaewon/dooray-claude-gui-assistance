---
id: ADR-v2-workspace-p1-01
title: 워크스페이스 도메인 모델 — 활성 run 1개를 명시 필드로 두고 상태 전이는 이벤트 기반 순수 함수로
status: proposed
date: 2026-07-30
supersedes: []
domain: workspace
contains:
  - ADR-v2-workspace-p1-01  # 도메인 모델 (합성키 / activeRunId / 이벤트 기반 상태머신)
  - ADR-v2-workspace-p1-02  # 브랜치 이름 생성 + git ref 검증 규칙의 단일 소유
  - ADR-v2-workspace-p1-03  # WorkspaceStore (storage 주입 / 단일 상태 문서 / 결정적 repoId / 승격 마이그레이션)
  - ADR-v2-workspace-p1-04  # AgentRunSpawner (복제-일반화 / delays 주입 / 프롬프트 전달 전략)
  - ADR-v2-workspace-p1-05  # workspace-run hook (resolver 2순위 / 세그먼트 최장 매칭 / 전이 시에만 쓰기)
  - ADR-v2-workspace-p1-06  # startTask = 재진입 가능한 단계 기록 + IPC 표면
---

# ADR-v2-workspace-p1-01 — 워크스페이스 도메인 모델: 활성 run 1개를 명시 필드로 두고, 상태 전이는 이벤트 기반 순수 함수로

## 컨텍스트

fan-out 이 스코프에서 빠지면서(2026-07-30 사용자 결정) 모델의 중심 질문이 바뀌었다. 원래는 "한 태스크에 run 여러 개를 어떻게 비교하나"였는데, 이제는 **"한 태스크에 살아 있는 run 은 정확히 하나임을 어떻게 보장하나"** 다. 그런데 `runs[]` 는 여전히 필요하다 — 실패 후 재시도, 정리된 뒤 다시 시작, resume 이력이 남아야 사용자가 "아까 그 브랜치"를 찾는다.

여기서 세 가지가 동시에 걸린다.

1. **hook 소유권 판정.** C-2 의 resolver 는 cwd(=워크트리 경로) 로 run 을 찾아야 한다. 그런데 재시도 run 은 **같은 워크트리 경로를 공유**할 수 있다. 경로만으로는 run 을 특정할 수 없다.
2. **앱 재시작.** `terminalSessionId` 는 PTY id 라 프로세스가 죽으면 무효다. 반면 `claudeSessionId` 는 `--resume` 을 위해 살아남아야 한다. 두 필드의 수명이 다르다.
3. **상태 전이의 출처가 3곳**이다 — 서비스(시작/재개/채택/정리), hook(Stop/PostToolUse), 부팅 시 reconcile. 세 곳이 각자 `run.status = ...` 를 대입하면 불변식이 어디서 깨졌는지 추적 불가능해진다.

## 결정

**(a) 키 체계 — 합성키 `WorkspaceKey = '${projectId}:${taskId}'`**

`src/shared/types/workspace.ts` 에 타입만 선언한다(런타임 export 0). 키 조립은 `src/shared/workspace/` 의 `workspaceKey(projectId, taskId)` 헬퍼 하나로만 한다.

`taskSessionLinks`(C-3.5 용) 도 **같은 합성키**를 쓴다. 마스터 계획의 문면(`Record<taskId, …>`)에서 벗어나는 유일한 지점이며, 사유는 아래 대안 3 참조.

**(b) `TaskWorkspace.activeRunId: string | null` 을 명시 필드로 둔다**

```ts
export interface TaskWorkspace {
  id: WorkspaceKey
  projectId: string
  taskId: string
  taskNumber?: number
  subject: string
  repoId: string
  status: 'active' | 'adopted' | 'archived'
  /** 최근 run 의 브랜치 — 좌측 목록 배지용 캐시 */
  branch: string
  /** 살아 있는 run 은 최대 1개. 없으면 null (fan-out 제거) */
  activeRunId: string | null
  /** 이력 — 재시도/resume. 최신이 뒤 */
  runs: AgentRun[]
  createdAt: number
  updatedAt: number
}
```

`activeRunId` 를 상태에서 **파생**시키지 않는다. 파생(`runs.find(isLive)`) 은 "살아 있는 run 이 2개인 상태"를 표현할 수 있어버리고, 그 순간 hook 이 어느 run 에 붙을지 비결정적이 된다. 명시 필드는 `WorkspaceStore` 의 쓰기 경로 한 곳에서 불변식(`activeRunId 가 가리키는 run 은 존재하고 live 상태`)을 검사할 수 있게 한다.

**(c) `AgentRun` 의 필드 수명을 주석으로 못 박는다**

```ts
export type AgentRunStatus =
  | 'spawning' | 'running' | 'awaiting-input'   // live
  | 'failed'                                     // live 아님, resume 가능
  | 'adopted' | 'discarded'                      // terminal

export interface AgentRun {
  runId: string
  workspaceId: WorkspaceKey
  repoId: string
  branch: string
  baseBranch: string
  worktreePath: string
  status: AgentRunStatus
  /** 자동 타이핑한 프롬프트 원본. 빈 문자열이면 "터미널에서 직접 지시" 모드 */
  prompt: string
  /** 프롬프트 원본 파일(워크트리 밖). 빈 프롬프트면 없음 */
  promptPath?: string
  autoApprove: boolean
  /** 현재 앱 프로세스에서만 유효 — 부팅 시 reconcile 이 null 로 만든다 (휘발) */
  terminalSessionId: string | null
  /** Stop hook 의 transcript_path 에서 추출. --resume 용으로 영속 */
  claudeSessionId?: string
  /** Stop 시점의 마지막 assistant 텍스트 (카드 미리보기) */
  lastAssistantText?: string
  startedAt: number
  endedAt?: number
  /** 사용자에게 보여줄 실패 사유 */
  error?: string
}
```

**`terminalSessionId === null` 이 "분리됨(detached)" 의 유일한 판별자**다. 별도 상태값을 만들지 않는다 — 목업의 `🔌 재연결` 버튼은 status 가 아니라 이 필드로 판단한다.

**(d) 상태 전이는 `src/shared/workspace/runStateMachine.ts` 의 이벤트 기반 순수 함수**

```ts
export type RunEvent =
  | 'spawn-succeeded' | 'spawn-failed'
  | 'tool-activity'   // PostToolUse hook
  | 'stop'            // Stop hook
  | 'resume' | 'adopt' | 'discard'

/** 전이 결과. null = 이 이벤트는 현재 상태에서 무시한다 (에러 아님) */
export function applyRunEvent(status: AgentRunStatus, event: RunEvent): AgentRunStatus | null
export function isLiveRun(status: AgentRunStatus): boolean      // spawning|running|awaiting-input
export function isTerminalRun(status: AgentRunStatus): boolean  // adopted|discarded
```

전이표 (`—` = null, 무시):

| from \ event | spawn-succeeded | spawn-failed | tool-activity | stop | resume | adopt | discard |
|---|---|---|---|---|---|---|---|
| spawning | running | failed | running | awaiting-input | — | adopted | discarded |
| running | — | — | — | awaiting-input | — | adopted | discarded |
| awaiting-input | — | — | running | — | running | adopted | discarded |
| failed | — | — | running | awaiting-input | running | adopted | discarded |
| adopted | — | — | — | — | — | — | — |
| discarded | — | — | — | — | — | — | — |

세 가지 규칙이 이 표에 들어 있다.
- **terminal 상태는 모든 이벤트를 흡수한다.** 채택 뒤에 늦게 도착한 Stop hook 이 run 을 되살리지 않는다. `adopted` 는 `discard` 로도 바뀌지 않는다 — 워크트리를 정리해도 "채택됨"이라는 사실은 남아야 하고(목업이 `✓ 채택` 과 `🗑 휴지통 정리` 를 따로 두었다), 워크트리 제거는 status 가 아니라 `endedAt`/파일시스템이 표현한다.
- **`failed` 는 죽은 상태가 아니다.** hook 이 도착했다는 것은 claude 가 살아 있다는 증거이므로 `failed + tool-activity/stop` 을 live 로 되돌린다. spawn "실패"의 대부분은 타이핑 타이밍 실패이지 프로세스 실패가 아니다.
- **무시는 예외가 아니다.** hook 은 순서가 뒤바뀌거나 늦게 올 수 있다. `applyRunEvent` 는 throw 하지 않고 null 을 돌려주며, 호출부는 null 이면 아무것도 쓰지 않는다.

앱 재시작(detach) 은 별도 이벤트가 아니다. `reconcile` 이 `claudeSessionId` 유무를 보고 `stop`(resume 가능) 또는 `spawn-failed`(세션 없음) 이벤트로 **번역**한다 — 상태머신이 부수 정보를 알 필요가 없게 유지한다.

## 대안과 기각 이유

1. **`activeRunId` 없이 `runs.find(r => isLive(r.status))` 로 파생** — *기각*: "live 가 2개"인 표현 불가능한 상태를 표현 가능하게 만든다. 그 상태가 되는 순간 hook 라우팅이 비결정적이 되고(같은 worktreePath 를 가진 재시도 run 2개), 재현이 어려운 버그가 된다. 명시 필드는 불변식 검사 지점을 1개로 만든다.
2. **run 을 workspace 밖 top-level `Record<runId, AgentRun>` 으로 정규화** — *기각*: 원자적 갱신 단위가 2개가 되어 "run 은 썼는데 workspace 는 못 쓴" 반쪽 상태가 가능해진다. 규모가 수십 건이라 조회 성능 이점도 없다. 워크스페이스 1개 = 문서 1개가 electron-store 의 동기 read-modify-write 와도 맞는다.
3. **`taskSessionLinks` 를 마스터 문면대로 `Record<taskId, …>` 로** — *기각*: 같은 스토어 안에 키 체계가 2개가 되고, C-3.5 드로어가 "이 태스크에 워크스페이스가 있나"를 물을 때마다 키 변환이 필요하다. 드로어의 카드도 `DoorayTask`(항상 `projectId` 보유) 에서 나오므로 합성키를 못 만들 이유가 없다. **마스터에서 의도적으로 벗어나는 유일한 스키마 결정**이며 여기 기록한다.
4. **상태 전이를 `canTransition(from, to)` 목표 상태 기반으로** — *기각*: 호출부가 목표 상태를 계산해야 한다. hook 핸들러가 "PostToolUse 를 받았으니 목표는 running… 단 현재가 awaiting-input 일 때만" 같은 판단을 하게 되고, 그 판단이 서비스·hook·reconcile 3곳에 흩어진다. 이벤트 기반은 호출부가 "무슨 일이 일어났는가"만 말하면 된다.
5. **불법 전이 시 throw** — *기각*: hook 경로에서 throw 하면 `ClaudeHookRouter` 를 거쳐 `HookServer` 의 catch 에 잡혀 `[HookServer] handler 에러:` 로그가 쌓인다. 늦게 온 Stop 은 에러가 아니라 정상적인 레이스다. 무시 + (필요 시) debug 로그가 맞다.
6. **`detached` 상태를 상태머신에 추가** — *기각*: 상태 하나가 늘면 전이표가 7×7 로 커지는데, 정작 구분에 쓰이는 정보는 `terminalSessionId === null` 이라는 이미 있는 사실뿐이다. UI 액션(재연결)도 그 필드로 결정된다.

## 결과 (Consequences)

### 긍정
- hook resolver 가 "worktreePath → workspace → activeRunId" 2홉으로 항상 유일한 run 에 도달한다. 재시도 run 이 경로를 공유해도 모호성이 없다.
- 전이표가 문서이자 테스트다(AC3 이 전 조합을 검증). C-3 이 UI 버튼을 만들 때 "이 버튼이 지금 눌릴 수 있나"를 `applyRunEvent(status, ev) !== null` 로 물으면 된다.
- renderer 가 `runStateMachine` 을 직접 import 하므로 상태 뱃지/버튼 활성화에 IPC 왕복이 없다.

### 부정 / 트레이드오프
- `activeRunId` 와 `runs[].status` 의 정합을 사람이 지켜야 한다(스토어 쓰기 경로에 불변식 검사를 넣지만, 검사는 방어일 뿐 강제는 아니다).
- `adopted` 가 `discard` 를 흡수하는 규칙은 직관과 어긋날 수 있다("정리했는데 왜 아직 adopted?"). 목업의 두 버튼 의미를 아는 사람에게만 자연스럽다 — C-3 의 툴팁으로 보완 필요.
- `AgentRun` 이 12필드로 크다. 하지만 대부분 선택 필드이고 수명 주석이 붙어 있다.

### 모니터링
- `WorkspaceStore` 불변식 검사가 `console.warn` 을 찍으면 = 전이 경로 어딘가가 상태머신을 우회했다는 신호. 그 로그가 0인지 QA(AC13)에서 확인.
- C-3 착수 시 `runs[]` 가 무한히 자라는지 확인(정리 정책은 이번 스코프 밖 — 워크스페이스당 run 이 10개를 넘으면 그때 잘라내기 논의).

---

# ADR-v2-workspace-p1-02 — 브랜치 이름 생성은 shared 순수 모듈, git ref 검증 규칙은 `shared/workspace/gitRef.ts` 가 단독 소유

## 컨텍스트

브랜치 이름은 세 곳이 알아야 한다.

- **main** — `startTask` 가 실제로 만들 이름
- **renderer** — 모달의 실시간 미리보기와 `✓ 사용 가능` 표시 (목업 `start-work-modal.html`)
- **git** — 최종적으로 `git worktree add -b <branch>` 가 받아들여야 하는 이름

그런데 검증 규칙은 지금 `GitService.ts:32` 의 비export `assertSafeRef` 하나뿐이고, 이건 **커맨드 인젝션 방지**가 목적이라(`-` 로 시작 / `..` 포함 / `;|&$\`\n\r`) git 자체의 ref 문법(공백, `~^:?*[`, 후행 `.lock`, 연속 `//`, `@{`, 끝의 `.` 또는 `/`)은 검사하지 않는다. 생성기가 이 두 규칙을 모두 만족시키지 못하면 실패가 **워크트리 생성 시점**(= 사용자가 [작업 시작] 을 누른 뒤)에 터진다.

또 하나. 두레이 태스크 제목은 대부분 한국어다(`[iOS] 메일 목록 디자인 개선`). `{subject}` 토큰을 그대로 넣으면 UTF-8 브랜치명이 되어 git 은 받아들이지만 CI/스크립트/셸 히스토리에서 문제가 된다.

## 결정

**(a) `src/shared/workspace/gitRef.ts` 가 검증 규칙의 단일 소유자가 된다**

```ts
/** git ref 로 안전한 이름인지. 커맨드 인젝션 방지 규칙 + git ref 문법 규칙의 합집합. */
export function isSafeGitRef(ref: string): boolean
```

`GitService.assertSafeRef` 는 **얇은 래퍼로 남는다** — 조건식만 `isSafeGitRef` 호출로 바뀌고, throw 메시지(`유효하지 않은 git 참조: ${ref}`)와 호출 지점은 그대로다. 기존 거부 케이스는 하나도 통과되지 않아야 하며(규칙은 합집합, 즉 더 엄격해질 뿐), 기존 `GitService.test.ts` 가 이를 증명한다.

**(b) `src/shared/workspace/branchName.ts` 가 생성 규칙을 소유한다**

```ts
export const DEFAULT_BRANCH_TEMPLATE = 'feature/{projectCode}-{taskNumber}'

export interface BranchNameInput {
  template: string
  projectCode?: string
  taskNumber?: number
  taskId: string
  subject?: string
  prefix?: string           // repo.branchPrefix — 템플릿에 {prefix} 로 노출
}

/** 템플릿 토큰 치환 + sanitize. 항상 isSafeGitRef 를 만족하는 값을 돌려준다. */
export function buildBranchName(input: BranchNameInput): string

/** 이미 쓰이는 이름이면 -2, -3 … 을 붙인다. taken 은 로컬 브랜치 + 워크트리 브랜치 합집합. */
export function resolveBranchNameConflict(base: string, taken: Iterable<string>): string
```

- 토큰: `{projectCode}` `{taskNumber}` `{taskId6}` `{subject}` `{prefix}`. 미지 토큰은 **빈 문자열로 치환**(리터럴로 남기면 `{foo}` 가 ref 에 들어간다).
- `{taskNumber}` 는 값이 없으면 `taskId` 뒤 6자리(`taskId6`)로 **자동 대체**한다. 사용자가 템플릿을 안 고쳐도 동작해야 한다 (마스터 §C-4: "taskId 뒤 6자리 fallback 을 1급 경로로").
- `{projectCode}` 가 비면 `task` 로 대체한다(두레이 프로젝트 캐시가 차갑게 시작할 때 실제로 빈다).
- sanitize: 소문자화하지 않는다(프로젝트 코드 `D-TF` 의 가독성 유지). 허용 문자는 `[A-Za-z0-9._/-]`, 그 외는 `-` 로 접고 연속 `-` 는 1개로, 세그먼트 앞뒤의 `-._` 는 제거. **한글은 전부 탈락**하므로 `{subject}` 만으로는 빈 세그먼트가 될 수 있다 → 빈 세그먼트는 삭제하고, 결과 전체가 비면 `task-{taskId6}` 로 폴백.
- 충돌 suffix 는 `-2` 부터 (`-1` 은 쓰지 않는다).

**(c) 계약 테스트로 두 모듈을 묶는다**

`branchName.test.ts` 가 생성 결과 20종 이상(한글 제목, 이모지, 공백, `..`, 선행 `-`, 매우 긴 제목, 빈 projectCode, number 없음 …)을 `isSafeGitRef` 에 통과시킨다. 생성기와 검증기가 따로 놀면 이 테스트가 깨진다.

## 대안과 기각 이유

1. **`assertSafeRef` 를 GitService 에 남기고 branchName 은 자체 규칙을 복제** — *기각*: 규칙이 2벌이 되고, 드리프트가 나면 실패가 워크트리 생성 시점에야 드러난다. 게다가 renderer 는 `main` 코드를 import 할 수 없어 미리보기의 `✓ 사용 가능` 을 세 번째 복제로 만들게 된다.
2. **검증 규칙을 `main/utils/` 로 옮기고 renderer 는 IPC 로 물어보기** — *기각*: 타이핑 한 글자마다 IPC 왕복. 마스터도 "renderer 가 직접 import(IPC 불필요)"를 명시했다.
3. **`assertSafeRef` 를 export 만 하고 테스트에서 import** — *기각*: 검증 로직이 main 에 남아 renderer 가 여전히 못 쓴다. 계약은 잡히지만 미리보기 문제는 그대로.
4. **`git check-ref-format` 을 실제로 호출해 검증** — *기각*: 미리보기 타이핑마다 프로세스 spawn. 그리고 `check-ref-format` 은 인젝션 규칙(`;`, `$`)을 검사하지 않아 우리 목적에 미달. 정규식 합집합이 정확하고 즉시다.
5. **한글 제목을 로마자 전사(transliteration)** — *기각*: 전사 라이브러리 의존이 늘고, 결과(`meil-mogrog`)가 아무에게도 안 읽힌다. 기본 템플릿이 `{subject}` 를 쓰지 않으므로 실익도 없다.
6. **충돌 suffix 를 `-1` 부터** — *기각*: `feature/D-TF-2619` 다음이 `feature/D-TF-2619-1` 이면 "첫 번째"가 둘(무접미사와 -1)로 보인다. `-2` 는 "두 번째"라는 뜻이 자명하다.

## 결과 (Consequences)

### 긍정
- 브랜치명 실패가 **입력 시점**에 드러난다. 모달이 저장 전에 `✓ 사용 가능` 을 확정할 수 있다.
- `GitService` 의 보안 검증이 약해지지 않는다(합집합이므로 더 엄격). 기존 테스트가 그대로 증인이 된다.
- 템플릿 문법이 한 곳에 문서화되어 C-3 의 설정 화면(라이브 미리보기)이 같은 함수를 쓴다.

### 부정 / 트레이드오프
- `GitService.ts` 를 이번 트랙에서 건드린다(조건식 1줄 + import 1줄). 무동작변경이지만 diff 는 생긴다.
- `shared/workspace/` 라는 새 디렉터리가 생긴다(`shared/` 는 지금까지 `types/`·`utils/` 만 있었다). 도메인 로직을 shared 에 두는 첫 사례 — 순수 함수 + 플랫폼 API 미사용을 조건으로 허용한다.
- 한글 제목이 `{subject}` 에서 통째로 사라지는 것은 사용자에게 놀라움일 수 있다. C-3 미리보기가 결과를 그대로 보여주므로 즉시 인지된다.

### 모니터링
- 계약 테스트(생성 20종 → `isSafeGitRef`)가 깨지면 = 생성기/검증기 드리프트. 이 테스트를 지우거나 skip 하지 말 것.
- QA(AC13) 에서 브랜치명이 `feature/D-TF-2619` 형태로 나오는지, `number` 가 없어 `taskId6` 로 떨어졌는지 impl-log 에 실제 값 기록.

---

# ADR-v2-workspace-p1-03 — `WorkspaceStore`: storage 생성자 주입 + 단일 상태 문서 + 결정적 repoId + 호출자가 넘기는 승격 마이그레이션

## 컨텍스트

영속화 대상이 5종이다 — 저장소 레지스트리, 프로젝트↔저장소 매핑, 워크스페이스(+run 이력), `taskSessionLinks`, 워크스페이스 설정(브랜치 템플릿·동시 상한·마지막 시작 옵션). 그리고 마이그레이션 요구가 하나 있다: 기존 `settings.gitRepoPath`(clauday-data 스토어의 키, Git 뷰가 계속 사용 중)를 **레지스트리의 첫 저장소로 자동 승격**해야 한다. 사용자가 설정을 다시 하지 않아도 [작업 시작] 이 바로 눌리게 하는 것이 목적이다.

기존 스토어 클래스들은 대부분 생성자 안에서 `new Store({name})` 을 직접 만든다(`ChannelSessionStore`, `WatcherService`, …). 그래서 그 클래스들의 테스트는 실제 디스크를 건드리거나 `electron-store` 를 vi.mock 해야 한다. 반면 `WikiStorageService` 는 `ContainerStore` 인터페이스를 **생성자 주입**받는 선례가 있다.

## 결정

**(a) storage 주입 — 스토어 생성은 `index.ts` 의 책임**

```ts
export interface WorkspaceStorage {
  get<T>(key: string, fallback: T): T
  set(key: string, value: unknown): void
}

export class WorkspaceStore {
  constructor(private storage: WorkspaceStorage) {}
}
```

`index.ts` 가 `new WorkspaceStore(new Store({ name: 'clauday-workspaces' }))` 로 조립한다. 테스트는 `Map` 기반 in-memory 구현을 주입하고 **디스크에 절대 접근하지 않는다**.

**(b) 단일 상태 문서**

스토어의 진실은 키 하나(`state`) 아래의 문서 1개다.

```ts
interface WorkspaceState {
  schemaVersion: number          // 현재 1
  repos: RepoRegistryEntry[]
  projectRepoMap: Record<string, string>          // projectId → repoId
  workspaces: Record<WorkspaceKey, TaskWorkspace>
  taskSessionLinks: Record<WorkspaceKey, TaskSessionLink>   // C-3.5 스키마 선반영
  settings: WorkspaceSettings
}
```

읽기는 전체 로드, 쓰기는 read-modify-write 후 전체 저장(`ChannelSessionStore` 와 같은 패턴). 규모가 수십 KB 라 문제되지 않고, **부분 갱신으로 인한 불일치가 원천 차단**된다.

**(c) 결정적 `repoId`**

```ts
export function makeRepoId(absPath: string): string   // `${slug(basename)}-${fnv1a8(normalizePathForCompare(absPath))}`
```

`randomUUID` 를 쓰지 않는다. 결정적 id 는 (1) 같은 경로를 두 번 등록해도 중복 항목이 안 생기고 (2) 마이그레이션이 몇 번 돌아도 멱등이며 (3) 테스트가 픽스처 id 를 그대로 쓸 수 있다. 대소문자/구분자 차이는 `normalizePathForCompare`(A-0, 이미 머지됨)로 흡수한다.

**(d) 마이그레이션은 순수 함수 + 값 주입**

```ts
export function migrateWorkspaceState(raw: unknown, opts: { legacyGitRepoPath?: string }): WorkspaceState
```

`WorkspaceStore` 는 다른 스토어(`clauday-data`)를 **알지 않는다.** `index.ts` 가 `store.get('gitRepoPath')` 를 읽어 넘긴다. 승격 조건: `legacyGitRepoPath` 가 비어 있지 않고, `repos` 가 비어 있고, 같은 경로가 아직 없을 때만 1건 추가(`name = basename`). 승격 후에도 **`gitRepoPath` 키는 지우지 않는다** — Git 뷰(`BranchWorkspace`)가 계속 읽는다.

`schemaVersion` 은 지금 필요 없어 보여도 넣는다. C-3/C-3.5 가 `taskSessionLinks` 를 실제로 쓰기 시작하면 형태가 바뀔 여지가 있고, 그때 버전 필드가 없으면 형태 추론으로 마이그레이션하게 된다.

**(e) 불변식 검사는 쓰기 경로에서**

`saveWorkspace()` 는 `activeRunId` 가 (null 이거나) 존재하는 live run 을 가리키는지 확인하고, 어긋나면 `console.warn('[WorkspaceStore] activeRunId 불일치 workspaceId=… runId=…')` 후 **null 로 교정**해서 저장한다. throw 하지 않는다 — 사용자의 작업 시작을 막을 만한 사유가 아니고, 로그가 남으면 원인 추적이 가능하다(전역 규약 §4/§5).

## 대안과 기각 이유

1. **`new Store()` 를 클래스 내부에서 생성(기존 다수 선례)** — *기각*: 이 트랙의 테스트 밀도(스토어 위에 서비스·hook·reconcile 전부가 올라감)에서 디스크 의존은 치명적이다. `WikiStorageService` 선례가 이미 있고 마스터도 "storage 생성자 주입 — WikiStorageService 선례"를 명시했다.
2. **키를 5개로 쪼개기(`repos`, `workspaces`, …)** — *기각*: electron-store 는 키 단위 원자성만 제공한다. `startTask` 한 번이 workspaces + settings.lastStart 를 같이 바꾸는데, 중간에 죽으면 반쪽이 남는다. 단일 문서면 그럴 일이 없다.
3. **`repoId = randomUUID()`** — *기각*: 같은 저장소를 다시 추가하면 id 가 다른 중복 항목이 생기고, `projectRepoMap` 이 죽은 id 를 가리키게 된다. 경로 기반 결정적 id 는 그 자체가 중복 방지 키다.
4. **`WorkspaceStore` 가 `clauday-data` 스토어를 직접 읽어 승격** — *기각*: 스토어가 다른 스토어를 아는 순간 테스트가 두 개의 디스크 자원을 스텁해야 하고, "설정의 소유자"가 흐려진다. 값 주입은 마이그레이션을 순수 함수로 유지해 단독 테스트가 가능하게 한다.
5. **승격하면서 `gitRepoPath` 키 삭제** — *기각*: Git 뷰가 그 키로 저장소를 복원한다(`BranchWorkspace.tsx:185`). 지우면 기존 사용자의 Git 뷰가 빈 화면이 된다. 두 표현이 잠시 공존하는 편이 안전하다(통합은 C-3 의 설정 화면에서).
6. **불변식 위반 시 throw** — *기각*: 위반의 원인은 대개 우리 코드의 순서 실수인데, 그걸 사용자의 [작업 시작] 실패로 갚게 된다. 교정 + warn 이 사용자 피해가 없으면서 신호는 남긴다.

## 결과 (Consequences)

### 긍정
- 스토어·서비스·hook 테스트 전부가 in-memory 로 돌아 빠르고 병렬 안전하다.
- 기존 사용자가 앱을 켜면 저장소 레지스트리에 자기 repo 가 이미 들어 있다 = 설정 없이 첫 [작업 시작] 가능.
- 상태 문서 하나라 디버깅 시 `clauday-workspaces.json` 만 열면 전부 보인다(QA AC13 이 이걸 사용).

### 부정 / 트레이드오프
- 문서 전체를 매 쓰기마다 직렬화한다. run 이 수백 개로 늘면 비효율 — 지금은 수십 규모라 무시 가능하고, `runs[]` 정리 정책이 필요해지는 시점의 신호로 삼는다.
- `gitRepoPath` 와 `repos[]` 라는 두 표현이 공존한다. C-3 이 정리하기 전까지 "저장소를 Git 뷰에서 바꿨는데 워크스페이스 목록엔 안 뜬다" 같은 혼란 여지가 있다.
- `schemaVersion` 이 당장은 쓰이지 않는 필드다(YAGNI 위반처럼 보임). 마이그레이션 함수의 분기 1줄로 값을 한다고 판단.

### 모니터링
- `[WorkspaceStore] activeRunId 불일치` 경고 발생 여부 = 상태머신 우회 신호.
- 마이그레이션 멱등 테스트(2회 실행 → 항목 1개)가 깨지면 승격 조건이 느슨해진 것.

---

# ADR-v2-workspace-p1-04 — `AgentRunSpawner`: 멘션 스포너를 재배선하지 않는 "복제 후 일반화", delays 주입, 프롬프트는 한 줄 타이핑 + 워크트리 밖 원본 파일

## 컨텍스트

`MentionTerminalSpawner.dispatch()` 안에는 실전에서 검증된 시퀀스가 있다.

```
create(cwd) → 1.5s → 'claude [--resume sid] [--dangerously-skip-permissions]\r'
            → 3.0s → '<프롬프트 한 줄>' → 200ms → '\r'
```

200ms 를 두고 `\r` 을 **따로** 보내는 이유가 코드 주석에 남아 있다 — claude TUI 는 텍스트와 `\r` 이 한 chunk 로 오면 submit 하지 않는다. 이 종류의 지식은 재발견 비용이 크다.

동시에 이 클래스는 두레이 채널과 강하게 결합돼 있다: `channelId`, `ChannelSessionStore`(busy/재사용/organizationId), `MENTION_TERMINAL_OPENED` push, 탭 이름 `Clauday ▸ {채널명}`. 워크스페이스에는 이 중 어느 것도 맞지 않는다(재사용 대상은 탭이 아니라 run 이고, busy 개념은 상태머신이 대신하며, 탭을 렌더러 목록에 밀어 넣을 필요도 없다).

그리고 워크스페이스 고유 요구 3가지가 있다.
- `autoApprove` **기본 off** — 터미널에서 직접 승인하는 것이 "개입 가능"이라는 이 기능의 본질(멘션은 반대로 자동화가 본질이라 항상 on).
- **프롬프트 빈 값 허용** — 모달에서 비우면 `claude` 만 띄우고 사용자가 직접 지시.
- **delays 주입** — fake timer 로 시퀀스를 검증할 수 있어야 한다(멘션 스포너는 상수 하드코딩이라 테스트가 없다).

## 결정

**(a) `src/main/workspace/AgentRunSpawner.ts` 를 새로 만들고, `MentionTerminalSpawner` 는 손대지 않는다**

시퀀스는 복제하되 채널 결합을 제거한다.

```ts
export interface SpawnDelays { bootMs: number; readyMs: number; submitMs: number }
export const DEFAULT_SPAWN_DELAYS: SpawnDelays = { bootMs: 1500, readyMs: 3000, submitMs: 200 }

export interface AgentSpawnRequest {
  cwd: string                 // 워크트리 경로
  tabName: string             // 예: `#2619 [iOS] 메일 목록…`
  prompt: string              // '' 이면 자동 타이핑 없음
  autoApprove: boolean        // 기본 false — 호출자가 명시
  resumeSessionId?: string
}

export class AgentRunSpawner {
  constructor(
    private terminals: Pick<TerminalManager, 'create' | 'input' | 'setName'>,
    private delays: SpawnDelays = DEFAULT_SPAWN_DELAYS,
    private sleep: (ms: number) => Promise<void> = defaultSleep
  ) {}
  async spawn(req: AgentSpawnRequest): Promise<{ terminalSessionId: string }>
}
```

멘션을 이 클래스 위로 재배선하는 것은 **비목표**다. 멘션 파이프라인에는 자동 E2E 가 없고(있는 것은 C-0 이 만든 hook 핸들러 characterization 뿐), 워크스페이스 경로가 실사용으로 검증되기 전에 두 도메인을 한 구현에 묶으면 회귀가 났을 때 원인 분리가 불가능하다. 통합은 백로그.

대신 **드리프트 방지 장치**를 둔다: `AgentRunSpawner.ts` 상단 주석에 "출처: `MentionTerminalSpawner.dispatch()` (v1.4~). 타이밍 상수를 바꾸려면 양쪽을 같이 본다" 를 명시하고, `DEFAULT_SPAWN_DELAYS` 의 값이 멘션의 상수와 같음을 테스트에 숫자로 고정한다.

**(b) 프롬프트 전달 — 한 줄로 접어 타이핑, 원본은 워크트리 밖 파일**

- 원본 프롬프트는 `<workspaceRoot>/workspace/{runId}/prompt.md` 에 저장한다(`workspaceRoot` 는 `AgentWorkspaceManager.getRoot()` 를 thunk 로 주입 — 사용자 커스텀 루트를 따른다). 워크트리 **안**에 두지 않으므로 diff 오염이 없다.
- 터미널에는 **개행을 공백으로 접은 한 줄**을 타이핑한다(멘션의 `buildOneLiner` 와 같은 방어). 길이가 상한(2000자)을 넘으면 잘라내고 꼬리에 `(전체 프롬프트: <절대경로>)` 를 붙인다.
- 즉 claude 는 **파일을 읽지 않아도 지시를 받는다.** 파일은 기록/복사/필요 시 참조용이다.
- `prompt` 가 빈 문자열이면 파일도 만들지 않고 타이핑도 하지 않는다. `claude` 만 실행.

이 조합의 핵심 이유: `autoApprove` 기본 off 상태에서 **워크트리 밖 파일을 읽게 하면 claude 가 첫 동작부터 권한 승인을 요구**하며 멈춘다. 사용자가 화면을 안 보고 있으면 그대로 방치된다. 지시를 인라인으로 주면 그 정지가 없다.

**(c) 새 PTY 항상 생성. 렌더러 탭 목록에 push 하지 않는다**

워크스페이스 run 의 터미널은 `MENTION_TERMINAL_OPENED` 를 보내지 않는다. C-3 의 `WorkspacePanel` 이 `run.terminalSessionId` 로 직접 attach 한다. 대신 사용자가 터미널을 강제 종료했을 때를 위해 `WorkspaceService` 가 `TerminalManager.addExitListener`(B-1 에서 이미 신설됨)를 구독해 run 을 detach 처리한다.

## 대안과 기각 이유

1. **`MentionTerminalSpawner` 를 상속/일반화해 멘션도 새 클래스 위로 재배선** — *기각*: 멘션 회귀 리스크를 이 트랙이 떠안는다. 멘션의 재사용(HIT/MISS)·busy·organizationId·탭 push 는 워크스페이스에 없는 개념이라 "공통 클래스 + 옵션 플래그" 가 되어 양쪽 다 읽기 어려워진다.
2. **두 스포너의 공통 시퀀스를 `spawnClaudeInTerminal()` 유틸로 추출해 양쪽이 호출** — *기각(이번 트랙)*: 방향은 옳지만 멘션 파일을 수정하게 된다. C-0 이 멘션 주변을 겨우 안정화(characterization 25건)한 직후다. 워크스페이스가 실사용으로 검증된 뒤 백로그로.
3. **프롬프트를 파일로만 주고 `<path> 읽고 진행해` 로 지시(멘션 방식)** — *기각*: 멘션은 `--dangerously-skip-permissions` 가 항상 켜져 있어 성립한다. 워크스페이스는 기본 off 라 워크트리 밖 Read 가 승인 대기를 만든다. 파일을 워크트리 안에 두면 승인은 피하지만 작업 디렉터리를 오염시킨다.
4. **프롬프트를 파일로 워크트리 안(`.clauday/prompt.md`)에 두고 exclude 에 추가** — *기각*: exclude 에 등록할 패턴이 늘고(공용 exclude 오염 확대, ADR-06 참조), 사용자가 워크트리를 열었을 때 정체불명 폴더가 보인다. 마스터도 "프롬프트 파일은 워크트리 밖"을 명시했다.
5. **개행 유지한 채 여러 줄 타이핑** — *기각*: 각 개행이 TUI 의 submit 으로 해석돼 첫 줄만 전송되고 나머지가 프롬프트로 흩어진다. 멘션이 이미 겪고 한 줄 접기로 해결한 문제.
6. **`node-pty` 대신 `-p` 비대화형으로 실행** — *기각*: 사용자 개입(직접 타이핑/승인)이 이 기능의 요구사항이고, `claude -p` 는 2026-06-15 이후 별도 크레딧 정책 대상이다(메모리 `project_claude_p_policy`). TUI 방식이 정책·요구 양쪽에 맞는다.

## 결과 (Consequences)

### 긍정
- 시퀀스가 처음으로 **테스트된다**(fake timer + 주입 sleep). 멘션 쪽에는 없던 안전망이 워크스페이스에 생긴다.
- 멘션 파이프라인 diff 0 = 이번 트랙에서 봇이 깨질 경로가 원천적으로 없다(라우팅 등록 순서 제외, ADR-05).
- 기본 off 승인 정책이 "사용자가 옆에서 개입한다"는 제품 컨셉과 코드가 일치한다.

### 부정 / 트레이드오프
- **타이밍 상수가 두 곳에 존재한다.** 한쪽만 고치면 조용히 갈라진다 — 주석 + 값 고정 테스트로만 방어한다(구조적 방어 아님).
- 긴 프롬프트는 2000자에서 잘린다. 전체는 파일에 있지만 claude 가 자동으로 보지는 않는다.
- 워크스페이스 터미널이 터미널 탭 목록에 안 보인다 → C-3 이전에는 사용자가 GUI 로 그 PTY 에 접근할 수단이 없다(이번 트랙은 main 전용이므로 수용. QA 는 스토어와 로그로 확인).

### 모니터링
- QA(AC13)에서 프롬프트가 통째로 한 줄로 들어가 submit 되는지, 느린 머신에서 유실되는지 확인 → 유실되면 delays 설정화(C-3)를 앞당긴다.
- `AgentRunSpawner` 의 delay 값 고정 테스트가 깨지면 = 멘션과의 드리프트 발생. 그때 유틸 추출(대안 2)을 재검토.

---

# ADR-v2-workspace-p1-05 — workspace-run hook: resolver 는 멘션 **다음** 순서, 경로는 세그먼트 기준 최장 매칭, 소유자는 활성 run, 쓰기는 상태 전이 시에만

## 컨텍스트

C-0 이 만든 `ClaudeHookRouter` 는 "resolver 를 등록 순서대로 호출해 첫 non-null 을 채택"한다. 이제 두 번째 resolver 를 붙인다. 세 가지를 결정해야 한다.

1. **등록 순서.** 멘션이 먼저인가 워크스페이스가 먼저인가. ADR-v2-workspace-p0-01 은 "멘션 resolver 가 먼저 등록되어 우선순위를 갖는다"를 이미 약속했고, 멘션 resolver 에는 알려진 결함이 있다 — `cwd.startsWith(agentRoot)` 만 보므로 **`<agentRoot>` 를 문자열 접두사로 갖는 형제 경로**(예: `~/Clauday-Workspaces/agent-old/…`)를 자기 것이라 주장하고 channelId 로 `'..'` 을 돌려준다(C-0 이 테스트로 고정, 수정 금지).
2. **cwd → run 매칭 방식.** claude 는 워크트리 하위 디렉터리에서 실행될 수 있으므로 정확 일치로는 부족하다. 그렇다고 `startsWith` 를 쓰면 멘션과 같은 종류의 버그를 새로 만든다.
3. **쓰기 빈도.** `PostToolUse` 는 도구 호출마다 온다. 매번 스토어에 쓰고 렌더러에 push 하면 디스크와 IPC 가 요동친다.

## 결정

**(a) 등록 순서: 멘션 → 워크스페이스. 충돌은 라우팅이 아니라 생성 시점에 막는다**

```ts
hookRouter.addResolver((cwd) => mentionHookHandler.resolve(cwd))          // 1순위 (기존)
hookRouter.addResolver((cwd) => workspaceHookHandler.resolve(cwd))        // 2순위 (신규)
hookRouter.setHandler(MENTION_HOOK_KIND, …)                               // 기존
hookRouter.setHandler(WORKSPACE_HOOK_KIND, (ev, route) => workspaceHookHandler.handle(ev, route))
```

`WORKSPACE_HOOK_KIND = 'workspace-run'`.

멘션 우선을 유지하면 이론상 "agentRoot 접두사 아래 만들어진 워크트리"가 멘션에 흡수된다. 이를 **`startTask` 가 워크트리 경로를 검증해 거부**하는 방식으로 막는다(`isPathInside(agentRoot, worktreePath)` 또는 접두사 문자열 관계면 `WorkspaceError('PATH_INSIDE_AGENT_ROOT')`). 라우팅 순서를 뒤집어 해결하지 않는 이유: 순서를 바꾸면 멘션 동작이 "워크스페이스가 먼저 안 집어간 경우에만"이라는 조건부로 바뀌어 C-0 의 보존 약속이 깨진다.

**(b) 매칭: `isPathInside` 세그먼트 판정 + 최장 경로 우선 + 활성 run**

`src/main/utils/paths.ts` 에 `isPathInside(parent, child, opts?)` 를 추가한다(A-0 소유 파일이지만 이미 머지됨. `normalizePathForCompare` 재사용으로 win32 대소문자/구분자 문제까지 흡수).

```ts
/** child 가 parent 와 같거나 그 하위인지. 형제 경로(`/a/b-foo`)는 false. */
export function isPathInside(parent: string, child: string, opts?: { platform?: NodeJS.Platform }): boolean
```

resolver 는 **활성 run 이 있는 워크스페이스만** 훑어 `isPathInside(run.worktreePath, cwd)` 인 후보 중 `worktreePath` 가 가장 긴 것을 고른다(중첩 워크트리 방어). 반환은 `{ kind: 'workspace-run', id: run.runId, meta: { workspaceId, worktreePath } }`. 활성 run 이 없으면 `null` — 라우터 계약상 **로그 없이 무시**된다(정리된 워크트리에서 사용자가 수동으로 claude 를 띄운 경우 등, 정상 상황).

**(c) 핸들러 — 이벤트 번역과 최소 쓰기**

| hook | 하는 일 |
|---|---|
| `stop` | `transcript_path` 의 basename 에서 `.jsonl` 을 떼어 `claudeSessionId` 저장 → `extractAssistantMessage(ev.raw.last_assistant_message)`(없으면 `readLastAssistantText(transcript_path)`) 로 `lastAssistantText` 저장 → `applyRunEvent(status,'stop')` |
| `post_tool_use` | `applyRunEvent(status,'tool-activity')` 만. **전이가 null 이면 아무것도 하지 않는다**(쓰기 0, push 0) |
| 그 외 event | 무시 |

`extractAssistantMessage` / `readLastAssistantText` 는 `dooray/mention/` 의 **named export 순수 함수를 그대로 import** 한다(C-0 impl-log 가 "C-2 가 인스턴스 없이 재사용할 수 있게 했다"고 명시). 복제하지 않는다. 파싱 형태 3종(string / `{content:[…]}` / `{message:{…}}`) 이 이미 25건 테스트로 고정돼 있다.

멘션과 달리 **도구 사용 목록을 버퍼링하지 않는다.** 워크스페이스는 터미널이 그대로 보이므로 요약 메시지를 만들 이유가 없고, 버퍼는 곧 메모리·쓰기 비용이다.

**(d) hookConfig 는 thunk 로 주입한다**

`.claude/settings.local.json` 을 쓸 때 필요한 `{port, secret}` 은 `hookServer.start()` 가 **비동기로 resolve 된 뒤** 정해진다. 서비스 조립 시점에는 아직 null 이다. C-0 이 `getAgentRoot` 에서 겪은 것과 같은 함정이므로, `WorkspaceService` 는 `getHookConfig: () => {port,secret} | null` 을 받는다. 값으로 주입하면 **모든 워크스페이스에서 hook 이 영원히 안 붙는다**(= 진행 상태가 절대 안 바뀜).

## 대안과 기각 이유

1. **워크스페이스 resolver 를 1순위로** — *기각*: C-0 이 "멘션 동작 100% 보존"을 명시적으로 약속했고 그 약속 위에 회귀 테스트가 서 있다. 순서를 바꾸면 멘션의 판정이 조건부가 되어 그 테스트의 의미가 달라진다.
2. **멘션 resolver 의 `startsWith` 버그를 이참에 고치고 순서 자유롭게** — *기각*: ADR-v2-workspace-p0-05 가 결함 보존을 명문화했고, 수정은 "그 코드를 실제로 쓰는 트랙에서 테스트와 함께" 하기로 했다. 이 트랙은 멘션을 쓰지 않는다. 대신 `isPathInside` 라는 올바른 도구를 남겨 그 트랙이 쓸 수 있게 한다.
3. **`cwd.startsWith(worktreePath)` 로 간단히** — *기각*: 멘션과 똑같은 형제 경로 버그를 새로 만든다. `.repo-worktrees/feature-a` 와 `.repo-worktrees/feature-a-2`(충돌 suffix!) 는 실제로 생기는 조합이다. 이 트랙이 `-2` suffix 를 도입하므로 오히려 발생 확률이 높다.
4. **run 이 아니라 워크스페이스를 route.id 로** — *기각*: 핸들러가 다시 활성 run 을 찾아야 하고, 로그에 남는 식별자가 runId 가 아니게 된다. resolver 가 이미 활성 run 을 확인했으므로 그 결과를 그대로 넘기는 게 맞다(전역 규약 §5 식별자).
5. **`PostToolUse` 마다 `lastActivityAt` 갱신** — *기각*: 도구 하나당 디스크 쓰기 1회 + IPC push 1회. "경과 12:34"(목업)는 `startedAt` 으로 계산 가능하므로 필드 자체가 불필요하다.
6. **hook URL 쿼리에 `kind=workspace` 를 심어 resolver 없이 구분** — *기각*: ADR-v2-workspace-p0-01 이 이미 같은 이유로 기각(설치된 settings 파일 마이그레이션 창 + 사용자가 수동으로 띄운 claude 흡수 불가). 여기서 뒤집지 않는다.

## 결과 (Consequences)

### 긍정
- resolver 2줄 + 핸들러 1개로 워크스페이스가 hook 소유자가 된다. dooray-bot 코드 diff 0(조립부 등록 2줄 제외) — C-0 이 설계한 확장점이 의도대로 작동함을 증명.
- `isPathInside` 가 공용 유틸로 남아 멘션 버그 수정 트랙이 그대로 쓸 수 있다.
- 상태 전이가 있을 때만 쓰기 → 도구 100번 호출해도 디스크 쓰기는 최대 2회(running 복귀 + Stop).

### 부정 / 트레이드오프
- agentRoot 접두사 아래 워크트리를 만들 수 없다는 제약이 생긴다(사용자가 저장소를 `~/Clauday-Workspaces/` 안에 둔 경우 실제로 걸릴 수 있다). 에러 메시지에 이유와 해결책(저장소를 다른 위치로)을 명시해야 한다.
- workspace 가 `dooray/mention/` 의 함수를 import 한다 — 도메인 간 의존이 생긴다. 순수 함수라 런타임 결합은 없지만, 언젠가 `src/main/claude/assistantMessage.ts` 로 옮기는 것이 옳다(백로그).
- resolver 가 매 hook 마다 워크스페이스 전체를 훑는다. 수십 개 규모라 무시 가능하지만, `worktreePath → runId` 인덱스가 필요해지는 시점이 올 수 있다.

### 모니터링
- 우선순위 회귀 테스트(멘션 cwd 가 여전히 멘션으로 감)가 이 ADR 의 핵심 감시 장치다. 이 테스트를 지우지 말 것.
- QA(AC14) 실채널 멘션 1회로 실제 확인.
- `[ClaudeHookRouter] 핸들러 미등록 kind=workspace-run` 로그가 뜨면 = `setHandler` 조립 누락.

---

# ADR-v2-workspace-p1-06 — `startTask` 는 롤백하는 트랜잭션이 아니라 **재진입 가능한 단계 기록**이다 + IPC 표면 규약

## 컨텍스트

`startTask` 는 8단계짜리 부수효과 덩어리다: repo 결정 → 멱등 체크 → (옵션) fetch → 태스크 상세 조회 → 브랜치명 결정 → 워크트리 생성 → `.claude` 준비 + `info/exclude` → 프롬프트 파일 → 터미널 spawn → (옵션) 두레이 상태 전환 → (옵션) 두레이 댓글.

각 단계의 실패 성격이 전부 다르다. 워크트리 생성 실패는 치명적이지만, 두레이 상태 전환 실패는 "브랜치는 잘 만들어졌는데 두레이만 안 바뀐" 상태다. 여기서 "실패하면 전부 되돌린다"를 택하면 **사용자가 5초 기다린 끝에 아무것도 안 남는다** — 그런데 그 5초의 결과물(워크트리)은 대체로 멀쩡하고, 사용자는 그 상태에서 이어서 작업할 수 있다.

## 결정

**(a) 되돌리지 않는다. 어디까지 갔는지 기록하고 재진입 가능하게 만든다**

- **치명(throw)**: repo 미결정, 대상이 git 저장소 아님, 워크트리 경로가 agentRoot 내부, 동시 실행 상한 초과, 워크트리 생성 실패. 이때는 워크스페이스/run 을 **저장하지 않는다**(아무 부수효과도 남기지 않은 지점들이다).
- **부분 성공(run 저장 + status)**: 워크트리는 생겼는데 spawn 이 실패 → run 을 `failed` 로 저장하고 **워크트리를 지우지 않는다**. 사용자는 resume 하거나 cleanup 한다.
- **경고(계속 진행)**: fetch 실패 / `info/exclude` 쓰기 실패 / trust·hook settings 실패 / 두레이 상태 전환 실패 / 댓글 실패. 전부 `warnings: string[]` 에 담아 반환하고 `console.warn` 에 taskId 를 남긴다(전역 규약 §4 결과 무시 금지, §5 식별자).

```ts
export interface StartTaskResult {
  workspace: TaskWorkspace
  run: AgentRun
  /** 이미 활성 run 이 있어 새로 만들지 않았다 */
  reused: boolean
  /** best-effort 단계의 실패 — 사용자에게 토스트로 노출(C-3) */
  warnings: string[]
}
```

**(b) 멱등의 정의: "활성 run 이 있으면 그것을 돌려준다"**

같은 `projectId:taskId` 로 다시 호출했을 때 `activeRunId` 가 살아 있으면 **워크트리도 브랜치도 만들지 않고** 기존 run 을 `reused: true` 로 반환한다. 활성 run 이 없으면(실패/정리 후) **새 run 을 append** 한다 — 이때 브랜치명은 다시 계산하고 충돌 suffix 가 붙을 수 있다(이전 브랜치가 남아 있으면 `-2`).

**(c) 워크트리 위치는 `GitService` 의 기본값을 쓴다**

`createWorktree` 에 `path` 를 넘기지 않는다 → `<repo 부모>/.{repoName}-worktrees/{branch-with-dashes}`. 저장소와 같은 볼륨/인접 위치라 IDE·툴체인이 자연스럽게 인식하고, 경로 규칙이 이미 구현·테스트돼 있다. (목업 `workspace-view.html` 의 `~/Clauday-Workspaces/...` 라벨은 목업 플레이스홀더로 간주. `start-work-modal.html` 의 `.ios-dooray-worktrees/` 캡션이 실제 동작이다.)

**(d) `.git/info/exclude` 오염을 최소화한다**

`GitService.addToInfoExclude(worktreePath, patterns)` 는 `git rev-parse --git-common-dir` 로 **공용** 디렉터리를 찾아 쓴다(워크트리의 `.git` 은 파일이고, `info/exclude` 는 워크트리별이 아니라 저장소 공용이다). 따라서 이 쓰기는 메인 저장소와 다른 모든 워크트리에 영향을 준다. 그러므로:

- 패턴은 **`.claude/settings.local.json` 한 줄만** (마스터의 `.claude/` 디렉터리 통째 등록에서 축소). 우리가 만드는 파일이 정확히 그것이고, `.claude/` 를 통째로 가리면 사용자가 의도적으로 두는 `.claude/` 산출물까지 `git status` 에서 사라진다.
- sentinel 주석 `# Clauday (v2.0 워크스페이스) — 자동 추가` 를 앞에 두고, **정확히 같은 라인이 이미 있으면 아무것도 하지 않는다**(멱등).
- 쓰기는 `writeFileAtomic`(A-0) 사용. 실패는 warning 이지 실패가 아니다.

**(e) 두레이 쓰기는 best-effort, 기본값은 상태 전환 ON / 댓글 OFF**

- 상태 전환: `TaskService.getProjectWorkflows(projectId)`(이번에 public 화, `Array<{id,name,class}>` 반환 — Map 은 IPC 직렬화에 부적합) 에서 `class === 'working'` 인 첫 워크플로우로 `updateTaskStatus`. 없으면 warning.
- 댓글: `[Clauday] \`<branch>\` 에서 작업을 시작했습니다.` (자동 발신임을 prefix 로 명시 — 두레이 봇 정책과 동일한 이유).
- 기본값: 전환 ON(워크플로우 갱신은 기대된 동작), 댓글 OFF(공용 태스크에 노이즈를 남기는 쪽이 더 침습적). 사용자가 모달에서 바꾼 값은 `settings.lastStart` 에 저장돼 다음 원클릭에 재사용된다.

**(f) IPC 표면 — 16 handle + 1 push, 에러는 message 로만 전달**

```
workspace:repos:list | :add | :update | :remove
workspace:settings:get | :set
workspace:project-repo:set
workspace:list | workspace:get
workspace:start-task
workspace:run:resume | :adopt | :cleanup
workspace:reconcile
workspace:run:updated        ← push 전용 (ipcMain.handle 등록 금지)
dooray:project:workflows
git:delete-branch
```

핸들러는 `gitHandle` 과 같은 형태의 `workspaceHandle` 래퍼로 감싸 에러 메시지를 정규화한다. `WorkspaceError.code` 는 **main 쪽 로깅/테스트 전용**이며 IPC 를 건너오지 못한다(Error 는 message 만 직렬화된다). 따라서 `message` 는 그 자체로 사용자에게 보여줄 수 있는 한국어 문장이어야 한다. C-3 이 코드 기반 분기를 필요로 하면 그때 구조화 결과 타입으로 승격한다.

`workspace:run:updated` 페이로드는 `{ workspace: TaskWorkspace; runId: string; reason: 'created'|'status'|'session'|'removed' }` — 워크스페이스 전체를 실어 렌더러가 병합 로직 없이 교체하게 한다.

## 대안과 기각 이유

1. **실패 시 워크트리·브랜치 자동 롤백** — *기각*: 삭제는 파괴적이고, 실패의 대부분(spawn 타이밍)은 워크트리와 무관하다. 사용자의 5초와 브랜치를 날리는 대신 `failed` run 으로 남겨 resume/cleanup 선택지를 준다. 정리는 명시적 사용자 행동(`cleanupRun`)이어야 한다.
2. **두레이 전환 실패 시 startTask 전체 실패** — *기각*: 두레이 API 장애로 로컬 개발 시작이 막힌다. 인과가 뒤집혔다.
3. **`warnings` 대신 throw + 부분 성공 플래그** — *기각*: 호출부가 try/catch 로 정상 흐름을 다루게 된다. 배열 반환이 renderer 토스트에 그대로 매핑된다.
4. **멱등 판정을 "워크트리 존재 여부"로** — *기각*: 사용자가 워크트리를 수동 삭제한 경우 스토어와 어긋난다. 스토어의 `activeRunId` 가 우리의 진실이고, 파일시스템과의 재동기화는 `reconcile()` 의 책임이다(관심사 분리).
5. **워크트리를 `~/Clauday-Workspaces/workspace/{taskId}/` 에 생성** — *기각*: 저장소와 다른 볼륨일 수 있고(git worktree 는 동작하지만 IDE·빌드 캐시가 불리), `GitService` 의 검증된 경로 규칙을 우회하게 된다. 사용자가 워크트리를 찾을 때도 저장소 옆이 자연스럽다.
6. **`.gitignore` 에 추가(exclude 대신)** — *기각*: `.gitignore` 는 추적되는 파일이라 사용자의 커밋에 우리 변경이 섞인다. `info/exclude` 는 로컬 전용이라는 점이 정확히 우리 목적에 맞는다.
7. **IPC 를 `{ok, code, data}` 구조화 결과로 통일** — *기각*: 이 저장소의 100+ 채널이 전부 throw 규약이다(`domain-electron-ipc.md` 명문). 한 도메인만 다른 규약을 쓰면 preload/renderer 에서 예외 처리가 두 갈래가 된다.
8. **`workspace:fanout` 채널을 미리 예약** — *기각*: 마스터에서 fan-out 이 제거됐다. 죽은 채널은 카탈로그 테스트에서 "등록되지 않은 채널"로 잡히거나, 더 나쁘게는 C-3 이 그걸 보고 UI 를 만든다.

## 결과 (Consequences)

### 긍정
- 어떤 단계에서 실패해도 사용자는 **뭔가 쓸 수 있는 상태**를 갖는다(워크트리 + failed run + 원인 메시지).
- best-effort 실패가 조용히 사라지지 않는다 — `warnings` 로 UI 까지 올라간다.
- IPC 표면이 이번에 확정되므로 C-3 은 화면만 만들면 된다(preload 를 다시 열지 않는다).

### 부정 / 트레이드오프
- 실패 후 잔여물(워크트리·브랜치)이 쌓일 수 있다. `cleanupRun` 과 `reconcile` 이 있지만 사용자가 호출해야 한다.
- `warnings` 는 문자열 배열이라 renderer 가 종류별로 다르게 처리할 수 없다(전부 토스트). 필요해지면 구조화.
- `info/exclude` 는 여전히 사용자 저장소를 건드리는 쓰기다. 최소 패턴 + sentinel + 멱등으로 줄였을 뿐 0은 아니다.
- 재시도 시 브랜치명에 `-2` 가 붙어 브랜치가 늘어난다(이전 브랜치를 자동 삭제하지 않으므로).

### 모니터링
- QA(AC13): 워크트리 생성 후 `git -C <repo> status` 가 깨끗한지(= exclude 가 동작), `cat $(git rev-parse --git-common-dir)/info/exclude` 에 우리 두 줄이 **정확히 한 번** 있는지.
- `warnings` 가 자주 비어 있지 않다면(특히 두레이 전환 실패) 워크플로우 탐색 로직(`class === 'working'`)이 실제 프로젝트에 안 맞는다는 신호.
- 재시도로 `-2`, `-3` 브랜치가 쌓이는 빈도 → 잦으면 "이전 실패 run 의 브랜치 재사용" 옵션을 C-3 백로그로.

---

## 참조

- `prd.md`(AC1~AC15) · `plan.md` — 같은 폴더
- 마스터 설계 `~/.claude/plans/toasty-sleeping-simon.md` §C-1 / §C-2 / §C-3 / §C-3.5 / §C-4 / §검증
- 선행 결정: `feature/workspace/v2-workspace-p0/adr.md` — ADR-01(라우터 계약·resolver 우선순위 약속), ADR-02(claudeDirSetup 계약), ADR-05(결함 보존 원칙)
- 선행 기록: `feature/workspace/v2-workspace-p0/impl-log.md` — 보존된 결함 2건(형제 경로 `'..'`, send 실패 시 markIdle 스킵), thunk 주입 교훈
- 목업: `docs/mockups/v2/start-work-modal.html`(StartTaskParams 근거), `docs/mockups/v2/workspace-view.html`(run 카드 액션 4종)
- 기존 계약: `src/shared/types/git.ts`, `src/main/git/GitService.ts:32`(assertSafeRef), `src/main/utils/paths.ts`(A-0), `src/main/utils/atomicWrite.ts`(A-0)
- 전역 규약: 결과 무시 금지(§4), 로깅 식별자(§5), 예외 코드 체계(§6), Layer/DTO 분리(§8), 변경 위생(§9)
