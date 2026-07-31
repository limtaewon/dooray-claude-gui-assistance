---
id: ADR-v2-terminal-p1-02
title: 종료 상태는 호스트 뷰가 소유하고 TerminalPane 은 optional exitInfo prop 만 렌더 — 자동 제거 없음
status: proposed
date: 2026-07-30
supersedes: []
domain: terminal, renderer-only
---

# 종료 상태는 호스트 뷰가 소유하고 TerminalPane 은 optional exitInfo prop 만 렌더 — 자동 제거 없음

## 컨텍스트

[ADR-01](adr.md) 로 `TERMINAL_EXIT` 가 렌더러에 도달한다. 이제 **누가 구독하고 누가 상태를 들고 있느냐**를 정해야 한다.

- `TerminalPane` 은 3곳에서 재사용된다: `TerminalView`(:163), `MentionAgentView`(:97), `BranchWorkspace`(:668).
- 세 호스트 모두 종료 사실을 **UI 로도** 써야 한다 — 탭 라벨 디밍/`종료됨` 배지, 닫기 정책(BranchWorkspace 는 워크트리 경로 기준 `closeTerminalTab(path)`), MentionAgentView 는 채널 세션 대응.
- B-3/B-4(split) 에서 pane 은 탭당 N개로 늘어난다. pane 마다 IPC 를 구독하면 구독 수가 pane 수만큼 증가한다.
- 현행 `TerminalPane` 은 680줄이고 mount effect 클로저 안에서 `onData`/`attachCustomKeyEventHandler` 를 등록한다. 여기서 최신 prop 을 읽으려면 ref 경유가 필요하다(클로저 stale 함정).

## 결정

**exit 상태의 소유자는 호스트 뷰. `TerminalPane` 은 상태를 갖지 않고 optional prop 으로 받은 것만 그린다.**

1. `TerminalPane` prop 에 **optional** 추가: `exitInfo?: { exitCode: number; signal: number | null } | null`, `onRequestClose?: () => void`. 기존 `sessionId` / `isActive` / `initialOutput` 시그니처는 **불변**(B-3 의 `isVisible`/`isFocused` 분리는 본 사이클에서 하지 않는다).
2. `exitInfo` 가 있으면 목업(`docs/mockups/v2/terminal-split.html` `.exit-overlay`)대로 오버레이를 그린다: `세션이 종료되었습니다 (exit N)` + exitCode 0 초록 / 그 외 빨강 dot + (`onRequestClose` 가 있을 때만) `닫기` 버튼.
3. **자동 제거하지 않는다.** 타이머로 사라지거나 탭이 스스로 닫히지 않는다. exit code 와 마지막 출력(스크롤백)은 사용자가 닫을 때까지 보존된다.
4. **입력 차단** — `exitInfoRef` 를 effect 로 동기화하고 (a) `terminal.onData` 에서 `terminal.input()` 송신 스킵, (b) `attachCustomKeyEventHandler` 의 제어문자 `send()` 스킵, (c) 파일 드롭/이미지 paste 경로 스킵. **xterm 은 dispose 하지 않는다** — 스크롤백 스크롤·선택·복사는 계속 가능해야 한다.
5. **구독은 호스트 3곳** — 각 호스트가 `window.api.terminal.onExit` 를 1회 구독하고, **자기 소유 세션 id 만** 반영한다(다른 뷰의 세션 exit 은 무시). 이미 `exitInfo` 가 있는 세션에 두 번째 exit 이 와도 덮어쓰지 않는다(렌더러측 at-most-once).
6. `TerminalView` 는 탭 라벨에도 종료 상태를 반영한다(디밍 + `종료됨`). `MentionAgentView`/`BranchWorkspace` 는 오버레이 + 기존 닫기 버튼 재사용으로 최소 반영.

## 대안과 기각 이유

1. **`TerminalPane` 이 스스로 `onExit` 구독** — *기각*: (a) 호스트가 탭 배지/닫기 정책을 세울 수 없어 결국 호스트도 따로 구독 → 상태 이중화. (b) split 이후 pane 수만큼 IPC 구독이 늘어난다. (c) "pane 은 표시, 호스트는 세션 소유"라는 현행 역할 분담이 무너진다.
2. **exit 시 탭 자동 닫기** — *기각*: 사용자 보고의 핵심은 "죽었는지 모르겠다"이지 "탭이 남는다"가 아니다. 자동으로 닫으면 exit code·마지막 출력(빌드 실패 로그 등)이 즉시 사라져 정반대 불만이 된다.
3. **N초 후 오버레이 자동 페이드** — *기각*: 자리를 비웠다 돌아온 사용자가 종료 사실 자체를 놓친다. 마스터 설계·목업 모두 "자동 제거 없음"으로 확정.
4. **오버레이 없이 탭 배지만** — *기각*: 포커스된 pane 에서 타이핑이 안 먹히는 이유를 화면 중앙에서 설명하지 못한다. 배지는 보조 수단으로 병행한다.
5. **입력 차단을 `terminal.dispose()` 로 대체** — *기각*: 스크롤백/선택/복사가 사라진다. 종료 후에도 로그를 읽는 것이 이 기능의 주 목적.
6. **`exitInfo` 를 필수 prop 으로** — *기각*: 호스트 3곳 + 테스트 stub 을 동시에 깨뜨린다. optional 이면 BranchWorkspace 를 마지막에 붙여도 중간 상태가 컴파일된다.

## 결과 (Consequences)

### 긍정
- pane 은 "그리기"만, 호스트는 "세션 소유"만 — B-4 에서 pane 이 N개가 되어도 구독 수는 호스트당 1개로 유지된다.
- optional prop 이라 3개 호스트를 **하나씩 순차 적용**해도 중간 상태가 항상 컴파일·동작한다.
- 죽은 탭에서 로그를 읽고 복사하는 실사용 흐름이 유지된다.

### 부정 / 트레이드오프
- 호스트 3곳에 비슷한 구독 코드가 생긴다(각 ~10줄). 공통 훅으로 묶고 싶은 유혹이 있으나, 세 호스트의 세션 컨테이너 모양이 서로 달라(배열/레코드/경로 맵) 지금 추상화하면 B-4 에서 다시 깨진다 → **의도적으로 중복 허용**하고 impl-log 에 사유를 남긴다.
- 종료된 탭이 화면에 남아 탭바 공간을 차지한다(사용자가 닫아야 함) — 의도된 트레이드오프.
- `exitInfoRef` 동기화를 빠뜨리면 입력 차단이 stale 클로저로 무력화된다 → 테스트로 고정.

### 모니터링
- vitest: `TerminalView.test.tsx` 에 "onExit 수신 → 오버레이/배지 노출", "다른 세션 id 의 exit 은 무시", "닫기 → kill 호출" 케이스.
- `test/helpers/mockWindowApi.ts` 의 `terminal.onExit` mock 이 실제 콜백을 저장/발화할 수 있게 하여 렌더러 테스트에서 exit 을 주입.
- 수동: 3개 호스트 각각에서 셸 `exit` → 오버레이 확인 / 타이핑 무반응 확인 / 스크롤·복사 가능 확인.
