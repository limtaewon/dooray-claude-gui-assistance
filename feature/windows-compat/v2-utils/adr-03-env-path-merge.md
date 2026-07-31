---
id: ADR-v2-utils-03
title: mergePathIntoEnv — 기존 PATH 키를 대소문자 무시로 찾아 그 키만 in-place 갱신, claudeExtraPaths 는 합집합 단일 정의
status: proposed
date: 2026-07-30
supersedes: []
domain: windows-compat
---

# PATH 보강의 단일 정의 — 키 중복 원천 차단과 목록 합집합

## 컨텍스트

Electron 패키징 앱은 GUI 에서 실행되어 로그인 셸의 PATH 를 물려받지 못한다. 그래서 자식 프로세스(claude CLI, PTY, MCP 서버) 를 띄우기 전에 PATH 를 보강한다. 이 로직이 **4곳에 복제**되어 있고, 4곳 다 조금씩 다르다.

| 위치 | 순서 | 목록 차이 |
|---|---|---|
| `ClaudeChatService.ts:37-41` | append (사용자 PATH 우선) | homebrew `sbin` 포함, nvm 없음 |
| `TerminalManager.ts:73-78` | append | homebrew `sbin` + `~/.nvm/versions/node/current/bin` 포함 (유일) |
| `AIService.ts:310-314` | **prepend** | `sbin` 없음 |
| `index.ts:1508-1513` | append | `sbin` 없음, `~/.npm-global/bin` 없음 (유일하게 빠짐) |

두 종류의 문제가 있다.

**문제 1 — Windows 의 PATH 키 중복.** 4곳 모두 `{ ...process.env, PATH: '...' }` 형태로 **대문자 `PATH` 키에 대입**한다. Windows 환경변수는 대소문자를 구분하지 않지만 **JS 객체는 구분한다**. `process.env` 가 `Path` 로 들고 있으면 결과 객체에 `Path`(원본, 보강 안 됨) 와 `PATH`(보강됨) 가 **동시에** 존재한다. 어느 쪽이 자식에게 유효한지는 spawn 경로(`shell:true` 의 cmd.exe / node-pty 의 ConPTY / libuv 의 env 병합)마다 다르고, 조합에 따라 보강이 통째로 무시된다. Windows 에서 "claude 를 못 찾음" 이 산발적으로 재현되는 원인 후보다.

`node-pty` 는 이 문제를 알고 win32 에서 env 키를 정규화하지만, 우리 코드가 만든 **중복 키 자체**는 그 이전 단계의 문제라 어느 쪽이 살아남을지는 여전히 우리 손 밖이다.

**문제 2 — 목록 드리프트.** 같은 목적의 목록 4개가 서로 다르다. TerminalManager 에서만 nvm 이 잡히고, index.ts 의 CLI Info 만 `.npm-global` 을 못 본다. 어느 것이 의도된 차이인지 코드만 봐서는 알 수 없다 — 시간이 지나며 각자 자란 결과로 보인다.

한편 **순서(append vs prepend)는 의도된 차이**다. `decisions-log.md` 2026-04 항목: "PATH 보강 *append* (prepend 금지) — 사용자 신버전을 우리 폴백 구버전이 가리는 회귀". 그런데 AIService 만 prepend 다. 마스터 계획 A-0 표는 이를 **"AIService(prepend 유지)"** 로 명시했다 — AIService 는 `resolveClaudeBin()` 이 준 **절대경로**로 spawn 하므로 PATH 검색이 바이너리 선택에 관여하지 않고, PATH 는 claude 가 내부에서 호출하는 node/npx 용이다. 즉 prepend 여도 "구버전 claude 를 잡는" 회귀가 발생하지 않는 구조.

## 결정

### 1. `mergePathIntoEnv(base, extraPaths, opts)` — 키를 새로 만들지 않는다

