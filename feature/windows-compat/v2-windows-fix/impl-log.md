---
task: v2-windows-fix
date: 2026-07-30
---

# Impl Log — v2.0 Phase 2 Windows 호환 수복

## [renderer] §3-4 + §7-1 (windowsPty 게이트)

**담당 편차 안내**: plan.md 는 §3-4(`shared/utils/windowsPty.ts` 신설 + preload `api.system` 노출)를
main-process-engineer 몫으로 표시해뒀다. 이번 라운드는 상위 브리핑(`feature/terminal/v2-terminal-p2/`)
에서 main-process-engineer 2명이 세션/스킬/MCP · workspace/GitService 트랙에 묶여 있어,
renderer-engineer 가 §3-4 + §7-1 을 함께 수행했다. §1~§6(A-1 세션, A-2 CLAUDE_START_TASK 등)과
§7-2/§7-3(SkillsManager 파일명 정제, MCPForm 힌트)은 손대지 않았다 — 이번 스코프 밖.

### 변경한 파일

- `src/shared/utils/windowsPty.ts` (신규) — `windowsPtyOptions(platform, osRelease)` 순수 함수. xterm 타입 미의존
- `src/shared/utils/windowsPty.test.ts` (신규, 7 tests) — plan.md §3-4 명시 케이스(22621 통과/19044 미통과/osRelease 없음/파싱불가/darwin/경계값 21376·21375) 그대로
- `src/preload/index.ts` — `import { release } from 'os'` + `api.system = { platform: process.platform, osRelease: release() }` 정적 값 1건 추가. 기존 IPC 채널·핸들러는 무변경(신규 채널 0개)
- `test/helpers/mockWindowApi.ts` — `system: { platform: 'darwin', osRelease: '23.0.0' }` 기본값 추가(정적 객체, `vi.fn()` 아님)
- `src/renderer/src/components/Terminal/TerminalPane.tsx` — mount effect 최상단에서
  `windowsPtyOptions(window.api?.system?.platform ?? platformFallback, window.api?.system?.osRelease)`
  계산 후 `new Terminal({ ...(windowsPty ? { windowsPty } : {}) })` 로 조건부 스프레드. `platformFallback`
  은 `navigator.platform` 에 `WIN` 포함 여부로 최소 추정(실질적으로는 `osRelease` 가 없으면 항상
  `undefined` 로 귀결되므로 이 폴백이 결과를 바꾸는 경우는 거의 없다 — 방어적 배선)
- `src/renderer/src/components/Terminal/TerminalPane.test.tsx` — `Terminal` mock 생성자가 옵션을
  `lastTerminalOptions` 로 캡처하도록 확장 + `windowsPty 게이트` describe 3케이스(22621 포함/darwin
  미포함/19044 구형 미포함) 추가

### 결정 사항 (해야 할 것)

- `windowsPtyOptions` 의 반환 타입은 `{ backend: 'conpty'; buildNumber: number } | undefined` —
  `@xterm/xterm` 의 `IWindowsPty` 와 구조적으로 동일(타입 자체는 import 하지 않음, ADR-03 §4 의도대로
  "xterm 타입에 의존하지 않는 순수 반환값" 유지).
- `api.system` 은 함수가 아니라 **정적 객체**다 — preload 는 모듈 로드 시 1회 `process.platform`/
  `release()` 를 읽어 굳힌다. 재부팅 없이 OS 버전이 바뀔 일이 없으므로 매 호출 조회는 불필요.
- `TerminalPane.tsx` 에서 `windowsPty` 를 조건부 스프레드로 넣은 이유: 옵션 키 자체가 없어야
  xterm 의 기본 동작(옵션 미지정)과 완전히 동일하다는 것을 코드로 보증할 수 있어서 —
  `windowsPty: undefined` 를 명시로 넣는 방식은 일부 라이브러리에서 "명시적 undefined" 와
  "키 없음" 을 다르게 취급할 수 있어 피했다.

### 제약 (하지 말 것)

- §1~§6(A-1/A-2/A-3/A-4, main 파트 전체)과 §7-2(SkillsManager 파일명 정제)/§7-3(MCPForm 힌트)은
  이번 라운드에서 **손대지 않았다** — 각각 main-process-engineer / renderer 후속 라운드 몫.
