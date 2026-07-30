---
task: v2-terminal-p2
date: 2026-07-30
---

# Plan — v2.0 Phase 2 · 터미널 대개편 (B-3 → B-4 → B-5 → B-6 → B-7)

> 브랜치: `feat/version-2.0` (Phase 1 커밋 반영됨 — `TERMINAL_EXIT` / `useTerminalSearch` / 탭 DnD 존재)
> 선행 문서: [prd.md](prd.md) · [adr.md](adr.md)(01 prop 분리) · [adr-02](adr-02-split-tree.md)(split 트리) · [adr-03](adr-03-persistence-v2.md)(영속화 v2) · [adr-04](adr-04-webgl.md)(WebGL) · [adr-05](adr-05-link-provider.md)(링크) · [adr-06](adr-06-third-party-notices.md)(서드파티 고지)
> 필독: `docs/dev/orca-absorption-notes.md` 전체 (§0 스택 차이 · §1 링크 · §3 영속화 교정 · §4 WebGL · §5 split/탭 · §7 unicode · §9 함정 12개)
> 목업: `docs/mockups/v2/terminal-split.html`

## 분리 영역

| 파트 | 담당 | 파일 |
|---|---|---|
| **공유 계약** | main-process-engineer (**가장 먼저 확정**) | `src/shared/types/ipc.ts`, `src/shared/types/terminal.ts` |
| **main** | main-process-engineer | `src/main/terminal/{TerminalManager,snapshotStore,pathResolver,ptyCwd}.ts` + 테스트, `src/main/index.ts`(**2블록만**), `src/main/index.test.ts`, `src/preload/index.ts` |
| **shared 유틸** | main-process-engineer | `src/shared/utils/textBytes.ts` + 테스트 |
| **renderer** | renderer-engineer | `src/renderer/src/components/Terminal/**`, `src/renderer/src/App.tsx`(1줄), `src/renderer/src/components/Settings/SettingsView.tsx`(렌더러 토글), `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx`, `test/helpers/mockWindowApi.ts`, `package.json`(xterm addon 3종) |
| **공통 마감** | integrator | `THIRD-PARTY-NOTICES.md`(신설 커밋은 B-4), `README.md`(링크), `CHANGELOG.md`, `.agent/wiki/{domain-terminal,domain-electron-ipc,decisions-log}.md`, `qa-report.md` |

### 순서 의존 (단계 게이트)

```
S-0 공유 계약 (main)
 ├─▶ B-3 prop 분리 (renderer)  ──▶ [Gate 1] ──▶ B-4 split (renderer) ──▶ [Gate 2]
 │                                                     │
 └─▶ M-A 영속화 main (main, B-3/B-4 와 병렬 가능) ──────┤
                                                       ▼
                                      B-5 영속화 renderer ──▶ [Gate 3]
                                                       ▼
                                            B-6 WebGL ──▶ [Gate 4]
                                                       ▼
        M-B 링크 resolve main (병렬 가능) ──────▶ B-7 링크 renderer ──▶ [Gate 5] ──▶ V 마감
```

- **main 파트(M-A / M-B)는 S-0 직후 착수 가능**하며 renderer 의 B-3/B-4 와 파일이 겹치지 않는다.
- renderer 의 B-5 착수 조건은 **M-A 완료**(preload 타입이 컴파일되어야 함).
- 각 단계는 **독립 커밋**. 게이트를 통과하지 못한 채 다음 단계를 시작하지 않는다.

### impl-log 규약

`feature/terminal/v2-terminal-p2/impl-log.md` 한 파일을 **append 전용**으로 공유한다.

- [ ] main-process-engineer 는 `## [main-process-engineer] 변경한 파일 / 결정 사항 (해야 할 것) / 제약 (하지 말 것) / 참조` 4섹션을 파일 **끝에 추가**
- [ ] renderer-engineer 는 동일 4섹션을 `## [renderer-engineer] …` 헤더로 파일 **끝에 추가**
- [ ] **상대 파트의 섹션을 수정·삭제하지 않는다.** 파일이 없으면 먼저 도착한 쪽이 frontmatter(`task: v2-terminal-p2`, `date:`)를 만든다
- [ ] 상대 파트에 영향 주는 사실(스냅샷 필드 확정, handle 시그니처, 채널 payload)은 자기 섹션 "결정 사항" 에 **한 줄로**
- [ ] 단계별 커밋 해시를 각 섹션 끝에 기록 (되돌리기 단위 추적)

---

## S-0. 공유 계약 확정 (main-process-engineer — 가장 먼저, renderer 대기 중)

- [x] `src/shared/types/terminal.ts` 에 split/스냅샷 타입 추가 (ADR-02 §1, ADR-03 §1). 각 타입에 한국어 1~2줄 주석:
  - [x] `SplitDirection` / `SplitLeaf` / `SplitBranch` / `SplitNode` — **leaf 는 `leafId` 만**, `sessionId` 금지
  - [x] `TerminalPaneSnapshot { cwd?, cols, rows, serialized }`
  - [x] `TerminalTabSnapshot { tabId, name, tree, focusedLeafId, panes }`
  - [x] `TerminalWorkspaceSnapshotV2 { version: 2, savedAt, activeTabId, tabs }`
  - [x] `TerminalResolvePathRequest { sessionId?, cwdHint?, candidates }` / `TerminalResolvedPath { candidate, resolved, kind }`
- [x] `src/shared/types/ipc.ts` Terminal 블록(:143-157)에 채널 4개 추가:
  ```ts
  /** v2.0 B-5: 렌더러 스냅샷 저장 (invoke). main 이 store 쓰기 + 메모리 캐시 갱신 */
  TERMINAL_SAVE_STATE: 'terminal:save-state',
  /** v2.0 B-5: 스냅샷 복원 (invoke). 최초 1회 legacy terminalSessions 마이그레이션 포함 */
  TERMINAL_RESTORE_STATE: 'terminal:restore-state',
  /** v2.0 B-5: main → renderer flush 요청 (push 전용). handle 등록 금지 */
  TERMINAL_REQUEST_STATE: 'terminal:request-state',
  /** v2.0 B-7: 링크 후보 존재 검증 배치 (invoke) */
  TERMINAL_RESOLVE_PATH: 'terminal:resolve-path',
  ```
- [ ] 같은 블록에서 **삭제**: `TERMINAL_RESTORE`, `TERMINAL_REORDER` (ADR-03 §2). 삭제는 M-A 에서 소비처를 함께 지울 때 커밋한다 — S-0 커밋에서는 **추가만** 하고, 삭제는 M-A-4 에서 (컴파일 깨짐 구간을 만들지 않기 위해) — **의도적으로 미체크: 이번 라운드는 추가만, 삭제는 M-A-4 몫**
- [x] impl-log 에 "스냅샷 필드 확정 + 채널 4개 확정" 한 줄 기록 → **renderer 착수 신호**

> 커밋: `feat(terminal/shared): v2 split·스냅샷 타입 + IPC 채널 4종 (B-3~B-7 계약)`

---

