# Domain — Terminal

> `node-pty` (메인) + `@xterm/xterm` (렌더러) 로 만든 터미널. 한글/UTF-8/PATH 보강이 핵심.

## 핵심 파일

- `src/main/terminal/TerminalManager.ts` — PTY 세션 라이프사이클 + 출력 버퍼링 + sanitize
- `src/renderer/src/components/...` (xterm 사용처) — 렌더러측 표시
- `src/shared/types/terminal.ts` — 세션 타입

## 세션 라이프사이클

```
renderer                 main                              OS
  │                       │                                 │
  │── IPC create ────────▶│                                 │
  │                       │── pty.spawn(shell, ['-l']) ────▶│
  │                       │◀─ onData (청크) ─────────────── │
  │◀── TERMINAL_OUTPUT ───│                                 │
  │                       │                                 │
  │── input(keystroke) ──▶│── pty.write ───────────────────▶│
  │                       │                                 │
  │── resize(cols,rows) ─▶│── pty.resize ──────────────────▶│
  │                       │                                 │
  │── kill ──────────────▶│── pty.kill ────────────────────▶│
```

세션 메타 (id, name, pid, cwd, createdAt) 는 `electron-store` 에 영속화. 앱 재시작 시 *세션 이름만* 복원 (PTY 본체는 새로 spawn).

## 한글/UTF-8 강제

macOS/Linux 한정:

```ts
LANG: process.env.LANG || 'ko_KR.UTF-8',
LC_ALL: process.env.LC_ALL || process.env.LANG || 'ko_KR.UTF-8',
LC_CTYPE: process.env.LC_CTYPE || process.env.LANG || 'ko_KR.UTF-8',
```

Windows 는 손대지 않음 (cmd codepage 분기 문제 + Windows 측은 패키징 셸이 다양).

## PATH 보강 (왜?)

Electron 패키징 앱은 GUI 에서 실행되므로 부모 PATH 가 로그인 셸과 다르다. `.zshrc/.zprofile` 이 정상 실행 안 될 때를 대비해 다음을 *append* (prepend X — 사용자 PATH 가 우선):

- `~/.claude/local`, `~/.claude/bin`
- `/usr/local/bin`, `/opt/homebrew/bin`, `/opt/homebrew/sbin`
- `~/.local/bin`, `~/.npm-global/bin`
- `~/.nvm/versions/node/current/bin`

> ⚠ prepend 하면 우리 폴백 안 구버전이 사용자가 의도한 신버전을 가린다 (큰 함정). 반드시 append.

## 로그인 셸 (`-l`)

Unix 에서 기본 셸로 띄울 때 `args: ['-l']` 강제. 이유:
- `.zprofile/.bash_profile` 이 거기서 실행됨 (NVM_DIR, homebrew shellenv 등)
- 안 하면 `.zshrc` 의 `nvm.sh` 로드가 실패 → hook/MCP 에서 node 못 찾음

사용자가 명시적으로 `command` 를 준 경우는 `-l` 안 붙임 (그 명령에 -l 인자가 안 맞을 수 있음).

## 출력 버퍼 + 알트스크린 sanitize

PTY 의 raw 출력에는:
- TUI 앱(vim/htop/claude TUI) 이 alternate screen 들어갔다 나오면서 누적한 화면 redraw
- 청크 경계에서 끊긴 미완성 ANSI 시퀀스

가 섞여있다. `sanitizeForRestore()` 가:
1. `\x1b[?(1049|47|1047)l` (alt-screen exit) 마지막 이후 출력만 남김
2. 미완성 ESC 시퀀스로 끝나면 잘라냄

이건 *복원 시점* 에만 적용. 실시간 스트림은 그대로 xterm 에 보냄.

## pane 따라잡기 (attach) — 구독 전 출력 유실

