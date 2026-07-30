---
id: ADR-v2-terminal-p2-04
title: WebGL 렌더러는 visible pane 에만 lazy attach 하고 실패 후 자동 재생성하지 않는다
status: proposed
date: 2026-07-30
supersedes: []
domain: terminal, renderer-only
---

# WebGL 렌더러는 visible pane 에만 lazy attach 하고 실패 후 자동 재생성하지 않는다

## 컨텍스트

xterm 의 DOM 렌더러는 긴 로그와 TUI 재그리기에서 프레임을 놓친다. `@xterm/addon-webgl` 이 표준 해법이지만, 우리 구조에는 두 가지 제약이 있다.

1. **상시 마운트 구조.** 탭/pane 은 숨겨도 언마운트하지 않는다(스크롤백·PTY 바인딩 유지가 목적). 그래서 아무 생각 없이 attach 하면 **pane 수 = WebGL 컨텍스트 수**가 된다. Chromium 은 프로세스당 WebGL 컨텍스트를 ~16개로 제한하고, 초과하면 가장 오래된 컨텍스트를 강제로 잃게 만든다 → **보이는 pane 이 백지가 된다**(Orca 노트 함정 #4). 탭 5개 × 4분할이면 20개다.
2. **컨텍스트 반납이 실제로 안 된다.** `WebglAddon.dispose()` 만으로는 Windows/ANGLE 에서 드라이버 컨텍스트가 살아남아 예산을 계속 잠식한다(Orca #6874).

여기에 context loss 의 고전적 함정이 겹친다. loss 이벤트에서 곧장 재생성하면, 원인이 예산 고갈일 때 **loss → 재생성 → loss** 무한 루프에 빠져 앱이 얼어붙는다.

## 결정

**보이는 pane 에만 attach 하고, 게이트를 순수 함수 하나로 모으고, 실패는 래치로 기억해 자동 재시도하지 않는다.**

### 1. attach 게이트 — `shouldAttachWebgl` 순수 함수

`src/renderer/src/components/Terminal/webglPolicy.ts`:

```ts
/** WebGL attach 5조건. 하나라도 어긋나면 false — 호출자는 false 일 때 반드시 dispose 를 호출한다. */
export function shouldAttachWebgl(input: {
  setting: 'webgl' | 'dom'      // 사용자 설정
  isVisible: boolean            // ADR-01 의 visible (포커스 아님)
  globalFailureLatch: boolean   // 모듈 전역: 초기화 자체가 실패한 적 있음
  paneLossCount: number         // 이 pane 이 현재 가시성 구간에서 겪은 context loss 수
  deferred: boolean             // 리페어런트/복원 replay 진행 중
}): boolean
```

`setting === 'webgl' && isVisible && !globalFailureLatch && paneLossCount === 0 && !deferred` 일 때만 true.

**게이트 미통과 시 호출자는 `dispose()` 를 호출한다.** 참조에 `null` 만 대입하면 마지막 프레임이 캔버스에 남아 stale frame 이 보인다.

### 2. dispose 는 컨텍스트를 명시적으로 반납한다

```
addon.dispose()
→ canvas 들에 대해 getContext('webgl2'|'webgl').getExtension('WEBGL_lose_context')?.loseContext()
→ canvas.width = canvas.height = 0
```

`disposeWebgl(paneRuntime)` 한 함수에 가둔다. 순서가 중요하다 — addon dispose 전에 loseContext 를 부르면 addon 내부가 죽은 컨텍스트를 만진다.

### 3. context loss 후 자동 재생성 금지

- `addon.onContextLoss` → 즉시 `disposeWebgl()` + `paneLossCount++` → DOM 렌더러로 폴백. **같은 가시성 구간에서는 재시도하지 않는다.**
- 래치가 풀리는 유일한 경계: **pane 이 다시 visible 이 되는 순간(reveal)** 과 **윈도우 wake**(`document.visibilitychange` → visible). 이때 `paneLossCount = 0`.
- 초기화 자체가 throw 하면(`new WebglAddon()` / `loadAddon`) **모듈 전역 래치**를 세운다. 앱 수명 동안 WebGL 을 다시 시도하지 않는다. 사용자가 설정을 `dom` → `webgl` 로 다시 토글하면 래치를 해제한다(명시적 사용자 의사 = 유일한 탈출구).

### 4. 설정 — 신규 IPC 채널 0개

`terminalRenderer: 'webgl' | 'dom'` 을 기존 범용 설정 채널(`window.api.settings.get/set`, `SETTINGS_GET`/`SETTINGS_SET`)로 저장한다. `sidebarPrefs` 선례와 동일하다. 기본값은 `'webgl'`.

UI: 목업의 탭바 우측 드롭다운(`.rbtn`/`.rmenu`) — 현재 렌더러 상태(dot + 라벨)를 보여주고 수동 전환 가능. 폴백이 일어나면 라벨이 `DOM (폴백)` 으로 바뀐다. 설정 화면에도 같은 항목을 노출한다.

### 5. DOM 리페어런트 안무 (ADR-02 §4 와 짝)

pane host 가 다른 부모로 옮겨질 때(분할/닫기/이동):

```
scrollState 캡처 (viewportY, baseY)
→ disposeWebgl()
→ appendChild(host)
→ requestAnimationFrame(() => { attachWebglIfAllowed(); fit(); scrollState 복원 })
```

`deferred` 플래그는 이 구간과 복원 replay 구간에서 true 다.

### 6. 데드 코드 정리

`src/renderer/src/components/Terminal/TerminalTabs.tsx`(54줄)은 참조가 0이다(grep 확인). 삭제한다.

## 대안과 기각 이유

1. **모든 pane 에 상시 attach** — *기각*: 컨텍스트 예산 고갈로 보이는 pane 이 백지가 된다. split 을 도입하는 이번 사이클에서는 곧바로 재현되는 버그다.
2. **`@xterm/addon-canvas`(캔버스 렌더러)로 대신** — *기각*: 이미 deprecated 이고 WebGL 대비 이득이 작다. 폴백 대상은 DOM 렌더러(내장, 항상 동작)로 충분하다.
3. **context loss 시 자동 재생성** — *기각*: 원인이 예산 고갈이면 loss↔재생성 루프. Orca 가 실제로 겪고 래치로 해결했다.
4. **`addon.dispose()` 만 하고 `loseContext()` 는 생략** — *기각*: Windows/ANGLE 에서 드라이버 컨텍스트가 살아남아 예산을 잠식한다(#6874). mac 에서만 테스트하면 절대 발견 못 하는 종류의 버그다.
5. **게이트 미통과 시 참조에 `null` 대입만** — *기각*: 캔버스에 마지막 프레임이 남아 stale frame 이 보인다. 반드시 dispose 를 호출한다.
6. **`visible` 대신 `focused` 기준으로 attach** — *기각*: 분할된 pane 중 보이지만 포커스 아닌 pane 도 실시간 출력을 그린다. 그쪽이 DOM 렌더러면 오히려 분할 시 성능이 나빠진다.
7. **xterm 6.x + Orca 의 webgl patch 5종(글리프 아틀라스)까지 가져오기** — *기각*: patch 는 6.x-beta 대상이고, xterm 메이저 업은 breaking change 를 우리 전 코드에 퍼뜨린다. 장수 세션 아틀라스 고갈 증상이 실제로 나오면 그때 참조한다.
8. **설정을 위해 전용 IPC 채널 추가** — *기각*: 범용 `settings` 채널이 이미 있다. 채널을 늘리면 3+1 유지 비용만 는다.

## 결과 (Consequences)

### 긍정
- pane 이 몇 개든 컨텍스트 수가 "보이는 pane 수" 로 유계가 된다.
- 실패 경로가 항상 DOM 렌더러로 수렴한다 — WebGL 이 아예 없는 환경(원격 데스크탑, 구형 GPU 드라이버)에서도 터미널이 동작한다.
- attach 판정이 순수 함수 하나라 5조건의 조합을 전수 테스트할 수 있다.
- 사용자에게 탈출구(설정 토글)가 있어 "우리 환경에서만 깨진다" 는 신고에 즉답할 수 있다.

### 부정 / 트레이드오프
- 탭/pane 을 전환할 때마다 attach/dispose 가 일어난다 — 전환 시 수 프레임의 히칭. rAF 안에서 처리하고 scrollState 를 복원해 체감을 줄이지만 0은 아니다.
- 한 번 loss 를 겪은 pane 은 다시 보이기 전까지 DOM 렌더러다. 사용자에게는 "어떤 탭만 느리다" 로 보일 수 있다 → 렌더러 라벨에 상태를 노출해 원인을 알 수 있게 한다.
- `globalFailureLatch` 가 모듈 전역이라 테스트 간 오염 가능성이 있다 → 래치 리셋 함수를 export 하고 `beforeEach` 에서 호출한다.
- WebGL 은 폰트 렌더링이 DOM 과 미묘하게 다르다(특히 한글 폰트 fallback). 폭 문제는 unicode provider(ADR-05 §unicode)가 담당하지만, 굵기/안티에일리어싱 차이로 "글씨가 달라 보인다" 는 신고가 올 수 있다.

### 모니터링
- vitest `webglPolicy.test.ts` — 5조건 각각을 단독으로 어긋뜨린 5케이스 + 전부 통과 1케이스 + `setting: 'dom'` 우선순위.
- vitest — loss 시뮬레이션: `onContextLoss` 발화 → `dispose` 호출 확인 → 같은 가시성 구간 재요청이 false → reveal 후 true.
- 수동 QA: ①탭 5개 × 4분할(=20 pane) 생성 후 탭 순회 — 백지 pane 없음 ②설정에서 `dom` 전환 → 즉시 반영 + 재시작 후 유지 ③Windows VM 에서 동일 시나리오(ANGLE 경로) ④`chrome://gpu` 대신 devtools 콘솔의 WebGL 경고 관찰.
</content>