## B-3. TerminalPane prop 분리 (renderer-engineer)

### R3-1. 순수 함수 + 타입

- [x] `src/renderer/src/components/Terminal/paneActivation.ts` 신규 — `resolvePaneActivation({ isVisible, isFocused, isActive })` → `{ visible, focused }` (ADR-01 §1). 한국어 1~2줄 주석에 "isActive 는 레거시 폴백" 명시
- [x] `src/renderer/src/components/Terminal/paneActivation.test.ts` 신규 — 레거시 입력 3케이스(`isActive: true|false|미지정`) + 신규 4조합 + 혼합 우선순위

### R3-2. TerminalPane 개조

- [x] `TerminalPaneProps` 에 추가: `isVisible?: boolean`, `isFocused?: boolean`, `onFocusRequest?: () => void`. `isActive` 는 **optional 로 변경 + `@deprecated` JSDoc 1줄**
- [x] 컴포넌트 최상단에서 `const { visible, focused } = resolvePaneActivation({ isVisible, isFocused, isActive })` — 이후 본문에서 `isActive` 를 직접 읽지 않는다
- [x] 컨테이너 className(:540) → `visible` 기준
- [x] fit/PTY resize effect(:471-497) → deps `[visible, sessionId]`. **`term.focus()` 호출을 이 effect 에서 제거**
- [x] 신규 focus effect → deps `[focused]`. `focused === true` 일 때만 `term.focus()`
- [x] document paste effect(:520-536) → 게이트를 `focused` 로 교체 (ADR-01 §2 — 앱 전체 최대 1개)
- [x] `ResizeObserver` 는 유지하되 `visible === false` 면 fit 스킵 (0×0 fit → PTY 1×1 사고 방지)
- [x] pane 컨테이너에 `onPointerDownCapture={() => onFocusRequest?.()}` + xterm textarea `focus` 리스너에서도 `onFocusRequest?.()`
- [x] `focused` 일 때 목업 `.pane.focused` 의 1.5px 파란 보더, 아닐 때 `.pane.dimmed`(출력 opacity .7) — 단 **레거시 호스트에서는 보더가 보이지 않아야 한다**(pane 1개 = 항상 focused 이므로 `showFocusRing?: boolean` prop 을 두고 SplitLayout 만 true 로 넘긴다)

### R3-3. forwardRef handle

- [x] `TerminalPane` 을 `forwardRef<TerminalPaneHandle, TerminalPaneProps>` 로 감싸고 `useImperativeHandle` 배선
- [x] `TerminalPaneHandle { serialize(): TerminalPaneSnapshot | null; focus(): void; fit(): void }` 를 같은 파일에서 export
- [x] `serialize()` 는 **B-3 단계에서 `null` 반환 스텁** — addon 은 B-5 에서 붙인다. throw 금지, 주석에 "ADR-03 에서 본체 구현" 명시
- [x] `displayName` 지정(forwardRef 로 감싸면 devtools 이름이 사라짐)

### R3-4. 테스트

- [x] `TerminalPane.test.tsx` 확장 (기존 케이스 전부 유지):
  - [x] `focused: false` pane 은 `document` paste 리스너를 등록하지 않음 (addEventListener spy)
  - [x] 분할 시뮬레이션 — visible 2개 중 focused 1개일 때 paste 1회 → `saveAttachment` 1회 (구현: `sendFileAsPath` 가 path 있으면 `saveAttachment` 를 스킵하므로 테스트는 동등한 `terminal.input` 1회 호출로 검증 — impl-log 참조)
  - [x] `visible` 전환에서만 `window.api.terminal.resize` 발생, `focused` 전환에서는 미발생
  - [x] `ref.current.serialize()` 가 `null` 반환 (throw 없음)
- [x] **`TerminalView.test.tsx` / `MentionAgentView.test.tsx` 를 수정하지 않고** 통과하는지 확인 → 무회귀의 기계적 증거
- [x] `git diff --stat src/renderer/src/components/{Git/BranchWorkspace.tsx,MentionAgent/MentionAgentView.tsx}` 가 **0** 인지 확인 후 impl-log 기록

### ▣ Gate 1 — B-4 착수 조건

- [x] `npx tsc --noEmit -p tsconfig.web.json` 통과 (내 스코프 파일 기준 — 병렬 트랙의 기존 미포함 파일 오류 2건은 무관, impl-log 참조)
- [x] `npx vitest run src/renderer/src/components/Terminal src/renderer/src/components/MentionAgent` 그린
- [x] 레거시 3호스트 diff 0줄 확인
- [ ] 수동: 터미널 탭 3개 전환 → 포커스/입력/fit 이 현행과 동일 (수동 QA 미실시 — 통합 단계에서 확인 필요)

> 커밋: `refactor(terminal/renderer): TerminalPane isVisible/isFocused 분리 + serialize handle (B-3)`

---

## B-4. Split pane (renderer-engineer)

### R4-0. 서드파티 고지 선행 (ADR-06 — 이식 파일보다 먼저)

- [x] `THIRD-PARTY-NOTICES.md` **신설** — 서문 / 프로젝트별 저작권 줄(Orca·Lovecast Inc. / Microsoft VSCode / dnd-kit / xterm.js) / **MIT 전문 1회** / 이식 파일 표(헤더: `로컬 경로 | 원본 프로젝트 | 원본 경로 | verbatim·adapted`)
- [x] `README.md` 하단에 `THIRD-PARTY-NOTICES.md` 링크 1줄
- [x] p1 의 `tabDragSensor.ts`(dnd-kit `PointerSensor` 상속) 행을 표에 소급 등재
- [x] 이후 이식 파일을 만들 때마다 **① 파일 상단 고지 블록(4요소: 원 프로젝트/원본 경로+버전/저작권+MIT/변경 1줄) → ② 표에 행 추가** 를 같은 커밋에서 수행

### R4-1. splitTree 순수 함수

- [x] `src/renderer/src/components/Terminal/splitTree.ts` 신규 (ADR-02 §2) — `splitLeaf` / `closeLeaf`(형제 승격, 마지막이면 null) / `findLeafPath` / `collectLeafIds` / `setRatioAtPath`(경로가 분기 아니면 원본 반환) / `quantizeRatio`(0.5±0.005 → undefined, 그 외 3자리) / `getEqualizeWeight` + `equalizeRatios` / `neighborLeaf(tree, from, 'left'|'right'|'up'|'down')` / `isValidTree`(unknown type · 중복 leafId · ratio 범위 · 깊이>8)
- [x] `splitTree.test.ts` 신규 — 위 함수별 경계 + `neighborLeaf` 4방향 + 손상 트리 5종 + **불변성**(입력 트리를 변형하지 않음)

### R4-2. SplitLayout + 리페어런트 규약

