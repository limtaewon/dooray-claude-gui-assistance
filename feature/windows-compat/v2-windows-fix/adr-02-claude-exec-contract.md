---
id: ADR-v2-windows-fix-02
title: claude 실행 5개 지점을 claudeSpawnCommand 단일 계약으로 — argv 는 각자, PATH 는 mergePathIntoEnv, stdout 은 StringDecoder
status: proposed
date: 2026-07-30
supersedes: []
domain: windows-compat
---

# claude 실행 경로의 단일 계약

## 컨텍스트

claude CLI 를 실행하는 지점이 5곳이고, 5곳이 서로 다른 조합을 쓴다.

| # | 위치 | 방식 | shell | verbatim | 인용 | PATH 보강 |
|---|---|---|---|---|---|---|
| 1 | `ClaudeChatService.ts:177` | `spawn` | `isWindows` | `isWindows` | ✗ | append(자체 목록) |
| 2 | `AIService.ts:451` (`runClaudeStream`) | `spawn` | `isWindows` | `isWindows` | ✗ | **prepend**(자체 목록) |
| 3 | `AIService.ts:107` (`captureClaudeVersion`) | `execFileSync` | `win32` | – | ✗ | 없음(`process.env` + DISABLE_OMC) |
| 4 | `AIService.ts:673` (`isAvailable`) | `execFileSync` | `win32` | – | ✗ | `enrichedEnv()` |
| 5 | `index.ts:1414` (CLI Info) | `execFile` | **없음** | – | ✗ | append(자체 목록, 또 다름) |
| – | `AIService.ts:344` (`runClaude`) | `execFile` | **없음** | – | ✗ | `enrichedEnv()` |

세 가지 결함이 이 표에서 바로 읽힌다.

**결함 1 — 인용이 5곳 모두 없다.** Windows 에서 `shell:true` + `windowsVerbatimArguments:true` 면 node 는 인자를 인용하지 않는다(verbatim 의 정의). 게다가 `shell:true` 일 때 node 는 `[file, ...args].join(' ')` 로 커맨드라인을 만들면서 **file 도 인용하지 않는다**. `C:\Program Files\nodejs\claude.cmd` 는 `C:\Program` 에서 끊긴다. 한국 사용자 홈이 `C:\Users\홍 길동` 인 경우도 같은 결과.

**결함 2 — #5 는 shell 을 안 거친다.** `execFile('claude', ...)` 는 PATHEXT 해석을 못 해서 `claude.cmd` 를 찾지 못한다 → ENOENT → Windows 에서 CLI Info 패널이 통째로 빈다. 게다가 바이너리 해석조차 안 하고 문자열 `'claude'` 를 그대로 쓴다.

**결함 3 — `runClaude` 는 호출자가 없는데 지뢰다.** `execFile(CLAUDE_CLI, ...)` 에 shell 옵션이 없다. Node 20(Electron 33)은 CVE-2024-27980 대응으로 **`.cmd`/`.bat` 을 shell 없이 실행하면 `EINVAL` 을 던진다**. `resolveClaudeBin()` 이 Windows 에서 `.cmd` 를 반환하도록 바뀐 지금(ADR-v2-utils-04 §2), 이 코드는 호출되는 순간 100% 실패한다.

여기에 두 가지가 더 얹힌다.

**PATH 보강 4곳의 드리프트** — ADR-v2-utils-03 이 진단하고 `mergePathIntoEnv`/`claudeExtraPaths` 로 해결책까지 만들었으나 소비처를 안 바꿔 죽은 코드로 남아 있다. Windows 의 `Path`/`PATH` 키 중복도 그대로다.

**stdout chunk 경계 멀티바이트** — `ClaudeChatService.ts:198` 과 `AIService.ts:503` 이 `data.toString('utf-8')` 을 **chunk 마다** 호출한다. 한글 3바이트가 chunk 경계에 걸리면 양쪽 다 U+FFFD 가 되고 원본 바이트는 복구 불가능하게 소실된다. 스트리밍 응답이 길수록(브리핑/보고서) 확률이 올라간다. stderr 는 이미 raw Buffer 로 모았다가 끝에서 한 번 디코드하므로 안전한데, stdout 만 안 되어 있다.

**그리고 이 자리는 `CLAUDE.md` 가 가장 강하게 경고하는 자리다.** 함정 1 "양쪽 일관성의 함정", 함정 3 "shell:true 의존성". 리팩터 충동이 가장 크게 드는 곳이자 가장 위험한 곳.

## 결정

### 1. 불변식 — mac 경로와 argv 조립은 손대지 않는다

이 ADR 의 어떤 변경도 다음을 바꾸지 않는다:

- mac 의 spawn command(절대경로, 인용 없음) / `shell:false` / `windowsVerbatimArguments:false`
- `AIService.runClaudeStream` 의 argv 조립 블록 전체 (`:396-447`) — `--output-format` 정리, `-p` 본문 stdin 분리, **Windows 한정 `--append-system-prompt` → stdin combine**
- `enrichedEnv()` 가 붙이는 `DISABLE_OMC` / `ANTHROPIC_API_KEY`

