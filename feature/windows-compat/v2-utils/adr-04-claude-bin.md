---
id: ADR-v2-utils-04
title: claudeBin 유틸 추출 — mac 반환값 무변경 불변식, where 결과 .cmd→.exe→.bat 우선, spawn 옵션은 claudeSpawnCommand 단일 출처
status: proposed
date: 2026-07-30
supersedes: []
domain: windows-compat
---

# claude 바이너리 해석·인용·spawn 옵션의 단일 출처

## 컨텍스트

`resolveClaudePath()` 는 `AIService.ts:101-143` 에 있고 export 되지 않는다. 그래서:

- `index.ts:1517` (CLI Info 핸들러) 는 그냥 `execFile('claude', ...)` 를 쓴다. Windows 에서 `claude` 는 `claude.cmd` 라 PATHEXT 해석이 필요한데 `execFile` 은 shell 을 안 거치므로 **ENOENT**. Windows 에서 CLI Info 패널이 비는 원인.
- `ClaudeChatService.ts:176-184` 와 AIService 의 spawn 3곳은 각자 `shell` / `windowsVerbatimArguments` 를 인라인으로 정한다.

거기에 **공백 포함 경로** 문제가 겹친다. Windows 에서 `spawn(cmd, argv, { shell: true, windowsVerbatimArguments: true })` 일 때 node 는 인자를 **인용해 주지 않는다** (verbatim 의 정의). `C:\Program Files\...\claude.cmd` 를 그대로 넘기면 cmd.exe 가 `C:\Program` 에서 끊는다. 한국 사용자 홈이 `C:\Users\홍길동` 처럼 공백을 포함하는 경우도 흔하다.

그리고 `where claude` 는 **여러 줄**을 돌려준다:

```
C:\Users\me\AppData\Roaming\npm\claude
C:\Users\me\AppData\Roaming\npm\claude.cmd
```

현행 코드는 `.split('\n')[0].trim()` 으로 **첫 줄**을 취한다. 위 예시에서 첫 줄은 확장자 없는 **셸 스크립트**(npm 이 깔아두는 sh 용 shim) 라 Windows 에서 실행 불가다. 게다가 `where` 출력은 `\r\n` 이므로 `split('\n')` 후 `trim()` 을 안 하면 `\r` 이 경로에 남는다 (현행은 `.trim()` 이 있어 살아있지만, 다중 결과 처리는 여전히 틀렸다).

이 모든 것이 A-1 ~ A-4 의 여러 파일에서 반복될 예정이라, 손대기 전에 단일 출처를 만든다.

**결정적 제약**: `CLAUDE.md` 와 `.agent/wiki/domain-ai-service.md` 가 명시하는 Windows/Mac 분기 함정 — 특히 함정 1 "양쪽 일관성의 함정" 과 함정 3 "shell:true 의존성". 이 리팩터는 **정리하고 싶은 충동이 가장 크게 드는 자리**이며, 동시에 그 충동이 가장 위험한 자리다.

## 결정

### 1. 불변식 — mac 경로는 바이트 단위로 현행과 동일

`resolveClaudeBin()` 이 darwin/linux 에서 반환하는 값과, `claudeSpawnCommand()` 가 darwin 에서 만드는 spawn 옵션은 **현행과 완전히 동일**해야 한다. 이 ADR 의 어떤 개선도 mac 경로에 적용되지 않는다.

구체적으로 mac 은 그대로:
- `$SHELL -l -c 'command -v claude'` → `existsSync` 확인
- 실패 시 알려진 절대경로 후보 순회
- 최종 폴백 `'claude'`
- spawn 은 `{ shell: false, windowsVerbatimArguments: false }`, 인용 **없음**

테스트로 이 불변식을 못박는다: 기존 `AIService.test.ts` 무수정 통과 + `claudeBin.test.ts` 에 darwin 케이스 명시.

### 2. `resolveClaudeBin()` — Windows 만 개선

`AIService.ts:101-143` 의 로직을 `src/main/utils/claudeBin.ts` 로 이동. Windows 분기에 2가지 수정:

