---
id: ADR-v2-terminal-p2-02
title: split 레이아웃은 렌더러 소유 이진 트리 + 트리 밖 xterm Map(portal attach) 로 만든다
status: proposed
date: 2026-07-30
supersedes: []
domain: terminal, renderer-only
---

# split 레이아웃은 렌더러 소유 이진 트리 + 트리 밖 xterm Map(portal attach) 로 만든다

## 컨텍스트

터미널 탭 하나 안에서 pane 을 나누려면 세 가지를 정해야 한다: **①트리 자료구조 ②트리의 소유자 ③xterm 인스턴스와 React 재조정의 관계**.

마스터 설계의 초안과 UI 목업(`docs/mockups/v2/terminal-split.html` 구현 매핑 노트 1)은 n-ary 트리(`children[] + sizes[]`)를 제시했고, 트리 모듈 위치도 `src/main/terminal/splitTree.ts` 로 적혀 있었다. 그 뒤 Orca 소스 분석(`docs/dev/orca-absorption-notes.md` §5)에서 세 가지 교정이 나왔다.

- n-ary 는 pane 을 닫을 때 `children.splice` + `sizes` 재정규화 + "자식이 1개면 부모 접기" 를 전부 손으로 해야 한다. 이진이면 collapse 가 **형제 승격 한 줄**이다.
- 트리를 main 이 소유하면 split/resize 마다 IPC 왕복이 생긴다. 레이아웃은 초당 수십 번 바뀌는 UI 상태다.
- 가장 비싼 함정: **React 재조정으로 xterm 이 리마운트되면 스크롤백·alt buffer·PTY 바인딩이 소실된다**(Orca 노트 함정 #8). Orca 가 pane DOM 을 명령형으로 관리하는 이유가 이것이다. 재귀 JSX 안에서 `<TerminalPane>` 을 직접 그리면, 3분할에서 가운데를 닫는 순간 트리 형태가 바뀌면서 살아남아야 할 pane 들이 다른 위치·다른 key 경로로 재조정되어 통째로 다시 마운트된다.

추가로 `feature/terminal/v2-terminal-p1/adr-05-tab-order-persistence.md` 가 이미 밟은 함정이 하나 더 있다: **세션 id 는 재시작마다 새로 발급된다.** 트리에 `sessionId` 를 넣으면 그 트리는 영속화할 수 없다.

## 결정

**이진 트리 + 렌더러 소유 + xterm 은 트리 밖 Map 에 두고 `createPortal` 로 붙인다.**

### 1. 자료구조 — 이진 트리, leaf 는 leafId 만

`src/shared/types/terminal.ts`(스냅샷 직렬화 대상이라 main 도 타입을 본다):

```ts
export type SplitDirection = 'row' | 'column'
export interface SplitLeaf { type: 'leaf'; leafId: string }
export interface SplitBranch {
  type: 'split'; direction: SplitDirection; first: SplitNode; second: SplitNode; ratio?: number
}
export type SplitNode = SplitLeaf | SplitBranch
```

- **leaf 는 `leafId`(UUID) 하나만 갖는다.** `sessionId` / `exitInfo` / `cwd` 같은 휘발·런타임 값은 트리에 넣지 않는다. 런타임 바인딩은 별도 `panes: Record<leafId, PaneRuntime>` 에, 영속 값은 스냅샷의 `panes` 에 둔다(ADR-03).
- `leafId` 는 **published 후 교체 금지**. 스냅샷의 `panes` 키이자 xterm Map 의 키이자 React key 다.
- `ratio` 는 `first` 의 비율. **0.5±0.005 면 저장에서 생략**하고, 그 외에는 소수 3자리로 양자화한다(`quantizeRatio`) — JSON diff 노이즈 제거.
- 분기 노드에는 id 를 주지 않는다. 주소는 경로 `('first'|'second')[]` 로 표현한다(`setRatioAtPath`, `findLeafPath`).

### 2. 순수 함수 모듈 — `src/renderer/src/components/Terminal/splitTree.ts`

`splitLeaf(tree, targetLeafId, direction, newLeafId)` / `closeLeaf(tree, leafId)`(형제 승격, 마지막 leaf 제거 시 `null`) / `findLeafPath` / `collectLeafIds`(시각적 순서) / `setRatioAtPath` / `quantizeRatio` / `getEqualizeWeight` + `equalizeRatios`(3분할 균등은 leaf 수 가중치로) / `neighborLeaf(tree, fromLeafId, 'left'|'right'|'up'|'down')` / `isValidTree`.

`isValidTree` 는 복원 시 손상 스냅샷 방어용이다 — 알 수 없는 `type`, 중복 `leafId`, 범위 밖 `ratio`, 과도한 깊이(>8)면 false. false 면 단일 leaf 로 폴백하고 `console.warn`.

> 모듈은 **렌더러에 둔다.** 목업 노트의 `src/main/terminal/splitTree.ts` 경로는 채택하지 않는다(아래 §3). 타입만 shared 에 둔다.

### 3. 소유권 — 트리는 렌더러 상태, main 은 스냅샷 시점에만 관여

`TerminalView` 의 탭 엔트리:

```ts
interface TabEntry {
  tabId: string
  name: string
  tree: SplitNode
  focusedLeafId: string
  panes: Record<string /* leafId */, PaneRuntime>   // sessionId, cwd, exitInfo, savedSnapshot
}
```

main 은 split 을 모른다. PTY 는 여전히 세션 단위이고, main 이 보는 것은 `create/input/resize/kill` 뿐이다.

### 4. xterm 은 트리 밖 Map + portal (함정 #8 대응)

- `TerminalView` 가 `paneHostsRef: Map<leafId, HTMLDivElement>` 를 들고, leafId 마다 `document.createElement('div')` 를 **한 번만** 만든다.
- `TerminalView` 는 안정된 위치에서 `createPortal(<TerminalPane … />, host)` 를 렌더한다. 트리 모양이 바뀌어도 이 portal 목록은 `collectLeafIds` 순서로만 바뀌므로 **컴포넌트가 리마운트되지 않는다**.
- `SplitLayout` 의 leaf 슬롯은 **빈 div** 이고, effect 에서 `slot.appendChild(host)` 만 한다. 트리 재조정은 이 슬롯 div 들만 만들고 지운다.
- **DOM 리페어런트 안무**(분할/닫기/이동으로 host 가 옮겨질 때): `scrollState 캡처 → WebGL dispose(ADR-04) → appendChild → rAF → WebGL attach → fit → scrollState 복원`. 이 순서를 `reattachPaneHost()` 한 함수에 가둔다.

### 5. `SplitLayout.tsx` — 재귀 render-prop 컨테이너

`direction: 'row' → flex-row`, `'column' → flex-column`. 자식 사이에 `PaneDivider`. 비율은 `flex-basis: calc(ratio * 100%)` + `flex-grow: 0` / 두 번째는 `flex: 1`. 최소 크기 `Math.min(MIN_PANE_PX(120), total/2)`.

### 6. 리사이즈 핸들 — Orca `pane-divider-drag.ts` 이식 (adapted)

투명 히트박스 8px + `::after` 1px 시각선(교차선은 음수 inset 으로 연결) / `setPointerCapture` + window `pointermove`·`pointerup` 이중화 / rAF 코얼레싱 / **드래그 중에는 DOM `flex-basis` 만 직접 조작하고 React state 도 PTY resize 도 건드리지 않는다** / 드롭 시 1회 `setRatioAtPath` + `fit` + PTY resize / 더블클릭 50/50 / 적응형 최소폭.

드래그 중 PTY resize 홀드는 취향이 아니라 필수다 — 매 프레임 SIGWINCH 를 보내면 claude/vim 같은 TUI 가 프레임마다 전체 재그리기를 한다(함정 #9).

### 7. split 은 항상 새 PTY

`splitRight`/`splitDown` 은 `window.api.terminal.create({ cwd: 현재 pane 의 cwd })` 로 **새 세션**을 만든다. 기존 세션을 두 pane 이 공유하는 모델은 채택하지 않는다(§대안 6).

### 8. 단축키 — 인라인 테이블 + 뷰 활성 가드

`TerminalView` 에 `{ id, mac, win, action }` 테이블 상수를 두고 하나의 `keydown` 핸들러가 순회한다(D-1 이 그대로 흡수할 수 있는 모양). `App.tsx` 가 `<TerminalView active={activeView === 'terminal'} />` 를 넘기고, 핸들러는 `active === false` 면 **즉시 반환**한다. 현재 ⌘T/⌘W 가 다른 뷰에서도 PTY 를 만들고 죽이는 문제(Workstream D 의 충돌 C3)를 이 트랙에서 부분 해소한다.

| 키 | 동작 |
|---|---|
| ⌘D / Ctrl+Alt+D | 포커스 pane 을 오른쪽으로 분할 |
| ⌘⇧D / Ctrl+Shift+D | 아래로 분할 |
| ⌥⌘←↑↓→ / Alt+Ctrl+화살표 | `neighborLeaf` 로 포커스 이동 |
| ⌘W / Ctrl+W | 포커스 pane 닫기 → 마지막 pane 이면 탭 닫기 |
| ⌘T / Ctrl+T | 새 탭 |

> ⌘D 는 xterm 에서 EOF(`\x04`)로도 쓰인다. **앱이 가로챈다**(`preventDefault` + `return false`). EOF 는 Ctrl+D 로 보내면 되고, mac 에서 Ctrl+D 는 그대로 PTY 로 간다. Windows/Linux 의 Ctrl+D 충돌은 `Ctrl+Shift+D`(아래 분할)와 함께 **Ctrl+D 를 분할에 쓰지 않고** `Ctrl+Alt+D` 를 배정해 회피한다.

### 9. 붙여넣기 타겟 4중 재검증

클립보드 read 는 비동기다. `navigator.clipboard.read()` 를 await 하는 사이 사용자가 다른 pane 을 클릭하면 엉뚱한 PTY 로 이미지 경로가 들어간다. `pasteTargetState.ts`(Orca `terminal-paste-target-state.ts` adapted):

```ts
beginPaste(): PasteToken            // { tabId, leafId, sessionId, generation }
isPasteTargetValid(token): boolean  // 4개 모두 현재와 일치할 때만 true
```

`generation` 은 pane 이 세션을 재바인딩할 때마다(복원/재시작) 증가하는 카운터다. 불일치면 폐기 + `console.warn('[terminal-paste] 타겟 변경으로 폐기', { … })`.

## 대안과 기각 이유

1. **n-ary 트리 `children[] + sizes[]`(원 계획 · 목업 JSON)** — *기각*: collapse 가 splice + sizes 재정규화 + 단일 자식 부모 접기로 흩어진다. 이진에서는 "형제를 부모 자리에 올린다" 한 줄이고, 3분할 균등은 `getEqualizeWeight` 로 표현 가능하다. 목업 JSON 은 시각 설계용이며 트리 표현은 본 ADR 이 우선한다.
2. **트리를 main 이 소유(목업 노트의 `src/main/terminal/splitTree.ts`)** — *기각*: split/포커스/리사이즈마다 IPC 왕복. 레이아웃은 순수 UI 상태이고 main 은 스냅샷 저장 시점(ADR-03)에만 알면 된다. main 이 알아야 할 이유가 생기는 유일한 경우는 "창 여러 개 + 세션 이동" 인데 현재 단일 창 모델이다.
3. **재귀 JSX 안에서 `<TerminalPane>` 직접 렌더** — *기각*: 트리 형태 변경 시 재조정으로 리마운트 → 스크롤백/alt buffer/PTY 바인딩 소실(함정 #8). `key` 를 leafId 로 줘도 부모 체인이 바뀌면 React 는 언마운트한다.
4. **leaf 노드에 `sessionId` 저장** — *기각*: 세션 id 는 재시작마다 새로 발급되는 휘발값이라 트리를 영속화할 수 없게 만든다(p1 ADR-05 가 같은 함정에서 id 기반 매칭을 폐기했다).
5. **`react-resizable-panels` / `react-split-pane` 같은 라이브러리** — *기각*: 내부적으로 자식을 transform·리마운트하고, "드래그 중 PTY resize 홀드", "적응형 최소폭", "pointer capture + window 이중화" 같은 요구를 제어할 수 없다. 그리고 Orca 의 검증된 309줄이 이미 있다(라이선스 고지는 ADR-06).
6. **split 시 기존 PTY 를 두 pane 이 공유(같은 세션 두 뷰)** — *기각*: xterm 1개 = PTY 1개가 스크롤백/serialize/resize 전반의 전제다. 두 뷰의 cols/rows 가 다르면 어느 쪽으로 resize 할지 결정 불가. tmux 식 동기 뷰는 별개 기능이며 스코프 밖.
7. **⌘D 를 쓰지 않고 ⌘\\ 등 다른 키로 회피** — *기각*: ⌘D 는 iTerm2/Warp/VSCode 터미널의 사실상 표준이다. 사용자 기대를 따르고, EOF 는 Ctrl+D 라는 원래 자리로 안내한다(매뉴얼에 명시).
8. **paste 타겟을 `leafId` 만으로 검증** — *기각*: 탭이 바뀌었는데 leafId 가 우연히 같을 수 있고, 복원 직후 세션 재바인딩 중이면 leafId 가 같아도 PTY 가 다르다. 4중(tab/leaf/session/generation)이 Orca 가 실제 오배달을 겪고 도달한 답이다.

## 결과 (Consequences)

### 긍정
- pane 닫기가 "형제 승격" 한 줄이라 트리 조작 버그의 표면이 작다. 순수 함수라 전수 테스트가 쉽다.
- xterm 이 React 재조정과 분리되어, 분할/닫기/탭 전환 어디서도 스크롤백이 살아남는다.
- 트리가 렌더러 소유라 split 응답이 IPC 지연 없이 즉각적이다.
- `ratio` 양자화·생략으로 스냅샷 JSON 이 레이아웃 변경마다 무의미하게 커지지 않는다.
- ⌘W/⌘T 의 뷰 활성 가드로 Workstream D 의 충돌 C3 를 미리 절반 해소한다.

### 부정 / 트레이드오프
- **portal + 명령형 appendChild 는 React 관례에서 벗어난다.** 처음 읽는 사람이 "이 div 는 왜 비어 있지?" 로 헤맨다 → `SplitLayout.tsx` 상단에 5줄 주석 + 본 ADR 링크를 남긴다.
- 3분할을 이진 트리로 표현하면 중첩 깊이가 늘어(`split(a, split(b, c))`) "균등 3분할" 이 `ratio 0.333 / 0.5` 라는 비직관적 값이 된다 → `equalizeRatios` 유틸과 더블클릭 50/50 이 이를 가린다.
- 분기 노드에 id 가 없어 ratio 갱신이 경로 기반이다. 트리가 동시에 바뀌면 경로가 무효화될 수 있다 → ratio commit 은 드롭 시점 1회이고, 그 사이 트리 변경은 사용자 입력상 불가능하다. 그래도 `setRatioAtPath` 는 경로가 분기 노드를 가리키지 않으면 **원본을 그대로 반환**한다.
- pane 마다 PTY 가 생기므로 4분할 × 5탭이면 PTY 20개다. 메모리/프로세스 부담은 사용자 책임 영역이지만, 탭 20 / leaf 40 상한(ADR-03)이 상한선을 준다.
- ⌘D 가로채기로 EOF 습관이 깨지는 사용자가 나온다 → 매뉴얼 + 첫 사용 시 안내 문구.

### 모니터링
- vitest `splitTree.test.ts` — 분할/닫기/형제 승격/마지막 leaf/경로 탐색/ratio 양자화·생략/equalize 가중치/`neighborLeaf` 4방향/`isValidTree` 손상 입력 5종.
- vitest `pasteTargetState.test.ts` — 4필드 각각의 불일치에서 false.
- vitest `SplitLayout.test.tsx` — "3분할 → 가운데 leaf 닫기 → 남은 두 pane 의 host div 가 **동일 노드 참조**로 유지" (리마운트 부재의 기계적 증거).
- vitest `TerminalView.test.tsx` — `active=false` 일 때 ⌘T/⌘W/⌘D 가 아무 것도 하지 않음.
- 수동 QA: 4분할에서 각 pane 에 다른 명령 실행 → 경계 드래그 → TUI 재그리기가 드래그 중 1회도 안 일어나는지(vim 열어둔 pane 으로 확인) → 드롭 시 1회만.
</content>
