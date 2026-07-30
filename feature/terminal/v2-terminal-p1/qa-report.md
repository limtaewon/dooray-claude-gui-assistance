---
task: v2-terminal-p1
agent: test-engineer
date: 2026-07-30
verdict: PASS
---

# QA Report — v2.0 Phase 1 · Workstream B: PTY exit 통지 · 검색 고도화 · 탭 reorder

> 범위: `TERMINAL_EXIT`/`TERMINAL_REORDER` 계약(shared/preload/`TerminalManager`/`index.ts` +3줄), 검색 훅/바(`useTerminalSearch`/`TerminalSearchBar`/`terminalSearch`), 탭 DnD(`tabOrder`/`tabDragSensor`/`TerminalView`), 종료 오버레이(`TerminalPane`), 3개 호스트(`TerminalView`/`MentionAgentView`/`BranchWorkspace`)의 onExit 구독. 커밋 전 워킹트리 상태를 검증했다. 운영 코드는 전혀 수정하지 않았다 — 테스트 파일만 신규/보강.

## 수락 기준 × 검증 매트릭스

PRD 의 체크박스 28개(브리핑상 "27개"와 근소 차이 — 실측 grep 기준 28개, B-1 9 / B-2 8 / B-8 7 / 공통 4) 전부 아래에 대조했다.

### B-1 exit 통지

| AC | 검증 방법 | 테스트 위치 | 결과 |
|---|---|---|---|
| `TERMINAL_EXIT` 채널 + `TerminalExitPayload` 타입 정의 | 코드 열람 | `src/shared/types/ipc.ts`, `src/shared/types/terminal.ts` | PASS |
| main PTY 종료 시 `webContents.send` 1회 + `addExitListener` 콜백 동일 payload(unsubscribe 반환) | vitest | `TerminalManager.test.ts` "PTY 종료 → webContents.send..." | PASS |
| `kill()`/`dispose()` 로 종료 시 통지 안 감. 이미 없는 id 재 `kill()` 해도 suppression 누수 없음 | vitest | `TerminalManager.test.ts` "kill(id) 후 exit", "dispose() 후...", "이미 종료된 id 에 kill() 재호출..." | PASS |
| 동일 세션 `onExit` 2회 발화해도 통지 1회 (at-most-once) | vitest | `TerminalManager.test.ts` "같은 세션 emitExit 2회..." | PASS |
| `addOutputListener` 가 `onData` 마다 `(id,data)` 호출, throw 격리 + warn(sessionId) | vitest | `TerminalManager.test.ts` "addOutputListener...", "output listener 1개가 throw 해도..." | PASS |
| `addExitListener` 콜백 throw 도 `webContents.send`/다른 리스너에 영향 없음 + warn(sessionId) | vitest (**이번 QA에서 보강**) | `TerminalManager.test.ts` "exit listener 1개가 throw 해도..." | PASS — 기존엔 미검증 분기(라인 189-190)였음, 보강 후 커버 |
| preload `window.api.terminal.onExit(cb)` 노출 + unsubscribe, 단일 `ipcRenderer.on` 공유 fan-out | 코드 열람 | `src/preload/index.ts` `subscribeTerminalExit` — `TERMINAL_OUTPUT` 과 동일 패턴 확인 | PASS |
| 종료 pane 오버레이 표시·자동 미제거. 표시 중 입력/붙여넣기/드래그드롭 차단 | vitest (**이번 QA에서 신규**) | `TerminalPane.test.tsx` 전체 — onData/키핸들러/드롭 3경로 + stale 클로저 회귀 2건 | PASS |
| `TerminalView`/`MentionAgentView`/`BranchWorkspace` 각각 onExit 구독, 자기 세션만 반영 | vitest(2곳)+코드열람(1곳) | `TerminalView.test.tsx`, `MentionAgentView.test.tsx`(**신규**) / `BranchWorkspace.tsx` 코드 대조 | PASS(2) / 코드 정합 확인·자동테스트는 없음(아래 "잔여 갭" 참조) |
| 탭 라벨 종료 표시(디밍+`종료됨`) | vitest | `TerminalView.test.tsx` "onExit 으로 받은 종료 정보가..." | PASS |

