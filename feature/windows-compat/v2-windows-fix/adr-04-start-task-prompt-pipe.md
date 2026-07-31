---
id: ADR-v2-windows-fix-04
title: CLAUDE_START_TASK — Windows 는 프롬프트 임시파일 + cmd 파이프 verbatim 커맨드라인, 그래서 TerminalCreateOptions.args 를 string|string[] 로 확장
status: proposed
date: 2026-07-30
supersedes: []
domain: windows-compat
---

# 태스크 시작 프롬프트를 PTY 로 전달하는 방법

## 컨텍스트

`index.ts:877-895` (`CLAUDE_START_TASK`) 는 두레이 태스크를 claude 로 넘기는 진입점이다.

```ts
const prompt = [ ... ].join('\n')                       // 개행 다수, 본문 최대 2000자
terminalManager.create({
  command: 'claude',
  args: ['-p', prompt, '--model', 'sonnet'],
  cwd: homedir()
})
```

Windows 에서 이게 실패하는 이유가 **셋 다 다르다**.

1. **PATHEXT** — `command: 'claude'` 를 node-pty 가 그대로 CreateProcess 에 넘긴다. Windows 에서 `claude` 는 `claude.cmd` 이고 확장자 없는 이름은 해석되지 않는다.
2. **개행** — Windows 프로세스는 argv 배열이 아니라 **단일 커맨드라인 문자열**을 받는다. 개행이 포함된 인자는 안전하게 표현할 방법이 없다.
3. **길이** — 태스크 본문 2000자 + 머리말이면 cmd 커맨드라인 한계(~8KB)에 근접한다. 한글은 UTF-8 로 3바이트라 더 빨리 찬다.

`AIService` 는 같은 문제를 이미 겪었고 v1.5.2 에서 **prompt 본문을 stdin 으로** 옮겨 해결했다(`-p` 를 값 없이 두면 claude 가 stdin 을 읽는다). 그러나 PTY 는 stdin 이 터미널 그 자체라서 같은 수법을 그대로 쓸 수 없다 — `pty.write(prompt)` 는 셸에게 타이핑하는 것이지 claude 프로세스의 stdin 이 아니다.

여기에 node-pty 특유의 함정이 하나 더 있다. Windows 에서 `args` 를 **배열**로 주면 node-pty 의 `argvToCommandLine` 이 각 인자를 인용하면서 내부 `"` 를 `\"` 로 이스케이프한다. 이건 **CRT(C 런타임) 규칙**이고 **cmd.exe 는 백슬래시 이스케이프를 모른다**. 즉 cmd 에 복합 커맨드(파이프 포함)를 배열로 넘기는 것은 원리적으로 불가능하다. node-pty 는 이를 위해 `args: string | string[]` 를 지원한다 — 문자열이면 커맨드라인 verbatim.

## 결정

### 1. 분기는 `buildStartTaskSpawn()` 순수 함수 하나로

```ts
export interface StartTaskSpawn {
  command: string
  args: string[] | string      // win32 는 verbatim 문자열
  displayName: string          // 터미널 탭 이름 (스폰 커맨드와 분리)
  promptFile?: string          // win32 에서만. 호출자가 쓰기/정리 책임
}

/** 태스크 시작용 claude 스폰 명세를 만든다. win32 는 프롬프트를 임시파일로 빼고 cmd 파이프로 넘긴다. */
export function buildStartTaskSpawn(params: {
  prompt: string
  platform: NodeJS.Platform
  claudeBin: string
  comspec?: string
  promptFilePath?: string      // win32 필수. 호출자가 tmpdir 기준으로 결정
  model?: string               // 기본 'sonnet'
}): StartTaskSpawn
```

