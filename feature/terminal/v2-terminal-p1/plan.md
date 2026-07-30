---
task: v2-terminal-p1
date: 2026-07-30
---

# Plan — v2.0 Phase 1 · B-1 exit 통지 / B-2 검색 고도화 / B-8 탭 reorder

> 브랜치: `feat/version-2.0` (체크아웃 완료)
> 선행 문서: [prd.md](prd.md) · [adr.md](adr.md)(01) · [adr-02](adr-02-exit-ui.md) · [adr-03](adr-03-search.md) · [adr-04](adr-04-tab-dnd.md) · [adr-05](adr-05-tab-order-persistence.md)
> 같은 Phase 1 의 다른 트랙(A-0/A-5, C-0)과 **병렬 진행**. 충돌 방지 규칙은 §제약 참조.

## 분리 영역

| 파트 | 담당 | 파일 |
|---|---|---|
| **공유 계약** | main-process-engineer (**먼저 확정**) | `src/shared/types/ipc.ts`, `src/shared/types/terminal.ts` |
| **main** | main-process-engineer | `src/main/terminal/TerminalManager.ts`, `src/main/terminal/TerminalManager.test.ts`, `src/main/terminal/sessionOrder.ts`(신규) + 테스트, `src/preload/index.ts`, `src/main/index.ts`(**3줄만**), `src/main/index.test.ts` |
| **renderer** | renderer-engineer | `src/renderer/src/components/Terminal/*`, `src/renderer/src/components/MentionAgent/MentionAgentView.tsx`, `src/renderer/src/components/Git/BranchWorkspace.tsx`, `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx`, `test/helpers/mockWindowApi.ts`, `package.json`(dnd-kit 추가) |
| **공통 마감** | integrator | `CHANGELOG.md`, `.agent/wiki/domain-terminal.md`, `.agent/wiki/domain-electron-ipc.md`, `.agent/wiki/decisions-log.md` |

**순서 의존성**: `M-1`(shared 계약) → renderer 착수 가능. `M-3`(preload) 이 끝나야 renderer 의 `window.api.terminal.onExit` / `reorder` 타입이 컴파일된다. 그 전까지 renderer 는 `R-0`(의존성) · `R-3`(검색 추출, main 무관) 을 먼저 진행할 것.

**impl-log 규약** — `feature/terminal/v2-terminal-p1/impl-log.md` 한 파일을 **append 전용**으로 공유한다.

- [ ] main-process-engineer 는 `## [main-process-engineer] 변경한 파일` / `## [main-process-engineer] 결정 사항 (해야 할 것)` / `## [main-process-engineer] 제약 (하지 말 것)` / `## [main-process-engineer] 참조` 4섹션을 파일 **끝에 추가**
- [ ] renderer-engineer 는 동일 4섹션을 `## [renderer-engineer] ...` 헤더로 파일 **끝에 추가**
- [ ] **상대 파트의 섹션을 수정·삭제하지 않는다.** 파일이 없으면 먼저 도착한 쪽이 frontmatter(`task: v2-terminal-p1`, `agent:`, `date:`)를 만든다
- [ ] 상대 파트에 영향 주는 사실(예: payload 필드명 확정, prop 시그니처)은 자기 섹션의 "결정 사항"에 **한 줄로** 남긴다

---

## 구현 단계

### M. main 파트 (main-process-engineer)

#### M-1. 공유 계약 확정 (가장 먼저 — renderer 가 대기 중)

- [x] `src/shared/types/ipc.ts` Terminal 블록(:143-152)에 채널 2개 추가. `TERMINAL_OUTPUT` 다음 줄과 `TERMINAL_RENAME` 다음 줄:
  ```ts
  /** v2.0 B-1: PTY 종료 push (main → renderer). handle 등록 대상 아님 */
  TERMINAL_EXIT: 'terminal:exit',
  /** v2.0 B-8: 렌더러 탭 순서를 main 세션 순서에 반영 (fire-and-forget) */
  TERMINAL_REORDER: 'terminal:reorder',
  ```
