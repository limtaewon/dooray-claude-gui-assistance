---
id: ADR-v2-terminal-p1-03
title: 터미널 검색은 순수모듈 / 훅 / 뷰 3분할 + 모든 find 를 safeFind 로 감싼다
status: proposed
date: 2026-07-30
supersedes: []
domain: terminal, renderer-only
---

# 터미널 검색은 순수모듈 / 훅 / 뷰 3분할 + 모든 find 를 safeFind 로 감싼다

## 컨텍스트

현행 검색은 `TerminalPane.tsx` 안에 흩어져 있다: 상태 2개(`searchOpen`, `searchQuery`, :22-23), `⌘F` 핸들러(:204-210), find 함수 3개(:514-525), JSX(:604-636). 옵션은 `caseSensitive: false` 하드코딩. 매치 수·현재 위치·정규식·단어 단위·overview ruler 없음.

여기에 기능을 얹으면 세 가지가 동시에 나빠진다.

1. **파일이 더 커진다** — 680줄. B-3(prop 분리)·B-4(split)·B-7(링크 프로바이더)가 전부 같은 파일에 온다.
2. **테스트 불가** — xterm 인스턴스가 mount effect 안에서만 존재해 검색 로직에 단위 테스트를 붙일 수 없다.
3. **터미널 전체 사망 위험** — Orca 노트 §5: SearchAddon 의 decoration 경로는 **음수 폭 계산 시 동기 throw** 한다. 현행처럼 `searchAddonRef.current?.findNext(...)` 를 맨몸으로 호출하면 렌더 트리 위에서 예외가 터져 pane 이 죽는다. §9 함정 #5(provideLinks 동기 throw → 렌더러 사망)와 **동일 계열**. decoration 을 켜는 순간 이 위험이 현실화된다.

또한 정규식 토글은 사용자가 임의 정규식을 넣는 입구다. 잘못된 패턴(`(`), 파국적 백트래킹(`(a+)+$`), 초장문 붙여넣기가 그대로 검색 엔진으로 들어간다.

## 결정

**검색을 세 층으로 쪼개고, xterm SearchAddon 호출은 전부 `safeFind` 를 통해서만 한다.**

1. **순수 모듈** `src/renderer/src/components/Terminal/terminalSearch.ts` — React·xterm 인스턴스 비의존.
   - `MAX_SEARCH_QUERY_LENGTH = 2048`, `clampSearchQuery(q)` — 상한 초과분 절단.
   - `buildSearchOptions({ caseSensitive, regex, wholeWord })` — **호출마다 새 객체**를 만든다. decoration 색(목업 `.match` / `.match.cur` 계열)과 `matchOverviewRuler` / `activeMatchColorOverviewRuler` 포함. *기존 옵션 객체를 변이하지 않는 것이 계약* (목업 시나리오가 재현한 바로 그 버그).
   - `formatMatchCount({ resultIndex, resultCount }, query)` — `''`(쿼리 없음) / `0/0` / `-/N`(활성 매치 없음) / `3/47` / `3/>999`(1000 이상).
   - `isValidRegexQuery(q, regexOn)` — 즉시 UI 피드백용 사전 검증.
   - `safeFind(addon, direction, query, options)` — `findNext`/`findPrevious` 를 try/catch 로 감싸 `{ ok, found }` 반환. 실패 시 `clearDecorations()` 를 시도하고 `console.warn('[terminal-search] find 실패', { sessionId, message })` 를 **세션당 1회**만 남긴다(로그 폭주 방지).
2. **훅** `src/renderer/src/components/Terminal/useTerminalSearch.ts` — open/query/토글/결과/오류 상태 소유, `searchAddon.onDidChangeResults` 구독, 증분 검색 120ms 디바운스, **IME 조합 중 검색 억제**, 닫을 때 `clearDecorations()` + 터미널 포커스 복귀.
3. **뷰** `src/renderer/src/components/Terminal/TerminalSearchBar.tsx` — 목업 레이아웃(입력 · 카운트 · `Aa`/`.*`/`\b` 토글 · ↑ ↓ ✕)만 담당. 상태 없음.
4. **Terminal 옵션에 `overviewRulerWidth: 14` 추가** — xterm 은 이 값이 없으면 overview ruler 자체를 렌더하지 않는다. 커스텀 스트립을 만들지 않고 **xterm 내장 ruler 를 쓴다**(Orca 노트 §5 결론).
5. 검색 실패/잘못된 정규식은 **삼키되 감추지 않는다** — 카운트 자리에 오류 표기 + 토글 테두리 강조. 사용자는 왜 결과가 없는지 알 수 있다(전역 CLAUDE.md §4).