```ts
type PathMergeOptions = {
  position?: 'append' | 'prepend'   // 기본 'append'
  delimiter?: string                // 기본 path.delimiter (테스트 주입)
  platform?: NodeJS.Platform        // 기본 process.platform (테스트 주입)
}

/** base 환경변수의 PATH 키를 대소문자 무시로 찾아 그 키만 갱신한 새 객체를 돌려준다. */
export function mergePathIntoEnv(
  base: NodeJS.ProcessEnv,
  extraPaths: readonly string[],
  opts?: PathMergeOptions
): NodeJS.ProcessEnv
```

동작 규칙:

- `base` 의 키를 순회해 `key.toUpperCase() === 'PATH'` 인 **첫 키**를 찾고, **그 키 이름 그대로** 갱신한다. `Path` 였으면 `Path` 를 갱신하고 `PATH` 를 만들지 않는다.
- 대소문자만 다른 PATH 키가 2개 이상이면 첫 번째만 갱신하고 **`warn` 로그**를 남긴다(이미 오염된 env 를 받았다는 신호).
- PATH 키가 아예 없으면 신설한다. 키 이름은 win32 면 `Path`, 그 외 `PATH`. 기존값 기본은 win32 `''`, 그 외 `'/usr/bin:/bin'` (현행 4곳의 공통 동작 보존).
- **중복 제거**: 이미 PATH 에 있는 경로는 다시 넣지 않는다 (구분자 기준 정확 일치. win32 는 대소문자 무시 + 후행 구분자 정규화 — `samePath` 재사용).
- 빈 문자열 세그먼트는 버린다 (현행 `[process.env.PATH || '', ...extra].join()` 이 PATH 부재 시 선두 빈 세그먼트를 만드는 버그 동시 해소 — POSIX 에서 빈 세그먼트는 "현재 디렉터리" 로 해석되어 보안 문제가 된다).
- `base` 를 **변형하지 않는다** (순수 함수, 새 객체 반환).

### 2. `claudeExtraPaths()` — 4개 목록의 합집합, 단일 정의

```ts
/** claude CLI 와 그 자식 프로세스가 필요로 하는 PATH 후보를 플랫폼별로 돌려준다. */
export function claudeExtraPaths(opts?: { home?: string; platform?: NodeJS.Platform }): string[]
```

**합집합**을 채택한다 (교집합도, 4개 유지도 아님).

- win32: `~/.claude/local`, `~/.claude/bin`, `~/AppData/Roaming/npm`, `~/AppData/Local/npm`
- 그 외: `~/.claude/local`, `~/.claude/bin`, `/usr/local/bin`, `/opt/homebrew/bin`, `/opt/homebrew/sbin`, `~/.local/bin`, `~/.npm-global/bin`, `~/.nvm/versions/node/current/bin`

순서는 위 그대로 고정(안정 정렬). 존재하지 않는 디렉터리도 그대로 넣는다 — 존재 검사를 하면 함수가 fs 의존이 되고, PATH 에 없는 디렉터리가 들어가는 것은 무해하다.

합집합인 이유: 4곳의 차이는 **의도가 아니라 누락**으로 보인다(각 목록에 "왜 여기만 sbin 이 없는지" 를 설명하는 주석이 하나도 없다). 그리고 이 목록은 **fallback** 이다 — append 위치라 사용자 PATH 를 이기지 않으므로, 항목을 더하는 것의 위험이 낮고 빠뜨리는 것의 위험이 높다(= claude 를 못 찾음).

### 3. `position` 은 소비처가 명시한다 — 기본은 `append`

`position` 을 필수가 아닌 **기본 append** 로 둔다. 실수로 생략했을 때 안전한 쪽(= decisions-log 의 확립된 정책)으로 떨어지게 한다. AIService 만 A-2 에서 `{ position: 'prepend' }` 를 **명시적으로** 넘기고, 그 자리에 "절대경로 spawn 이라 prepend 안전" 근거 주석을 남긴다.

### 4. 이번 트랙에서 소비처는 바꾸지 않는다

`env.ts` 는 신설 + 테스트까지. 4곳 교체는 A-1 ~ A-4. (PRD 비목표)

## 대안과 기각 이유