- [x] `src/renderer/src/components/Terminal/SplitLayout.tsx` 신규 — 재귀 render-prop. `direction: 'row'|'column'` → flex, `flex-basis: calc(ratio * 100%)`, 최소 `Math.min(MIN_PANE_PX(120), total/2)`
- [x] 파일 상단에 **5줄 주석** — "leaf 슬롯은 의도적으로 빈 div 다. xterm 은 트리 밖 Map + portal(ADR-02 §4). 여기서 `<TerminalPane>` 을 직접 렌더하면 재조정으로 스크롤백이 날아간다"
- [x] `TerminalView` 에 `paneHostsRef: Map<leafId, HTMLDivElement>` + `getOrCreateHost(leafId)` — host div 는 leafId 당 **한 번만** 생성
- [x] `TerminalView` 가 `collectLeafIds(tree).map(id => createPortal(<TerminalPane ref={…} … />, getOrCreateHost(id)))`
- [x] leaf 슬롯 effect: `slot.appendChild(host)` + cleanup 없음(host 는 다음 슬롯이 가져간다)
- [x] `reattachPaneHost(leafId)` 유틸 — `scrollState 캡처 → (B-6 이후) disposeWebgl → appendChild → rAF → (B-6 이후) attach → fit → scrollState 복원`. B-4 단계에서는 WebGL 호출부를 빈 훅으로 두고 B-6 에서 채운다

### R4-3. pane divider (이식)

