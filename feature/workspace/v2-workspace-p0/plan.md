---
task: v2-workspace-p0
date: 2026-07-30
---

# Plan — v2.0 C-0: 무동작변경 추출 리팩터 + ClaudeHookRouter

> 브랜치: `feat/version-2.0` (체크아웃 완료). 별도 브랜치를 파지 않는다.
> 전제 문서: 같은 폴더의 `prd.md`(AC1~AC12) · `adr.md`(ADR-01~05). **ADR 은 이 트랙의 전제다.** 구현 중 이견이 생기면 임의로 방향을 바꾸지 말고 impl-log 에 기록 후 architect 에게 반환.
> 대원칙: **새 기능 0, 동작 변화 0, 발견한 버그 수정 0** (ADR-05).

## 분리 영역

| 파트 | 담당 | 건드리는 파일 | 다른 파트와의 접점 |
|---|---|---|---|
| **main** | `main-process-engineer` | `src/main/claude/claudeDirSetup.ts`(신규), `src/main/hooks/ClaudeHookRouter.ts`(신규), `src/main/dooray/mention/MentionHookHandler.ts`(신규), `src/main/dooray/mention/AgentWorkspaceManager.ts`(수정), `src/main/index.ts`(**hook 조립부 한정**) | 없음 — renderer 파일 무접촉 |
| **renderer** | `renderer-engineer` | `src/renderer/src/components/Dooray/taskStyles.ts`(신규), `Dooray/TaskRow.tsx`(신규), `Dooray/ProjectTaskView.tsx`(수정), `Git/DiffPanel.tsx`(신규), `Git/FileComparePanel.tsx`(신규), `Git/BranchWorkspace.tsx`(수정) | 없음 — main/shared 파일 무접촉 |

두 파트는 **완전히 독립**이다. 동시 진행 가능하고, 어느 쪽을 먼저 머지해도 된다.

## 다른 트랙과의 충돌 주의 (Phase 1 병렬)

`src/main/index.ts` 를 여러 트랙이 동시에 만진다. 물리적 영역은 다음과 같이 갈라져 있다.

| 트랙 | index.ts 영역 |
|---|---|
| **C-0 (이 트랙)** | 54-56(import 3줄 삭제) · **183-298(전체 삭제)** · 조립부 신설(≈182 부근) · 378-381(setHandler 1줄 교체) |
| A-1/A-4 | ≈1350-1361(세션 리더), ≈1515-1520(execFile claude) |
| A-2 | ≈983-995(CLAUDE_START_TASK) |
| B-1 | ≈950-980(터미널 IPC 핸들러) |

- [x] 작업 시작 전 `git pull --rebase` 로 최신 `feat/version-2.0` 확보
- [x] **import 블록(1-75줄)이 유일한 공통 충돌면**임을 인지. C-0 은 여기서 3줄 삭제 + 2줄 추가만 한다(그 이상 손대지 않는다)
- [x] 리베이스 충돌이 나면 183-298 삭제 hunk 를 통째로 유지하고 상대 hunk 를 받는다
- [x] C-0 은 후속 트랙(C-1 이후)의 베이스이므로 Phase 1 내에서 **우선 머지**를 목표로 한다

---

## 무동작변경 증명 절차 (모든 추출 공통 — ADR-05)

추출 **전에** baseline 을 뜬다. `<scratch>` 는 각자의 scratchpad 디렉터리(레포 밖).

- [x] baseline 6종 추출
  ```bash
  mkdir -p <scratch>/c0
  R=/Users/nhn/Desktop/dooray-claude-gui-assistance
  git -C $R show HEAD:src/renderer/src/components/Dooray/ProjectTaskView.tsx | sed -n '11,76p'  > <scratch>/c0/taskstyles.before
  git -C $R show HEAD:src/renderer/src/components/Dooray/ProjectTaskView.tsx | sed -n '78,157p' > <scratch>/c0/taskrow.before
  git -C $R show HEAD:src/renderer/src/components/Git/BranchWorkspace.tsx     | sed -n '805,891p'> <scratch>/c0/diffpanel.before
  git -C $R show HEAD:src/renderer/src/components/Git/BranchWorkspace.tsx     | sed -n '893,923p'> <scratch>/c0/filecompare.before
  git -C $R show HEAD:src/main/index.ts                                       | sed -n '183,298p'> <scratch>/c0/mentionhook.before
  git -C $R show HEAD:src/main/dooray/mention/AgentWorkspaceManager.ts        | sed -n '84,143p' > <scratch>/c0/claudedirsetup.before
  ```
  > HEAD 가 이미 진행된 상태면 `git log --oneline -- <파일>` 로 C-0 착수 직전 커밋을 찾아 그 SHA 로 대체.