- [x] `src/shared/types/terminal.ts` 에 payload 타입 추가 (한국어 1~2줄 주석):
  ```ts
  /** PTY 종료 통지 payload. signal 은 IPC 구조적 클론에서 undefined 가 소실되므로 null 로 정규화. */
  export interface TerminalExitPayload {
    id: string
    exitCode: number
    signal: number | null
  }
  ```
- [x] impl-log 에 "payload 필드 확정" 한 줄 기록 → renderer 착수 신호

#### M-2. TerminalManager — exit 방송 · suppression · 죽은 훅 수리 · reorder

- [x] `src/main/terminal/sessionOrder.ts` 신규 — 순수 함수만:
  ```ts
  /** 요청 순서대로 재배치. 존재하지 않는 id 는 무시하고, 요청에 없는 id 는 기존 상대 순서로 뒤에 붙인다. */
  export function applySessionOrder(currentIds: string[], desiredIds: string[]): string[]
  ```
- [x] `TerminalManager` 필드 추가: `exitListeners: Set<(payload: TerminalExitPayload) => void>`, `suppressedExitIds: Set<string>`
- [x] `addExitListener(cb): () => void` — `addOutputListener` 와 대칭. 한국어 1~2줄 주석
- [x] `create()` 의 `onData` 에서 **outputListeners 실제 호출** (ADR-01 §결정 6):
  - 순서: `outputBuffer 적재` → `webContents.send(TERMINAL_OUTPUT)` → `outputListeners fan-out`
  - 리스너마다 개별 `try/catch` + `console.warn('[TerminalManager] output listener 실패', { sessionId: id, error })`
- [x] `create()` 의 `onExit` 교체:
  ```ts
  let exitHandled = false
  ptyProcess.onExit(({ exitCode, signal }) => {
    if (exitHandled) return
    exitHandled = true
    this.sessions.delete(id)
    if (this.suppressedExitIds.delete(id)) return            // 의도적 종료 — 통지 생략
    const payload: TerminalExitPayload = { id, exitCode: exitCode ?? 0, signal: signal ?? null }
    // webContents.send + exitListeners fan-out (리스너는 try/catch 격리)
  })
  ```
- [x] `kill(id)` — **세션이 존재할 때만** `suppressedExitIds.add(id)` 후 `pty.kill()`. 이미 없는 id 는 no-op (예약 누수 방지)
- [x] `dispose()` 는 현행대로 `kill()` 경유 (자동 억제됨) — 별도 분기 추가 금지
- [x] `reorder(ids: string[]): void` — `applySessionOrder` 로 계산한 순서대로 `sessions` Map 재구성. 요청 id 중 유효한 게 0개면 no-op + `console.warn` (silent failure 금지)
- [x] `TerminalManager` 가 플랫폼 분기(`enrichedTerminalPath`, 셸 선택, LANG 강제)를 **건드리지 않았음**을 impl-log 제약 섹션에 명시

#### M-3. preload — onExit / reorder 노출

- [x] `src/preload/index.ts` 상단(:6-21)의 `subscribeTerminalOutput` 과 **동일 패턴**으로 `subscribeTerminalExit` 추가 — 단일 `ipcRenderer.on` 공유 fan-out, 핸들러 개별 try/catch, unsubscribe 반환
- [x] `api.terminal` 블록(:365-396)에 추가:
  ```ts
  onExit: (callback: (payload: TerminalExitPayload) => void): (() => void) => subscribeTerminalExit(callback),
  reorder: (ids: string[]): void => ipcRenderer.send(IPC_CHANNELS.TERMINAL_REORDER, ids),
  ```
- [x] `TerminalExitPayload` 를 `../shared/types/terminal` 에서 import (preload 는 경로 별칭 없음 — 상대 경로)

#### M-4. src/main/index.ts — 3줄만