- `TerminalManager.ts` 의 셸 감지·spawn·ConPTY DLL 폴백 로직(§3-1~§3-3)은 미착수.
- `src/main/**` 무수정. preload 는 `api.system` 1건 추가만 했고 기존 도메인 API 는 건드리지 않았다.

### 참조

- ADR-v2-windows-fix-03 §4 (`adr-03-windows-pty-spawn.md`)
- `feature/terminal/v2-terminal-p2/impl-log.md` `## [renderer] B-3` — 같은 라운드에 함께 수행한
  터미널 트랙 작업 기록(TerminalPane 의 나머지 변경 사항)

---

## [main] A-1/A-3/MCP

**스코프**: A-1 세션(§1) + A-1 실행계약(§2, 단 §2-3 PATH 병합 제외) + A-3 스킬/ConfigWatcher(§5) + A-4 중 MCP 부분(§6-1, §6-2)만. `index.ts` 는 세션 리더(`CLAUDE_SESSIONS_LIST`)·CLI Info(`execFile('claude')`)·`~` 확장 3곳만 만졌다. TerminalManager/TerminalPane/GitService/env 병합 4곳/CLAUDE_START_TASK/renderer 는 오케스트레이터 브리핑이 명시적으로 다른 라운드·트랙 소유로 지정해 손대지 않았다.

### 변경한 파일

