---
task: v2-terminal-p1
date: 2026-07-30
---

# Impl Log — v2.0 Phase 1 · B-1 exit 통지 / B-2 검색 고도화 / B-8 탭 reorder

> 규약: 각 에이전트는 자기 섹션만 append. 상대 섹션은 수정·삭제하지 않는다.

## [main-process-engineer] terminal-main

### 변경한 파일

- `src/shared/types/ipc.ts` — `TERMINAL_EXIT`('terminal:exit', push 전용) / `TERMINAL_REORDER`('terminal:reorder', fire-and-forget) 채널 2개 추가
- `src/shared/types/terminal.ts` — `TerminalExitPayload { id, exitCode, signal: number | null }` 추가 (신규)
- `src/main/terminal/sessionOrder.ts` (신규) — 순수 함수 `applySessionOrder(currentIds, desiredIds)`
- `src/main/terminal/sessionOrder.test.ts` (신규) — 5케이스
- `src/main/terminal/TerminalManager.ts` — `exitListeners`/`suppressedExitIds` 필드, `addExitListener`, `onData` 의 `outputListeners` 실제 fan-out(try/catch 격리), `onExit` 의 at-most-once + suppression 판정 + `TERMINAL_EXIT` 방송, `kill()` 의 존재 검사 후 suppression 예약, `reorder()` 신규
- `src/main/terminal/TerminalManager.test.ts` — `emitExit` mock 시그니처를 `(info = { exitCode: 0, signal: undefined }) => onExitCb?.(info)` 로 갱신, `addOutputListener` 테스트를 실제 호출 검증으로 교체, exit 통지/suppression/at-most-once/reorder 신규 케이스 다수 추가 (총 32 테스트)
- `src/preload/index.ts` — `subscribeTerminalExit` (TERMINAL_OUTPUT 과 동일한 단일 리스너 공유 패턴) 추가, `api.terminal.onExit` / `api.terminal.reorder` 노출
- `src/main/index.ts` — `ipcMain.on(IPC_CHANNELS.TERMINAL_REORDER, ...)` **3줄**만 `TERMINAL_RESIZE` 등록 직후에 삽입 (`git diff --stat` 확인: `+3`)
- `src/main/index.test.ts` — `eventOnly` 배열에 `TERMINAL_EXIT` 추가, `TERMINAL_REORDER` 가 `ipcMain.on` 으로만 등록되고 `ipcMain.handle` 에는 없음을 명시적으로 단언하는 케이스 추가
- `test/helpers/mockWindowApi.ts` — `terminal.onExit`(`vi.fn().mockReturnValue(noopUnsub)`), `terminal.reorder`(`vi.fn()`) 추가

### 결정 사항 (해야 할 것)

- **payload 필드 확정** (renderer 착수 신호): `TerminalExitPayload = { id: string; exitCode: number; signal: number | null }`. `signal` 은 `undefined` 대신 `null` 로 정규화 — 렌더러도 `undefined` 를 기대하지 말 것.
- `TerminalManager.reorder(ids)` 는 요청 id 중 유효한 게 **1개라도 있으면** 진행하고, 유효한 게 **0개면** no-op + `console.warn('[TerminalManager] reorder — 요청에 유효한 세션 id 가 없음', { ids })`.
- `kill(id)` 는 세션이 `this.sessions` 에 존재할 때만 `suppressedExitIds.add(id)` 후 `pty.kill()` + 즉시 `sessions.delete(id)` (기존 동작 유지). 이미 없는 id 재호출은 완전 no-op — `pty.kill()` 재호출도, suppression 재예약도 없음. 테스트에서 `firstPty.kill` 호출 횟수로 고정.
- `onData` 리스너 fan-out 순서는 ADR-01 대로 `outputBuffer 적재 → webContents.send(TERMINAL_OUTPUT) → outputListeners fan-out`. `onExit` 도 동일하게 `sessions.delete → suppression 판정 → webContents.send(TERMINAL_EXIT) → exitListeners fan-out`. 리스너 예외는 각각 개별 try/catch + `sessionId` 포함 `console.warn` (전역 CLAUDE.md §4·§5).
- `test/helpers/mockWindowApi.ts` 의 `terminal.onExit` mock 은 별도 캡처 헬퍼 없이 `vi.fn().mockReturnValue(noopUnsub)` 로 두었다 — vitest 의 `vi.mocked(window.api.terminal.onExit).mock.calls.at(-1)?.[0]` 로 마지막 등록 콜백을 꺼내 직접 발화 가능(다른 `onX` mock 들과 동일 패턴, 이미 "콜백을 저장해 발화" 요건 충족). renderer 테스트에서 이 방식으로 exit 이벤트를 주입할 것.
- `TerminalPaneProps`/`TerminalView` 등 renderer 쪽 `exitInfo` prop 타입은 `{ exitCode: number; signal: number | null } | null` (ADR-02) — `TerminalExitPayload` 와 `id` 필드만 다르므로 renderer 에서 그대로 재사용하거나 destructure 해서 넘기면 됨.

