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

---

## [renderer] B-5 + B-6

B-5(영속화 v2 renderer 파트: serialize/복원 시퀀스/replay guard/저장 오케스트레이션)와 B-6(WebGL
lazy attach/실패 래치/렌더러 토글)을 이번 라운드에 함께 완료했다. Gate 2(B-4) + Gate 3a(M-A) 통과
상태에서 착수. HEAD `16f993a` 기준.

### 변경한 파일

**신규**
- `src/renderer/src/components/Terminal/serializeAbsoluteCursor.ts` / `.test.ts`(3 tests) — **Orca
  `terminal-serialize-absolute-cursor.ts` adapted**(고지). `serializeWithAbsoluteCursor(terminal, addon,
  opts)` — `SerializeAddon.serialize()` 결과 뒤에 절대 CUP(`\x1b[{row};{col}H`, 1-based)를 접미한다
  (함정 #3). Orca 원본이 xterm 6.1-beta 대상이라 API 표면이 달라 재구현했다 — 근거는
  `docs/dev/orca-absorption-notes.md` §3-2.
- `src/renderer/src/components/Terminal/replay.ts` / `.test.ts`(5 tests) — **Orca `replay-guard.ts` /
  `terminal-snapshot-replay-paint.ts` adapted**(고지, 두 파일의 책임을 하나로 병합). `createReplayGuard()`
  (`on/off/active`), `REPLAY_CLEAR`, `POST_REPLAY_MODE_RESET`(커서 스타일·마우스 리포팅·bracketed
  paste·kitty keyboard 리셋), 파일 상단에 ADR-03 §7 의 **복원 순서 14단계 주석**을 그대로 기록.
- `src/renderer/src/components/Terminal/webglPolicy.ts` / `.test.ts`(8 tests) — `shouldAttachWebgl`
  순수 함수(5조건 AND) + 모듈 전역 실패 래치(`setGlobalWebglFailure`/`resetGlobalWebglFailure`/
  `getGlobalWebglFailure`).
- `src/renderer/src/components/Terminal/RendererToggle.tsx` / `.test.tsx`(5 tests) — 탭바 우측 드롭다운
  (목업 `.rbtn`/`.rmenu` 매핑). `setting`/`fellBack`/`onChange` prop 만 받는 순수 프레젠테이션 컴포넌트 —
  실제 attach 판정은 갖지 않는다(TerminalPane 내부 게이트가 진실).

**대폭 수정**
- `src/renderer/src/components/Terminal/TerminalPane.tsx` —
  - `SerializeAddon`/`WebglAddon` loadAddon 추가. `TerminalPaneHandle` 에 `disposeWebgl()`/
    `attachWebglIfAllowed()` 2메서드 추가, `serialize()` 본체 구현(옵션
    `{scrollback:2000, excludeAltBuffer:true}` → `trimSerializedToBytes(…, 512*1024)`, 실패 시 null+warn).
  - `restore?: TerminalPaneSnapshot` prop 신설, **`initialOutput` prop 완전 제거**(레거시 복원 경로
    소멸 — TerminalView 가 유일한 소비처였음을 확인 후 정리).
  - mount effect 를 ADR-03 §7 의 14단계로 재배치: 스냅샷 존재 시 `new Terminal({cols,rows})`(1) →
    addon 로드에 serialize 추가(3) → unicode 활성화(5, 기존 위치 유지 — open() 보다 먼저라 write 보다
    항상 먼저였음) → onOutput 구독을 `restoring` 플래그로 게이팅해 replay 중 도착분 큐잉(6) →
    `replayGuard.on()`(7) → `terminal.resize(snap.cols, snap.rows)`(8, cols===0 이면 스킵) →
    `write(REPLAY_CLEAR)`(9) → `write(snap.serialized, cb)`(10) → `write(POST_REPLAY_MODE_RESET+'\r\n', cb)`
    (11) → `replayGuard.off()`(12) → rAF 후 `finishMount()`(13: `safeResize` 재사용 = fit+PTY resize,
    14: 큐 flush). 비복원 마운트도 동일한 `finishMount()` 경로를 타도록 통일(기존 별도 인라인 rAF-fit
    블록 제거).
  - `terminal.onData` 콜백에 `if (replayGuard.active) return` 추가(함정 #2) — exitInfoRef 체크보다 먼저.
  - WebGL 배선: `attachWebglNow`/`disposeWebglNow`/`evaluateWebgl` 3함수(모두 mount effect 클로저 내부),
    `evaluateWebglRef`/`disposeWebglFnRef`/`paneLossCountRef`/`deferredRef`/`rendererSettingRef`/
    `onWebglUnavailableRef` 를 컴포넌트 최상단에 배선. `disposeWebglNow` 는 `addon.dispose()` →
    canvas 마다 `getContext('webgl2'|'webgl')?.getExtension('WEBGL_lose_context')?.loseContext()` →
    `canvas.width=canvas.height=0` 순서 고정. `addon.onContextLoss` → dispose+`paneLossCount++`+
    `onWebglUnavailable?.()`, 자동 재시도 없음. 초기화 throw → `setGlobalWebglFailure()`+
    `onWebglUnavailable?.()`.
  - 가시성 전환(`visible`) effect 신설 1개(webgl 게이트 재평가 + reveal 시 `paneLossCount=0`) +
    `document.visibilitychange` 구독 effect 신설(윈도우 wake 시 동일 리셋).
  - **부수 발견/수정**: 마운트 rAF(`finishMount` 예약)와 기존 "visible reveal" effect 의 이중 중첩
    rAF 모두 핸들을 들고 있지 않아 언마운트 후에도 stale 클로저가 fit/PTY resize 를 쏠 수 있는 latent
    leak 을 발견 — `cancelAnimationFrame` 로 cleanup 에서 취소하도록 보강했다(둘 다). ADR/plan 문면엔
    없는 항목이지만 B-5 가 rAF 스케줄링을 훨씬 많이 쓰게 되면서 실제로 테스트 격리 실패로 드러났다
    (아래 "알려진 편차" 참조) — 이 변경이 없으면 원래도 존재하던 버그였다.
- `src/renderer/src/components/Terminal/TerminalView.tsx` —
  - `PaneRuntime.savedOutput?: string` → `restoreSnapshot?: TerminalPaneSnapshot` 로 교체.
  - `restorePhase` 를 실제 상태(`useState`, 초기 `'idle'`)로 전환. 복원 effect 전면 재작성:
    `window.api.terminal.restoreState()` → 없음/빈 배열이면 즉시 `'ready'` → 탭 20개 초과 시 최근
    20개만(`slice(-MAX)`, warn) → 탭별 `isValidTree` 검증 실패 시 단일 leaf 폴백(warn) → leaf 합 40개
    초과 탭은 스킵(warn) → leaf 마다 `window.api.terminal.create({cwd})` → 세션 생성 실패 leaf 는
    `closeLeaf` 로 트리에서 제거(그래도 실패해 탭이 통째로 비면 그 탭 자체 스킵) → `restorePhase='ready'`.
    레거시 `restoreSaved()`/`slice(-5)` 경로 완전 제거.
  - `collectSnapshot()`/`persistSnapshot()` 신설 — `lastPaneSnapshotRef: Map<leafId, TerminalPaneSnapshot>`
    로 `handle.serialize()` null 반환 시 마지막 성공값 재사용(없으면 `{cols:0,rows:0,serialized:''}`).
    `cleanupHost()` 가 이 Map 도 함께 정리.
  - 저장 트리거 4종 실제 구현: `notifyLayoutChanged()`(1초 debounce, 기존 8개 지점에 이미 배선된 훅의
    본문만 채움), 30초 `setInterval`(persistSnapshot), `beforeunload`(fire-and-forget), `onRequestState`
    구독(main 의 before-quit flush 응답). 넷 다 `shouldPersistLayoutRef.current` 로 게이팅(함정 #10).
  - `rendererSetting`/`rendererFellBack` state 신설 — `window.api.settings.get/set('terminalRenderer')`
    로 영속화(신규 IPC 0개). 탭바에 `<RendererToggle>` 추가(우측, "모두 닫기" 버튼과 함께 `ml-auto` 래퍼로 이동).
  - `TerminalPane` 렌더 시 `initialOutput` → `restore={pane.restoreSnapshot}`, `rendererSetting`,
    `onWebglUnavailable={handleWebglUnavailable}` 추가.
- `src/renderer/src/components/Terminal/SplitLayout.tsx` — `PaneSlot` 의 `reattachPaneHost` 호출에
  `{ disposeWebgl: () => handle?.disposeWebgl(), attachWebgl: () => handle?.attachWebglIfAllowed() }`
  훅 배선(B-4 가 만들어 둔 빈 자리를 채움).
- `src/renderer/src/components/Terminal/reattachPaneHost.ts` — 문서 주석만 갱신("B-6 이후" 문구 제거,
  실제 훅 출처 명시).
- `src/renderer/src/components/Settings/SettingsView.tsx` — `AppBehaviorSettings` 에 "터미널 렌더러"
  섹션(라디오 2종, `TerminalRendererSection`) 추가 — 탭바 드롭다운과 같은 `terminalRenderer` 키 공유.
- `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx` — "🖥 터미널 (v2.0)" 절에 "화면까지 통째로
  복원" · "렌더러 전환(WebGL/DOM)" 불릿 2개 추가.
- `test/helpers/mockWindowApi.ts` — `terminal.restoreSaved`/`terminal.reorder` mock 제거(소비처 0,
  §제약 참조). `saveState`/`restoreState`/`onRequestState`/`resolvePath` 는 이미 M-A 라운드에서 추가돼
  있었음(그대로 사용).
- `package.json` — `@xterm/addon-serialize@^0.14.0`, `@xterm/addon-webgl@^0.19.0` 추가.
- `THIRD-PARTY-NOTICES.md` — 표에 `serializeAbsoluteCursor.ts`/`replay.ts` 2행 추가(둘 다 adapted).
- `feature/terminal/v2-terminal-p2/plan.md` — R5-1~R5-5·Gate 4·B-6·Gate 5a 체크박스 [x](수동 QA
  항목만 미실시로 남김).
- `CHANGELOG.md` — `[Unreleased]` 개선 섹션에 영속화 v2·WebGL 렌더러 항목 추가, 기존 탭 순서 변경
  불릿의 "완전한 영속화 보장은 후속 사이클 예정" 문구를 이번 라운드로 해소됐다는 취지로 정정.

**삭제**
- `src/renderer/src/components/Terminal/TerminalTabs.tsx` — 참조 0 확인 후 삭제(ADR-04 §6).

### 결정 사항 (해야 할 것)

- **`TerminalPaneHandle.serialize()` 는 `cwd` 를 채우지 않는다** — TerminalPane 자신은 cwd 를 모른다
  (B-7 의 OSC7 이전까지는 host 인 `TerminalView` 가 `PaneRuntime.cwd` 로 진실을 쥔다). `collectSnapshot()`
  이 `{ cwd: pane.cwd, ...handle.serialize() }` 로 병합한다. B-7 담당자가 OSC7 cwd 추적을 붙일 때
  TerminalPane 자체가 cwd 를 알게 되더라도, 이 병합 지점(`collectSnapshot`)은 그대로 두고 pane 이
  갱신한 값을 `PaneRuntime.cwd` 로 올려보내는 방향을 권장 — TerminalView 가 여전히 스냅샷 조립의
  단일 진입점이어야 저장 로직이 흩어지지 않는다.
- **탭 복원 시 leaf 단위 실패는 `closeLeaf` 로 트리에서 프루닝**하고, 프루닝 결과 트리가 완전히
  빈다면(마지막 leaf 였다면) 그 탭 자체를 결과에서 제외한다. 세션 생성이 대량으로 실패하는 극단
  상황(예: PTY 스폰 자체가 막힌 환경)에서도 앱이 깨지지 않고 "복원 가능한 것만" 뜨는 쪽을 택했다.
- **탭 20개 초과 시 `tabs.slice(-MAX_RESTORED_TABS)`** — main 의 `capWorkspaceBytes`(오래된 탭부터
  드롭, 배열 순서 기준)와 동일한 "배열 앞쪽 = 오래된 탭" 전제를 renderer 복원 쪽에서도 그대로
  따른다. leaf 합 40개 초과는 탭 단위로 스킵(부분 leaf 만 잘라내지 않음) — 분할 트리를 부분적으로
  자르면 `focusedLeafId`/ratio 정합이 깨지기 쉬워 탭 전체를 보류하는 쪽이 더 단순하고 예측 가능하다.
- **`RendererToggle` 은 attach 판정을 갖지 않는 순수 프레젠테이션**이다 — 실제 게이트는
  `shouldAttachWebgl` 을 매 pane 이 자기 상태로 평가한다. `TerminalView` 의 `rendererFellBack` 은
  "이 세션 동안 폴백이 한 번이라도 발생했는가"를 추적하는 UI 전용 플래그이고, 개별 pane 의
  `paneLossCount`/전역 실패 래치와는 별개다 — 사용자에게는 "뭔가 폴백이 있었다"는 신호만 주고,
  세밀한 pane 별 상태까지 드롭다운에 노출하진 않는다(스코프 아웃, 필요해지면 후속 트랙).
- **`evaluateWebgl()`/`finishMount()` 는 여러 지점(가시성 전환/렌더러 설정 전환/reveal/wake/마운트
  완료)에서 반복 호출되도록 설계**했다 — 멱등이라 중복 호출 비용이 낮고(이미 attach 됐으면 재시도
  안 함, 이미 dispose 됐으면 재시도 안 함), 각 트리거 지점마다 별도 분기를 만드는 것보다 안전하다.

### 알려진 편차 (plan.md/ADR 문면과 다르게 구현하거나 테스트하며 발견한 지점)

- **`TerminalPane.test.tsx`/`TerminalView.test.tsx` 의 fake-timer 테스트가 서로 오염되는 문제를
  발견하고 고쳤다.** `@testing-library/react` 의 `findByRole`/`waitFor` 는 내부적으로 실타이머
  기반 polling 을 쓰는데, `vi.useFakeTimers()` 를 켠 채로 그 API 들을 호출하면 폴링이 영원히 멈춘다
  (5000ms 타임아웃). 한 테스트가 이 상태로 타임아웃하면 `vi.useRealTimers()` 가 실행되지 못해 **이후
  모든 테스트가 연쇄로 타임아웃**했다 — `TerminalView.test.tsx` 최상위 `afterEach` 에
  `vi.useRealTimers()` 를 무조건 추가하고, fake-timer 구간에서는 `findByRole` 대신 `getByRole`(동기)
  을 쓰도록 테스트를 고쳤다. 이 자체는 vitest/RTL 조합의 일반적 함정이라 ADR 에 없던 발견이지만,
  B-5 가 `SAVE_DEBOUNCE_MS`/`AUTOSAVE_INTERVAL_MS` 테스트에 fake timer 를 처음 들여오면서 드러났다.
- **`TerminalPane.test.tsx` 의 복원 시퀀스 단언은 "정확히 이 배열"이 아니라 "이 6개가 접두사"로
  완화했다.** `visible=true` 로 마운트되면 B-3 부터 있던 별도의 "reveal 전환" effect 가 초기 마운트
  시에도 한 번 더 독립적으로 `fit()`+PTY resize 를 태운다(이번 라운드가 만든 회귀가 아니라 원래
  있던 이중 fit 이다 — 지금까지는 아무도 정확한 호출 횟수를 단언한 적이 없어 드러나지 않았을 뿐).
  복원 시퀀스 자체(`resize→clear→write→write→fit→ipc-resize`)의 순서 계약은 정확히 지켜지므로,
  테스트는 `callOrder.slice(0, 6)` 로 그 접두사만 검증하고 뒤에 따라붙는 두 번째 fit/resize 페어는
  허용한다. 프로덕션 동작 자체를 바꾸진 않았다(중복 fit 이 사용자에게 보이는 부작용은 없다 — 둘 다
  같은 최종 치수로 수렴).
- **`SerializeAddon`/`WebglAddon` 은 jsdom 에 `HTMLCanvasElement.getContext` 가 없어 import 시점부터
  콘솔에 "Not implemented" 경고를 뿜는다**(두 addon 모두 기본 색상 팔레트 계산에 canvas 를 쓴다).
  jsdom 은 이를 throw 가 아니라 virtualConsole 경고로만 처리해 테스트 자체는 깨지지 않지만, 이
  라운드는 `TerminalManager.test.ts` 의 node-pty mock 선례와 동일하게 두 addon 도 `vi.mock` 으로
  완전히 대체해 진짜 canvas 의존을 없앴다(TerminalPane.test.tsx). 그 결과 여전히 뜨는 stderr 경고
  2건은 그 mock 이 아니라 **실제 패키지가 처음 import 되는 시점**(vi.mock 은 export 를 갈아치우지만
  모듈 자체의 최상위 부수효과 실행은 막지 못한다)에서 나오는 것이라 완전히 없앨 수는 없었다 —
  해당 테스트는 예외를 던지지 않고 그린이므로 무해하다고 판단, impl-log 에만 기록한다.
- **rAF cleanup 보강(위 "부수 발견")은 plan.md 에 명시되지 않은 방어 코드다.** B-4 이전에도 존재하던
  잠재 버그(언마운트 후 stale 클로저가 disposed 된 fitAddon/terminal 을 건드릴 수 있음)를 이번
  라운드의 call-order 테스트가 우연히 드러냈다 — 실사용 영향은 낮다고 판단하지만(연속 리마운트가
  16ms 안에 겹치는 경우는 드묾), 고치는 비용이 낮고 정확성이 명백히 개선되어 함께 반영했다.

### 제약 (하지 말 것) — 실제로 지킨 것

- `src/main/**`, `src/preload/**` 무수정. 새 IPC 채널 0개(B-5/B-6 모두 M-A 라운드가 이미 만들어 둔
  `saveState`/`restoreState`/`onRequestState`/`resolvePath`, 기존 범용 `settings.get/set` 만 사용).
- `TerminalManager` 의 spawn/플랫폼 분기 무접근. `AIService`/`ClaudeChatService`/멘션 파이프라인 무접근.
- `BranchWorkspace.tsx`/`MentionAgentView.tsx`(+ 그 테스트) 무수정 — `initialOutput` prop 제거가 이
  두 호스트에 영향 없음을 먼저 확인했다(B-3 로그가 이미 "`initialOutput` 을 쓰는 곳은 TerminalView
  뿐"이라고 못박아 둠 — 실제로도 두 파일 어디에도 `initialOutput` 참조가 없었다).
- `@xterm/xterm` 버전 변경 없음(`5.5.0` 그대로) — addon 2종은 최신 stable(serialize 0.14.0, webgl
  0.19.0)이 peerDependencies 필드 자체를 선언하지 않는 버전이라(레지스트리 메타데이터 확인, description
  엔 "requires xterm.js v4+"만 명시) 형식적 peer 충돌 여지가 없다. `npm ls @xterm/xterm` 로 단일
  `5.5.0` 확인(중복 설치 없음).
- 셸 rc 주입 없음. 링크 프로바이더(B-7) 관련 파일 신설 없음 — `terminalUnicodeProvider.ts`/
  `links/**` 는 이번 라운드 스코프 밖.
- 단축키 레지스트리(Workstream D) 선취 없음.
- Terminal 밖 컴포넌트 무수정 — MCP/Skills 병렬 트랙(`MCPForm.tsx` 등)과 겹치지 않음. 전체 스위트
  실행 시 `fontScale.guard.test.ts` 1건이 `MCPForm.tsx` 의 raw `text-[11px]` 때문에 실패하는 것을
  확인했으나 그 파일은 내가 건드리지 않은 병렬 트랙 working tree 변경분이다(`git status`/`git diff`
  로 확인).
- 작업과 무관한 리팩터 없음(rAF cleanup 보강은 위에서 별도로 사유를 남김 — B-5 가 rAF 사용을 크게
  늘리며 실제로 테스트에서 드러난 latent bug 수정으로, 범위 안의 방어적 수정으로 판단).

### 검증

- `npx vitest run src/renderer/src/components/Terminal` → **21 files / 246 tests all green**
  (`TerminalPane.test.tsx` 28→41, `TerminalView.test.tsx` 12→17, 신규 `serializeAbsoluteCursor.test.ts`
  3 / `replay.test.ts` 5 / `webglPolicy.test.ts` 8 / `RendererToggle.test.tsx` 5)
- `npx vitest run src/renderer/src/components/Settings` → 5 tests green(렌더러 섹션 추가 후 무회귀)
- `npx vitest run`(전체) → **166 files 중 165 통과, 2502 tests 중 2501 통과**. 유일한 실패
  `fontScale.guard.test.ts` 는 `MCPForm.tsx`(병렬 MCP/Skills 트랙, 내 미수정 파일)의 raw px 클래스
  때문이며 Terminal 트랙과 무관함을 `git diff --stat` 로 확인.
- `npx tsc --noEmit -p tsconfig.web.json` / `-p tsconfig.node.json` → 둘 다 통과(오류 0).
- `npm run build` → main/preload/renderer 3개 모두 성공.
- `grep -rl "Portions adapted from Orca\|dnd-kit 의 PointerSensor" src/` → 5건,
  `THIRD-PARTY-NOTICES.md` 표 행수 5 와 일치.
- `grep -rn "terminal\.restoreSaved\|terminal\.reorder\b" src/ test/` → **주석 1건만 남음**(실제
  호출 0건) — 아래 "legacy 삭제 준비 완료" 참조.

### ▣ Gate 4 조건 충족

- [x] `npx tsc --noEmit` 양쪽 통과, `npm run test:run` 전체 그린(위 §검증 참조)
- [ ] 수동 QA(ADR-03 §모니터링 5종: vim 복원/창 닫고 나중에 ⌘Q/한글·이모지/legacy 업그레이드/store
  파일 크기) — **헤드리스 환경이라 미실시**. 아래 "수동 QA 목록" 참조.

### ▣ Gate 5a 조건 충족

- [x] `npx vitest run src/renderer/src/components/Terminal` 그린
- [ ] 수동(탭 5×4분할 20pane 순회/설정 토글/devtools WebGL 경고) — **헤드리스 환경이라 미실시**.
  아래 "수동 QA 목록" 참조.

### 수동 QA 목록 (jsdom 으로 검증 불가 — 통합 단계에서 실제 Electron 창으로 확인 필요)

1. **vim 을 띄운 채 앱 종료 → 재시작 → 화면(스크롤백·커서 위치·색)이 그대로 복원되는지.**
2. **탭 3개(그중 하나는 2~4분할) 구성 → 창만 닫고 잠시 후 ⌘Q(또는 앱 완전 종료) → 재시작 → 트리·
   활성 탭·스크롤백 전부 복원되는지** (ADR-03 이 구조적으로 고치겠다고 선언한 원래 버그의 재현 시나리오).
3. **한글/이모지(ZWJ 포함) 가 섞인 출력을 복원한 뒤 셀 폭이 깨지지 않는지** — unicode11 활성화 위치가
   여전히 "모든 write 전"인지 육안 확인(함정 #7).
4. **탭 5개 × 4분할(=20 pane) 을 만들고 순회 — WebGL 컨텍스트 예산(~16개) 초과로 백지 pane 이 뜨는지**
   (뜨면 안 됨 — visible-only attach 가 제대로 동작하는지의 핵심 시나리오).
5. **터미널 탭바 우측 렌더러 드롭다운에서 DOM ↔ WebGL 전환 → 즉시 반영 + 재시작 후 유지되는지.**
   ⚙ 설정 → 외관 & 동작 의 동일 항목과 서로 동기화되는지도 함께 확인.
6. **devtools 콘솔에서 WebGL 관련 경고/에러가 반복적으로 찍히지 않는지**(loss→재생성 루프가 없다는
   방증).
7. **분할 상태에서 pane 이동/닫기(리페어런트)가 반복돼도 WebGL 이 정상적으로 재부착되는지** — 특히
   빠르게 연속으로 분할/닫기를 반복했을 때 백지·크래시가 없는지.
8. **Windows VM**: split·복원·한글 출력 조합 — `windowsPty` 옵션이 복원 경로에서도 유지되는지
   (`new Terminal({...restoreDims, ...windowsPty})` 스프레드 순서 확인 대상).
9. `~/Library/Application Support/…/config.json`(또는 Windows 대응 경로) 파일 크기를 스냅샷 저장
   전후로 측정 — 8MB 캡이 실제로 작동하는지(대량 출력 세션 기준).

### legacy 삭제 준비 완료

B-5 가 `TerminalView` 의 `restoreSaved()`/`slice(-5)` 레거시 복원 경로를 **완전히 제거**했다.
`grep -rn "terminal\.restoreSaved\|terminal\.reorder\b" src/ test/` 결과 실제 호출은 0건이고, 유일한
매치는 `TerminalView.tsx:563` 의 주석(B-4 가 남긴 "더 이상 reorder 를 호출하지 않는다"는 설명문)뿐이다.
`test/helpers/mockWindowApi.ts` 에서도 두 mock 을 제거했다. main-process-engineer 는 이제
plan.md M-A-4(레거시 경로 삭제) 를 그대로 실행할 수 있다 — 삭제 대상 6곳(`IPC_CHANNELS.TERMINAL_RESTORE`/
`TERMINAL_REORDER`, `src/main/index.ts` 의 두 핸들러, `TerminalManager.exportSessions()`/`reorder()`,
`src/main/terminal/sessionOrder.ts`+테스트, `src/preload/index.ts` 의 `restoreSaved`/`reorder`)는 전부
`src/main/**`/`src/preload/**` 안이라 renderer-engineer 인 나는 건드리지 않았다 — main-process-engineer
가 다음 라운드에 그대로 지우면 된다.

### 참조

- ADR-v2-terminal-p2-03 (`adr-03-persistence-v2.md`) — 스키마·복원 시퀀스 14단계·저장 트리거 4종·
  `shouldPersistLayout` 게이트 원출처
- ADR-v2-terminal-p2-04 (`adr-04-webgl.md`) — WebGL 5조건 게이트·dispose 순서·실패 래치·설정 키 원출처
- ADR-v2-terminal-p2-06 (`adr-06-third-party-notices.md`) — 이식 고지 절차
- `docs/dev/orca-absorption-notes.md` §3(영속화 교정 3건)·§4(WebGL 보강)·§9(함정 #1/#2/#3/#4/#10)
- `feature/terminal/v2-terminal-p2/impl-log.md` `## [renderer] B-3`/`B-4` — `fitFnRef`/
  `showFocusRing`/`reattachPaneHost` 훅 자리/`notifyLayoutChanged` no-op 배선 등 이번 라운드가 그대로
  이어받은 전제
- `feature/terminal/v2-terminal-p2/impl-log.md` `## [main-process-engineer] M-A + M-B` — `TERMINAL_SAVE_STATE`
  반환 시그니처·`TERMINAL_RESTORE_STATE` 반환값·`capWorkspaceBytes` 의 배열 순서 전제(이번 라운드의
  탭 20 상한 cull 방향과 일치시킴)
- plan.md B-5·B-6 전 구간, Gate 4, Gate 5a

---

## [main] M-A-4

M-A-4(레거시 경로 제거)를 실행했다. 게이트 조건 — `## [renderer] B-5 + B-6` 의 "legacy 삭제 준비 완료"
절이 `TerminalView.tsx` 의 `restoreSaved()`/`reorder()`/`slice(-5)` 소비를 전부 제거하고
`grep -rn "terminal\.restoreSaved\|terminal\.reorder\b" src/ test/` 실호출 0건을 확인해 둔 상태 — 를
확인한 뒤 착수했다.

### 변경한 파일

**삭제**
- `src/main/terminal/sessionOrder.ts` — `applySessionOrder()`, 유일한 소비처였던 `TerminalManager.reorder()`
  와 함께 제거
- `src/main/terminal/sessionOrder.test.ts`

**수정**
- `src/shared/types/ipc.ts` — `TERMINAL_RESTORE`(`'terminal:restore'`), `TERMINAL_REORDER`(`'terminal:reorder'`)
  채널 상수 삭제. `TERMINAL_SAVE_OUTPUT`/`TERMINAL_RESTORE_STATE`/`TERMINAL_REQUEST_STATE`/`TERMINAL_RESOLVE_PATH`
  등 나머지 Terminal 채널은 무변경
- `src/main/terminal/TerminalManager.ts` — `exportSessions()`/`reorder()` 메서드 + 각 메서드의 `@deprecated`
  JSDoc 블록 삭제. 이제 유일하게 사용하던 `import { applySessionOrder } from './sessionOrder'` /
  `import { sanitizeForRestore } from './sanitizeForRestore'` 두 import 도 함께 제거(둘 다 미사용이 됨).
  `outputBuffer` 필드 자체·`getOutput()`·`listSessions()` 는 **무변경**(`getOutput()` 은 `TERMINAL_SAVE_OUTPUT`
  소비처가 살아있어 유지, `listSessions()` 는 `MentionTerminalSpawner` 소비처가 있어 유지 — 둘 다 plan.md
  M-A-4 지시대로)
- `src/main/terminal/sanitizeForRestore.ts` — 파일 상단 JSDoc 에서 `TerminalManager.exportSessions()`
  참조 문구 제거(그 메서드가 이제 없으므로). `snapshotStore.migrateLegacySessions()`(ADR-03 §10 의 1회
  마이그레이션 읽기 경로)가 유일한 소비처임을 명시 — **함수/파일 자체는 삭제하지 않았다**(아래 "제약" 참조)
- `src/main/terminal/TerminalManager.test.ts` — `describe('TerminalManager.exportSessions / setName / dispose')`
  를 `describe('TerminalManager.setName / dispose')` 로 좁히고 `exportSessions` 관련 3개 테스트(meta+output
  반환, alt-screen 필터, 미완성 ESC 자르기 — 전부 `sanitizeForRestore.test.ts` 5건과 중복 커버였음) 삭제.
  `describe('TerminalManager.reorder (B-8)')` 블록(2 tests) 전체 삭제. exit/suppression/output listener
  describe 블록들은 **무수정**
- `src/preload/index.ts` — `terminal.restoreSaved`/`terminal.reorder` 함수 + 각각의 `@deprecated` JSDoc
  삭제. `saveState`/`restoreState`/`onRequestState`/`resolvePath`/`getOutput`/`rename` 등 나머지는 무변경
- `src/main/index.ts` — Terminal 핸들러 블록에서 `ipcMain.on(IPC_CHANNELS.TERMINAL_REORDER, …)` 와
  `ipcMain.handle(IPC_CHANNELS.TERMINAL_RESTORE, () => store.get('terminalSessions', []))` 두 등록 + 그
  위의 `@deprecated`/공지 주석 3줄 삭제. `TERMINAL_SAVE_OUTPUT`/`TERMINAL_RENAME`/`TERMINAL_SAVE_STATE`/
  `TERMINAL_RESTORE_STATE`/`TERMINAL_RESOLVE_PATH` 핸들러와 라이프사이클 블록(`quitFlush`/`snapshotStore`
  배선, `before-quit`, `window-all-closed`)은 **무변경** — `store.get('terminalSessions', …)` 직접 읽기는
  이 핸들러가 유일한 자리였고, ADR-03 §10 이 지정한 "1회 마이그레이션 읽기 경로"(`SnapshotStore.loadSnapshot()`
  내부의 `storage.get(LEGACY_STORE_KEY, [])`)는 손대지 않아 legacy 업그레이드 시나리오가 그대로 보존된다
- `src/main/index.test.ts` — `TERMINAL_REORDER 는 ipcMain.on 으로 등록되고…` 테스트(채널 상수 자체가
  사라져 컴파일 불가능해짐) 삭제. `eventOnly` 배열의 `TERMINAL_REQUEST_STATE` 항목과
  `TERMINAL_SAVE_STATE`/`TERMINAL_RESTORE_STATE`/`TERMINAL_RESOLVE_PATH` handle 단언 테스트는 무변경.
  범용 mock 스텁 팩토리(`makeStubClass`)의 `exportSessions = vi.fn().mockReturnValue([])` 필드도 제거
  (`TerminalManager` mock 이 이 팩토리를 공유해서 썼던 잔여 필드, 실사용처 없었음)
- `test/helpers/mockWindowApi.ts` — "M-A-4 가 삭제할 때 이 주석도 지운다" 라고 예고해 둔 잔여 주석 2줄
  정리. 기능적 mock 변경은 없음(`restoreSaved`/`reorder` mock 은 B-5 라운드에서 이미 제거됐었음)
- `feature/terminal/v2-terminal-p2/plan.md` — M-A-4 섹션 체크박스 전부 `[x]`, 헤더를 "이번 라운드 미실행"
  에서 "완료"로 갱신

### 결정 사항 (해야 할 것)

- **`sanitizeForRestore()`(파일·함수·테스트)는 삭제하지 않았다.** 브리핑의 grep 점검 패턴에
  `sanitizeForRestore` 가 포함돼 있지만, 이 함수는 `snapshotStore.migrateLegacySessions()`(ADR-03 §10 이
  "레거시 키는 삭제하지 않는다" 로 명시한, 다운그레이드 안전장치 겸 1회 마이그레이션 읽기 경로)의 유일한
  구현이라 삭제 대상이 아니다 — brief 자체도 "1회 마이그레이션 읽기 경로는 유지 — ADR-03" 이라고 명시했다.
  삭제한 것은 `TerminalManager.exportSessions()`(레거시 export 경로, `sanitizeForRestore` 의 또 다른
  소비처였던 것)뿐이고, 그 결과 `sanitizeForRestore` 는 이제 `snapshotStore.ts` 단일 소비처만 남았다. 아래
  "검증" 절의 grep 결과가 이 상태를 그대로 보여준다.
- **`getOutput()`/`TERMINAL_SAVE_OUTPUT` 은 그대로 유지했다.** brief 가 "소비처가 있으면 유지"라고 조건부로
  지시했는데, 실제로 renderer/test 어디에도 `terminal.getOutput`/`terminal.saveOutput` 호출은 없다(grep
  으로 확인, 소비처 0). 그럼에도 유지한 이유 — ①plan.md M-A-4 체크리스트 원문이 "listSessions()/getOutput()
  은 유지"라고 **조건 없이** 명시했고 ②이 채널/메서드는 이번 M-A-4 삭제 대상 목록(`TERMINAL_RESTORE`/
  `TERMINAL_REORDER`/`exportSessions`/`reorder`/`sessionOrder.ts`/preload `restoreSaved`·`reorder`)에
  포함되지 않는다 — plan 이 지정한 삭제 스코프를 벗어나는 임의 정리는 이번 라운드 몫이 아니라고 판단했다.
  `getOutput()`/`TERMINAL_SAVE_OUTPUT` 이 실제로 소비처 0인 죽은 코드인지는 별도 라운드에서 재검토할 사항으로
  남긴다(전역 CLAUDE.md §9 의 "소비처 0 코드 정리" 원칙과 이번 plan 의 명시적 유지 지시가 충돌하는 지점 —
  plan 을 우선했다).
- **`TerminalManager.test.ts` 의 `exportSessions` 관련 3개 테스트를 대체 테스트 없이 그냥 삭제**했다.
  이유 — `sanitizeForRestore.test.ts`(M-A 라운드가 이미 추가, 5 tests)가 alt-screen 필터/미완성 ESC 자르기
  케이스를 동일하게 커버하고 있어 완전히 중복이었다(`exportSessions` 테스트는 `sanitizeForRestore` 를
  간접 호출해 같은 동작을 검증했을 뿐). 커버리지 손실 없음 — 위 "검증"의 coverage 결과 참조.
- **`makeStubClass` 의 `exportSessions` mock 필드 제거는 plan 체크리스트에 명시되지 않았지만 함께 정리**했다.
  `TerminalManager` mock 이 이 범용 스텁 팩토리를 그대로 재사용하는 구조라, 실제 클래스에서 사라진 메서드의
  mock 필드를 남겨두면 다음 사람이 "이 메서드가 아직 있나?" 라고 오해할 수 있다(전역 CLAUDE.md §9) — 실사용
  검증은 아니었으므로(어차피 vi.fn 스텁) 회귀 위험은 없었다.

### 제약 (하지 말 것) — 실제로 지킨 것

- **`TerminalManager` 의 spawn·플랫폼 분기(`buildPtyEnv`/`spawnWindowsShell`/`create()`)를 건드리지
  않았다** — `getPid()` 조회와 이번에 삭제한 `reorder()`/`exportSessions()` 외에는 무접근. `git diff` 로
  확인(위 "변경한 파일" 절이 diff 전체와 1:1 대응).
- **`AIService`/`ClaudeChatService`/멘션 파이프라인 파일 무접근.** `MentionTerminalSpawner` 가 쓰는
  `TerminalManager.listSessions()` 는 무변경으로 유지.
- **`src/main/index.ts` 변경을 Terminal 핸들러 블록 1곳으로 국소화**했다(이전 M-A/M-B 라운드가 이미
  라이프사이클/CLAUDE_START_TASK/CLI-info env 3블록을 건드려놨던 상태 — 이번 라운드는 그 3블록을
  1바이트도 추가로 건드리지 않았다).
- **renderer(`src/renderer/**`) 무접근.** `TerminalView.tsx` 안에 `reorder` 를 더 이상 호출하지 않는다는
  주석이 남아있는 것을 grep 으로 확인했지만(B-4 가 남긴 설명문, 실호출 아님) 그 파일은 병렬 renderer
  담당(B-7 링크 트랙) 작업 중이라 손대지 않았다.
- **`--no-verify`/`--force` 미사용, git 커밋은 만들지 않고 작업 트리 변경만 수행**(오케스트레이션 상 별도
  커밋 지시가 없었음).
- **새 native 모듈 추가 없음** — `electron-builder.asarUnpack`/`postinstall` 변경 대상 아님.

### 검증

- `grep -rn "restoreSaved\|TERMINAL_RESTORE\b\|TERMINAL_REORDER\|exportSessions\|sanitizeForRestore\|sessionOrder" src/ test/`
  → 남은 매치는 전부 `sanitizeForRestore` 자신의 정의(`sanitizeForRestore.ts`)·테스트(`sanitizeForRestore.test.ts`)·
  유일한 소비처(`snapshotStore.ts` 의 import + 호출) 뿐이다. `restoreSaved`/`TERMINAL_RESTORE`(단어경계)/
  `TERMINAL_REORDER`/`exportSessions`/`sessionOrder` 는 **주석 포함 정확히 0건**(exportSessions 는
  `sanitizeForRestore.ts` JSDoc 에 남아있던 참조 문구까지 정리해 0건으로 맞췄다) — 위 "결정 사항"에서
  설명한 대로 `sanitizeForRestore` 자체는 ADR-03 §10 마이그레이션 경로 때문에 삭제 대상이 아니었으므로
  의도된 잔존이다.
- `npx tsc --noEmit -p tsconfig.node.json` → 통과(오류 0)
- `npx tsc --noEmit -p tsconfig.web.json` → 통과(오류 0, renderer 트랙과 공유하는 preload 타입 변경이
  renderer 쪽 컴파일에 영향 없음을 확인)
- `npx vitest run src/main/terminal src/main/index.test.ts` → **9 files / 103 tests all green**
- `npx vitest run`(전체) → **165 files / 2491 tests all green**(직전 라운드 종료 시점 2502 tests 대비
  -11 — `TerminalManager.exportSessions` 3 tests + `reorder` 2 tests + `sessionOrder.test.ts` 5 tests +
  `index.test.ts` 의 `TERMINAL_REORDER` 1 test, 총 11건 삭제가 그대로 반영된 숫자)
- `npx vitest run --coverage` → **lines 82.08 / statements 83.37 / functions 91.83**(vitest.config.ts
  70% 게이트 유지, exit code 0)
- `npm run build` (electron-vite) → main/preload/renderer 3개 모두 성공

### ▣ M-A-4 완료 기준 충족

- [x] 전체 vitest green
- [x] typecheck(node·web) 통과
- [x] build 통과
- [x] plan.md M-A-4 체크박스 `[x]`
- [x] grep 잔재 0(단, `sanitizeForRestore` 정당한 잔존 — 위 "결정 사항"/"검증" 참조)

### 참조

- ADR-v2-terminal-p2-03 (`adr-03-persistence-v2.md`) §2("TERMINAL_RESTORE/TERMINAL_REORDER 는 삭제한다.
  함께 죽는 것…") §10(레거시 키는 삭제하지 않는다 — 1회 마이그레이션 읽기 경로) — 이번 삭제 범위의 원출처
- `feature/terminal/v2-terminal-p2/impl-log.md` `## [main-process-engineer] M-A(영속화 main) + M-B(링크
  resolve-path)` — M-A-4 를 게이트로 보류하며 남긴 "삭제 대상 6곳" 목록, 이번 라운드가 그대로 실행
- `feature/terminal/v2-terminal-p2/impl-log.md` `## [renderer] B-5 + B-6` "legacy 삭제 준비 완료" 절 —
  이번 라운드의 착수 게이트(소비처 0 확인)

---

## [renderer] B-7/B-9

agent: renderer-engineer. B-7(링크 프로바이더 재작성) + B-9(unicode provider 활성화)를 이번
라운드에 완료했다. Gate 5a(B-6) + M-B(main 존재 검증) 통과 상태에서 착수. `docs/dev/orca-absorption-notes.md`
가 세션 scratchpad 에 남아있던 Orca(stablyai/orca v1.4.162-rc.0, Copyright (c) 2026 Lovecast Inc.) 실제
클론을 발견해(`LICENSE`/`package.json` 로 버전·저작권 대조 확인) 대부분의 모듈을 스펙 서술이 아니라
**실제 원본 소스를 직접 읽고 이식**했다 — 이전 B-5 라운드(`serializeAbsoluteCursor.ts`)가 "Orca 소스에
직접 접근하지 못해 노트만으로 재구현"했다고 남긴 것과 다른 상황이라 impl-log 에 명시해 둔다.

### 변경한 파일

**신규 — `src/renderer/src/components/Terminal/links/`**
- `terminalLinkProviderGuard.ts` / `.test.ts`(5 tests) — **Orca adapted**(고지). `installLinkProviderGuard(terminal)`
  이 `terminal.registerLinkProvider` 를 monkey-patch. `guardLinkProvider()` 가 동기 throw 를 `console.warn`
  으로 강등(원본은 사내 진단 파이프라인 `recordRendererCrashBreadcrumb` 호출 — Clauday 에 없어 대체)
- `terminalPathRegex.ts` / `.test.ts`(16 tests) — **Orca ← VSCode adapted, 이중 고지**. `detectLocalPathLinks()`
  (구분자 필수 압축 정규식 + 공백 경로 3-pass), `detectRanges`/`mergeRanges`/`rangesOverlap`/`insertClaimedRange`/
  `toFileLinkCandidate` 공용 유틸. worktree/SSH/file URI 분기는 Clauday 에 해당 개념이 없어 제거
- `bareFileLink.ts` / `.test.ts`(6 tests) — **Orca ← VSCode adapted, 이중 고지**. `detectBareFilenameLinks()`
  + `EXTENSIONLESS_FILENAMES` 화이트리스트(Makefile/Dockerfile/LICENSE 등)
- `lineColumn.ts` / `.test.ts`(10 tests) — **Orca adapted**(신규 고지 — ADR-06 표에 없던 항목, 이번에 추가).
  `parsePathLineColumn()` — `/^(.*?)(?::(\d+))?(?::(\d+))?$/` + `line<1`/`col<1` 거부 + bare root(`/`,`~/`,`C:/`)
  거부. 원본의 cwd 결합(`resolveExplicitFileLinkTarget*`)은 제거 — main 의 `TERMINAL_RESOLVE_PATH` 가 담당
- `wrappedLinkRanges.ts` / `.test.ts`(13 tests) — **Orca adapted**(`wrapped-terminal-link-ranges.ts` +
  `hard-wrapped-terminal-path-fragments.ts` 두 파일을 plan.md 파일 목록에 맞춰 병합). `buildWrappedLogicalLine`
  (soft wrap, 상한 200행/20k자) / `buildHardWrappedPathLogicalLineCandidates`(hard wrap, 역스캔 20행 + 조각
  판정 술어) / `dedupeLogicalLines` / `rangeForLogicalLineSpan`. `IBufferLine`/`IBufferRange` 를 그대로
  import 하지 않고 실제 쓰는 멤버만 담은 로컬 `TerminalBufferLine`/`BufferRange` 인터페이스로 좁혔다(테스트
  더미가 20여 개 멤버짜리 진짜 `IBufferCell` 을 구현할 필요가 없게)
- `pathExistsCache.ts` / `.test.ts`(6 tests) — **Orca adapted**(SSH/원격 런타임 키 분기 제거,
  `cwd + '\0' + candidate` 단일 키로 단순화, ADR-05 §레이어 5 그대로). LRU 1024 + 음수 캐시
- `resolveLinks.ts` / `.test.ts`(13 tests) — `resolveFileLinkCandidates()`(캐시 우선 조회 → 미스만 배치
  invoke → 캐시 적재) + `preferLongestNonOverlappingLinks()`(**Orca adapted** — `terminal-link-handlers.ts`
  의 동명 함수만, 버퍼 좌표 y/x 사전식 비교로 hard/soft wrap 이 서로 다른 논리 라인에서 나와도 정확히 겹침
  판정) + `isFingerprintStale()`. 파일 나머지(배치 invoke 오케스트레이션)는 Clauday 고유 코드라 파일
  전체를 이식으로 등재하지 않고 함수 단위로 고지
- `parseOsc7.ts` / `.test.ts`(8 tests) — **Orca adapted**. `parseOsc7(data)` — `file://` payload 디코딩 +
  Windows 드라이브 경로 스트립. 원격 런타임 UNC 호스트 옵션은 제거
- `linkClickPriming.ts` / `.test.ts`(5 tests) — **Orca adapted**. `installTerminalLinkifierClickPriming()`
  — mousedown 캡처 시 `terminal._core.linkifier._handleMouseMove` 를 강제 호출해 정지 커서 밑 새 링크의
  첫 클릭 씹힘을 보정(Cmd+클릭 3버그 모듈 ①)
- `ptyMouseSuppression.ts` / `.test.ts`(6 tests) — **Orca adapted, 동작 방식 상당 변경**(아래 "알려진 편차"
  참조). `installTerminalLinkPtyMouseSuppression()` — 마우스 aware TUI(vim 등) 위 Cmd+클릭 이중 열림 방지
  (Cmd+클릭 3버그 모듈 ②)
- `linkActivation.ts`(신규, 이식 아님 — Clauday 고유 3줄 헬퍼) — `isLinkActivationEvent`/`isHttpLinkActivationEvent`.
  기존 `TerminalPane.tsx` 의 `isMac` 판별 관례(`navigator.platform` 휴리스틱)를 재사용해 3개 모듈
  (`filePathLinkProvider`/`linkClickPriming`/`ptyMouseSuppression`)이 공유
- `filePathLinkProvider.ts` / `.test.ts`(9 tests) — 이식 아님(Clauday 고유 조립 로직, Orca
  `terminal-link-handlers.ts` 의 `createFilePathLinkProvider` 구조를 참고했으나 worktree/SSH 없이 배치
  invoke 로 전면 재설계해 고지 대상으로 등재하지 않음). `createFilePathLinkProvider(terminal, deps)` —
  경로 후보 추출 → 존재 검증 배치 → fingerprint 재검증 → 최장 비중첩 선택 → `ILink[]` 조립(activate 시
  `isLinkActivationEvent` 게이팅 + `clearSelection()`[Cmd+클릭 3버그 모듈 ③] + `openPath`, hover/leave 시
  tooltip)
- `linkTooltip.ts` / `.test.ts`(3 tests) — 이식 아님(Clauday 고유). `createLinkTooltip(container)` —
  xterm 공식 가이드(`ILink.hover` JSDoc)대로 `.xterm-hover` 클래스를 단 DOM 을 `terminal.element` 안에
  직접 붙이고 hover/leave 시 텍스트·위치만 갱신(React state 미사용 — mousemove 마다 발화해 리렌더 폭주 방지)
- `terminalLinks.fixtures.test.ts`(4 tests) — `__fixtures__/terminal-links/*.txt` 4종 소비. 완료 기준이
  요구한 "wrap 분단·상대경로·확장자 없는 디렉터리·공백 경로" 4케이스를 그대로 파일로 남겨 회귀 고정

**신규 — `src/renderer/src/components/Terminal/__fixtures__/terminal-links/`**
- `hard-wrap-claude-path.txt` — claude TUI 가 긴 경로를 물리적으로 두 줄에 나눠 찍는 실제 형태
- `relative-path.txt` — `git status` 스타일 상대 경로 출력
- `extensionless-directory.txt` — `cd` 뒤 공백 포함·확장자 없는 디렉터리
- `spaced-path.txt` — macOS `Application Support` 류 공백 포함 절대 경로

**신규 — `src/renderer/src/components/Terminal/`(top-level)**
- `terminalUnicodeProvider.ts` / `.test.ts`(4 tests) — **Orca adapted**(버전 상수 `orca-11-zwj` →
  `clauday-11-zwj`, 클래스명만 브랜딩 변경 — 폭 보정 로직은 원본과 동일). `activateTerminalUnicodeProvider(terminal)`
  — Unicode11 base provider 를 찾아 ZWJ(Zero-Width Joiner) 뒤 이모지가 선행 폭을 이어받도록 감싼 뒤
  `unicode.activeVersion` 전환. base provider 를 못 찾으면 `'11'` 로만 폴백(throw 하지 않음)

**신규 — `test/helpers/`**
- `fakeXtermBuffer.ts` — `wrappedLinkRanges`/`filePathLinkProvider` 테스트용 `IBufferLine` 더미
  (`createFakeBuffer`). 4번째 인자(`outColumns`)를 의도적으로 무시해 `translateLineWithColumns` 가
  프로덕션(xterm 5.5 stable)과 동일하게 항상 셀 단위 폴백 경로를 타도록 강제

**대폭 수정**
- `src/renderer/src/components/Terminal/TerminalPane.tsx` —
  - import 추가: `WebLinksAddon`(`@xterm/addon-web-links`), `activateTerminalUnicodeProvider`,
    `installLinkProviderGuard`, `createFilePathLinkProvider`, `createLinkTooltip`,
    `installTerminalLinkifierClickPriming`, `installTerminalLinkPtyMouseSuppression`, `isLinkActivationEvent`,
    `parseOsc7`, `CachedPathResolution` 타입
  - mount effect 를 ADR-03 §7 14단계에 맞춰 재배치: `new Terminal()` 직후 **`installLinkProviderGuard(terminal)`**
    를 가장 먼저 호출(2단계, 어떤 `loadAddon` 보다도 먼저) → fit/search/serialize/**Unicode11Addon** 로드(3단계,
    이전에는 Unicode11Addon 로드 직후 `activeVersion='11'` 까지 같이 했으나 **활성화는 분리**) → `terminal.open()`
    (4단계) → **`activateTerminalUnicodeProvider(terminal)`**(5단계, open 뒤·write 전) → **OSC7/133 핸들러
    등록**(`terminal.parser.registerOscHandler`, PTY 연결/onOutput 구독 전) → onOutput 구독(6단계, 무변경)
  - 기존 커스텀 링크 블록(`URL_RE`/`FILE_PATH_RE`/`openWithModifier`/`isWideCodePoint`/`stringIndexToCell`/
    `provideLinksByRe`, TerminalPane.tsx:373-450 상당) **전체 삭제**. 대체:
    `new WebLinksAddon((event, uri) => { if (!isLinkActivationEvent(event)) return; window.api.shell.openPath(uri)... })`
    를 `loadAddon` + `createLinkTooltip(terminal.element ?? containerRef.current!)` + 세션당 1개
    `pathLinkCache: Map` + `createFilePathLinkProvider(terminal, {...})` 를 `terminal.registerLinkProvider(...)`
    로 등록(guard 가 patch 한 버전이라 동기 throw 로부터 보호됨)
  - `installTerminalLinkifierClickPriming(terminal)` / `installTerminalLinkPtyMouseSuppression(terminal, () =>
    terminal.modes.mouseTrackingMode !== 'none')` 설치, cleanup 에서 `.dispose()`
  - `paneCwd` 클로저 변수 신설 — OSC7 핸들러가 갱신, `filePathLinkProvider`의 `getCwdHint: () => paneCwd`
    로 소비. `TerminalPaneProps.onCwdChange?: (cwd: string) => void` prop 신설(+ `onCwdChangeRef` 동기화
    effect) — OSC7 로 새 cwd 를 알게 될 때마다 호출, 레거시 3호스트는 생략 가능(optional)
  - 기존 CJK wide-char 하드코딩 표(`isWideCodePoint`/`stringIndexToCell`, :388-411 상당)는 **완전 삭제**
    — `wrappedLinkRanges.ts` 의 셀 매핑(`line.getCell(x)` 순회)이 대체
- `src/renderer/src/components/Terminal/TerminalPane.test.tsx` — FakeTerminal mock 확장: `element`
  (`open()` 시 실제 `div` 생성 — click-priming/mouse-suppression/tooltip 이 진짜 DOM 리스너를 붙일 수 있게),
  `modes.mouseTrackingMode`, `parser.registerOscHandler`(호출 기록), `registerLinkProvider`(호출 기록),
  `unicode.versions`/`unicode.register`. 신규 `describe('v2.0 B-7/B-9 — …')` 블록 5 tests 추가(아래 "검증" 참조).
  **기존 41개 테스트는 1줄도 수정하지 않고 전부 그대로 통과**(무회귀 증거)
- `package.json`/`package-lock.json` — `@xterm/addon-web-links@^0.12.0` 추가(`npm view` 로 stable
  dist-tag 확인, beta 미사용). `npm ls @xterm/xterm` → `5.5.0` 단일, 중복 설치 없음(R10 확인)
- `THIRD-PARTY-NOTICES.md` — 표에 11행 추가(위 "신규" 절의 이식 파일 전부). 마지막 절 "VSCode 파생 파일(예정...)"
  문구를 "(완료)" 로 정정
- `feature/terminal/v2-terminal-p2/plan.md` — R7-1~R7-5, Gate 5 체크박스 `[x]`(수동 QA 항목만 미실시로 남김).
  Gate 5 조건 중 THIRD-PARTY-NOTICES 표/grep 개수 차이(16 vs 15)를 있는 그대로 기록(아래 "검증" 참조)
- `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx` — "🖥 터미널 (v2.0)" 절에 "경로 Cmd+클릭으로
  열기 (개선)" · "한글/이모지 표시 개선" 불릿 2개 추가
- `CHANGELOG.md` — `[Unreleased]` 개선 섹션에 "터미널 경로 Cmd+클릭 재작성" · "한글/이모지 폭 보정" 항목 추가

### 결정 사항 (해야 할 것)

- **`window.api.terminal.resolvePath` 는 `cwdHint` 를 생략할 수 있게 설계했다.** ADR-05 의 cwd 우선순위
  (OSC7 → spawn cwd → pid probe)에서 "OSC7 이 아직 안 왔으면 나머지는 전부 main 이 안다"는 점에 착안 —
  `TerminalPane` 은 `paneCwd`(OSC7 전용)만 들고 있다가 `cwdHint` 로 넘기고, 비어있으면 그냥 생략한다.
  main 의 `TERMINAL_RESOLVE_PATH` 핸들러가 `sessionId` 로 pid probe → spawn cwd 순으로 알아서 판단하므로
  (M-B impl-log 참조) renderer 가 spawn cwd 를 별도로 알 필요가 없어졌다 — `TerminalPane` 에 `cwd` 입력
  prop 을 새로 추가하지 않았다(레거시 3호스트 계약을 건드리지 않기 위해 최대한 좁힌 선택).
- **`onCwdChange` 는 출력 전용 optional prop 으로만 추가했다.** B-5 라운드의 결정 사항("B-7 담당자가 OSC7
  cwd 추적을 붙일 때… `PaneRuntime.cwd` 로 올려보내는 방향을 권장")을 따랐다 — 다만 `TerminalView.tsx`
  쪽에서 이 콜백을 실제로 `PaneRuntime.cwd` 에 반영하는 배선은 **이번 라운드에 하지 않았다**(아래 "알려진
  편차" 참조 — 범위 판단).
- **`resolveLinks.ts` 의 캐시 버킷 키는 `cwdHint ?? session:${sessionId} ?? 'unknown'` 으로 근사했다.**
  ADR-05 는 캐시 키를 "cwd + candidate" 라고만 명시하고 "아직 cwd 를 모를 때" 를 다루지 않는다 — OSC7 이
  오기 전(pane 갓 생성 직후) 첫 hover 는 cwdHint 가 없으므로 세션 단위로 격리해 다른 세션과 캐시가 섞이지
  않게 했다. OSC7 이 도착해 cwdHint 가 생기면 그 시점부터는 실제 cwd 키로 갈아탄다(과거 session 키 캐시는
  자연 소멸 — LRU 니 별도 마이그레이션 불필요).
- **`preferLongestNonOverlappingLinks` 를 문자열 인덱스가 아니라 버퍼 좌표(x/y) 기준으로 다시 설계했다.**
  최초 구현은 논리 라인의 `startIndex`/`endIndex` 로 겹침을 판정했는데, hard-wrap 후보와 soft-wrap 논리
  라인이 **서로 다른 논리 라인 객체**(문자열 인덱스 공간이 다름)에서 나올 수 있다는 걸 테스트를 짜다가
  발견했다 — Orca 원본처럼 `ILink.range`(버퍼 x/y, 사전식 비교) 기준으로 바꿔서 이 문제를 근본적으로
  피했다(테스트 케이스 "서로 다른 논리 라인(y)의 후보도 올바르게 비교한다" 로 고정).
- **`ptyMouseSuppression.ts` 를 원본과 다른 메커니즘으로 재구현했다 — 가장 큰 편차.** Orca 원본은
  `terminal.options.mouseEventsRequireAlt` 를 토글하는데, 이 옵션은 Orca 의 xterm **6.1.0-beta + 자체
  패치 5종**(Orca 노트 §0)에만 존재한다. `node_modules/@xterm/xterm/lib/xterm.js`(5.5.0 stable) 전체를
  grep 해 그런 옵션이 없음을 직접 확인했다. 대신 **DOM 이벤트 전파를 캡처 단계에서 끊는 방식**으로 같은
  목표(마우스 리포팅 억제)를 달성한다 — xterm 의 마우스 리포팅/선택 리스너는 `terminal.element` 의
  자식(뷰포트/스크린 엘리먼트)에 버블 단계로 붙는다(같은 파일의 다른 `addEventListener` 호출을 grep 해
  `{capture:true}` 가 전혀 없음을 확인) — `terminal.element` 자체에 캡처 단계로 붙인 우리 리스너가 그보다
  먼저 순회되므로, 억제 대상 `mousedown` 만 `stopPropagation()` 으로 아예 도달을 막는다. **`mouseup` 은
  절대 막지 않는다** — 링크 `activate` 판정이 xterm 내부적으로 `mouseup`(또는 그에 준하는 클릭 완료
  이벤트)에서 일어난다고 보고, 거기까지 막으면 "이중 열림 방지" 대신 "링크 자체가 안 열림" 이라는 더 나쁜
  회귀가 된다고 판단했다. **이 메커니즘은 jsdom 으로 검증 불가**(xterm 내부 리스너가 정말 `terminal.element`
  의 자식에 버블 단계로 붙는지는 실제 브라우저/Electron 렌더러에서만 확인 가능) — ADR-05 자체가 이미 이
  항목("⑧vim 안에서 클릭 시 이중 열림 없음")을 수동 QA 목록에 못박아 뒀으므로, 자동화 테스트는 "우리
  리스너가 조건에 맞으면 전파를 끊는다"까지만 고정하고 실제 xterm 과의 상호작용은 수동 QA 로 넘겼다
  (아래 "수동 QA 목록" 참조 — 반드시 확인 필요).
- **`lineColumn.ts` 를 ADR-06 표에 없던 신규 이식 항목으로 추가했다.** ADR-06 이 착수 시점에 작성한 표에는
  `lineColumn.ts` 가 없었지만(plan.md 는 있었음 — "line:col 접미: `/^(.*?)(?::(\d+))?(?::(\d+))?$/`"), 실제
  구현하며 Orca `explicit-file-link-target.ts` 의 이 정규식·bare-root 거부 로직을 그대로 가져왔음을 확인해
  고지 대상으로 새로 등재했다("표의 진실은 THIRD-PARTY-NOTICES.md" 원칙, ADR-06 §3).
- **`resolveLinks.ts` 는 파일 전체가 아니라 `preferLongestNonOverlappingLinks` 함수 하나만 이식으로
  등재했다.** 배치 invoke 오케스트레이션(`resolveFileLinkCandidates`)은 Orca 의 per-candidate 개별 IPC
  방식과 근본적으로 다른 설계(ADR-05 가 명시적으로 요구한 배치화)라 Clauday 고유 코드로 판단했다.
- **`filePathLinkProvider.ts`/`linkTooltip.ts`/`linkActivation.ts` 는 이식 등재하지 않았다.** Orca
  `terminal-link-handlers.ts` 의 `createFilePathLinkProvider` 구조(hover/activate/leave 조립, 배치 검증
  뒤 필터링)를 참고했지만 worktree/SSH/HTML 시스템 기본앱 분기를 전부 걷어내고 우리 배치 IPC 로 재설계해
  "동일 로직을 옮긴 것"이라 보기 어렵다고 판단했다 — ADR-06 §대안 1("실제로는 로직·상수·경계 조건을 그대로
  옮긴다"는 기준)에 못 미친다.

### 알려진 편차 (plan.md/ADR 문면과 다르게 구현한 지점)

- **IME 후보창 앵커/조합 추적/후보 선택키 가드는 구현하지 않았다.** 브리핑 지시문은 "IME 후보창 앵커
  (.xterm-screen bounds 셀 유도), 조합 상태 추적 + 후보 선택키 가드"를 B-9 범위에 포함했지만, 이는
  **prd.md 의 명시적 비목표**("IME 후보창 앵커 / 조합 추적(B-9 나머지) — `terminal-unicode-provider` 만
  이번에 가져오고, `terminal-ime-candidate-anchor` 계열은 Phase 3 로 미룬다")와 **plan.md R7-5 체크리스트**
  (unicode provider 만 명시, IME 앵커 항목 자체가 없음) 양쪽과 직접 충돌한다. `docs/dev/orca-absorption-notes.md`
  §7 이 "패치 전제 모듈은 스코프 아웃 — 그 외 독립적으로 붙는 것만"이라고 IME 앵커/조합 추적을 함께
  묶어놓은 문구가 브리핑 작성에 혼선을 줬을 수 있다. **plan.md 의 명시적 체크리스트 + PRD 비목표를
  브리핑 요약보다 우선**해 `terminalUnicodeProvider.ts` 만 구현했다 — 오케스트레이터 확인 필요 사항으로
  보고한다.
- **`ptyMouseSuppression.ts` 는 위 "결정 사항"에 적었듯 원본과 다른 메커니즘**(옵션 토글 → 이벤트 전파
  차단)이다. THIRD-PARTY-NOTICES.md 에도 이 편차를 요약해 남겼다.
- **`onCwdChange` 를 `TerminalView.tsx` 의 `PaneRuntime.cwd` 갱신에 실제로 연결하지 않았다.** prop 자체는
  추가했고 `TerminalPane` 은 OSC7 을 받을 때마다 호출하지만, `TerminalView`(호스트) 쪽에서 이 콜백을
  받아 `PaneRuntime.cwd` 를 업데이트하는 배선은 하지 않았다 — `TerminalView.tsx` 는 B-5 라운드 소유
  파일이고, 이번 브리핑이 명시적으로 지시하지 않은 상태에서 호스트 오케스트레이션 로직을 건드리는 것은
  범위 밖이라 판단했다(출력 경계가 `TerminalPane` 배선까지로 한정돼 있었음). 링크 자체의 cwd 정확도에는
  영향 없다(`paneCwd` 클로저가 이미 OSC7 을 직접 소비하므로) — 영향받는 것은 오직 "스냅샷에 저장되는
  `pane.cwd` 가 `cd` 이후에도 최신인가" 뿐이며, 이는 이미 spawn cwd 로 대체로 맞는 값이 저장되던 기존
  동작과 동일한 수준이다. 후속 라운드에서 `TerminalView`(B-5 소유자 또는 다음 담당)가
  `onCwdChange={(cwd) => updatePaneCwd(tab.tabId, leafId, cwd)}` 한 줄만 추가하면 된다.
- **`FILE_PATH_RE`(따옴표 3-alternative 방식)를 완전히 폐기했다** — plan.md 가 명시적으로 요구한 대로
  (확장자 화이트리스트 → bare filename 존재 검증 방식 전환), 따옴표 안 경로는 이제 별도 처리 없이
  `terminalPathRegex.ts` 의 공백 3-pass 가 흡수한다(따옴표 문자 자체는 `LEADING_TRIM_CHARS`/
  `TRAILING_TRIM_CHARS` 로 트리밍됨). 실제 확인: `'/Users/x/My File.txt'` 형태 픽스처는 이번 테스트
  스위트에 포함하지 않았다 — 공백-3-pass 로직 자체는 fixture 4종 + terminalPathRegex.test.ts 16종으로
  충분히 커버된다고 판단했지만, 따옴표로 감싼 케이스의 존재 검증 배치 흐름까지 통합 테스트로 짚지는
  않았다(순수 회귀 위험은 낮음 — 정규식 계층 테스트가 이미 공백 트리밍을 검증).
- **테스트 접근을 위해 `FakeTerminal` 목에 `element`/`modes`/`parser` 를 추가했다** — plan.md/ADR 어디에도
  명시되지 않은 테스트 인프라 확장이지만, B-7/B-9 배선을 최소한이라도 통합 검증하려면 불가피했다(순수
  모듈 테스트 103건만으로는 "TerminalPane 안에서 실제로 연결됐는가"를 증명하지 못한다). 기존 41개 테스트는
  무수정으로 통과해 무회귀를 증명한다.

### 제약 (하지 말 것) — 실제로 지킨 것

- **`src/main/**`, `src/preload/**` 무접근.** `window.api.terminal.resolvePath`/`window.api.shell.openPath`
  는 이미 노출돼 있던 것을 그대로 호출만 했다. `git diff --stat -- src/main src/preload` 로 내 세션이
  그 경로에 아무 것도 남기지 않았음을 확인했다(같은 작업 트리에서 동시 진행 중이던 main-process-engineer
  의 M-A-4 라운드 변경분은 내 것이 아니다 — 이 impl-log 섹션은 그 변경을 다루지 않는다).
- **새 IPC 채널 신설 없음.** `terminal.resolvePath`(M-B), `shell.openPath`(기존) 만 소비.
- **`TerminalManager` 의 spawn/플랫폼 분기 무접근.** `AIService`/`ClaudeChatService`/멘션 파이프라인
  무접근.
- **`BranchWorkspace.tsx`/`MentionAgentView.tsx`(+ 테스트) 무수정.** 새 `onCwdChange` prop 은 optional 이라
  레거시 3호스트가 넘기지 않아도 기존과 동일하게 동작한다(`paneCwd` 는 항상 내부적으로 추적되지만, 그
  값을 밖으로 올려보낼지는 호스트의 선택).
- **`@xterm/xterm` 버전 변경 없음(`5.5.0` 그대로).** `@xterm/addon-web-links@0.12.0`(stable, beta 아님)만
  추가 — `npm ls @xterm/xterm` 로 단일 버전 확인.
- **xterm 6.x 베타 전용 API(`outColumns` 4번째 인자 등) 미사용** — `translateLineWithColumns` 가 그
  인자를 시도는 하되 실패 시 셀 단위 폴백으로 떨어지는 구조(Orca 노트 §0 그대로).
- **셸 rc 주입 없음.** OSC7/133 은 수신만.
- **이식 파일을 고지 없이 커밋 대상에 넣지 않았다** — 이식 파일과 THIRD-PARTY-NOTICES.md 행 추가를 같은
  작업 단위로 진행(ADR-06 §3).
- **단축키 레지스트리(Workstream D) 선취 없음.**
- **작업과 무관한 리팩터·포맷팅 없음.** `TerminalPane.tsx` 에서 건드린 것은 링크/unicode/OSC 배선 구간뿐
  — 이미지 사이드바·키 핸들러 테이블·검색 배선·B-5/B-6 복원·WebGL 로직은 1바이트도 건드리지 않았다
  (`git diff` 로 확인, mount effect 재배치 구간 외 diff 없음).
- **단계 게이트를 건너뛰지 않았다** — Gate 5a(B-6 그린) + M-B(main resolvePath 핸들러 존재) 확인 후 착수.

### 검증

- `npx vitest run src/renderer/src/components/Terminal/links src/renderer/src/components/Terminal/terminalUnicodeProvider.test.ts`
  → **14 files / 103 tests all green**
- `npx vitest run src/renderer/src/components/Terminal` → **32 files / 322 tests all green**
  (`TerminalPane.test.tsx` 41→46, 기존 41개는 무수정)
- `npx vitest run`(전체) → **179 files / 2600 tests all green**(main-process-engineer 의 동시 진행
  M-A-4 라운드 산출물과 함께 실행된 숫자 — 그쪽 변경은 이 섹션 소관 아님)
- `npx vitest run --coverage` → **lines 82.08 / statements 83.37 / functions 91.83**(vitest.config.ts
  게이트 70/70/80 유지. `src/renderer/src/components/Terminal/**` 은 애초에 coverage `include` 목록
  밖이라 이번 신규 모듈이 게이트 수치에 직접 반영되진 않는다 — 그래도 각 모듈 자체는 103개 순수 함수
  테스트로 충분히 커버)
- `npx tsc --noEmit -p tsconfig.web.json` / `-p tsconfig.node.json` → 둘 다 통과(오류 0)
- `npm run build`(electron-vite) → main/preload/renderer 3개 모두 성공
- `npm ls @xterm/xterm` → `5.5.0` 단일(addon-web-links 포함 중복 설치 없음, R10)
- `grep -rl "Portions adapted from" src/` → **15개 파일**. `THIRD-PARTY-NOTICES.md` 표 행 수는 **16** —
  1 차이는 `tabDragSensor.ts`(p1 부터 있던 파일, "TabPointerSensor 는 dnd-kit 의 PointerSensor... 파생물"
  이라는 다른 문구 관례를 써서 이번 grep 패턴에 안 걸림)가 표에는 있지만 grep 매치는 안 되기 때문이다.
  **이번 라운드가 새로 추가한 11개 파일은 grep 매치 ↔ 표 행이 전부 1:1 대응**함을 개별 확인했다(`links/`
  10개 + `terminalUnicodeProvider.ts` 1개 — `filePathLinkProvider.ts`/`linkTooltip.ts`/`linkActivation.ts`
  는 "결정 사항"에서 설명한 대로 의도적으로 고지 대상에서 제외했으므로 grep 에도 안 걸리고 표에도 없다,
  일관됨).

### ▣ Gate 5 조건 충족

- [x] `npx tsc --noEmit` 양쪽 통과, `npm run test:run` 전체 그린
- [ ] 수동 QA(ADR-05 §모니터링 8종) — **미실시(헤드리스 환경)**. 아래 "수동 QA 목록" 참조
- [x] `THIRD-PARTY-NOTICES.md` 표/grep 개수 비교 완료(1 차이, 사유 명시 — 위 "검증" 참조)

### 수동 QA 목록 (jsdom 으로 검증 불가 — 통합 단계에서 실제 Electron 창으로 확인 필요, ADR-05 §모니터링)

1. **claude 로 매우 긴 경로를 출력시킨 뒤(TUI 가 hard wrap 하는 경우) 그 경로에 Cmd+클릭** — 사용자가
   신고한 원래 버그의 재현 시나리오. 한 링크로 열려야 한다.
2. **`ls -la` 결과에서 디렉터리(trailing slash 없는 것 포함)를 Cmd+클릭** — Finder/탐색기가 열려야 한다.
3. **`Makefile`/`Dockerfile` 단독 텍스트를 Cmd+클릭** — 확장자 없이도 열려야 한다.
4. **`src/main/index.ts:120:8` 형태를 Cmd+클릭** — 파일이 열리고, hover 시 툴팁에 `:120:8` 이 함께
   보이는지(줄 이동 자체는 이번 스코프 밖 — 툴팁 표기까지만).
5. **한글 폴더명이 섞인 경로**(`~/문서/프로젝트/파일.txt`) Cmd+클릭.
6. **`cd project` 후 상대 경로 출력**(claude 가 `src/foo.ts` 처럼 상대 경로를 낼 때) Cmd+클릭 — pid cwd
   probe(POSIX) 가 spawn cwd 가 아니라 실제 `cd` 이후 cwd 를 잡는지 확인.
7. **존재하지 않는 경로 문자열**은 hover 해도 밑줄이 안 생기는지.
8. **vim 을 띄우고(마우스 모드 on, 예: `:set mouse=a`) 그 안의 경로를 Cmd+클릭** — 앱(vim) 과 링크
   양쪽에서 이중으로 열리지 않는지, 그리고 **여전히 링크가 정상적으로 한 번은 열리는지**(과잉 억제로
   아예 안 열리는 회귀가 없는지 — `ptyMouseSuppression.ts` 재구현의 핵심 검증 포인트).
9. **htop/tmux 등 다른 마우스 aware TUI** 에서도 8번과 동일하게 확인.
10. **한글/이모지(ZWJ 포함, 예: 👨‍👩‍👧‍👦) 를 터미널에 출력** — 폭이 깨지지 않는지. 복원(재시작) 후에도
    동일한지(B-5 의 복원 시퀀스와 조합 확인).
11. **정지된 커서 위에 클로드가 새 경로를 찍었을 때 첫 클릭이 바로 먹는지**(click-priming 이 없으면
    hover 갱신이 안 되어 첫 클릭이 씹혔던 문제).
12. **경로에 Cmd+클릭 시 드래그 선택으로 오인되지 않는지**(`clearSelection()` 확인).

### 참조

- ADR-v2-terminal-p2-05 (`adr-05-link-provider.md`) — 5중 레이어 설계, cwd 우선순위, Cmd+클릭 3버그
  모듈, 모니터링 8종 원출처
- ADR-v2-terminal-p2-03 (`adr-03-persistence-v2.md`) §7 — 복원 순서 14단계(guard/unicode 활성화 위치의
  근거)
- ADR-v2-terminal-p2-06 (`adr-06-third-party-notices.md`) — 이식 고지 절차, 착수 시점 이식 대상 표
- `docs/dev/orca-absorption-notes.md` §0(스택 차이 — xterm 6.1-beta+패치, `mouseEventsRequireAlt` 관련
  단서) §1(링크 5중 레이어) §7(unicode provider 활성화 시점) §9 함정 #5(guard)/#6(캐시)/#7(unicode)
- `feature/terminal/v2-terminal-p2/prd.md` 비목표 절 — IME 후보창 앵커를 Phase 3 로 미룬 명시적 근거
- `~/.claude/plans/toasty-sleeping-simon.md` B-7/B-9
- plan.md B-7 전 구간, Gate 5a, M-B
- plan.md M-A-4 전 구간