- [x] `src/renderer/src/components/Terminal/paneDividerDrag.ts` 신규 — **Orca `pane-divider-drag.ts` adapted** (고지 블록 + 표 행). 단 이번 세션은 Orca 소스에 직접 접근하지 못해 `docs/dev/orca-absorption-notes.md` §5 서술 스펙(투명 히트박스/rAF/resize 홀드/적응형 min)을 재구현했다 — impl-log "알려진 편차" 참조
  - [x] 투명 히트박스 8px + 중앙 1px 시각선(SplitLayout.tsx 의 divider — 교차 지점 음수 inset 연결은 생략, impl-log 참조)
  - [x] `setPointerCapture` + window `pointermove`/`pointerup` 이중화
  - [x] rAF 코얼레싱
  - [x] **드래그 중 DOM `flex-basis` 만 조작 — React state·PTY resize 금지** (함정 #9, `suspendAutoResize` 게이트로 ResizeObserver 발 resize 도 억제)
  - [x] 드롭 시 1회: `setRatioAtPath` → `fit` → PTY resize
  - [x] 더블클릭 → 0.5 / 적응형 최소폭
- [x] `paneDividerDrag.test.ts` — 순수 계산부(`clampRatio`, `ratioFromPointer`, 적응형 min)만 단위 테스트. 실제 pointer 이벤트는 수동 QA

### R4-4. TerminalView 상태 재편

- [x] `TabEntry { tabId, name, tree, focusedLeafId, panes: Record<leafId, PaneRuntime> }` 로 전환. `PaneRuntime { sessionId, cwd?, exitInfo?, generation, savedOutput? }` — `savedSnapshot`(B-5 구조화 스냅샷)은 아직 없어 레거시 `initialOutput` 경로를 그대로 옮긴 `savedOutput` 필드로 대체(impl-log 참조)
- [x] 기존 `SessionWithOutput[]` 소비처(탭바 렌더 · MRU · exit 구독 · rename · closeSession · ⌘1~9)를 전부 새 모양으로 이관. **탭 DnD(p1) 는 `tabId` 기준으로 유지**
- [x] exit 구독: payload 의 `id`(sessionId) → 역매핑으로 `(tabId, leafId)` 찾아 `exitInfo` 세팅. 이미 있으면 덮지 않음(p1 규약 유지)
- [x] `splitFocusedPane(direction)` — `window.api.terminal.create({ cwd: 현재 pane cwd })` → `splitLeaf(tree, focusedLeafId, direction, newLeafId)` → `focusedLeafId = newLeafId`
- [x] `closeLeafInTab(tabId, leafId)`(plan 원문의 `closeFocusedPane` — 호출부가 활성 탭/focusedLeafId 를 구해 넘긴다) — `kill(sessionId)` → `closeLeaf` → null 이면 탭 닫기. 닫힌 뒤 포커스는 형제의 첫 leaf
- [x] 탭 라벨에 pane 수 배지(2 이상일 때, 목업 `.panecnt` → `⫿N`)
- [ ] 활성 pane 의 OSC 타이틀만 탭 제목으로 전파 — **B-4 스코프에서 의도적으로 보류**. PRD B-4 수락 기준 체크리스트엔 없고 OSC 처리 전반(7/133)이 B-7 소관이라 그때 함께 배선하는 편이 일관적이다(impl-log 참조)

### R4-5. 단축키 + 뷰 활성 가드

- [x] `src/renderer/src/components/Terminal/terminalShortcuts.ts` 신규 — `{ id, mac, win, action }` 테이블 상수 (D-1 이 그대로 흡수 가능한 모양). `matchShortcut(e, binding)` 순수 함수 + 테스트
- [x] `TerminalView` 의 기존 `keydown` 핸들러(:144-159)를 테이블 순회로 교체. **`active === false` 면 즉시 반환**
- [x] `src/renderer/src/App.tsx:330` → `<TerminalView active={activeView === 'terminal'} />` (**1줄**)
- [x] 바인딩: ⌘D/Ctrl+Alt+D(우분할) · ⌘⇧D/Ctrl+Shift+D(아래분할) · ⌥⌘화살표/Alt+Ctrl+화살표(포커스 이동) · ⌘W/Ctrl+W(pane→탭) · ⌘T/Ctrl+T(새 탭) · ⌘1~9(탭 전환, 테이블 밖 별도 처리)
- [x] ⌘D 는 `preventDefault` + `return false` 로 PTY 로 새지 않게. **Windows/Linux 에서 Ctrl+D 는 EOF 로 그대로 통과** (ADR-02 §8)

### R4-6. paste 타겟 4중 재검증 (이식)

- [x] `src/renderer/src/components/Terminal/pasteTargetState.ts` 신규 — **Orca `terminal-paste-target-state.ts` adapted** (고지 + 표)
  - [x] `beginPaste(): PasteToken{ tabId, leafId, sessionId, generation }` / `isPasteTargetValid(token, current): boolean`
- [x] `TerminalPane` 의 클립보드 read 경로 3곳(⌘V / Ctrl+Shift+V / document paste)에서 await 전 토큰 발급 → await 후 검증 → 불일치면 폐기 + `console.warn('[terminal-paste] 타겟 변경으로 폐기', { … })`
- [x] `pasteTargetState.test.ts` — 4필드 각각 불일치 시 false, 전부 일치 시 true

### R4-7. 저장 게이트 자리 확보

- [x] `TerminalView` 에 `restorePhase: 'idle' | 'restoring' | 'ready'` 상태 + `shouldPersistLayout = restorePhase === 'ready'` 도입. B-4 단계에서는 항상 `'ready'` 로 두고, B-5 가 `'restoring'` 을 채운다 (함정 #10). 구조 변경 지점마다 `notifyLayoutChanged()` 게이트 훅을 심어 B-5 가 debounce 저장만 채우면 되게 함

### ▣ Gate 2 — B-5 renderer 착수 조건

- [x] `npx tsc --noEmit -p tsconfig.web.json` 통과
- [x] `npx vitest run src/renderer/src/components/Terminal` 그린 (기존 TerminalView 케이스 전부 유지)
- [x] **회귀 테스트 통과**: 3분할 → 가운데 leaf 닫기 → 남은 두 pane 의 host div 가 동일 노드 참조
- [ ] 수동: 4분할 생성 / 경계 드래그(vim 열어둔 pane 에서 드래그 중 재그리기 0회, 드롭 시 1회) / ⌥⌘화살표 이동 / ⌘W 순차 닫기 / 다른 뷰에서 ⌘W·⌘T 무반응 — **미실시(헤드리스 환경) — 통합 단계 수동 QA 목록에 등재**
- [x] `THIRD-PARTY-NOTICES.md` 표 행 수 == 이식 파일 수 (3 == 3, `grep -rl "Portions adapted from Orca\|dnd-kit 의 PointerSensor" src/` 로 확인)

> 커밋: `feat(terminal/renderer): split pane — 이진 트리 + SplitLayout + divider drag (B-4)`
> 커밋: `docs: THIRD-PARTY-NOTICES.md 신설 (Orca/VSCode/dnd-kit MIT 고지)` — 이식 파일 커밋과 **같은 PR·같은 시점**

---

## M-A. 영속화 v2 — main 파트 (main-process-engineer, S-0 직후 착수 가능)

### M-A-1. 스냅샷 저장소 모듈

- [x] `src/main/terminal/snapshotStore.ts` 신규 — storage 주입(`{ get, set }`)으로 테스트 가능하게 (WikiStorageService 선례)
  - [x] `shouldPersistSnapshot(incoming, existing, source: 'renderer' | 'cache'): boolean` (ADR-03 §5) — `'cache'` + 빈 incoming + 비어있지 않은 existing → false + `console.warn`
  - [x] `migrateLegacySessions(legacy): TerminalWorkspaceSnapshotV2` (ADR-03 §10) — 세션 1개 = 탭 1개(단일 leaf, 새 UUID), `cols/rows = 0`
  - [x] `sanitizeForRestore()` 를 `TerminalManager` 에서 **이 파일로 이사**(마이그레이션 전용). 기존 테스트도 함께 이동 — **편차**: M-A-4 가 게이트로 보류돼 `exportSessions()`(레거시, 아직 생존)가 계속 이 함수를 필요로 해서, `snapshotStore.ts` 안이 아니라 별도 `src/main/terminal/sanitizeForRestore.ts` 로 이사하고 `TerminalManager.ts`/`snapshotStore.ts` 양쪽이 그 한 곳을 import 하게 했다. 기존 테스트(`TerminalManager.test.ts` 안 2건)는 유지하고 `sanitizeForRestore.test.ts` 를 신규로 추가 — impl-log 참조
  - [x] `capWorkspaceBytes(snapshot, { perLeafBytes: 512*1024, totalBytes: 8*1024*1024 })` — leaf trim → 그래도 초과면 활성 탭 제외 오래된 탭부터 드롭 + warn
  - [x] `loadSnapshot()` / `saveSnapshot(incoming, source)` — legacy 마이그레이션은 `loadSnapshot` 최초 1회
- [x] `src/shared/utils/textBytes.ts` 신규 — `utf8ByteLength(s)`, `trimSerializedToBytes(text, maxBytes)`(**secant 보간 최대 4 probe** + 개행 되감기)
- [x] `snapshotStore.test.ts` / `textBytes.test.ts` — ADR-03 §모니터링 목록대로

### M-A-2. before-quit 핸드셰이크 (index.ts 라이프사이클 블록)

- [x] 순수 로직은 `src/main/terminal/quitFlush.ts` 로 분리 — `createQuitFlushCoordinator({ requestFlush, persist, timeoutMs: 700, now })` 가 `{ onBeforeQuit(event), onSnapshotArrived(snapshot), get done() }` 을 노출. **index.ts 에는 배선만** — **편차**: `onSnapshotArrived()` 는 인자 없이 설계했다(스냅샷 자체는 `TERMINAL_SAVE_STATE` 핸들러가 이미 `snapshotStore.saveSnapshot()` 으로 저장을 끝낸 뒤 호출하는 "응답 도착" 신호일 뿐이라 값이 필요 없었음). impl-log 참조
- [x] `src/main/index.ts` `before-quit` 교체 — `exportSessions` 저장 제거, coordinator 위임. `preventDefault` 는 **정확히 1회**(coordinator 내부 `done` 플래그), 창 없으면 즉시 캐시 경로, 타임아웃 700ms, 응답 도착 시 `clearTimeout`
- [x] `src/main/index.ts` 30초 `setInterval` **삭제** (렌더러로 이관)
- [x] `src/main/index.ts` `window-all-closed` — `terminalManager.dispose()` **유지**. 주석 1줄로 "저장은 스냅샷 경로라 dispose 와 결합되지 않는다(ADR-03 §6)" 명시
- [x] `quitFlush.test.ts` — fake timer 4케이스(응답 없음/응답 도착/2회차 before-quit/창 없음) + 보강 2건(평상시 saveState 는 quit 에 영향 없음, timeoutMs 커스텀)

### M-A-3. IPC 핸들러 3종 (index.ts Terminal 블록 안)

- [x] `ipcMain.handle(TERMINAL_SAVE_STATE, (_, snap) => snapshotStore.saveSnapshot(snap, 'renderer'))` — 메모리 캐시도 갱신, `{ ok, bytes, skipped? }` 반환
- [x] `ipcMain.handle(TERMINAL_RESTORE_STATE, () => snapshotStore.loadSnapshot())`
- [x] `TERMINAL_REQUEST_STATE` 는 **`webContents.send` 전용** — `ipcMain.handle` 등록 금지 (p1 impl-log 제약 승계: `TERMINAL_EXIT` 와 동일 부류)
- [x] `snapshotStore.saveSnapshot` 이 `TERMINAL_SAVE_STATE` 로 들어온 스냅샷을 coordinator 에도 전달(`onSnapshotArrived`)하도록 배선

### M-A-4. 레거시 경로 제거 — **이번 라운드 미실행 (게이트 미통과)**

> renderer 가 아직 `TERMINAL_RESTORE`/`reorder()` 를 소비 중이다(`TerminalView.tsx` 의 `restoreSaved()`/`reorder()` 호출, B-4/B-5 renderer 파트가 아직 tabOrder/스냅샷 기반으로 이관 전). plan.md 의 "삭제 순서 게이트"에 따라 이번 라운드는 **추가만 하고 삭제는 보류**, 대신 소비처 4곳(`TerminalManager.exportSessions`/`reorder`, `src/preload/index.ts` `restoreSaved`/`reorder`, `src/main/index.ts` 의 두 핸들러, `IPC_CHANNELS.TERMINAL_RESTORE`/`TERMINAL_REORDER`)에 `@deprecated` JSDoc 을 달아 supersede 대상임을 표시했다. renderer 가 이관을 마치면 이 섹션 전체를 그대로 실행한다.

- [ ] `src/shared/types/ipc.ts` — `TERMINAL_RESTORE`, `TERMINAL_REORDER` 삭제 (`@deprecated` 주석만 추가함)
- [ ] `src/main/index.ts` — `TERMINAL_RESTORE` 핸들러, `TERMINAL_REORDER` 등록 삭제. **rename 즉시 저장 블록은 이번 라운드에 이미 제거함**(M-A-2 와 함께, `setName` 호출과 반환값은 유지)
- [ ] `src/main/terminal/TerminalManager.ts` — `exportSessions()`, `reorder()` 삭제(`@deprecated` 주석만 추가함, `sanitizeForRestore()` 는 이미 별도 모듈로 이사 완료). `listSessions()` / `getOutput()` 은 **유지**(전자는 `MentionTerminalSpawner` 소비자 있음)
- [ ] `src/main/terminal/sessionOrder.ts` + `sessionOrder.test.ts` 삭제
- [ ] `src/main/terminal/TerminalManager.test.ts` — 삭제된 API 관련 케이스 정리(exit/suppression/output listener 케이스는 **전부 유지**)
- [ ] `src/preload/index.ts` — `restoreSaved`/`reorder` 제거. **`saveState`/`restoreState`/`onRequestState`/`resolvePath` 는 이번 라운드에 이미 추가함**(`@deprecated` 주석을 `restoreSaved`/`reorder` 에 달아둠). `onRequestState` 는 `TERMINAL_OUTPUT`/`TERMINAL_EXIT` 와 동일한 **단일 리스너 공유 fan-out** 패턴으로 이미 구현
- [x] `src/main/index.test.ts` — `eventOnly` 에 `TERMINAL_REQUEST_STATE` 추가, `TERMINAL_SAVE_STATE`/`TERMINAL_RESTORE_STATE`/`TERMINAL_RESOLVE_PATH` 가 `handle` 에 있음을 단언. p1 의 `TERMINAL_REORDER` 케이스는 **아직 유효해서 유지**(삭제는 위 항목들과 같은 커밋에서)

### ▣ Gate 3a — renderer 의 B-5 착수 조건

- [x] `npx tsc --noEmit -p tsconfig.node.json` 통과
- [x] `npx vitest run src/main/terminal src/main/index.test.ts src/shared/utils` 그린
- [x] impl-log 에 "스냅샷 payload/반환 시그니처 확정 + 삭제된 API 목록" 기록 — 이번 라운드는 삭제 없이 **추가만** 이뤄졌음을 명시

> 커밋: `feat(terminal/main): 스냅샷 저장소 + before-quit 핸드셰이크, 레거시 export 경로 제거 (B-5 main)`

---

## B-5. 영속화 v2 — renderer 파트 (renderer-engineer, Gate 2 + Gate 3a 이후)

### R5-1. 의존성

- [ ] `npm i @xterm/addon-serialize` — 설치 후 `npm ls @xterm/xterm` 으로 **중복 설치 없음** 확인, peer 가 `@xterm/xterm@5.5` 를 만족하는지 확인. 불만족이면 **addon 버전을 내린다**(xterm 을 올리지 않는다). 설치된 정확한 버전을 impl-log 에 기록

### R5-2. serialize + 복원 모듈 (이식)

- [ ] `src/renderer/src/components/Terminal/serializeAbsoluteCursor.ts` 신규 — **Orca `terminal-serialize-absolute-cursor.ts` adapted** (고지 + 표). `serializeWithAbsoluteCursor(terminal, addon, opts)` (함정 #3)
- [ ] `src/renderer/src/components/Terminal/replay.ts` 신규 — **Orca `replay-guard.ts` / `terminal-snapshot-replay-paint.ts` adapted** (고지 + 표)
  - [ ] `createReplayGuard()` — `on()`/`off()`/`get active()`. 완료 판정은 **write 콜백 기준** (함정 #2)
  - [ ] `REPLAY_CLEAR = '\x1b[2J\x1b[3J\x1b[H'`, `POST_REPLAY_MODE_RESET`(커서 스타일 · kitty · 마우스 리포팅 · bracketed paste 리셋 세트)
  - [ ] **복원 순서 상수 주석 14단계**(ADR-03 §7)를 파일 상단에 그대로 기록
- [ ] `replay.test.ts` / `serializeAbsoluteCursor.test.ts` — guard 활성 구간의 `onData` 가 PTY 로 안 나감, 절대 CUP 접미가 붙음

### R5-3. TerminalPane 복원 경로

- [ ] `SerializeAddon` 로드 + `TerminalPaneHandle.serialize()` 본체 구현 — 옵션 `{ scrollback: 2000, excludeAltBuffer: true }`, `trimSerializedToBytes(…, 512*1024)` 적용, `{ cwd, cols, rows, serialized }` 반환. 실패 시 `null` + warn(throw 금지)
- [ ] `restore?: TerminalPaneSnapshot` prop 추가. mount effect 를 **ADR-03 §7 의 14단계 순서**로 재배치:
  - [ ] 5) unicode provider 활성화 자리를 마련 (B-7 에서 본체 이식 — 그 전까지는 `Unicode11Addon` 활성화가 이 위치로 이동)
  - [ ] 6) `onOutput` 구독 즉시 시작하되 replay 중 청크는 **큐에 적재**
  - [ ] 8) `terminal.resize(snap.cols, snap.rows)` — `cols === 0`(legacy 마이그레이션분)이면 스킵
  - [ ] 9~11) clear → write(snapshot, cb) → `POST_REPLAY_MODE_RESET + '\r\n'`
  - [ ] 13) `fit()` → PTY resize
  - [ ] 14) 큐 flush 후 직접 write 로 전환