1. **항상 `PATH` 키에 대입 (현행 유지)** — 기각: 문제 1 그 자체. Windows 에서 `Path`/`PATH` 가 공존하면 보강이 무시될 수 있고, 이 실패는 "가끔 안 된다" 로 나타나 진단이 극도로 어렵다.
2. **win32 에서 env 전체를 대문자로 정규화한 새 객체를 만든다** — 기각: 부작용이 너무 넓다. `ProgramFiles(x86)` 같은 키를 대문자화하면 그걸 정확한 케이스로 읽는 도구가 깨진다. 우리가 손댈 이유가 있는 것은 **PATH 하나**뿐이므로 개입 범위를 최소로.
3. **`Path` 키를 지우고 `PATH` 로 통일** — 기각: 삭제는 되돌릴 수 없는 개입이다. 자식이 `Path` 를 기대하고 있을 수 있고(우리가 만든 env 가 아니라 사용자 시스템에서 온 것), 무엇보다 갱신만으로 목적이 달성되는데 삭제할 이유가 없다.
4. **교집합으로 목록 통일** — 기각: nvm 경로가 빠져 TerminalManager 가 회귀한다. 보강 목록은 fallback 이므로 "덜 넣기" 의 실패 비용이 "더 넣기" 보다 훨씬 크다.
5. **4곳의 목록 차이를 의도로 보고 그대로 4개 유지, 함수만 공유** — 기각: 그럼 드리프트가 그대로 남는다. 차이를 정당화하는 근거(주석/커밋)가 어디에도 없다. 나중에 진짜 의도된 차이가 필요해지면 그때 `claudeExtraPaths({ include: [...] })` 같은 파라미터를 추가하는 편이 낫다 — 지금 없는 요구를 위해 4개를 유지하지 않는다.
6. **`position` 을 필수 인자로** — 기각: 호출처가 늘어날 때마다 판단을 강요하는데, 정답이 거의 항상 `append` 다. 기본값 + 예외 1곳 명시가 실수 확률이 낮다.
7. **존재하는 디렉터리만 PATH 에 넣는다 (`existsSync` 필터)** — 기각: 순수 함수를 fs 의존으로 만들고, 앱 시작 후 설치된 도구(nvm 재설치 등)를 놓친다. PATH 에 없는 경로가 있는 것은 무해하다.

## 결과 (Consequences)

- **긍정**
  - Windows PATH 키 중복이 **구조적으로 불가능**해진다 (키를 새로 만드는 코드 경로가 없음).
  - 목록이 1곳이므로 "nvm 경로 추가" 같은 요청이 1줄 변경 + 4곳 자동 반영이 된다.
  - 빈 PATH 세그먼트 버그(POSIX 에서 `.` 로 해석) 가 같이 사라진다.
  - 순수 함수 + 플랫폼/구분자 주입 가능 → win32 경로를 mac CI 에서 검증할 수 있다.

- **부정 / 트레이드오프**
  - A-1 ~ A-4 에서 소비처를 교체할 때 **3곳의 실효 PATH 내용이 바뀐다** (합집합이므로 항목 증가). append 위치라 사용자 PATH 를 이기지 않아 회귀 위험은 낮지만, 0 은 아니다 — 예를 들어 사용자 PATH 에 없던 `/opt/homebrew/sbin` 이 AIService 경로에 새로 들어간다. 교체 트랙에서 수동 QA 항목으로.
  - AIService 의 prepend 는 유지되므로 "4곳이 같은 정책" 이 되지는 않는다. 코드를 읽는 사람이 여전히 예외 1건을 기억해야 한다 → 호출부 주석으로 방어.
  - 본 트랙에서는 소비처가 없어 당분간 **테스트에서만 호출되는 코드**다 (PRD R4).

- **모니터링**
  - PATH 키 2개 이상 발견 시 `warn` — 이미 오염된 env 가 들어온다는 신호. 실제로 찍히면 상류(누가 그 env 를 만들었는지)를 추적한다.
  - A-1 ~ A-4 교체 후 Windows VM 스모크: claude 실행 / PTY 안 `where claude` / MCP npx 서버 기동 3종.
