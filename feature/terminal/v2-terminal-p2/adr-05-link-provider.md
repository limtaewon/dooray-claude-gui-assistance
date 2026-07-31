---
id: ADR-v2-terminal-p2-05
title: 터미널 링크는 web-links(URL) + 자체 5중 레이어 파일 경로 provider 로 재작성하고 존재 검증을 IPC 로 뺀다
status: proposed
date: 2026-07-30
supersedes: []
domain: terminal, electron-ipc, renderer-only
---

# 터미널 링크는 web-links(URL) + 자체 5중 레이어 파일 경로 provider 로 재작성하고 존재 검증을 IPC 로 뺀다

## 컨텍스트

사용자가 "Cmd+클릭으로 경로가 안 열린다" 고 보고했다. 현행 구현(`src/renderer/src/components/Terminal/TerminalPane.tsx:120-197`)은 라인 단위 정규식 스캔이고, 구조적 한계가 다섯 가지다.

| # | 한계 | 결과 |
|---|---|---|
| ① | `terminal.buffer.active.getLine(lineNum - 1)` 한 줄만 본다 | wrap 된 경로 미탐지 |
| ② | 확장자 화이트리스트(`tsx?|jsx?|py|…`) | 디렉터리, `Makefile`, `Dockerfile`, 확장자 없는 바이너리 전부 제외 |
| ③ | 절대경로(`/`, `~`, `C:\`)로 시작해야만 매칭 | claude 가 흔히 출력하는 `src/main/index.ts` 같은 **상대 경로**를 못 잡는다 |
| ④ | `~` 를 그대로 `shell.openPath` 에 넘긴다 | OS 가 `~` 를 확장하지 않아 실패 |
| ⑤ | 공백 포함 경로는 따옴표가 있을 때만 | `/Users/x/Application Support/…` 실패 |

여기에 결정적인 것이 하나 더 있다. **Claude Code TUI 는 긴 경로를 hard wrap 으로 출력한다** — xterm 의 `isWrapped` 플래그 없이 물리적으로 다음 줄에 이어 찍는다. hard wrap 재구성이 없으면 claude 출력의 긴 경로는 어떤 정규식으로도 영원히 안 잡힌다(Orca 노트 §1).

추가로 안정성 문제가 있다. xterm 의 `provideLinks` 는 **동기 throw 를 잡아주지 않는다**. `@xterm/addon-web-links` 자체가 특정 입력에서 `RangeError` 를 던져 렌더러 전체를 죽인 사례가 Orca 에 기록돼 있다(함정 #5).

## 결정

**URL 은 addon 에 맡기고, 파일 경로는 5중 레이어 자체 provider 로 재작성한다. 존재 검증은 main IPC + 렌더러 LRU 로 뺀다.**

### 레이어 0 — provider guard (가장 먼저)

`terminalLinkProviderGuard.ts` (Orca `terminal-link-provider-guard.ts`, verbatim 급 이식 — ADR-06 고지 대상):
`terminal.registerLinkProvider` 를 monkey-patch 로 감싸 **모든** provider(addon 내부 포함)의 동기 throw 를 삼키고 `console.warn` 으로 강등한다.

**등록 위치는 `new Terminal()` 직후, `loadAddon()` 보다 먼저.** 순서가 틀리면 addon 이 patch 되지 않은 원본을 잡아간다.

### 레이어 1 — URL: `@xterm/addon-web-links`

URL 전용으로만 로드한다. 자체 provider 는 URL 패턴을 다루지 않아 두 provider 의 범위가 겹치지 않는다.

### 레이어 2 — 경로 후보 추출 (VSCode 포팅)

`terminalPathRegex.ts` — VSCode 의 `terminalLinkParsing` 계열 포팅(Microsoft, MIT → **이중 고지**).

- 구분자 필수 패턴(`/` 또는 `\` 포함) + 상대 경로 허용(`./`, `../`, `src/foo.ts`)
- **공백 경로 3-pass**: 1) 따옴표 안 2) 구분자 이후 공백을 포함해 최대 확장 후보 3) 공백 없는 보수 후보. ReDoS 회피를 위해 정규식이 아니라 **코드에서 후보를 좁힌다**.
- **bare filename**(`Makefile`, `package.json` 처럼 구분자 없는 이름)은 후보로 잡되 **존재 검증 필수 통과** 조건을 붙인다. 무확장자 화이트리스트(`Makefile`/`Dockerfile`/`LICENSE`/`Gemfile` 등)를 둔다.
- **확장자 화이트리스트 방식은 폐기**한다.

### 레이어 3 — wrap 재구성

`wrappedLinkRanges.ts` (Orca `wrapped-terminal-link-ranges.ts` 이식, adapted):

- **soft wrap**: `bufferLine.isWrapped` 를 따라 앞뒤로 이어붙인다. 상한 200행 / 20,000자.
- **hard wrap**: `isWrapped` 가 없는데도 이어지는 경우. 최대 20행 역스캔 + "조각 판정 술어"(앞 줄이 컬럼 끝까지 꽉 찼고, 경로 문자로 끝나며, 다음 줄이 경로 문자로 시작).
- 문자열 인덱스 ↔ 셀 좌표 변환은 **셀 단위 폴백**으로 구한다. xterm 5.5 에는 `translateToString(..., outColumns)` 가 없으므로 `line.getCell(x)` 를 순회하며 매핑 테이블을 만든다(Orca 노트 §0). 기존 `stringIndexToCell`(하드코딩 wide range 표)은 이 매핑으로 대체된다 — East Asian Wide 판정을 우리가 다시 하지 않고 **xterm 이 실제로 배치한 셀**을 읽는다.

### 레이어 4 — 정규화 · line:col

- `line:col` 접미: `/^(.*?)(?::(\d+))?(?::(\d+))?$/`. `line < 1` / `col < 1` 은 거부. bare root(`/`, `C:/`)는 디렉터리로도 거부한다.
- `~` 확장은 **main 에서** 한다(A-0 의 `expandHome()` 재사용) — 렌더러는 홈 경로를 모른다.
- 상대 경로는 pane cwd 기준으로 해석한다. cwd 우선순위: **OSC 7 수신값 → 세션 spawn cwd → (POSIX 한정) main 의 pid cwd probe**.

### 레이어 5 — 존재 검증 (IPC + 캐시)

신규 채널 `TERMINAL_RESOLVE_PATH` (`'terminal:resolve-path'`, `invoke`, **배치**):

```ts
// 요청: 한 줄에서 뽑은 후보 전체를 1회에
{ sessionId?: string; cwdHint?: string; candidates: string[] }
// 응답 (요청과 같은 순서)
Array<{ candidate: string; resolved: string | null; kind: 'file' | 'directory' | null }>
```

- main 은 `expandHome` → `resolve(cwd, candidate)` → `fs.promises.stat`. 정지한 네트워크 마운트 대비 **300ms 레이스 타임아웃**(초과 시 미존재 취급).
- **렌더러 LRU 1024**(`pathExistsCache.ts`, Orca `terminal-path-exists-cache.ts` 이식). 키는 `cwd + '\0' + candidate`. 음수 결과도 캐시한다.
- **fingerprint 재검증**: 비동기 검증이 끝난 시점에 해당 라인의 fingerprint(행 번호 + 텍스트 해시)를 다시 확인한다. 버퍼가 바뀌었으면 결과를 폐기한다(stale link 방지).
- **최장 비중첩 선택**: 후보를 텍스트 길이 내림차순 정렬 후 겹치지 않는 것만 채택(`preferLongestNonOverlappingLinks`).

### pid cwd probe (POSIX 한정)

`sessionId` 를 받은 main 이 `TerminalManager` 에서 PTY pid 를 얻어:
- darwin: `execFile('lsof', ['-a', '-d', 'cwd', '-p', pid, '-Fn'])`
- linux: `readlink('/proc/<pid>/cwd')`
- win32: **미지원** — `cwdHint`(OSC 7/spawn cwd)만 사용

TTL 3초 캐시 + 단일 비행(같은 pid 동시 요청은 하나로 합침) + 실패는 무시(warn 1회). 사용자가 `cd` 한 뒤 claude 를 띄우는 흔한 흐름을 살리기 위한 것이며, 킬 스위치로 끌 수 있게 한다.

### OSC 7 — 수신만

`parser.registerOscHandler(7, …)` 를 **PTY 연결 전에** 등록한다(replay 가 첫 OSC 7 을 놓치지 않게). `parseOsc7()` 은 Orca `parse-osc7.ts` 이식(Windows 드라이브/UNC 처리 포함). **rc 주입은 하지 않는다.** OSC 133 은 `registerOscHandler(133, () => true)` 로 화면 오염 방지만 한다.

### Cmd+클릭 3버그 모듈

1. `linkClickPriming.ts` — 커서가 멈춰 있는 자리에 새 링크가 그려지면 첫 클릭이 씹히는 문제(xterm 이 hover 상태를 갱신하지 않음). 마우스 이동 없이도 링크 상태를 프라이밍한다.
2. `ptyMouseSuppression.ts` — 마우스 aware TUI(마우스 리포팅 모드)에서 클릭이 앱과 링크 양쪽에 전달돼 이중으로 열리는 문제. 링크 activate 시 해당 클릭의 PTY 마우스 시퀀스 송신을 억제한다.
3. `activate` 진입 시 `terminal.clearSelection()` — 클릭이 드래그로 오인돼 선택이 폭주하는 문제.

### unicode provider (B-9 에서 이관)

`terminalUnicodeProvider.ts` (Orca `terminal-unicode-provider.ts` 이식) — Unicode11 위에 ZWJ 이모지 폭 보정. **활성화는 `terminal.open()` 직후, 모든 write(복원 replay 포함) 전.** 늦으면 폭 테이블이 write 시점 값으로 버퍼에 박혀 wide 문자가 `?` 로 깨진다(함정 #7). 시퀀스상의 위치는 ADR-03 §7 의 5번 단계다.

## 대안과 기각 이유

1. **현행 정규식을 조금씩 고쳐 쓴다(확장자 목록 추가 등)** — *기각*: ①~⑤ 중 ①(wrap)과 ③(상대 경로)은 정규식 수정으로는 원리적으로 해결되지 않는다. 라인 재구성과 cwd 해석은 별도 레이어가 필요하다.
2. **`@xterm/addon-web-links` 하나로 URL·파일 경로 모두 처리** — *기각*: 이 addon 은 URL 전용이다. 파일 경로 지원이 없고, 있어도 존재 검증/상대 경로 해석은 앱이 해야 한다.
3. **존재 검증 없이 정규식 매칭만으로 링크 표시** — *기각*: 로그에 나오는 무수한 "경로처럼 생긴 문자열"(패키지명 `@scope/pkg`, 날짜 `2026/07/30`, URL 조각)이 전부 밑줄이 그어져 노이즈가 된다. bare filename 을 허용하려면 검증이 필수다.
4. **존재 검증을 렌더러에서 `fs` 로 직접** — *기각*: contextIsolation 환경에서 렌더러는 `fs` 에 접근할 수 없고, 접근하게 만들면 보안 모델이 무너진다.
5. **검증 IPC 를 후보 1건씩 호출** — *기각*: hover 한 번에 라인당 수~수십 후보다. 배치 + LRU 없이는 IPC 폭주(함정 #6).
6. **캐시를 main 에 두기** — *기각*: 폭주를 막아야 하는 지점은 **IPC 경계 앞**이다. main 캐시는 왕복 자체를 줄이지 못한다.
7. **hard wrap 을 무시하고 soft wrap 만 처리** — *기각*: 정확히 그 경우가 사용자가 신고한 케이스(claude TUI 출력)다.
8. **OSC 7 을 위해 셸 rc 를 주입** — *기각*: zsh `ZDOTDIR` 하이재킹은 한글 사용자명 환경에서 환경변수 오염 버그(#8003)를 밟는다. 침습적이고 실패 시 사용자 셸이 망가진다. spawn cwd + pid probe 로 대부분 커버된다.
9. **pid cwd probe 도 생략하고 spawn cwd 만** — *기각*: "터미널 열고 `cd project` 후 claude 실행" 이 가장 흔한 흐름이다. 그 경우 spawn cwd(홈)를 기준으로 상대 경로를 풀면 전부 미존재로 떨어진다. probe 는 POSIX 한정·TTL 캐시·실패 무시라 비용이 유계다.
10. **provider guard 없이 try/catch 를 우리 provider 안에만** — *기각*: 렌더러를 죽인 실제 사례는 **addon 내부**의 throw 였다. 등록 지점을 감싸야 addon 까지 보호된다.

## 결과 (Consequences)

### 긍정
- 사용자가 보고한 5가지 미탐지 케이스가 전부 해소되고, claude TUI 출력의 hard wrap 경로가 처음으로 잡힌다.
- 링크 provider 의 어떤 예외도 렌더러를 죽이지 않는다.
- 셀 단위 매핑으로 대체하면서 한글/이모지 폭에 대한 자체 하드코딩 테이블(`isWideCodePoint`)이 사라진다 — xterm 이 실제로 배치한 셀을 읽으므로 폭 오차가 원천 제거된다.
- `terminal:resolve-path` 는 워크스페이스 트랙(C-3.5 태스크 드롭)에서도 재사용 가능한 일반 유틸이 된다.

### 부정 / 트레이드오프
- 링크 계산이 비동기가 된다(존재 검증 IPC). hover 직후 아주 짧은 지연 뒤 밑줄이 생긴다. 캐시 히트 시에는 동기와 구분 불가.
- 모듈이 8~9개로 늘어난다(guard/정규식/wrap/캐시/OSC7/click-priming/mouse-suppression/unicode/정책). `TerminalPane` 은 줄지만 폴더가 넓어진다 → `Terminal/links/` 서브폴더로 묶는다.
- pid cwd probe 는 `lsof` 를 spawn 한다. TTL 3초라도 여러 pane 에서 동시에 나가면 프로세스 스파이크가 생길 수 있다 → 단일 비행 + pane 당 최대 1회/3초로 제한하고, 킬 스위치를 둔다.
- VSCode 포팅 정규식은 **우리가 작성하지 않은 로직**이다. 동작을 바꾸려면 원본 의도를 먼저 읽어야 한다 → 이식 파일 상단에 원본 경로와 커밋 시점을 남긴다(ADR-06).
- 존재 검증이 필수가 되면서, 아직 생성되지 않은 파일 경로(예: claude 가 "이제 만들겠습니다" 라고 출력한 경로)는 링크가 안 된다. 이는 의도된 트레이드오프다.

### 모니터링
- vitest `terminalPathRegex.test.ts` — 사용자 실패 사례 픽스처(`__fixtures__/terminal-links/*.txt`) 기반 회귀 + 공백 경로 3-pass + bare filename + line:col 경계(`:0`, `:-1`, `:1:0`) + bare root 거부.
- vitest `wrappedLinkRanges.test.ts` — soft wrap 2행/3행, hard wrap(플래그 없음) 재구성, 상한 200행 초과 시 중단, 셀 매핑이 한글 혼재 라인에서 정확.
- vitest `pathExistsCache.test.ts` — LRU 1024 축출 순서, 음수 캐시, 키 충돌(cwd 다름).
- vitest `terminalLinkProviderGuard.test.ts` — throw 하는 provider 를 등록해도 `provideLinks` 호출이 예외를 전파하지 않고 warn 1회.
- vitest(main) `resolvePath` 핸들러 — 존재/미존재/디렉터리/`~` 확장/상대 경로/타임아웃, 그리고 `process.platform` 을 `darwin`·`linux`·`win32` 로 명시한 pid probe 분기 3케이스.
- 수동 QA: ①claude 로 긴 경로 출력 후 Cmd+클릭 ②`ls -la` 결과의 디렉터리 클릭 ③`Makefile` 클릭 ④`src/main/index.ts:120:8` 클릭 ⑤한글 폴더명 경로 ⑥`cd` 후 상대 경로 ⑦존재하지 않는 경로는 밑줄 없음 ⑧vim(마우스 모드) 안에서 클릭 시 이중 열림 없음.
</content>