## 대안과 기각 이유

1. **호출부마다 try/catch** — *기각*: 호출 지점이 6곳 이상(입력 onChange, Enter, Shift+Enter, ↑, ↓, 토글 3종 재검색)이고 앞으로 더 는다. 한 곳만 빠뜨려도 렌더러가 죽는다. 방어는 **경계 1곳**에 있어야 한다.
2. **`@xterm/addon-search` 상위 버전/xterm 6.1-beta 로 업그레이드해서 우회** — *기각*: Clauday 는 xterm 5.5 stable 고정이고, 6.x 전환은 B-4~B-6 전체와 addon 5종·patch 를 함께 봐야 하는 별개 결정이다. 업스트림 수정 일정을 통제할 수도 없다.
3. **정규식 토글을 빼서 위험 자체를 제거** — *기각*: 사용자 요청 핵심이고 목업에서 확정됐다. 위험은 `safeFind` + 사전 검증 + 길이 상한으로 관리 가능하다.
4. **decoration/overview ruler 를 직접 그리는 커스텀 스트립** — *기각*: 버퍼 좌표 ↔ 픽셀 변환을 우리가 유지해야 하고, split·resize·webgl 전환마다 다시 깨진다. xterm 내장 ruler 로 충분.
5. **검색 로직을 `TerminalPane` 에 그대로 두고 기능만 추가** — *기각*: 테스트 불가 상태가 고착되고 B-3/B-4 병합 충돌 면적이 커진다. 추출이 오히려 후속 트랙의 diff 를 줄인다.
6. **훅을 `src/renderer/src/hooks/` 로 이동** — *기각*: 그 디렉터리는 앱 전역 훅(useTheme/useFontSettings/useAIProgress)용이다. 터미널 전용 훅은 컴포넌트 옆이 응집도가 높다. (부작용: vitest coverage `include` 밖 → 그래도 테스트는 DoD 로 강제한다.)
7. **쿼리 길이 무제한** — *기각*: 정규식 백트래킹 + decoration 대량 생성이 UI 스레드를 잡는다. 2048자 상한은 실사용 검색어를 전혀 제약하지 않는다.

## 결과 (Consequences)

### 긍정
- `TerminalPane` 에서 검색 코드가 빠져 B-3/B-4 진입 시 파일이 가벼워진다.
- 카운트 포맷·옵션 빌드·쿼리 클램프가 순수 함수라 vitest 로 바로 고정된다.
- decoration/정규식이라는 새 위험 표면을 **도입과 동시에** 방어한다. B-7 의 provider guard 와 같은 언어(guard/safe wrapper)를 쓰게 되어 후속 이식이 자연스럽다.

### 부정 / 트레이드오프
- 파일이 3개 늘고, `TerminalPane` ↔ 훅 사이에 searchAddon ref 전달이라는 배선이 생긴다.
- `safeFind` 가 실패를 삼키므로 **개발 중 실수도 조용해질 수 있다** → warn 로그 + UI 오류 표기 + 테스트로 상쇄.
- 훅이 `components/Terminal/` 에 있어 커버리지 게이트 대상이 아니다 → 테스트 누락을 리뷰에서 잡아야 한다.

### 모니터링
- vitest(순수): `formatMatchCount` 경계(0 / 1 / 999 / 1000 / index -1), `clampSearchQuery`(2048 경계), `buildSearchOptions`(호출 2회의 결과가 **서로 다른 객체**이며 토글이 반영됨), `safeFind`(throw 하는 가짜 addon 에서 예외가 새지 않고 `ok:false`).
- vitest(훅): `renderHook` 으로 토글 변경 시 재검색, 닫기 시 `clearDecorations` 호출.
- 수동: 매치 1000+ 인 긴 로그에서 `>999` 표기, 잘못된 정규식 입력 후 터미널 생존, ruler 마커 클릭 없이도 위치 감이 오는지.