- `src/main/utils/claudeProjects.ts` (수정) — `formatProjectLabel({cwd, encodedDirName}, opts?)` 신설 (ADR-01 §3)
- `src/main/utils/claudeProjects.test.ts` (수정) — `formatProjectLabel` darwin/darwin-홈밖/win32-대소문자/cwd미상 4케이스 append
- `src/main/claude/ClaudeSessionService.ts` (수정) — `PROJECTS_DIR` 모듈 상수·`private encodeCwd`·`private projectDir` 삭제. 생성자 `opts?: { configDir? }` 로 `claudeProjectsRoot`/`findProjectDir` 위임. `listSessions`/`loadSession` 모두 `findProjectDir` 경유
- `src/main/claude/ClaudeSessionService.test.ts` (수정) — 복제 `encodeCwd` 삭제 후 `../utils/claudeProjects` import 로 대체, private 메서드 monkeypatch 제거하고 생성자 주입(`{ configDir }`)으로 교체, win32 스타일 cwd 회귀 테스트 + 점·공백·한글 cwd 회귀 테스트 신설
- `src/main/claude/ClaudeChatService.ts` (수정) — spawn 이 `claudeSpawnCommand({ bin: this.claudeBin })` 사용(인라인 `isWindows` 판정 제거), `ChatSession` 에 `stdoutDecoder: StringDecoder` 필드 추가해 stdout 디코딩 경계 보존, `close` 핸들러에서 잔여 바이트 warn
- `src/main/claude/ClaudeChatService.test.ts` (수정) — 멀티바이트 chunk 경계 분할 회귀 테스트 1건 추가
- `src/main/ai/AIService.ts` (수정) — `captureClaudeVersion`/`isAvailable`/`runClaudeStream` spawn 3곳이 `claudeSpawnCommand({ bin: CLAUDE_CLI })` 로 통일. dead `private runClaude` 삭제(+ 미사용 `execFile` import 정리). `runClaudeStream` stdout 이 세션(=호출)당 `StringDecoder` 사용, `close` 에서 잔여 warn. **`enrichedEnv()`(PATH 병합)와 argv 조립 블록(`--output-format` 정리~Windows stdin combine)은 1바이트도 안 건드림**
- `src/main/ai/AIService.test.ts` (수정, 65개 기존 테스트 무수정) — stdout 멀티바이트 경계 회귀 1건 + `claudeSpawnCommand` 계약(darwin shell:false/win32 shell:true) 회귀 2건 **추가만**
- `src/main/index.ts` (수정) — ①`CLAUDE_SESSIONS_LIST`: `parseFirstMessage` 가 같은 스트림에서 `cwd` 필드도 추출(추가 I/O 0), `-`→`/` 역치환 블록 삭제하고 `formatProjectLabel` 로 라벨 계산, 조기종료 조건을 `firstMsg && (cwd !== undefined || lines >= 50)` 로 보강 ②CLI Info: `execFile('claude', ...)` → `execFile(command, args, {..., shell})` (`claudeSpawnCommand` 로 해석된 바이너리 + shell 사용, PATH/env 계산부는 무변경) ③`SHELL_READ_IMAGE_DATAURL`/`SHELL_SHOW_IN_FOLDER`/`SHELL_OPEN_PATH` 3곳의 `~` 확장 인라인 로직을 `expandHome()` 으로 교체
- `src/main/config/SkillsManager.ts` (수정) — `resolveSkillDir(filename)` 신설(경로 봉쇄 검증, 이름 비변형). `save` 는 `sanitizeSkillFilename` 적용 후 봉쇄 재검증(이중 방어) + 정제 시 warn. `read`/`delete` 는 이름 변형 없이 봉쇄만. `delete` 는 `lstat` 로 심볼릭 링크/디렉터리를 구분해 링크는 `unlink`, 디렉터리는 `rm(recursive,force)`. `deleteMany` 반환이 `{deleted, failed}` 로 확장되고 실패마다 warn. `exportToFolder` 내보낼 파일명도 sanitize
- `src/main/config/SkillsManager.test.ts` (수정) — sanitize/봉쇄/레거시 호환/디렉터리 잔존 없음/심볼릭 링크 보존/deleteMany 집계 회귀 테스트 8건 추가
- `src/main/config/ConfigWatcher.ts` (수정) — `start()` 가 watch 전 `mkdirSync(recursive)` 로 `skills`/`commands` 선생성(`settings.json` 은 파일이라 제외), `watcher.on('error', ...)` 구독 + warn
- `src/main/config/ConfigWatcher.test.ts` (수정) — `fs` 모듈 부분 mock(`mkdirSync`) 추가, chokidar mock 에 `error` 핸들러/`emitError` 헬퍼 확장, 선생성/실패시 warn/`error` 구독 회귀 테스트 3건 추가
- `src/main/config/mcpNormalize.ts` (신규) — `normalizeStdioCommandForWindows(config, opts?)` (ADR-06 §1)
- `src/main/config/mcpNormalize.test.ts` (신규, 15 tests)
- `src/main/config/McpConfigManager.ts` (수정) — `add`/`update` 진입점에서 `normalizeStdioCommandForWindows` 적용, `writeRaw` 가 `writeJsonAtomic` 사용
- `src/main/config/McpConfigManager.test.ts` (수정) — win32 래핑/darwin 무변환/토글 반복 멱등/tmp 파일 잔존 없음 회귀 테스트 4건 추가
- `src/shared/types/skills.ts` (수정) — `SkillDeleteManyResult { deleted, failed }` 신설
- `src/preload/index.ts` (수정) — `skills.deleteMany` 반환 타입을 `SkillDeleteManyResult` 로 교체 (로직 변경 없음, 타입만)
- `test/helpers/mockWindowApi.ts` (수정) — `skills.deleteMany` mock 기본값 `{ deleted: 0, failed: 0 }`
- `CHANGELOG.md` (수정) — Unreleased 에 "버그 수정 (Windows 호환 수복 — Workstream A-1/A-3/MCP)" 섹션 추가
- `feature/windows-compat/v2-windows-fix/plan.md` (수정) — 담당 체크박스 갱신 (§1, §2-1/2-2/2-4, §5, §6-1/6-2/6-4, §8 일부)

### 결정 사항 (해야 할 것)

