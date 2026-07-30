---
task: v2-windows-fix
domain: windows-compat
created: 2026-07-30
status: draft
---

# 구현 계획 — v2.0 Phase 2 / A-1~A-4 Windows 호환 수복

> 전제 문서: `prd.md`, `adr.md`(ADR-01 세션), `adr-02-claude-exec-contract.md`, `adr-03-windows-pty-spawn.md`, `adr-04-start-task-prompt-pipe.md`, `adr-05-skill-filename-boundary.md`, `adr-06-mcp-stdio-normalize.md`
> 선행 트랙: `feature/windows-compat/v2-utils/` — **`impl-log.md` §제약 을 먼저 읽을 것** (이 트랙에 넘긴 금지사항 5건)
> 브랜치: `feat/version-2.0` (Phase 1 커밋 `791275d`~`ca0a23b` 반영됨)
> **스코프 경계**: Phase 1 유틸의 소비처 교체 + 그 과정에서 드러난 Windows 결함 수리. B(터미널 강화)·C(워크스페이스)·D(단축키) 트랙 파일을 목적 외로 만지지 않는다.

---

## 파트 분리

| 파트 | 담당 | 범위 | 선행 의존 |
|---|---|---|---|
| **main** | main-process-engineer | §1 ~ §6 (+ §3-4 shared/preload) | 없음 |
| **renderer** | renderer-engineer | §7 (3파일 소형) | §3-4(`shared/utils/windowsPty.ts` + preload `api.system`)가 먼저 머지돼야 §7-1 착수 가능 |

> main 파트는 §3-4 를 **가능한 먼저** 끝내고 푸시해 renderer 파트의 대기를 줄인다. §7-2/§7-3 은 main 의존이 없으므로 즉시 병렬 가능.

---

## 0. 착수 전 확인

- [ ] `git branch --show-current` 가 `feat/version-2.0` 인지 확인
- [ ] `npx vitest run` 이 **착수 전에** 통과하는지 확인하고 파일/테스트 수를 기록 (기준선 — 실패가 내 변경 탓인지 구분 가능하게)
- [ ] `npx vitest run --coverage` 로 착수 전 커버리지 3수치 기록 (게이트 lines 70 / statements 70 / functions 80)
- [ ] `feature/windows-compat/v2-utils/impl-log.md` §제약 5건을 읽고 위반하지 않을 것을 확인 (특히 "claudeSpawnCommand 에 argv 조립 추가 금지", "역치환 함수 재작성 금지", "encodeCwd 에 fs 접근 금지")
- [ ] `CLAUDE.md` 의 "AIService.runClaudeStream — Windows / macOS 분기 가이드" 재독. 함정 1·3 을 이번 트랙 내내 의식할 것

---

## 1. A-1 세션 [main]

### 1-1. `formatProjectLabel` 신설 — `src/main/utils/claudeProjects.ts`

- [x] `formatProjectLabel({ cwd, encodedDirName }, opts?: { home?, platform? }): string` 추가 (ADR-01 §3)
- [x] `cwd` 있고 홈 하위 → `~/…` 축약. `normalizePathForCompare` 로 비교하고 **표시 문자열은 원본 cwd 기반**으로 만든다 (비교용 소문자화가 표시에 새어나가지 않게)
- [x] `cwd` 있고 홈 밖 → 절대경로 그대로
- [x] `cwd` 없음 → `encodedDirName` 그대로 (**추측 경로 생성 금지**)
- [x] 한국어 1~2줄 문서 주석 + 근거 ADR 참조

테스트 (`claudeProjects.test.ts` 에 append):
- [x] darwin: `/Users/nhn/Desktop/x` + home `/Users/nhn` → `~/Desktop/x`
- [x] darwin: `/opt/work` (홈 밖) → `/opt/work`
- [x] win32: `C:\Users\me\proj` + home `C:\Users\Me` (대소문자 다름) → `~/proj` 로 축약되는지
- [x] cwd 미지정 → 인코딩 문자열 그대로. **`/` 가 하나도 안 섞여 나오는지** 단언 (역치환 재발 방지)

### 1-2. `ClaudeSessionService` 교체 — `src/main/claude/ClaudeSessionService.ts`

- [x] 모듈 상단 `PROJECTS_DIR` 상수(`:6`) 제거 → 생성자 옵션 기반 필드로
- [x] `constructor(opts?: { configDir?: string })` — `claudeProjectsRoot({ configDir })` 로 루트 계산, `configDir` 는 `findProjectDir` 전달용으로 보관 (ADR-01 §2)
- [x] `private encodeCwd`(`:68-71`), `private projectDir`(`:106-108`) **삭제**
- [x] `listSessions(cwd?)`(`:114`) — `cwd` 있으면 `await findProjectDir(cwd, { configDir })`, `undefined` 면 빈 배열 반환 후 종료. `cwd` 없으면 현행대로 루트 readdir
- [x] `loadSession(sessionId, cwd)`(`:157`) — 동일하게 `findProjectDir` 사용, 못 찾으면 `[]`
- [x] 클래스 상단 JSDoc 의 `'/Users/nhn/Desktop/foo' → '-Users-nhn-Desktop-foo' (slash → dash)` 설명(`:55`)을 실규칙 참조로 교체 (틀린 설명을 남기지 않는다)
- [x] `index.ts:174` 의 `new ClaudeSessionService()` 호출 확인 (인자 없음 그대로 동작해야 함)