PTY 는 `create()` 직후부터 출력을 뱉는데 renderer 의 `onOutput` 구독은 그보다 뒤에 붙는다.
그 사이 출력은 `outputBuffer` 에만 쌓이고 화면에는 오지 않는다 — split 으로 만든 pane 이
셸 프롬프트 없이 백지로 뜨고 Enter 를 쳐야 나타나던 증상이 이것이었다(v2.0.6).

`TerminalManager.attach(id)` 가 `{ data, seq }` 를 준다. `data` 는 지금까지 쌓인 출력 전체,
`seq` 는 그 마지막 청크 번호다. 청크 번호는 세션별 1부터 증가하며 `TERMINAL_OUTPUT` payload 에도
같은 값이 실린다. `TerminalPane` 은 마운트 시:

1. `onOutput` 을 먼저 구독하되 도착분을 `{seq, data}` 로 큐에 쌓는다
2. `attach` 결과를 write 해서 따라잡는다
3. 큐에서 `seq > attach.seq` 인 것만 이어 write 한다 (그 이하는 `data` 에 이미 포함)

`attach` 가 실패해도 큐는 반드시 연다 — 안 그러면 pane 이 영구히 멈춘다.
모르는 세션이면 `{ data: '', seq: 0 }` + warn.

## 외부 output / exit listener

`TerminalManager.addOutputListener(cb)` — v2.0 B-1 이전엔 등록 인터페이스만 있고 `onData` 에서 실제로 호출되지 않는 죽은 훅이었다(문서-구현 불일치 상태로 방치돼 있었음). B-1 에서 실제 fan-out 으로 수리: PTY 출력의 매 청크가 `(id, data)` 로 콜백에 전달되고, 콜백이 throw 해도 개별 `try/catch` 로 격리되어 `TERMINAL_OUTPUT` IPC 송신과 다른 콜백에 영향 없음. unsubscribe 함수 반환. 대칭 API `addExitListener(cb)` 도 같은 사이클에 추가 — PTY 종료 시 `TerminalExitPayload` 를 받는다(`TERMINAL_EXIT` IPC 와 별개로 main 내부 구독자용).
**현재 소비자는 0** (테스트 제외). 후속 트랙(B-5 스크롤백 스냅샷 트리거, C-2 `AgentRunSpawner`)이 이 훅을 전제로 설계돼 있다 — `MentionTerminalSpawner.ts` 는 아직 등록하지 않는다(예전 문서가 "등록한다"고 잘못 기술했던 부분을 정정).

## 글리프 아틀라스는 pane 끼리 공유된다

`@xterm/addon-webgl` 의 `TextureAtlas` 는 글꼴·크기·테마 설정이 같은 Terminal 이 공유한다
(`CharAtlasCache.acquireTextureAtlas`). Clauday 는 글꼴·테마가 전역 설정이라 한 탭의 pane 들이
항상 같은 아틀라스를 쓴다.

그런데 `Terminal.clearTextureAtlas()` 는 공유 아틀라스를 비우면서 **자기 렌더 모델만** 다시
그린다. 다른 pane 은 이미 확정한 옛 UV 좌표로 비워진 아틀라스를 샘플링해 글자가 조각나거나
빈칸으로 남는다(v2.0.6 이전 실제 증상: split 을 늘릴수록 먼저 열어둔 pane 이 백지).

그래서 아틀라스 비우기는 `glyphCache.ts` 의 `clearGlyphCacheAllPanes()` 로 **살아 있는 전
pane 에 브로드캐스트**한다. `RenderService.clearTextureAtlas()` 가 렌더러 호출 뒤 `_fullRefresh()`
까지 하므로 모든 pane 이 전체 화면을 다시 그린다. pane 등록/해제는 `TerminalPane` 마운트 effect.

웹폰트 로드가 이미 끝난 뒤 열린 pane 은 비울 이유가 없으므로 생성 시점의
`document.fonts.status` 로 판정해 건너뛴다.

## 앱 안 파일 탭