검증은 기계적으로 한다: `git diff` 상 `:396-447` 변경 0 줄 + 기존 `AIService.test.ts` 65개 **무수정** 통과.

### 2. command / shell / verbatim 은 `claudeSpawnCommand()` 에서만 나온다

5개 지점 전부 아래 형태로 바꾼다.

```ts
const { command, shell, windowsVerbatimArguments } = claudeSpawnCommand({ bin })
```

- #1 `ClaudeChatService` 는 생성자로 받은 `this.claudeBin` 을 `bin` 으로 넘긴다 (주입 유지 — 테스트가 가짜 경로를 넣고 있다).
- #2 `AIService.runClaudeStream` 은 `CLAUDE_CLI` 를 넘긴다.
- #3 #4 `execFileSync` 는 `command` 와 `shell` 만 쓴다 (`execFileSync` 에는 verbatim 옵션이 의미 없다 — shell:true 일 때 node 가 내부적으로 설정).
- #5 `index.ts` CLI Info 는 `execFile('claude')` → `execFile(command, args, { shell, ... })`.

darwin 결과는 현행과 동일하고, win32 는 **인용이 추가된다**. 인라인 `shell: isWindows` 판정이 코드베이스에서 사라진다 — 새 spawn 지점을 만드는 사람이 Windows 분기를 다시 틀리게 짤 여지를 없애는 것이 이 결정의 본질이다.

### 3. `runClaude` 는 고치지 않고 삭제한다

호출자가 0 이고, 유일한 shell 미경유 `execFile` 이며, Windows 에서 확실히 EINVAL 이다. 고쳐서 남기면 "동작 검증된 적 없는 경로" 를 계약에 편입시키는 것이고, 남겨두면 다음 사람이 그대로 호출한다. `ClaudeCliResult` 타입은 `runClaudeStream` 이 계속 쓰므로 유지. 삭제로 미사용이 되는 import(`execFile`)도 함께 정리한다. (사용자 CLAUDE.md §9 변경 위생 — 백워드 호환 잔여물 금지)

### 4. PATH 보강 4곳 → `mergePathIntoEnv` + `claudeExtraPaths`, 방향은 보존

```ts
// ClaudeChatService / index.ts CLI Info — append (기본값)
mergePathIntoEnv(process.env, claudeExtraPaths())

// AIService — prepend 유지. 절대경로 spawn 이라 PATH 가 바이너리 선택에 관여하지 않는다.
mergePathIntoEnv(process.env, claudeExtraPaths(), { position: 'prepend' })
```

`position` 을 바꾸지 않는다. `decisions-log.md`(2026-04) 의 "PATH 보강 append, prepend 금지" 는 **PATH 검색으로 바이너리를 고르는 경로**에 대한 정책이고, AIService 는 `resolveClaudeBin()` 이 준 절대경로로 spawn 하므로 그 위험이 구조적으로 없다. 마스터 계획 A-0 표도 "AIService(prepend 유지)" 로 명시. 호출부에 이 근거를 주석으로 남긴다 — 다음 사람이 "일관성" 을 이유로 통일하려 들 때 읽을 것.

`TerminalManager` 의 PATH 보강도 같은 유틸로 가지만, PTY env 는 한글 env 세트와 얽혀 있어 ADR-03 에서 함께 다룬다.

### 5. stdout 디코딩은 `StringDecoder('utf8')` — 프로세스당 1개

```ts
const decoder = new StringDecoder('utf8')
proc.stdout.on('data', (data: Buffer) => { const chunk = decoder.write(data); ... })
proc.on('close', () => { const tail = decoder.end(); if (tail) /* 잔여 처리 */ })
```

- 2곳(`ClaudeChatService`, `AIService.runClaudeStream`)에 적용. 디코더는 **세션/프로세스마다 하나**여야 한다(모듈 전역 공유 금지 — 동시 실행되는 두 프로세스의 바이트가 섞인다).
- stderr 는 현행(raw Buffer 누적 → 끝에서 `decodeProcessText`)을 유지한다. `decodeProcessText` 는 cp949 자동 폴백이 목적이라 성격이 다르고, 전체 버퍼가 있어야 판정할 수 있다. **stdout 에 `decodeProcessText` 를 쓰지 않는다** — claude 의 stream-json 은 항상 UTF-8 이고, 스트리밍은 전체 버퍼를 기다릴 수 없다.
- `close` 시점의 `decoder.end()` 잔여는 불완전 시퀀스이므로 버려도 되지만, 버릴 때도 조용히 버리지 말고 길이가 0 이 아니면 `warn`(사용자 CLAUDE.md §4 결과 무시 금지).

## 대안과 기각 이유

