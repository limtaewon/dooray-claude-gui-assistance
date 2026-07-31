---
id: ADR-v2-workspace-p0-01
title: claude code hook 수신을 cwd resolver first-match + kind 핸들러 라우터로 일반화
status: accepted
date: 2026-07-30
supersedes: []
domain: dooray-bot, claude-chat, renderer-only
contains:
  - ADR-v2-workspace-p0-01  # ClaudeHookRouter (resolver first-match + kind handler)
  - ADR-v2-workspace-p0-02  # claudeDirSetup 모듈 함수 + 경로 주입 seam
  - ADR-v2-workspace-p0-03  # TaskRow 추출 시 taskStyles.ts 동반 분리
  - ADR-v2-workspace-p0-04  # Git 패널 prop 타입 = shared/types/git 계약
  - ADR-v2-workspace-p0-05  # 무동작변경의 정의와 증명 절차 (결함 보존 원칙)
---

# ADR-v2-workspace-p0-01 — claude code hook 수신을 cwd resolver first-match + kind 핸들러 라우터로 일반화

## 컨텍스트

`HookServer` 는 claude code 의 `type:"http"` hook(PostToolUse / Stop)을 loopback 으로 받아 **단일 핸들러** 하나에 넘긴다. 그 핸들러가 지금은 `index.ts:190` 의 `handleClaudeHook` 클로저이고, 내부는 전부 멘션 봇 전용이다.

```
handleClaudeHook(ev)
  → extractChannelIdFromCwd(ev.cwd)      // agentRoot prefix 매칭. 실패하면 조용히 return
  → post_tool_use: turnBuffers 누적       // index.ts 모듈 스코프 Map
  → stop: 응답 추출 → 두레이 송신 → setClaudeSessionId → markIdle
```

문제는 세 겹이다.

1. **소유자가 하나뿐이라는 가정이 코드에 박혀 있다.** C-2 의 workspace run 은 워크트리(`worktreePath`)를 cwd 로 같은 Stop hook 을 받아야 한다. 현 구조에서는 `handleClaudeHook` 안에 `if (worktree) ... else if (channel) ...` 를 덧대는 수밖에 없고, 그러면 dooray-bot 도메인과 workspace 도메인이 index.ts 한 함수에서 결합된다.
2. **테스트 불가.** 로직이 index.ts 모듈 스코프의 싱글턴(`agentWorkspace`, `channelSessionStore`, `claudayResponder`, `turnBuffers`)을 직접 참조한다. `index.test.ts` 는 IPC 채널 카탈로그만 대조할 뿐 이 경로를 전혀 건드리지 못한다 → 멘션 응답 회수 경로의 자동 검증 수단이 0.
3. **Stop 이벤트의 중복 처리 위험.** 두 도메인이 같은 이벤트를 각자 처리하면 두레이 채널에 같은 응답이 두 번 나간다. 소유권은 **배타적**이어야 한다.

## 결정

hook 수신을 두 조각으로 나눈다.

**(a) `src/main/hooks/ClaudeHookRouter.ts` — 도메인 무지(domain-agnostic) 라우터**

```ts
export interface HookRoute { kind: string; id: string; meta?: Record<string, unknown> }
export type HookResolver = (cwd: string) => HookRoute | null
export type HookKindHandler = (ev: HookEventPayload, route: HookRoute) => void | Promise<void>

export class ClaudeHookRouter {
  addResolver(resolver: HookResolver): void          // 등록 순서 = 우선순위
  setHandler(kind: string, handler: HookKindHandler): void
  dispatch(ev: HookEventPayload): Promise<void>
}
```

`dispatch` 규칙 (전부 테스트로 고정):