- `ClaudeSessionService` 생성자를 `opts?: { configDir? }` 로 열되 `index.ts:174` 의 `new ClaudeSessionService()`(인자 없음) 호출은 그대로 두었다 — `claudeProjectsRoot({ configDir: undefined })` 가 `~/.claude/projects` 로 떨어지는 기존 계약을 그대로 쓴다.
- `index.ts` `CLAUDE_SESSIONS_LIST` 의 조기 종료 조건을 `firstMsg && lines >= 50` 에서 `firstMsg && (cwd !== undefined || lines >= 50)` 로 바꿨다. 근거: 원래 코드는 `firstMsg` 를 찾은 뒤에는 JSON.parse 자체를 건너뛰고 `lines` 카운트만 세웠다(`if (!firstMsg) {...}` 게이트) — 즉 firstMsg 이후 줄에서는 cwd 를 볼 기회가 원천적으로 없었다. 게이트를 `if (!firstMsg || cwd === undefined)` 로 넓혀 firstMsg 발견 후에도 cwd 를 못 찾은 동안은 계속 파싱하게 하고, 종료 조건에 `cwd !== undefined` 를 추가해 둘 다 찾으면 50줄을 다 채우지 않고도 즉시 끝나게 했다(파일마다 소폭의 파싱 절약). 50줄 상한 자체는 그대로 유지(추가 I/O 0, 스트림도 새로 열지 않음).
- ADR-05 §2 vs plan.md §5 테스트 문면의 편차: plan.md 는 "`save`/`read`/`delete` 에 `../../evil` 을 넣으면 throw" 라고 썼지만, `save` 는 **sanitize 가 슬래시/연속 점을 먼저 안전한 문자로 치환**하므로 traversal 문자 자체가 남지 않아 throw 하지 않는다(대신 skillsDir 안의 무해한 이름으로 저장됨 — 결과적으로 여전히 "차단"). `read`/`delete` 는 sanitize 를 안 하므로 그대로 throw. ADR-05 본문(§2 "대신 traversal 만 막는다"와 §1 "샌타이즈는 쓰기 경계에서만")이 이 동작을 정확히 예견하고 있어 ADR 을 우선했고, 테스트를 `save`(정제 후 무해화 확인) / `read`+`delete`(throw 확인) 로 나눠 작성했다.
- AIService `captureClaudeVersion`/`isAvailable` 은 호출마다 `claudeSpawnCommand({ bin: CLAUDE_CLI })` 를 새로 계산한다(캐시 안 함) — 순수 함수 호출 비용이 무시할 만하고, `getClaudeBin()` 처럼 모듈 로드 시 1회 평가해야 할 이유(ADR-v2-utils-04 §5 의 "평가 시점 불변")가 이 값에는 없다.
- `McpConfigManager.ensureDir`(홈 디렉터리 존재 확인)은 유지했다 — `writeJsonAtomic` 이 tmp 파일을 같은 디렉터리에 쓰므로 그 디렉터리가 없으면(극단적으로 홈 자체가 아직 없는 최초 실행 등) 실패한다. 사실상 no-op 에 가깝지만 제거해서 얻는 이득이 없고, 제거 시 그 극단 케이스에서 원자적 쓰기 자체가 깨진다.
- index.ts 의 CLI Info(`richEnv`/`extraPaths`)·`ClaudeChatService.enrichedClaudeEnv`·`AIService.enrichedEnv` 는 오케스트레이터 브리핑이 "env 병합 4곳" 을 다른 라운드 소유로 명시했으므로 **일부러 손대지 않았다** — `execFile`/`spawn` 의 command/shell 만 `claudeSpawnCommand` 로 바꾸고 그 자리의 env 계산 로직은 원문 그대로 둔 채 넘어갔다.

### 제약 (하지 말 것)

- **PATH 병합 4곳(`ClaudeChatService.enrichedClaudeEnv`/`AIService.enrichedEnv`/`index.ts` CLI Info `richEnv`/`TerminalManager.enrichedTerminalPath`)에 `mergePathIntoEnv`/`claudeExtraPaths` 를 아직 넣지 말 것** — 이유: 이번 라운드 브리핑이 다른 트랙 소유로 명시. 그대로 두면 Phase 1 유틸 2종(`mergePathIntoEnv`, `claudeExtraPaths`)은 여전히 죽은 코드다.
- **`GitService.ts:150,173` 를 손대지 말 것** — 이유: 오케스트레이터 브리핑이 다른 트랙(워크스페이스/GitService) 소유로 명시. `samePath` 의 GitService 쪽 소비처는 여전히 없다(claudeProjects.ts 내부 소비는 Phase 1 부터 이미 존재).
- **`TerminalManager.ts`/`TerminalPane.tsx`/`CLAUDE_START_TASK` 를 손대지 말 것** — §3/§4(A-2 터미널) 는 다른 라운드 소유. `windowsShell.ts`/`startTaskSpawn.ts` 는 아직 존재하지 않는다.
- **`src/renderer/**` 를 손대지 말 것** — `ClaudeManual.tsx` SECTIONS 에 "위키 스킬 이름이 Windows 금지문자로 바뀔 수 있다" / "MCP 커맨드가 `cmd /c` 로 감싸진다" 를 추가하는 문서화 작업(plan.md §10)이 남아있으나, 이 파일은 `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx` 라 main-process-engineer 규칙상 수정 금지 대상이다 — renderer-engineer 인계 필요.
- **`SkillsManager.read`/`delete` 에 sanitize 를 넣지 말 것** — 이유: ADR-05 §2, 레거시 비정규 이름 스킬이 접근 불가가 된다(실제로 회귀 테스트로 고정함).
- **`AIService.runClaudeStream` 의 argv 조립(`--output-format` 정리 ~ Windows stdin combine, 원래 `:396-447`)에 손대지 말 것** — `git diff` 로 해당 블록 0줄 변경 확인함(스폰 콜 자체는 그 블록 밖이라 `claudeSpawnCommand` 사용으로 교체 가능했음).