- [x] `ipcMain.on(IPC_CHANNELS.TERMINAL_RESIZE, ...)` 등록 **직후**(≈ :958)에 삽입:
  ```ts
  ipcMain.on(IPC_CHANNELS.TERMINAL_REORDER, (_, ids: string[]) =>
    terminalManager.reorder(ids)
  )
  ```
- [x] **그 외 index.ts 변경 금지.** `TERMINAL_EXIT` 는 push 전용이라 핸들러 등록이 없다(ADR-01). 30초 autosave / before-quit / window-all-closed 블록은 손대지 않는다(B-5 소관)
- [x] `git diff --stat src/main/index.ts` 가 `+3` 근처인지 확인 후 impl-log 에 기록

#### M-5. main 테스트 (vitest-patterns 스킬)

- [x] `src/main/terminal/sessionOrder.test.ts` 신규 — `applySessionOrder`: 정상 재배치 / 모르는 id 무시 / 요청 누락 id 는 원래 상대 순서로 뒤에 / 빈 요청 no-op / 중복 id 방어
- [x] `src/main/terminal/TerminalManager.test.ts` **기존 계약 갱신**:
  - [x] mock 의 `emitExit` 시그니처 변경 (`:25`, 호출부 `:154`) — `emitExit: (info = { exitCode: 0, signal: undefined }) => onExitCb?.(info)`
  - [x] 기존 테스트 `'pty exit → session 자동 제거'`(:151-156) 가 새 시그니처로 통과하는지 확인
  - [x] 기존 테스트 `'addOutputListener 등록/해제'`(:142-149) 의 주석("내부에서 호출되진 않지만")을 **실제 호출 검증으로 교체**
- [x] `TerminalManager.test.ts` 신규 케이스:
  - [x] PTY 종료 → `webContents.send(TERMINAL_EXIT, { id, exitCode, signal })` 1회 + `addExitListener` 콜백 수신
  - [x] `signal` 미제공 시 payload 가 `null` (undefined 아님)
  - [x] `kill(id)` 후 exit → **통지 없음**
  - [x] `dispose()` 후 각 세션 exit → 통지 없음
  - [x] 같은 세션 `emitExit` 2회 → 통지 1회 (at-most-once)
  - [x] 이미 종료된 id 에 `kill()` 재호출 → 이후 새 세션 exit 이 정상 통지됨 (억제 예약 누수 없음)
  - [x] `addOutputListener` 가 `onData` 마다 `(id, data)` 로 호출됨 + unsubscribe 후 미호출
  - [x] output listener 1개가 throw 해도 `webContents.send` 와 다른 listener 는 정상 (warn 로그 spy)
  - [x] `reorder` 후 `listSessions()` / `exportSessions()` 순서 일치
- [x] `src/main/index.test.ts` **기존 계약 갱신**:
  - [x] `eventOnly` 배열(:332-351)에 `IPC_CHANNELS.TERMINAL_EXIT` 추가 → handle 등록되면 실패
  - [x] `'terminal input/resize channels use ipcMain.on'` 테스트(:353-358)에 `TERMINAL_REORDER` 가 `onCalls` 에 있음을 **명시적으로 단언**하는 케이스 추가
  - [x] `critical channels`(:304-330) 는 변경 불필요 — 확인만
- [x] `npx vitest run src/main/terminal src/main/index.test.ts` 그린

---

### R. renderer 파트 (renderer-engineer)

#### R-0. 의존성

- [x] `npm i @dnd-kit/core @dnd-kit/sortable` (dependencies). 설치 후 `npm run dev` 부팅 1회 확인 (electron-rebuild 영향 없음 — 순수 JS)
- [x] `package.json` 의 버전 범위가 `^` 로 들어갔는지 확인, `package-lock.json` 동반 커밋

#### R-1. B-2 검색 — 추출 (main 무관, 가장 먼저 착수 가능)