테스트 (`ClaudeSessionService.test.ts`):
- [x] **복제 `encodeCwd`(`:17-19`) 삭제** → `import { encodeCwd } from '../utils/claudeProjects'`
- [x] **private 메서드 monkeypatch(`:33`) 삭제** → `new ClaudeSessionService({ configDir: tmpHome/.claude })`
- [x] 기존 테스트 전부 통과하는지 확인 (통과 못 하면 그 자체가 이번 수정이 필요했다는 증거 — 기대값을 실규칙으로 갱신)
- [x] **win32 스타일 cwd 회귀 테스트 신설**: `C:\Users\me\proj` 로 저장된 세션을 `listSessions('C:\\Users\\me\\proj')` 가 찾아내는지 (디렉터리명은 `C--Users-me-proj`)
- [x] cwd 에 `.`·공백·한글이 포함된 케이스 1건 (mac 잠재 버그 회귀 방지)
- [x] `findProjectDir` 가 못 찾는 cwd → 빈 배열, throw 없음

### 1-3. `index.ts` 인라인 세션 리더 — `CLAUDE_SESSIONS_LIST`

- [x] `parseFirstMessage`(`:1200-1238`) 반환 타입에 `cwd?: string` 추가. 루프 안에서 `d.cwd` 가 string 이면 최초 1회 저장 (**추가 I/O 0** — 같은 스트림)
- [x] 조기 종료 조건(`:1233` `firstMsg && lines >= 50`)이 cwd 수집을 방해하지 않는지 확인. 필요하면 `firstMsg && cwd` 로 보강하되 상한(50줄)은 유지
- [x] **`:1254-1258` 역치환 블록 삭제** (`rawPath`/`homeNorm`/`project` 3줄 전부)
- [x] `project` 를 파일 단위로 `formatProjectLabel({ cwd: parsed.cwd, encodedDirName: projDir })` 로 계산 (ADR-01 §5)
- [x] 캐시 히트 경로(`:1267-1271`)는 손대지 않는다 — `meta.project` 재사용 (ADR-01 §4)
- [x] `require('os')` 인라인 호출 제거 (상단 import 로 이미 있음)

테스트:
- [x] `formatProjectLabel` 단위 테스트로 커버 (index.ts 자체는 커버리지 제외 대상). `index.test.ts` 는 채널 카탈로그만 보므로 변경 불필요한지 확인

---

## 2. A-1 실행 계약 [main]

> **불변식 (ADR-02 §1)**: `AIService.runClaudeStream` 의 argv 조립(`:396-447`)에 손대지 않는다. mac spawn 결과 동일. `AIService.test.ts` **무수정** 통과.

### 2-1. spawn/exec 5곳 → `claudeSpawnCommand`

- [x] `ClaudeChatService.ts:177-184` — `claudeSpawnCommand({ bin: this.claudeBin })` 로 `command`/`shell`/`windowsVerbatimArguments` 획득. 인라인 `isWindows` 판정 제거
- [x] `AIService.ts:451-455` — 동일 (`bin: CLAUDE_CLI`). **`cleaned` argv 는 그대로 전달**
- [x] `AIService.ts:107` `captureClaudeVersion` — `command` + `shell` 사용 (인용된 bin)
- [x] `AIService.ts:673` `isAvailable` — 동일
- [x] `index.ts:1414` CLI Info — `execFile('claude', ...)` → `execFile(command, args, { shell, timeout, env, encoding: 'buffer' })`. `getClaudeBin()` 은 `./ai/AIService` 에서 이미 export 중
- [x] 5곳 교체 후 `grep -rn "shell: isWindows\|shell: process.platform === 'win32'" src/main` 결과가 0 인지 확인

### 2-2. dead `runClaude` 삭제

- [x] `AIService.ts:344-384` `private runClaude` 삭제 (ADR-02 §3)
- [x] 그로 인해 미사용이 된 `execFile` import 정리. `execFileSync` 는 남는다
- [x] `ClaudeCliResult` 타입은 유지 (`runClaudeStream` 이 사용)
- [x] `grep -rn "runClaude(" src` 로 잔여 참조 0 확인

### 2-3. PATH 보강 4곳 → `mergePathIntoEnv` + `claudeExtraPaths`

> **[main/M-A+M-B+A-2 통합 라운드] 완료** — 후속 오케스트레이터 브리핑이 "env 병합 4곳" 을 이 라운드(터미널 v2-terminal-p2 M-A/M-B 와 병합)로 명시했다. `ClaudeChatService.enrichedClaudeEnv`/`AIService.enrichedEnv`/`index.ts richEnv`/`TerminalManager.enrichedTerminalPath` 4곳 전부 교체 완료.