- [x] 추출 후 각 신규 파일의 해당 블록과 `diff -u` 비교. **허용 변형 4종 외 차이 0** 확인

### 허용 변형 목록 (이것 외에는 전부 위반)

1. `export` 키워드 추가
2. import 문 신설/재배치 — **타입 표기는 바꾸지 않는다**. `React.CSSProperties` 는 `React.CSSProperties` 그대로 (UMD 전역 타입 참조라 import 없이도 컴파일된다 → diff 0)
3. memo comparator 를 named function(`taskRowPropsAreEqual`)으로 승격 — 조건식 6줄 동일
4. private 메서드 → 모듈 함수 전환에 필요한 최소 시그니처 변경(`this.hookConfig` → 인자, 반환값 추가). **본문 로직·문자열·분기 순서·주석은 동일**

금지: className 문자열 정리, 조건식 순서 바꾸기, 옵셔널 체이닝 추가, 주석 수정/삭제, 변수명 개선, prettier 재포맷.

---

## 구현 단계

### [main] M1 — `claudeDirSetup` 추출 (ADR-02)

- [x] `src/main/claude/claudeDirSetup.ts` 신규 생성
  - [x] `AgentWorkspaceManager.ts:9-12` 의 상수 3개 이동: `CLAUDE_LOCAL_SETTINGS_DIR`, `CLAUDE_LOCAL_SETTINGS_FILE`, `CLAUDE_USER_CONFIG`(export)
  - [x] `writeHookSettings(dir: string, hookConfig: {port:number;secret:string} | null): boolean` — 원본 88-118행 본문 그대로. **`if (!hookConfig) return false` 가치 첫 줄**(현행은 hookConfig 없으면 `.claude` 디렉터리조차 만들지 않는다 — `mkdirSync` 보다 앞) / 내용 동일 시 미기록 유지 / 기록했으면 true
  - [x] `preApproveTrust(dir: string, opts?: { configPath?: string }): TrustResult` — 원본 126-143행 본문 그대로. `configPath` 기본값 `CLAUDE_USER_CONFIG`. 반환 `'no-config' | 'already-trusted' | 'written' | 'failed'`. **`console.warn('[AgentWorkspace] trust 사전 등록 실패 (무시):', err)` 문구·위치(catch 내부) 그대로 유지**
  - [x] tmp→rename atomic write 그대로 (A-0 `atomicWrite` 유틸 신설 금지 — 트랙 충돌)
  - [x] 파일 상단 2줄 주석: claude code 의 `.claude` 준비 책임 + 소비자(멘션 채널 / C-2 워크트리)
- [x] `AgentWorkspaceManager.ts` 수정
  - [x] private `writeHookSettings`/`preApproveTrust` 삭제, 상수 3개 제거
  - [x] `ensureChannel` 안에서 `preApproveTrust(channelDir)` / `writeHookSettings(channelDir, this.hookConfig)` 위임 (호출 순서 trust → hook settings 유지)
  - [x] 선택 deps seam: `constructor(root = DEFAULT_ROOT, deps: ClaudeDirSetupDeps = { preApproveTrust, writeHookSettings })` — 기존 호출부 `new AgentWorkspaceManager()` 무수정
  - [x] 죽은 import 정리: `fs` 에서 `readFileSync`·`renameSync` 제거(남는 것 `mkdirSync`, `writeFileSync`, `existsSync`), `homedir` 는 `DEFAULT_ROOT` 때문에 유지
