---
id: ADR-v2-windows-fix-06
title: MCP stdio 커맨드를 win32 에서 cmd /c 로 멱등 래핑하고, ~/.claude.json 쓰기는 writeFileAtomic — 읽기 시점 정규화는 하지 않는다
status: proposed
date: 2026-07-30
supersedes: []
domain: mcp-skills
---

# MCP stdio 커맨드 정규화와 공유 설정 파일의 원자적 쓰기

## 컨텍스트

MCP 서버는 `~/.claude.json` 의 `mcpServers.<name> = { command, args, env }` 로 등록되고, **claude 본체가** 그 커맨드를 spawn 한다. Clauday 는 등록/토글 UI 만 제공한다.

Windows 에서 `npx`, `uvx`, `pnpm dlx` 는 실행 파일이 아니라 **`npx.cmd` 같은 배치 런처**다. Node 20(claude 도 Node 로 돌아간다)은 CVE-2024-27980 대응으로 `.cmd`/`.bat` 을 `shell:false` 로 spawn 하면 `EINVAL` 을 던진다. MCP 생태계의 사실상 표준 등록 형태가

```json
{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\work"] }
```

이므로, **Windows 사용자가 문서를 그대로 따라 입력하면 반드시 실패한다.** 널리 알려진 회피는 `cmd /c` 래핑이다.

```json
{ "command": "cmd", "args": ["/c", "npx", "-y", "@modelcontextprotocol/server-filesystem", "C:\\work"] }
```

우리 UI(`MCPForm.tsx`)는 이 변환을 알려주지도, 해주지도 않는다.

두 번째 문제는 **쓰기 방식**이다. `McpConfigManager.writeRaw`(`:44-47`)는 `writeFile` 로 전체를 덮어쓴다. `~/.claude.json` 은 claude 본체와 **공유하는 파일**이고 수 MB 로 커질 수 있다(대화 이력 메타가 들어간다). 쓰기 도중 앱이 죽거나 디스크가 차면 잘린 JSON 이 남고, 그 순간 **claude 본체가 기동 불능**이 된다. 우리가 만든 파일이 아니므로 파괴 비용이 우리 앱을 넘어선다. Phase 1 이 `writeFileAtomic`(tmp→rename, Windows EPERM 1회 재시도)을 만들어 뒀지만 쓰이지 않고 있다.

## 결정

### 1. `normalizeStdioCommandForWindows` — 쓰기 시점 1회, 멱등

```ts
/** win32 에서 npx/uvx 계열·.cmd/.bat 커맨드를 `cmd /c` 로 감싼다. 이미 감싼 입력은 그대로 (멱등). */
export function normalizeStdioCommandForWindows(
  config: McpServerConfig,
  opts?: { platform?: NodeJS.Platform }
): McpServerConfig
```

- 적용 조건: `platform === 'win32'` **그리고** `getMcpTransport(config) === 'stdio'` **그리고** `command` 가 아래 중 하나
  - 이름이 `npx` / `uvx` / `npm` / `pnpm` / `yarn` / `bunx` (확장자 없음, 대소문자 무시)
  - `.cmd` / `.bat` 로 끝남
- 변환: `{ command: 'cmd', args: ['/c', 원본command, ...원본args] }`. `env` 등 나머지 필드는 그대로.
- **멱등**: `command` 가 `cmd`/`cmd.exe`(대소문자 무시)이고 `args[0]` 이 `/c`(또는 `/C`)면 그대로 반환. 사용자가 이미 수동으로 감싼 설정을 두 번 감싸지 않는다. `update` 가 반복 호출돼도 안전하다.
- **`node`/`python`/절대경로 exe 는 건드리지 않는다.** 실행 파일이면 래핑이 불필요하고, 불필요한 cmd 개입은 인용/codepage 문제를 새로 만든다.
- darwin/linux 는 **무변환** — 순수 함수 + platform 주입이라 mac CI 에서 win32 결과를 검증한다.
- 적용 지점: `McpConfigManager.add` / `update` **진입점**. `delete`·`list` 는 무관.

배치는 `src/shared/types/mcp.ts` 옆이 아니라 로직 모듈로 — `src/main/config/mcpNormalize.ts`. renderer 는 이 함수를 호출하지 않고(§4 참조) main 만 쓴다.

### 2. 정규화는 **쓰기 시점에만**, 읽기 시점에 되돌리지 않는다

`list()` 는 파일에 있는 그대로(`cmd /c npx ...`)를 보여준다. UI 에 원래 커맨드(`npx`)로 복원해 보여주는 "역정규화" 를 만들지 않는다.

이유: 역변환은 추측이다. 사용자가 **직접** `cmd /c` 로 쓴 설정과 우리가 감싼 설정을 구분할 수 없고, 구분 못 한 채 되돌리면 편집 후 저장에서 사용자 의도가 사라진다. 파일에 있는 것이 진실이고 UI 는 진실을 보여준다.

대신 **MCPForm 에 힌트**를 둔다: win32 에서 command 가 래핑 대상이면 "저장 시 `cmd /c` 로 감싸집니다 (Windows 필수)" 를 입력 아래에 표시. 변환을 숨기지 않고 예고한다.

### 3. `~/.claude.json` 쓰기는 `writeFileAtomic`

`writeRaw` → `writeJsonAtomic(this.configPath, data)`(Phase 1 유틸). tmp→rename 이라 **반쪽 쓰기가 불가능**하고, Windows 의 EPERM(백신/인덱서가 잠깐 잡는 경우)은 1회 재시도한다.