### 플랫폼 분기 감사 (이번 라운드가 만지거나 새로 둔 `process.platform` 지점)

| 파일 | 지점 | darwin 테스트 | win32 테스트 |
|---|---|---|---|
| `claudeBin.ts`(Phase 1, 소비만 늘림) | `claudeSpawnCommand` 내부 | `claudeBin.test.ts`(24개, 기존) | 〃 |
| `AIService.ts` | `captureClaudeVersion`/`isAvailable`/`runClaudeStream` spawn — 이제 `claudeSpawnCommand` 호출로 대체, 인라인 `process.platform` 없음 | `AIService.test.ts` "claudeSpawnCommand 계약 — darwin" (신규) | 〃 "win32" (신규) |
| `AIService.ts:380`(argv 조립, 미변경 유지) | Windows 한정 stdin combine 분기 | 기존 65개 중 "Mac/Linux 경로" 류 다수 | 기존 65개 중 "Windows 경로" 류 다수 |
| `ClaudeChatService.ts` | spawn — `claudeSpawnCommand` 호출로 대체, 인라인 `process.platform` 없음 | `claudeBin.test.ts` 로 커버(간접) | 〃 |
| `claudeProjects.ts` | `formatProjectLabel` platform 파라미터 | `claudeProjects.test.ts` darwin 2케이스(신규) | 〃 win32 1케이스(신규) |
| `mcpNormalize.ts` | `normalizeStdioCommandForWindows` platform 파라미터 | `mcpNormalize.test.ts` darwin 2케이스(신규) | 〃 win32 다수(신규) |
| `McpConfigManager.ts` | `add`/`update` 내부에서 `normalizeStdioCommandForWindows()` 호출(파라미터 미지정 → `process.platform`) | `McpConfigManager.test.ts` darwin 1케이스(신규) | 〃 win32 3케이스(신규, `Object.defineProperty` 주입) |
| `ClaudeChatService.ts:20`/`AIService.ts:247`(`enrichedEnv`류, PATH 병합) | 인라인 `isWindows` 분기 — **미변경** | 기존 상태 유지, 이번 라운드 테스트 추가 없음 | 〃 |

### 미실행 (후속 라운드/다른 트랙 인계)

- §2-3 PATH 병합 4곳, §6-3 GitService `samePath`, §3/§4 터미널(A-2), §7-2/§7-3 renderer(스킬 이름 미리 정제·MCP 힌트) — 전부 오케스트레이터 브리핑이 다른 라운드·트랙 소유로 명시.
- `ClaudeManual.tsx` 문서화(위키 스킬 이름 정제·MCP `cmd /c` 안내) — renderer 파일이라 손 못 댐, renderer-engineer 인계 필요.
- mac/Windows 수동 스모크 — 에이전트가 GUI 조작 불가. plan.md §11 Windows 스모크 체크리스트는 이미 산출물로 존재(선행 작성자).

### 참조