터미널 탭은 `kind` 판별자로 갈린다 — 없으면 터미널, `'diff'` 는 파일 diff, `'file'` 은 편집 가능한
파일 뷰(`FileView.tsx`, Monaco). diff/file 은 PTY 가 없어 `panes` 가 비고 `tree` 는 자리표시자
leaf 하나뿐이다. 이 둘을 묶어 판정하는 것이 `isViewerTab()` — 분할·스냅샷·PTY resize 대상에서 뺀다.

⌘클릭 라우팅은 `TerminalView.handleTerminalPathOpen` 한 곳이다:

1. `⌥⌘` 면 판정 없이 `shell.openPath` — OS 탈출구는 항상 남긴다
2. `file.readText` 가 성공하면 파일 탭으로 (`FileTabRequest.line` 이 있으면 그 줄로 이동)
3. 실패(폴더·이진·`TEXT_FILE_MAX_BYTES` 초과)면 `shell.openPath`

`TerminalPane.onOpenPath` 를 배선하지 않은 호스트(MentionAgentView·BranchWorkspace)는 기존대로
전부 OS 로 넘어간다 — prop 없으면 옛 동작이 그대로다.

`filePreviewKind()` 가 렌더 가능 형식을 정한다 — md/markdown/mdx → 마크다운(react-markdown +
remark-gfm), html/htm → iframe. 그 외는 `null` 이라 토글을 아예 그리지 않는다. 렌더 가능하면
미리보기로 먼저 연다.

HTML 미리보기는 전용 스킴 `clauday-preview://local/<절대경로>` 로 서빙한다
(`previewUrl.ts` + `main/file/previewProtocol.ts`).

⚠️ **`srcdoc` 으로 되돌리지 말 것.** srcdoc 문서에는 자체 URL 이 없어 페이지 안 앵커
(`href="#x"`)가 앱 URL 기준으로 해석된다 — 누르는 순간 프레임이 문서를 떠나 백지가 된다.
실제로 그렇게 만들었다가 제보를 받았다. 자체 URL 이 있어야 앵커도 상대 경로 리소스도 산다.

보안은 세 겹이다. 하나라도 빼지 말 것:
1. iframe 에 `allow-scripts` 를 **주지 않는다** — 스크립트가 아예 안 돈다
2. 앱과 다른 출처라 프레임이 앱 DOM 에 닿지 못한다 (`allow-same-origin` 은 자체 출처를 유지해
   앵커·상대 경로를 살리기 위한 것이고, 스크립트가 없으므로 그 출처로 할 수 있는 일이 없다)
3. main 이 응답에 CSP 를 붙여 원격 요청까지 막는다 (`default-src 'self'`, `script-src 'none'`)

스킴 권한 등록(`registerSchemesAsPrivileged`)은 **`app.whenReady()` 이전**이어야 한다.
이후에 부르면 조용히 무시되고 `standard: true` 가 안 붙어 상대 경로가 깨진다.

저장은 읽은 시점의 mtime 을 함께 보내 검사한다(`writeTextFile.expectedMtimeMs`). 다르면
`conflict` 로 거절 — 터미널에서 돌린 스크립트·git 이 같은 파일을 건드리는 화면이라 조용한
덮어쓰기는 위험하다. 이진 판정은 확장자가 아니라 선두 8KB 의 NUL 바이트로 한다(확장자 목록은
항상 뒤처진다).

## 함정

- **resize(0,0)**: node-pty 가 throw. 항상 `cols > 0 && rows > 0` 검사 후 호출.
- **windowsVerbatimArguments**: Windows 분기는 ai-service 만 사용. 터미널은 평범한 cmd/zsh spawn.
- **메모리 누수**: `outputBuffer` 가 `MAX_BUFFER_LINES (5000)` 초과하면 슬라이스. 더 큰 한도는 메모리 부담 큼.
- **여러 mainWindow**: 현재 단일. 새 창 모델 도입 시 setMainWindow + 라우팅 재설계 필요.

## 갱신 정책

- 한글 인코딩 / PATH 보강 정책 변경 시 본 문서 갱신
- 새 OS 지원 추가 시 명시
