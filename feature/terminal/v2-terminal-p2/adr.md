---
id: ADR-v2-terminal-p2-01
title: TerminalPane 의 isActive 를 isVisible / isFocused 로 분해하고 isActive 는 deprecated 해석층으로 남긴다
status: proposed
date: 2026-07-30
supersedes: []
domain: terminal, renderer-only
---

# TerminalPane 의 isActive 를 isVisible / isFocused 로 분해하고 isActive 는 deprecated 해석층으로 남긴다

## 컨텍스트

`TerminalPane` 의 `isActive: boolean` 한 개가 지금 네 가지를 동시에 결정한다.

| # | 위치 | 하는 일 | 본질 |
|---|---|---|---|
| ① | `TerminalPane.tsx:540` | 컨테이너 `z-10` vs `z-0 pointer-events-none invisible` | **가시성** |
| ② | `:471-497` | rAF×2 후 `fit()` + `window.api.terminal.resize` | **가시성** |
| ③ | `:493` | `term.focus()` | **포커스** |
| ④ | `:520-536` | `document.addEventListener('paste', …)` | **포커스** |

"탭 하나 = pane 하나" 모델에서는 가시성과 포커스가 항상 같이 움직이므로 이 겸직이 드러나지 않았다. B-4 split 이 들어오면 **보이지만 포커스는 아닌 pane** 이 정상 상태가 되는데, 현 모델에서는 그런 상태를 표현할 수 없다.

특히 ④가 위험하다. `document` 레벨 리스너라 pane 마다 하나씩 붙으면, 이미지 붙여넣기 한 번에 리스너 N개가 각각 `sendFileAsPath()` 를 호출해 **N개 PTY 에 경로가 타이핑**된다. `isActive` 를 그대로 두고 "분할 시엔 활성 pane 만 true" 로 우회하면, 나머지 pane 이 `invisible` 이 되어 split 자체가 성립하지 않는다.

동시에 이 pane 컴포넌트에는 이미 세 개의 호스트가 붙어 있다 — `TerminalView`, `MentionAgentView`, `BranchWorkspace`. 셋 다 Phase 1 에서 exit 오버레이 배선을 막 끝낸 참이라(`feature/terminal/v2-terminal-p1/impl-log.md`), 지금 세 곳을 동시에 마이그레이션하면 회귀 표면이 split 작업과 뒤섞인다.

B-5 도 여기에 의존한다. 스냅샷을 만들려면 호스트가 각 pane 의 `SerializeAddon` 에 도달해야 하는데, 지금은 xterm 인스턴스가 pane 컴포넌트 내부 ref 에 갇혀 있어 밖에서 꺼낼 방법이 없다.

## 결정

**`isVisible` / `isFocused` / `onFocusRequest` 세 prop 을 신설하고, `isActive` 는 optional·deprecated 로 남겨 순수 함수 해석층으로 흡수한다. 동시에 `forwardRef` 로 `TerminalPaneHandle` 을 노출한다.**

1. **해석은 순수 함수 한 곳에서만.** `src/renderer/src/components/Terminal/paneActivation.ts`:
   ```ts
   /** pane 의 가시성/포커스 최종 판정. isActive 는 레거시 호스트 호환용 폴백이다. */
   export function resolvePaneActivation(input: {
     isVisible?: boolean; isFocused?: boolean; isActive?: boolean
   }): { visible: boolean; focused: boolean }
   ```
   - `visible = isVisible ?? isActive ?? true`
   - `focused = isFocused ?? isActive ?? false`
   - 컴포넌트 본문에서 `??` 를 흩뿌리지 않는다. 레거시 3호스트의 현행 의미를 이 함수의 테스트가 **동결**한다.

2. **책임 재배치**
   - `visible` → 컨테이너 클래스(①), reveal 시 fit + PTY resize(②), B-6 의 WebGL attach 게이트, B-5 의 `serialize()` 가용 여부와 무관.
   - `focused` → `term.focus()`(③), `document` paste 리스너(④, **앱 전체에서 최대 1개**), 목업 `.pane.focused` 의 1.5px 파란 보더, 비포커스 pane 의 출력 dim(`.pane.dimmed`), 활성 pane 의 OSC 타이틀만 탭 제목으로 전파.
   - `onFocusRequest?: () => void` → pane 컨테이너의 `pointerdown`(캡처 단계)과 xterm `textarea` 의 `focus` 에서 호출. 호스트가 `focusedLeafId` 를 갱신한다. **pane 은 자기 포커스 상태를 스스로 결정하지 않는다** — 진실은 호스트 트리에 하나만 둔다.

3. **`isActive` 는 남긴다.** `isActive?: boolean` + `@deprecated` JSDoc(1줄, "isVisible/isFocused 를 쓰세요"). 기존 3개 호스트 파일의 diff 는 **0줄**이 수용 기준이다. 제거는 Phase 3(D 트랙에서 세 호스트를 단축키 레지스트리로 손볼 때) 에 한다.