- ADR-v2-windows-fix-01 (`adr.md`) — 세션 조회/라벨 단일 경로
- ADR-v2-windows-fix-02 (`adr-02-claude-exec-contract.md`) — claude 실행 5개 지점 단일 계약
- ADR-v2-windows-fix-05 (`adr-05-skill-filename-boundary.md`) — 스킬 파일명 경계·삭제 의미론
- ADR-v2-windows-fix-06 (`adr-06-mcp-stdio-normalize.md`) — MCP stdio 정규화·원자적 쓰기
- `feature/windows-compat/v2-utils/impl-log.md` §제약 — 승계한 5건 전부 위반하지 않았음(`claudeSpawnCommand` 에 argv 조립 추가 안 함, 역치환 함수 재작성 안 함, `encodeCwd` 에 fs 접근 안 넣음 등)

---

## [main] A-2(§3 터미널 PTY + §4 CLAUDE_START_TASK) + env 병합 4곳(§2-3) — terminal-p2 M-A/M-B 와 통합 라운드

**스코프**: 오케스트레이터 브리핑이 이 트랙의 A-2(§3/§4) + §2-3(env 병합 4곳)을
`feature/terminal/v2-terminal-p2/` 의 M-A(영속화 main) + M-B(링크 resolve-path) 와 같은 라운드로
명시 병합했다. `TerminalManager.ts` 는 M-B(getPid) 와 A-2(spawn/env 재작성)가 같은 파일을 만지므로
여기 한 곳에서 함께 다뤘다 — M-A/M-B 고유분(snapshotStore/quitFlush/pathResolver/ptyCwd)은
`feature/terminal/v2-terminal-p2/impl-log.md` 의 `## [main-process-engineer] M-A+M-B` 섹션 참조.
§1/§5/§6(A-1/A-3/MCP)·§6-3(GitService)·§7(renderer)은 이 라운드 스코프 밖(이전/다른 라운드 소유).

### 변경한 파일

- `src/main/terminal/windowsShell.ts` (신규) — `detectWindowsShell({ env, probe })`(ADR-03 §1),
  `defaultShellProbe`(statSync 기반), pwsh(WindowsApps alias 경로 포함) → powershell → COMSPEC →
  bare `cmd.exe` 순 후보 배열 + kind 별 args 동봉
- `src/main/terminal/windowsShell.test.ts` (신규, 5 tests)
- `src/main/terminal/TerminalManager.ts` (수정) — `enrichedTerminalPath()` 삭제 → `buildPtyEnv()`(모듈
  함수, `mergePathIntoEnv`/`claudeExtraPaths` 사용 + win32 전용 `PYTHONUTF8`/`TERM_PROGRAM`/
  `FORCE_HYPERLINK` 세트). `create()` 를 command 지정/win32 기본/darwin·linux 기본 3분기로 재작성,
  win32 분기는 신설 private `spawnWindowsShell()` 이 `detectWindowsShell` 후보를 순회하며 ConPTY DLL
  래치(`conptyDllDisabled` 모듈 전역 + `__resetConptyDllLatchForTest()`) 폴백을 수행. `meta.name` 계산을
  `options.name ?? (options.command ? options.command : 'Terminal')` 로 교체(ADR-04 §3)
- `src/main/terminal/TerminalManager.test.ts` (수정) — node-pty mock 이 spawn 호출 인자(`file`/`args`/
  `options`)를 캡처하고 실패 큐(`spawnFailureQueue`)를 주입할 수 있도록 확장, `./windowsShell` 모듈
  전체를 mock(`detectWindowsShellMock`)해 실제 파일시스템(mac)과 무관하게 win32 후보 체인을 통제.
  신규 describe 블록 9 tests(darwin 1회 spawn/폴백/ConPTY 재시도/env 분기/전 후보 실패/`options.command`
  우회/`options.name` 우선) + `getPid` 2 tests = 총 42 tests(기존 33 전부 무수정 통과)
- `src/main/terminal/startTaskSpawn.ts` (신규) — `buildStartTaskSpawn(params)`(ADR-04 §1) — darwin/linux
  는 현행 리터럴과 동일, win32 는 `quoteWinShellArg` 로 인용한 `type <promptFile> | <bin> -p --model
  <model>` verbatim 커맨드라인 조립. `promptFilePath` 없이 win32 호출 시 명시적 에러
- `src/main/terminal/startTaskSpawn.test.ts` (신규, 9 tests)
- `src/main/claude/ClaudeChatService.ts` (수정) — `enrichedClaudeEnv()` 본문을
  `mergePathIntoEnv(process.env, claudeExtraPaths(), { position: 'append' })` 로 교체. 더 이상
  안 쓰는 `homedir`/`join`/`delimiter` import 제거
