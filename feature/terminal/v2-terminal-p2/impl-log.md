---
task: v2-terminal-p2
date: 2026-07-30
---

# Impl Log — v2.0 Phase 2 터미널 대개편

## [renderer] B-3

이번 라운드는 S-0(공유 계약) + B-3(TerminalPane prop 분리) + windows-fix ADR-03 §4(windowsPty 게이트)
세 가지를 renderer-engineer 가 함께 수행했다 — main-process-engineer 2명이 세션/스킬/MCP 와
workspace 도메인+GitService 트랙에 있어 병렬 착수가 필요했기 때문.

### 변경한 파일

**S-0 (공유 계약 — plan.md 상 main-process-engineer 몫이지만 이번 라운드는 renderer 가 겸함)**
- `src/shared/types/terminal.ts` — `SplitDirection`/`SplitLeaf`/`SplitBranch`/`SplitNode`,
  `TerminalPaneSnapshot`, `TerminalTabSnapshot`, `TerminalWorkspaceSnapshotV2`,
  `TerminalResolvePathRequest`, `TerminalResolvedPath` 추가 (ADR-02 §1, ADR-03 §1 그대로)
- `src/shared/types/ipc.ts` — `TERMINAL_SAVE_STATE`/`TERMINAL_RESTORE_STATE`/
  `TERMINAL_REQUEST_STATE`/`TERMINAL_RESOLVE_PATH` 4채널 추가. `TERMINAL_RESTORE`/`TERMINAL_REORDER`
  는 **삭제하지 않음**(plan.md 지시대로 M-A-4 에서 소비처와 함께 제거 예정)

**B-3**
- `src/renderer/src/components/Terminal/paneActivation.ts` (신규) — `resolvePaneActivation`
- `src/renderer/src/components/Terminal/paneActivation.test.ts` (신규, 10 tests)
- `src/renderer/src/components/Terminal/TerminalPane.tsx` (수정) — `isVisible`/`isFocused`/
  `onFocusRequest`/`showFocusRing` prop 추가, `isActive` optional + `@deprecated`, `forwardRef` +
  `TerminalPaneHandle{serialize,focus,fit}` export, mount effect 안 fit/focus/paste 를
  `[visible,sessionId]`/`[focused]`/`[focused]` 3개 effect 로 분리, `ResizeObserver` 는
  `visibleRef` 로 visible=false 구간 fit 스킵, `onFocusRequest` 를 pointerdown 캡처 + xterm
  textarea `focus` 리스너 양쪽에서 배선
- `src/renderer/src/components/Terminal/TerminalPane.test.tsx` (수정) — 기존 23개 케이스 **무수정**
  유지 + B-3/windowsPty 신규 describe 2블록 추가(총 33 tests). mock 보강: `FitAddon.proposeDimensions`
  가 `undefined` 고정값 대신 `{cols:80,rows:24}` 를 반환하도록, `Terminal` 생성자 옵션을
  `lastTerminalOptions` 로 캡처하도록 확장

**windows-fix ADR-03 §4 (windowsPty 게이트 — 이번 라운드에 함께 수행)**
- `src/shared/utils/windowsPty.ts` (신규) — `windowsPtyOptions(platform, osRelease)`
- `src/shared/utils/windowsPty.test.ts` (신규, 7 tests — plan.md §3-4 명시 케이스 그대로)
- `src/preload/index.ts` (수정) — `api.system = { platform: process.platform, osRelease: release() }`
  정적 값 1건 추가(IPC 채널 아님). `TerminalPane.tsx` 에서 `new Terminal({ ...(windowsPty ? {windowsPty} : {}) })`
  로 소비
- `test/helpers/mockWindowApi.ts` (수정) — `system: { platform: 'darwin', osRelease: '23.0.0' }` 기본값 추가

**기타**
- `feature/terminal/v2-terminal-p2/plan.md` — S-0 · B-3 · Gate 1 체크박스 갱신

### 결정 사항 (해야 할 것)

