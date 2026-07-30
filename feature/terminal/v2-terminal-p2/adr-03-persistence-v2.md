---
id: ADR-v2-terminal-p2-03
title: 스크롤백 영속화를 렌더러 serialize 스냅샷(terminalWorkspaceV2) + before-quit 핸드셰이크로 전환한다
status: proposed
date: 2026-07-30
supersedes: ["ADR-v2-terminal-p1-05"]
domain: terminal, electron-ipc
---

# 스크롤백 영속화를 렌더러 serialize 스냅샷(terminalWorkspaceV2) + before-quit 핸드셰이크로 전환한다

## 컨텍스트

### 소실 버그의 진짜 원인

현행 저장 경로는 세 개이고 전부 `terminalManager.exportSessions()`(live PTY 의 `outputBuffer`)를 읽는다.

| 위치 | 트리거 | 빈 배열 가드 |
|---|---|---|
| `src/main/index.ts:1877-1883` | 30초 `setInterval` | `length > 0` **있음** |
| `src/main/index.ts:864-874` | rename 즉시 저장 | `length > 0` **있음** |
| `src/main/index.ts:1892-1898` | `before-quit` | **없음** (`store.set('terminalSessions', sessions)`) |

그리고 `window-all-closed`(`:1900-1908`)가 **darwin 에서도** `terminalManager.dispose()` 를 호출한다. 즉 "창을 닫고 → 독에 남겨두고 → 나중에 ⌘Q" 라는 흔한 macOS 사용 경로에서:

```
window-all-closed → dispose() → sessions 0개
                 → (나중에) before-quit → exportSessions() = [] → store.set('terminalSessions', [])  ← 전멸
```

`dispose()` 를 darwin 에서 빼면 이번엔 창 없는 PTY 가 살아남고, 창을 다시 열면 렌더러는 완전히 새로 시작하므로 그 PTY 들에 다시 연결할 방법이 없다(고아 프로세스 누적). **live-PTY export 를 유지하는 한 이 결합은 풀리지 않는다.**

### 구조적으로 더 큰 문제

- B-4 split 이 들어오면 저장 단위가 "세션 배열" 이 아니라 **탭 · 트리 · pane** 이다. 현행 스키마로는 표현 불가.
- main 의 `outputBuffer` 는 ANSI 원문 5000 청크다. 복원 품질이 `sanitizeForRestore()` 휴리스틱(alt-screen exit 마지막 이후만 남기기)에 의존하고, 화면 상태(커서·SGR·스크롤 영역)는 재현되지 않는다.
- 복원 상한이 `TerminalView.tsx:52` 의 `slice(-5)` 로 5개다.

### Orca 가 알려준 복원 함정 3건 (`docs/dev/orca-absorption-notes.md` §3)