- [x] `diff <scratch>/c0/claudedirsetup.before` 로 허용 변형 외 차이 0 확인
- [x] `src/main/claude/claudeDirSetup.test.ts` 신규 (AC8)
  - [x] `writeHookSettings(dir, null)` → false 이고 `dir/.claude` 가 **생성되지 않음**
  - [x] 정상: `hooks.PostToolUse[0].matcher` 문자열 동일, url `?event=post_tool_use`, `Stop[0].hooks[0].url` `?event=stop`, `headers['X-Clauday-Secret']`
  - [x] 멱등: 같은 인자로 2회 → 2회차 false + 파일 내용 동일
  - [x] port/secret 이 바뀌면 재기록(true)
  - [x] `preApproveTrust`: configPath 파일 없음 → `'no-config'` / 이미 `hasTrustDialogAccepted:true` → `'already-trusted'`(파일 mtime·내용 불변) / false→ `'written'` 후 JSON 확인 / 깨진 JSON → `'failed'` + `console.warn` 호출(spy)
  - [x] **모든 케이스가 `mkdtempSync` 기반 tmp 경로만 사용. 실제 `~/.claude.json` 접근 금지**
- [x] `AgentWorkspaceManager.test.ts` — deps seam 으로 스텁 주입해 홈 오염 제거 (테스트 파일만 수정, 프로덕션 무변경). 기존 단언은 유지

### [main] M2 — `ClaudeHookRouter` 신설 (ADR-01)

- [x] `src/main/hooks/ClaudeHookRouter.ts` 신규
  - [x] `HookRoute { kind: string; id: string; meta?: Record<string, unknown> }`, `HookResolver`, `HookKindHandler` export
  - [x] `addResolver` / `setHandler(kind, handler)` / `dispatch(ev): Promise<void>`
  - [x] dispatch: resolver 등록 순서 first-match → 매칭 없으면 **무로그 no-op** → kind 핸들러 없으면 `console.warn('[ClaudeHookRouter] 핸들러 미등록 kind=..., id=...')` → 있으면 `await handler(ev, route)`
  - [x] resolver 가 throw → `console.warn` + 다음 resolver 로 계속. **핸들러 예외는 잡지 않고 전파**(HookServer 의 기존 catch 가 처리)
  - [x] `HookEventPayload` 는 `../dooray/mention/HookServer` 에서 **타입 전용 import** (HookServer 이동 금지 — 비목표)
- [x] `src/main/hooks/ClaudeHookRouter.test.ts` 신규 (AC6)
  - [x] resolver 3개 등록 → 2번째가 첫 매치일 때 3번째 resolver 미호출
  - [x] 전부 null → 핸들러 미호출, 예외 없음, `console.warn` 미호출
  - [x] 미등록 kind → warn 1회, 예외 없음
  - [x] 핸들러 reject → `dispatch` 가 reject (전파 확인)
  - [x] 핸들러의 Promise 를 await (완료 전에 dispatch 가 끝나지 않음)
  - [x] resolver throw → warn + 다음 resolver 결과로 라우팅
  - [x] 같은 kind 로 `setHandler` 2회 → 마지막 것으로 덮어씀

### [main] M3 — `MentionHookHandler` 로 멘션 로직 이사 (ADR-01)

- [x] `src/main/dooray/mention/MentionHookHandler.ts` 신규
  - [x] `export const MENTION_HOOK_KIND = 'mention'`
  - [x] `MentionHookDeps { getAgentRoot: () => string; sessions: Pick<ChannelSessionStore,'get'|'setClaudeSessionId'|'markIdle'>; responder: Pick<ClaudayResponder,'send'>; readTranscript?: (p: string) => string }`
  - [x] `turnBuffers` 를 인스턴스 필드로 (index.ts 모듈 스코프 Map 이동)
  - [x] `resolve(cwd)` = 원본 `extractChannelIdFromCwd` 그대로 + `{ kind: MENTION_HOOK_KIND, id: channelId }` 로 감싸기. **`getAgentRoot()` 를 매 호출마다 평가**(thunk — root 는 부팅 후 `setRoot` 로 바뀜)
  - [x] `handle(ev, route)` = 원본 `handleClaudeHook` 본문에서 channelId 추출부만 `route.id` 로 치환. 나머지 분기·순서·await 위치 동일
  - [x] **`try/finally` 로 `markIdle` 을 감싸지 말 것** — `send` 실패 시 markIdle 이 스킵되는 현행 동작을 보존 (ADR-05)
  - [x] `composeStopMessage` / `extractAssistantMessage` / `formatToolDetail` 을 named export 순수 함수로 이동 (본문 동일)
  - [x] `readLastAssistantText`·`truncateForMessenger` 는 `transcriptReader` 에서 import (truncate 는 composeStopMessage 내부에서 계속 직접 호출)
