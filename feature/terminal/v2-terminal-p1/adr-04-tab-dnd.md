---
id: ADR-v2-terminal-p1-04
title: 탭 순서 변경은 @dnd-kit — 탭은 고정, 2px 삽입 인디케이터만 이동 (12px·2샘플 커스텀 센서)
status: proposed
date: 2026-07-30
supersedes: []
domain: terminal, renderer-only
---

# 탭 순서 변경은 @dnd-kit — 탭은 고정, 2px 삽입 인디케이터만 이동 (12px·2샘플 커스텀 센서)

## 컨텍스트

터미널 탭 순서를 바꿀 수 없다는 사용자 보고. 탭바는 `TerminalView.tsx:116-145` 이고, 탭 라벨(`TabLabel`, :181-254)에는 이미 **클릭(활성화) · 더블클릭(인라인 rename) · 연필 버튼 · X 버튼**이 붙어 있다. 여기에 드래그를 얹으면 제스처가 4개로 겹친다 — 특히 **드래그 임계값이 0이면 더블클릭 rename 이 죽는다**.

Orca 는 동일 문제를 겪고 결론을 냈다(`docs/dev/orca-absorption-notes.md` §5):
- HTML5 native DnD 는 Electron 에서 고스트 이미지/취소 처리가 취약 → **@dnd-kit**.
- 탭에 transform 을 주면 폭이 제각각인 탭들이 스와핑되며 시각적으로 튄다 → **탭은 고정, 삽입 인디케이터만 이동**.
- 커스텀 PointerSensor(12px + 2샘플 확인).
- 닫힘 후 활성 탭은 **MRU 스택**(`pickNextActiveTab`), **missed-end fallback**(window pointerup/blur) 필수.

현행 닫기 로직(`TerminalView.tsx:61-75`)은 "마지막 탭으로 이동"이라 순서를 바꾸고 나면 더 엉뚱해진다(닫을 때마다 오른쪽 끝으로 점프).

## 결정

**`@dnd-kit/core` + `@dnd-kit/sortable` 을 신규 의존성으로 도입하고, 순서의 진실은 `TerminalView` 의 세션 배열 순서 하나로 유지한다.**

1. **라이브러리** — `@dnd-kit/core`, `@dnd-kit/sortable` (MIT). `DndContext` + `SortableContext(horizontalListSortingStrategy)`.
2. **렌더 규칙** — `useSortable` 이 주는 `transform`/`transition` 을 **적용하지 않는다**. 드래그 중 탭은 제자리에 있고, 삽입 지점에 **2px 세로 인디케이터**만 그린다. 드래그 원본 탭은 살짝 낮은 opacity 로만 구분.
3. **센서** — `src/renderer/src/components/Terminal/tabDragSensor.ts` 에 `PointerSensor` 를 상속한 커스텀 센서. 활성화 조건은 **12px 이동 + 연속 2샘플 확인**. 판정 로직은 순수 함수 `shouldActivateDrag(distances: number[], thresholdPx)` 로 분리해 단위 테스트한다. 탭 내부 버튼(연필/X)과 rename input 은 `pointerdown` 에서 stopPropagation 하여 드래그 시작 대상에서 제외.
4. **순서 진실** — `TerminalView` 의 세션 엔트리 배열 순서 = 탭 순서 = 단일 진실. 별도 `tabOrder` state 를 두지 **않는다**(두 벌이 되면 drift). 순수 모듈 `src/renderer/src/components/Terminal/tabOrder.ts`:
   - `moveTab(ids, activeId, overId)` — 모르는 id / 동일 id 는 no-op 로 원본 반환.
   - `pushMru(mru, id, cap)` / `pickNextActiveTab(order, closedId, mru)` — **MRU 우선**, 없으면 오른쪽 → 왼쪽 이웃, 남은 탭이 없으면 `null`.
5. **missed-end fallback** — window `pointerup` / `blur` / `visibilitychange` 에서 드래그 상태를 강제 종료해 인디케이터 잔상을 없앤다(@dnd-kit 이 놓치는 Electron 케이스 대비).
6. **적용 범위** — 터미널 탭 **한 곳만**. `BranchWorkspace` / `MentionAgentView` 탭은 미적용(Orca 노트 §5).
7. **접근성** — KeyboardSensor 는 넣지 않는다(별도 사이클). 대신 `DndContext` 의 `accessibility.announcements` 를 **한국어**로 제공한다.