| 상황 | 동작 | 근거 |
|---|---|---|
| resolver 를 등록 순서대로 호출, **첫 non-null 채택** | 나머지 resolver 는 호출하지 않음 | 소유권 배타 — 이중 회신 차단 |
| 모든 resolver 가 null | 아무것도 안 함, **로그도 없음** | 현행 `if (!channelId) return` 과 동일. stale settings 로 들어오는 hook 이 로그를 오염시키지 않게 |
| resolver 가 throw | `console.warn` + 그 resolver 만 skip 하고 다음으로 | 한 도메인의 버그가 다른 도메인 hook 을 막지 않게 (resolver 가 1개인 현재는 관측 동일: 어느 쪽이든 "아무 일 없음 + 로그 1줄") |
| route.kind 핸들러 미등록 | `console.warn('[ClaudeHookRouter] 핸들러 미등록 kind=..., id=...')` | silent failure 신호 금지 (전역 규약 §4). 현행에 없던 경로라 회귀 아님 |
| 핸들러 throw | **잡지 않고 전파** | `HookServer.handle` 의 기존 try/catch 가 그대로 받는다. 실패 로그 형태와 markIdle 스킵 여부까지 현행 유지 (ADR-05) |

`dispatch` 는 핸들러의 Promise 를 `await` 해서 반환한다 (`HookServer` 가 await 하므로 처리 순서 보존).

**(b) `src/main/dooray/mention/MentionHookHandler.ts` — 멘션 전용 로직의 이사 대상**

`turnBuffers` 를 인스턴스 필드로 들고, `resolve(cwd)` + `handle(ev, route)` 두 메서드를 노출. 의존은 전부 생성자 주입:

```ts
new MentionHookHandler({
  getAgentRoot: () => agentWorkspace.getAgentRoot(),   // 반드시 thunk (root 는 부팅 후 변경됨)
  sessions: channelSessionStore,                        // get / setClaudeSessionId / markIdle
  responder: claudayResponder,                          // send
  readTranscript: readLastAssistantText                 // 기본값
})
```

`composeStopMessage` / `extractAssistantMessage` / `formatToolDetail` 은 같은 파일의 **named export 순수 함수**로 이동 (본문 한 글자도 바꾸지 않음).

**(c) `index.ts` 조립부 (≤ 8줄)**

```ts
const hookRouter = new ClaudeHookRouter()
const mentionHookHandler = new MentionHookHandler({ ... })
hookRouter.addResolver((cwd) => mentionHookHandler.resolve(cwd))
hookRouter.setHandler(MENTION_HOOK_KIND, (ev, route) => mentionHookHandler.handle(ev, route))
// ...
hookServer.setHandler((ev) => hookRouter.dispatch(ev))
```

C-2 는 `hookRouter.addResolver(workspaceResolver)` + `setHandler('workspace', ...)` 2줄만 추가하면 된다. 멘션 resolver 가 **먼저** 등록되어 우선순위를 갖는다.

## 대안과 기각 이유

1. **index.ts 클로저 유지 + workspace 분기만 `if` 로 추가** — *기각*: 2000줄짜리 index.ts 에 두 번째 도메인 로직을 얹는 것이고, 테스트 불가 상태가 그대로 굳는다. C-0 의 존재 이유(회귀 안전망 확보) 자체가 무산된다.
2. **`HookServer` 에 라우팅을 내장** (`hookServer.route(cwd)` 등) — *기각*: HTTP 수신·secret 검증·응답 조기 종료라는 전송 계층 책임과 도메인 소유권 판정을 한 클래스에 섞는다. `HookServer.test.ts` 가 도메인 픽스처를 알아야 해지고, 향후 HookServer 를 다른 용도(예: 별도 포트)로 재사용할 때 발목 잡힌다.
3. **EventEmitter pub/sub 브로드캐스트** (모든 구독자가 이벤트를 받고 각자 자기 것인지 판단) — *기각*: 소유권 판정이 구독자 쪽에 분산되면 두 구독자가 동시에 "내 것"이라고 판단하는 순간 두레이 채널에 응답이 2번 나간다. cwd 는 배타적 자원이므로 first-match 배타 라우팅이 맞다. 디버깅 시 "누가 처리했나"도 라우터 한 곳에서 답이 나온다.
4. **resolver 없이 kind 를 hook URL 쿼리로 구분** (`?event=stop&kind=workspace` 를 settings.local.json 에 심기) — *기각*: 매력적이지만 (a) 이미 배포돼 사용자 홈에 남아 있는 기존 `settings.local.json` 에는 kind 가 없어 마이그레이션 창이 생기고 (b) 사용자가 직접 만든 워크트리/폴더에서 claude 를 띄운 경우를 cwd 로 흡수하는 유연성을 잃는다. 무동작변경 원칙에도 어긋난다(파일 내용이 바뀜).
5. **`HookRoute` 없이 resolver 가 핸들러를 직접 반환** (`(cwd) => handler | null`) — *기각*: 마스터 설계의 `addResolver`/`setHandler(kind)` 계약과 어긋나고, 라우팅 결과(kind/id)를 로그·메트릭에 남길 수 없다. id(channelId/runId)는 로깅 규약(§5 식별자 포함)의 핵심.