- **darwin/linux — 현행 그대로.** `{ command: 'claude', args: ['-p', prompt, '--model', 'sonnet'] }`. 절대경로로 바꾸지 않는다: PTY env 는 이미 PATH 가 보강돼 있고(ADR-03 §3), mac 은 지금 정상 동작 중이다. **동작하는 것을 건드리지 않는다**가 이 트랙 전체의 규칙이다.
- **win32** — `command = comspec ?? 'cmd.exe'`, `args` 는 verbatim 문자열:

  ```
  /d /s /c "chcp 65001>nul && type "<promptFile>" | "<claudeBin>" -p --model sonnet"
  ```

  - `type` 이 파일 내용을 stdout 으로 흘리고 파이프로 claude 의 stdin 에 들어간다 → **개행·길이 문제 동시 해소**(AIService v1.5.2 와 같은 원리).
  - `"<claudeBin>"` 인용으로 PATHEXT + 공백 경로 해소. 인용은 `quoteWinShellArg`(ADR-v2-utils-04 §3, 멱등).
  - `chcp 65001` 을 앞에 붙여 파이프 바이트가 UTF-8 로 흐르게 한다 — 한글 프롬프트가 이 파이프의 기본 사용 사례다.

### 2. `TerminalCreateOptions.args` 를 `string[] | string` 으로 확장

shared 타입 변경이다. 근거는 §컨텍스트의 node-pty 인용 규칙 — 배열로는 cmd 복합 커맨드를 표현할 수 없다. `TerminalManager.create` 는 값을 그대로 node-pty 에 전달한다(문자열 분해 금지). 문자열 args 는 **win32 전용**이며, 그 사실을 타입 주석에 못박는다.

IPC 를 넘어가는 타입이지만 renderer 는 `args` 를 문자열로 보내지 않는다 — 이 형태는 main 내부(`buildStartTaskSpawn` → `create`)에서만 쓰인다.

### 3. 탭 이름을 스폰 커맨드에서 분리한다

현행 `meta.name = options.command ? options.command : 'Terminal'`. Windows 에서 command 가 `C:\WINDOWS\system32\cmd.exe` 가 되면 탭 이름이 그렇게 표시된다. `TerminalCreateOptions.name?: string` 을 추가하고 `buildStartTaskSpawn` 의 `displayName`(양 플랫폼 공통 `claude`)을 넘긴다. 미지정 시 현행 규칙 유지 — 기존 호출부 무영향.

### 4. 프롬프트 파일의 위치와 수명

- 위치: `app.getPath('temp')`/`os.tmpdir()` 아래 `clauday-start-task-<uuid>.txt`. **워크트리·홈·프로젝트 폴더 밖** (C 트랙이 워크트리 diff 오염을 피하려는 것과 같은 이유).
- 인코딩: UTF-8, **BOM 없음**. `chcp 65001` 상태의 `type` 은 BOM 을 그대로 흘려 프롬프트 첫 글자를 오염시킨다.
- 수명: 세션 exit 리스너(B-1 이 만든 `addExitListener`)에서 삭제 + 안전망으로 5분 타이머. 삭제 실패는 `warn` 만 하고 무시(임시 디렉터리는 OS 가 청소한다).
- 내용은 태스크 본문이므로 **로그에 남기지 않는다**.

### 5. `-p` 호출 자체는 늘리지도 바꾸지도 않는다

2026-06-15 부터 `claude -p` 는 별도 크레딧이다(관망 정책). 본 ADR 은 **기존 `-p` 호출 1건의 전달 방식만** 바꾼다. 호출 횟수·모드·모델 불변. 이 진입점을 인터랙티브 모드로 바꾸는 논의(= `claude` 실행 후 프롬프트 타이핑, C-2 `AgentRunSpawner` 방식)는 매력적이지만 **동작 변경**이라 별 트랙이다.

## 대안과 기각 이유