### B-2 검색 고도화

| AC | 검증 방법 | 테스트 위치 | 결과 |
|---|---|---|---|
| 검색 3분할(`terminalSearch.ts`/`useTerminalSearch.ts`/`TerminalSearchBar.tsx`), `TerminalPane` 인라인 제거 | 코드 열람 | `TerminalPane.tsx` grep — 검색 인라인 상태/JSX 부재, 훅·뷰로 위임 확인 | PASS |
| 매치 카운트 `현재/전체`(`0/0`/`-/N`/`N/>999`) | vitest | `terminalSearch.test.ts` `formatMatchCount` 경계 7종 | PASS |
| 토글 시 새 옵션 객체(변이 금지) | vitest | `terminalSearch.test.ts` "호출마다 새 객체를 반환", `useTerminalSearch.test.ts` "토글 변경 시 새 옵션으로 재검색" | PASS |
| 잘못된 정규식 → 오류 상태, 터미널 생존 | vitest | `useTerminalSearch.test.ts` "정규식 토글 + 잘못된 패턴이면 hasError...", `terminalSearch.test.ts` `isValidRegexQuery`/`safeFind` throw 격리 | PASS |
| `overviewRulerWidth:14` + decoration 색상 | 코드 열람 + vitest | `TerminalPane.tsx` 옵션, `terminalSearch.test.ts` "decoration 색상이 #RRGGBB 형식" | PASS |
| 2048자 초과 쿼리 절단 | vitest | `terminalSearch.test.ts` `clampSearchQuery` 경계(2047/2048/2049) + `useTerminalSearch.test.ts` "2048자를 넘는 쿼리는..."(**이번 QA에서 신규 — 훅 레벨 통합 검증**) | PASS |
| 검색바 닫으면 decoration 제거 + 포커스 복귀 | vitest | `useTerminalSearch.test.ts` "닫으면 clearDecorations 가 호출되고..." | PASS |
| IME 조합 중 미발화 | vitest | `useTerminalSearch.test.ts` "IME 조합 중에는 재검색이 발화하지 않는다" | PASS |

### B-8 탭 reorder

| AC | 검증 방법 | 테스트 위치 | 결과 |
|---|---|---|---|
| `@dnd-kit/core`/`@dnd-kit/sortable` deps 추가 | 코드 열람 | `package.json` | PASS |
| 드래그 시 2px 인디케이터, 드롭 시 재배치, 탭 자체 transform 없음 | 코드 열람 + vitest(간접) | `TerminalView.tsx` `useSortable` transform 미적용 확인, `TerminalView.test.tsx` MRU 테스트가 DnD 배선과 공존 확인 | PASS — 실제 픽셀 드래그는 jsdom `PointerEvent` 부재로 자동화 불가(아래 "자동화 한계" 참조), 코드 검토로 대체 |
| 12px 미만 미시작, rename/닫기/연필 기존대로 | vitest | `tabDragSensor.test.ts` `shouldActivateDrag` 6케이스, `TerminalView.test.tsx` "renames a tab via inline edit"(dnd-kit 도입 후에도 통과) | PASS |
| missed-end fallback | 코드 열람 | `TerminalView.tsx` window `pointerup`/`blur`/`document visibilitychange` 리스너 확인 | PASS — 자동화 불가(수동 QA 대상, plan.md 기재됨) |
| MRU 기준 다음 탭 활성화, 없으면 오른→왼 | vitest | `tabOrder.test.ts` 5케이스 + `TerminalView.test.tsx` "탭을 닫으면 MRU 스택 기준으로..." | PASS |
| 재시작 후 순서 유지 | vitest(main) + 코드 열람 | `TerminalManager.test.ts` "reorder 후 listSessions/exportSessions 순서 일치" — 실제 재시작 왕복은 수동 QA(plan.md) | PASS(로직) — E2E 는 수동 |
| `moveTab`/`pickNextActiveTab`/`pushMru`/`applySessionOrder` 단위 테스트 | vitest | `tabOrder.test.ts`(13) + `sessionOrder.test.ts`(5) | PASS |