### 제약 (하지 말 것)

- `src/main/index.ts` 는 이번 라운드에 **3줄만** 변경했다(`ipcMain.on(TERMINAL_REORDER, ...)`, `TERMINAL_RESIZE` 등록 직후). `TERMINAL_EXIT` 는 push 전용이라 `index.ts` 에 핸들러 등록이 **없다** — 후속 라운드에서 실수로 `ipcMain.handle(TERMINAL_EXIT, ...)` 를 추가하지 말 것. 이유: `src/main/index.test.ts` 의 `event-only channels` 테스트가 등록 시 즉시 실패하게 게이트를 걸어뒀다.
- 30초 autosave / before-quit / window-all-closed 블록(`src/main/index.ts`)은 손대지 않았다 — B-5 소관, 이번 사이클 스코프 아님.
- `TerminalManager` 는 플랫폼 분기(`enrichedTerminalPath`, 셸 선택, `LANG`/`LC_ALL`/`LC_CTYPE` 강제)를 **전혀 건드리지 않았다**. exit/reorder 로직은 모두 플랫폼 무관 코드 경로에 추가됨 — Windows/Mac 영향 없음.
- `dispose()` 는 기존 `for (const [id] of this.sessions) this.kill(id)` 루프를 그대로 유지했다. `kill()` 이 이미 suppression 을 예약하므로 `dispose()` 에 별도 억제 분기를 추가하지 않았다(ADR-01 §결정 3) — 다음 작업자도 여기 분기 추가하지 말 것.
- `sessions` Map 재구성(`reorder`)은 동기 완료다. `reorder()` 본문 안에서 다른 세션 API(`kill`/`input` 등)를 호출하지 않는다(ADR-05 §결과 — 순회 중 다른 mutating 호출 금지).
- `addOutputListener`/`addExitListener` 의 현재 소비자는 0(테스트 제외) — 죽은 훅을 "수리"만 했고 새 소비자(C-2 AgentRunSpawner 등)는 이번 스코프에 추가하지 않았다.

### 참조

- ADR-v2-terminal-p1-01 (exit push + suppression), ADR-v2-terminal-p1-02 (exit UI 소유권 — renderer 참고용), ADR-v2-terminal-p1-05 (reorder 영속화, B-5 가 supersede 예정)
- `feature/terminal/v2-terminal-p1/plan.md` M-1~M-5

## [renderer-engineer] terminal-renderer

### 변경한 파일