1. **인용만 추가하고 spawn 옵션은 각자 두기** — 기각: 결함 1 은 닫히지만 5곳이 여전히 5가지다. 다음 spawn 지점이 6번째 변종이 된다. Phase 1 이 `claudeSpawnCommand` 를 만든 이유가 정확히 이것이고, 안 쓰면 죽은 코드가 유지된다.
2. **`claudeSpawnCommand` 가 argv 까지 조립하게 확장** — 기각: ADR-v2-utils-04 §대안3 이 이미 기각했고 impl-log 가 "argv 조립 로직을 추가하지 말 것" 으로 못박았다. argv 를 공통화하면 "Mac 도 stdin 으로 통일하자" 를 **한 곳에서** 할 수 있게 되는데, 그게 `CLAUDE.md` 함정 1 그 자체다. 경계는 command + spawn 플래그.
3. **Windows 도 `shell:false` + `cmd.exe /c` 직접 spawn** — 기각: `CLAUDE.md` 함정 3. 이론적으로 더 깨끗하지만 codepage/verbatim/한글 mojibake 가 얽힌 검증된 조합을 흔든다. 본 트랙 목적은 수복이지 재설계가 아니다.
4. **`runClaude` 를 `shell:isWindows` 로 고쳐서 남긴다** — 기각: §3. 호출자 0 인 코드에 Windows 분기를 넣는 것은 검증 불가능한 계약을 늘리는 일이다. 필요해지면 그때 `runClaudeStream` 을 재사용하거나 새로 쓰는 편이 낫다.
5. **stdout 도 `decodeProcessText` 로 통일 (cp949 폴백 포함)** — 기각: 스트리밍에서는 전체 버퍼가 없어 cp949 판정(`�` 개수 비교)이 불가능하고, chunk 마다 판정하면 같은 응답 안에서 인코딩이 오락가락한다. 그리고 claude 의 stdout 은 stream-json(UTF-8 고정)이다. 문제는 인코딩 추정이 아니라 **경계 처리**이므로 `StringDecoder` 가 정확한 도구다.
6. **`iconv-lite` 등 외부 디코더 도입** — 기각: 새 런타임 의존성. `StringDecoder` 는 Node 코어이고 필요한 기능(경계 보존)을 정확히 제공한다.
7. **PATH 보강도 `claudeSpawnCommand` 안으로 흡수** — 기각: env 는 spawn 지점마다 다른 것(DISABLE_OMC, API 키, PTY 의 LANG/한글 세트)이 붙는다. 하나로 묶으면 그 차이를 옵션 플래그로 표현하게 되고 함수가 4개 소비처의 합집합 파라미터를 갖게 된다. `mergePathIntoEnv` 는 PATH 만, 나머지는 호출부.

## 결과 (Consequences)

- **긍정**
  - Windows CLI Info 패널이 복구된다(결함 2). 공백 포함 설치 경로가 5곳에서 동시에 해결된다(결함 1).
  - 한글 스트리밍 응답의 chunk 경계 깨짐이 사라진다 — Windows 뿐 아니라 **mac 에서도 잠재적으로 발생하던 버그**다.
  - `Path`/`PATH` 키 중복이 구조적으로 불가능해진다.
  - 죽은 코드 2종(`runClaude`, Phase 1 유틸 4개)이 정리된다.
  - 새 spawn 지점이 생겨도 Windows 분기를 다시 틀릴 수 없다.

- **부정 / 트레이드오프**
  - **3곳의 실효 PATH 내용이 바뀐다** (합집합 채택의 결과, ADR-v2-utils-03 이 예고한 그대로). AIService 는 prepend 라 새 경로가 사용자 PATH 를 **이긴다** — 새로 들어가는 것은 `/opt/homebrew/sbin` 과 `~/.nvm/versions/node/current/bin` 2종이고, 둘 다 claude 바이너리 위치가 아니라서 "구버전 claude 를 잡는" 회귀는 발생하지 않는다. 그래도 mac 스모크(브리핑 생성)를 수동 QA 에 넣는다.
  - Windows 에서 `resolveClaudeBin()` 이 고르는 바이너리가 현행과 달라질 수 있다(첫 줄 → `.cmd` 우선). ADR-v2-utils-04 가 예고한 의도된 변화지만 실기 확인이 필요하다.
  - `execFileSync` 2곳은 `windowsVerbatimArguments` 를 못 준다 — `claudeSpawnCommand` 반환값의 일부를 안 쓰는 형태가 된다. 계약이 완전히 균일하지는 않다.
  - `StringDecoder` 인스턴스가 세션마다 생기므로 세션 정리 시 함께 버려져야 한다(누수는 아니지만 수명 관리 대상이 하나 는다).

- **모니터링**
  - `cliLogger` 진단 로그에 platform/argv/bin 이 이미 남는다. 교체 후에도 **해석된 바이너리 경로가 로그에 남는지** 확인(`CLAUDE.md` 함정 4).
  - `[env] PATH 키 중복 발견` warn 이 Windows 에서 찍히면 상류(누가 그 env 를 만들었는지) 추적.
  - Windows VM: ①브리핑/보고서 생성(stream-json 수신) ②CLI Info 패널 채워짐 ③공백 포함 경로 설치본 ④한글 긴 응답 스트리밍 중 `?`/`�` 미발생.
  - mac: `AIService.test.ts` 무수정 전체 통과가 불변식 §1 의 자동 감시자.