4. **`forwardRef` + `useImperativeHandle`**
   ```ts
   export interface TerminalPaneHandle {
     /** 현재 화면+스크롤백을 스냅샷 문자열로. addon 미준비면 null (throw 하지 않는다). */
     serialize(): TerminalPaneSnapshot | null
     focus(): void
     /** 컨테이너 크기에 맞춰 refit + PTY resize 1회. */
     fit(): void
   }
   ```
   `serialize()` 가 반환하는 `TerminalPaneSnapshot{ cols, rows, serialized, cwd? }` 타입은 B-5 가 `src/shared/types/terminal.ts` 에 정의한다(ADR-03). B-3 단계에서는 addon 이 없으므로 `serialize()` 는 `null` 을 반환하는 스텁으로 시작하고, ADR-03 단계에서 본체가 채워진다 — **인터페이스를 먼저 고정**해 호스트 배선을 B-4 와 병렬로 진행할 수 있게 한다.

5. **effect 분리.** 현재 하나인 `[isActive, sessionId]` effect 를 `[visible, sessionId]`(fit/resize)와 `[focused]`(focus) 둘로 쪼갠다. `ResizeObserver` 는 **항상** 유지하되, `visible === false` 일 때는 fit 을 건너뛴다(숨김 컨테이너의 0×0 fit 이 PTY 를 1×1 로 만드는 사고 방지).

## 대안과 기각 이유

1. **`isActive` 를 그대로 두고 split 에서 "활성 pane 만 true"** — *기각*: 비활성 pane 이 `invisible + pointer-events-none` 이 되어 화면에서 사라진다. split 이 성립하지 않는다.
2. **세 호스트를 이번에 전부 `isVisible`/`isFocused` 로 마이그레이션** — *기각*: p1 에서 방금 exit 오버레이를 배선한 세 파일을 다시 열게 되고, split 커밋에 무관한 회귀 위험이 섞인다. 해석층은 3줄이고 순수 함수 테스트로 의미를 고정할 수 있어 비용 대비 이득이 없다.
3. **pane 이 `document.activeElement` 를 감시해 자기 포커스를 스스로 판정** — *기각*: 진실이 두 곳(호스트의 `focusedLeafId` vs DOM)에 생긴다. ⌥⌘화살표로 포커스를 옮길 때 두 진실이 어긋나면 "보더는 A 인데 타이핑은 B" 가 된다.
4. **React Context 로 activation 을 내려주기** — *기각*: provider 를 씌우지 않은 레거시 3호스트에서 전부 `undefined` 가 되어 무회귀 요건이 깨진다. prop 이 명시적이고 테스트하기도 쉽다.
5. **pane 을 아예 두 컴포넌트로 분리(`TerminalPaneView` + `TerminalPaneController`)** — *기각*: 697줄을 지금 쪼개면 B-4~B-7 의 diff 가 전부 "이사한 코드" 와 섞여 리뷰 불가능해진다. 분해는 B-7 까지 끝난 뒤 별도 무동작변경 커밋으로.
6. **`serialize()` 를 ref 대신 콜백 prop(`onSerializeReady`)으로** — *기각*: 호스트가 "지금 이 순간" 스냅샷을 당겨야 하는데(before-quit flush) 콜백은 push 방향이다. 명령형 handle 이 요구에 맞는다.

## 결과 (Consequences)

### 긍정
- split 이 필요로 하는 "보이지만 포커스 아님" 상태가 처음으로 표현 가능해진다.
- document paste 리스너가 앱 전체에 최대 1개로 유계가 된다 — 분할 시 N중 발화 버그가 **설계 단계에서** 차단된다.
- `TerminalPaneHandle` 인터페이스가 먼저 고정되어, B-4(호스트 배선)와 B-5(스냅샷 본체)를 병렬로 진행할 수 있다.
- 레거시 3호스트가 무수정이라 B-3 커밋의 리뷰 범위가 `TerminalPane.tsx` + 신규 순수 함수로 좁혀진다.

### 부정 / 트레이드오프
- prop 이 3개 늘고 deprecated prop 이 하나 남는다 — "어느 걸 써야 하나" 혼란 비용. JSDoc 과 ADR 참조로만 방어한다(lint 룰은 만들지 않는다).
- `resolvePaneActivation` 이 `undefined` 를 세 갈래로 해석하므로, prop 을 **명시적으로 `false`** 로 넘기는 것과 **생략**하는 것의 의미가 다르다. 이 비대칭은 함수 주석과 테스트로만 보증된다.
- effect 를 둘로 쪼개면서 "reveal 과 동시에 focus" 하던 기존 타이밍이 두 tick 으로 나뉜다. 레거시 호스트에서는 `visible`/`focused` 가 같은 렌더에서 함께 바뀌므로 체감 차이는 없어야 하지만, 탭 전환 직후 입력이 첫 글자를 놓치는 회귀가 나오면 여기가 범인이다.

### 모니터링
- vitest `paneActivation.test.ts` — 레거시 입력 4케이스(`isActive: true` / `false` / 미지정) × 신규 입력 4조합. 특히 `{ isActive: true }` → `{ visible: true, focused: true }`, `{ isVisible: true, isFocused: false }` → dim pane.
- vitest `TerminalPane.test.tsx` 확장 — ①`focused: false` 인 pane 이 `document` paste 리스너를 등록하지 않음 ②`visible` 전환에서만 `terminal.resize` IPC 발생 ③`ref.current.serialize()` 가 addon 없이도 `null` 반환.
- 기존 `TerminalView.test.tsx` / `MentionAgentView.test.tsx` 가 **수정 없이** 통과하는 것이 무회귀의 기계적 증거.
- 수동: 탭 전환 직후 즉시 타이핑 → 첫 글자 유실 없음.
</content>