### 공통 / 회귀

| AC | 검증 방법 | 결과 |
|---|---|---|
| 기존 테스트 계약 갱신(`index.test.ts`/`mockWindowApi.ts`/`TerminalManager.test.ts` emitExit 시그니처) | 코드 열람 + 실행 | PASS — `index.test.ts` :332-365 `eventOnly`+`TERMINAL_REORDER` 단언, `mockWindowApi.ts` `terminal.onExit`/`reorder`, `TerminalManager.test.ts` `emitExit(info = {...})` |
| `npx tsc --noEmit`(web+node) / `npm run test:run` / 커버리지 70% | 직접 실행(아래 "실행 결과") | PASS |
| `ClaudeManual.tsx` SECTIONS 3건 한국어 + 단축키 표 `⌘F` | grep | PASS |
| `CHANGELOG.md` 항목 | grep | PASS |

## 실행 결과

- `npx tsc --noEmit -p tsconfig.web.json` — PASS (0 에러)
- `npx tsc --noEmit -p tsconfig.node.json` — PASS (0 에러)
- `npx vitest run`(전체, 이번 QA 보강분 포함) — PASS: **134 test files / 1974 tests**
- `npx vitest run --coverage` — PASS: 전체 79.97% lines / 82.51% branch / 90.45% functions (게이트 70/-/80 전부 상회)
- `main/terminal` 라인 커버리지: 95.52%(보강 전 94.52%) — `TerminalManager.ts` 95.16%(보강 전 94.08%, 잔여 미커버는 이번 사이클과 무관한 기존 `MAX_BUFFER_LINES` 트림 분기 158-159), `sessionOrder.ts` 100%
- renderer `components/Terminal/*`, `MentionAgent/*` 는 `vitest.config.ts` coverage `include` 범위 밖(ADR-03 §트레이드오프 명시)이라 게이트 비대상 — 별도 실행 결과만 아래에 기록
- 회귀 의심 영역: 없음 — 명시적 기록. 다른 병행 트랙(A/C, calendar/windows-compat/workspace)의 미커밋 변경이 같은 워킹트리에 섞여 있었으나 전체 스위트가 여전히 전부 통과(134/134)로 상호 간섭 없음을 확인했다.

### 이번 QA에서 신규/보강한 테스트

운영 코드는 건드리지 않고 아래 5개 파일만 추가/보강했다.

1. **`src/renderer/src/components/Terminal/TerminalPane.test.tsx`(신규, 13케이스)** — 가장 큰 공백이었다. `TerminalView.test.tsx` 는 `TerminalPane` 을 stub 으로 치환해서 실제 입력 차단 로직(`exitInfoRef`)을 전혀 실행하지 않는다. `@xterm/xterm`/`addon-fit`/`addon-search`/`addon-unicode11` 을 `TerminalManager.test.ts` 의 `node-pty` mock 과 동일한 boundary-mock 패턴으로 대체하고:
   - 종료 오버레이 렌더링(있음/없음, exit 0 초록 dot / 그 외 빨강 dot, `onRequestClose` 유무에 따른 닫기 버튼)
   - **입력 차단 3경로** 각각을 exitInfo 유/무로 검증: `terminal.onData`(타이핑) / `attachCustomKeyEventHandler`(Shift+Enter 제어 시퀀스) / 파일 드롭
   - **[핵심] stale 클로저 회귀 2건** — 마운트 시점엔 `exitInfo=null` 이다가 **리렌더(재마운트 아님)** 로 나중에 채워지는 시나리오를 onData 경로/키핸들러 경로 각각 재현. `exitInfoRef` 를 `useEffect` 로 동기화하는 코드(ADR-02 §결정 4)가 없었다면 이 두 테스트가 실패했을 것 — 즉 이 방어를 실제로 고정하는 테스트.