- [x] `src/renderer/src/components/Terminal/terminalSearch.ts` 신규 — 순수 함수 only (ADR-03 §결정 1)
  - [x] `MAX_SEARCH_QUERY_LENGTH = 2048`, `clampSearchQuery(q: string): string`
  - [x] `buildSearchOptions(t: { caseSensitive: boolean; regex: boolean; wholeWord: boolean }): ISearchOptions` — **매 호출 새 객체**. `decorations` 에 목업 색상 반영:
        `matchBackground` / `matchBorder` / `matchOverviewRuler` / `activeMatchBackground` / `activeMatchBorder` / `activeMatchColorOverviewRuler`
  - [x] `formatMatchCount(r: { resultIndex: number; resultCount: number } | null, query: string): string` — `''` / `0/0` / `-/N` / `3/47` / `3/>999`
  - [x] `isValidRegexQuery(q: string, regexOn: boolean): boolean`
  - [x] `safeFind(addon, direction: 'next' | 'prev', query, options, ctx: { sessionId: string }): { ok: boolean; found: boolean }` — try/catch + 실패 시 `clearDecorations()` 시도 + **세션당 1회** `console.warn('[terminal-search] find 실패', { sessionId, message })`
- [x] `src/renderer/src/components/Terminal/useTerminalSearch.ts` 신규 — open/query/toggles/results/error 상태, `onDidChangeResults` 구독(dispose 정리 포함), 120ms 디바운스 증분 검색, **IME 조합 중 검색 억제**, close 시 `clearDecorations()` + `terminal.focus()`
- [x] `src/renderer/src/components/Terminal/TerminalSearchBar.tsx` 신규 — 목업 `.searchbar` 레이아웃(입력 · 카운트 · `Aa`/`.*`/`\b` · ↑ ↓ ✕). 상태 없음. 모든 버튼에 한국어 `title`, 카운트에 `aria-live="polite"`
- [x] `TerminalPane.tsx` 에서 검색 코드 제거: state(:22-23), `searchInputRef`(:21), find 함수(:514-525), JSX(:604-636). `⌘F` 핸들러(:204-210)는 훅의 `open()` 호출로 교체
- [x] `TerminalPane.tsx` 의 `new Terminal({...})` 에 `overviewRulerWidth: 14` 추가 (`allowProposedApi: true` 는 이미 있음)
- [x] **검색 외 코드는 건드리지 않는다** — 링크 프로바이더(:104-181)·키 핸들러 나머지·이미지 사이드바는 그대로

#### R-2. B-1 exit 오버레이 — TerminalPane

- [x] `TerminalPaneProps` 에 optional 2개 추가 (기존 prop 시그니처 불변):
  ```ts
  exitInfo?: { exitCode: number; signal: number | null } | null
  onRequestClose?: () => void
  ```
- [x] `exitInfoRef` 를 effect 로 동기화 (mount effect 클로저의 stale prop 함정 — ADR-02 §결정 4)
- [x] 입력 차단 3경로: `terminal.onData` 의 `window.api.terminal.input` 스킵 / `attachCustomKeyEventHandler` 의 제어문자 `send()` 스킵 / 파일 드롭·이미지 paste 스킵. **`terminal.dispose()` 금지** (스크롤백·선택·복사 유지)
- [x] 오버레이 JSX — 목업 `.exit-overlay` / `.exit-badge`: `세션이 종료되었습니다 (exit N)`, exitCode 0 이면 초록 dot / 그 외 빨강 dot, `onRequestClose` 가 있을 때만 `닫기` 버튼. 디자인 토큰(`--bg-surface-raised`, `--bg-border`, `--text-*`) 사용
- [x] 오버레이는 **자동 제거 없음** — 타이머/자동 닫기 코드 금지

#### R-3. B-1 구독 — 호스트 3곳