## 결과 (Consequences)

### 긍정
- 멘션 응답 회수 경로가 처음으로 단위 테스트 가능해진다 (PRD AC7 — 8개 케이스).
- C-2 의 workspace hook 은 resolver 1개 추가로 끝난다. dooray-bot 코드를 다시 열 필요가 없다.
- `index.ts` 가 116줄 줄고, hook 관련 잔여물은 조립부 8줄만 남는다.
- 미등록 kind 경고로 "hook 은 들어왔는데 아무도 처리 안 함"이 로그에 드러난다.

### 부정 / 트레이드오프
- 파일 3개(라우터/핸들러/테스트)와 간접 계층 1겹이 늘어난다. hook 흐름을 처음 읽는 사람은 index.ts → 라우터 → 핸들러 3홉을 따라가야 한다.
- `ClaudeHookRouter` 가 `HookEventPayload` 타입을 `../dooray/mention/HookServer` 에서 import 한다 — 일반 모듈이 도메인 폴더를 향하는 역방향 의존. 타입 전용이라 런타임 영향은 0이고, HookServer 이동은 비목표. C-2 에서 `hooks/` 로 옮길지 재검토.
- resolver 예외 처리(warn + skip)는 현행에 대응물이 없는 신규 동작이다. resolver 가 1개인 지금은 관측상 차이가 없지만, 엄밀히는 "무동작변경"의 예외 1건 — ADR-05 의 허용 목록에 명시한다.

### 모니터링
- AC11 실채널 수동 QA: 멘션 → 회신 → 재멘션 `--resume` 3단.
- 로그 grep 포인트: `[ClaudeHookRouter] 핸들러 미등록` 이 뜨면 조립 누락. `[HookServer] handler 에러:` 의 빈도가 리팩터 전후로 바뀌면 예외 전파 경로가 달라진 것.
- C-2 착수 시점에 resolver 2개 등록 후 "멘션 채널 hook 이 workspace resolver 에 흡수되지 않는지" 우선순위 테스트 추가.

---

# ADR-v2-workspace-p0-02 — `.claude` 준비 로직을 claudeDirSetup 모듈 함수로 추출하고 경로를 주입 가능하게 한다

## 컨텍스트

`AgentWorkspaceManager` 의 private 메서드 2개가 claude code 를 "질문 없이" 띄우기 위한 준비를 담당한다.

- `preApproveTrust(dir)` — `~/.claude.json` 의 `projects[dir].hasTrustDialogAccepted = true` (tmp → rename atomic write)
- `writeHookSettings(dir)` — `dir/.claude/settings.local.json` 에 PostToolUse/Stop hook 정의 + `X-Clauday-Secret` 헤더. 내용 동일하면 재기록 안 함

C-2 의 `WorkspaceService.startTask` 는 **워크트리 디렉터리**에 정확히 같은 두 가지를 해야 한다. 그런데 이 메서드들은 채널 개념(channelId, CLAUDE.md, tasks/)에 묶인 클래스의 private 이고, hookConfig 는 인스턴스 상태(`this.hookConfig`)다.

부수적으로 확인된 사실: 현재 `AgentWorkspaceManager.test.ts` 는 `ensureChannel()` 을 호출하고, 그 안의 `preApproveTrust` 가 **개발자의 실제 `~/.claude.json` 을 읽고 다시 쓴다**. 테스트를 돌릴 때마다 홈 설정에 tmp 경로 항목이 누적된다.

## 결정

`src/main/claude/claudeDirSetup.ts` 를 신설하고 두 로직을 **본문 변경 없이** 모듈 함수로 옮긴다. 상태(hookConfig)와 경로(configPath)는 인자로 받는다.

