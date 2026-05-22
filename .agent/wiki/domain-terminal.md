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

## 외부 output listener

`TerminalManager.addOutputListener(cb)` — 멘션 작업 종료 마커 감지에 사용 (`src/main/dooray/mention/MentionTerminalSpawner.ts` 가 등록). PTY 출력의 매 청크가 cb 에 전달됨. unsubscribe 함수 반환.

## 함정

- **resize(0,0)**: node-pty 가 throw. 항상 `cols > 0 && rows > 0` 검사 후 호출.
- **windowsVerbatimArguments**: Windows 분기는 ai-service 만 사용. 터미널은 평범한 cmd/zsh spawn.
- **메모리 누수**: `outputBuffer` 가 `MAX_BUFFER_LINES (5000)` 초과하면 슬라이스. 더 큰 한도는 메모리 부담 큼.
- **여러 mainWindow**: 현재 단일. 새 창 모델 도입 시 setMainWindow + 라우팅 재설계 필요.

## 갱신 정책

- 한글 인코딩 / PATH 보강 정책 변경 시 본 문서 갱신
- 새 OS 지원 추가 시 명시