- [x] `TerminalView.tsx`
  - [x] `SessionWithOutput` 에 `exitInfo?: TerminalExitPayload | null` 필드 추가
  - [x] `window.api.terminal.onExit` 1회 구독 → **자기 entries 에 있는 id 만** 반영, 이미 `exitInfo` 가 있으면 덮어쓰지 않음
  - [x] `TerminalPane` 에 `exitInfo` + `onRequestClose={() => closeSession(id)}` 전달
  - [x] `TabLabel` 에 종료 표시(디밍 + `종료됨`) — 텍스트/툴팁 한국어
- [x] `MentionAgentView.tsx` — 동일 패턴. `onRequestClose={() => void closeSession(session.id)}`
- [x] `BranchWorkspace.tsx` — `termSessions`(path→sessionId) 역매핑으로 자기 세션만 반영. `onRequestClose={() => closeTerminalTab(path)}`(:295)
- [x] 3곳 모두 unmount 시 unsubscribe. 중복 구독 방지(effect deps 확인)
- [x] 세 곳의 구독 코드가 유사하지만 **지금 공통 훅으로 추상화하지 않는다** (ADR-02 §결과) — 사유를 impl-log 에 한 줄

#### R-4. B-8 탭 reorder

- [x] `src/renderer/src/components/Terminal/tabOrder.ts` 신규 — 순수 함수 only
  - [x] `moveTab(ids: string[], activeId: string, overId: string): string[]` (모르는 id / 동일 id → 원본 반환)
  - [x] `pushMru(mru: string[], id: string, cap = 50): string[]`
  - [x] `pickNextActiveTab(order: string[], closedId: string, mru: string[]): string | null` — MRU 우선 → 오른쪽 → 왼쪽 → `null`
- [x] `src/renderer/src/components/Terminal/tabDragSensor.ts` 신규 — `PointerSensor` 상속 커스텀 센서. 판정은 순수 함수로 분리:
  ```ts
  /** 12px 이상 이동이 연속 2샘플 확인되어야 드래그 시작 (더블클릭 rename 오작동 방지) */
  export function shouldActivateDrag(distances: number[], thresholdPx = 12, requiredSamples = 2): boolean
  ```
- [x] `TerminalView.tsx` 탭바를 `DndContext` + `SortableContext(horizontalListSortingStrategy)` 로 감싼다
  - [x] `useSortable` 의 `transform`/`transition` 을 **적용하지 않는다**. 드래그 원본 탭은 opacity 로만 구분
  - [x] 삽입 지점에 **2px 세로 인디케이터** (`--clauday-blue` 계열, 탭바 높이 전체)
  - [x] `onDragEnd` → `moveTab` 으로 entries 배열 재배치 → 순서가 바뀐 경우에만 `window.api.terminal.reorder(ids)` 1회 호출
  - [x] missed-end fallback: window `pointerup` / `blur` / `visibilitychange` 에서 드래그 상태 강제 종료
  - [x] `accessibility.announcements` 한국어 제공
- [x] `TabLabel` 의 연필/X 버튼과 rename `input` 에 `onPointerDown={(e) => e.stopPropagation()}` — 드래그 시작 대상에서 제외
- [x] `closeSession`(:61-75) 을 `pickNextActiveTab` 기반으로 교체 + `mruRef`(useRef<string[]>) 를 탭 활성화 시 `pushMru` 로 갱신
- [x] `⌘1~9` 탭 전환(:104-108) 이 **재배치된 순서**를 따르는지 확인 (entries 배열 기준이므로 자동 — 회귀만 확인)

#### R-5. renderer 테스트

- [x] `test/helpers/mockWindowApi.ts`(:133-150) `terminal` 블록 갱신:
  - [x] `onExit: vi.fn().mockReturnValue(noopUnsub)` 추가 — **테스트에서 콜백을 저장해 발화시킬 수 있는 형태**로 (예: 헬퍼가 마지막 콜백을 노출)
  - [x] `reorder: vi.fn()` 추가