```ts
/** claude code 가 폴더별 trust 를 저장하는 사용자 설정 파일 */
export const CLAUDE_USER_CONFIG = join(homedir(), '.claude.json')

export type TrustResult = 'written' | 'already-trusted' | 'no-config' | 'failed'

/** ~/.claude.json 에 해당 폴더를 trust 등록. 파일 없으면 no-op. */
export function preApproveTrust(dir: string, opts?: { configPath?: string }): TrustResult

/** dir/.claude/settings.local.json 에 Clauday hook 정의 작성. hookConfig 없으면 아무것도 안 함. */
export function writeHookSettings(
  dir: string,
  hookConfig: { port: number; secret: string } | null
): boolean   // true = 파일에 기록함
```

`AgentWorkspaceManager` 는 private 메서드를 지우고 **위임만** 한다. 기본 인자를 쓰므로 프로덕션 경로는 완전히 동일:

```ts
preApproveTrust(channelDir)
writeHookSettings(channelDir, this.hookConfig)
```

추가로 `AgentWorkspaceManager` 생성자에 **선택적 deps seam** 을 둔다 (`constructor(root = DEFAULT_ROOT, deps: ClaudeDirSetupDeps = { preApproveTrust, writeHookSettings })`). 기존 호출부(`new AgentWorkspaceManager()`)는 무수정이고, 기존 테스트는 이 seam 으로 홈 오염을 끊는다.

반환값 도입 근거: 현재 두 메서드는 void 라 "썼는지/건너뛰었는지"가 밖에서 보이지 않는다. 반환값은 **추가만** 되고 호출부는 무시하므로 동작 변화 0이며, C-2 가 `startTask` 로그에 결과를 남길 수 있게 된다. `console.warn` 문구와 위치(catch 내부)는 현행 그대로 유지한다.

## 대안과 기각 이유

1. **`AgentWorkspaceManager` 를 workspace 에서도 그대로 재사용** — *기각*: `ensureChannel(channelId)` 가 CLAUDE.md·tasks/ 를 만들고 경로를 `agentRoot/{channelId}` 로 강제한다. 워크트리는 경로도 구조도 다르다. 채널 개념을 워크스페이스에 억지로 끼우면 두 도메인이 한 클래스에 얽힌다.
2. **상속 / 추상 베이스 클래스** (`WorkspaceDirManager extends ClaudeDirManagerBase`) — *기각*: 공유하는 것은 상태 없는 절차 2개뿐이다. 클래스 계층을 세울 이유가 없고, 테스트 시 베이스의 protected 를 뚫어야 한다.
3. **private → public 승격만 하고 이동 안 함** — *기각*: workspace 코드가 dooray/mention 폴더의 클래스를 인스턴스화해야 한다(도메인 역참조). 게다가 hookConfig 를 세터로 넣는 스텝풀(stateful) API 를 workspace 쪽에도 강요한다.
4. **인자·반환값 없이 순수 이동만** (configPath 주입 없음) — *기각*: 그러면 새 테스트 역시 실제 `~/.claude.json` 을 건드려야 하고, CI/개발자 홈에 부작용을 남기는 테스트를 새로 늘리게 된다. 기본값 인자는 프로덕션 경로를 바꾸지 않으면서 이 문제를 없앤다.
5. **`atomicWrite` 유틸(Workstream A-0)을 지금 도입해서 같이 정리** — *기각*: A-0 은 병렬 트랙이고 아직 없다. 여기서 만들면 두 트랙이 같은 파일을 신설해 충돌한다. tmp→rename 코드는 현행 그대로 옮기고, A-0 완료 후 그쪽에서 흡수한다(마스터 계획이 이미 `AgentWorkspaceManager.ts:137-139 패턴 이식` 으로 명시).

## 결과 (Consequences)

### 긍정
- C-2 `WorkspaceService.startTask` 가 `import { preApproveTrust, writeHookSettings }` 한 줄로 워크트리를 준비할 수 있다.
- trust/hook 준비 로직이 처음으로 직접 단위 테스트된다(4분기 + 멱등 + null 가드).
- 테스트가 개발자 홈 `~/.claude.json` 을 더럽히던 문제가 사라진다.