- [x] `ClaudeChatService.ts` `enrichedClaudeEnv` 본문 교체 (append 기본값). 함수 상단의 append 근거 주석은 **유지**
- [x] `AIService.ts` `enrichedEnv` — `{ position: 'prepend' }` **명시** + "절대경로 spawn 이라 PATH 가 바이너리 선택에 관여하지 않음" 근거 주석 (ADR-02 §4). `DISABLE_OMC`/`ANTHROPIC_API_KEY` 는 그대로
- [x] 반환 타입 `Record<string,string>` 과 `NodeJS.ProcessEnv` 의 차이 처리 (undefined 값 제거 또는 시그니처 조정 — 캐스트로 뭉개지 말 것) — `mergePathIntoEnv` 결과를 `Record<string,string>` 으로 캐스트하는 지점 1곳(AIService)만 필요, 기존 캐스트 패턴 그대로 재사용
- [x] `index.ts` CLI Info `richEnv` 교체 (append) + `DISABLE_OMC` 유지
- [x] `TerminalManager.ts` `enrichedTerminalPath` 는 §3-2 에서 함께 처리 (`buildPtyEnv` 로 대체)
- [x] 교체 후 `grep -rn "AppData', 'Roaming', 'npm'" src/main` 이 `env.ts`/`claudeBin.ts` 외에 안 나오는지 확인 (목록 복제 소멸) — 확인 완료, impl-log 참조

### 2-4. stdout `StringDecoder` 2곳

- [x] `ClaudeChatService.ts:197-211` — 세션마다 `new StringDecoder('utf8')` 생성(`ChatSession` 필드로 보관), `decoder.write(data)` 사용
- [x] `AIService.ts:502-506` — `runClaudeStream` 호출마다 로컬 디코더 생성
- [x] 두 곳 모두 `close`/`end` 에서 `decoder.end()` 잔여 처리. 잔여 길이 > 0 이면 `warn` (사용자 CLAUDE.md §4)
- [x] `rawStdout` 누적(`:505`)과 `diag.appendStdout`(`:504`)도 디코드된 chunk 를 쓰는지 확인
- [x] stderr 경로(`decodeProcessText`)는 **건드리지 않는다** (ADR-02 §5)

테스트:
- [x] 한글 문자열의 UTF-8 바이트를 **경계에서 쪼갠 2개 Buffer** 로 stdout 에 흘려보내고 `�` 없이 합쳐지는지 (`ClaudeChatService.test.ts` 에 추가)
- [x] 같은 취지의 테스트를 `AIService.test.ts` 에 **추가만** 하고 기존 65개는 수정하지 않는다
- [x] `claudeSpawnCommand` 결과가 spawn 에 전달되는지 darwin/win32 양쪽 (`Object.defineProperty(process,'platform',...)` — `AIService.test.ts` 선례)
- [x] `git diff src/main/ai/AIService.ts` 에서 `:396-447` 영역 변경 0 줄임을 눈으로 확인하고 impl-log 에 기록

---

## 3. A-2 터미널 PTY [main]

### 3-1. `detectWindowsShell` 신설 — `src/main/terminal/windowsShell.ts`