- `package.json`, `package-lock.json` — `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0` 추가
- `src/renderer/src/components/Terminal/terminalSearch.ts` (신규) — 순수 함수 `clampSearchQuery`/`buildSearchOptions`/`formatMatchCount`/`isValidRegexQuery`/`safeFind` + `MAX_SEARCH_QUERY_LENGTH=2048`. decoration 색은 xterm 이 CSS 변수를 해석 못해 리터럴 hex(clauday-orange 계열)로 고정.
- `src/renderer/src/components/Terminal/terminalSearch.test.ts` (신규) — 21케이스 (경계값 · 옵션 불변성 · safeFind 예외 격리 · warn 1회 제한)
- `src/renderer/src/components/Terminal/useTerminalSearch.ts` (신규) — open/query/toggles/countLabel/hasError 상태 + 120ms 디바운스(`setQuery`/`toggleOption` 호출 시 예약) + IME 조합 억제 + `handleResultsChanged`(addon `onDidChangeResults` 연결용, TerminalPane mount effect 에서 배선)
- `src/renderer/src/components/Terminal/useTerminalSearch.test.ts` (신규) — 6케이스 (`renderHook`, fake timer)
- `src/renderer/src/components/Terminal/TerminalSearchBar.tsx` (신규) — 검색바 뷰. 상태 없음, 마운트 시 자동 focus, 모든 버튼 한국어 `title`, 카운트 `aria-live="polite"`
- `src/renderer/src/components/Terminal/tabOrder.ts` (신규) — 순수 함수 `moveTab`/`pushMru`/`pickNextActiveTab`
- `src/renderer/src/components/Terminal/tabOrder.test.ts` (신규) — 13케이스
- `src/renderer/src/components/Terminal/tabDragSensor.ts` (신규) — `shouldActivateDrag`(12px+2샘플 순수 함수) + `TabPointerSensor`(`PointerSensor` 상속) + `TAB_DRAG_ACTIVATION_DISTANCE_PX=12`
- `src/renderer/src/components/Terminal/tabDragSensor.test.ts` (신규) — 6케이스
- `src/renderer/src/components/Terminal/TerminalPane.tsx` — `exitInfo?`/`onRequestClose?` optional prop 추가(기존 시그니처 불변), `exitInfoRef` 동기화 effect, 입력 차단 3경로(`onData`/`send()`/`sendFileAsPath` + 드래그드롭 핸들러), 종료 오버레이 JSX(pointer-events-none 래퍼 + 배지/버튼만 auto), 검색 인라인 코드 전부 제거 후 `useTerminalSearch`+`TerminalSearchBar` 로 교체, `overviewRulerWidth: 14` 추가
- `src/renderer/src/components/Terminal/TerminalView.tsx` — `SessionWithOutput.exitInfo` 필드, `onExit` 구독(자기 entries + at-most-once), `DndContext`+`SortableContext`로 탭바 래핑, `SortableTabLabel`/`TabLabel`(드래그 배선 + 종료 배지 + pointerdown stopPropagation), `mruRef`+`activateTab`, `closeSession` 을 `pickNextActiveTab` 기반으로 교체, 삽입 인디케이터(`computeInsertionIndex`+`TabDropIndicator`), missed-end fallback(window pointerup/blur, document visibilitychange), 한국어 `accessibility.announcements`
- `src/renderer/src/components/Terminal/TerminalView.test.tsx` — 기존 5케이스 유지 + `onExit` 주입/무시 케이스, MRU 기준 탭 닫기 케이스 2건 추가(총 7케이스). `TerminalPane` stub 에 `exitInfo` 반영
- `src/renderer/src/components/MentionAgent/MentionAgentView.tsx` — `Entry.exitInfo` 필드, `onExit` 구독(자기 entries만, at-most-once), 탭 버튼 디밍+`종료됨` 배지, `TerminalPane` 에 `exitInfo`/`onRequestClose` 전달
- `src/renderer/src/components/Git/BranchWorkspace.tsx` — `termExitInfo`(세션id→payload) state + `termSessionsRef`(stale 방지) 추가, `onExit` 구독(termSessions 역매핑으로 자기 세션만), `closeTerminalTab` 에서 종료 정보 정리, 탭바 디밍+`종료됨` 배지, `TerminalPane` 에 `exitInfo`/`onRequestClose` 전달
- `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx` — `id: 'clauday'` 섹션에 `## 🖥 터미널 (v2.0)` 서브섹션 신규(종료 오버레이/검색 고도화/탭 드래그 3건), 단축키 표에 `⌘F` 행 추가
- `CHANGELOG.md` — `[Unreleased]` 블록의 `### 개선` 에 3건 추가(종료 통지·검색 고도화·탭 드래그). 순서 영속화는 "대체로 유지"로만 서술(ADR-05, 과장 금지)
- `feature/terminal/v2-terminal-p1/plan.md` — R-0~R-6 체크박스 전부 `[x]`, V. 검증 섹션 중 tsc/test/build 3건 `[x]`(수동 QA·wiki 갱신·PR 은 담당 외라 미체크)

### 결정 사항 (해야 할 것)