### 부정 / 트레이드오프
- `AgentWorkspaceManager` 생성자 시그니처에 선택 인자가 붙는다(호출부 무수정이지만 시그니처는 넓어짐).
- 상수 3개(`CLAUDE_LOCAL_SETTINGS_DIR`, `CLAUDE_LOCAL_SETTINGS_FILE`, `CLAUDE_USER_CONFIG`)의 소유가 옮겨간다 — 두 파일을 오가며 읽어야 하는 비용.
- hook 정의(matcher 문자열, `?event=` 경로)가 dooray/mention 밖으로 나가면서, "이 matcher 는 멘션 요약용"이라는 맥락이 옅어진다. 파일 상단 주석으로 보완.

### 모니터링
- 멱등 테스트가 깨지면 = 매 멘션마다 settings 파일을 다시 쓰는 상태(파일 워처/claude 재로드 유발 가능).
- AC11 수동 QA 에서 trust 다이얼로그가 다시 뜨면 preApproveTrust 경로 회귀.

---

# ADR-v2-workspace-p0-03 — TaskRow 추출 시 워크플로/태그 스타일 헬퍼를 `Dooray/taskStyles.ts` 로 동반 분리한다

## 컨텍스트

`TaskRow` 는 단독으로 떨어지지 않는다. `ProjectTaskView.tsx:11-76` 의 부속물에 의존한다.

- `WORKFLOW_ICONS` / `WORKFLOW_COLORS` / `WORKFLOW_BG_COLORS` (lucide 아이콘·Tailwind 클래스 맵)
- `getWorkflowName(task)` — 4단 폴백
- `tagStyle(color)` + `TAG_STYLE_CACHE` + `currentTheme()` + `hexToHsl()` — HSL 기반 대비 보정 + 테마별 캐시
- **모듈 로드 시 부수효과**: `window.addEventListener('theme-changed', () => TAG_STYLE_CACHE.clear())`

그리고 이 중 `getWorkflowName`(:287, :314)과 `tagStyle`(:513)은 **`ProjectTaskView` 본체도 계속 쓴다**. 즉 TaskRow 와 ProjectTaskView 의 공유 자산이다.

## 결정

`src/renderer/src/components/Dooray/taskStyles.ts` 를 신설해 위 블록(원본 11-76행)을 **텍스트 그대로** 옮기고, `WORKFLOW_ICONS`·`WORKFLOW_COLORS`·`WORKFLOW_BG_COLORS`·`getWorkflowName`·`tagStyle` 을 export 한다. `TAG_STYLE_CACHE`·`currentTheme`·`hexToHsl` 은 비export 유지(원본과 동일한 은닉 수준).

`TaskRow.tsx` 는 `taskStyles` 에서 import 하고, `ProjectTaskView.tsx` 도 `taskStyles` 에서 import 한다. **`TaskRow.tsx` 가 헬퍼를 re-export 하지 않는다** (컴포넌트 파일이 유틸 허브가 되는 것을 막는다).

`theme-changed` 리스너는 `taskStyles.ts` 모듈 스코프에 그대로 둔다. 두 파일이 import 해도 ES 모듈은 1회만 평가되므로 리스너는 여전히 1개다(현행과 동일).

memo 비교 함수는 `export function taskRowPropsAreEqual(prev, next)` 로 승격한다 — 조건식 6줄은 원본 그대로.

## 대안과 기각 이유

1. **헬퍼 전부를 `TaskRow.tsx` 에 두고 `ProjectTaskView` 가 TaskRow 에서 import** — *기각*: 컴포넌트 파일이 스타일 유틸의 배포처가 되고, C-3/C-3.5 가 "TaskRow 를 안 쓰고 tagStyle 만" 필요할 때 컴포넌트 모듈 전체(+lucide, +React)를 끌어오게 된다. `theme-changed` 리스너가 컴포넌트 파일 부수효과로 숨는 것도 나쁘다.
2. **`src/shared/` 로 승격** — *기각*: `currentTheme()` 이 `document.documentElement` 를, 캐시 무효화가 `window` 이벤트를 쓴다. main 에서 import 불가능한 renderer 전용 코드다. shared 는 main↔renderer 공용 계약 자리(전역 규약).
3. **`components/common/` 으로** — *기각*: 현재 소비자가 Dooray 도메인 2곳뿐이다. 세 번째 도메인 소비자가 생기면 그때 승격(YAGNI).
4. **memo comparator 를 익명 인라인으로 유지** — *기각*: 이동 과정에서 가장 조용히 사라지기 쉬운 조각인데(빠져도 화면은 똑같다) 성능만 나빠진다. named export 승격은 텍스트 변형 1건을 감수할 값어치가 있고, ADR-05 의 허용 변형 목록에 넣는다.
5. **파일명 `taskWorkflow.ts` / `workflowStyles.ts`** — *기각*: 내용의 절반이 태그 칩 스타일이라 workflow 만으로는 좁다. `taskStyles.ts` 채택.