**한계를 명시한다**: 이것은 *반쪽 쓰기*만 막는다. `readRaw` → 수정 → `writeRaw` 사이에 claude 본체가 같은 파일을 쓰면 **그 변경을 덮어쓴다**(lost update). 파일 잠금이나 mtime 기반 낙관적 검증은 이번 스코프 밖 — claude 의 쓰기 빈도/타이밍을 모르는 상태에서 잠금을 도입하면 우리가 claude 를 막을 위험이 있다. PRD 비목표에 등재하고 후속 과제로 남긴다.

### 4. renderer 는 정규화하지 않는다

스킬 파일명(ADR-05)은 renderer 가 미리 정제한다. MCP 는 **반대로** 결정한다 — renderer 는 사용자 입력을 그대로 보내고 main 이 정규화한다.

차이의 근거: 스킬은 정제 결과가 곧 **표시 이름**이라 UI 가 그것을 알아야 거짓말을 안 한다. MCP 는 변환 결과가 표시 이름이 아니라 실행 명세이고, 저장 후 `list()` 재조회로 실제 값이 자연히 표시된다. 그리고 정규화를 renderer 에서 하면 **플랫폼 판정이 renderer 로 넘어간다** — renderer 는 `api.system.platform`(ADR-03 §4) 없이는 플랫폼을 모르고, main 이 이미 아는 사실을 renderer 로 옮길 이유가 없다.

## 대안과 기각 이유

1. **정규화 없이 MCPForm 에 안내만** ("Windows 는 `cmd /c` 를 직접 넣으세요") — 기각: 문서를 복사해 붙여넣는 것이 이 UI 의 주 사용법이다. 안내를 읽고 손으로 고치기를 기대하는 것은 실패를 사용자에게 전가하는 것이다. 우리가 확실히 아는 변환을 우리가 한다.
2. **읽기 시점에 정규화 (claude 가 읽기 전에 우리가 파일을 훑어 고침)** — 기각: 우리가 쓰지 않은 항목(claude CLI 나 다른 도구가 넣은 것)까지 건드리게 된다. 남의 설정을 조용히 재작성하는 것은 신뢰 파괴이고, `_claudayDisabledMcp` 전략(우리 키만 다룬다)의 원칙과도 어긋난다.
3. **`shell: true` 로 실행되게 설정에 플래그 추가** — 기각: 그런 필드가 claude 의 MCP 스키마에 없다. 우리가 spawn 하는 것이 아니라 claude 가 한다.
4. **`npx` → `npx.cmd` 로 확장자만 붙이기** — 기각: 여전히 `.cmd` 라 Node 의 EINVAL 대상이다. 그리고 `where` 없이 존재를 가정하게 된다.
5. **모든 stdio 커맨드를 무조건 `cmd /c` 로 감싼다** — 기각: `node`, 절대경로 `.exe` 까지 감싸면 cmd 가 인자를 재파싱하면서 공백/한글/`&` 이 새로 깨진다. 개입 범위는 필요한 것만.
6. **역정규화해서 UI 에는 항상 `npx` 로 표시** — 기각: §2. 사용자가 직접 쓴 `cmd /c` 와 구분 불가.
7. **`writeFileAtomic` 대신 파일 잠금(proper-lockfile 등)** — 기각: 새 의존성이고, claude 본체가 같은 잠금 규약을 쓰지 않으므로 **한쪽만 잠그는 잠금은 안전을 주지 않는다**(우리끼리만 직렬화). lost update 는 남지만 파일 파손은 사라진다 — 비용 대비 효과가 tmp→rename 쪽이 압도적이다.
8. **`~/.claude.json` 대신 별도 파일로 MCP 관리** — 기각: claude 가 그 파일을 안 읽는다. 이 파일을 쓰는 것이 요구사항 그 자체.

## 결과 (Consequences)

- **긍정**
  - Windows 사용자가 공식 문서의 `npx` 예시를 그대로 붙여넣어도 MCP 서버가 뜬다.
  - 멱등이라 토글(enable/disable)로 `update` 가 반복돼도 `cmd /c cmd /c npx` 같은 누적이 없다.
  - `~/.claude.json` 반쪽 쓰기로 **claude 본체를 망가뜨리는** 최악 시나리오가 사라진다.
  - `writeFileAtomic`/`normalizeStdioCommandForWindows` 모두 순수/주입 가능해 win32 경로를 mac CI 에서 검증한다.

- **부정 / 트레이드오프**
  - 저장 후 UI 에 보이는 커맨드가 입력한 것과 다르다(`npx` → `cmd`). 힌트로 예고하지만 놀라움은 남는다.
  - **mac 에서 만든 설정을 Windows 에서 열면 정규화되지 않은 채 있다**(그리고 그 반대도). 설정 파일이 플랫폼 종속이 된다 — 원래도 경로 때문에 그랬지만 커맨드까지 그렇게 된다. 동기화 시나리오는 지원 대상이 아님을 전제.
  - 정규화 대상 목록(`npx`/`uvx`/…)이 하드코딩이라 새 런처가 나오면 추가해야 한다. `.cmd`/`.bat` 접미 규칙이 대부분을 잡아주는 것이 완화책.
  - lost update 는 그대로 남는다(§3).

- **모니터링**
  - `writeFileAtomic` 의 rename 재시도가 발생하면 `warn` — Windows 백신 간섭 신호.
  - MCP 등록 후 claude 세션에서 서버가 뜨는지는 우리 로그에 안 남는다(claude 소관) → Windows QA 항목으로만 확인 가능.
  - Windows VM: ①`npx` 기반 서버 신규 등록 → claude 에서 인식 ②비활성화 후 재활성화(멱등) ③기존에 손으로 `cmd /c` 를 넣어둔 설정 편집 시 이중 래핑 없음.
