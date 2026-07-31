# Orca 흡수 구현 노트 (v2.0)

> 분석 대상: [stablyai/orca](https://github.com/stablyai/orca) v1.4.162 (MIT, Copyright (c) 2026 Lovecast Inc.)
> 분석일: 2026-07-30. 아래 경로는 Orca 저장소 기준. 로컬 클론은 세션 scratchpad에 있었으므로 필요 시 재클론.
>
> **라이선스**: verbatim 복사 파일에는 상단에 Orca(Lovecast Inc.) MIT 고지 주석 + 프로젝트 `THIRD-PARTY-NOTICES.md` 등재.
> `terminal-links.ts`/`terminal-bare-file-link-detection.ts` 는 **VSCode(Microsoft, MIT) 파생**이라 이중 고지 필요.
> `tab-drag-pointer-sensor.ts` 는 dnd-kit 포크라 dnd-kit MIT 고지도 병기.

## 0. 전제: 스택 차이

- Orca: xterm **6.1.0-beta** + pnpm patch 5종(xterm/serialize/webgl/ligatures/node-pty). Clauday: xterm **5.5 stable**.
- 베타/패치 전용 API 주의: `translateToString(..., outColumns)`, `vtExtensions.kittyKeyboard`, webgl 패치 5종.
  → **stable에 없는 API는 폴백 경로만 이식** (예: wrapped-link의 `translateLineWithCells` 셀 단위 폴백).
- Orca의 주 영속화 경로는 main 프로세스 `@xterm/headless` 미러 모델(모델-뷰 분리)이다. Clauday B-5는
  renderer serialize 방식(Orca의 보조 경로와 동일)으로 간다 — 단 아래 §3의 교정 사항은 반드시 반영.

## 1. 링크 프로바이더 (B-7)

구조: **web-links addon은 URL 전용으로 유지**, 파일 경로는 자체 `registerLinkProvider`. 5중 레이어.

반드시 가져갈 것:
- **`terminal-link-provider-guard.ts` (60줄, verbatim)** — `registerLinkProvider`를 monkey-patch로 감싸
  모든 provider(addon 내부 포함)의 동기 throw를 차단. web-links의 `RangeError`가 렌더러를 죽이는 실크래시 대응.
  등록 위치: `new Terminal()` 직후, `loadAddon` **전**.
- **경로 정규식**: `terminal-links.ts`(VSCode 포팅) — 구분자 필수 패턴 + 공백 경로 3-pass(ReDoS 회피로 필터는 코드에서)
  + bare filename(존재 검증 필수 통과) + `Makefile` 등 무확장자 화이트리스트. 확장자 화이트리스트 방식 폐기.
- **wrap 재구성**: `wrapped-terminal-link-ranges.ts` (347줄) — soft wrap(`isWrapped` 추적, 상한 200행/20k자)과
  **hard wrap**(Claude Code TUI가 경로를 물리적으로 쪼갬 — `isWrapped` 없음, 최대 20행 역스캔 + 조각 판정 술어) 둘 다.
  hard wrap 처리가 없으면 claude 출력의 긴 경로는 영원히 안 잡힌다.
- **line:col**: `/^(.*?)(?::(\d+))?(?::(\d+))?$/` + line<1/col<1 거부 + bare root(`/`, `C:/`) 디렉터리 거부.
- **존재 검증**: 후보를 main IPC(`shell.pathExists` 상당)로 확인, **LRU 캐시 1024** (`terminal-path-exists-cache.ts`, verbatim).
  검증 완료 시점에 라인 fingerprint 재확인 — 버퍼가 바뀌었으면 결과 폐기(stale link 방지).
- **중복 해소**: 텍스트 길이 내림차순 → 겹치지 않는 것만(`preferLongestNonOverlappingLinks`).
- **cwd 해석**: pane별 cwd(§2 OSC 7) 기준. 폴백: spawn cwd → `pty.getCwd`(lsof/proc).
- Cmd+클릭 3대 버그 수정 모듈: `terminal-linkifier-click-priming.ts`(정지 커서 밑 새 링크 첫클릭 씹힘),
  `terminal-link-pty-mouse-suppression.ts`(마우스 aware TUI 이중 열림), activate 시 `clearSelection()`(드래그 폭주).

## 2. 셸 통합 (OSC 7/133) — 선택 이식

- OSC 7(cwd 보고): `parse-osc7.ts` (53줄, verbatim — Windows 드라이브/UNC 처리 포함).
  renderer `parser.registerOscHandler(7, ...)` 등록은 **PTY 연결 전** (replay가 첫 OSC 7을 놓치지 않게).
  rc 주입(zsh ZDOTDIR 하이재킹/bash rcfile)은 무거움 — v2.0에서는 **주입 없이 수신만** 하고
  (사용자 셸에 이미 OSC 7을 쏘는 설정이 흔함), 링크 cwd 폴백은 spawn cwd + `pty.getCwd`.
- OSC 133(프롬프트 마킹): `registerOscHandler(133, () => true)`로 최소한 **화면 오염 방지**만.
  에이전트 완료 감지 활용은 백로그. Orca 경고: full-screen 에이전트의 nested shell이 133;D를 누출 —
  process-table 확인 없이 신뢰 금지.
- zsh 함정(#8003): **한글 사용자명 환경에서 zsh가 특정 UTF-8 바이트의 환경변수 값을 오염** —
  ZDOTDIR 대신 `${(%):-%x}`로 자기 경로 유도. rc 주입을 하게 되면 필수.

## 3. 스크롤백 영속화 (B-5) — 계획 교정 3건

1. **복원 순서는 fit→resize→write가 아니다.**
   `resize(스냅샷 cols/rows) → clear('\x1b[2J\x1b[3J\x1b[H') → write(스냅샷) → parse 완료 대기 → fit → PTY resize → (POSIX) SIGWINCH 명시 발신`.
   fit을 먼저 하면 soft-wrap 행이 다른 컬럼수로 재랩되어 깨짐(Orca #7279).
2. **`serializeWithAbsoluteCursor` 필수** (`terminal-serialize-absolute-cursor.ts`, 95줄 verbatim) —
   SerializeAddon은 커서를 상대 이동으로 복원하므로 wrap-pending 상태에서 한 칸 어긋난다. 절대 CUP 접미 부착.
3. **replay guard 필수** (`replay-guard.ts`) — xterm은 DA1/CPR 등 쿼리에 onData로 자동 응답 →
   녹화 바이트 replay 시 셸 프롬프트에 stray reply가 찍힌다. replay 중 onData 게이팅(완료는 write callback 기준).

추가 채택:
- alt-buffer 처리: `excludeAltBuffer` 대신 Orca는 `?1049h` 마커 위치로 스냅샷을 직접 split
  (`terminal-snapshot-replay-paint.ts`, 62줄 — alt 복원 안무 포함). 우리는 `excludeAltBuffer`로 시작하되
  TUI 복원 품질 문제가 생기면 이 방식으로.
- `POST_REPLAY_MODE_RESET` 상수 세트(커서 스타일/kitty/마우스 리포팅/bracketed paste 리셋) 이식.
- replay 후 `'\r\n'` 1회 (zsh PROMPT_EOL_MARK `%` 방지).
- 용량 캡은 UTF-8 **바이트** 기준(`.length` 아님), leaf당 512KB. 축소는 secant 보간 최대 4 probe(비용 절감).
- 저장 게이트: 복원 중 `shouldPersistLayout=false` — 미완성 트리가 자기 스냅샷을 덮어쓰는 것 방지.

## 4. WebGL (B-6) — 계획 확정 + 보강

- visible pane만 attach는 계획대로. 보강:
  - dispose 시 **`WEBGL_lose_context.loseContext()` 명시 호출 + canvas 0×0** (Windows/ANGLE이 드라이버 컨텍스트를
    살려둬 예산 잠식 — Orca #6874).
  - context loss 후 **자동 재생성 금지**(루프 방지) — reveal/wake 경계에서만 재시도. 모듈 전역 실패 래치.
  - attach 게이트에 5조건: 킬스위치/설정/정책/deferred/loss-후. 게이트 미통과 시 **dispose 호출**(null 대입만 하면 stale frame).
  - DOM 리페어런트(분할/이동) 전후: `disposeWebgl → rAF → attachWebgl` + scrollState 캡처→지연 복원 + rAF 내 fit.
- xterm 5.5용 addon-webgl 버전 짝 확인. Orca의 patch 5종(글리프 아틀라스 등)은 6.x-beta 대상이라 미적용 —
  동일 증상(장수 세션 아틀라스 고갈) 발견 시 참고: `config/patches/@xterm__addon-webgl@*.patch`.

## 5. Split pane / 탭 (B-4, B-8) — 설계 교정

- **트리는 renderer 소유** (main 아님). 저장 시점에만 main에 flush. split/resize마다 IPC 왕복 금지.
- **이진 트리 채택**: `{type:'split', direction, first, second, ratio?}` — collapse가 "형제 승격" 3줄.
  n-ary children+sizes 안(원계획)은 폐기. 3분할 균등은 equalize 가중치(`getEqualizeWeight`)로.
  ratio는 0.5±0.005면 저장 생략, 3자리 양자화(JSON diff 노이즈 제거).
- **leaf 식별**: 영속 `leafId`(UUID) + 휘발 세션 바인딩. published 후 leafId 교체 금지(`pane-identity-registry.ts`).
- **React 재귀 렌더 주의**: xterm 인스턴스를 트리 밖 `Map<paneId, Terminal>`에 보관, leaf 컴포넌트는
  빈 div + effect로 attach/re-attach만. 재조정으로 xterm이 리마운트되면 스크롤백/alt/PTY 바인딩 소실.
- 리사이즈 핸들: 넓은 투명 히트박스 + `::after` 시각선(교차선은 음수 inset으로 연결), `setPointerCapture`
  + window 캡처 이중화, rAF flex 코얼레싱, **드래그 중 PTY resize 홀드(드롭 시 1회)**, 더블클릭 50/50,
  적응형 최소폭 `Math.min(MIN, total/2)`. → `pane-divider-drag.ts` (309줄, verbatim A급).
- exit 처리: **우리 계획(exited 오버레이)이 Orca보다 낫다** (Orca는 상태 필드가 없어 휴리스틱 부채).
  단 Orca의 "**suppressed exit**"(의도적 재시작 시 exit 무시 예약)과 ptyId 스코프 at-most-once 가드는 채택.
- 탭 reorder(B-8): **@dnd-kit** (HTML5 DnD 아님 — Electron에서 취약). 탭은 transform 없이 고정,
  2px 삽입 인디케이터만 이동. 커스텀 PointerSensor(12px + 2샘플 확인). 순서 진실은 `tabOrder: string[]` 단일.
  닫힘 후 활성 탭은 **MRU 스택**(`pickNextActiveTab`). missed-end fallback(window pointerup/blur) 필수.
  ※ 태스크 드로어의 외부→pane 드롭은 계획대로 HTML5 DnD 유지(Orca도 파일 드롭은 native).
- paste 오배달 방지: 클립보드 read가 비동기라 **paste 타겟 4중 재검증**(paneId+leafId+transport+ptyId)
  (`terminal-paste-target-state.ts`, verbatim).
- 검색: `safeFind` 래퍼(decoration 음수폭 동기 throw → 터미널 전체 사망 방지) + 쿼리 2KB 상한.
  overview ruler는 xterm 내장(`matchOverviewRuler`) 사용 — 커스텀 스트립 불필요.
- 활성 pane의 OSC 타이틀만 탭 제목으로 전파(분할 에이전트 2개의 제목 깜빡임 방지).

## 6. 키바인딩 (Workstream D) — 하이브리드 설계

Orca 하부 모듈 + Clauday 상부 설계(useShortcut 훅 + activeView 스코프)의 하이브리드.

Orca에서 이식 (verbatim 후보):
- **파서/매처/포매터/충돌 검출** (`shared/keybindings.ts:1135-2382`) — 비라틴 레이아웃(키릴/그리스),
  macOS Option dead-key, AltGr 오인 방지, IME `keyCode 229` 등 **레이아웃 폴백 ~450줄은 재발명 불가 수준**.
  단일 파일 대신 `registry/parse/format/match/conflicts`로 분할.
- **`keybinding-file.ts`** (469줄) — 전용 파일(`~/.clauday/keybindings.json` 상당), atomic write,
  `platforms.{darwin,linux,win32}` 섹션, 값 관대 파싱(null/false=비활성), **diagnostics 배열**
  (잘못된 손편집이 앱을 잠그지 못함 — throw 대신 무시+경고 누적, 충돌 오버라이드 자동 제거 20회 수렴).
- `isEditableTarget` (23줄) — **xterm helper textarea 예외** 포함. 없으면 터미널 포커스 시 전역 단축키 전멸.
- `defaultPrevented`를 계층 간 프로토콜로: window 핸들러끼리 / window→xterm(`xterm-bypass-policy.ts` —
  kitty 프로토콜이 Cmd+C copy를 죽이는 문제의 해법, 주석 자체가 자산) / main→renderer.
- **메뉴는 accelerator를 쓰지 않는다** — `label: "동작\t⌘⇧D"` 표시 전용 힌트 + 변경 시 rebuild.
  (accelerator는 renderer 로직을 우회 — 우리 index.ts의 `accelerator: ''` 전략과 같은 결론)
- `terminalShortcutPolicy: 'app-first'|'terminal-first'` 설정 + `allowInTerminal` 필드 —
  Claude TUI 키를 앱이 먹는 컴플레인의 최소비용 해법. + 첫 가로챔 시 1회성 토스트(+"단축키 설정 열기").
- `conflictGroup`(스코프와 분리된 충돌 버킷), 액션당 **복수 바인딩 배열**, digit-index 대표행(⌘1–9 = 1행),
  Disable 시 직전 값 `disableMemory` 원클릭 복원, 충돌 보고는 "커스터마이즈된 액션 관련만"(기본값끼리 의도적
  중복은 노이즈 금지), Shift 2연타는 합성 입력으로 매처에 흘리는 double-tap detector.

Clauday 쪽이 나은 것 유지: `useShortcut` 훅(Orca는 App.tsx 430줄 디스패처 + 액션 추가 시 5곳 수정),
`activeView` 선언적 스코프(Orca는 명령형 가드 산재), 스코프의 런타임 강제.

## 7. IME / 유니코드 (신규 B-9) — 한글 사용자 직결

xterm 패치 없이 독립적으로 붙는 것만 (패치 전제 모듈은 스코프 아웃):
- **`terminal-unicode-provider.ts` (verbatim)** — Unicode11 위에 ZWJ 이모지 폭 보정.
  **활성화는 반드시 `terminal.open()` 직후, 모든 복원 write 전** (폭은 write 시점 테이블로 버퍼에 박힘 —
  늦으면 wide 문자가 단일 셀 배치되어 `?` 깨짐. Orca의 "테이블 깨짐 #4877" 오진 사례가 이것).
- `terminal-ime-candidate-anchor.ts` + `terminal-ime-anchor.ts` — IME 후보창 위치를 실제 커서 셀에 앵커
  (`.xterm-screen` bounds로 셀 크기 유도, private API 미사용).
- `terminal-ime-composition-tracker.ts` + `terminal-ime-candidate-key-release-guard.ts` —
  조합 상태 추적 + 중국어/일본어 IME 후보 선택키(Space/숫자) 가드.
- Windows 한글 관련: PTY env `PYTHONUTF8=1`, cmd `chcp 65001`, PowerShell `[Console]::OutputEncoding=UTF8`,
  git-bash `chcp.com 65001` (claude 같은 WriteFile 기반 TUI의 `❯`→`Γ¥»` 모지바케 방지) — A-2와 병합.
- `macOptionIsMeta: false` 유지 (비US 레이아웃의 Option 조합 문자).

## 8. PTY 스폰 (A-2 보강)

- `useConptyDll: true` (node-pty 번들 ConPTY — 레거시 시스템 ConPTY는 wrap marker가 부정확).
- xterm `windowsPty`: `{backend:'conpty', buildNumber}` 단 **buildNumber < 21376이면 생략**
  (구형 ConPTY의 wrap marker 오보고 방지) — `windows-pty-compatibility.ts` 로직 이식.
- Windows Store **App Execution Alias 함정**: `%LOCALAPPDATA%\Microsoft\WindowsApps\` 의 pwsh/powershell
  스텁은 0바이트 reparse point — PATH 후보에서 제외(`isFile && size > 0`), 절대경로 후보만.
  detectWindowsShell()에 반영.
- 폴백 체인: 요청 셸 → inbox PowerShell → cmd.exe, **각 시도마다 args 재계산**(cmd도 chcp 필요).
- env: `TERM_PROGRAM=Clauday`, `FORCE_HYPERLINK=1`(supports-hyperlinks가 미지의 TERM_PROGRAM을 거부).

## 9. 함정 요약 (구현 중 재확인용)

| # | 함정 | 출처 |
|---|---|---|
| 1 | fit을 복원 write 전에 하면 soft-wrap 재랩 | Orca #7279 |
| 2 | replay 시 xterm 자동 쿼리 응답이 셸에 유출 | replay-guard |
| 3 | SerializeAddon 상대 커서가 wrap-pending에서 1칸 어긋남 | absolute-cursor |
| 4 | hidden pane WebGL 컨텍스트 미반납 → visible pane 백지 | 컨텍스트 예산 |
| 5 | provideLinks 동기 throw → 렌더러 사망 | provider-guard |
| 6 | 존재 검증 IPC에 LRU 캐시 없으면 hover마다 IPC 폭주 | path-exists-cache |
| 7 | Unicode provider 활성화가 복원 write보다 늦으면 폭 깨짐 | #4877 |
| 8 | React 재조정으로 xterm 리마운트 → 버퍼/PTY 바인딩 소실 | 명령형 분리 |
| 9 | 드래그 중 SIGWINCH 폭주 → TUI 매 프레임 재그리기 | resize 홀드 |
| 10 | 복원 도중 onLayoutChanged가 미완성 트리를 저장 | persist 게이트 |
| 11 | WindowsApps 별칭 스텁을 ConPTY가 ACCESS_DENIED | alias 함정 |
| 12 | menu accelerator가 renderer 단축키 로직을 우회 | 표시 전용 힌트 |