- `src/main/ai/AIService.ts` (수정) — `enrichedEnv()` 의 PATH 조립을 `mergePathIntoEnv(...,
  { position: 'prepend' })` 로 교체(4곳 중 유일한 prepend 예외, 근거 주석 그 자리에 유지).
  `DISABLE_OMC`/`ANTHROPIC_API_KEY` 로직은 무변경. 미사용 `delimiter as pathDelimiter` import 제거
  (`join`/`homedir` 는 다른 곳에서 계속 쓰여 유지)
- `src/main/index.ts` (수정, 4블록) — ①Terminal 핸들러 블록: `TERMINAL_SAVE_STATE`/
  `TERMINAL_RESTORE_STATE`/`TERMINAL_RESOLVE_PATH` 핸들러 + rename 즉시저장 제거(terminal-p2 M-A 몫,
  같은 파일이라 같이 기록) ②라이프사이클 블록: 30초 interval 삭제, before-quit → quitFlush 위임
  ③`CLAUDE_START_TASK` 핸들러: `buildStartTaskSpawn()` 결과로 스폰 + win32 임시 프롬프트 파일
  쓰기/정리(exit 리스너 + 5분 타이머), `require('os').homedir()` 제거 → 상단 `import { homedir } from
  'os'` ④CLI Info `richEnv` 계산을 `mergePathIntoEnv`/`claudeExtraPaths` 로 교체(env 병합 4곳 중 1곳)
- `src/shared/types/terminal.ts` (수정) — `TerminalCreateOptions.args?: string[] | string`(win32
  verbatim 전용 주석), `.name?: string` 추가 (`TerminalSaveStateResult` 등 M-A 분은 terminal-p2 impl-log 참조)
- `feature/windows-compat/v2-windows-fix/plan.md` (수정) — §2-3/§3-1/§3-2/§3-3/§4-1/§4-2/§4-3 체크박스 갱신 + §8 후속 검증 노트 추가

### 결정 사항 (해야 할 것)

- **`detectWindowsShell` 의 pwsh 후보에 `%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe` 를 추가**했다
  (ADR-03 본문의 후보 목록에는 명시가 없었지만, 컨텍스트 섹션이 설명하는 "함정 #11" 실제 시나리오가
  정확히 이 경로다 — Store 설치 pwsh 의 0바이트 alias 스텁). `powershell.exe`(inbox) 쪽은 WindowsApps
  경유가 흔하지 않아(System32 기본 탑재) 추가하지 않았다.
- **`spawnWindowsShell` 의 `conptyDllDisabled` 래치는 모듈 전역**(클래스 인스턴스가 아님) — ADR-03 §2
  가 "모듈 전역 래치" 라고 명시했고, 실제 DLL 로드 성패는 프로세스 전체에 걸친 사실이라 인스턴스 단위로
  들고 있을 이유가 없다. 테스트 격리를 위해 `__resetConptyDllLatchForTest()` 를 export.
- **`buildPtyEnv(isWindows)` 를 `TerminalManager.ts` 모듈 함수로 유지**(클래스 메서드로 옮기지 않음) —
  `create()` 호출마다 순수하게 env 객체 하나를 조립하는 로직이라 인스턴스 상태에 의존하지 않는다.
- **win32 CLAUDE_START_TASK 임시파일 삭제를 `terminalManager.addExitListener` 로 구현**하며, exit
  콜백과 5분 안전망 타이머 양쪽에서 동일한 `cleanup()` 클로저(`cleaned` 플래그로 중복 삭제 방지)를
  호출하도록 했다 — 어느 쪽이 먼저 발화하든 파일 삭제는 정확히 1회.
- **`TerminalCreateOptions.args`(string|string[]) 를 `TerminalManager.create()` 가 그대로
  `pty.spawn()` 에 전달**한다(문자열 분해 없음) — node-pty 자체가 win32 에서 `string` 이면 verbatim
  커맨드라인으로 취급하는 것에 위임.

### 제약 (하지 말 것) — 실제로 지킨 것

- **`AIService.runClaudeStream` 의 argv 조립(Windows `--append-system-prompt` → stdin combine 포함)
  에 손대지 않았다.** `git diff` 로 해당 블록 변경 0줄 확인.