- **S-0 확정 필드/채널** (B-4/B-5/M-A/M-B 가 그대로 참조하면 됨):
  `TerminalPaneSnapshot{cwd?,cols,rows,serialized}` /
  `TerminalTabSnapshot{tabId,name,tree,focusedLeafId,panes:Record<leafId,TerminalPaneSnapshot>}` /
  `TerminalWorkspaceSnapshotV2{version:2,savedAt,activeTabId,tabs}` /
  `TerminalResolvePathRequest{sessionId?,cwdHint?,candidates}` /
  `TerminalResolvedPath{candidate,resolved,kind:'file'|'directory'|null}`.
  채널 4개 문자열은 plan.md S-0 원문 그대로(`terminal:save-state` 등). `TERMINAL_RESTORE`/
  `TERMINAL_REORDER` 는 이번 커밋에서 살아있다 — 지우는 순간 그 소비처(`TerminalManager.exportSessions`,
  preload `restoreSaved`/`reorder`, `index.ts` 핸들러)도 같이 지워야 컴파일이 깨지지 않는데
  그건 M-A-4 스코프.
- `TerminalPaneHandle.fit()` 은 mount effect 안에서 매 마운트마다 새로 만들어지는
  `safeResize(fitAddon)` 클로저를 `fitFnRef`(모듈 스코프가 아닌 컴포넌트 인스턴스 ref)에 담아
  effect 밖에서도 호출 가능하게 했다. B-4(리페어런트) · B-5(복원 13단계)가 이 ref 를 그대로 쓰면 된다.
- `showFocusRing` prop 을 신설해 포커스 링(`.pane.focused` 1.5px 보더)/dim(`.pane.dimmed` opacity .7)
  스타일을 게이팅했다. 레거시 3호스트는 이 prop 을 넘기지 않으므로 시각적으로 완전히 무변화 —
  B-4 의 `SplitLayout` 만 `true` 로 넘기면 된다.
- windowsPty 값 전달은 `window.api.system` 정적값 → `windowsPtyOptions()` 순수 함수 → 결과가
  `undefined` 면 `new Terminal({...})` 스프레드에서 `windowsPty` 키 자체를 넣지 않는 방식을 택했다
  (xterm 기본 동작 완전 보존, 조건부 프로퍼티 존재 여부로 판정 가능).
- `paneActivation.ts` 는 순수 함수 하나만 export 하고 `??` 우선순위(`isVisible ?? isActive ?? true`,
  `isFocused ?? isActive ?? false`) 를 컴포넌트 본문에 흩뿌리지 않았다 — ADR-01 §1 그대로.

### 알려진 편차 (plan.md 문면과 다르게 구현한 지점)

- **R3-4 "분할 시뮬레이션 — paste 1회 → `saveAttachment` 1회"**: 실제 구현(`sendFileAsPath`)은
  `File.path` 가 이미 채워진 경우(드래그&드롭, 그리고 본 테스트가 쓰는 clipboard `getAsFile()` mock)
  `saveAttachment` IPC 자체를 스킵하고 바로 `terminal.input` 으로 경로를 보낸다 — 클립보드
  이미지(`Blob`)만 `saveAttachment` 를 탄다. 기존 파일 드롭 테스트(`makeDroppedFile`)와 동일하게
  `.path` 프로퍼티를 채운 File 로 시뮬레이션했기 때문에, 검증 지점을 `saveAttachment` 대신
  `terminal.input` 호출 1회(그리고 정확히 어느 세션으로 갔는지)로 바꿨다. 검증하려는 본질
  ("focused pane 1곳에만 paste 가 전달된다")은 동일하게 고정된다.

### 제약 (하지 말 것) — 실제로 지킨 것

- `TerminalView.tsx` / `MentionAgentView.tsx` / `BranchWorkspace.tsx` 와 그 테스트 3파일은
  **무수정**. `git diff --stat` 로 0줄 확인(아래 검증 로그).
- `splitTree.ts` / `SplitLayout.tsx` 신설 없음 — B-4(다음 라운드) 몫.
- `src/main/**` 무수정. preload 는 `api.system` 정적 값 1건만 추가, 신규 IPC 채널 0개.
- `TERMINAL_RESTORE` / `TERMINAL_REORDER` 삭제하지 않음 — M-A-4 에서 소비처와 같은 커밋으로.
- `ClaudeManual.tsx` 미수정 — B-3 와 windowsPty 게이트 둘 다 사용자에게 보이는 새 토글/단축키가
  없는 내부 리팩터/휴리스틱이라 매뉴얼 대상 아님(마감 단계 V 에서 split·영속화·렌더러토글·링크가
  한 번에 추가될 예정).