- [x] `terminalSearch.test.ts` — `formatMatchCount` 경계(0 / 1 / 999 / 1000 / resultIndex -1), `clampSearchQuery`(2047/2048/2049), `buildSearchOptions`(2회 호출 결과가 **서로 다른 객체 참조** + 토글 반영), `safeFind`(throw 하는 가짜 addon → 예외 미전파 + `ok:false` + warn 1회)
- [x] `useTerminalSearch.test.ts` — `renderHook`: 토글 변경 시 재검색 발생, close 시 `clearDecorations` 호출, IME 조합 중 검색 미발화
- [x] `tabOrder.test.ts` — `moveTab` / `pushMru` / `pickNextActiveTab` 각 경계
- [x] `tabDragSensor.test.ts` — `shouldActivateDrag`: 11px×3 불활성 / 12px×2 활성 / 20px 1샘플 불활성
- [x] `TerminalView.test.tsx` 확장 (기존 5케이스 **전부 유지**):
  - [x] `onExit` 주입 → 오버레이/탭 배지 노출, 다른 세션 id 의 exit 은 무시
  - [x] 탭 닫기 후 MRU 기준 활성 탭 선택
  - [x] 더블클릭 rename 회귀 (기존 케이스가 dnd 도입 후에도 통과)
- [x] `npx vitest run src/renderer/src/components/Terminal` 그린

#### R-6. 매뉴얼 · 사용자 문서 (renderer 파트 포함)

- [x] `ClaudeManual.tsx` `SECTIONS` — `id: 'clauday'` 섹션의 터미널 관련 서술에 3건 추가 (한국어, 각 1~2줄):
  - [x] 세션 종료 오버레이 — "셸이 끝나면 pane 에 종료 배지가 뜨고 입력이 막힙니다. 닫기 전까지 로그는 그대로 남습니다"
  - [x] 검색 고도화 — `⌘F` 검색바의 매치 카운트 / `Aa`·`.*`·`\b` 토글 / 우측 마커
  - [x] 탭 드래그 — "탭을 12px 이상 끌면 순서를 바꿀 수 있습니다(더블클릭은 이름 변경)"
- [x] `ClaudeManual.tsx` 단축키 표(:501-503) 확인 — `⌘F`(터미널 검색) 행 추가. 없는 단축키를 새로 적지 않는다
- [x] `CHANGELOG.md` 최상단에 v2.0 항목이 없으면 `## [2.0.0-dev] - v2.0 진행 중` 블록을 만들고 3건을 사용자 언어로 기재. **순서 영속화는 단정적으로 약속하지 않는다**(ADR-05 §결과)

---

### V. 검증 · 마감

- [x] `npx tsc --noEmit` 통과
- [x] `npm run test:run` 전체 그린 + `npm run test:coverage` 라인 70% 유지
- [x] `npm run build` (electron-vite) 통과
- [ ] 수동 QA — exit:
  - [ ] 터미널에서 `exit` → 오버레이 + 타이핑 무반응 + 스크롤/복사 가능
  - [ ] `sleep 1; exit 3` → 배지에 `exit 3` + 빨강 dot
  - [ ] 탭 X 로 닫기 → 오버레이 안 뜸 / 앱 종료 후 재시작 → 잔여 오버레이 없음
  - [ ] MentionAgentView(멘션 유발) · BranchWorkspace(워크트리 터미널) 각각에서 종료 확인
- [ ] 수동 QA — 검색:
  - [ ] 긴 로그에서 `3/47` 카운트, 1000+ 에서 `>999`
  - [ ] 정규식 토글 후 `(` 입력 → 오류 표시 + 터미널 생존
  - [ ] 한글 검색어 조합 중 중간 문자로 검색 안 튐
  - [ ] 우측 ruler 마커 표시 + 활성 매치 구분
