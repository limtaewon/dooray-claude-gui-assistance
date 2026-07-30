---
task: v2-terminal-p2
domain: terminal, electron-ipc, renderer-only
created: 2026-07-30
status: draft
---

# PRD — v2.0 Phase 2 · 터미널 대개편 (B-3 prop 분리 → B-4 split pane → B-5 영속화 v2 → B-6 WebGL → B-7 링크 프로바이더)

## 배경 / 문제

Phase 1(`feature/terminal/v2-terminal-p1/`)에서 PTY 종료 통지·검색 고도화·탭 드래그가 들어갔다. Phase 2 는 마스터 설계(`~/.claude/plans/toasty-sleeping-simon.md`)의 **Workstream B 나머지 전부**로, 서로 강하게 순서 의존하는 5건을 한 트랙에서 처리한다. Orca(stablyai, MIT) 소스 분석 결과(`docs/dev/orca-absorption-notes.md`)가 각 항목의 함정을 이미 짚어 놓았으므로, 재발명 대신 **검증된 경로를 이식**한다.

1. **B-3 `isActive` 가 4가지 의미를 겸직한다** — `TerminalPane.tsx` 의 단일 `isActive` prop 이 ①컨테이너 가시성(`z-10` vs `invisible`, :540) ②reveal 시 fit + PTY resize(:471-497) ③`term.focus()`(:493) ④`document` 전역 paste 리스너 등록(:520-536) 을 동시에 결정한다. split 이 들어오면 "보이지만 포커스는 아닌 pane" 이 정상 상태가 되는데, 지금 구조로는 그런 pane 이 존재할 수 없다. 특히 ④는 **분할된 모든 visible pane 이 document paste 를 각각 잡아** 이미지 붙여넣기 1회에 N개 PTY 로 경로가 타이핑되는 버그로 직결된다.
2. **B-4 split pane 부재** — 사용자는 `claude` 를 돌리면서 옆에서 로그를 보려면 탭을 오가야 한다. Orca 대비 가장 체감 큰 격차.
3. **B-5 스크롤백이 사라진다 (진짜 원인 확정)** — `window-all-closed`(`src/main/index.ts:1900-1908`)가 darwin 에서도 `terminalManager.dispose()` 를 호출해 세션이 0개가 되고, 그 뒤 `before-quit`(:1892-1898)이 **빈 배열을 무조건 덮어쓴다**(`store.set('terminalSessions', sessions)`, 길이 검사 없음). 30초 autosave(:1877-1883)와 rename 즉시 저장(:864-874)은 `length > 0` 가드가 있어 살아남지만, "창 닫고 나중에 ⌘Q" 경로에서는 전멸한다. live-PTY `exportSessions()` 를 유지하는 한 이 결합은 풀리지 않는다. 게다가 split 이 들어오면 저장 단위가 세션이 아니라 **탭 · 트리 · pane** 이 된다.
4. **B-6 렌더링 성능** — 현재 DOM 렌더러 고정. 긴 로그·TUI 재그리기에서 프레임이 무너진다. 다만 split 은 상시 마운트 구조라 **pane 수 = WebGL 컨텍스트 수**가 되어 Chromium 의 컨텍스트 예산(~16)을 그냥 태울 수 있다.
5. **B-7 Cmd+클릭 경로 열기가 안 먹는다 (사용자 보고)** — 현행 자체 정규식(`TerminalPane.tsx:120-197`)의 구조적 한계 5가지: ①줄 단위 스캔이라 wrap 된 경로 미탐지 ②확장자 화이트리스트라 디렉터리·`Makefile` 류 제외 ③상대 경로를 세션 cwd 기준으로 해석 못 함 ④`~` 확장 불완전 ⑤공백 포함 경로는 따옴표가 있을 때만. Claude Code TUI 는 긴 경로를 **hard wrap**(`isWrapped` 없이 물리적으로 쪼갬)으로 출력해서, 이 처리가 없으면 claude 출력의 경로는 영원히 안 잡힌다.
6. **B-7 곁가지 — 유니코드 폭** — `Unicode11Addon` 만 로드되어 ZWJ 이모지 폭이 어긋난다. 그리고 활성화 시점이 복원 write 보다 늦으면 wide 문자가 단일 셀에 배치돼 `?` 로 깨진다(Orca #4877 오진 사례).

## 목표 (Goals)

### B-3 prop 분리
- **G1** — `TerminalPane` 이 `isVisible`(가시성/refit/WebGL 게이트) · `isFocused`(term.focus + document paste 리스너 + 포커스 링) · `onFocusRequest` 를 각각 받는다. 두 상태의 4개 조합이 모두 유효하게 동작한다.
- **G2** — 기존 3개 호스트(`TerminalView` / `MentionAgentView` / `BranchWorkspace`)는 **한 줄도 수정하지 않고** 현재와 동일하게 동작한다(deprecated `isActive` 해석층).
- **G3** — `forwardRef` 로 `TerminalPaneHandle.serialize()` / `focus()` / `fit()` 이 노출되어 호스트가 pane 스냅샷을 꺼낼 수 있다.

### B-4 split pane
- **G4** — ⌘D 로 오른쪽, ⌘⇧D 로 아래 분할된다. 분할은 **항상 새 PTY** 를 만든다(현재 pane 의 cwd 상속). 한 탭 안에서 3분할 이상, 중첩(행 안의 열)도 된다.
- **G5** — 분할·닫기·탭 전환·창 리사이즈 어디서도 **xterm 인스턴스가 리마운트되지 않는다** — 스크롤백·alt buffer·PTY 바인딩이 유지된다.
- **G6** — pane 경계를 드래그해 비율을 바꿀 수 있다. 드래그 중에는 PTY resize 를 보내지 않고 **드롭 시 1회**만 보낸다. 더블클릭하면 50/50 으로 복귀한다.
- **G7** — ⌥⌘←↑↓→ 로 pane 포커스가 이동한다. ⌘W 는 "포커스된 pane → (마지막 pane 이면) 탭" 순으로 닫는다. 이 단축키들은 **터미널 뷰가 활성일 때만** 발화한다.
- **G8** — 분할 상태에서 이미지/텍스트 붙여넣기가 **포커스된 pane 1곳에만** 전달된다. 클립보드 read 가 비동기로 완료되는 사이에 포커스/탭/세션이 바뀌었으면 그 붙여넣기는 **폐기**된다.

### B-5 영속화 v2
- **G9** — 앱을 어떻게 종료하든(창 닫고 ⌘Q / 바로 ⌘Q / 강제 종료 제외) 재시작 시 **탭 구성 · split 트리 · pane 별 스크롤백**이 복원된다. 특히 "창 닫기 → 잠시 후 ⌘Q" 경로에서 더 이상 빈 상태로 덮어쓰이지 않는다.
- **G10** — 복원된 화면이 **깨지지 않는다**: soft-wrap 이 재랩되지 않고(복원 순서 고정), 커서가 한 칸 어긋나지 않으며(absolute cursor), 셸 프롬프트에 정체불명 응답 문자열이 찍히지 않는다(replay guard).
- **G11** — 복원 탭 상한이 5 → 20 으로 늘어난다. 스냅샷은 leaf 당 UTF-8 512KB, 워크스페이스 총 8MB 를 넘지 않는다(초과분은 오래된 출력부터 잘림).
- **G12** — 기존 `terminalSessions` 저장분이 최초 1회 v2 스냅샷으로 마이그레이션되어, 업그레이드 사용자도 이전 스크롤백을 잃지 않는다.

### B-6 WebGL
- **G13** — 보이는 pane 만 WebGL 컨텍스트를 갖는다. 숨겨지면 `loseContext()` 로 **명시 반납**한다. 17개 pane 을 만들어도 보이는 pane 이 백지가 되지 않는다.
- **G14** — WebGL 로드 실패·context loss 시 DOM 렌더러로 조용히 폴백하고 **자동 재생성을 시도하지 않는다**(루프 방지). 사용자는 설정에서 `webgl`/`dom` 을 직접 고를 수 있다.

### B-7 링크
- **G15** — Cmd/Ctrl+클릭으로 **디렉터리 · 무확장자 파일(`Makefile` 등) · 공백 포함 경로 · 상대 경로 · `~` 경로 · wrap 된 경로**가 열린다. `path/to/file.ts:120:8` 형태의 line:col 도 인식한다.
- **G16** — 존재하지 않는 경로는 링크가 되지 않는다(밑줄도 안 생김). 존재 검증은 캐시되어 hover 마다 IPC 가 폭주하지 않는다.
- **G17** — 링크 프로바이더가 무엇을 던지든 **렌더러가 죽지 않는다**.
- **G18** — 사용자가 보고한 실패 사례들이 회귀 테스트 픽스처로 남는다.
- **G19** — ZWJ 이모지(👨‍👩‍👧‍👦 등) 폭이 맞고, 복원된 스크롤백에서도 wide 문자가 깨지지 않는다.

### 공통
- **G20** — 이식한 서드파티 코드가 라이선스 고지를 갖는다: 파일 상단 주석 + 루트 `THIRD-PARTY-NOTICES.md`(신설). VSCode 파생 파일은 **이중 고지**.
- **G21** — 5단계 전부 vitest 동반. 커버리지 라인 게이트 70% 유지, `npm run test:run` 전체 통과.

## 비목표 (Non-goals)

- **셸 통합 rc 주입** — OSC 7 은 **수신만** 한다. zsh `ZDOTDIR` 하이재킹 / bash rcfile 주입은 스코프 밖(Orca 노트 §2, 한글 사용자명 환경의 zsh #8003 함정 포함).
- **OSC 133 활용** — `registerOscHandler(133, () => true)` 로 화면 오염 방지만. 에이전트 완료 감지는 백로그.
- **main `@xterm/headless` 미러 모델** — Orca 의 주 영속화 경로지만 채택하지 않는다(ADR-03 §대안 1).
- **단축키 레지스트리 (Workstream D)** — ⌘D/⌘⇧D/⌥⌘화살표는 이번에 **인라인 핸들러**로 추가하고, 레지스트리 이전은 D-1 에서 한다. 단 D-1 이 흡수하기 쉽도록 `{id, mac, win, action}` 형태의 **테이블 상수**로 선언한다.
- **터미널 태스크 드로어 / 드래그&드롭 (C-3.5)** — 목업 `terminal-split.html` 의 우측 드로어·태스크 드롭은 Phase 3. 본 사이클은 드롭 대상이 될 **pane 경계와 focus 모델**만 준비한다.
- **탭 reorder(B-8) 재작업** — p1 에서 완료. 단 순서의 저장 경로만 v2 스냅샷으로 이관된다(ADR-03).
- **IME 후보창 앵커 / 조합 추적 (B-9 나머지)** — `terminal-unicode-provider` 만 이번에 가져오고, `terminal-ime-candidate-anchor` 계열은 Phase 3 로 미룬다.
- **xterm 6.x beta API** — `translateToString(..., outColumns)`, `vtExtensions.kittyKeyboard`, webgl patch 5종은 5.5 stable 에 없다. **폴백 경로만** 이식(Orca 노트 §0).
- **BranchWorkspace / MentionAgentView 에 split 적용** — 두 뷰는 pane 1개 모델 유지.
- **Windows 셸 감지·ConPTY 보강 (A-2)** — 별도 트랙. 본 트랙은 `TerminalManager` 의 spawn/플랫폼 분기를 **건드리지 않는다**.

## 수락 기준 (Acceptance Criteria)

### B-3
- [ ] `resolvePaneActivation({ isVisible, isFocused, isActive })` 순수 함수가 `{ visible, focused }` 를 돌려주고, 레거시 3호스트 입력(`isActive: true|false` 단독)에 대해 현행과 동일한 결과를 낸다(테스트로 고정).
- [ ] `isActive` 는 optional + `@deprecated` JSDoc. 기존 3개 호스트 파일의 diff 가 **0줄**.
- [ ] `document` paste 리스너는 `focused === true` 인 pane 에서만 등록된다. 분할 2 pane 에서 이미지 붙여넣기 1회 → `saveAttachment` 호출 1회.
- [ ] `term.focus()` 는 `focused` 전환에서만, fit + PTY resize 는 `visible` 전환에서만 일어난다.
- [ ] `TerminalPane` 이 `forwardRef` 로 `TerminalPaneHandle{ serialize, focus, fit }` 를 노출한다. `serialize()` 는 addon 미로드/미준비 시 `null` 을 반환하고 throw 하지 않는다.
- [ ] 기존 `TerminalPane.test.tsx` / `TerminalView.test.tsx` / `MentionAgentView.test.tsx` 가 **수정 없이** 통과한다.

### B-4
- [ ] `splitTree.ts` 순수 함수 — `splitLeaf` / `closeLeaf`(형제 승격) / `findLeafPath` / `collectLeafIds` / `setRatioAtPath` / `quantizeRatio` / `equalizeRatios` / `neighborLeaf` / `isValidTree` 각각에 단위 테스트.
- [ ] 트리 타입은 **이진**(`{type:'split', direction, first, second, ratio?}`). leaf 는 `{type:'leaf', leafId}` 만 갖고 **sessionId 를 담지 않는다**.
- [ ] `ratio` 는 0.5±0.005 면 저장에서 생략되고, 그 외에는 소수 3자리로 양자화된다.
- [ ] xterm 인스턴스는 트리 밖 `Map<leafId, …>` 에 있고, leaf 슬롯은 **빈 div + effect attach** 다. 3분할 → 가운데 pane 닫기 → 남은 두 pane 의 스크롤백이 그대로다(회귀 테스트).
- [ ] 리사이즈 핸들: 투명 히트박스(≥8px) + `::after` 시각선, `setPointerCapture` + window 리스너 이중화, rAF 코얼레싱, **드래그 중 PTY resize 0회 / 드롭 시 1회**, 더블클릭 50/50, 적응형 최소폭 `Math.min(MIN_PANE_PX, total/2)`.
- [ ] ⌘D / ⌘⇧D / ⌥⌘←↑↓→ / ⌘W / ⌘T 가 **터미널 뷰가 활성일 때만** 동작한다(다른 뷰에서 ⌘W 로 PTY 가 죽지 않는다).
- [ ] 붙여넣기 타겟 4중 재검증(`tabId`+`leafId`+`sessionId`+`generation`). 비동기 클립보드 read 도중 포커스가 바뀌면 폐기 + `console.warn`.
- [ ] 탭 라벨에 pane 수 배지가 뜬다(2 이상일 때, 목업 `.panecnt`).
- [ ] 복원 중에는 `shouldPersistLayout === false` 라 레이아웃 변경이 저장을 트리거하지 않는다.

### B-5
- [ ] `@xterm/addon-serialize` 도입. store 키 `terminalWorkspaceV2`, 스키마 `TerminalWorkspaceSnapshotV2{ version, savedAt, activeTabId, tabs[{ tabId, name, tree, focusedLeafId, panes }] }` 가 `src/shared/types/terminal.ts` 에 정의된다.
- [ ] 채널 3개 — `TERMINAL_SAVE_STATE`(invoke) / `TERMINAL_RESTORE_STATE`(invoke) / `TERMINAL_REQUEST_STATE`(push, **handle 등록 금지**).
- [ ] 저장 트리거 4종이 동작한다: 구조 변경 1초 debounce · 30초 autosave(**렌더러**) · `beforeunload` fire-and-forget · main `before-quit` 핸드셰이크.
- [ ] `before-quit` 이 최초 1회 `preventDefault()` → `TERMINAL_REQUEST_STATE` → **700ms 타임아웃** → (도착분 or 메모리 캐시) 저장 → `app.quit()` 재호출. 두 번째 `before-quit` 에서는 대기하지 않는다.
- [ ] **빈 스냅샷이 기존 스냅샷을 덮어쓰지 않는다** — `shouldPersistSnapshot(incoming, existing, source)` 순수 함수. `source: 'cache'` 이고 incoming 이 비었으면 저장 스킵 + warn.
- [ ] main 의 30초 `setInterval`(:1877-1883), `before-quit` 의 `exportSessions` 저장(:1892-1898), rename 즉시 저장(:864-874)이 제거되고 `TerminalManager.exportSessions` / `sanitizeForRestore` / `reorder` / `sessionOrder.ts` 및 `TERMINAL_RESTORE` / `TERMINAL_REORDER` 채널이 삭제된다(소비자 0).
- [ ] `window-all-closed` 의 `dispose()` 는 유지하되, 저장 경로가 live PTY 에 의존하지 않는다는 것이 테스트로 고정된다.
- [ ] 최초 실행 시 `terminalSessions`(legacy) → v2 스냅샷 마이그레이션 1회. `migrateLegacySessions()` 순수 함수 + 테스트. legacy 키는 삭제하지 않는다(다운그레이드 안전).
- [ ] **복원 순서**: `unicode provider 활성화 → open → resize(스냅샷 치수) → clear → write(스냅샷) → write 콜백 대기 → POST_REPLAY_MODE_RESET + '\r\n' → replay guard 해제 → fit → PTY resize → 큐잉 출력 flush`. 이 순서가 코드 주석과 테스트에 명시된다.
- [ ] `serializeWithAbsoluteCursor` 로 wrap-pending 커서 어긋남이 없다.
- [ ] replay 중 xterm 이 만든 `onData`(DA1/CPR 자동 응답)가 PTY 로 나가지 않는다.
- [ ] serialize 옵션 `{ scrollback: 2000, excludeAltBuffer: true }`.
- [ ] 용량 캡은 **UTF-8 바이트** 기준(`.length` 아님). `trimSerializedToBytes` 는 secant 보간 최대 4 probe.
- [ ] 복원 탭 상한 20, leaf 총합 상한 40. 초과분은 오래된 탭부터 버리고 `console.warn`.

### B-6
- [ ] `shouldAttachWebgl({ setting, isVisible, globalFailureLatch, paneLossCount, deferred })` 순수 함수 + 테스트. 5조건 중 하나라도 어긋나면 false.
- [ ] 게이트 미통과 시 **dispose 를 호출**한다(참조에 null 대입만 하지 않는다 — stale frame 방지).
- [ ] dispose 경로에서 `WEBGL_lose_context.loseContext()` 명시 호출 + canvas 0×0.
- [ ] context loss 발생 시 즉시 DOM 폴백하고 **같은 가시성 구간에서 재시도하지 않는다**. reveal/wake 경계에서만 pane 래치가 풀린다. 모듈 전역 실패 래치는 앱 수명 동안 유지된다.
- [ ] 설정 `terminalRenderer: 'webgl' | 'dom'` 이 기존 `settings.get/set` 으로 저장된다(**신규 IPC 채널 0개**). 즉시 반영되고 재시작 후에도 유지된다.
- [ ] DOM 리페어런트(분할/이동) 전후로 `dispose → rAF → attach` + scrollState 캡처/복원 + rAF 내 fit.
- [ ] 데드 코드 `TerminalTabs.tsx` 삭제(참조 0 확인 완료).

### B-7
- [ ] `registerLinkProvider` guard monkey-patch 가 `new Terminal()` 직후 · `loadAddon` **전**에 적용된다. provider 가 동기 throw 해도 터미널이 산다(테스트: 일부러 throw 하는 provider 등록).
- [ ] URL 은 `@xterm/addon-web-links`(URL 전용), 파일 경로는 자체 provider. 두 provider 의 범위가 겹치지 않는다.
- [ ] 경로 정규식이 VSCode 포팅본이다 — 구분자 필수 패턴 + 공백 경로 3-pass + bare filename(존재 검증 필수) + `Makefile`/`Dockerfile` 등 무확장자 화이트리스트. **확장자 화이트리스트 방식 폐기**.
- [ ] soft wrap(`isWrapped` 추적, 상한 200행/20k자) **과** hard wrap(역스캔 최대 20행 + 조각 판정) 둘 다 재구성한다. 셀↔문자열 인덱스 매핑은 **셀 단위 폴백**으로 구한다(`outColumns` 미사용).
- [ ] `line:col` 접미 파싱: `line < 1` / `col < 1` 거부, bare root(`/`, `C:/`) 거부.
- [ ] 존재 검증 채널 `TERMINAL_RESOLVE_PATH`(invoke, **배치**) + 렌더러 LRU 1024. 검증 완료 시점에 라인 fingerprint 를 재확인해 버퍼가 바뀌었으면 결과를 폐기한다.
- [ ] cwd 우선순위: OSC 7 수신값 → 세션 spawn cwd → (POSIX 한정) main 의 pid cwd probe(TTL 3초, 단일 비행, 실패 무시).
- [ ] 겹치는 후보는 텍스트 길이 내림차순 → 비중첩 최장만 남긴다.
- [ ] Cmd+클릭 3버그 모듈 이식: click-priming(정지 커서 밑 새 링크 첫 클릭 씹힘) / pty-mouse-suppression(마우스 aware TUI 이중 열림) / activate 시 `clearSelection()`.
- [ ] `terminal-unicode-provider` 가 `terminal.open()` **직후, 모든 write 전**에 활성화된다.
- [ ] 사용자 실패 사례 픽스처가 `__fixtures__` 로 남고 회귀 테스트가 이를 소비한다.

### 공통 / 마감
- [ ] 루트 `THIRD-PARTY-NOTICES.md` 신설. Orca(Lovecast Inc.) / VSCode(Microsoft) / dnd-kit / xterm addons 항목 + MIT 전문. 이식 파일 표(로컬 경로 ↔ 원본 경로 ↔ verbatim|adapted).
- [ ] 이식 파일 상단에 고지 주석 블록. VSCode 파생 2파일은 **이중 고지**.
- [ ] `src/main/index.test.ts` 채널 계약 갱신: `TERMINAL_REQUEST_STATE` 를 `eventOnly` 에 추가, `TERMINAL_SAVE_STATE`/`TERMINAL_RESTORE_STATE`/`TERMINAL_RESOLVE_PATH` 가 `handle` 로 등록됨을 단언, 삭제된 `TERMINAL_RESTORE`/`TERMINAL_REORDER` 관련 단언 정리.
- [ ] `test/helpers/mockWindowApi.ts` 갱신(신규 3 API 추가, `restoreSaved`/`reorder` 제거).
- [ ] `npx tsc --noEmit -p tsconfig.web.json` / `-p tsconfig.node.json` 통과, `npm run test:run` 전체 통과, 커버리지 라인 70% 유지, `npm run build` 통과.
- [ ] `ClaudeManual.tsx` `SECTIONS` 에 split · 영속화 · 렌더러 토글 · 경로 클릭이 한국어로 추가되고 단축키 표가 갱신된다.
- [ ] `CHANGELOG.md` 항목 추가.

## 영향 도메인

- **terminal** (주) — `TerminalPane` / `TerminalView` / `TerminalManager` / 신규 split·스냅샷·링크 모듈
- **electron-ipc** — 신규 4채널(`TERMINAL_SAVE_STATE`, `TERMINAL_RESTORE_STATE`, `TERMINAL_REQUEST_STATE`, `TERMINAL_RESOLVE_PATH`), 삭제 2채널(`TERMINAL_RESTORE`, `TERMINAL_REORDER`)
- **renderer-only** — split 레이아웃, 단축키, 설정 토글, 매뉴얼
- **ai-service 무관** → **Windows/Mac 분기 검토 대상 아님**. `AIService.runClaudeStream` 근처를 건드리지 않는다. 단 `TerminalManager` 자체에 플랫폼 분기(`enrichedTerminalPath`, 셸 선택, `LANG` 강제)가 있으므로 **그 블록을 건드리지 않았음**을 impl-log 에 명시한다. B-7 의 pid cwd probe 는 신규 플랫폼 분기이므로 `darwin`/`linux`/`win32` 3케이스를 테스트에 명시한다.

## 리스크 / 제약

- **R1. 순서 의존이 강하다** — B-4 는 B-3 없이는 애초에 성립하지 않고(visible≠focused), B-5 는 B-4 의 트리 모양이 확정돼야 스키마를 못 박을 수 있으며, B-6 는 B-4 의 리페어런트 지점을 알아야 dispose/attach 를 걸 수 있다. → plan 을 **단계 게이트**로 구성하고 각 게이트에 "다음 단계 착수 조건"을 명시한다. 커밋도 단계별 분리.
- **R2. B-5 가 main 의 종료 경로를 바꾼다** — `before-quit` 에 `preventDefault` 를 넣는 것은 앱이 안 죽는 사고로 직결될 수 있다. → `quitFlushDone` 플래그로 **정확히 1회만** 지연, 700ms 하드 타임아웃, 창이 없으면 즉시 캐시 경로. 타이머는 `setTimeout` 1개, 응답 도착 시 `clearTimeout`. fake timer 테스트로 "응답 없음 → 700ms 후 quit" 과 "응답 도착 → 즉시 quit" 양쪽 고정.
- **R3. p1 산출물의 제약 승계** — `TERMINAL_EXIT` 에 `ipcMain.handle` 을 **절대 추가하지 않는다**(`src/main/index.test.ts` 의 event-only 게이트가 즉시 실패). `TERMINAL_REQUEST_STATE` 도 같은 부류이므로 같은 배열에 등록한다.
- **R4. React 재조정이 xterm 을 죽인다 (함정 #8)** — split 트리를 그냥 재귀 JSX 로 그리면 리마운트로 버퍼/PTY 바인딩이 날아간다. → xterm 은 트리 밖 Map + `createPortal` 로 안정된 부모에서 렌더하고, leaf 슬롯은 컨테이너 div 를 `appendChild` 만 한다(ADR-02). 회귀 테스트: "3분할 → 가운데 닫기 → 남은 pane 의 write 내용 보존".
- **R5. WebGL 컨텍스트 예산 (함정 #4)** — hidden pane 이 컨텍스트를 쥐고 있으면 visible pane 이 백지가 된다. → visible-only + `loseContext()` 명시. 수동 QA 에 "17 pane" 시나리오 포함.
- **R6. 복원 품질 함정 3종 (#1/#2/#3)** — fit 선행 시 soft-wrap 재랩, replay 시 자동 쿼리 응답 유출, 상대 커서 1칸 어긋남. → 세 가지 모두 ADR-03 에 순서/모듈로 못 박고, 복원 순서는 상수 배열 + 주석으로 코드에 남긴다.
- **R7. 존재 검증 IPC 폭주 (함정 #6)** — hover 마다 provideLinks 가 불린다. → 렌더러 LRU 1024 + 배치 invoke + fingerprint 재검증. 캐시 히트율을 개발 중 `console.debug` 로 1회 확인하고 impl-log 에 기록.
- **R8. 스냅샷이 electron-store 를 비대하게 만든다** — store 는 앱 시작 시 전체 로드된다. → leaf 512KB / 총 8MB 캡 + serialize `scrollback: 2000`. 실제 파일 크기를 수동 QA 에서 측정해 impl-log 에 기록.
- **R9. 서드파티 이식의 라이선스 리스크** — verbatim 복사인데 고지가 없으면 MIT 위반. → ADR-06 의 절차를 **파일 생성과 같은 커밋**에서 수행한다. `THIRD-PARTY-NOTICES.md` 없이 이식 파일이 먼저 들어가는 커밋을 만들지 않는다.
- **R10. xterm 5.5 ↔ addon 버전 짝** — `@xterm/addon-serialize` / `addon-webgl` / `addon-web-links` 의 peerDependency 가 `@xterm/xterm@^5.5` 를 만족해야 한다. → 설치 직후 `npm ls @xterm/xterm` 으로 중복 설치가 없는지 확인하고 버전을 impl-log 에 기록. peer 불일치면 **버전을 내려 맞춘다**(xterm 을 올리지 않는다 — 6.x 는 breaking).
- **R11. 다른 트랙과의 `src/main/index.ts` 충돌** — A-1~A-4(Windows 수복)와 C-1/C-2(워크스페이스)가 같은 파일을 만진다. → 본 트랙의 index.ts 변경은 ①Terminal 핸들러 블록(:843-874) ②앱 라이프사이클 블록(:1877-1908) 두 군데로 **국소화**하고, 새 핸들러는 기존 Terminal 블록 안에 모은다.
- **R12. `TERMINAL_REORDER` 삭제가 p1 을 되돌리는 것처럼 보인다** — ADR-v2-terminal-p1-05 가 "B-5 가 supersede 예정"을 이미 명시했다. → ADR-03 의 frontmatter 에 `supersedes: ["ADR-v2-terminal-p1-05"]` 를 적고, CHANGELOG 에는 "순서가 이제 완전히 저장됩니다"로만 쓴다(내부 채널 삭제는 사용자 문서에 쓰지 않는다).
- **제약 C1** — `TerminalManager` 의 spawn/플랫폼 분기(`enrichedTerminalPath`, 셸 선택, `LANG`/`LC_ALL`/`LC_CTYPE`)를 건드리지 않는다(A-2 소관).
- **제약 C2** — `AIService` / `ClaudeChatService` / 멘션 파이프라인 파일 수정 금지. `MentionTerminalSpawner` 가 쓰는 `listSessions()` 는 유지한다.
- **제약 C3** — 작업과 무관한 리팩터·포맷팅 금지. `TerminalPane` 에서 건드리는 것은 activation/링크/렌더러/복원 경로뿐이며, 이미지 사이드바·키 핸들러 테이블은 그대로 둔다.
- **제약 C4** — `BranchWorkspace` / `MentionAgentView` / 그 테스트 파일은 **수정하지 않는다**(B-3 의 무회귀 증거).

## 참조

- 마스터 설계: `~/.claude/plans/toasty-sleeping-simon.md` — Workstream B (B-3 ~ B-7), 작업 순서 Phase 2
- `docs/dev/orca-absorption-notes.md` — §0(스택 차이/베타 API), §1(링크 5중 레이어), §3(영속화 교정 3건), §4(WebGL 보강), §5(split/탭 설계 교정), §7(unicode provider), §9(함정 12개)
- 선행 산출물: `feature/terminal/v2-terminal-p1/{prd,plan,impl-log}.md`, `adr.md`, `adr-02-exit-ui.md`, `adr-03-search.md`, `adr-04-tab-dnd.md`, `adr-05-tab-order-persistence.md`
- UI 목업: `docs/mockups/v2/terminal-split.html` — `.pane`/`.handle`/`.panecnt`/렌더러 드롭다운 + 하단 구현 매핑 노트 1)~6)
- `.agent/wiki/domain-terminal.md`, `.agent/wiki/domain-electron-ipc.md`, `.agent/wiki/decisions-log.md`
- 현행 코드: `src/renderer/src/components/Terminal/{TerminalPane,TerminalView,TerminalTabs}.tsx`, `src/main/terminal/{TerminalManager,sessionOrder}.ts`, `src/main/index.ts:843-874,1877-1908`, `src/preload/index.ts:6-40,380-416`, `src/shared/types/{ipc,terminal}.ts`
- ADR: `adr.md`(01) · `adr-02-split-tree.md` · `adr-03-persistence-v2.md` · `adr-04-webgl.md` · `adr-05-link-provider.md` · `adr-06-third-party-notices.md`
</content>
</invoke>