- [ ] 기존 `initialOutput` prop 은 **제거**(레거시 복원 경로 소멸). 세 호스트 중 이 prop 을 쓰는 곳은 `TerminalView` 뿐임을 확인하고 함께 정리
- [ ] `TerminalPane.test.tsx` — mock terminal 호출 순서 배열이 `resize → clear → write → fit → resize(IPC)` 인지 단언

### R5-4. TerminalView 저장/복원 오케스트레이션

- [ ] 복원: `restorePhase='restoring'` → `window.api.terminal.restoreState()` → `isValidTree` 검증(실패 시 단일 leaf 폴백) → 탭 20 / leaf 40 상한 적용(초과 warn) → leaf 마다 `create()` → 트리·panes 구성 → `restorePhase='ready'`
- [ ] `slice(-5)`(현 :52) **제거**
- [ ] 저장: `collectSnapshot()` — 모든 탭 순회하며 `paneRefs.get(leafId)?.serialize()`. `null` 인 pane 은 이전 스냅샷 값을 재사용(있으면), 없으면 빈 문자열
- [ ] 트리거 4종:
  - [ ] 구조 변경 1초 debounce (탭 생성/닫기/rename/reorder, split/close pane, 활성 탭 변경)
  - [ ] 30초 autosave (`setInterval`, unmount 시 clear)
  - [ ] `beforeunload` → `window.api.terminal.saveState(snap)` fire-and-forget (await 하지 않음)
  - [ ] `window.api.terminal.onRequestState(() => saveState(collectSnapshot()))` — main 의 before-quit flush 응답
