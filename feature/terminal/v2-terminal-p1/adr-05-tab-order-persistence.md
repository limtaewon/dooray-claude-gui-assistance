---
id: ADR-v2-terminal-p1-05
title: 탭 순서 영속화는 TERMINAL_REORDER 로 main 세션 Map 순서를 갱신 — B-5 스냅샷이 supersede 예정
status: proposed
date: 2026-07-30
supersedes: []
domain: terminal, electron-ipc
---

# 탭 순서 영속화는 TERMINAL_REORDER 로 main 세션 Map 순서를 갱신 — B-5 스냅샷이 supersede 예정

## 컨텍스트

[ADR-04](adr-04-tab-dnd.md) 로 탭 순서를 바꿀 수 있게 되지만, 재시작하면 순서가 초기화된다. 현행 복원 경로:

```
main:  store('terminalSessions') ← terminalManager.exportSessions()   // Map 삽입 순서 = 생성 순서
       (30초 interval index.ts:1981-1986 / before-quit :1996-2001 / rename 시 즉시 :967-977)
renderer: restoreSaved() → slice(-5) → 순서대로 create() → 그 순서로 탭 배치
```

즉 **복원 순서의 진실은 main 의 `sessions` Map 삽입 순서**다. 렌더러가 아무리 배열을 재배치해도 main 은 모른다.

여기서 중요한 제약이 하나 더 있다: **복원 시 세션 id 는 새로 발급된다**(`create()` → `randomUUID`). 렌더러가 id 목록을 어딘가에 저장해도 재시작 후에는 매칭할 대상이 없다.

한편 B-5(스크롤백 영속화 v2)가 이 저장 경로 전체를 `terminalWorkspaceV2` 스냅샷으로 교체할 예정이다(Phase 2). 지금 큰 구조를 만들면 두 번 버린다.

## 결정

**fire-and-forget 채널 `TERMINAL_REORDER` 하나를 추가해, 렌더러의 탭 순서를 main 의 세션 Map 순서에 그대로 반영한다. 이 결정은 B-5 가 supersede 하는 것을 전제로 한 잠정 조치다.**

1. `IPC_CHANNELS.TERMINAL_REORDER = 'terminal:reorder'`. preload 는 `terminal.reorder(ids: string[]): void` 로 `ipcRenderer.send` (invoke 아님 — 응답이 필요 없고 드래그 종료 경로를 블로킹하지 않는다).
2. `src/main/index.ts` 에 `ipcMain.on(IPC_CHANNELS.TERMINAL_REORDER, (_, ids: string[]) => terminalManager.reorder(ids))` **1건만** 추가한다. 삽입 위치는 `TERMINAL_RESIZE` 등록 직후(≈ :958) — A-2 가 만지는 `CLAUDE_START_TASK`(:983-995) 와 라인 거리를 벌려 머지 충돌을 피한다.
3. `TerminalManager.reorder(ids)` 는 `sessions` Map 을 새 순서로 재구성한다. 판정은 순수 함수 `applySessionOrder(currentIds, desiredIds): string[]` — **존재하는 id 만** 요청 순서대로, 요청에 없는 나머지는 기존 상대 순서를 유지해 뒤에 붙인다. 모르는 id 는 무시.
4. 호출 시점은 **드래그 종료(순서가 실제로 바뀐 경우) 1회**. 생성/닫기는 main 이 이미 같은 순서로 처리하므로 호출하지 않는다.
5. 저장 시점은 **현행 그대로**(30초 autosave · before-quit · rename 즉시 저장)에 위임한다. 즉 순서의 영속 신뢰도는 **이름 영속화와 정확히 동일**하며, `window-all-closed → dispose()` 후 `before-quit` 이 빈 배열을 덮어쓰는 **기존 버그는 본 사이클에서 고치지 않는다**(B-5 소관).

## 대안과 기각 이유