```ts
// where 는 \r\n 구분, 다중 결과. 확장자 우선순위로 고른다.
const WIN_EXT_PRIORITY = ['.cmd', '.exe', '.bat'] as const

function pickWindowsCandidate(whereOutput: string): string | undefined {
  const lines = whereOutput.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (const ext of WIN_EXT_PRIORITY) {
    const hit = lines.find((l) => l.toLowerCase().endsWith(ext) && existsSync(l))
    if (hit) return hit
  }
  return lines.find((l) => existsSync(l))   // 확장자 없는 것도 최후엔 허용
}
```

- `.cmd` 최우선: npm-global 설치의 표준 런처이며 현행 후보 목록도 `.cmd` 를 먼저 본다.
- `.exe` 차순위: 네이티브 설치본.
- `.bat` 최후: 드묾.
- 확장자 없는 줄은 **마지막 수단**으로만 (npm 의 sh shim 회피가 이 변경의 목적).

`process.env.CLAUDE_CLI_PATH` 최우선 오버라이드는 유지.

### 3. `quoteWinShellArg(value)` — 필요할 때만 인용, 이중 인용 금지

```ts
/** cmd.exe 에 verbatim 으로 넘길 인자를 필요한 경우에만 큰따옴표로 감싼다. */
export function quoteWinShellArg(value: string): string
```

- 이미 `"` 로 시작하고 끝나면 **그대로 반환** (멱등).
- 공백, `&`, `|`, `<`, `>`, `^`, `(`, `)` 중 하나라도 포함하면 `"` 로 감싼다.
- 그 외에는 원본 그대로 (불필요한 인용이 `windowsVerbatimArguments` 와 결합해 만드는 이상 동작 회피).
- 값 내부의 `"` 는 `""` 로 이스케이프 (cmd 관례). 경로에 `"` 가 오는 경우는 거의 없지만 무시하지 않는다.
- **win32 전용 함수**다. 이름에 `Win` 을 박아 mac 경로에서 호출되면 리뷰에서 즉시 보이게 한다.

### 4. `claudeSpawnCommand()` — spawn 옵션의 단일 출처

```ts
export type ClaudeSpawnCommand = {
  command: string
  shell: boolean
  windowsVerbatimArguments: boolean
}

/** 플랫폼별 claude spawn 커맨드와 옵션을 돌려준다. Windows 는 shell 경유 + verbatim 인용. */
export function claudeSpawnCommand(opts?: { platform?: NodeJS.Platform; bin?: string }): ClaudeSpawnCommand
```

- darwin/linux: `{ command: bin, shell: false, windowsVerbatimArguments: false }` — **인용 없음**
- win32: `{ command: quoteWinShellArg(bin), shell: true, windowsVerbatimArguments: true }`

**argv 는 다루지 않는다.** `--append-system-prompt` 의 Windows stdin combine 같은 argv 조립은 AIService 고유 로직으로 남긴다 (CLAUDE.md 가이드가 사는 자리). 이 함수는 "무엇을 실행하는가 + 어떤 spawn 플래그" 까지만 책임진다 — 경계를 좁게 잡아야 함정 1(양쪽 일관성) 을 유발하지 않는다.

### 5. 평가 시점을 바꾸지 않는다

현행은 모듈 로드 시 `const CLAUDE_CLI = resolveClaudePath()` 로 **1회 평가**되고 곧바로 `captureClaudeVersion()` 이 그 값으로 `claude --version` 을 캐싱한다(`cliLogger` 가 모든 진단 로그에 첨부). lazy 로 바꾸면 이 순서가 달라진다.

→ `claudeBin.ts` 는 `resolveClaudeBin()`(매번 계산) 과 `getClaudeBin()`(모듈 로드 시 1회 평가 캐시) 을 **둘 다** 제공하고, `AIService` 는 기존과 동일하게 `getClaudeBin()` 을 쓴다. 캐시 평가는 `claudeBin.ts` 모듈 로드 시점으로 옮겨가지만 "AIService 로드 시 이미 확정" 이라는 관찰 가능한 성질은 보존된다. 테스트를 위해 `resetClaudeBinCache()` 를 export.

`AIService.ts` 는 `export function getClaudeBin()` 시그니처를 유지한다 (re-export). 외부 호출자 무영향.

## 대안과 기각 이유

