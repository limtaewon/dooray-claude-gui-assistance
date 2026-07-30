---
id: ADR-v2-terminal-p1-01
title: PTY 종료 통지는 main 소유 push 채널(TERMINAL_EXIT) — suppression·at-most-once 도 main 에서 판정
status: proposed
date: 2026-07-30
supersedes: []
domain: terminal, electron-ipc
---

# PTY 종료 통지는 main 소유 push 채널(TERMINAL_EXIT) — suppression·at-most-once 도 main 에서 판정

> 본 task 의 ADR 목록
> - **ADR-v2-terminal-p1-01** (이 문서) — TERMINAL_EXIT 채널 + main 소유 방송
> - [ADR-v2-terminal-p1-02](adr-02-exit-ui.md) — 종료 UI 소유권 (호스트 뷰 vs TerminalPane)
> - [ADR-v2-terminal-p1-03](adr-03-search.md) — 검색 3분할 + safeFind
> - [ADR-v2-terminal-p1-04](adr-04-tab-dnd.md) — 탭 reorder 는 @dnd-kit
> - [ADR-v2-terminal-p1-05](adr-05-tab-order-persistence.md) — 탭 순서 영속화 경로 (B-5 가 supersede 예정)

## 컨텍스트

`TerminalManager.create()` 의 `onExit` 은 `this.sessions.delete(id)` 만 한다(`src/main/terminal/TerminalManager.ts:150-152`). 렌더러는 PTY 가 죽었다는 사실을 알 방법이 없다:

- `terminal.input()` 은 `sessions.get(id)` 가 없으면 조용히 no-op → 사용자는 "타이핑이 안 먹는다"만 경험한다(silent failure).
- `terminal.list()` 를 폴링하면 알 수는 있지만 exit code 를 얻을 수 없고 지연이 생긴다.
- `addOutputListener()` 는 등록만 되고 `onData` 에서 호출되지 않는 **죽은 훅**이다(`:84,91-94` ↔ `:138-148`). 현재 소비자는 0이지만 `.agent/wiki/domain-terminal.md` 는 이 훅이 멘션 종료 마커 감지에 쓰인다고 기술하고 있고, 후속 B-5(스냅샷 트리거)·C-2(AgentRunSpawner)가 이를 전제한다.

또한 종료 통지가 생기면 **"의도적 종료"** 를 구분해야 한다. 사용자가 탭을 닫거나(`kill`) 앱이 종료될 때(`dispose`) 종료 오버레이가 번쩍이면 노이즈다. Orca 도 같은 문제를 겪고 "suppressed exit(의도적 종료 시 exit 무시 예약)" + "ptyId 스코프 at-most-once 가드"로 해결했다(`docs/dev/orca-absorption-notes.md` §5).

이 판정을 어디서 하느냐가 결정 포인트다. 렌더러는 **자기가 누른 닫기**만 알고, `window-all-closed → terminalManager.dispose()`(`src/main/index.ts:2003-2005`) 처럼 main 이 단독으로 죽이는 경로는 모른다. 게다가 종료를 구독하는 호스트가 3곳(TerminalView / MentionAgentView / BranchWorkspace)이라 렌더러에 두면 같은 억제 로직이 3벌 복제된다.

## 결정

**PTY 라이프사이클 이벤트의 단일 방송점을 `TerminalManager` 로 못박고, exit 은 main→renderer push 채널로 내보낸다.**

1. **채널** — `IPC_CHANNELS.TERMINAL_EXIT = 'terminal:exit'` 신설. `TERMINAL_OUTPUT` 과 같은 **push 전용**(`webContents.send`)이므로 `ipcMain.handle` 등록은 **하지 않는다** → `src/main/index.ts` 변경 0줄.
2. **payload** — `TerminalExitPayload { id: string; exitCode: number; signal: number | null }` 을 `src/shared/types/terminal.ts` 에 정의. `signal` 은 `undefined` 대신 **`null`** (IPC 구조적 클론에서 `undefined` 는 소실 — `.agent/wiki/domain-electron-ipc.md` 함정).
3. **suppression** — `kill(id)` 는 **세션이 실제로 존재할 때만** `suppressedExitIds` 에 id 를 예약한 뒤 `pty.kill()` 을 호출한다. `dispose()` 는 `kill()` 을 경유하므로 자동으로 억제된다. `onExit` 은 예약을 소비(`delete`)하고 통지를 생략한다. 예약은 **소비되거나 세션이 사라질 때 반드시 제거**되어 누수되지 않는다.
4. **at-most-once** — 세션 생성 클로저의 `exitHandled` 플래그로 같은 PTY 의 두 번째 `onExit` 을 무시한다. 통지 대상은 `webContents.send` 와 `exitListeners` 양쪽 동일 payload.
5. **main 내부 구독** — `addExitListener(cb): () => void` 를 `addOutputListener` 와 대칭으로 제공(후속 C-2 가 사용).
6. **죽은 훅 수리** — `onData` 에서 `outputListeners` 를 실제로 호출한다. 순서는 `버퍼 적재 → webContents.send → 리스너 fan-out`. 각 리스너는 **개별 try/catch** 로 격리하고 실패 시 `console.warn('[TerminalManager] output listener 실패', { sessionId })` (전역 CLAUDE.md §4·§5 — silent failure 금지, 식별자 포함).
7. **preload** — `window.api.terminal.onExit(cb)` 는 `TERMINAL_OUTPUT` 과 동일하게 **단일 `ipcRenderer.on` 공유 fan-out** 으로 노출하고 unsubscribe 함수를 반환한다(`src/preload/index.ts:6-21` 패턴 재사용).