- `useTerminalSearch` 는 `useEffect` 기반 디바운스 대신 `setQuery`/`toggleOption` 호출 시점에 직접 `scheduleFind` 를 예약하는 방식을 택했다 — `open` 게이트를 위한 effect 의존성 배열이 필요 없어지고, 훅이 컴포넌트 렌더 순서와 무관하게 항상 최신 `searchAddonRef.current` 를 읽는다. `handleResultsChanged` 는 `searchAddon.onDidChangeResults` 에 **TerminalPane 의 mount effect 안에서 직접** 연결한다(훅 내부 effect 로 구독하면 effect 실행 순서상 addon 생성 전에 구독을 시도하는 레이스가 생길 수 있어 배선을 명시적으로 호출부에 맡김).
- `tabDragSensor.ts` 의 `shouldActivateDrag` 는 ADR-04 가 요구한 "12px+2샘플" 정책을 순수 함수로 문서화·테스트하지만, **실제 런타임 게이팅은 dnd-kit `PointerSensor` 의 `activationConstraint: { distance: 12 } }` 가 수행한다.** `AbstractPointerSensor` 의 이동 샘플링 로직(`handleMove`)은 private 이라 서브클래싱으로 가로챌 수 없어(타입 선언상 접근 불가 + 버전 변경 시 깨지기 쉬움), `TabPointerSensor extends PointerSensor` 는 activator 만 그대로 상속하고 임계값은 `useSensor(TabPointerSensor, { activationConstraint: { distance: TAB_DRAG_ACTIVATION_DISTANCE_PX } })` 호출부에서 설정한다. dnd-kit 의 distance 제약은 pointerdown 이후 누적 이동량을 매 pointermove 마다 검사하므로 실사용상 더블클릭 rename 과 드래그가 정상적으로 분리된다(로컬 vitest + 기존 rename 회귀 테스트로 확인).
- exit 오버레이는 `pointer-events-none` 래퍼 + 배지/버튼만 `pointer-events-auto` 로 감쌌다 — ADR-02 가 "스크롤백 스크롤·선택·복사는 계속 가능해야 한다" 를 요구하는데, 오버레이 전체에 기본 pointer-events 를 두면 마우스 휠/드래그 선택이 xterm 에 도달하지 못해 요구사항을 위반한다.
- 세 호스트(TerminalView/MentionAgentView/BranchWorkspace)의 `onExit` 구독 코드는 의도적으로 중복 허용했다(ADR-02 §결과와 동일 결론) — 세 호스트의 세션 컨테이너 모양이 배열(TerminalView)/배열(MentionAgentView)/경로→id 레코드(BranchWorkspace)로 서로 달라 지금 공통 훅으로 뽑으면 B-3/B-4 에서 다시 깨질 인터페이스가 된다.
- `TerminalSearchBar`/exit 오버레이의 배경·보더 색은 Tailwind arbitrary value(`bg-[var(--bg-surface-raised)]`, `border-[var(--bg-border)]`)로 작성했다 — `tailwind.config.js` 의 `bg.*` 팔레트에 `surface-raised` 가 없어(기존 `.ds-card.raised` CSS class 만 존재) 인라인 `style` 대신 이 방식을 택함(전역 CLAUDE.md "인라인 style 금지" 준수, 동시에 디자인 토큰 그대로 참조).
- exit dot 색상(`--c-emerald-solid`/`--c-red-solid`)과 검색 decoration 색은 실제 hex 값이다: 전자는 Tailwind arbitrary value 로 var() 참조라 토큰 우회가 아니지만, 후자(`terminalSearch.ts` 의 `MATCH_BACKGROUND` 등)는 xterm `SearchAddon` 이 canvas 에 직접 칠하는 색이라 CSS 커스텀 프로퍼티를 해석하지 못해 **리터럴 hex 가 불가피**하다(`TerminalPane` 의 xterm 테마 블록과 동일한 기존 예외 패턴).

### 제약 (하지 말 것)

- `TerminalPane` 의 기존 prop(`sessionId`/`isActive`/`initialOutput`) 시그니처를 바꾸지 않았다 — 신규 prop 은 전부 optional.
- 링크 프로바이더(`TerminalPane.tsx` URL/FILE_PATH 정규식·`registerLinkProvider` 블록)는 전혀 건드리지 않았다(B-7 소관).
- `@xterm/addon-serialize`, `@xterm/addon-webgl` 은 도입하지 않았다.
- split pane 관련 구조(`splitTree`/`SplitLayout`/`paneId`)는 만들지 않았다 — 오버레이는 "pane 1개 = 탭 1개" 전제로만 구현.
- `BranchWorkspace`/`MentionAgentView` 의 탭에는 드래그 reorder 를 적용하지 않았다(터미널 탭 한 곳만, ADR-04 §결정 6).
- 새 단축키 레지스트리를 만들지 않았다 — `⌘F` 는 기존 `attachCustomKeyEventHandler` 위치를 그대로 사용(`search.openSearch()` 호출로만 교체).
- `exportSessions`/`sanitizeForRestore`/`slice(-5)` 복원 상한은 손대지 않았다(B-5 소관).
- 오버레이 자동 제거 타이머를 추가하지 않았다.
- `src/main/**`, `src/preload/**` 는 전혀 수정하지 않았다(main-process-engineer 가 이미 확정한 계약을 그대로 소비만 함).
- 검색 추출 과정에서 `TerminalPane` 의 검색 외 코드(링크 프로바이더·나머지 키 핸들러·이미지 사이드바)는 건드리지 않았다(전역 CLAUDE.md §9, 무관한 리팩터 금지).
- 수동 QA(`exit`/`sleep 1; exit 3`/탭 5개 드래그 등)와 `.agent/wiki/*` 갱신, `qa-report.md`, PR 생성은 이번 라운드에서 수행하지 않았다 — plan.md 상 "공통 마감"(integrator) 소관이며, 실제 PTY·마우스 드래그가 필요해 vitest 로는 커버되지 않는다.

### 참조

- ADR-v2-terminal-p1-02 (exit UI 소유권), ADR-v2-terminal-p1-03 (검색 3분할 + safeFind), ADR-v2-terminal-p1-04 (탭 reorder — dnd-kit)
- `feature/terminal/v2-terminal-p1/plan.md` R-0~R-6
- 검증: `npx tsc --noEmit -p tsconfig.web.json` / `-p tsconfig.node.json` 통과, `npx vitest run`(전체 131 파일·1926 테스트 green), `npx vitest run --coverage`(전체 라인 79.81%, 게이트 70% 유지), `npm run build`(electron-vite) 통과