- `TerminalManager` 의 spawn/플랫폼 분기, `AIService`/`ClaudeChatService`/멘션 파이프라인 미접근.

### 검증

- `npx vitest run src/renderer/src/components/Terminal src/renderer/src/components/MentionAgent src/renderer/src/components/Git` → **12 files / 111 tests all green** (`TerminalPane.test.tsx` 23 tests — 기존 13 + B-3 신규 7 + windowsPty 신규 3, `TerminalView.test.tsx` 8 / `MentionAgentView.test.tsx` 2 무수정 통과)
- `npx vitest run src/shared/utils/windowsPty.test.ts src/renderer/src/components/Terminal/paneActivation.test.ts` → green
- `git diff --stat src/renderer/src/components/Terminal/TerminalView.tsx src/renderer/src/components/MentionAgent/MentionAgentView.tsx src/renderer/src/components/Git/BranchWorkspace.tsx src/renderer/src/components/Terminal/TerminalView.test.tsx src/renderer/src/components/MentionAgent/MentionAgentView.test.tsx` → **출력 없음(0줄)**
- `npx tsc --noEmit -p tsconfig.web.json` → 내 스코프 파일 오류 0. 계속 남아있는 오류 2건은
  `src/main/claude/ClaudeSessionService.ts` → `src/main/utils/claudeProjects.ts` →
  `src/main/utils/paths.ts` 참조 체인의 TS6307(해당 파일이 tsconfig.web.json `include` 목록에
  없음)이며, 셋 다 내가 건드리지 않은 workspace/GitService 병렬 트랙(main-process-engineer) 파일이다
  (`git status` 로 확인 — working tree 에 이미 수정 상태로 존재). `npx tsc --noEmit -p tsconfig.node.json`
  (preload 포함)은 시종 **완전 통과**.
- `npx vitest run`(전체, 최종) → **142 files / 2205 tests all green**. 작업 중간에 한 번
  `src/main/workspace/workspaceState.test.ts` / `src/shared/workspace/branchName.test.ts` 2건이
  실패로 관찰됐으나(workspace/GitService 병렬 트랙의 진행 중 상태 스냅샷으로 추정 — 내가 그
  파일들을 수정한 적은 없음), 재실행 시점엔 전부 통과로 안정화됐다. 위 tsc TS6307 2건은 vitest
  실행(esbuild 트랜스파일, 프로젝트 참조 미검사)에는 영향을 주지 않아 테스트 자체는 계속 green.
- `npx vitest run src/main/index.test.ts` → 8 tests green (IPC 채널 4개 추가가 event-only/handle
  게이트에 영향 없음 확인)

### Gate 1 조건 충족

- [x] `npx tsc --noEmit -p tsconfig.web.json` — 내 스코프 파일 기준 통과(위 참조)
- [x] `npx vitest run src/renderer/src/components/Terminal src/renderer/src/components/MentionAgent` — green
- [x] 레거시 3호스트 diff 0줄 확인
- [ ] 수동 QA(터미널 탭 3개 전환 → 포커스/입력/fit 현행과 동일) — 헤드리스 환경이라 미실시,
  통합(integrator) 단계에서 확인 필요

### 참조

- ADR-v2-terminal-p2-01 (`adr.md`) — isVisible/isFocused 분리
- ADR-v2-terminal-p2-02/03 (`adr-02-split-tree.md`, `adr-03-persistence-v2.md`) — S-0 타입 스키마 원출처
- ADR-v2-windows-fix-03 §4 (`feature/windows-compat/v2-windows-fix/adr-03-windows-pty-spawn.md`) — windowsPty 게이트
- `feature/windows-compat/v2-windows-fix/plan.md` §3-4/§7-1 — windowsPty 구현 스펙 원문(그대로 구현)