1. **fit 을 write 보다 먼저 하면 soft-wrap 행이 다른 컬럼 수로 재랩되어 깨진다**(#7279).
2. **`SerializeAddon` 은 커서를 상대 이동으로 복원**하므로 wrap-pending 상태에서 한 칸 어긋난다.
3. **replay 중 xterm 이 DA1/CPR 쿼리에 `onData` 로 자동 응답**해서, 그 바이트가 셸 프롬프트에 stray reply 로 찍힌다.

여기에 §7 의 함정 하나가 더 붙는다: **unicode provider 활성화가 복원 write 보다 늦으면** 폭 테이블이 write 시점 값으로 버퍼에 박혀 wide 문자가 `?` 로 깨진다(#4877).

## 결정

**진실의 원천을 렌더러 serialize 스냅샷으로 옮긴다. main 은 저장소와 종료 핸드셰이크만 담당한다.**

### 1. 스키마 — `src/shared/types/terminal.ts`

```ts
export interface TerminalPaneSnapshot {
  cwd?: string
  cols: number
  rows: number
  /** SerializeAddon 결과 + 절대 커서 접미. UTF-8 512KB 캡. */
  serialized: string
}
export interface TerminalTabSnapshot {
  tabId: string
  name: string
  tree: SplitNode
  focusedLeafId: string
  panes: Record<string /* leafId */, TerminalPaneSnapshot>
}
export interface TerminalWorkspaceSnapshotV2 {
  version: 2
  savedAt: number
  activeTabId: string | null
  tabs: TerminalTabSnapshot[]
}
```

store 키는 `terminalWorkspaceV2`. 기존 `terminalSessions` 는 **읽기 전용 레거시**가 된다.

### 2. IPC — 3채널 (3+1 규칙 준수)

| 채널 | 방식 | 설명 |
|---|---|---|
| `TERMINAL_SAVE_STATE` `'terminal:save-state'` | `invoke` | 렌더러 → main. store 쓰기 + **메모리 캐시 갱신**. `{ ok, bytes, skipped? }` 반환 |
| `TERMINAL_RESTORE_STATE` `'terminal:restore-state'` | `invoke` | main → 스냅샷 반환. 없으면 레거시 마이그레이션 1회 수행 후 반환 |
| `TERMINAL_REQUEST_STATE` `'terminal:request-state'` | **push** (`webContents.send`) | main → 렌더러 flush 요청. **`ipcMain.handle` 등록 금지** — `src/main/index.test.ts` 의 event-only 게이트에 추가한다 |

`TERMINAL_RESTORE`(`'terminal:restore'`) 와 `TERMINAL_REORDER`(`'terminal:reorder'`) 는 **삭제**한다. 전자는 v2 로 대체되고(마이그레이션은 main 이 store 를 직접 읽는다), 후자는 순서의 진실이 스냅샷의 `tabs` 배열로 단일화되면서 소비자가 0이 된다. 함께 죽는 것: `TerminalManager.exportSessions` / `sanitizeForRestore`(→ 마이그레이션 모듈로 **이사**) / `reorder` / `src/main/terminal/sessionOrder.ts` / preload 의 `restoreSaved`·`reorder`.

### 3. 저장 트리거 4종

1. **구조 변경 1초 debounce** (렌더러) — 탭 생성/닫기/rename/reorder, split/close pane, 활성 탭 변경.
2. **30초 autosave** (렌더러) — main 의 `setInterval`(`:1877-1883`)을 **삭제**하고 렌더러로 이관. 스크롤백은 렌더러에만 있으므로 타이머도 렌더러에 있어야 한다.
3. **`beforeunload` fire-and-forget** (렌더러) — 창이 닫힐 때 마지막 스냅샷. `invoke` 의 응답을 기다리지 않는다.
4. **`before-quit` 핸드셰이크** (main) — 아래 §4.

### 4. before-quit 핸드셰이크 (700ms)

```
app.on('before-quit', (e) => {
  if (quitFlushDone) return                    // 2회차는 그냥 통과
  if (!hasLiveWindow()) { persistCache(); quitFlushDone = true; return }
  e.preventDefault()
  send(TERMINAL_REQUEST_STATE)
  timer = setTimeout(finish, 700)              // 타임아웃 → 캐시로 저장
  // SAVE_STATE 도착 시 clearTimeout(timer) → finish()
  function finish() { persistLatest(); quitFlushDone = true; app.quit() }
})
```

- `preventDefault` 는 **정확히 1회**. `quitFlushDone` 이 재진입을 막는다.
- 창이 이미 없으면(= darwin 에서 창 닫고 나중에 ⌘Q) 대기 없이 **메모리 캐시**를 저장한다. 캐시는 `beforeunload` fire-and-forget 이 채워 놓은 값이다.
- 타이머는 하나. 응답 도착 시 `clearTimeout`.

### 5. 빈 스냅샷 덮어쓰기 금지 — `shouldPersistSnapshot`

`src/main/terminal/snapshotStore.ts` 의 순수 함수:

```ts
/** 빈 스냅샷이 기존 저장분을 지우는 것을 막는다. 렌더러가 보낸 값은 사용자의 진짜 상태이므로 항상 허용. */
export function shouldPersistSnapshot(
  incoming: TerminalWorkspaceSnapshotV2 | null,
  existing: TerminalWorkspaceSnapshotV2 | null,
  source: 'renderer' | 'cache'
): boolean
```

- `source: 'renderer'` → 항상 `true`(사용자가 탭을 전부 닫았으면 빈 스냅샷이 정답이다).
- `source: 'cache'` → incoming 이 없거나 `tabs.length === 0` 인데 existing 에 탭이 있으면 `false` + `console.warn`.

이 한 함수가 원래 버그의 재발을 구조적으로 막는다.

### 6. `window-all-closed` 는 그대로 dispose 한다

darwin 에서도 `terminalManager.dispose()` 를 **유지**한다. 이유: 창이 없는 PTY 는 어차피 재연결 대상이 없다(렌더러가 새로 뜨면 새 세션을 만든다). 대신 저장 경로가 live PTY 를 더 이상 읽지 않으므로 **dispose 와 저장의 결합이 끊어진다**. 스크롤백은 그 직전 `beforeunload` 스냅샷으로 보존된다.

### 7. 복원 시퀀스 (순서가 곧 계약)

`POST_REPLAY_MODE_RESET` / `REPLAY_CLEAR` 등 상수를 모아 `src/renderer/src/components/Terminal/replay.ts` 에 두고, 아래 순서를 상수 주석으로 남긴다.

```
1. new Terminal({ cols: snap.cols, rows: snap.rows })
2. registerLinkProvider guard monkey-patch      (ADR-05, loadAddon 전)
3. loadAddon(fit / search / serialize / unicode11)
4. terminal.open(container)
5. unicode provider 활성화                      ← 모든 write 보다 먼저 (함정 #7)
6. onOutput 구독 시작 — replay 중 도착분은 큐에 적재
7. replayGuard.on()                             ← onData → PTY 송신 차단 (함정 #2)
8. terminal.resize(snap.cols, snap.rows)        ← fit 보다 먼저 (함정 #1)
9. write('\x1b[2J\x1b[3J\x1b[H')                 클리어
10. write(snap.serialized, callback)             파싱 완료를 콜백으로 대기
11. write(POST_REPLAY_MODE_RESET + '\r\n')       모드 리셋 + PROMPT_EOL_MARK 방지
12. replayGuard.off()
13. fit() → window.api.terminal.resize(fitted)
14. 큐잉된 라이브 출력 flush → 이후 직접 write
```

- **8→13 순서가 핵심**이다. fit 을 먼저 하면 soft-wrap 이 다른 컬럼 수로 재랩된다.
- 6 의 큐잉이 필요한 이유: PTY 는 이미 살아 있어 셸 프롬프트를 뱉는다. replay 중 도착한 청크를 그대로 write 하면 복원 내용과 뒤섞인다.
- 복원된 pane 의 PTY 는 **새 프로세스**다. 이전 프로세스는 이미 죽었고, 스냅샷은 과거 화면의 재현일 뿐이다. 따라서 SIGWINCH 강제 발신은 하지 않는다(새 셸이 13 의 resize 로 올바른 치수를 받는다).

### 8. `serializeWithAbsoluteCursor` (함정 #3)

`SerializeAddon.serialize()` 결과 뒤에 절대 CUP(`\x1b[{row};{col}H`)를 붙인다. Orca `terminal-serialize-absolute-cursor.ts` 의 로직을 이식(adapted, ADR-06 고지 대상). 커서 행은 `buffer.cursorY + 1`, 열은 `buffer.cursorX + 1` 을 스냅샷이 담은 뷰포트 기준으로 환산한다.

### 9. serialize 옵션 · 용량 캡

- 옵션: `{ scrollback: 2000, excludeAltBuffer: true }`. TUI 잔해를 스냅샷에서 배제한다(Orca 의 `?1049h` 마커 split 방식은 채택하지 않고, 품질 문제가 실제로 보이면 그때 전환).
- 캡: **UTF-8 바이트** 기준. leaf 당 512KB, 워크스페이스 총 8MB. 초과 시 leaf 별 head trim(오래된 출력부터) → 그래도 초과면 **활성 탭이 아닌 오래된 탭부터 제외** + `console.warn`.
- `trimSerializedToBytes(text, maxBytes)` 는 `src/shared/utils/textBytes.ts` 의 순수 함수. 이진 탐색 대신 **secant 보간 최대 4 probe**(문자열 길이 ↔ 바이트 수의 준선형성 이용)로 자른 뒤, 잘린 지점 앞의 개행까지 되감아 ANSI 시퀀스를 반토막 내지 않는다.
- 캡 적용은 **렌더러(전송 전)** 와 **main(저장 전)** 양쪽에서 한다. 렌더러는 줄 경계를 알고, main 은 store 비대화의 마지막 방어선이다.

### 10. 마이그레이션

`migrateLegacySessions(legacy): TerminalWorkspaceSnapshotV2` — `Array<{meta:{id,name,cwd}, output}>` → 세션 1개당 탭 1개(단일 leaf, 새 `leafId` UUID). `output` 은 이사해 온 `sanitizeForRestore()` 를 한 번 통과시킨 뒤 `serialized` 로 넣는다(`cols`/`rows` 는 모르므로 `0` 으로 두고, 복원 시 `cols===0` 이면 8번 resize 를 건너뛰고 fit 부터 한다).

- 실행 시점: `TERMINAL_RESTORE_STATE` 최초 호출에서 `terminalWorkspaceV2` 가 없고 `terminalSessions` 가 있을 때 **1회**.
- 레거시 키는 **삭제하지 않는다**(다운그레이드 안전). 대신 v2 를 쓰기 시작하면 레거시는 더 이상 갱신되지 않는다.

### 11. 상한

복원 탭 20개(현행 5 제한 제거), leaf 총합 40개. 초과분은 오래된 탭부터 버리고 `console.warn` 에 개수를 남긴다.

### 12. `shouldPersistLayout` 게이트 (함정 #10)

복원이 완료되기 전에는 어떤 저장 트리거도 발화하지 않는다. `restorePhase: 'idle' | 'restoring' | 'ready'` 를 `TerminalView` 가 들고, `'ready'` 가 아니면 debounce/autosave 를 즉시 반환한다. 미완성 트리가 자기 스냅샷을 덮어쓰는 사고를 막는다.

## 대안과 기각 이유

1. **main 에 `@xterm/headless` 미러 모델(Orca 의 주 경로)** — *기각*: main 프로세스에 pane 수만큼 xterm 인스턴스를 띄우고 모든 PTY 출력을 두 번 파싱해야 한다. Orca 는 모델-뷰 분리(창 여러 개, 뷰 없이도 살아있는 세션)를 위해 그 비용을 감수했지만, Clauday 는 단일 창·뷰 1개다. 메모리/CPU 비용 대비 이득이 없다.
2. **현행 raw `outputBuffer` 유지 + `window-all-closed` 만 수정** — *기각*: ①split 의 저장 단위 문제 미해결 ②`sanitizeForRestore` 휴리스틱 품질 한계 ③화면 상태(커서/SGR/스크롤 영역) 미재현. 가장 싼 수리이지만 B-4 와 함께 반드시 다시 깨진다.
3. **`before-quit` 에서 `ipcRenderer.sendSync` 로 동기 요청** — *기각*: 렌더러가 바쁘면 종료가 무한정 멈춘다. 700ms 하드 타임아웃 + 캐시 폴백이 최악을 유계로 만든다.
4. **`beforeunload` 만으로 충분하다고 보고 핸드셰이크 생략** — *기각*: darwin 은 창을 닫지 않고 ⌘Q 하는 경로가 흔하다. 그 경우 `beforeunload` 는 종료 시퀀스 중에 오거나 아예 늦는다. 반대로 핸드셰이크만 두면 창 닫기 경로의 캐시가 비어 버린다 — **둘 다** 필요하다.
5. **스냅샷을 별도 파일(`~/.clauday/terminal-snapshot.json`)로** — *기각*: `electron-store` 가 이미 atomic write 를 한다. 파일을 나누면 두 저장소의 정합성 관리가 생긴다. 대신 총 8MB 캡으로 store 비대화를 통제한다.
6. **`TERMINAL_REORDER` / `exportSessions` 를 호환을 위해 남기기** — *기각*: 소비자 0의 코드는 다음 사람에게 "여기가 순서의 진실인가?" 라는 오해를 판다(전역 CLAUDE.md §9). p1 ADR-05 가 이미 supersede 를 예고했다.
7. **탭 상한을 두지 않기** — *기각*: store 는 앱 시작 시 통째로 로드된다. 상한 없는 스냅샷은 부팅 지연으로 돌아온다.
8. **`excludeAltBuffer` 대신 Orca 의 `?1049h` 마커 split** — *기각(현 시점)*: 62줄 + alt 복원 안무가 붙는데, 우리는 TUI 화면 자체를 복원할 필요가 없다(복원된 PTY 는 새 셸이라 TUI 가 떠 있지도 않다). 품질 문제가 실측되면 그때 전환한다.
9. **복원 시 PTY 를 만들지 않고 "읽기 전용 죽은 탭" 으로 두기** — *기각*: 사용자는 재시작 후 바로 타이핑하려 한다. 죽은 탭은 p1 이 방금 없앤 문제다.

## 결과 (Consequences)

### 긍정
- "창 닫고 나중에 종료" 경로의 스크롤백 전멸이 **구조적으로** 사라진다(빈 배열을 쓸 코드 경로가 없다).
- 복원 품질이 raw ANSI 재생 → 화면 상태 재현으로 올라간다. 커서/색/스크롤 영역이 살아난다.
- split 트리가 그대로 저장·복원된다. 탭 상한 5 → 20.
- main 이 스크롤백을 들고 있을 이유가 사라져 `TerminalManager` 가 얇아진다(3함수 + 1모듈 삭제).
- 순서 영속화가 p1 의 "이름과 동일한 신뢰도" 에서 스냅샷 수준으로 올라간다(ADR-v2-terminal-p1-05 supersede).

### 부정 / 트레이드오프
- **렌더러가 죽으면 그 순간의 스냅샷을 잃는다**(최대 30초). 이전에는 main 이 버퍼를 들고 있어 렌더러 크래시에 강했다. 실사용에서 렌더러 크래시는 앱 재시작과 사실상 동의어라 수용한다.
- 종료가 최대 700ms 늦어진다. 사용자 체감은 거의 없지만, 종료 지연 버그 신고가 오면 여기가 1순위 용의자다.
- `store` 파일이 커진다(최대 8MB). 백업/동기화 도구를 쓰는 사용자에게는 눈에 띄는 변화다.
- `before-quit` 에 `preventDefault` 가 들어간다 — 재진입 플래그가 깨지면 **앱이 안 죽는다**. 이 한 곳이 이번 사이클 최고 위험 지점이다.
- 마이그레이션 후 legacy 키가 남아 store 에 죽은 데이터가 한동안 공존한다(의도된 다운그레이드 안전장치. v2.1 에서 제거 판단).
- `TERMINAL_RESTORE`/`TERMINAL_REORDER` 삭제는 breaking shared change 다 — preload·mock·index.test 를 같은 커밋에서 갱신해야 한다.

### 모니터링
- vitest(main) `snapshotStore.test.ts` — `shouldPersistSnapshot` 6케이스(renderer/cache × 빈/비빈 × existing 유무), `migrateLegacySessions`(0건/1건/N건/깨진 meta), 총 바이트 캡 초과 시 오래된 탭 제외.
- vitest(shared) `textBytes.test.ts` — `utf8ByteLength`(ASCII/한글/이모지/서로게이트), `trimSerializedToBytes`(정확 경계·4 probe 수렴·개행 되감기·이미 작은 입력은 그대로).
- vitest(main) `index.test.ts` — `TERMINAL_REQUEST_STATE` 가 `handle` 에 없음, `TERMINAL_SAVE_STATE`/`TERMINAL_RESTORE_STATE` 가 `handle` 에 있음, 삭제된 2채널 관련 단언 정리.
- vitest(main) before-quit 핸드셰이크 — fake timer 로 ①응답 없음 → 700ms 후 캐시 저장 + `app.quit()` 1회 ②응답 도착 → 즉시 저장 + 타이머 취소 ③2회차 `before-quit` 은 `preventDefault` 하지 않음 ④창 없음 → 즉시 캐시 경로.
- vitest(renderer) 복원 시퀀스 — mock terminal 의 호출 순서 배열이 `resize → clear → write → fit → PTY resize` 인지 단언. replay guard 활성 구간에 발생한 `onData` 가 `window.api.terminal.input` 을 호출하지 않는지.
- 수동 QA(순서대로): ①vim 열어두고 종료 → 재시작 → 화면 복원 ②탭 3개 + 2분할 → 창 닫기 → 잠시 후 ⌘Q → 재시작 → 전부 복원 ③한글/이모지 섞인 출력 복원 후 깨짐 없음 ④`terminalSessions` 만 있는 store 로 업그레이드 시나리오 ⑤`~/Library/Application Support/…/config.json` 파일 크기 측정 후 impl-log 기록.
</content>