- [ ] 수동 QA — 탭:
  - [ ] 탭 5개 드래그 재배치, 인디케이터만 이동
  - [ ] 더블클릭 rename 10회 연속 성공(드래그로 새지 않음)
  - [ ] 드래그 중 창 전환 → 인디케이터 잔상 없음
  - [ ] 재배치 → rename 1회(즉시 저장 트리거) → 앱 재시작 → 순서 유지
- [ ] `qa-report.md` 작성 (수락 기준 × 검증 매트릭스, verdict)
- [ ] `.agent/wiki/domain-terminal.md` 갱신 — "세션 라이프사이클" 다이어그램에 exit push 추가, "외부 output listener" 섹션을 **실제 호출됨**으로 정정, 검색/탭 순서 항목 추가
- [ ] `.agent/wiki/domain-electron-ipc.md` 갱신 — §"메인 → 렌더러 (push)" 목록에 `TERMINAL_EXIT` 추가
- [ ] `.agent/wiki/decisions-log.md` 에 ADR 5건 한 줄씩 추가 (최신이 위)
- [ ] PR — title 예: `feat(terminal): PTY 종료 통지 · 검색 고도화 · 탭 드래그 순서 변경 (v2.0 B-1/B-2/B-8)`

---

## 제약 (하지 말 것)

- **`src/main/index.ts` 는 3줄(`ipcMain.on(TERMINAL_REORDER)`)만.** 30초 autosave / before-quit / window-all-closed 블록 손대지 말 것 — B-5 소관이고 A·C 트랙과 충돌한다.
- **`TerminalPane` 의 기존 prop(`sessionId`/`isActive`/`initialOutput`)을 바꾸지 말 것.** `isVisible`/`isFocused` 분리는 B-3, forwardRef 는 B-5.
- **split pane 관련 구조(splitTree, SplitLayout, paneId)를 미리 만들지 말 것.** 오버레이는 "pane 1개 = 탭 1개" 전제로 충분하다.
- **`@xterm/addon-serialize` / `@xterm/addon-webgl` 도입 금지** (B-5/B-6).
- **링크 프로바이더(`TerminalPane.tsx:104-181`) 수정 금지** (B-7). `safeFind` 와 provider guard 는 주석으로만 상호 참조.
- **`AIService` / `ClaudeChatService` / 멘션 파이프라인 파일 수정 금지.** 플랫폼 분기 가이드(CLAUDE.md) 적용 대상 아님.
- **단축키 레지스트리(Workstream D) 선취 금지.** 새 단축키를 추가하지 않는다(`⌘F` 는 기존 위치 유지).
- **BranchWorkspace / MentionAgentView 탭에 드래그 reorder 적용 금지.**
- **작업과 무관한 리팩터·포맷팅 금지.** `TerminalPane` 에서 옮기는 것은 검색 코드뿐.
- **`exportSessions` / `sanitizeForRestore` / `slice(-5)` 복원 상한을 건드리지 말 것** (B-5).
- **오버레이 자동 제거 타이머 금지.**
- 커밋은 파트별로 분리 (`feat(terminal/main): ...`, `feat(terminal/renderer): ...`) — 리뷰와 되돌리기 단위를 지킨다.

## 참조

- `feature/terminal/v2-terminal-p1/prd.md`, `adr.md`, `adr-02-exit-ui.md`, `adr-03-search.md`, `adr-04-tab-dnd.md`, `adr-05-tab-order-persistence.md`
- `~/.claude/plans/toasty-sleeping-simon.md` — Workstream B (B-1/B-2/B-8), Phase 1
- `docs/dev/orca-absorption-notes.md` §5, §9
- `docs/mockups/v2/terminal-split.html` — `.searchbar` / `.ruler` / `.exit-overlay` + 하단 구현 매핑 노트 3)·4)
- `.claude/skills/electron-ipc-patterns/SKILL.md`(3+1), `.claude/skills/vitest-patterns/SKILL.md`, `.claude/skills/artifact-validation/SKILL.md`
- `.agent/wiki/domain-terminal.md`, `.agent/wiki/domain-electron-ipc.md`