1. **영속화 생략(세션 순서는 재시작 시 생성 순)** — *기각*: 탭을 오래 켜 두는 사용자가 매 재시작마다 다시 정렬해야 한다. 기능 가치의 절반이 날아간다.
2. **렌더러가 `settings` 에 순서를 저장(sidebarPrefs 선례)** — *기각*: 복원 시 세션 id 가 새로 발급되어 **id 기반 매칭이 원천적으로 불가능**하다. `name + cwd` 로 매칭하면 이름 중복·rename·같은 cwd 다중 탭에서 조용히 틀린다.
3. **B-5 스냅샷까지 대기** — *기각*: B-5 는 Phase 2 이고 serialize addon 도입·복원 안무·flush 프로토콜을 동반하는 큰 작업이다. Phase 1 의 사용자 가치를 한 사이클 미룰 이유가 없다. 대신 **supersede 를 명시**해 부채를 남기지 않는다.
4. **main 이 저장 시점에 렌더러에 순서를 물어보는 pull 채널** — *기각*: 30초 타이머와 `before-quit` 에서 렌더러 응답을 기다려야 한다. 그 순간 B-5 가 풀어야 할 문제(타임아웃·캐시 스냅샷)를 지금 끌고 오게 된다.
5. **`invoke` 로 만들어 성공 여부를 확인** — *기각*: 실패해도 렌더러가 할 수 있는 복구가 없고(순서는 이미 화면에 반영됨), 드래그 종료 경로에 await 를 넣을 이유가 없다. `TERMINAL_INPUT`/`TERMINAL_RESIZE` 와 같은 성격이므로 `ipcMain.on` 이 일관적.
6. **reorder 시 즉시 `store.set` 까지 수행(rename 처럼)** — *기각*: index.ts 에 store 접근 3줄이 더 붙는다. 순서는 이름보다 유실 비용이 낮고, 30초 autosave 로 충분하다. index.ts diff 최소화(다른 트랙 충돌 완화)가 우선.

## 결과 (Consequences)

### 긍정
- 렌더러의 순서와 main 의 저장 순서가 한 방향(renderer → main)으로만 흐른다. 양방향 동기화 없음.
- `applySessionOrder` 가 순수 함수라 "모르는 id / 누락 id / 중복 id" 를 테스트로 고정할 수 있다.
- `src/main/index.ts` 변경이 **3줄**로 끝난다(B-1 은 0줄) — A/C 트랙과의 충돌 면적 최소.

### 부정 / 트레이드오프
- **잠정 결정이다.** B-5 가 `terminalWorkspaceV2` 스냅샷을 도입하면 이 채널은 불필요해질 가능성이 높다 → B-5 의 ADR 은 `supersedes: ["ADR-v2-terminal-p1-05"]` 를 명시하고, 채널 제거 여부를 그때 판단한다.
- 순서 유실이 기존 버그(`window-all-closed` → 빈 export)를 그대로 물려받는다. 사용자 문서(매뉴얼/CHANGELOG)에서 순서 영속화를 **단정적으로 약속하지 않는다**.
- `sessions` Map 을 재구성하므로 순회 중 reorder 가 들어오면 순서가 흔들릴 수 있다 → main 은 단일 스레드이고 `reorder` 는 동기 완료라 실무상 문제 없음. 다만 `reorder` 안에서 다른 세션 API 를 호출하지 않는다.
- 복원 5개 제한(`TerminalView.tsx:24 slice(-5)`)은 그대로라, 탭이 6개 이상이면 앞쪽 탭은 순서와 무관하게 사라진다(B-5 에서 상한 20으로 완화).

### 모니터링
- vitest: `applySessionOrder` (정상 재배치 / 모르는 id 무시 / 누락 id 는 뒤에 원순서 유지 / 빈 배열 no-op), `reorder` 후 `listSessions()`·`exportSessions()` 순서 일치.
- `src/main/index.test.ts`: `TERMINAL_REORDER` 가 `ipcMain.on` 으로 등록되고 `ipcMain.handle` 에는 없음.
- 수동: 탭 3개 순서 변경 → 30초 대기 또는 rename 1회 → 앱 재시작 → 순서 유지 확인.