## 결과 (Consequences)

### 긍정
- C-3(워크스페이스 좌측 목록)·C-3.5(터미널 태스크 드로어)가 `import TaskRow` 한 줄로 동일한 행을 얻는다. 두 화면의 시각 일관성이 구조적으로 보장된다.
- `tagStyle`/`getWorkflowName` 이 순수 함수 모듈로 떨어져 단위 테스트가 붙는다(PRD AC5).
- `ProjectTaskView.tsx` 가 581 → 약 430줄.

### 부정 / 트레이드오프
- Dooray 폴더에 파일 2개 추가. 태스크 행을 고치려면 이제 2~3파일을 봐야 한다.
- 모듈 부수효과(`addEventListener`)가 import 순서에 따라 시점이 미세하게 달라질 수 있다. 실제로는 두 소비자 모두 앱 부팅 시 로드돼 관측 차이 없음.
- `WORKFLOW_ICONS` 가 lucide 를 import 하므로 `taskStyles.ts` 는 순수 유틸이 아니다(트리셰이킹 관점에서 컴포넌트 의존 잔존).

### 모니터링
- AC12 수동 QA: 태스크 목록의 태그 칩 색상이 light/dark 양쪽에서 동일한지. 테마 토글 직후 칩 색이 즉시 바뀌는지(= 캐시 무효화 리스너 생존 확인).
- `taskRowPropsAreEqual` 테스트 6필드가 전부 살아 있는지 리뷰에서 확인.

---

# ADR-v2-workspace-p0-04 — 추출한 Git 패널의 prop 타입은 `shared/types/git` 계약을 쓰고, BranchWorkspace 의 로컬 중복 타입은 이번엔 건드리지 않는다

## 컨텍스트

`BranchWorkspace.tsx` 는 파일 상단에 로컬 인터페이스 `FileDiff`(:44) / `DiffResult`(:51) / `CompareResult`(:57) 를 선언해 쓰고 있다. 그런데 `src/shared/types/git.ts` 에는 이미 **구조가 완전히 같은** `GitFileDiff` / `GitDiffResult` / `GitFileCompare` 가 있다(IPC 응답 계약). 즉 같은 타입이 2벌 존재한다.

`DiffPanel` / `FileComparePanel` 을 별도 파일로 빼면 prop 타입을 어디서 가져올지 정해야 한다.

## 결정

- 추출된 `Git/DiffPanel.tsx` · `Git/FileComparePanel.tsx` 는 **`shared/types/git` 의 `GitDiffResult` / `GitFileCompare` 를 prop 타입으로 사용**한다.
- `BranchWorkspace.tsx` 의 로컬 인터페이스 3개는 **그대로 둔다**. 구조적으로 호환되므로 `<DiffPanel result={diffResult} />` 는 무변경으로 통과한다(TypeScript 구조적 타이핑).
- `DiffPanel` 의 현재 미사용 prop `branch` / `repoPath` 는 **인터페이스에 그대로 유지**하되(호출부 2곳 무수정), 컴포넌트 본문에서는 구조분해하지 않는다. "현재 렌더에 미사용 — 호출처 계약 유지" 주석 1줄.

```ts
export interface DiffPanelProps {
  result: GitDiffResult
  /** 표시 라벨용 — 현재 렌더에는 미사용(호출처 계약 유지, ADR-04) */
  branch: string
  /** 동상 */
  repoPath: string
  onFileCompare?: (filePath: string) => void
}
function DiffPanel({ result, onFileCompare }: DiffPanelProps): JSX.Element
```

## 대안과 기각 이유