- [x] `diff <scratch>/c0/mentionhook.before` 로 허용 변형 외 차이 0 확인
- [x] `src/main/dooray/mention/MentionHookHandler.test.ts` 신규 — **이 트랙의 핵심 회귀 안전망** (AC7)
  - [x] resolve: `''` → null / agentRoot 밖 → null / agentRoot 자기 자신 → null / `<agentRoot>/123` → `123` / `<agentRoot>/123/tasks/x` → `123`
  - [x] resolve: `getAgentRoot` 가 도중에 다른 값을 반환하면 그 값이 즉시 반영됨 (thunk 검증)
  - [x] resolve: `<agentRoot>-sibling` → 현행은 `'..'` 반환. `// 현행 동작 고정 (ADR-v2-workspace-p0-05) — 개선은 후속` 주석 필수
  - [x] post_tool_use 3건 누적 후 stop → 본문에 `— 사용 도구: Read(a.ts), Bash(...), ...` 포함
  - [x] 도구 9건 → 앞 8건 + `외 1건`
  - [x] stop 2회 연속 → 2회차 본문에 도구 라인 없음(버퍼 비움 확인)
  - [x] `last_assistant_message` 3형태 파싱: `'text'` / `{content:[{type:'text',text}]}` / `{message:{content:[...]}}`
  - [x] 비어 있고 `transcript_path` 존재 → `readTranscript` 스텁 결과가 본문에 반영
  - [x] 둘 다 없음 → `'응답 완료.'`
  - [x] `transcript_path: '/x/y/abc-123.jsonl'` → `setClaudeSessionId(channelId, 'abc-123')` 호출
  - [x] `responder.send(channelId, body, orgId)` 의 orgId 가 `sessions.get()?.organizationId`, 세션 없으면 `undefined`
  - [x] 호출 **순서**: send → markIdle (`mock.invocationCallOrder` 비교)
  - [x] send reject 시 markIdle 미호출 + `handle` 이 reject (현행 고정, ADR-05 주석)
  - [x] 알 수 없는 event 이름(`'pre_tool_use'` 등) → 아무 것도 안 함

### [main] M4 — `index.ts` 재배선 (조립부 한정)

- [x] `src/main/index.ts:183-298` **전체 삭제** (`turnBuffers`, `handleClaudeHook`, `composeStopMessage`, `extractChannelIdFromCwd`, `extractAssistantMessage`, `formatToolDetail`)
- [x] 삭제 자리(≈182, `const hookServer = new HookServer()` 직후)에 조립부 추가
  ```ts
  const hookRouter = new ClaudeHookRouter()
  const mentionHookHandler = new MentionHookHandler({
    getAgentRoot: () => agentWorkspace.getAgentRoot(),
    sessions: channelSessionStore,
    responder: claudayResponder
  })
  hookRouter.addResolver((cwd) => mentionHookHandler.resolve(cwd))
  hookRouter.setHandler(MENTION_HOOK_KIND, (ev, route) => mentionHookHandler.handle(ev, route))
  ```
  - [x] `getAgentRoot` 는 **반드시 thunk** — 값으로 넘기면 `:376` 의 커스텀 root 사용자에서 멘션이 전부 무시된다
- [x] `:380` `hookServer.setHandler((ev) => handleClaudeHook(ev))` → `hookServer.setHandler((ev) => hookRouter.dispatch(ev))`
- [x] 죽은 import 제거: `:55` `readLastAssistantText, truncateForMessenger` 줄 전체, `:56` `relative/sep/basename` 줄 전체, `:54` 의 `type HookEventPayload`(`HookServer` 는 유지)
- [x] import 2줄 추가: `ClaudeHookRouter`, `{ MentionHookHandler, MENTION_HOOK_KIND }`
- [x] `grep -n "handleClaudeHook\|turnBuffers\|extractChannelIdFromCwd\|composeStopMessage\|extractAssistantMessage\|formatToolDetail" src/main/index.ts` → **0건** (AC9)
- [x] `src/main/index.test.ts` 무수정 통과 확인 (채널 카탈로그 불변)