- **mac 경로를 "일관성" 이유로 바꾸지 않았다** — `TerminalManager.create()` 의 darwin/linux 분기
  (`$SHELL -l`, `LANG`/`LC_ALL`/`LC_CTYPE`), `buildStartTaskSpawn` 의 darwin 반환값 모두 리터럴
  회귀 테스트로 기존과 동일함을 고정했다.
- **`claudeSpawnCommand()` 에 argv 조립을 추가하지 않았다.**
- **셸 rc 주입을 하지 않았다** — `detectWindowsShell` 의 PowerShell args 는 `-Command` 로 세션 한정
  적용, 프로필 파일을 건드리지 않는다.
- **IPC 채널을 새로 만들지 않았다** — `TERMINAL_SAVE_STATE`/`TERMINAL_RESTORE_STATE`/
  `TERMINAL_RESOLVE_PATH` 는 이전(S-0) 라운드에서 이미 shared/types 에 있었다.
- **`GitService.ts` 를 손대지 않았다** — §6-3 은 여전히 다른 트랙 소유.
- **`src/renderer/**` 를 손대지 않았다** — §7(renderer) 은 이 라운드 스코프 밖.

### 플랫폼 분기 감사 (이번 라운드가 만지거나 새로 둔 `process.platform` 지점)

| 파일 | 지점 | darwin 테스트 | win32 테스트 | 비고 |
|---|---|---|---|---|
| `windowsShell.ts` | `detectWindowsShell` 후보 체인 | — (win32 전용 함수) | `windowsShell.test.ts` 5케이스 | `probe` 주입으로 mac CI 에서 win32 검증 |
| `TerminalManager.ts` | `create()` 3분기(command 지정/win32/darwin·linux) | 기존 33 tests + darwin 1회 spawn 신규 | 신규 5 tests(폴백/ConPTY 재시도/env/전 후보 실패/command 우회) | `./windowsShell` mock 으로 실제 fs 무관 |
| `startTaskSpawn.ts` | `buildStartTaskSpawn` platform 분기 | darwin/linux 리터럴 회귀 2케이스 | win32 커맨드라인 전문 6케이스 | 순수 함수, fs 미접근 |
| `ptyCwd.ts`(terminal-p2 M-B, 같은 라운드) | `probePtyCwd` platform 분기 | darwin(lsof) | win32(null) + linux(readlink) | terminal-p2 impl-log 에도 기록 |
| `ClaudeChatService.ts`/`AIService.ts` `enrichedEnv`류 | 인라인 `isWindows` 분기 자체가 사라짐(`mergePathIntoEnv` 내부로 이관) | 기존 테스트 무수정 통과 | 〃 | 호출부에는 더 이상 `process.platform` 분기가 없음 |

### 미실행 (후속 라운드/다른 트랙 인계)

- §6-3 GitService `samePath` 교체 — 다른 트랙 소유, 미착수.
- §7(renderer) — 스킬 파일명 미리 정제(`SkillsManager.tsx`)/MCP 힌트(`MCPForm.tsx`) — renderer 파일이라 미착수.
- §3-3 `asarUnpack` 정적 확인은 파일시스템 레벨로 완료했지만, 실제 Windows 패키징 산출물에서 conpty.dll
  이 로드되는지는 Windows 실기가 필요 — qa-report.md 인계.
- Windows VM 스모크 전체(plan.md §11) — 미실행, 산출물로만 존재.

### 참조

- ADR-v2-windows-fix-03 (`adr-03-windows-pty-spawn.md`) — detectWindowsShell/ConPTY DLL 래치/windowsPty 게이트
- ADR-v2-windows-fix-04 (`adr-04-start-task-prompt-pipe.md`) — buildStartTaskSpawn/TerminalCreateOptions 확장
- ADR-v2-utils-03 (`../v2-utils/adr-03-env-path-merge.md`) — mergePathIntoEnv/claudeExtraPaths 단일 정의
- `feature/terminal/v2-terminal-p2/impl-log.md` `## [main-process-engineer] M-A+M-B` — 같은 라운드에
  함께 수행한 terminal-p2 트랙 작업 기록(snapshotStore/quitFlush/pathResolver 상세)