1. **`pty.write(prompt)` 로 셸에 타이핑** (MentionTerminalSpawner 방식) — 기각: `-p` 배치 모드에서 인터랙티브 모드로 동작이 바뀐다. 그리고 딜레이 기반 타이핑(boot 대기 → ready 대기 → 프롬프트 → `\r`)은 머신 부하에 취약해서 신뢰성이 지금보다 낮아진다. C-2 가 이 방식을 쓰는 것은 "사용자가 개입 가능한 에이전트" 라는 **다른 요구사항** 때문이다.
2. **프롬프트를 base64 로 인코딩해 단일 인자로** — 기각: 개행은 사라지지만 길이는 33% 늘어 커맨드라인 한계에 더 빨리 걸린다. 그리고 claude 가 base64 를 풀어주지 않으므로 셸 파이프(`certutil -decode`)가 또 필요하다 — 임시파일보다 복잡하다.
3. **`echo <prompt> | claude`** — 기각: cmd 의 `echo` 는 개행을 못 담고 `&`, `|`, `>`, `^` 를 이스케이프해야 한다. 태스크 본문에 그런 문자가 나오는 것은 흔하다.
4. **임시파일을 `--prompt-file` 같은 옵션으로 전달** — 기각: claude CLI 에 그런 옵션이 없다. 있는지 확인 없이 가정하면 더 나쁜 실패가 된다.
5. **`args` 배열을 유지하고 TerminalManager 가 win32 에서 직접 join** — 기각: join 규칙(무엇을 언제 인용할지)이 TerminalManager 안에 숨는다. 그러면 `buildStartTaskSpawn` 테스트가 최종 커맨드라인을 검증하지 못하고 "배열이 맞나" 만 보게 된다. 최종 문자열을 순수 함수가 만들고 테스트가 그 문자열을 못박는 편이 훨씬 강하다.
6. **`shell: true` 로 spawn (node-pty 에는 없는 옵션)** — 기각: node-pty 에 shell 옵션이 없다. 우리가 직접 cmd 를 띄우는 것이 곧 shell 경유다.
7. **darwin 도 임시파일 파이프로 통일** — 기각: `CLAUDE.md` 함정 1("양쪽 일관성의 함정") 정면 위반. mac 은 argv 로 개행을 문제없이 전달하고 지금 동작한다. 통일의 이득이 0 이고 회귀 위험만 있다.

## 결과 (Consequences)

- **긍정**
  - Windows 에서 "Claude Code 로 시작" 이 실제로 동작한다 (PATHEXT·개행·길이 3원인 동시 해소).
  - 최종 커맨드라인이 순수 함수의 반환값이라 **문자열 단위로 테스트에 못박힌다** — 인용 하나 빠지는 회귀를 CI 가 잡는다.
  - 탭 이름이 스폰 커맨드와 분리되어 Windows 에서도 `claude` 로 보인다.
  - 프롬프트가 커맨드라인·로그에 남지 않는다(본문이 두레이 태스크 내용이라 프라이버시 관점에서도 개선).

- **부정 / 트레이드오프**
  - **shared 타입 확장**(`args: string[] | string`, `name?: string`). IPC 계약 표면이 넓어지고, `string` args 는 win32 전용이라는 규칙이 타입으로 강제되지 않는다(주석 의존).
  - 임시파일 수명 관리가 새로 생긴다. exit 리스너 + 타이머 2중이라도 앱이 강제 종료되면 파일이 남는다 (OS temp 청소에 의존).
  - `type ... | claude` 는 cmd 문법이라 COMSPEC 이 cmd 가 아닌 환경(사용자가 COMSPEC 을 바꾼 경우)에서 깨진다 → COMSPEC 이 `cmd` 계열이 아니면 `cmd.exe` 를 직접 쓴다.
  - Windows 경로가 mac 과 완전히 다른 커맨드라인을 만들므로, 이 진입점의 동작 차이를 아는 사람이 한 명 더 필요해진다(ADR 이 그 역할).

- **모니터링**
  - 스폰 직후 터미널에 `'claude'은(는) 내부 또는 외부 명령... 이 아닙니다` 류가 뜨면 인용/PATHEXT 실패 — Windows QA 1번 항목.
  - 프롬프트 파일 삭제 실패 `warn` 이 반복되면 수명 관리 재검토.
  - Windows VM: ①한글 태스크 제목/본문 ②본문 2000자 ③공백 포함 홈 경로 ④COMSPEC 커스텀 환경.