### [renderer] R1 — `taskStyles` + `TaskRow` 추출 (ADR-03)

- [x] `src/renderer/src/components/Dooray/taskStyles.ts` 신규 — 원본 `ProjectTaskView.tsx:11-76` 텍스트 그대로
  - [x] export: `WORKFLOW_ICONS`, `WORKFLOW_COLORS`, `WORKFLOW_BG_COLORS`, `getWorkflowName`, `tagStyle`
  - [x] 비export 유지: `TAG_STYLE_CACHE`, `currentTheme`, `hexToHsl`
  - [x] `theme-changed` 리스너 등록 블록(`if (typeof window !== 'undefined')`) 동반 이동 — **한 곳에만 존재**해야 함
  - [x] `React.CSSProperties` 표기 그대로 유지(diff 0 목적)
- [x] `src/renderer/src/components/Dooray/TaskRow.tsx` 신규 — 원본 `78-157` 텍스트 그대로
  - [x] `TaskRowProps` export, `TaskRow` default export + named export 둘 다 (후속 트랙 import 편의)
  - [x] comparator 를 `export function taskRowPropsAreEqual(prev, next)` 로 승격 후 `memo(TaskRow, taskRowPropsAreEqual)` — 조건식 6줄 동일
  - [x] lucide `Circle`, `ChevronRight` import
- [x] `ProjectTaskView.tsx` 수정
  - [x] 11-157 삭제 후 `import TaskRow from './TaskRow'` + `import { getWorkflowName, tagStyle } from './taskStyles'`
  - [x] 죽은 import 제거: react `memo`, lucide `CheckCircle2`·`Circle`·`Clock`·`AlertCircle` (`ChevronRight` 는 :465/:499 에서 계속 사용 → 유지)
  - [x] 사용처 3곳(`:287`, `:314` getWorkflowName / `:513` tagStyle)이 새 import 로 해소되는지 확인
  - [x] `<TaskRow ...>` 호출부(`:543`) 무수정
- [x] `diff <scratch>/c0/taskstyles.before`, `diff <scratch>/c0/taskrow.before` — 허용 변형 외 차이 0
- [x] `src/renderer/src/components/Dooray/taskStyles.test.ts` 신규 (AC5)
  - [x] `getWorkflowName`: `workflow.name` > `workflowName` > `workflowClass` > `'알 수 없음'` 4단
  - [x] `tagStyle(undefined)` / `tagStyle('ffffff')` → `{}`
  - [x] light(`data-theme` 미설정/`light`) 와 dark 에서 서로 다른 값
  - [x] 같은 인자 2회 → **동일 참조**(캐시 히트)
  - [x] `window.dispatchEvent(new CustomEvent('theme-changed'))` 후 → 새 참조
  - [x] `WORKFLOW_BG_COLORS` 키 5개(backlog/registered/working/done/closed) 존재
- [x] `src/renderer/src/components/Dooray/TaskRow.test.tsx` 신규 (AC4)
  - [x] RTL 스냅샷 3종: 기본 / `isSelected` / 태그 4개 + milestone + dueDateAt (`+1` 배지 + title 확인)
  - [x] 행 클릭 → `onSelect(task)` 1회
  - [x] 태그 칩 클릭 → `onToggleTag(name)` 1회 **+ `onSelect` 미호출**(stopPropagation)
  - [x] `workflowClass` 없음 → `registered` 기본 아이콘/색
  - [x] `taskRowPropsAreEqual` 단위 테스트 6필드: id/subject/workflowClass/tags(참조 비교)/isSelected/currentTagFilter 각각 변할 때 false, 전부 같으면 true, **`onSelect`/`onToggleTag` 참조만 바뀌면 true**(현행 고정 — 스테일 클로저 특성)
- [x] (선택) `ProjectTaskView` 스모크 렌더 1건 — `installMockWindowApi()` + 태스크 2건 목록 렌더 확인 (import 경로/부수효과 이중등록 탐지용)

