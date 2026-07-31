---
id: ADR-v2-windows-fix-03
title: Windows PTY 스폰 — detectWindowsShell 이 args 포함 후보 배열을 돌려주고, alias 스텁은 size>0 로 배제, useConptyDll 은 래치 폴백, xterm windowsPty 는 21376 게이트 유지
status: proposed
date: 2026-07-30
supersedes: []
domain: windows-compat
---

# Windows PTY 스폰 체인과 한글 인코딩

## 컨텍스트

`TerminalManager.create`(`:112-142`)의 Windows 경로는 한 줄이다.

```ts
const defaultShell = isWindows ? (process.env.COMSPEC || 'cmd.exe') : (process.env.SHELL || '/bin/zsh')
```

여기서 파생되는 문제가 넷이다.

**1. cmd.exe 고정.** pwsh/powershell 이 설치돼 있어도 안 쓴다. 그리고 cmd 는 기본 codepage 가 949(한국어 Windows)라 claude TUI 의 `❯` 가 `Γ¥»` 로 깨진다. mac 경로에는 `LANG=ko_KR.UTF-8` 강제가 있는데 Windows 에는 **인코딩 처리가 아예 없다**.

**2. WindowsApps App Execution Alias 함정** (Orca 노트 §8, 함정 #11). `%LOCALAPPDATA%\Microsoft\WindowsApps\` 아래의 `pwsh.exe`/`powershell.exe` 는 **0바이트 reparse point 스텁**이다. `existsSync` 는 true 를 돌려주지만 ConPTY 로 띄우면 `ACCESS_DENIED` 로 죽는다. 그래서 "존재하면 쓴다" 식 감지는 Windows Store 사용자에게 정확히 역효과다.

**3. 폴백이 없다.** 스폰이 실패하면 그대로 죽는다. 그리고 폴백을 만들 때 흔히 하는 실수가 **셸만 바꾸고 args 를 재계산하지 않는 것**이다 — PowerShell 용 `-NoLogo -Command ...` 를 cmd 에 그대로 넘기면 cmd 가 이해하지 못한다.

**4. ConPTY 품질.** 레거시 시스템 ConPTY 는 wrap marker 를 부정확하게 보고한다(Orca 노트 §8). node-pty 1.1.0 은 번들 ConPTY DLL 을 쓰는 `useConptyDll` 옵션을 제공한다. 반대편(xterm)에는 `windowsPty` 옵션이 있는데, 이건 지정 여부와 `buildNumber` 값에 따라 **reflow 를 끄는 휴리스틱**이 켜져서 잘못 쓰면 멀쩡한 화면을 망친다.

## 결정

### 1. `detectWindowsShell` 은 "후보 배열" 을 돌려준다 — args 포함

```ts
export type WindowsShellKind = 'pwsh' | 'powershell' | 'cmd'
export type ShellProbe = (path: string) => { isFile: boolean; size: number } | undefined
export interface WindowsShellCandidate { file: string; args: string[]; kind: WindowsShellKind }

/** Windows PTY 셸 후보를 우선순위대로 돌려준다. 절대경로 후보는 0바이트 alias 스텁을 배제한다. */
export function detectWindowsShell(opts: { env: NodeJS.ProcessEnv; probe: ShellProbe }): WindowsShellCandidate[]
```

- 순서: `pwsh`(PowerShell 7) → `powershell`(inbox) → `COMSPEC` → `cmd.exe`(bare name, PATH 해석)
- **절대경로 후보는 `probe(p)?.isFile === true && size > 0` 을 통과해야 채택**. 이것이 alias 스텁 배제(함정 #11)의 전부다. 마지막 bare `cmd.exe` 는 probe 없이 항상 남겨 체인이 비지 않게 한다.
- **args 는 후보에 포함된다.** 폴백이 후보를 바꾸는 순간 args 도 같이 바뀌므로 "폴백마다 args 재계산" 이 구조적으로 보장된다. 재계산을 잊을 수 있는 코드 경로 자체가 없다.
  - PowerShell 계열: `['-NoLogo', '-NoExit', '-Command', '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); $OutputEncoding=[Console]::OutputEncoding']`
  - cmd 계열: `['/K', 'chcp 65001>nul']`
- `probe` 주입으로 순수 함수 유지 → mac CI 에서 win32 경로를 전부 검증한다.
- **`options.command` 가 주어지면 이 체인을 타지 않는다.** 호출자가 명시한 커맨드를 우리가 다른 셸로 바꾸면 안 된다.

### 2. spawn 폴백은 순차 + ConPTY DLL 래치

```
for (const candidate of candidates) {
  try { return spawn(candidate, { useConptyDll: !conptyDllDisabled }) }
  catch (e) {
    if (!conptyDllDisabled && looksLikeConptyDllError(e)) {
      conptyDllDisabled = true                     // 모듈 전역 래치
      try { return spawn(candidate, { useConptyDll: false }) } catch { /* 다음 후보 */ }
    }
    warn('[TerminalManager] PTY 스폰 실패', { file: candidate.file, error })
  }
}
throw lastError
```

- 후보당 최대 2회, 래치가 걸린 뒤에는 1회. 조합 폭발 없음.
- **모든 실패를 `warn` 로그로** 남긴다(후보 경로 + 오류). 조용한 폴백은 "왜 cmd 로 열렸지" 를 영원히 못 풀게 만든다.
- 전부 실패하면 마지막 오류를 throw — 현행(스폰 실패 시 throw)과 동일한 계약.
- **스폰 성공 후 즉시 죽는 경우는 감지하지 않는다.** alias 스텁의 ACCESS_DENIED 는 §1 의 size 필터로 미리 막고, 사후 감지(첫 N ms 안에 exit 하면 다음 후보)는 정상 종료와 구분이 불가능해 오히려 위험하다. 한계로 수용.

### 3. Windows PTY env — 추가만, mac 은 무변경

win32 에서만 아래를 얹는다.

| 키 | 값 | 이유 |
|---|---|---|
| `PYTHONUTF8` | `1` | 파이썬 기반 MCP/스크립트의 cp949 기본 인코딩 회피 |
| `TERM_PROGRAM` | `Clauday` | 하위 도구가 터미널을 식별 |
| `FORCE_HYPERLINK` | `1` | `supports-hyperlinks` 가 미지의 `TERM_PROGRAM` 을 거부하는 문제 (Orca 노트 §8) |

**darwin/linux env 는 한 글자도 바꾸지 않는다** — `LANG`/`LC_ALL`/`LC_CTYPE` 3종 그대로. `TERM_PROGRAM` 을 mac 에도 주면 사용자 환경에서 이미 설정된 값(`Apple_Terminal` 등)을 덮어써서 하위 도구 동작이 바뀔 수 있다. 이 트랙은 Windows 수복이지 mac 개선이 아니다.

PATH 는 ADR-02 §4 와 같은 유틸로: `mergePathIntoEnv(baseEnv, claudeExtraPaths())` (append). PTY 안에서 `.zshrc` 가 다시 PATH 를 갱신하므로 append 가 정책이다.

### 4. `windowsPty` 는 buildNumber ≥ 21376 게이트를 유지 — 순수 함수로 가둔다

```ts
/** xterm 의 windowsPty 옵션. win32 + 신형 ConPTY(빌드 21376+)에서만 지정하고 그 외에는 지정하지 않는다. */
export function windowsPtyOptions(
  platform: string,
  osRelease: string | undefined
): { backend: 'conpty'; buildNumber: number } | undefined
```

`src/shared/utils/windowsPty.ts` 에 두고 renderer 가 import 한다. `osRelease` 는 `os.release()`(예: `10.0.22621`)의 3번째 성분을 buildNumber 로 파싱하고, 파싱 실패/win32 아님/21376 미만이면 `undefined`.

xterm 타이핑 문서(`xterm.d.ts:299-308`)는 **구형 ConPTY 에서도 지정해서 reflow 를 끄라**고 권한다. 그럼에도 게이트를 유지하는 이유: 지정하면 "줄 끝이 공백이 아니면 wrap 으로 간주" 휴리스틱이 켜지는데, 이는 Win10 19044 같은 **다수 사용자의 현행 동작을 실기 검증 없이 바꾸는** 일이다. 게이트 유지 = 구형은 현행 그대로, 신형만 개선. 뒤집어야 할 근거(실기에서 wrap 깨짐 보고)가 나오면 이 함수 한 줄이다.

값 전달은 **preload 정적 노출**로 한다: `api.system = { platform: process.platform, osRelease: release() }`. `sandbox:false` 라 preload 에서 `os` 를 읽을 수 있고, IPC 채널 신설·비동기 대기 없이 `new Terminal({...})` 를 동기적으로 구성할 수 있다. 값이 없으면(`undefined`) 현행과 동일하게 동작한다.

## 대안과 기각 이유

1. **`detectWindowsShell` 이 단일 셸 하나만 돌려주고 args 는 호출자가 kind 로 분기** — 기각: 그 분기가 폴백 루프 안에 있으면 "셸만 바꾸고 args 는 그대로" 버그가 언제든 태어난다. args 를 후보에 묶으면 그 버그가 표현 불가능해진다.
2. **`windowsPty` 를 항상 지정 (xterm 문서 권고 그대로)** — 기각: §4. 구형 빌드에서 reflow off + wrap 휴리스틱은 현행 대비 **동작 변경**이고 다수 사용자에게 영향이 간다. 실기 없이 감수할 이유가 없다. (문서 권고를 따르지 않는 선택이므로 PRD R3 에 리스크로 등재하고, 뒤집기 비용을 1줄로 낮춰 둔다.)
3. **buildNumber 를 IPC 채널로 조회** — 기각: 채널 1개가 늘고, 비동기라 첫 렌더 타이밍에 값이 없을 수 있어 "가끔 windowsPty 가 안 붙는" 비결정성이 생긴다. 정적 값이라 preload 가 적합하다. (IPC 3+1 규칙은 *채널*에 대한 규칙이고 정적 노출은 대상이 아니다.)
4. **`navigator.userAgent` 로 Windows 버전 판정** — 기각: UA 는 `Windows NT 10.0` 까지만 준다. buildNumber(21376 경계)를 알 수 없다.
5. **`useConptyDll` 을 항상 끄고 시스템 ConPTY 사용 (현행)** — 기각: 레거시 시스템 ConPTY 의 wrap marker 부정확이 정확히 우리가 겪는 줄바꿈/한글 폭 문제군의 원인 후보다. node-pty 가 DLL 을 번들하는 이유가 그것이다.
6. **`useConptyDll` 을 항상 켜고 폴백 없음** — 기각: 패키징 산출물에 DLL 이 실제로 포함되는지 mac 에서 확인할 수 없다(PRD R2). 앱이 터미널을 못 여는 것은 치명이고, 래치 폴백 비용은 낮다.
7. **cmd 에 `chcp 65001` 을 args 가 아니라 `pty.write()` 로 주입** — 기각: write 는 셸이 준비된 뒤에야 유효해서 타이밍 의존이 생기고, 첫 프롬프트가 이미 깨진 codepage 로 그려진 뒤다. `/K` args 는 셸 시작 자체에 포함되어 결정적이다.
8. **PowerShell 인코딩을 프로필 파일(`$PROFILE`) 수정으로 해결** — 기각: 사용자 환경 파일을 우리가 고치는 것은 침습적이고 되돌리기 어렵다. `-Command` 로 세션 한정 적용이 부작용 0.
9. **git-bash / WSL 도 후보에 추가** — 기각: 셸 선택 UI 가 없어 사용자가 의도를 표현할 방법이 없다. 자동 감지로 git-bash 를 고르면 `cmd` 를 기대하던 사용자에게 갑작스러운 변경이 된다. 셸 설정 UI 가 생길 때 같이.

## 결과 (Consequences)

- **긍정**
  - Windows 터미널이 pwsh/powershell 을 쓰고 UTF-8 로 열린다 — claude TUI 의 `❯`, 한글 출력 mojibake 해소.
  - Store alias 스텁으로 인한 ACCESS_DENIED 가 스폰 전에 배제된다.
  - 스폰 실패가 조용히 죽지 않고 폴백 + `warn` 로그를 남긴다.
  - `detectWindowsShell`/`windowsPtyOptions` 가 순수 함수라 mac CI 에서 Windows 동작을 검증할 수 있다.
  - PTY env 의 PATH 보강이 다른 3곳과 같은 유틸을 쓰게 되어 목록 드리프트가 끝난다.

- **부정 / 트레이드오프**
  - **Windows 사용자의 기본 셸이 cmd → pwsh/powershell 로 바뀐다.** 개선이지만 명백한 동작 변경이다. 배치 스크립트 습관이 있는 사용자에게는 낯설 수 있고, 셸 선택 UI 가 없어 되돌릴 방법이 없다 → 매뉴얼/CHANGELOG 에 명시하고, 셸 선택 설정은 후속 백로그로.
  - `useConptyDll` 실패 경로는 mac 에서 테스트할 수 없다 — `looksLikeConptyDllError` 판정은 오류 메시지 패턴 매칭이라 실기에서 어긋날 수 있다. → 판정이 빗나가도 **후보 순회는 계속되므로** 최악은 다음 후보로 넘어가는 것.
  - `windowsPty` 게이트가 xterm 문서 권고와 다르다(PRD R3).
  - preload 표면이 하나 늘어난다(`api.system`). 정적 값이므로 mock 갱신(`test/helpers/mockWindowApi.ts`) 필요.

- **모니터링**
  - `[TerminalManager] PTY 스폰 실패` warn 의 빈도/후보 — 어떤 후보가 실제로 실패하는지가 Windows 환경 분포 데이터가 된다.
  - ConPTY DLL 래치가 걸리면 1회 `warn` (이후 조용) — 이 로그가 보이면 패키징 산출물에 DLL 이 빠진 것.
  - Windows VM 스모크: ①한글 입출력 ②claude TUI 렌더 ③Store alias 만 있는 환경에서 powershell 폴백 ④긴 줄 wrap(21376 이상/미만 양쪽).