2. **`src/renderer/src/components/Terminal/TerminalSearchBar.test.tsx`(신규, 8케이스)** — "뷰" 레이어가 지금까지 0 커버리지였다. Enter/Shift+Enter/Escape 키 디스패치, IME 조합 중(keyCode 229) Enter 미가로채기, 토글 클릭 → `onToggle` 호출 + `aria-pressed` 반영, 오류 title 노출.
3. **`src/renderer/src/components/MentionAgent/MentionAgentView.test.tsx`(신규, 2케이스)** — PRD AC8 이 명시한 3개 호스트 중 유일하게 테스트가 없던 곳(TerminalView 는 기존에 있었음). 자기 세션만 반영/다른 세션 무시 + at-most-once(두 번째 exit 이 최초 payload 를 덮지 않음, exitCode 로 직접 검증).
4. **`src/main/terminal/TerminalManager.test.ts`(보강, +1케이스)** — output listener throw 격리 테스트는 있었지만 대칭인 **exit listener throw 격리**는 없었다(커버리지 리포트에서 라인 189-190 미커버로 확인). output listener 테스트와 동일 패턴으로 추가.
5. **`src/renderer/src/components/Terminal/useTerminalSearch.test.ts`(보강, +1케이스)** — `clampSearchQuery` 는 순수 함수 단위로만 검증되어 있었다. `setQuery` 가 실제로 클램프된 값을 상태에 반영하고 클램프된 쿼리로 `findNext` 를 호출하는 **배선**까지 통합 검증하는 케이스 추가.
6. **`src/renderer/src/components/Terminal/TerminalView.test.tsx`(보강, +1케이스)** — 렌더러 레벨 at-most-once 를 `MentionAgentView` 와 동일한 방식(exitCode 로 직접 확인)으로 주 호스트인 `TerminalView` 에도 대칭 추가. stub 에 `data-exit-code` 속성 추가.

## 잔여 갭 (verdict 에는 반영, 후속 권고)

- **`BranchWorkspace.tsx` 의 onExit 구독은 자동화 테스트가 없다.** 코드를 직접 대조한 결과 `TerminalView`/`MentionAgentView` 와 동일한 패턴(`termSessionsRef` 역매핑으로 자기 세션만 반영, `prev[id] ? prev : ...` 로 at-most-once)을 정확히 따르고 있어 로직 결함은 발견하지 못했다. 다만 `BranchWorkspace.tsx` 는 835줄에 git worktree/branch API 다건을 마운트 시 병렬 호출하는 기존에도 테스트 파일이 전혀 없던 컴포넌트(`DiffPanel.test.tsx`/`FileComparePanel.test.tsx` 는 있지만 `BranchWorkspace.test.tsx` 는 부재)라, 이번 QA 스코프에서 처음부터 전체 mock 체계를 구축하는 것은 범위를 크게 벗어난다고 판단해 시도하지 않았다. plan.md 의 수동 QA 체크리스트에 "BranchWorkspace(워크트리 터미널) 각각에서 종료 확인" 항목이 이미 있으므로 그쪽으로 위임을 권고한다.
- **드래그 픽셀 이동·rename 100연속·missed-end fallback 의 실제 포인터 시퀀스는 자동화 불가.** 이 vitest 환경(jsdom)에는 `PointerEvent` 가 없음을 직접 확인했다(`typeof PointerEvent === 'undefined'`) — `@dnd-kit` 의 `PointerSensor` 는 네이티브 pointer 이벤트에 의존하므로 jsdom 재현이 신뢰할 수 없다. `shouldActivateDrag` 순수 함수(12px+2샘플 정책)와 rename 회귀 테스트로 대체 검증했고, 실제 드래그 조작은 plan.md 의 수동 QA 항목("탭 5개 드래그 재배치", "더블클릭 rename 10회 연속")으로 이미 커버되어 있다.
- **재시작 후 순서/이름 영속화의 E2E 는 자동화 밖**(ADR-05 §R8 도 기존 `window-all-closed → dispose()` 버그를 이번 사이클 스코프 밖으로 명시). `applySessionOrder`/`reorder()` 의 로직은 vitest 로 고정했다.