## 대안과 기각 이유

1. **HTML5 native DnD (`draggable` + dragover)** — *기각*: Electron 에서 드래그 고스트가 OS 창 밖으로 새고, `dragend` 유실 시 상태가 고착된다. xterm 영역 위 `dragover` 는 이미 파일 드롭(`TerminalPane` :530-540)이 쓰고 있어 충돌 위험. Orca 도 같은 이유로 배제.
2. **react-dnd** — *기각*: 백엔드 추상화(HTML5/touch)가 이 규모에 과하고 번들이 크다. 우리가 필요한 건 한 줄짜리 수평 리스트 정렬 하나.
3. **자체 pointer 이벤트 구현** — *기각*: 임계값·좌표 충돌 판정까지는 쉽지만 자동 스크롤(탭 많을 때), 취소 경로, 포인터 캡처 이중화까지 재발명해야 한다. Orca 가 dnd-kit 을 고른 이유가 정확히 이것.
4. **dnd-kit 기본 동작대로 탭에 transform 적용** — *기각*: 탭 폭이 이름 길이에 따라 제각각이라 스와핑 애니메이션이 튀고, 드래그 중 rename input·버튼의 히트 영역이 실제 위치와 어긋난다.
5. **드래그 임계값 없이(또는 4~5px) 즉시 활성화** — *기각*: 더블클릭 rename 과 정면 충돌. 사용자 손떨림으로 이름 변경이 드래그로 먹힌다. 12px + 2샘플이 Orca 실측 결론.
6. **별도 `tabOrder: string[]` state 신설** — *기각*: 엔트리 배열과 두 벌이 되어 생성/복원/닫기 3경로에서 동기화가 필요하다. 배열 순서 자체를 진실로 쓰면 동기화 지점이 0. (Orca 의 "tabOrder 단일 진실" 요구와 동일한 결론 — 그릇만 다름.)
7. **닫힘 후 활성 탭 = 오른쪽 이웃 고정(현행 유지)** — *기각*: reorder 도입 후 체감이 나빠진다. 사용자가 방금까지 쓰던 탭으로 돌아가는 MRU 가 자연스럽다.

## 결과 (Consequences)

### 긍정
- 사용자 보고 해소 + B-4 split 이후에도 같은 탭바 구조를 재사용할 수 있다.
- 순수 모듈(`tabOrder.ts`, `shouldActivateDrag`)로 순서/MRU 규칙이 테스트로 고정된다.
- rename 회귀는 기존 `TerminalView.test.tsx` 의 rename 테스트가 게이트가 된다.

### 부정 / 트레이드오프
- **신규 런타임 의존성 2개**(≈40KB min). Electron 데스크탑이라 수용하지만 의존성 표면이 늘어난다. 라이선스 MIT — verbatim 코드 복사가 발생하면 `THIRD-PARTY-NOTICES.md` 에 등재(공개 API 상속만이면 미발생, impl-log 에 어느 쪽인지 기록).
- transform 을 쓰지 않아 "탭이 밀려나는" 애니메이션 피드백이 없다 → 인디케이터 시인성이 UX 를 좌우한다(2px, `--clauday-blue` 계열, 탭바 높이 전체).
- 키보드로는 순서를 못 바꾼다(비목표).
- MRU 스택은 세션 수명 동안만 유지(영속화 안 함) — 재시작 후엔 배열 순서 기준.

### 모니터링
- vitest: `moveTab`(경계/no-op), `pickNextActiveTab`(MRU 히트 / MRU 미스 → 오른쪽 → 왼쪽 / 빈 배열), `pushMru`(중복 승격·cap), `shouldActivateDrag`(11px×3 불활성, 12px×2 활성, 큰 값 1샘플 불활성).
- `TerminalView.test.tsx`: 더블클릭 rename 회귀 + 탭 닫기 후 MRU 활성화.
- 수동: 탭 5개에서 드래그 순서 변경, 드래그 도중 `Esc`·창 전환, rename 더블클릭 100% 성공 여부.