1. **로컬 인터페이스를 새 파일에 복사** — *기각*: 같은 타입 3벌. IPC 응답 형태가 바뀌면 어긋날 지점이 하나 더 는다.
2. **BranchWorkspace 의 로컬 타입 3개를 삭제하고 shared 로 전면 통일** — *기각(이번 트랙)*: 옳은 방향이지만 `Worktree`/`Branch`/`WorktreeStatusInfo` 까지 연쇄되고, `git.diff()` 반환 타입 추론 경로를 건드리게 된다. 무동작변경 트랙에서 diff 를 키우면 AC3 검증이 흐려진다. C-3 이 BranchWorkspace 를 다시 열 때 처리.
3. **미사용 prop `branch`/`repoPath` 제거** — *기각*: 호출부 2곳(`:684`, `:695`)이 바뀌고 "무엇을 위해 넘기던 값인가"라는 맥락이 사라진다. C-3 의 변경사항 탭에서 브랜치 라벨을 실제로 표시할 후보이므로 계약을 남긴다.
4. **미사용 prop 을 `_branch` 로 구조분해** — *기각*: 언더스코어 별칭은 "쓰다 만 값"처럼 보인다. 아예 구조분해하지 않으면 의도가 더 분명하고 린트 신호도 없다.

## 결과 (Consequences)

### 긍정
- 새 컴포넌트가 IPC 계약 타입을 직접 쓰므로, C-3 이 `window.api.git.diff()` 결과를 그대로 꽂을 수 있다.
- 호출부 무수정 → AC3 텍스트 동일성 검증이 깨끗하다.

### 부정 / 트레이드오프
- 타입 2벌 상태가 (의도적으로) 잠시 더 유지된다. C-3 백로그로 명시 이월.
- 미사용 prop 2개가 계약에 남아, 사정을 모르는 사람이 "정리 대상"으로 오해할 수 있다 → 주석으로 방어.

### 모니터링
- C-3 착수 시 `BranchWorkspace` 로컬 타입 제거 항목이 그 plan 에 들어갔는지 확인.
- `npm run typecheck` 가 구조적 호환을 증명한다(별도 assert 불필요).

---

# ADR-v2-workspace-p0-05 — "무동작변경"의 정의: 텍스트 동일성 + characterization 테스트, 발견한 결함은 보존한다

## 컨텍스트

C-0 은 후속 3개 트랙의 토대다. 여기서 조용한 회귀가 하나라도 들어가면 C-1~C-3.5 구현 중에 "새 기능 버그"로 오인되어 추적 비용이 몇 배가 된다. 그런데 "무동작변경"은 말은 쉽고 판정은 애매하다 — 리뷰어가 눈으로 보는 것 말고 기준이 필요하다.

동시에, 코드를 옮기다 보면 결함이 반드시 눈에 띈다. 이미 식별된 것만 해도:

- `extractChannelIdFromCwd` 는 `cwd.startsWith(agentRoot)` 만 보므로 형제 경로(`<agentRoot>-foo`)에서 `path.relative` 결과가 `..` 로 나와 channelId 가 `'..'` 이 된다.
- `claudayResponder.send()` 가 throw 하면 `markIdle` 이 스킵되어 채널이 busy 로 남는다.
- `DiffPanel` 의 `branch`/`repoPath` prop 은 아무 데도 안 쓰인다.
- 태스크/Git 로컬 타입이 shared 와 중복.

## 결정

**무동작변경 = 아래 3가지를 전부 만족.**

1. **텍스트 동일성** — 추출된 블록은 baseline(`git show HEAD:<원본>` 의 해당 행 범위)과 `diff` 했을 때 아래 **허용 변형 4종** 외의 차이가 0.
   - (a) `export` 키워드 추가
   - (b) import 문 신설/재배치 (`React.CSSProperties` 같은 타입 참조 표기는 **바꾸지 않는다** — 그대로 두면 diff 가 0)
   - (c) memo comparator 를 named function 으로 승격 (조건식 본문 동일)
   - (d) private 메서드 → 모듈 함수 전환에 필요한 최소 시그니처 변경(`this.hookConfig` → 인자, 반환값 추가). 본문 로직·문자열·분기 순서·주석은 동일
2. **characterization 테스트** — 추출된 각 단위에 현행 동작을 고정하는 테스트를 붙인다. **버그도 그대로 고정**하고, 해당 테스트에 `// 현행 동작 고정 (ADR-v2-workspace-p0-05) — 개선은 후속` 주석 + 후속 이슈 참조를 남긴다.
3. **관측 가능 표면 불변** — IPC 채널 카탈로그(`index.test.ts` 대조 결과), 디스크에 쓰는 파일 내용, 두레이로 나가는 메시지 본문, `console` 출력 문구가 동일.