## 대안과 기각 이유

1. **렌더러 폴링(`terminal.list()` 주기 diff)** — *기각*: exit code·signal 을 못 얻어 오버레이 문구("exit 1")를 만들 수 없다. 폴링 주기만큼 사용자가 죽은 탭에 타이핑한다. 탭 수 × 주기만큼 IPC 낭비.
2. **invoke 형 조회 채널(`terminal:exit-status`)만 제공** — *기각*: 렌더러가 "언제" 물어볼지 알 수 없어 결국 폴링이 된다. push 가 있는데 pull 을 얹을 이유가 없다.
3. **suppression 을 렌더러가 판정(닫기 누른 id 를 무시)** — *기각*: (a) `dispose()`·`window-all-closed` 같이 main 단독 종료 경로를 렌더러가 알 수 없다. (b) 억제 로직이 호스트 3곳에 복제된다. (c) 탭이 이미 언마운트된 뒤 도착한 이벤트를 누가 무시할지 애매해진다.
4. **`onExit` 을 현행 유지하고 렌더러가 출력 정지로 추론** — *기각*: 셸이 조용한 것과 죽은 것을 구별할 수 없다. Orca 가 상태 필드 없이 휴리스틱으로 가다 부채가 된 지점(§5 "우리 계획이 Orca 보다 낫다").
5. **죽은 `addOutputListener` 를 그냥 삭제** — *기각*: B-5/C-2 가 필요로 하고 wiki 가 이미 존재를 문서화. 문서-구현 불일치는 삭제가 아니라 수리로 해소하는 게 비용이 낮다(소비자 0이라 회귀 위험도 0).
6. **exit 시 main 이 세션 메타를 남겨 `list()` 에 "exited" 로 노출** — *기각*: `sessions` 맵이 죽은 세션의 무덤이 되어 `exportSessions`/`getOutput`/`kill` 전부에 살아있음 검사가 번진다. 종료 상태의 수명은 UI 관심사(→ ADR-02).

## 결과 (Consequences)

### 긍정
- 죽은 탭 버그가 사용자 눈에 보이는 상태로 전환된다(exit code 포함).
- `src/main/index.ts` **무변경** — A-2/A-4/C-0 트랙과 머지 충돌 0.
- 의도적 종료 판정이 한 곳(TerminalManager)에만 있어 호스트가 늘어도 복제되지 않는다.
- `addExitListener`/`addOutputListener` 대칭 확보 → C-2 AgentRunSpawner 가 채널 결합 없이 붙을 수 있다.

### 부정 / 트레이드오프
- `kill()` 이 "억제 예약"이라는 부수효과를 갖는다. **kill 이외 경로로 세션을 지우면 예약이 남는다** → 세션 존재 검사로 방어하고 테스트로 고정.
- 외부에서 `pty.kill()` 이 아닌 OS 시그널로 죽인 경우는 억제되지 않는다(정상 — 사용자에겐 예기치 않은 종료이므로 오버레이가 맞다).
- `outputListeners` 활성화로 청크마다 함수 호출이 1회 추가된다. 소비자 0일 때 비용은 `Set` 순회 1회로 무시 가능.

### 모니터링
- vitest: exit 방송 1회 / kill·dispose 억제 / at-most-once / 억제 예약 누수 없음 / 리스너 throw 격리 — `TerminalManager.test.ts` 에 케이스로 고정.
- `src/main/index.test.ts` 의 `eventOnly` 목록에 `TERMINAL_EXIT` 를 넣어 **실수로 `ipcMain.handle` 등록되면 실패**하게 만든다(채널 성격 회귀 게이트).
- 수동: 탭에서 `exit` 입력 → 오버레이 / 탭 X 로 닫기 → 오버레이 없음 / 앱 종료 후 재시작 → 잔여 오버레이 없음.