### [renderer] R2 — `DiffPanel` / `FileComparePanel` 추출 (ADR-04)

- [x] `src/renderer/src/components/Git/DiffPanel.tsx` 신규 — 원본 `BranchWorkspace.tsx:805-891` 텍스트 그대로
  - [x] `DiffPanelProps` export: `result: GitDiffResult`, `branch: string`, `repoPath: string`, `onFileCompare?`
  - [x] 본문 구조분해는 `{ result, onFileCompare }` 만. 미사용 2개는 인터페이스에만 남기고 주석 1줄(ADR-04)
  - [x] lucide `CheckCircle2`, `Eye` import
  - [x] shared 타입: `import type { GitDiffResult } from '../../../../shared/types/git'` (경로 별칭 대신 기존 파일들과 같은 상대 경로 관례 준수)
- [x] `src/renderer/src/components/Git/FileComparePanel.tsx` 신규 — 원본 `893-923` 텍스트 그대로. props `{ result: GitFileCompare; onBack: () => void }`
- [x] `BranchWorkspace.tsx` 수정
  - [x] 805-923 삭제 + import 2줄 추가 (`export default BranchWorkspace` 는 파일 끝에 유지)
  - [x] 죽은 import 제거: lucide `Eye`(:862 가 유일 사용처였음). **`CheckCircle2` 는 :383 에서 계속 사용 → 유지**
  - [x] 로컬 `FileDiff`/`DiffResult`/`CompareResult` 인터페이스 **삭제하지 않는다**(ADR-04 — `ChangedFilesList`·state 가 계속 사용)
  - [x] 호출부 3곳(`:684`, `:695`, `:703`) 무수정
- [x] `diff <scratch>/c0/diffpanel.before`, `diff <scratch>/c0/filecompare.before` — 허용 변형 외 차이 0
- [x] `src/renderer/src/components/Git/DiffPanel.test.tsx` 신규 (AC4)
  - [x] `files: []` → `변경사항 없음`
  - [x] 파일 3건 → `3개 파일 변경 · <summary>` + 상태 라벨 `수정/추가/삭제/미추적` 매핑
  - [x] `onFileCompare` 미전달 → 비교 버튼 없음 / 전달 → 클릭 시 파일 경로 인자 확인
  - [x] `patch` 라인 클래스: `+`(단, `+++` 제외) / `-`(`---` 제외) / `@@` 3분기
  - [x] 스냅샷 1건
- [x] `src/renderer/src/components/Git/FileComparePanel.test.tsx` 신규 — 좌/우 브랜치명·내용 렌더, `← 목록으로` 클릭 시 `onBack` 1회, 스냅샷 1건

### [공통] V — 검증 게이트

- [x] `npm run test:run` 전체 통과 (기존 테스트 무수정 — 예외는 M1 의 `AgentWorkspaceManager.test.ts` deps 주입뿐) — 127 files / 1878 tests 전부 통과
- [x] `npm run typecheck` (node + web) 통과 — 0 에러
- [x] `npm run test:coverage` — 70% 라인 게이트 유지 (AC10) — 전체 79.81% lines(신규 main 모듈 3개: `claudeDirSetup.ts` 100%, `ClaudeHookRouter.ts` 100%, `MentionHookHandler.ts` 94.94%)
- [ ] `npm run dev` 기동 후 **수동 QA A (renderer, AC12)**: 두레이 태스크 목록(선택 하이라이트/태그 클릭 필터/`+N` 배지/마감 표기) + Git 뷰 3패널(변경사항 / 브랜치 비교 / 파일 비교) 눈으로 비교. 테마 토글 후 태그 칩 색 갱신 확인 — main-process-engineer 범위 밖(renderer 미접촉, 실행 환경 없음) — integrator/사용자 수행 필요
- [ ] **수동 QA B (main, AC11)**: 실제 두레이 채널에서 `@clauday` 멘션 → 터미널 spawn → `[Clauday]` 응답 회신 + `— 사용 도구:` 라인 → 같은 채널 재멘션 시 `--resume` 로 이어지는지(= claudeSessionId 보존) 확인 — 실제 두레이 채널·claude code CLI 필요, 이 세션에서는 미수행. characterization 테스트(AC7, 25건)로 로직은 검증됨 — integrator/사용자 수행 필요
- [x] `git diff --stat` 로 스코프 밖 파일이 없는지 최종 확인 — main 파트 기준 8개 파일(신규 5 + 수정 3)만 변경, `src/shared/**`/`src/preload/**` main 파트 변경 0. (단, 이 브랜치에는 병렬 진행 중인 다른 트랙(v2-terminal-p1 등)의 무관 변경이 함께 있어 `git diff --stat` 전체 출력에는 그쪽의 `src/preload/index.ts`, `src/shared/types/ipc.ts`, `src/shared/types/terminal.ts` 등이 섞여 나타난다 — C-0 main 파트가 만든 diff 는 아님)