1. **`resolveClaudePath` 를 그냥 export 하고 끝** — 기각: `where` 다중 결과 버그와 공백 경로 인용이 그대로 남는다. A-1 ~ A-4 가 이 함수를 4곳에서 쓸 예정인데, 버그를 4곳에 퍼뜨리게 된다.
2. **`which` npm 패키지 도입** — 기각: 새 런타임 의존성. 그리고 우리가 필요한 건 범용 which 가 아니라 "claude 를, 확장자 우선순위로, 사용자 로그인 셸 기준으로" 라는 특수 규칙이다. 범용 라이브러리는 mac 의 `$SHELL -l -c` (로그인 셸 rc 를 태워야 nvm/asdf 가 잡힘) 를 대체하지 못한다.
3. **`claudeSpawnCommand()` 가 argv 조립까지 담당** — 기각: `CLAUDE.md` 함정 1 정면 위반 위험. argv 조립을 공통화하면 다음 사람이 "Mac 도 stdin 으로 통일하자" 를 **한 곳에서** 할 수 있게 되고, 그게 정확히 문서가 경고하는 회귀다. 경계를 command + spawn 플래그로 좁게.
4. **Windows 도 `shell: false` 로 바꾸고 `cmd.exe /c` 를 직접 spawn** — 기각: `CLAUDE.md` 함정 3 "shell 옵션 변경은 영향 광범위 — 그쪽 손대지 말 것". 이론적으로는 더 깨끗하지만 codepage/verbatim/한글 mojibake 가 얽힌 검증된 조합을 흔든다. 이 트랙의 목적은 **추출**이지 재설계가 아니다.
5. **항상 인용 (`"` 무조건 감싸기)** — 기각: `windowsVerbatimArguments: true` 와 결합하면 인용이 그대로 자식에게 전달되어, 인용이 불필요했던 값이 깨질 수 있다. 필요할 때만 + 멱등이 안전하다.
6. **`where` 첫 줄 유지하되 확장자 없으면 `.cmd` 를 붙여본다** — 기각: `where` 가 이미 실제 존재하는 전체 목록을 줬는데 굳이 문자열을 조작해 추측할 이유가 없다. 목록에서 고르는 편이 단순하고 정확하다.
7. **`getClaudeBin` 을 lazy 로 전환** — 기각: PRD R3. `captureClaudeVersion()` 의 타이밍이 바뀌어 진단 로그에 버전이 빠지는 회귀가 가능하다. 관측 가능한 동작 변경 없이 추출한다는 이번 트랙의 원칙에 어긋난다.

## 결과 (Consequences)

- **긍정**
  - `index.ts:1517` 의 `execFile('claude')` 를 A-4 에서 1줄로 고칠 수 있게 된다 (Windows CLI Info 복구).
  - 공백 포함 설치 경로 / `where` 다중 결과가 한 곳에서 해결된다.
  - spawn 플래그가 단일 출처라, 앞으로 새 spawn 지점이 생겨도 Windows 분기를 다시 틀리게 짤 여지가 줄어든다.
  - `platform` 주입으로 win32 경로를 mac CI 에서 검증 가능.

- **부정 / 트레이드오프**
  - Windows 에서 `resolveClaudeBin()` 이 **현행과 다른 바이너리를 고를 수 있다** (첫 줄 → `.cmd` 우선). 그것이 이 변경의 목적이지만, 동작 변경은 동작 변경이다. Windows VM 수동 QA 필수.
  - `claudeBin.ts` 모듈 로드가 `execFileSync`(`where`/`command -v`, 각 5초 타임아웃) 를 트리거하므로, 이 모듈을 import 하는 것만으로 부팅 비용이 생긴다. 현재도 AIService import 시 동일하게 발생하므로 **총량은 불변**이지만, 앞으로 이 유틸을 가벼운 모듈에서 무심코 import 하면 비용이 새 곳으로 번진다. → 모듈 상단 주석에 명시.
  - AIService 에 얇은 위임층이 하나 늘어난다 (읽는 사람이 한 번 더 점프).

- **모니터링**
  - `cliLogger` 진단 로그에 이미 platform/argv 가 남는다. 추출 후에도 **해석된 바이너리 경로가 로그에 남는지** 확인 (CLAUDE.md 함정 4).
  - Windows VM: ① claude 실행 ② CLI Info 패널 채워짐 ③ 공백 포함 경로에 claude 설치 후 재현 ④ `where claude` 다중 결과 환경에서 `.cmd` 선택 확인.
  - mac: `AIService.test.ts` 전체 무수정 통과가 불변식 1의 자동 감시자다.