- [ ] 모든 트리거는 `shouldPersistLayout === false` 면 **즉시 반환** (함정 #10)
- [ ] `TerminalView.test.tsx` — 복원 중 저장 미발화 / `onRequestState` 수신 시 saveState 1회 / 탭 20 상한 초과 시 warn

### R5-5. 테스트 헬퍼

- [ ] `test/helpers/mockWindowApi.ts` — `restoreSaved`/`reorder` 제거, `saveState: vi.fn().mockResolvedValue({ ok: true, bytes: 0 })` / `restoreState: vi.fn().mockResolvedValue(null)` / `onRequestState: vi.fn().mockReturnValue(noopUnsub)` 추가

### ▣ Gate 4 — B-6 착수 조건

- [ ] `npx tsc --noEmit` 양쪽 통과, `npm run test:run` 전체 그린
- [ ] 수동 QA(ADR-03 §모니터링 5종): vim 복원 / 창 닫고 나중에 ⌘Q / 한글·이모지 / legacy 업그레이드 / store 파일 크기 측정 → impl-log 기록

> 커밋: `feat(terminal/renderer): serialize 스냅샷 영속화 v2 — 복원 순서·replay guard·절대 커서 (B-5)`

---

## B-6. WebGL (renderer-engineer)

- [ ] `npm i @xterm/addon-webgl` — peer 확인 절차는 R5-1 과 동일, 버전 impl-log 기록
- [ ] `src/renderer/src/components/Terminal/webglPolicy.ts` 신규 — `shouldAttachWebgl({ setting, isVisible, globalFailureLatch, paneLossCount, deferred })` + `setGlobalWebglFailure()` / `resetGlobalWebglFailure()`(테스트·설정 재토글용)
- [ ] `webglPolicy.test.ts` — 5조건 단독 위반 5케이스 + 전부 통과 + 설정 우선순위
- [ ] `TerminalPane` 에 attach/dispose 배선:
  - [ ] `attachWebglIfAllowed()` — 게이트 통과 시 attach, **미통과 시 `disposeWebgl()` 호출**(null 대입만 금지)
  - [ ] `disposeWebgl()` — `addon.dispose()` → 캔버스별 `WEBGL_lose_context.loseContext()` → `canvas.width = canvas.height = 0` (순서 고정)
  - [ ] `addon.onContextLoss` → `disposeWebgl()` + `paneLossCount++` + DOM 폴백. **자동 재시도 금지**
  - [ ] 초기화 throw → `setGlobalWebglFailure()` (앱 수명 동안 유지)
  - [ ] reveal(`visible` false→true) 과 `document.visibilitychange` visible 에서 `paneLossCount = 0`
- [ ] `reattachPaneHost`(R4-2)의 빈 훅을 채운다 — `dispose → appendChild → rAF → attach → fit → scrollState 복원`, 구간 동안 `deferred = true`
- [ ] 설정: `terminalRenderer: 'webgl' | 'dom'` (기본 `'webgl'`) — **기존 `window.api.settings.get/set` 사용, 신규 IPC 0개**
  - [ ] 탭바 우측 드롭다운(목업 `.rbtn`/`.rmenu`) — 현재 렌더러 상태 dot + 라벨, 폴백 시 `DOM (폴백)`
  - [ ] `SettingsView.tsx` 에 같은 항목 추가
- [ ] `src/renderer/src/components/Terminal/TerminalTabs.tsx` **삭제** (참조 0 확인 완료)

### ▣ Gate 5a — B-7 renderer 착수 조건

- [ ] `npx vitest run src/renderer/src/components/Terminal` 그린
- [ ] 수동: 탭 5개 × 4분할(20 pane) 순회 — 백지 pane 없음 / 설정 토글 즉시 반영 + 재시작 유지 / devtools 콘솔 WebGL 경고 확인

> 커밋: `feat(terminal/renderer): WebGL 렌더러 — visible-only lazy attach + 실패 래치 + 설정 토글 (B-6)`

---

## M-B. 링크 존재 검증 — main 파트 (main-process-engineer, S-0 직후 착수 가능)

- [x] `src/main/terminal/pathResolver.ts` 신규 — `resolveCandidates({ cwd, candidates })`
  - [x] `expandHome()`(A-0 유틸 재사용) → `resolve(cwd, candidate)` → `fs.promises.stat`
  - [x] `Promise.race` **300ms 타임아웃** → 초과 시 미존재 취급 (정지한 네트워크 마운트 방어)
  - [x] 반환 `{ candidate, resolved, kind: 'file' | 'directory' | null }` — 요청과 **같은 순서**
- [x] `src/main/terminal/ptyCwd.ts` 신규 — `probePtyCwd(pid)`
  - [x] darwin: `execFile('lsof', ['-a','-d','cwd','-p',String(pid),'-Fn'])` 파싱
  - [x] linux: `readlink('/proc/<pid>/cwd')`
  - [x] win32: `null` (미지원)
  - [x] TTL 3초 캐시 + 단일 비행(같은 pid 동시 요청 합침) + 실패 시 `null` + warn 1회 + 킬 스위치 상수
- [x] `TerminalManager` 에 `getPid(id): number | null` 추가 (**세션 조회만** — 플랫폼 분기·spawn 코드는 건드리지 않는다)
- [x] `src/main/index.ts` Terminal 블록에 `ipcMain.handle(TERMINAL_RESOLVE_PATH, …)` — `cwdHint` 없으면 `probePtyCwd(getPid(sessionId))`, 그것도 없으면 세션 spawn cwd
- [x] `pathResolver.test.ts` — 존재/미존재/디렉터리/`~` 확장/상대 경로/타임아웃
- [x] `ptyCwd.test.ts` — `Object.defineProperty(process, 'platform', …)` 로 **darwin / linux / win32 3케이스 명시** + TTL 캐시 히트 + 단일 비행
- [x] `src/preload/index.ts` — `terminal.resolvePath(req)` 노출
- [x] `src/main/index.test.ts` — `TERMINAL_RESOLVE_PATH` 가 `handle` 에 등록됨을 단언

> 커밋: `feat(terminal/main): terminal:resolve-path 존재 검증 + pid cwd probe (B-7 main)`

---

## B-7. 링크 프로바이더 재작성 (renderer-engineer, Gate 5a + M-B 이후)

> 신규 모듈은 `src/renderer/src/components/Terminal/links/` 서브폴더에 모은다. **각 이식 파일은 고지 블록 + 표 행과 같은 커밋.**

### R7-1. 가드 + addon

- [ ] `links/terminalLinkProviderGuard.ts` — **Orca verbatim** (고지). `installLinkProviderGuard(terminal)` 를 `new Terminal()` **직후, `loadAddon` 전**에 호출
- [ ] `npm i @xterm/addon-web-links` — peer 확인, URL 전용으로만 로드. 기존 `URL_RE` 자체 provider 제거
- [ ] `terminalLinkProviderGuard.test.ts` — throw 하는 provider 등록 후 `provideLinks` 호출이 예외를 전파하지 않고 warn 1회

### R7-2. 경로 인식

- [ ] `links/terminalPathRegex.ts` — **Orca ← VSCode adapted, 이중 고지**. 구분자 필수 패턴 + 상대 경로 + 공백 3-pass(정규식 아닌 코드로 후보 축소, ReDoS 회피) + 무확장자 화이트리스트
- [ ] `links/bareFileLink.ts` — **Orca ← VSCode adapted, 이중 고지**. bare filename 후보(존재 검증 필수 통과)
- [ ] `links/lineColumn.ts` — `/^(.*?)(?::(\d+))?(?::(\d+))?$/`, `line<1`/`col<1` 거부, bare root(`/`, `C:/`) 거부
- [ ] `links/wrappedLinkRanges.ts` — **Orca adapted**. soft wrap(`isWrapped`, 상한 200행/20k자) + **hard wrap**(역스캔 20행 + 조각 판정 술어). 문자열↔셀 매핑은 `line.getCell(x)` **셀 단위 폴백**(`outColumns` 미사용, Orca 노트 §0)
- [ ] 기존 `TerminalPane.tsx:120-197` 의 `FILE_PATH_RE` / `isWideCodePoint` / `stringIndexToCell` / `provideLinksByRe` **삭제** — 셀 매핑이 대체한다
- [ ] 각 모듈 테스트 + `src/renderer/src/components/Terminal/__fixtures__/terminal-links/` 에 **사용자 실패 사례 픽스처** 수집(claude TUI hard wrap 출력, 공백 경로, 한글 폴더, 상대 경로)

### R7-3. 존재 검증 + 캐시

- [ ] `links/pathExistsCache.ts` — **Orca verbatim**. LRU 1024, 키 `cwd + '\0' + candidate`, 음수 캐시 포함
- [ ] `links/resolveLinks.ts` — 후보 배치 → `window.api.terminal.resolvePath(...)` 1회 → 결과를 캐시에 적재 → **fingerprint 재검증**(행 번호 + 텍스트 해시가 그대로일 때만 채택) → `preferLongestNonOverlappingLinks`(길이 내림차순 비중첩)
- [ ] `pathExistsCache.test.ts`(LRU 축출·음수 캐시·키 충돌) / `resolveLinks.test.ts`(fingerprint 불일치 시 폐기, 중첩 후보 정리)

### R7-4. cwd 소스

- [ ] `links/parseOsc7.ts` — **Orca verbatim**(Windows 드라이브/UNC 포함)
- [ ] `TerminalPane` 에서 `parser.registerOscHandler(7, …)` 를 **PTY 연결 전**에 등록 → pane cwd 상태 갱신. `registerOscHandler(133, () => true)`(화면 오염 방지만)
- [ ] cwd 우선순위 구현: OSC 7 → 세션 spawn cwd → main probe(요청 시 `sessionId` 만 넘기고 main 이 판단)
- [ ] **rc 주입은 하지 않는다** (Orca 노트 §2)

### R7-5. Cmd+클릭 3버그 + unicode

- [ ] `links/linkClickPriming.ts` — **Orca adapted**. 정지 커서 밑 새 링크 첫 클릭 씹힘
- [ ] `links/ptyMouseSuppression.ts` — **Orca adapted**. 마우스 aware TUI 이중 열림
- [ ] link `activate` 진입 시 `terminal.clearSelection()` (드래그 폭주)
- [ ] `activate` 는 `expandHome` 이 끝난 **resolved 절대 경로**로 `window.api.shell.openPath` 호출. line:col 은 현재 openPath 로 전달 불가하므로 **경로만** 열고, 줄 번호는 링크 툴팁에만 표기(후속 트랙에서 에디터 연동)
- [ ] `terminalUnicodeProvider.ts` — **Orca verbatim**. `terminal.open()` **직후, 모든 write 전** 활성화(ADR-03 §7 의 5번 자리에 삽입, 함정 #7). 기존 `Unicode11Addon` 위에 얹는다
- [ ] 테스트: ZWJ 이모지 폭 케이스 + "복원 write 전에 활성화되었는가" 를 호출 순서로 단언

### ▣ Gate 5 — 마감 착수 조건

- [ ] `npx tsc --noEmit` 양쪽 통과, `npm run test:run` 전체 그린
- [ ] 수동 QA(ADR-05 §모니터링 8종) 전부 통과
- [ ] `THIRD-PARTY-NOTICES.md` 표 행 수 == `grep -rl "Portions adapted from" src/` 개수

> 커밋: `feat(terminal/renderer): 링크 프로바이더 재작성 — wrap 재구성·존재 검증·Cmd+클릭 3버그 (B-7)`

---

## V. 검증 · 마감 (integrator)

- [ ] `npx tsc --noEmit -p tsconfig.web.json` / `-p tsconfig.node.json` 통과
- [ ] `npm run test:run` 전체 그린 + `npm run test:coverage` 라인 70% 유지 (신규 main/shared 모듈이 게이트를 떨어뜨리지 않는지 확인)
- [ ] `npm run build` (electron-vite) 통과
- [ ] 수동 QA 매트릭스 — 각 ADR 의 §모니터링 "수동" 항목 전부 + 아래 통합 시나리오:
  - [ ] 탭 3개 · 그중 하나는 4분할 · vim 과 claude 실행 → 창 닫기 → 잠시 후 ⌘Q → 재시작 → 트리·스크롤백·활성 탭 복원
  - [ ] 복원 직후 각 pane 에서 Cmd+클릭 경로 열기
  - [ ] 분할 상태에서 이미지 붙여넣기 1회 → 포커스 pane 에만 경로 입력
  - [ ] Windows VM: split · 복원 · 링크(상대 경로) · 한글 출력 (pid cwd probe 는 미지원 경로임을 확인)
- [ ] `ClaudeManual.tsx` `SECTIONS` 갱신 (한국어, 각 1~2줄):
  - [ ] split — "⌘D 오른쪽 / ⌘⇧D 아래로 나눕니다. ⌥⌘화살표로 pane 이동, ⌘W 는 pane→탭 순으로 닫습니다. (터미널에 EOF 를 보내려면 Ctrl+D)"
  - [ ] 영속화 — "탭 구성과 화면이 저장되어 재시작 후 복원됩니다(탭 20개까지)"
  - [ ] 렌더러 토글 — "느리면 탭바 우측에서 DOM 렌더러로 전환할 수 있습니다"
  - [ ] 경로 열기 — "Cmd+클릭으로 파일·폴더를 엽니다. 상대 경로·공백 경로·줄바꿈된 경로도 인식합니다"
  - [ ] 단축키 표에 ⌘D / ⌘⇧D / ⌥⌘화살표 행 추가
- [ ] `CHANGELOG.md` `[Unreleased]` 에 사용자 언어로 5건 추가. **내부 채널 삭제·리팩터는 쓰지 않는다**
- [ ] `README.md` — split 스크린샷 갱신 + `THIRD-PARTY-NOTICES.md` 링크 확인
- [ ] `qa-report.md` 작성 (수락 기준 × 검증 매트릭스, verdict)
- [ ] `.agent/wiki/domain-terminal.md` 갱신 — "세션 라이프사이클" 에 스냅샷 저장/복원 흐름 추가, "출력 버퍼 + 알트스크린 sanitize" 섹션을 **스냅샷 방식으로 정정**(`exportSessions`/`sanitizeForRestore` 이사 사실 포함), split/WebGL/링크 섹션 신설
- [ ] `.agent/wiki/domain-electron-ipc.md` 갱신 — push 목록에 `TERMINAL_REQUEST_STATE` 추가, 삭제된 2채널 반영
- [ ] `.agent/wiki/decisions-log.md` — ADR 6건 한 줄씩(최신이 위), ADR-v2-terminal-p1-05 항목에 supersede 표기
- [ ] PR — title 예: `feat(terminal): split pane · 스크롤백 영속화 v2 · WebGL · 링크 재작성 (v2.0 B-3~B-7)`

---

## 제약 (하지 말 것)

- **`TERMINAL_EXIT` / `TERMINAL_REQUEST_STATE` 에 `ipcMain.handle` 을 등록하지 말 것.** push 전용이며 `src/main/index.test.ts` 의 event-only 게이트가 즉시 실패한다 (p1 impl-log 승계).
- **`TerminalManager` 의 spawn·플랫폼 분기를 건드리지 말 것** — `enrichedTerminalPath`, 셸 선택, `LANG`/`LC_ALL`/`LC_CTYPE`, `pty.spawn` 옵션은 A-2 소관. 이번에 추가하는 것은 `getPid()` 조회 하나뿐이다. **단, 이 라운드는 오케스트레이터 브리핑이 M-B 와 windows-fix A-2(§3/§4)를 같은 담당에게 같은 라운드로 명시 병합해서, `enrichedTerminalPath`/셸 선택/`pty.spawn` 옵션도 함께 바뀌었다(`detectWindowsShell`/`buildPtyEnv`/win32 spawn 폴백) — impl-log 참조. 순수 M-B 단독 라운드였다면 이 제약이 그대로 유효했을 것.**
- **`AIService` / `ClaudeChatService` / 멘션 파이프라인 파일 수정 금지.** `MentionTerminalSpawner` 가 쓰는 `listSessions()` 는 반드시 남긴다. **단, 이 라운드는 오케스트레이터 브리핑이 "env 병합 4곳" 통일(mergePathIntoEnv/claudeExtraPaths 교체)을 명시해서 `AIService.ts`/`ClaudeChatService.ts` 의 PATH 병합 라인만 교체했다 — argv 조립·spawn 옵션·멘션 파이프라인 로직은 1바이트도 안 건드림(impl-log 참조).**
- **`BranchWorkspace.tsx` / `MentionAgentView.tsx` 와 그 테스트를 수정하지 말 것** (B-3 무회귀의 증거). `initialOutput` 정리는 `TerminalView` 한 곳만 해당됨을 먼저 확인할 것.
- **`src/main/index.ts` 변경은 2블록으로 국소화** — ①Terminal 핸들러 블록 ②라이프사이클 블록. 다른 위치를 만지지 말 것(A·C 트랙 충돌). **이 라운드는 오케스트레이터 브리핑이 windows-fix A-2(§4 CLAUDE_START_TASK)·CLI-info env 블록도 같이 명시해서 총 4블록(Terminal 핸들러/라이프사이클/CLAUDE_START_TASK/CLI-info env)을 만졌다 — 그 외 위치는 무수정.**
- **트리를 main 으로 올리지 말 것.** 목업 노트 1) 의 `src/main/terminal/splitTree.ts` 경로는 채택하지 않는다(ADR-02 §대안 2).
- **재귀 JSX 안에서 `<TerminalPane>` 을 직접 렌더하지 말 것** (함정 #8). leaf 는 빈 div + portal attach.
- **드래그 중 PTY resize 를 보내지 말 것** (함정 #9). 드롭 시 1회.
- **fit 을 복원 write 보다 먼저 하지 말 것** (함정 #1). unicode provider 를 write 뒤에 활성화하지 말 것 (함정 #7).
- **WebGL 을 hidden pane 에 붙여두지 말 것** (함정 #4). 게이트 미통과 시 반드시 `dispose()` 호출, `null` 대입만 금지.
- **context loss 후 자동 재생성 금지** (루프). reveal/wake 경계에서만.
- **xterm 6.x 베타 전용 API(`outColumns`, `vtExtensions.kittyKeyboard`) 사용 금지.** 폴백 경로만 (Orca 노트 §0).
- **`@xterm/xterm` 버전을 올리지 말 것.** addon peer 가 안 맞으면 addon 버전을 내린다.
- **셸 rc 주입 금지** (OSC 7 은 수신만). zsh `ZDOTDIR` 하이재킹은 한글 사용자명 환경 오염 버그를 밟는다.
- **이식 파일을 고지 없이 커밋하지 말 것** (ADR-06). `THIRD-PARTY-NOTICES.md` 신설이 첫 이식 커밋보다 앞서거나 같아야 한다.
- **단축키 레지스트리(Workstream D)를 선취하지 말 것.** 테이블 상수까지만.
- **작업과 무관한 리팩터·포맷팅 금지** (전역 CLAUDE.md §9). `TerminalPane` 의 이미지 사이드바·키 핸들러 테이블·검색 배선은 그대로 둔다.
- **단계 게이트를 건너뛰지 말 것.** 각 단계 커밋을 분리해 되돌리기 단위를 지킨다.

## 참조

- `feature/terminal/v2-terminal-p2/{prd,adr,adr-02-split-tree,adr-03-persistence-v2,adr-04-webgl,adr-05-link-provider,adr-06-third-party-notices}.md`
- `feature/terminal/v2-terminal-p1/impl-log.md` — 선행 제약(`TERMINAL_EXIT` handle 금지, 3호스트 구독 중복 허용 사유, dnd-kit 센서 실제 게이팅 위치)
- `~/.claude/plans/toasty-sleeping-simon.md` — Workstream B (B-3~B-7), Phase 2
- `docs/dev/orca-absorption-notes.md` — §0 §1 §3 §4 §5 §7 §9
- `docs/mockups/v2/terminal-split.html` — `.pane`/`.handle`/`.panecnt`/렌더러 드롭다운 + 구현 매핑 노트 1)~6)
- `.claude/skills/electron-ipc-patterns/SKILL.md`(3+1), `.claude/skills/vitest-patterns/SKILL.md`, `.claude/skills/artifact-validation/SKILL.md`
- `.agent/wiki/domain-terminal.md`, `.agent/wiki/domain-electron-ipc.md`, `.agent/wiki/decisions-log.md`
</content>