---

## impl-log 규약 (append-only)

`feature/workspace/v2-workspace-p0/impl-log.md` 한 파일에 **main / renderer 가 각자 append**. 남의 섹션 수정·삭제 금지, 항상 파일 **맨 아래**에 추가.

- [ ] 첫 작성자가 frontmatter 생성
  ```yaml
  ---
  task: v2-workspace-p0
  agent: main-process-engineer   # 먼저 쓰는 쪽
  date: 2026-07-30
  ---
  ```
- [ ] 이후 작성자는 frontmatter 를 건드리지 않고 아래 형태로 append
  ```md
  ## [renderer-engineer] 2026-07-XX
  ```
- [ ] 각 섹션 필수 항목 (artifact-validation 규약 + 이 트랙 추가분)
  - `## [<agent>] 변경한 파일` — 신규/수정/삭제 구분, 파일마다 1~2줄 요약
  - `## [<agent>] 무동작변경 검증` — baseline `diff` 결과(차이 0 또는 허용 변형 N건 목록) + `npm run test:run` 통과 수치 + typecheck 결과
  - `## [<agent>] 발견했으나 고치지 않은 것` — **ADR-05 필수 섹션.** `파일:행 · 재현 조건 · 제안 수정 · 넘길 트랙(C-1/C-2/C-3)`. 없으면 `없음 — 명시적 기록`(단, 0건이면 검토 부실 신호이니 한 번 더 훑을 것)
  - `## [<agent>] 결정 사항 (해야 할 것)` / `## [<agent>] 제약 (하지 말 것)` — 후속 트랙에 넘길 전제. 없으면 `없음 — 명시적 기록`
  - `## [<agent>] 참조` — 관련 ADR 번호, 원본 파일:행
- [ ] ADR 과 다르게 구현한 부분이 있으면 **반드시** `결정 사항` 에 사유와 함께 기록 (ADR 수정 금지 — 필요하면 새 ADR 로 supersede)

## 산출물 체크 (integrator 인계 전)

- [ ] `plan.md` 의 모든 체크박스 `[x]`
- [ ] `impl-log.md` 존재 + main/renderer 양쪽 섹션
- [ ] `.agent/wiki/decisions-log.md` 에 ADR 5건 한 줄 요약 추가 (integrator 수행)
- [ ] `.agent/wiki/domain-dooray-bot.md` 갱신 — "핵심 파일" 에 `MentionHookHandler.ts` / `hooks/ClaudeHookRouter.ts` 추가, Stop hook 흐름도에 라우터 1홉 반영 (integrator 수행)
- [ ] `ClaudeManual.tsx` / `CHANGELOG.md` — **이번 트랙 대상 아님**(사용자 가시 변화 0). v2.0 Phase 4 에서 일괄

## 참조

- `prd.md`(AC1~AC12) · `adr.md`(ADR-01~05) — 같은 폴더
- 마스터 설계 `~/.claude/plans/toasty-sleeping-simon.md` §Workstream C-0 ~ C-3.5
- `.agent/wiki/domain-dooray-bot.md` — 멘션 파이프라인 / Stop hook / HookServer secret
- 테스트 인프라: `test/helpers/mockWindowApi.ts`, `test/helpers/renderWithDs.tsx`, `test/mocks/electron-store.ts`
- 선례: `src/main/dooray/mention/AgentWorkspaceManager.test.ts`(tmpdir 패턴), `src/main/index.test.ts`(electron 모킹)