- [x] `WindowsShellKind` / `ShellProbe` / `WindowsShellCandidate` 타입 (ADR-03 §1)
- [x] `detectWindowsShell({ env, probe })` — pwsh → powershell → COMSPEC → bare `cmd.exe` 순 후보 배열
- [x] 후보 경로: `%ProgramFiles%\PowerShell\7\pwsh.exe`, `%ProgramW6432%`/`%ProgramFiles(x86)%` 변형(+ `%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe` — 함정 #11 실측 시나리오), `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`, `%COMSPEC%`, `%SystemRoot%\System32\cmd.exe`
- [x] **절대경로 후보는 `probe(p)?.isFile && size > 0` 통과 필수** (WindowsApps 0바이트 alias 배제). 마지막 bare `cmd.exe` 는 probe 없이 항상 포함
- [x] args 를 후보에 동봉 — PowerShell 계열 `-NoLogo -NoExit -Command '[Console]::OutputEncoding=...'`, cmd 계열 `/K chcp 65001>nul`
- [x] `defaultShellProbe` (실제 `statSync` 기반) 를 같은 모듈에서 export — TerminalManager 가 주입

테스트 `src/main/terminal/windowsShell.test.ts`:
- [x] pwsh 실존 → 1순위
- [x] `WindowsApps\pwsh.exe` 만 존재하고 size 0 → **후보에서 제외**되고 powershell 로 내려감
- [x] pwsh/powershell 부재 → COMSPEC → 그것도 없으면 bare `cmd.exe`
- [x] 후보마다 args 가 kind 에 맞는지 (cmd 후보에 `-NoLogo` 가 붙지 않는지 명시 단언)
- [x] probe 가 예외를 던져도 (권한 오류) 다음 후보로 넘어가는지

### 3-2. `TerminalManager.create` 교체 — `src/main/terminal/TerminalManager.ts`

- [x] `enrichedTerminalPath()` 삭제 → env 조립부(`buildPtyEnv`)에서 `mergePathIntoEnv(baseEnv, claudeExtraPaths())`
- [x] win32 env 세트 추가: `PYTHONUTF8=1`, `TERM_PROGRAM='Clauday'`, `FORCE_HYPERLINK='1'` (ADR-03 §3). **darwin/linux 의 LANG/LC_ALL/LC_CTYPE 3종은 한 글자도 바꾸지 않는다**
- [x] `options.command` 미지정 + win32 → `detectWindowsShell` 후보 체인. 지정 시 현행대로 그 커맨드 사용
- [x] 폴백 루프 + ConPTY DLL 래치 (ADR-03 §2): 후보당 최대 2회, `looksLikeConptyDllError` 판정 시 모듈 전역 래치, 실패마다 `warn` (후보 경로 + 오류), 전부 실패 시 마지막 오류 throw
- [x] win32 spawn 옵션에 `useConptyDll: !conptyDllDisabled`
- [x] 스폰 성패와 무관하게 **darwin 경로의 spawn 인자/옵션은 현행과 동일** (`-l` 로그인 셸 포함)
- [x] 스폰 로직을 `create()` 밖 private 메서드(`spawnWindowsShell`)로 빼서 테스트 가능하게 (node-pty 는 vi.mock)

테스트 (`src/main/terminal/TerminalManager.test.ts` 에 append — 기존 파일 있음):
- [x] darwin: `pty.spawn` 이 `$SHELL -l` 로 1회만 호출되고 env 에 `LANG` 이 있으며 `PYTHONUTF8` 이 **없는지**
- [x] win32: 1순위 후보 spawn 실패 → 2순위로 폴백하고 args 가 후보의 것으로 바뀌는지
- [x] win32: 첫 시도 ConPTY DLL 오류 → 같은 후보 `useConptyDll:false` 재시도 → 성공. 이후 호출은 재시도 없이 바로 false
- [x] win32 env 에 `PYTHONUTF8`/`TERM_PROGRAM`/`FORCE_HYPERLINK` 존재, `LANG` **부재** — 이 개발 머신 자체에 `LANG` 이 이미 설정돼 있어 테스트 안에서 `process.env.LANG` 을 save/delete/restore 해 순수하게 검증(impl-log 참조)
- [x] 전 후보 실패 시 throw + 실패 횟수만큼 warn

### 3-3. Windows 빌드 사전 확인 (실기 전 체크)

- [x] `node_modules/node-pty/package.json` 의 버전이 `useConptyDll` 을 지원하는지 재확인 (1.1.0 — typings 에 `useConptyDll` 존재 확인)
- [x] `package.json` 의 `asarUnpack`/`files` 가 node-pty 의 ConPTY DLL 경로를 포함하는지 확인 — `asarUnpack: ["node_modules/node-pty/**/*", ...]` 로 node-pty 패키지 전체가 통째로 unpack 대상이라 `prebuilds/win32-{x64,arm64}/conpty/conpty.dll`, `third_party/conpty/.../conpty.dll` 모두 포함됨을 파일시스템에서 직접 확인. 실행 시 실제 로드 성공 여부는 Windows 실기 필요(qa-report 인계)

### 3-4. `windowsPtyOptions` + preload 노출 [main, renderer 선행]

> **실제 담당 편차**: 이 §는 원래 main-process-engineer 몫으로 표시돼 있으나, 상위 브리핑(터미널
> v2-terminal-p2 라운드)에서 main-process-engineer 2명이 세션/스킬/MCP · workspace/GitService 트랙에
> 묶여 있어 renderer-engineer 가 §3-4 + §7-1 을 함께 수행했다(2026-07-30). preload 변경은 이
> `api.system` 정적 값 1건으로 국한했다 — impl-log 참조.

- [x] `src/shared/utils/windowsPty.ts` 신설 — `windowsPtyOptions(platform, osRelease)` (ADR-03 §4). xterm 타입에 의존하지 않는 순수 반환값
- [x] `src/preload/index.ts` — `api.system = { platform: process.platform, osRelease: release() }` 정적 값 추가 (**IPC 채널 신설 없음**)
- [x] `test/helpers/mockWindowApi.ts` 에 `system` 기본값 추가 (`{ platform: 'darwin', osRelease: '23.0.0' }`)

테스트 `src/shared/utils/windowsPty.test.ts`:
- [x] `('win32', '10.0.22621')` → `{ backend: 'conpty', buildNumber: 22621 }`
- [x] `('win32', '10.0.19044')` → `undefined` (게이트 미통과 — 현행 동작 보존)
- [x] `('win32', undefined)` / 파싱 불가 문자열 → `undefined`
- [x] `('darwin', '23.0.0')` → `undefined`
- [x] 경계값 `21376` 정확히 → 지정됨 / `21375` → `undefined`

---

## 4. A-2 CLAUDE_START_TASK [main]

### 4-1. `buildStartTaskSpawn` 신설 — `src/main/terminal/startTaskSpawn.ts`

- [x] `StartTaskSpawn` 타입 + `buildStartTaskSpawn(params)` (ADR-04 §1)
- [x] darwin/linux 분기: `{ command: 'claude', args: ['-p', prompt, '--model', model], displayName: 'claude' }` — **현행과 동일**
- [x] win32 분기: `command = comspec(cmd 계열 아니면 'cmd.exe')`, `args` 는 verbatim 문자열
      `/d /s /c "chcp 65001>nul && type "<promptFile>" | "<bin>" -p --model <model>"`
- [x] 인용은 `quoteWinShellArg` 사용 (멱등). 프롬프트 본문은 커맨드라인에 **절대 넣지 않는다**
- [x] `promptFile` 미지정인데 win32 면 명확한 에러 (조용히 mac 경로로 떨어지지 않게)

### 4-2. shared 타입 확장 — `src/shared/types/terminal.ts`

- [x] `TerminalCreateOptions.args?: string[] | string` (문자열은 **win32 verbatim 전용**임을 주석에 명시, ADR-04 §2)
- [x] `TerminalCreateOptions.name?: string` 추가 (ADR-04 §3)
- [x] `TerminalManager.create` — `meta.name = options.name ?? (options.command ? options.command : 'Terminal')`. args 는 node-pty 에 **그대로** 전달 (문자열 분해 금지)

### 4-3. `index.ts` CLAUDE_START_TASK 핸들러

- [x] 프롬프트 조립부는 그대로 유지 (문구 변경 없음)
- [x] win32 면 `app.getPath('temp')` 아래 `clauday-start-task-<uuid>.txt` 에 **BOM 없는 UTF-8** 로 프롬프트 기록
- [x] `buildStartTaskSpawn` 결과로 `terminalManager.create({ command, args, name: displayName, cwd: homedir() })`
- [x] 임시파일 정리: `terminalManager.addExitListener` 로 해당 세션 exit 시 삭제 + 5분 타이머 안전망. 삭제 실패는 `warn`
- [x] 프롬프트 본문을 로그에 남기지 않는지 확인
- [x] `require('os').homedir()` 인라인 제거 → 상단 import 사용

테스트 `src/main/terminal/startTaskSpawn.test.ts`:
- [x] darwin 반환값이 현행 리터럴과 **정확히** 일치 (회귀 잠금)
- [x] win32 커맨드라인 문자열 전문 단언 — `chcp 65001`, `type "…"`, 파이프, 인용된 bin, `-p`(값 없음), `--model sonnet` 순서
- [x] 공백 포함 bin 경로(`C:\Program Files\...`)가 인용되는지
- [x] 공백 포함 promptFile 경로가 인용되는지
- [x] 개행 포함 프롬프트가 커맨드라인에 **등장하지 않는지** (문자열에 `\n` 없음 단언)
- [x] COMSPEC 이 cmd 계열이 아닌 값일 때 `cmd.exe` 로 폴백

---

## 5. A-3 스킬 / ConfigWatcher [main]

### 5-1. `SkillsManager`(main) — `src/main/config/SkillsManager.ts`

- [x] `private resolveSkillDir(filename)` 신설 — `resolve` 후 skillsDir 하위 여부 검증, 루트 자체/이탈은 throw (ADR-05 §2)
- [x] `save`(`:58`) — `sanitizeSkillFilename(req.filename)` 적용 **후** `resolveSkillDir` 통과. 정제 결과가 원본과 다르면 `warn` 로그(식별자 포함)
- [x] `read`(`:53`) / `delete`(`:67`) — 이름 **변형 없이** `resolveSkillDir` 만 (레거시 비정규 이름 호환)
- [x] `delete` 의미론 교체 (ADR-05 §3): `lstat` → 심볼릭 링크면 `unlink`, 디렉터리면 `rm(recursive, force)`, 없으면 no-op
- [x] `deleteMany`(`:75`) — 반환 `{ deleted, failed }` 로 확장 + 실패마다 `warn`
- [x] `exportToFolder`(`:107`) — 내보낼 파일명에 `sanitizeSkillFilename` 적용
- [x] `importFromFiles`(`:84`) 는 `save` 경유라 자동 적용 — 별도 수정 불필요함을 확인

### 5-2. preload / 타입 동반 수정

- [x] `skills.deleteMany` 반환 타입 변경을 `src/preload/index.ts:160` 에 반영. 반환 타입이 preload 에 인라인으로 박혀 있으므로 `src/shared/types/skills.ts` 에 `SkillDeleteManyResult` 를 신설해 preload·main 이 함께 import 하도록 정리
- [x] `test/helpers/mockWindowApi.ts` 의 `deleteMany` 기본값 `{ deleted: 0, failed: 0 }`

### 5-3. `ConfigWatcher` — `src/main/config/ConfigWatcher.ts`

- [x] `start()` 에서 `~/.claude/skills`, `~/.claude/commands` 를 `mkdirSync(recursive)` 선생성. 실패는 `warn` 후 계속 (ADR-05 §4)
- [x] `settings.json` 은 **선생성하지 않는다**
- [x] `this.watcher.on('error', ...)` 구독 + `warn` 로그

테스트 (`src/main/config/SkillsManager.test.ts`, `src/main/config/ConfigWatcher.test.ts` 에 append — 둘 다 기존 파일 있음):
- [x] `save` 가 `Q&A: 정리` → 정제된 디렉터리명으로 저장하는지 (darwin/win32 양쪽 — 정제 규칙은 플랫폼 무관하게 Windows 기준 적용)
- [x] `save`/`read`/`delete` 에 `../../evil` 을 넣으면 throw 하고 skillsDir 밖에 아무것도 안 생기는지 (`save` 는 sanitize 가 먼저 무력화해 throw 하지 않고 안전한 이름으로 저장됨 — ADR-05 §2 그대로, impl-log 에 편차 기록)
- [x] `read`/`delete` 가 **정제 전 이름** 그대로 만든 디렉터리에 접근 가능한지 (레거시 호환 회귀 테스트)
- [x] `delete` 후 디렉터리가 남지 않는지 (실제 tmp 파일시스템)
- [x] `delete` 가 심볼릭 링크면 링크만 지우고 **대상 디렉터리는 보존**하는지 (실제 symlink)
- [x] `deleteMany` 부분 실패 시 `{ deleted, failed }` 집계
- [x] `ConfigWatcher.start` 가 없는 디렉터리를 만들고 나서 watch 하는지 (chokidar mock)

---

## 6. A-4 MCP / Git / 기타 [main]

### 6-1. `normalizeStdioCommandForWindows` — `src/main/config/mcpNormalize.ts`

- [x] 함수 신설 (ADR-06 §1). 대상: `npx`/`uvx`/`npm`/`pnpm`/`yarn`/`bunx` + `.cmd`/`.bat` 접미
- [x] 멱등: `cmd`/`cmd.exe` + `args[0] === '/c'|'/C'` 이면 그대로
- [x] `getMcpTransport(config) !== 'stdio'` 면 무변환. darwin 무변환
- [x] `McpConfigManager.add`(`:63`) / `update`(`:81`) 진입점에서 적용

### 6-2. `McpConfigManager.writeRaw` 원자적 쓰기

- [x] `writeRaw`(`:44-47`) → `writeJsonAtomic(this.configPath, data)` (Phase 1 유틸)
- [x] `ensureDir`(`:30-33`) 는 홈 디렉터리 존재 확인이라 사실상 no-op — 유지할지 제거할지 판단하고 impl-log 에 근거 기록 (→ 유지, impl-log 참조)
- [x] lost update 한계(ADR-06 §3)를 코드 주석 1줄로 남기지 말고 **ADR 참조만** (주석은 짧게)

### 6-3. `GitService` 경로 비교

> **[main/A-1/A-3/MCP] 미실행** — 오케스트레이터 브리핑이 GitService 를 다른 라운드·트랙 소유로 명시 금지했다. 후속 라운드 몫.

- [ ] `GitService.ts:150` / `:173` 의 `w.path === worktreePath` → `samePath(w.path, worktreePath)`
- [ ] 같은 파일에 다른 경로 문자열 비교가 더 있는지 `grep -n "\.path ===" src/main/git/GitService.ts` 로 확인하고 있으면 함께 교체

### 6-4. `expandHome` 3곳

- [x] `index.ts:468-470`, `:500-502`, `:521-523` → `expandHome(target)`
- [x] 각 지점의 `const { homedir } = await import('os')` 동적 import 제거
- [x] 마스터 계획이 4곳으로 센 나머지 1곳(`:1255`)은 §1-3 에서 `formatProjectLabel` 로 흡수됨을 impl-log 에 기록

테스트:
- [x] `src/main/config/mcpNormalize.test.ts` (신규) — darwin 무변환 / win32 `npx` 래핑 / 멱등(2회 적용 동일) / `node` 미래핑 / http·sse 설정 미변경 / `.cmd` 접미 래핑 / `args` 없는 입력
- [ ] `src/main/git/GitService.test.ts` 에 append — `C:/a/b` vs `C:\a\b` 매칭 회귀 (win32 platform 주입) — **미실행** (§6-3 과 함께 후속 라운드)
- [x] `src/main/config/McpConfigManager.test.ts` 에 append — add/update 후 파일 내용이 래핑된 형태인지 + 원자적 쓰기 경로를 타는지 + 토글 반복 후 이중 래핑 없음

---

## 7. renderer 파트 [renderer]

### 7-1. `TerminalPane` windowsPty (선행: §3-4)

- [x] `src/renderer/src/components/Terminal/TerminalPane.tsx:44` 의 `new Terminal({...})` 옵션에 `...(windowsPty ? { windowsPty } : {})` 조건부 추가
- [x] 값은 `windowsPtyOptions(window.api?.system?.platform ?? navigator.platform-기반-폴백, window.api?.system?.osRelease)` — **`api.system` 이 없으면 `undefined`** 로 떨어져 현행 동작 유지
- [x] Unicode11 활성화(`:87-89`)보다 **뒤에** 두지 않아도 되지만, 옵션은 생성자에 넣어 write 이전에 확정되게 한다
- [x] `TerminalPane.test.tsx` — `api.system` 이 win32/22621 일 때 Terminal 생성자 인자에 `windowsPty` 가 포함되고, darwin 이면 포함되지 않는지 (구형 21376 미만 케이스도 추가)

### 7-2. `SkillsManager.tsx` 위키 다운로드 2곳

- [ ] `:208` `handleDownloadFromWiki` — `const filename = sanitizeSkillFilename(item.name)` 후 `skills.save({ filename, content })`, 토스트도 정제된 이름으로
- [ ] `:383` `handleBulkDownloadFromWiki` — 동일
- [ ] import 는 `@shared/utils/filename`
- [ ] (P2) `:259` 편집기 저장 — 이름을 **바꾸지 말고**, 정제 결과가 다르면 입력 아래 힌트 텍스트로 예고 (ADR-05 결과 §부정 완화)
- [ ] `SkillsManager.test.tsx`(있으면) 또는 신규 — 위키 항목 이름에 `:`/`/` 가 있을 때 `skills.save` 가 정제된 filename 으로 호출되는지

### 7-3. `MCPForm` Windows 힌트

- [ ] `src/renderer/src/components/MCP/MCPForm.tsx` command 입력(`:166`) 아래에, win32 이고 command 가 래핑 대상이면 "저장 시 `cmd /c` 로 감싸집니다 (Windows 필수)" 힌트 표시
- [ ] 플랫폼 판정은 `window.api?.system?.platform`. 힌트는 표시 전용 — renderer 는 정규화하지 않는다 (ADR-06 §4)
- [ ] 디자인 시스템 컴포넌트(`components/common/ds`) 재사용, 새 스타일 만들지 않기

---

## 8. 검증

> **[main/A-1/A-3/MCP]** 아래 항목은 A-1 세션 + A-1 실행계약(2-3 PATH 제외) + A-3 스킬 + A-4 MCP 스코프 기준으로 검증했다. §3/§4(터미널)·§6-3(GitService)·§7(renderer) 는 다른 라운드 소유라 이 체크는 전체 트랙 완결을 의미하지 않는다 — impl-log 참조.

- [x] `npx vitest run` 전체 통과 (2227 tests / 143 files, 실패 0)
- [x] `npx vitest run --coverage` — 게이트(lines 70 / statements 70 / functions 80) 유지 (실측 lines 80.91/statements 80.91/functions 91.37). 이번 라운드 신규 모듈 `mcpNormalize.ts` 는 100% (`windowsShell.ts`/`startTaskSpawn.ts` 는 다른 라운드 소관이라 아직 없음)
- [x] `npx tsc --noEmit -p tsconfig.node.json` 통과
- [x] `npm run build` 통과 (main/preload/renderer 3개)
- [ ] **플랫폼 분기 이중 검증 감사**: 이번 라운드가 만지거나 남긴 `process.platform` 지점은 impl-log 표로 정리(완료). `src/main`/`src/shared` 전체 감사는 터미널(§3/§4) 모듈이 아직 없어 트랙 전체 완결 후 재실행 필요
- [ ] **죽은 코드 소멸 확인**: `claudeSpawnCommand`/`sanitizeSkillFilename`/`writeFileAtomic`/`expandHome`/`findProjectDir`/`readSessionCwd` 는 이번 라운드로 소비처 확보(impl-log 표). `mergePathIntoEnv`/`claudeExtraPaths`(PATH 병합, 다른 트랙)·`samePath`(GitService 소비 아직, 다른 트랙)는 미완
- [ ] mac 수동 스모크 — **미실행** (에이전트가 GUI 조작 불가, Definition of Done 상 사용자 수동 QA 항목으로 남김)

> **[M-A+M-B+A-2 통합 라운드, 후속]** 위 §8 은 이전(A-1/A-3/MCP) 라운드 기준이다. 이번 라운드가 §2-3(PATH 병합 4곳)·§3(A-2 터미널 PTY)·§4(A-2 CLAUDE_START_TASK)를 완료하며 추가로 검증한 내용:
> - [x] `npx vitest run` 전체 통과 (160 files / 2454 tests, 실패 0 — 이번 라운드 신규/수정분 포함)
> - [x] `npx tsc --noEmit -p tsconfig.node.json` / `-p tsconfig.web.json` 둘 다 통과
> - [x] **플랫폼 분기 이중 검증 감사** 갱신 — `windowsShell.ts`/`TerminalManager.ts`(스폰 분기)/`startTaskSpawn.ts`/`ptyCwd.ts` 4개 신규 지점 모두 darwin/win32(+ptyCwd 는 linux) 테스트 페어 확보. 표는 이번 라운드 impl-log 참조
> - [x] **죽은 코드 소멸 확인** — `mergePathIntoEnv`/`claudeExtraPaths` 가 이번 라운드로 4곳(TerminalManager/ClaudeChatService/AIService/index.ts CLI-info) 소비처 확보, 더 이상 미사용 아님. `samePath`(GitService) 는 여전히 미완 — 다른 트랙
> - [ ] Windows 실기 스모크 — **미실행** (에이전트가 Windows VM 접근 불가). plan.md §11 체크리스트가 산출물로 존재, qa-report.md 작성은 integrator 몫

---

## 9. 커밋 분리 (index.ts hunk 단위)

`src/main/index.ts` 를 4개 영역에서 만지고, B·C 트랙이 같은 파일을 병렬로 만질 수 있다. **영역별로 커밋을 쪼갠다** (`git add -p`).

- [ ] C1 `fix(session): claude 프로젝트 디렉터리 조회를 findProjectDir 로 일원화` — §1 전체 (index.ts hunk: `CLAUDE_SESSIONS_LIST` 만)
- [ ] C2 `fix(claude-cli): claude 실행 5곳 spawn 계약 통일 + PATH 병합 + stdout 디코딩` — §2 전체 (index.ts hunk: CLI Info 만)
- [ ] C3 `feat(terminal): Windows PTY 셸 감지·폴백·UTF-8 env` — §3 (§3-4 는 renderer 선행이므로 이 커밋에 포함해 먼저 푸시)
- [ ] C4 `fix(terminal): 태스크 시작 프롬프트를 Windows 에서 임시파일 파이프로 전달` — §4 (index.ts hunk: START_TASK 만)
- [ ] C5 `fix(skills): 파일명 정제 경계 + 삭제 시 디렉터리 제거 + ConfigWatcher 선생성` — §5
- [ ] C6 `fix(mcp): stdio 커맨드 Windows 정규화 + 원자적 쓰기, 경로 비교/홈 확장 유틸 교체` — §6 (index.ts hunk: `~` 확장 3곳만)
- [ ] C7 `feat(renderer): windowsPty 적용 + 스킬 파일명 미리 정제 + MCP 힌트` — §7 (renderer 파트 담당)
- [ ] 각 커밋 메시지 본문에 **무엇을 왜** (증상 → 원인 → 조치) 를 한국어로. 커밋마다 `npx vitest run` 통과 상태 유지

---

## 10. 문서

- [ ] `CHANGELOG.md` Unreleased 에 사용자 관점 항목 추가 — Windows 세션 목록 복구 / 터미널 UTF-8·PowerShell / 태스크 시작 / 스킬 파일명·삭제 / MCP npx 등록 / CLI Info
- [ ] `ClaudeManual.tsx` SECTIONS — ①Windows 터미널이 PowerShell 로 열리고 UTF-8 이라는 점 ②위키 스킬 이름이 Windows 금지문자 때문에 바뀔 수 있다는 점 ③MCP 커맨드가 저장 시 `cmd /c` 로 감싸진다는 점. 각 1~2줄, 한국어
- [ ] `impl-log.md` **append 규약** — main 파트가 `## [main] …` 섹션을, renderer 파트가 `## [renderer] …` 섹션을 각각 추가한다. **남의 섹션을 수정하지 않는다.** 각 섹션에 변경 파일 목록 / 결정 사항 / 하지 말 것 / 미실행 항목
- [ ] ADR 문면과 구현이 갈라진 곳이 있으면 **구현을 고치거나, 새 ADR 로 supersede**. ADR 파일을 수정하지 않는다

---

## 11. Windows 스모크 체크리스트 (산출물 — 실행은 Phase 4)

impl-log 말미 또는 `qa-report.md` 에 그대로 옮겨 쓸 수 있는 형태로 남긴다.

- [ ] 세션: 목록에 항목이 뜬다 / 라벨이 `C:\...` 또는 `~/...` 로 보인다 / 이어하기가 붙는다
- [ ] 실행: 브리핑 생성이 구조화 카드로 나온다(stream-json 수신) / CLI Info 패널이 채워진다 / 공백 포함 설치 경로에서도 동작
- [ ] 터미널: PowerShell 로 열린다 / 한글 입출력 정상 / claude TUI 의 `❯` 정상 / WindowsApps alias 만 있는 환경에서 폴백
- [ ] 태스크: "Claude Code 로 시작" 이 한글 제목+2000자 본문으로 동작 / 탭 이름이 `claude`
- [ ] 스킬: `Q&A: 정리` 위키 항목 내려받기 / 삭제 후 `.claude\skills` 에 잔존 없음 / 신규 사용자 변경 감지
- [ ] MCP: `npx` 서버 등록 → claude 가 인식 / 비활성↔활성 토글 후에도 이중 래핑 없음
- [ ] 워크트리: 생성 직후 "찾을 수 없음" 이 안 뜬다
- [ ] 장시간: 긴 한글 스트리밍 응답에 `?`/`�` 없음

---

## 12. 하지 말 것

- **`AIService.runClaudeStream` 의 argv 조립(`:396-447`)에 손대지 말 것.** Windows 한정 `--append-system-prompt` → stdin combine 은 v1.5.5 의 진단으로 얻은 결론이다. "이제 인용도 되니 argv 로 되돌려도 되지 않나" 는 `CLAUDE.md` 함정 1 그 자체다.
- **mac 경로를 "일관성" 을 이유로 바꾸지 말 것.** START_TASK 도, spawn 옵션도, PTY env 도 mac 은 현행 유지가 결정이다.
- **`claudeSpawnCommand` 에 argv 조립을 추가하지 말 것** (Phase 1 impl-log 제약 그대로 승계).
- **디렉터리명 → 원본 경로 역치환 함수를 다시 만들지 말 것.** 원본 cwd 는 항상 jsonl 의 `cwd` 필드에서.
- **스킬 `read`/`delete` 에 sanitize 를 적용하지 말 것** (ADR-05 §2 — 레거시 이름 접근 불가가 된다). 봉쇄 검증만.
- **MCP 역정규화(UI 표시용 `cmd /c` 벗기기)를 만들지 말 것** (ADR-06 §2).
- **`~/.claude.json` 에 파일 잠금을 도입하지 말 것** — claude 본체가 같은 규약을 쓰지 않아 안전을 주지 않는다.
- **B 트랙(split pane / serialize / WebGL / 링크 프로바이더) 코드를 겸사겸사 손대지 말 것.** `TerminalPane.tsx` 는 windowsPty 옵션 1줄, `TerminalManager.ts` 는 스폰/env 만.
- **IPC 채널을 새로 만들지 말 것.** 본 트랙에 필요한 것은 preload 정적 값 1개뿐이다. 필요해 보이면 그 판단을 먼저 architect 에게 되돌릴 것.
- **Windows 실기 없이 "검증 완료" 라고 쓰지 말 것.** 단위 테스트로 닫힌 것과 실기로 확인한 것을 impl-log/qa-report 에서 구분한다.