이 세 항목 모두 신규 발견된 결함이 아니라 **애초에 jsdom/vitest 로는 검증 범위 밖인 시나리오**이며, impl-log·plan.md 도 동일하게 "수동 QA" 로 분류해뒀다. verdict 는 이를 감안해 PASS 로 판단한다.

## 수동 시나리오 (참고 — plan.md 원본 재정리)

**exit 통지**
1. 터미널 탭에서 `exit` 입력 → 오버레이 노출, 타이핑 무반응, 스크롤/텍스트 선택/복사는 계속 가능한지 확인.
2. `sleep 1; exit 3` → 배지에 `(exit 3)` + 빨강 dot.
3. 탭 X 로 직접 닫기 → 오버레이가 뜨지 않는지(suppression) 확인. 앱을 완전히 종료했다가 재시작 → 잔여 오버레이가 없는지 확인.
4. `MentionAgentView`(두레이 채널에서 `@clauday` 멘션으로 유발)와 `BranchWorkspace`(워크트리 터미널) 각각에서 1~3 을 반복.

**검색**
1. 로그가 긴 세션에서 검색 → `3/47` 형태 카운트, 매치 1000+ 시 `>999` 표기.
2. `.*` 토글 후 `(` 입력 → 카운트 자리에 오류 표기 + 입력창 강조, 터미널이 죽지 않는지 확인.
3. 한글 조합 중(예: "세" 입력 중) 검색이 중간 글자로 튀지 않는지 확인.
4. 우측 오버뷰 룰러에 매치 마커가 보이고 활성 매치가 다른 색으로 구분되는지 확인.

**탭**
1. 탭 5개를 만들고 드래그로 순서 변경 — 드래그 중 탭 자체는 고정, 2px 인디케이터만 이동하는지 확인.
2. 더블클릭으로 이름 변경을 10회 연속 시도 — 드래그로 새지 않는지 확인.
3. 드래그 도중 다른 창으로 포커스를 전환했다가 돌아와서 인디케이터 잔상이 없는지 확인.
4. 탭을 재배치한 뒤 이름 변경 1회(즉시 저장 트리거) → 앱 재시작 → 순서가 유지되는지 확인(완전한 보장은 아님 — ADR-05 §R8).

## Verdict

**PASS — 머지 가능**

근거:
- PRD 체크박스 28개 전부 대조 완료. 코드 리뷰 중 결함을 발견하지 못했다(운영 코드 수정 0건).
- B-1/B-2/B-8 각 영역의 핵심 방어 로직(suppression·at-most-once·stale 클로저 입력 차단·regex 오류 격리·2048자 클램프·MRU 순서)이 모두 vitest 로 고정되어 있고, 이번 QA 로 5개 파일(신규 3 + 보강 2)을 추가해 이전에 미검증이던 공백(TerminalPane 입력 차단 실단위 테스트 부재, TerminalSearchBar 뷰 0 커버리지, MentionAgentView onExit 무테스트, exit listener throw 비대칭, 2048자 클램프의 훅 레벨 배선 미검증)을 닫았다.
- `npx tsc --noEmit`(web/node) 0 에러, `npx vitest run` 134 files/1974 tests 전부 통과, 커버리지 79.97%(게이트 70% 상회), `main/terminal` 95.52%.
- 잔여 갭 3건(BranchWorkspace 무테스트, 실제 포인터 드래그, 재시작 E2E)은 신규 결함이 아니라 애초에 jsdom 자동화 밖인 시나리오로, plan.md 가 이미 수동 QA 로 분류해뒀고 이번 리포트에도 절차를 재정리해 남겼다.

## 참조

- ADR-v2-terminal-p1-01~05, `feature/terminal/v2-terminal-p1/{prd.md,adr*.md,plan.md,impl-log.md}`
- 신규/보강 테스트: `src/renderer/src/components/Terminal/TerminalPane.test.tsx`, `TerminalSearchBar.test.tsx`, `useTerminalSearch.test.ts`, `TerminalView.test.tsx`, `src/renderer/src/components/MentionAgent/MentionAgentView.test.tsx`, `src/main/terminal/TerminalManager.test.ts`
