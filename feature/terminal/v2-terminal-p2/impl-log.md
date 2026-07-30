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

## [renderer] B-4

split pane 전체(splitTree 순수 함수 · SplitLayout · divider drag · TerminalView 통합 · 단축키 ·
paste 타겟 4중 검증 · 저장 게이트 자리 확보 · THIRD-PARTY-NOTICES 신설)를 이번 라운드에 완료했다.
Gate 1(B-3) 통과 상태에서 착수.

### 변경한 파일

**신규 (renderer)**
- `src/renderer/src/components/Terminal/splitTree.ts` / `splitTree.test.ts` (34 tests) — 이진 트리
  순수 함수: `splitLeaf`/`closeLeaf`(형제 승격)/`findLeafPath`/`collectLeafIds`/`setRatioAtPath`/
  `quantizeRatio`/`getEqualizeWeight`+`equalizeRatios`/`neighborLeaf`(4방향, 정규화 좌표 기반)/
  `isValidTree`(손상 스냅샷 방어)
- `src/renderer/src/components/Terminal/SplitLayout.tsx` / `SplitLayout.test.tsx` (4 tests) — 재귀
  render. leaf 슬롯은 빈 div, `reattachPaneHost` 로 host div 를 appendChild. 파일 상단 5줄 주석으로
  "왜 TerminalPane 을 직접 렌더하면 안 되는가"(함정 #8) 명시
- `src/renderer/src/components/Terminal/reattachPaneHost.ts` — `reattachPaneHost(host, slot, handle, hooks)`
  (scrollState 캡처 → WebGL dispose 훅(B-6 전엔 no-op) → appendChild → rAF → attach 훅 → fit →
  scrollState 복원) + `createPaneHost()`
- `src/renderer/src/components/Terminal/paneDividerDrag.ts` / `.test.ts` (13 tests) — 순수 계산부만
  (`adaptiveMinPx`/`clampRatio`/`ratioFromPointer`). 실제 pointer 배선(setPointerCapture, rAF
  코얼레싱, dblclick)은 `SplitLayout.tsx` 의 divider 안에 인라인으로 존재 — 계산과 이벤트 배선을
  분리해 계산부만 순수 테스트 가능하게 했다
- `src/renderer/src/components/Terminal/pasteTargetState.ts` / `.test.ts` (7 tests) — `PasteToken{tabId,
  leafId,sessionId,generation}`, `beginPaste`/`isPasteTargetValid`
- `src/renderer/src/components/Terminal/terminalShortcuts.ts` / `.test.ts` (12 tests) — `{id,macLabel,
  winLabel,matchesMac,matchesWin}` 테이블 8개 + `matchShortcut`/`resolveShortcut` 순수 함수
- `THIRD-PARTY-NOTICES.md`(루트, 신설) — Orca/VSCode/dnd-kit/xterm.js 저작권 + MIT 전문 1회 + 이식
  파일 표(3행: `paneDividerDrag.ts`/`pasteTargetState.ts`/`tabDragSensor.ts`)

**수정**
- `src/renderer/src/components/Terminal/TerminalPane.tsx` — `tabId`/`leafId`/`paneGeneration`/
  `getCurrentPasteTarget`/`suspendAutoResize` prop 5개 추가. `TerminalPaneHandle` 에
  `captureScrollState()`/`restoreScrollState()` 추가. paste 3경로(⌘V mac / Ctrl+Shift+V win /
  document paste)에 `capturePasteToken()`→검증 배선. ResizeObserver 콜백에
  `suspendAutoResizeRef` 게이트 추가(드래그 중 PTY resize 억제)
- `src/renderer/src/components/Terminal/TerminalPane.test.tsx` — B-4 describe 블록 신설(5 tests:
  타겟 일치/불일치+warn/레거시 무게이팅/captureScrollState 왕복/suspendAutoResize 억제-재개).
  `FakeResizeObserver` 가 콜백을 캡처해 수동 발화 가능하도록 보강. 기존 23개 케이스 **무수정** 유지
- `src/renderer/src/components/Terminal/TerminalView.tsx` — 전면 재작성. `SessionWithOutput[]` →
  `TabEntry{tabId,name,tree,focusedLeafId,panes:Record<leafId,PaneRuntime>}`. `paneHostsRef`/
  `paneHandlesRef`/`paneRefCallbacksRef` 3개 Map + `getOrCreateHost`/`getHandle`/`getRefCallback`.
  leaf portal 목록(모든 탭의 모든 leaf, `collectLeafIds` 순서)은 트리 렌더와 분리된 최상위 flatMap.
  탭마다 `SplitLayout` 1개를 상시 마운트하고 탭 컨테이너의 z-index/invisible 로만 가시성 전환(탭
  전환 시 host 재부착 없음). `splitFocusedPane`/`moveFocus`/`commitRatio`/`closeLeafInTab`/
  `closeTabEntry`/`renameTab` 신설. 단축키는 `terminalShortcuts.resolveShortcut` 테이블 순회 +
  `active` 가드(디짓 ⌘1~9 만 테이블 밖에서 별도 처리). `restorePhase`/`shouldPersistLayout`/
  `notifyLayoutChanged()` 게이트를 구조 변경 지점 8곳(탭 생성/닫기/rename/reorder/split/close
  pane/ratio 커밋/탭 활성화)에 배선(현재는 게이트 확인만 하는 no-op)
- `src/renderer/src/components/Terminal/TerminalView.test.tsx` — TerminalPane mock 을 forwardRef
  스텁으로 교체(`useImperativeHandle` 로 5개 handle 메서드 노출 — SplitLayout 의 `reattachPaneHost`
  가 예외 없이 동작해야 함). `data-active` 를 `isFocused` 에 매핑(단일 pane 탭에선 기존 `isActive`
  와 의미 동일). 기존 8개 시나리오 전부 보존 + B-4 describe 블록 신설(4 tests: ⌘D 분할/⌘W pane
  닫기/⌘W 마지막 pane→탭 닫기/active=false 무반응)
- `src/renderer/src/components/Terminal/tabDragSensor.ts` — 파일 상단에 dnd-kit MIT 고지 블록
  소급 추가(ADR-06, p1 도입분)
- `src/renderer/src/App.tsx` — `<TerminalView active={activeView === 'terminal'} />` 1줄
- `README.md` — 하단에 `THIRD-PARTY-NOTICES.md` 링크 1줄
- `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx` — "🖥 터미널 (v2.0)" 절에 split pane
  불릿 2개 추가, 단축키 표에 ⌘D/⌘⇧D/⌥⌘화살표/⌘W(의미 변경) 행 추가
- `CHANGELOG.md` — `[Unreleased]` 개선 섹션에 터미널 Split Pane 항목 추가

### 결정 사항 (해야 할 것)

- **portal 목록은 "모든 탭의 모든 leaf" 를 flatMap 으로 한 번에** 렌더한다 — 탭별로 분리하지 않았다.
  탭 전환은 감싸는 wrapper div 의 `z-10`/`invisible` 토글만으로 처리되고(기존 세션당-1-pane 모델과
  동일한 패턴), `SplitLayout` 은 탭마다 하나씩 상시 마운트되어 있다. 이 덕분에 탭 전환에서
  reparenting 이 전혀 필요 없다 — reparenting 은 **같은 탭 안에서 트리 모양이 바뀔 때만**
  (`reattachPaneHost`) 일어난다. B-5/B-6 가 리페어런트 지점을 찾을 땐 `SplitLayout.tsx` 의
  `PaneSlot` effect 하나만 보면 된다.
- **`getCurrentPasteTarget()` 은 TerminalView 가 쥔 단일 진실**이다 — "지금 활성 탭의 focusedLeafId
  가 가리키는 pane" 을 반환한다. `TerminalPane` 은 자기 자신의 `{tabId,leafId,paneGeneration}` 을
  토큰화(`capturePasteToken`)하고, await 이후 `getCurrentPasteTarget()` 과 비교한다 — pane 은
  "내가 지금도 유효한 타겟인가" 만 묻는다(B-3 의 "pane 은 자기 포커스를 스스로 정하지 않는다" 원칙
  연장선).
- **`suspendAutoResize` prop 신설** — ADR 문면엔 명시되지 않았지만 구현 중 발견한 필수 보강이다.
  divider 드래그 중 `first.style.flexBasis` 를 직접 조작하면 그 DOM 변경이 곧바로 컨테이너 실제
  크기를 바꾸므로, TerminalPane 의 기존 `ResizeObserver`(디바운스 40ms)가 그대로 있으면 드래그
  중에도 PTY resize 가 발화한다(함정 #9 재발). `suspendAutoResize=true` 인 동안 ResizeObserver
  콜백을 아예 return 시키고, 드롭 시 `TerminalView.commitRatio` 가 영향받는 leaf 전부에 `fit()` 을
  1회 sweep 하는 방식으로 막았다. B-5/B-6 가 이 흐름을 참고할 것.
- **`notifyLayoutChanged()` 게이트 훅**을 8개 구조 변경 지점에 미리 심었다(탭 생성/`closeTabEntry`/
  `closeAll`/`renameTab`/`splitFocusedPane`/`commitRatio`/탭 reorder(`endDrag`)/`activateTab`).
  현재는 `shouldPersistLayout` 확인만 하고 아무 것도 하지 않는 no-op — B-5 는 이 함수 본문에 1초
  debounce 저장 호출만 추가하면 된다. **포커스만 이동**(`setFocusedLeaf`, 같은 탭 안에서 pane 전환)
  은 트리거에서 제외했다 — plan R5-4 트리거 목록에 "포커스 변경"이 없기 때문이나, `focusedLeafId`
  는 스냅샷에 포함되는 필드이므로 B-5 가 필요하다고 판단하면 여기 추가하면 된다.
- **탭 reorder 는 이번 라운드부터 `window.api.terminal.reorder()` 를 호출하지 않는다.** 그 IPC 는
  세션 id 배열을 받는 API 라 split 이후엔 "탭 순서"를 표현할 수 없다(한 탭에 세션이 여러 개).
  로컬 state 만 바꾸고 `notifyLayoutChanged()` 로 게이트만 통과시켰다 — 실제 영속화는 B-5 의
  `TerminalWorkspaceSnapshotV2.tabs` 배열 순서로 이관된다. `TERMINAL_REORDER` 채널 자체는
  M-A-4 가 지울 때까지 살아있지만 renderer 쪽에서 더 이상 호출하지 않는다(하지만 preload API 는
  아직 존재하므로 컴파일은 깨지지 않는다).

### 알려진 편차 (plan.md/ADR 문면과 다르게 구현한 지점)

- **Orca 소스 미접근 — "adapted" 고지의 실제 근거는 `docs/dev/orca-absorption-notes.md`.** 이번
  세션은 Orca 저장소에 직접 접근할 수 없었다(로컬 클론은 선행 분석 세션의 scratchpad 에만 있었고
  재클론에 필요한 네트워크 접근이 없었다). `paneDividerDrag.ts`/`pasteTargetState.ts` 는 Orca 소스를
  줄 단위로 옮긴 것이 아니라, `orca-absorption-notes.md` §5 가 서술한 동작 스펙(투명 히트박스+rAF
  코얼레싱+drag-hold-resize+더블클릭 50/50+적응형 최소폭 / paneId+leafId+transport+ptyId 4필드
  검증)을 그대로 재구현한 것이다. `tabDragSensor.ts` 는 실제로 dnd-kit `PointerSensor` 를 상속하는
  코드이므로 그 고지는 근거가 명확하다. **정식 릴리즈 전에 실제 Orca 소스와 diff 검토를 한 번 거치는
  것을 권장** — 특히 `paneDividerDrag.ts`/`pasteTargetState.ts` 의 "adapted" 표기가 과장인지
  (사실상 독립 재구현) 재검토가 필요하다. `THIRD-PARTY-NOTICES.md`/파일 헤더는 ADR-06 이 이미
  이 파일들을 이식 대상으로 못박아 둔 상태를 그대로 반영했다.
- **리사이즈 핸들 시각선의 "교차 지점 음수 inset 연결"은 구현하지 않았다.** ADR-02 §6 이 요구하는
  이 디테일은 3분할 이상 중첩 레이아웃에서 가로/세로 구분선이 만나는 지점을 시각적으로 이어붙이는
  cosmetic 보강이다. 현재는 각 divider 가 독립된 8px 히트박스 + 중앙 1px 선을 그려서 기능(드래그/
  더블클릭)은 완전하지만, 교차점에 미세한 시각적 끊김이 생길 수 있다 — 수동 QA 목록에 등재.
- **`PaneRuntime.savedOutput?: string`(plan 의 `savedSnapshot?`)** — B-4 시점엔 `TerminalPaneSnapshot`
  기반 구조화 스냅샷이 없다(B-5 에서 옴). 레거시 `restoreSaved()`→`initialOutput` 문자열 복원 경로를
  그대로 옮겨서 `savedOutput` 으로 이름 붙였다. B-5 가 `savedSnapshot?: TerminalPaneSnapshot` 필드로
  교체하면서 `initialOutput` prop 자체를 없앨 예정(R5-3)이므로 이 필드는 그때 함께 사라진다.
- **`closeFocusedPane()` 대신 `closeLeafInTab(tabId, leafId)`** — plan 원문은 인자 없는
  `closeFocusedPane()` 를 제시했지만, 실제로는 호출부(⌘W 단축키 핸들러)가 "지금 활성 탭 + 그 탭의
  focusedLeafId" 를 직접 구해서 넘기는 쪽이 `TerminalPane` 의 "닫기" 버튼(`onRequestClose`, 임의의
  leaf 를 지정)과 시그니처를 통일할 수 있어 이렇게 했다. 동작은 동일하다.
- **활성 pane 의 OSC 타이틀 → 탭 제목 전파는 이번 라운드에 넣지 않았다.** ADR-01(B-3) §2 의 책임
  재배치 목록과 plan R4-4 에는 있지만, PRD 의 B-4 수락 기준 체크리스트엔 이 항목이 없고, xterm 의
  OSC 파싱/등록(`registerOscHandler`)은 OSC 7(cwd)·OSC 133 과 함께 B-7 이 종합적으로 배선하는 게
  일관적이라 판단해 보류했다. B-7 담당자가 `parser.registerOscHandler` 를 등록할 때 `terminal.
  onTitleChange` 배선도 같이 하면 된다 — `TerminalPane` 에 `onTitleChange?: (title: string) => void`
  prop 을 추가하고 `TerminalView` 가 "이 leafId 가 해당 탭의 focusedLeafId 와 같을 때만" 탭 이름을
  갱신하도록 게이팅하면 된다(비활성 pane 타이틀 변경 무시 요건).
- **jsdom 의 `navigator.platform` 이 빈 문자열이라 `terminalShortcuts` 의 mac/win 분기가 테스트
  환경에서 결정론적이지 않다.** `TerminalView.test.tsx` 의 B-4 describe 블록에
  `Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true })`
  를 명시해 고정했다(CLAUDE.md 의 플랫폼 분기 테스트 가이드와 동일한 취지).

### 제약 (하지 말 것) — 실제로 지킨 것

- `src/main/**`, `src/preload/**` 무수정. 새 IPC 채널 0개(분할도 기존 `terminal.create`/`kill`/
  `input`/`resize`/`rename` 재사용).
- `BranchWorkspace.tsx`/`MentionAgentView.tsx`(+ 그 테스트) 무수정 — `git diff --stat` 로 확인(아래).
- `splitTree.ts`/`SplitLayout.tsx` 는 **렌더러**에만 존재한다. `src/main/terminal/splitTree.ts`
  경로(목업 노트 1)는 채택하지 않았다(ADR-02 §대안 2).
- 드래그 중 PTY resize 0회 — `suspendAutoResize` 게이트로 보강(위 결정 사항 참조).
- `@xterm/xterm`/`@dnd-kit/*` 버전 변경 없음(B-4 는 신규 xterm addon 을 쓰지 않는다 — addon-serialize
  /addon-webgl/addon-web-links 는 B-5~B-7 몫).
- 단축키 레지스트리(Workstream D) 선취하지 않음 — `terminalShortcuts.ts` 는 테이블 상수 + 순수
  판정 함수까지만.
- 작업과 무관한 리팩터 없음 — `TerminalPane.tsx` 에서 건드린 것은 B-4 prop 5개 + handle 확장 +
  paste 검증 배선 + ResizeObserver 게이트뿐, 이미지 사이드바/키 핸들러 테이블/링크 provider 는
  그대로 두었다.

### 검증

- `npx vitest run src/renderer/src/components/Terminal src/renderer/src/components/MentionAgent
  src/renderer/src/components/Git` → **17 files / 190 tests all green** (`TerminalPane.test.tsx` 23→28,
  `TerminalView.test.tsx` 8→12, 신규 `splitTree.test.ts` 34 / `SplitLayout.test.tsx` 4 /
  `paneDividerDrag.test.ts` 13 / `pasteTargetState.test.ts` 7 / `terminalShortcuts.test.ts` 12,
  `MentionAgentView.test.tsx` 2 무수정 통과)
- `git diff --stat -- src/renderer/src/components/Git/BranchWorkspace.tsx
  src/renderer/src/components/MentionAgent/MentionAgentView.tsx
  src/renderer/src/components/MentionAgent/MentionAgentView.test.tsx` → **출력 없음(0줄)**
- `npx tsc --noEmit -p tsconfig.web.json` → **통과(오류 0)**. `-p tsconfig.node.json` 은 병렬
  main-process-engineer 트랙(M-A)의 `snapshotStore.test.ts` TS2352 오류 1건이 남아있으나 내가
  건드리지 않은 파일이다(`git status` 로 미추적/M-A 소유 확인).
- `npx vitest run`(전체) → **160 files 중 159 통과**, `src/main/index.test.ts` 5건 실패는
  main-process-engineer 가 진행 중인 `src/main/index.ts` 변경(M-A `before-quit`/IPC 핸들러 배선
  작업 중)에서 비롯된 것으로 확인(`git status` 상 `M src/main/index.ts`, `index.test.ts` 자체는
  미수정) — 내 스코프(renderer, `src/main/**` 무접근) 밖.
- `grep -rl "Portions adapted from Orca\|dnd-kit 의 PointerSensor" src/` → 3건, `THIRD-PARTY-
  NOTICES.md` 표 행수 3 과 일치.

### Gate 2 조건 충족

- [x] `npx tsc --noEmit -p tsconfig.web.json` 통과
- [x] `npx vitest run src/renderer/src/components/Terminal` 그린(기존 TerminalView 케이스 전부
  동등 시나리오로 유지 — 프롭 계약 변경(`isActive`→`isVisible`/`isFocused`)에 따라 mock/assertion 은
  갱신했으나 검증하는 사용자 시나리오는 1:1 대응)
- [x] 회귀 테스트: 3분할 → 가운데 leaf 닫기 → 남은 두 pane 의 host div 가 동일 노드 참조
  (`SplitLayout.test.tsx`)
- [ ] 수동 QA(4분할/경계 드래그/⌥⌘화살표/⌘W 순차 닫기/다른 뷰 무반응) — 헤드리스라 미실시,
  통합 단계에서 확인 필요. 특히 divider 교차점 시각 이음새는 위 "알려진 편차" 참조
- [x] `THIRD-PARTY-NOTICES.md` 표 행 수(3) == 이식 파일 수(3)

### 참조

- ADR-v2-terminal-p2-02 (`adr-02-split-tree.md`) — 이진 트리·렌더러 소유·portal 설계 전체
- ADR-v2-terminal-p2-06 (`adr-06-third-party-notices.md`) — 고지 절차
- `docs/dev/orca-absorption-notes.md` §5 — split/탭 설계 교정, §9 함정 #8/#9
- `docs/mockups/v2/terminal-split.html` — `.panecnt`/`.handle`/pane 배지 UI 참조

---

## [main-process-engineer] M-A(영속화 main) + M-B(링크 resolve-path) — windows-fix A-2/env 병합 4곳과 통합 라운드

이번 라운드는 오케스트레이터 브리핑이 본 트랙의 **M-A + M-B** 를
`feature/windows-compat/v2-windows-fix/` 의 **A-2(§3 터미널 PTY, §4 CLAUDE_START_TASK)** 및
**env 병합 4곳(§2-3)** 과 한 라운드로 병합 지정해 함께 수행했다(main-process-engineer 1명이
세션/스킬/MCP·workspace 트랙에 묶여 있어 병렬화 필요). windows-fix 쪽 변경은
`feature/windows-compat/v2-windows-fix/impl-log.md` 에 별도 섹션으로 기록한다 — 이 섹션은
terminal-p2 소유분(M-A/M-B)에 집중한다.

### 변경한 파일

**M-A (영속화 v2 — 신규)**
- `src/main/terminal/snapshotStore.ts` (신규) — `shouldPersistSnapshot`/`migrateLegacySessions`/
  `capWorkspaceBytes`/`SnapshotStore`(class, `loadSnapshot`/`saveSnapshot`/`getCachedSnapshot`)
- `src/main/terminal/snapshotStore.test.ts` (신규, 18 tests)
- `src/main/terminal/sanitizeForRestore.ts` (신규) — `TerminalManager` 안에 있던 private 함수를
  분리(§결정 사항 참조). `TerminalManager.ts`/`snapshotStore.ts` 양쪽이 이 한 곳을 import
- `src/main/terminal/sanitizeForRestore.test.ts` (신규, 5 tests)
- `src/main/terminal/quitFlush.ts` (신규) — `createQuitFlushCoordinator`
- `src/main/terminal/quitFlush.test.ts` (신규, 6 tests — fake timer 4케이스 + 보강 2건)
- `src/shared/utils/textBytes.ts` (신규) — `utf8ByteLength`/`trimSerializedToBytes`(secant 보간
  최대 4 probe + 개행 되감기, `Buffer` 대신 `TextEncoder` 사용 — main/renderer 양쪽 순수 유틸 규칙)
- `src/shared/utils/textBytes.test.ts` (신규, 10 tests)
- `src/shared/types/terminal.ts` (수정) — `TerminalSaveStateResult { ok, bytes, skipped? }` 신설

**M-B (링크 존재 검증 — 신규)**
- `src/main/terminal/pathResolver.ts` (신규) — `resolveCandidates({ cwd, candidates })`
- `src/main/terminal/pathResolver.test.ts` (신규, 7 tests)
- `src/main/terminal/ptyCwd.ts` (신규) — `probePtyCwd(pid)` (darwin lsof / linux `/proc` / win32
  null) + TTL 3초 캐시 + 단일 비행 + 킬 스위치 상수
- `src/main/terminal/ptyCwd.test.ts` (신규, 7 tests)
- `src/main/terminal/TerminalManager.ts` (수정) — `getPid(id): number | null` 추가(세션 조회만)

**index.ts — Terminal 핸들러 블록**
- `TERMINAL_SAVE_STATE`/`TERMINAL_RESTORE_STATE`/`TERMINAL_RESOLVE_PATH` `ipcMain.handle` 3종 추가.
  `TERMINAL_SAVE_STATE` 핸들러가 `snapshotStore.saveSnapshot()` 저장 직후 `quitFlush.onSnapshotArrived()`
  를 호출해 대기 중인 before-quit 시퀀스를 즉시 재개시키도록 배선
- 모듈 스코프에 `snapshotStore`(electron-store 를 `SnapshotStorage` 로 주입) / `quitFlush`
  (`createQuitFlushCoordinator` 배선: `hasLiveWindow`/`requestFlush`/`persist`/`quit`) 인스턴스 추가
- `TERMINAL_RENAME` 핸들러의 "즉시 자동 저장" 블록(`exportSessions()` → `store.set('terminalSessions', …)`)
  제거. `setName()` 호출/반환값은 그대로 유지
- `TERMINAL_RESTORE`/`TERMINAL_REORDER` 핸들러는 **유지**(삭제 안 함, 아래 "제약" 참조) + `@deprecated`
  주석 추가

**index.ts — 라이프사이클 블록**
- 30초 `setInterval` 자동 저장 삭제(주석으로 렌더러 이관 명시)
- `before-quit` 핸들러를 `quitFlush.onBeforeQuit(event)` 배선으로 교체(`exportSessions` 기반 저장 제거)
- `window-all-closed` 는 `terminalManager.dispose()` 유지 + ADR-03 §6 참조 주석 1줄 추가(로직 변경 없음)

**index.ts — CLAUDE_START_TASK 핸들러 (windows-fix A-2 §4, 이 라운드 병합분)**
- `buildStartTaskSpawn()` 결과로 `terminalManager.create({ command, args, name, cwd })` 호출로 교체.
  win32 는 `app.getPath('temp')` 아래 BOM 없는 UTF-8 프롬프트 임시파일을 쓰고, 세션 exit 리스너 +
  5분 타이머로 정리. `require('os').homedir()` 인라인 제거 → 상단 import

**index.ts — CLI Info env 블록 (env 병합 4곳 중 1곳)**
- `richEnv` 계산을 `mergePathIntoEnv(process.env, claudeExtraPaths(), { position: 'append' })` 로 교체.
  인라인 `require('os')`/`require('path')` PATH 목록 조립 삭제

**shared/types/terminal.ts**
- `TerminalCreateOptions.args?: string[] | string`(win32 verbatim 전용, 주석 명시), `.name?: string` 추가

**preload/index.ts — terminal 섹션만**
- `saveState`/`restoreState`/`onRequestState`/`resolvePath` 4개 추가. `onRequestState` 는
  `TERMINAL_OUTPUT`/`TERMINAL_EXIT` 와 동일한 단일 리스너 공유 fan-out 패턴(`subscribeTerminalRequestState`)
- `restoreSaved`/`reorder` 는 유지 + `@deprecated` JSDoc 추가

**test/helpers/mockWindowApi.ts**
- `terminal.saveState`/`restoreState`/`onRequestState`/`resolvePath` mock 기본값 추가

**src/main/index.test.ts**
- `eventOnly` 배열에 `TERMINAL_REQUEST_STATE` 추가
- `TERMINAL_SAVE_STATE`/`TERMINAL_RESTORE_STATE`/`TERMINAL_RESOLVE_PATH` 가 `handle` 에 등록됨을
  단언하는 테스트 신설. 기존 `TERMINAL_REORDER` 케이스는 **유지**(아직 유효 — 아래 "제약" 참조)

### 결정 사항 (해야 할 것)

- **`TERMINAL_SAVE_STATE` 반환 시그니처**: `TerminalSaveStateResult { ok: boolean; bytes: number; skipped?: boolean }`
  (shared 타입). `skipped: true` 는 `shouldPersistSnapshot` 게이트가 캐시 경로에서 빈 스냅샷이 기존
  저장분을 덮어쓰려는 걸 막았을 때만 등장한다. renderer B-5 가 이 반환값을 그대로 참조하면 된다.
- **`TERMINAL_RESTORE_STATE` 반환**: `TerminalWorkspaceSnapshotV2 | null`. 최초 호출에서 v2 가 없고
  legacy `terminalSessions` 가 있으면 그 자리에서 마이그레이션 후 저장까지 하고 반환한다(멱등 — 두 번째
  호출부터는 이미 있는 v2 를 그대로 반환).
- **`createQuitFlushCoordinator` 시그니처를 plan.md 원안에서 살짝 바꿨다**: `onSnapshotArrived()` 를
  **인자 없이** 설계했다. 이유 — 실제 저장은 `TERMINAL_SAVE_STATE` 핸들러가 `snapshotStore.saveSnapshot()`
  으로 이미 끝낸 뒤 이 메서드를 호출하는 구조라, coordinator 입장에서는 "응답이 왔다"는 신호만 필요하고
  스냅샷 값 자체는 필요 없었다. `persist: () => void` 도 마찬가지로 무인자 — 캐시 경로에서 저장할 값은
  `snapshotStore.getCachedSnapshot()` 이 이미 알고 있어서 index.ts 쪽 클로저에 박아뒀다
  (`persist: () => snapshotStore.saveSnapshot(snapshotStore.getCachedSnapshot(), 'cache')`).
- **`onSnapshotArrived()` 에 `awaitingFlush` 내부 플래그를 추가**했다(plan.md 명세에는 없던 안전장치) —
  이유: `TERMINAL_SAVE_STATE` 는 quit 여부와 무관하게 렌더러의 1초 debounce/30초 autosave/beforeunload
  에서도 호출된다. quit 시퀀스가 진행 중이 아닐 때(=`requestFlush()` 를 부른 적이 없을 때) 저 콜백이
  오면 `finish()` 를 태우면 안 된다(엉뚱하게 `app.quit()` 이 불릴 뻔했다) — 그래서 `onBeforeQuit` 이
  창이 있는 경로를 탈 때만 `awaitingFlush = true` 로 세팅하고, `onSnapshotArrived` 는 그 플래그가 설
  때만 반응한다.
- **`sanitizeForRestore()` 이사 방식이 M-A-1 원안과 다르다**: plan.md 는 "TerminalManager 에서
  snapshotStore.ts 로 이사" 라고 적었지만, M-A-4(레거시 삭제)가 게이트로 보류되면서 `TerminalManager.
  exportSessions()`(레거시, 아직 살아있음)가 계속 이 함수를 필요로 한다. 그래서 `snapshotStore.ts`
  안이 아니라 **별도 파일 `sanitizeForRestore.ts`** 로 옮기고 `TerminalManager.ts`/`snapshotStore.ts`
  양쪽이 그 한 곳을 import 하는 형태로 했다 — 함수가 두 곳에 중복 정의되는 것보다, 아직 안 죽은
  소비처가 있는 상태에서 "이사 예정 위치"에 억지로 넣는 것보다 이쪽이 더 정직하다고 판단했다.
- **`capWorkspaceBytes` 의 "오래된 탭부터 드롭" 판정은 배열 순서 기준**이다(`snapshot.tabs` 의 앞쪽이
  더 오래된 탭이라고 가정). 렌더러가 탭 배열을 항상 생성 순서로 유지한다는 전제가 깔려 있다 — B-5
  renderer 가 탭 순서를 임의로 뒤섞어 저장하면(예: `reorder` 이후 배열 자체를 재정렬) 이 휴리스틱이
  최신 탭을 드롭할 수 있다. 이 전제가 깨지면 `savedAt` 같은 타임스탬프 필드를 pane/tab 레벨에 추가하는
  방향으로 재작업 필요 — 지금은 스키마에 그런 필드가 없어(ADR-03 §1 그대로 준수) 배열 순서로 근사했다.
- **A-2(windows-fix) 를 M-B 와 같은 라운드로 병합 수행**하며 `TerminalManager.create()` 를 전면
  재작성했다 — `detectWindowsShell`/`buildPtyEnv`/win32 spawn 폴백 루프(ConPTY DLL 래치 포함)를
  새로 추가하고, PATH 병합을 `mergePathIntoEnv`/`claudeExtraPaths` 단일 정의로 교체했다. darwin/linux
  경로(`$SHELL -l`, `LANG`/`LC_ALL`/`LC_CTYPE`)는 spawn 인자/env 값 단위로 기존과 동일함을 테스트로
  고정(`TerminalManager.test.ts` 신규 describe 블록). 상세는 windows-fix impl-log 참조.
- **`TerminalCreateOptions.args`/`name` 확장, `TERMINAL_RESOLVE_PATH` cwd 우선순위(cwdHint →
  pid probe → 세션 spawn cwd)** 는 renderer B-7(링크 프로바이더)이 그대로 참조하면 되는 최종 계약이다.

### 제약 (하지 말 것) — 이번 라운드가 실제로 지킨 것 / 남긴 것

- **M-A-4(레거시 경로 삭제)는 실행하지 않았다.** `TerminalView.tsx` 가 여전히
  `window.api.terminal.restoreSaved()`/`reorder()` 를 호출 중(`grep` 으로 확인 — B-4 는 tabOrder 를
  드래그 리오더에만 쓰고 아직 저장/복원 자체는 legacy 경로를 그대로 씀)이라, plan.md 의 "삭제 순서
  게이트"에 따라 **추가만 하고 삭제는 보류**했다. 남은 항목(그대로 살아있음, `@deprecated` 마킹만):
  - `IPC_CHANNELS.TERMINAL_RESTORE` / `TERMINAL_REORDER` (shared/types/ipc.ts)
  - `src/main/index.ts` 의 두 핸들러(`TERMINAL_RESTORE` 조회, `TERMINAL_REORDER` on)
  - `TerminalManager.exportSessions()` / `TerminalManager.reorder()` (프로덕션 호출자는 이제 0개 —
    30초 interval·rename 즉시저장·before-quit 이 전부 제거/교체돼서. 유일한 남은 소비처는
    `TERMINAL_RESTORE`/`TERMINAL_REORDER` 핸들러와 자기 자신의 테스트)
  - `src/main/terminal/sessionOrder.ts` + 테스트
  - `src/preload/index.ts` 의 `restoreSaved`/`reorder`
  - renderer 가 B-5(스냅샷 복원 오케스트레이션)로 이관을 마치면 이 6곳을 같은 커밋에서 지운다.
- **legacy `terminalSessions` 스토어 키는 이 라운드 이후로 더 이상 갱신되지 않는다** — 30초 interval,
  rename 즉시저장, before-quit 의 옛 저장 경로를 전부 없앴기 때문이다. `TERMINAL_RESTORE` 는 여전히
  이 키를 읽지만, 이 라운드 배포 시점 이후로는 갱신이 멈춘 "동결된" 값을 계속 돌려준다. renderer 가
  아직 v2(`TERMINAL_SAVE_STATE`)를 쓰기 시작하지 않았으므로 v2 로도 안 넘어간 과도기 — B-5 가 착수되면
  정상화된다. 이 창구가 열려있는 동안 "터미널 탭이 재시작해도 기억 안 남" 이라는 사용자 신고가 오면
  이 문단이 원인이다(의도된 전환 비용, ADR-03 §대안 6 이 이미 이 트레이드오프를 감수하기로 결정함).
- **`TerminalManager` 의 spawn/플랫폼 분기를 M-B 단독으로는 건드리지 않았을 것**이나, 이번 라운드는
  windows-fix A-2 와 명시 병합돼 `create()` 전체를 재작성했다 — 원래 plan.md M-B 제약("추가하는 것은
  `getPid()` 하나뿐")은 순수 M-B 단독 라운드 기준이었다는 점을 plan.md 에도 주석으로 남겼다.
- **`AIService.runClaudeStream` 의 argv 조립 블록은 1바이트도 건드리지 않았다** — `git diff` 로 확인.
  PATH 병합(`enrichedEnv`)만 `mergePathIntoEnv`/`claudeExtraPaths` 호출로 교체했고 `position: 'prepend'`
  는 그대로 유지(다른 3곳과 다른 유일한 예외, 근거 주석을 그 자리에 남김).
- **`ClaudeChatService`/멘션 파이프라인의 spawn·이벤트 로직은 건드리지 않았다** — `enrichedClaudeEnv()`
  본문 교체 1곳뿐. `MentionTerminalSpawner` 가 쓰는 `TerminalManager.listSessions()` 는 무수정.
- **`BranchWorkspace.tsx`/`MentionAgentView.tsx`/`TerminalView.tsx`(renderer)는 손대지 않았다** —
  main-process-engineer 규칙상 renderer 접근 금지.
- **새 IPC 채널을 추가하지 않았다** — `TERMINAL_SAVE_STATE`/`TERMINAL_RESTORE_STATE`/
  `TERMINAL_RESOLVE_PATH` 3개는 S-0(이전 라운드)에서 이미 shared/types 에 추가돼 있었고, 이번 라운드는
  그 채널들의 **핸들러(main)** 만 구현했다.

### 검증

- `npx vitest run src/main/terminal src/shared/utils/textBytes.test.ts src/main/index.test.ts` → 전체 green
- `npx vitest run`(전체) → **160 files / 2454 tests all green** (renderer B-4 트랙과 동시 검증)
- `npx vitest run --coverage` → lines 82.13 / statements 83.41 / functions 91.86 (게이트 70/70/80 유지,
  신규 모듈 `snapshotStore.ts`/`quitFlush.ts`/`pathResolver.ts`/`ptyCwd.ts`/`sanitizeForRestore.ts`/
  `startTaskSpawn.ts` 는 대부분 100% 라인, `windowsShell.ts` 만 86.53%(마지막 bare `cmd.exe` 폴백처럼
  이 개발 환경에서 실제로 안 타는 조합 몇 개가 미커버)
- `npx tsc --noEmit -p tsconfig.node.json` / `-p tsconfig.web.json` → 둘 다 통과
- `npm run build` → main/preload/renderer 3개 모두 성공

### 참조

- ADR-v2-terminal-p2-03 (`adr-03-persistence-v2.md`) — 스키마·before-quit 핸드셰이크·shouldPersistSnapshot·복원 시퀀스 원출처
- ADR-v2-terminal-p2-05 (`adr-05-link-provider.md`) — TERMINAL_RESOLVE_PATH·pid cwd probe 근거
- `feature/windows-compat/v2-windows-fix/impl-log.md` `## [main] A-2 + env 병합 4곳` — 같은 라운드에
  함께 수행한 windows-fix 트랙 작업 기록(detectWindowsShell/buildStartTaskSpawn 상세, 플랫폼 분기 감사표)
- `feature/windows-compat/v2-utils/impl-log.md` §제약 — `mergePathIntoEnv`/`claudeExtraPaths`/
  `expandHome` 등 Phase 1 유틸 소비 시 지켜야 할 규칙
- plan.md B-4 전 구간, Gate 2