**결함 수정 금지.** 발견한 것은 `impl-log.md` 의 `## 발견했으나 고치지 않은 것` 에 파일:행 + 재현 조건 + 제안 수정으로 기록만 한다. 수정은 해당 코드를 실제로 쓰는 후속 트랙(C-1/C-2/C-3)에서, 그때의 테스트와 함께.

**명시적 예외 1건** — ADR-01 의 "resolver 예외 시 warn + skip" 은 현행에 대응 동작이 없는 신규 경로다(현재는 resolver 개념 자체가 없음). resolver 1개 상태에서 외부 관측은 동일하므로 허용한다.

## 대안과 기각 이유

1. **"기존 테스트가 다 통과하면 무동작변경"** — *기각*: 대상 4곳의 기존 테스트 커버리지가 사실상 0이다(`handleClaudeHook` 0건, TaskRow/DiffPanel 0건). 통과는 아무것도 증명하지 못한다.
2. **리뷰어 육안 검토만** — *기각*: 116줄+147줄+118줄 이동을 눈으로 대조하는 일은 재현 가능하지도, 위임 가능하지도 않다. `diff` 명령 한 줄이면 기계가 판정한다.
3. **추출과 동시에 발견한 버그도 수정** — *기각*: 텍스트 동일성 기준이 무너지고, 이후 회귀가 났을 때 "이동 때문인가 수정 때문인가"를 가릴 수 없다. 특히 멘션 파이프라인은 자동 검출이 어려운 영역이라 변수 2개를 동시에 넣으면 안 된다.
4. **스냅샷 테스트만으로 갈음(텍스트 diff 생략)** — *기각*: 스냅샷은 추출 **후** 생성되므로 "추출 전과 같은가"를 증명하지 못한다. 미래 회귀는 막지만 이번 이동은 못 막는다. 둘 다 필요하다.
5. **버그를 고정하는 테스트 대신 `it.todo` 로 남기기** — *기각*: `'..'` 같은 현행 출력이 문서화되지 않으면, 후속 트랙이 무심코 고쳤을 때 그게 의도된 변경인지 알 수 없다. 고정 + 주석이 낫다.

## 결과 (Consequences)

### 긍정
- 리뷰가 기계적으로 끝난다(`diff` 출력 + 테스트 결과). 리뷰어 판단 부하가 낮다.
- 후속 트랙이 "C-0 은 무결"이라는 전제를 신뢰할 수 있어, 회귀 발생 시 탐색 범위가 자기 트랙으로 좁혀진다.
- 결함 목록이 impl-log 에 축적되어 C-1~C-3 의 backlog 가 된다.

### 부정 / 트레이드오프
- 명백한 버그를 눈앞에 두고 넘기는 불편함. 형제 경로 오매칭은 실제로 발화 가능성이 낮지만(agentRoot 형제 폴더에서 claude 를 띄우고 hook settings 까지 있어야 함) 0은 아니다.
- 미사용 prop·중복 타입 같은 "지저분함"이 한 사이클 더 남는다.
- baseline diff 절차가 엔지니어에게 추가 작업 단계다(plan 에 명령까지 적어 비용 최소화).

### 모니터링
- `impl-log.md` 의 `## 발견했으나 고치지 않은 것` 항목 수 — 0건이면 오히려 검토가 부실했을 신호.
- C-1 착수 시 그 목록을 훑어 해당 트랙에서 처리할 것을 plan 에 반영.
- AC11/AC12 수동 QA 2건이 리팩터의 최종 관문.

---

## 참조

- `prd.md` (본 디렉터리) — 수락 기준 AC1~AC12
- `plan.md` (본 디렉터리) — 허용 변형 목록, baseline diff 명령, 파트별 체크리스트
- 마스터 설계 `~/.claude/plans/toasty-sleeping-simon.md` §C-0/C-1/C-2/C-3/C-3.5
- `.agent/wiki/domain-dooray-bot.md` — Stop hook 응답 회수, HookServer secret 검증
- 전역 규약: 결과 무시 금지(§4), 로깅 식별자(§5), 변경 위생(§9)
