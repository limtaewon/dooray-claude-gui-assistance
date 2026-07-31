---
task: v2-windows-fix
domain: windows-compat
created: 2026-07-30
status: draft
---

# PRD — v2.0 Phase 2 / Workstream A-1~A-4: Windows 호환 수복 (Phase 1 유틸 소비처 교체 + 수리)

## 배경 / 문제

Phase 1(`feature/windows-compat/v2-utils/`, 커밋 `791275d`)이 공용 유틸 6종을 만들고 **계약을 테스트로 고정**했다. 그러나 그 트랙의 PRD 비목표가 명시했듯 **소비처는 하나도 바꾸지 않았다**. 현재 상태:

- `mergePathIntoEnv` / `claudeExtraPaths` / `writeFileAtomic` / `sanitizeSkillFilename` / `expandHome` / `samePath` / `findProjectDir` / `readSessionCwd` / `claudeSpawnCommand` / `quoteWinShellArg` — **테스트에서만 호출되는 죽은 코드**(Phase 1 PRD R4).
- 그래서 Windows 사용자가 겪는 증상은 **하나도 고쳐지지 않았다**. Phase 1 은 "고칠 준비"였고, 본 트랙이 실제 수복이다.

본 트랙이 닫는 실증된 결함:

| # | 증상 (Windows) | 원인 | 대상 |
|---|---|---|---|
| 1 | 세션 목록/이어하기 전멸 | `ClaudeSessionService.encodeCwd` 가 `/`→`-` 만 함. `C:\Users\me\proj` 는 `/` 가 없어 무변환 → 실제 디렉터리 `C--Users-me-proj` 미스 | A-1 |
| 2 | 세션 목록의 프로젝트 라벨이 존재하지 않는 경로 (mac 도 오동작 중) | `index.ts:1254` 의 `-`→`/` 역치환. 이 레포 자신이 반례 (`.../dooray/claude/gui/assistance`) | A-1 |
| 3 | 공백 포함 설치 경로에서 claude 실행 실패 | `shell:true` + `windowsVerbatimArguments:true` 조합에서 node 는 인용하지 않음. `C:\Program Files\...` 가 `C:\Program` 에서 끊김 | A-1 |
| 4 | 한글 응답이 청크 경계에서 깨짐 | `data.toString('utf-8')` 를 chunk 단위로 호출 — 멀티바이트가 chunk 경계에 걸리면 U+FFFD | A-1 |
| 5 | CLI Info 패널이 빔 | `index.ts:1414` 의 `execFile('claude', ...)` — shell 미경유라 PATHEXT 해석 불가 → ENOENT | A-4 |
| 6 | 터미널이 cmd.exe 로만 열리고 한글 깨짐 | `COMSPEC \|\| 'cmd.exe'` 고정. codepage 949 로 claude TUI 의 `❯` → `Γ¥»` | A-2 |
| 7 | 태스크에서 "Claude Code 로 시작" 이 아무것도 못 함 | `terminalManager.create({command:'claude', args:['-p', 개행포함프롬프트]})` — PATHEXT 미해결 + 개행이 명령줄에서 깨짐 | A-2 |
| 8 | 위키에서 받은 스킬 저장 실패 / 삭제해도 남음 | 위키 페이지 제목이 곧 디렉터리명(`<>:"/\|?*` 무검증). `delete` 는 `SKILL.md` 만 unlink 해서 빈 디렉터리 잔존 → 목록에서는 사라지지만 같은 이름 재저장 시 혼선 | A-3 |
| 9 | 스킬/커맨드 변경 감지 안 됨 | `ConfigWatcher` 가 존재하지 않는 `~/.claude/skills` 를 watch. chokidar 는 조용히 무시하고 `error` 도 미구독 | A-3 |
| 10 | MCP 서버(npx 계열) 등록해도 안 뜸 | Windows 에서 `npx` 는 `npx.cmd` — claude 가 `spawn('npx')` 하면 EINVAL/ENOENT | A-4 |
| 11 | 워크트리 생성 후 "찾을 수 없음" | `w.path === worktreePath` 문자열 비교. porcelain 은 `C:/a/b`, `join()` 은 `C:\a\b` | A-4 |

추가로 코드 열람 중 확인한 잠복 결함 2건 (본 트랙에서 같이 처리):

- **`AIService.runClaude` (`AIService.ts:344-384`) 는 호출자가 없는 죽은 코드**이고, 유일하게 `shell` 옵션 없는 `execFile(CLAUDE_CLI, ...)` 다. Node 20 은 `.cmd`/`.bat` 을 shell 없이 실행하면 `EINVAL` 을 던진다(CVE-2024-27980 대응). 지금 아무도 안 부르니 무증상이지만, 다음 사람이 "non-streaming 이 필요하네" 하고 부르는 순간 Windows 전용 버그가 태어난다.
- `AIService.captureClaudeVersion`(`:107`) / `isAvailable`(`:673`) 은 `shell: win32` 는 켜져 있으나 **바이너리를 인용하지 않는다** — 결함 3 과 동일 원인의 미수정 잔여 2곳.

## 목표 (Goals)

- **G1.** Phase 1 유틸 8종의 소비처를 **전부** 교체해 죽은 코드를 0 으로 만든다. (`mergePathIntoEnv`/`claudeExtraPaths` 4곳, `claudeSpawnCommand`/`quoteWinShellArg` 5곳, `findProjectDir`/`readSessionCwd` 3곳, `sanitizeSkillFilename` 4곳, `writeFileAtomic` 1곳, `expandHome` 3곳, `samePath` 2곳)
- **G2.** 위 표의 결함 1~11 을 전부 닫는다. 각 결함은 **회귀 테스트 1개 이상**을 동반한다.
- **G3.** 플랫폼 분기가 들어가는 모든 신규/변경 로직을 **순수 함수로 분리**하고 `darwin`/`win32` **양쪽 케이스를 테스트에 명시**한다 (`AIService.test.ts` 선례).
- **G4.** **mac 무회귀**: `AIService.runClaudeStream` 의 argv 조립(특히 Windows 한정 `--append-system-prompt` → stdin combine)에 손대지 않는다. mac 의 spawn 커맨드/플래그/argv 가 현행과 바이트 단위로 동일. 기존 `AIService.test.ts` 65개 무수정 통과가 자동 감시자.
- **G5.** main 파트와 renderer 파트를 분리해 병렬 진행 가능하게 한다. renderer 변경은 3파일 이내 소형(`TerminalPane.tsx` windowsPty, `SkillsManager.tsx` 2곳, `MCPForm.tsx` 힌트).
- **G6.** `npx vitest run` 전체 통과 + 커버리지 게이트(lines 70 / statements 70 / functions 80) 유지, `npx tsc --noEmit` 통과, `npm run build` 통과.

## 비목표 (Non-goals)

- **Windows 실기 QA 는 본 트랙에서 완료하지 않는다.** 사용자 VM 이 필요하고, 결함 1~11 중 상당수는 실기 없이는 최종 확인이 불가능하다. 본 트랙은 **코드 + 테스트 + 스모크 체크리스트 작성**까지. 체크리스트 실행은 Phase 4 마감 항목.
- **B 트랙(터미널 강화) 침범 금지.** split pane / serialize 영속화 / WebGL / 링크 프로바이더는 같은 파일(`TerminalPane.tsx`, `TerminalManager.ts`)을 만지지만 **별 트랙**이다. 본 트랙은 `windowsPty` 옵션 1개 추가와 PTY 스폰 경로만 만진다.
- **C 트랙(워크스페이스) 침범 금지.** `AgentRunSpawner` / `WorkspaceService` 신설 없음.
- **`~/.claude.json` 의 read-modify-write 경합 해소는 스코프 밖.** `writeFileAtomic` 은 *반쪽 쓰기*를 막을 뿐 claude 본체와의 동시 편집 경합(우리가 읽은 뒤 claude 가 쓰고 우리가 덮어씀)은 막지 못한다. ADR-06 에 한계로 명시하고 후속 과제로 남긴다.
- **git-bash / WSL 셸 지원 추가 없음.** 현재 셸 선택 UI 자체가 없다. `detectWindowsShell` 은 pwsh → powershell → COMSPEC → cmd 체인만 다룬다.
- **`claude -p` 신규 호출부 추가 없음** (2026-06-15 크레딧 정책). `CLAUDE_START_TASK` 는 **기존 `-p` 호출의 전달 방식만** 바꾼다 — 호출 횟수/모드 불변.
- **encodeCwd Windows 실기 채집표 작성** — Phase 1 에서 이연된 항목이나 VM 필요. `findProjectDir` 3단 fallback 이 방어한다.

## 수락 기준 (Acceptance Criteria)

### A-1 세션

- [ ] `ClaudeSessionService` 에서 `encodeCwd`/`projectDir` private 메서드가 **삭제**되고 조회는 `findProjectDir` 로만 이뤄진다. 테스트 파일(`ClaudeSessionService.test.ts:17-18`)의 **복제 `encodeCwd` 가 제거**되고 `claudeProjects` 유틸 import 로 대체된다.
- [ ] `ClaudeSessionService` 가 프로젝트 루트를 **생성자 주입**으로 받는다. 테스트가 private 메서드를 monkeypatch 하지 않는다.
- [ ] `listSessions(cwd)` 가 win32 스타일 cwd(`C:\Users\me\proj`)에 대해 `C--Users-me-proj` 디렉터리를 찾아낸다 (tmp 파일시스템 기반 테스트).
- [ ] `index.ts` 의 `projDir.replace(/-/g,'/')` 역치환이 **삭제**된다. 프로젝트 라벨은 jsonl 의 `cwd` 필드에서 나오고, cwd 를 못 얻으면 **인코딩된 디렉터리명을 그대로** 보여준다 (가짜 경로를 만들지 않는다).
- [ ] 라벨 생성이 순수 함수(`formatProjectLabel`)로 분리되어 darwin/win32 양쪽 테스트를 갖는다. 홈 하위 경로는 `~/...` 로 축약된다.
- [ ] cwd 추출이 기존 `parseFirstMessage` 스트림 파서 안에서 이뤄져 **추가 파일 I/O 가 0** 이다.

### A-1 실행 계약

- [ ] claude 를 실행하는 5개 지점(`ClaudeChatService` spawn, `AIService.runClaudeStream` spawn, `AIService.captureClaudeVersion`, `AIService.isAvailable`, `index.ts` CLI Info)이 전부 `claudeSpawnCommand()` 를 통해 command/shell/verbatim 을 얻는다. 인라인 `shell: isWindows` 판정이 남지 않는다.
- [ ] win32 에서 공백 포함 바이너리 경로가 `"..."` 로 인용된다. darwin 반환값은 인용 없이 현행과 동일.
- [ ] `AIService.runClaudeStream` 의 argv 조립 블록(`:396-447`)이 **1바이트도 바뀌지 않는다** (git diff 로 확인).
- [ ] `AIService.runClaude`(dead) 가 삭제되고, 그로 인해 미사용이 된 import 도 정리된다.
- [ ] PATH 보강 4곳이 `mergePathIntoEnv(process.env, claudeExtraPaths(), ...)` 로 교체된다. **AIService 만 `{ position: 'prepend' }`** 를 명시하고 그 자리에 근거 주석이 있다.
- [ ] 교체 후 win32 환경에서 결과 env 에 `Path` 와 `PATH` 가 **동시에 존재하지 않는다** (기존 키 이름 보존 테스트).
- [ ] stdout 디코딩 2곳이 `StringDecoder('utf8')` 로 교체되고, **멀티바이트를 chunk 경계에서 쪼갠 입력**으로 회귀 테스트가 있다 (한글 3바이트를 1/2 로 분할).

### A-2 터미널

- [ ] `detectWindowsShell({ env, probe })` 가 **후보 배열**(각 후보는 `{file, args, kind}`)을 pwsh → powershell → COMSPEC → cmd 순으로 돌려준다. 후보마다 args 가 이미 계산돼 있어 폴백이 args 재계산을 자동 만족한다.
- [ ] 절대경로 후보는 `probe(p)?.isFile && size > 0` 을 통과해야 채택된다. `%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe`(0바이트 alias 스텁) 가 후보에서 **제외**되는 테스트가 있다.
- [ ] cmd 후보의 args 에 `chcp 65001` 이, PowerShell 계열 후보의 args 에 `OutputEncoding` UTF-8 설정이 포함된다.
- [ ] `TerminalManager.create` 가 win32 에서 후보 체인을 순회하며 spawn 실패 시 다음 후보로 폴백하고, 각 실패를 후보 경로와 함께 `warn` 로그로 남긴다. 전부 실패하면 마지막 오류를 throw 한다.
- [ ] win32 spawn 옵션에 `useConptyDll: true` 가 들어가고, ConPTY DLL 관련 실패 시 **같은 후보를 1회** `useConptyDll: false` 로 재시도한 뒤 모듈 전역 래치로 이후 시도에서는 생략한다.
- [ ] win32 PTY env 에 `PYTHONUTF8=1`, `TERM_PROGRAM=Clauday`, `FORCE_HYPERLINK=1` 이 추가된다. **darwin/linux env 는 변경되지 않는다** (LANG/LC_* 3종 그대로).
- [ ] `windowsPtyOptions(platform, osRelease)` 순수 함수가 `src/shared/utils/` 에 있고, win32 + buildNumber ≥ 21376 일 때만 `{backend:'conpty', buildNumber}` 를, 그 외에는 `undefined` 를 돌려준다. darwin / 구형 빌드 / 파싱 불가 3케이스 테스트 존재.
- [ ] preload 가 `api.system = { platform, osRelease }` **정적 값**을 노출한다 (IPC 채널 신설 없음). `TerminalPane` 이 이 값으로 `windowsPty` 를 조건부 지정하고, 값이 없으면 현행과 동일하게 동작한다.
- [ ] `buildStartTaskSpawn()` 순수 함수가 darwin 에서 현행과 동일한 `{command:'claude', args:['-p', prompt, '--model','sonnet']}` 를, win32 에서 프롬프트 임시파일 + cmd 파이프 커맨드라인을 돌려준다. 양쪽 테스트 존재.
- [ ] Windows 경로에서 터미널 탭 이름이 `cmd.exe` 로 표시되지 않는다 (표시 이름이 스폰 커맨드와 분리된다).
- [ ] 프롬프트 임시파일은 워크트리/홈이 아닌 OS temp 아래에 만들어지고, 세션 종료 또는 타임아웃 시 정리된다.

### A-3 스킬 / ConfigWatcher

- [ ] `SkillsManager.save`(main) 가 `sanitizeSkillFilename` 을 적용한다. **`read`/`delete` 는 이름을 변형하지 않고 경로 봉쇄 검증**(`resolve` 결과가 skillsDir 하위인지)을 한다 — 기존에 만들어진 비정규 이름의 스킬에 계속 접근 가능해야 한다.
- [ ] `../../etc/passwd` 류 traversal 이 `save`/`read`/`delete` 3곳 모두에서 차단되는 테스트가 있다.
- [ ] `SkillsManager.delete` 가 심볼릭 링크면 링크 자체를 `unlink`, 실디렉터리면 재귀 삭제한다. 삭제 후 `~/.claude/skills/<name>` 이 **남지 않는다**.
- [ ] `ConfigWatcher.start` 가 watch 전에 `~/.claude/skills`, `~/.claude/commands` 를 `mkdirSync(recursive)` 로 선생성하고, watcher 의 `error` 이벤트를 구독해 `warn` 로그를 남긴다.
- [ ] renderer 위키 다운로드 2곳(`SkillsManager.tsx:208,383`)이 저장 요청 **전에** 같은 규칙으로 이름을 정제하고, 토스트에 정제된 이름을 보여준다.

### A-4 MCP / 기타

- [ ] `normalizeStdioCommandForWindows({command,args}, {platform})` 가 win32 에서 `npx`/`uvx`/`*.cmd`/`*.bat` 을 `{command:'cmd', args:['/c', 원본커맨드, ...원본args]}` 로 바꾼다. **멱등**(이미 `cmd /c` 로 감싼 입력은 그대로), darwin 은 무변환. stdio 가 아닌 http/sse 설정은 손대지 않는다.
- [ ] `McpConfigManager.add`/`update` 진입점에서 정규화가 적용되고, `writeRaw` 가 `writeFileAtomic` 을 쓴다.
- [ ] `index.ts` CLI Info 의 `execFile('claude')` 가 해석된 바이너리 + shell 경유로 교체되어 Windows 에서 버전/도움말을 받아온다.
- [ ] `GitService.ts:150,173` 의 경로 비교가 `samePath()` 로 교체되고, `C:/a/b` vs `C:\a\b` 가 같다고 판정되는 테스트가 있다.
- [ ] `index.ts` 의 `~` 확장 3곳(`:468, :500, :521`)이 `expandHome()` 으로 교체된다. (마스터 계획은 4곳으로 셌으나 실측 3곳 — 4번째로 지목됐던 `:1255` 는 확장이 아니라 *표시용 축약*이라 A-1 의 `formatProjectLabel` 에 흡수된다.)
- [ ] MCPForm 의 command 입력에 Windows 사용자용 힌트가 표시된다 (`npx` 를 그대로 적으면 저장 시 `cmd /c` 로 감싸진다는 안내).

### 공통

- [ ] 위 모든 신규 순수 함수가 `darwin`/`win32` 양쪽 테스트를 갖는다.
- [ ] `npx vitest run` 전체 통과, 커버리지 게이트 유지, `npx tsc --noEmit` 통과, `npm run build` 통과.
- [ ] `CHANGELOG.md` Unreleased 에 항목 추가. 사용자 가시 변경(스킬 파일명 정제, 터미널 셸/인코딩)은 `ClaudeManual.tsx` SECTIONS 에 짧게 반영.
- [ ] `impl-log.md` 를 **append** 규약으로 작성 (main 파트 / renderer 파트가 각각 자기 섹션을 덧붙이고 남의 섹션을 고치지 않는다).

## 영향 도메인

- **windows-compat** (본 트랙 주역)
- **claude-chat** — `ClaudeSessionService`, `ClaudeChatService` spawn/env/디코딩
- **ai-service** — spawn 계약, PATH 보강, stdout 디코딩, dead `runClaude` 삭제
- **terminal** — PTY 스폰 체인, 한글 env, `windowsPty`, START_TASK
- **mcp-skills** — 스킬 파일명 경계, delete 의미론, ConfigWatcher, MCP stdio 정규화
- **electron-ipc** — preload 정적 값 1개 추가(`api.system`). **IPC 채널 신설 없음**
- **renderer-only** — `TerminalPane.tsx`, `SkillsManager.tsx`, `MCPForm.tsx`

> ⚠ `ai-service` 가 영향 도메인이므로 `CLAUDE.md` / `.agent/wiki/domain-ai-service.md` 의 **Windows/Mac 분기 가이드**가 본 트랙 전체에 적용된다. 특히 함정 1("양쪽 일관성의 함정")과 함정 3("shell:true 의존성"). ADR-02 §1 이 이를 불변식으로 재확인한다.

## 리스크 / 제약

- **R1. `mergePathIntoEnv` 교체로 3곳의 실효 PATH 내용이 바뀐다** — Phase 1 ADR-03 이 합집합을 채택했으므로 ClaudeChatService/AIService/index.ts CLI Info 에 없던 경로가 새로 들어간다(예: AIService 에 `/opt/homebrew/sbin`, index.ts 에 `~/.npm-global/bin`). append 위치라 사용자 PATH 를 이기지 않지만 **AIService 만 prepend** 라 여기서는 이긴다. → AIService 에 새로 추가되는 것은 `sbin`·`nvm current` 2종뿐이고 둘 다 claude 바이너리를 담지 않는 경로임을 교체 시 확인. mac 스모크(브리핑 생성)를 수동 QA 항목으로.
- **R2. `useConptyDll: true` 가 패키징 빌드에서 실패할 수 있다** — node-pty 번들 ConPTY DLL 이 `asarUnpack` 결과물에 실제로 포함되는지는 Windows 빌드에서만 확인 가능하다. → 폴백 래치(AC A-2)로 앱이 죽지 않게 하고, Windows 빌드 산출물의 `node_modules/node-pty/build/Release/conpty*` 존재 확인을 plan 체크리스트에 넣는다.
- **R3. `windowsPty` 를 buildNumber ≥ 21376 에서만 지정하는 선택은 xterm 공식 문서 권고와 다르다** — 문서는 구형 ConPTY 에서도 지정해 reflow 를 끄라고 한다. 그러나 구형(Win10 19044 등)에서 지정하면 "줄 끝이 공백이 아니면 wrap 으로 간주" 휴리스틱이 켜져 **현행 동작이 바뀐다**. 실기 검증 없이 다수 사용자 동작을 바꾸는 쪽이 더 위험하다고 판단. → 게이트 유지(구형은 현행 동작 보존) + 한 줄로 뒤집을 수 있게 순수 함수에 가둔다. ADR-03 §대안2.
- **R4. node-pty 의 Windows args 배열 인용이 cmd 파이프와 충돌한다** — 배열 args 는 `argvToCommandLine` 이 내부 `"` 를 `\"` 로 이스케이프하는데 cmd.exe 는 백슬래시 이스케이프를 모른다. → START_TASK 는 **verbatim 문자열 커맨드라인**으로 넘긴다(`TerminalCreateOptions.args` 를 `string[] | string` 로 확장). shared 타입 변경이므로 ADR-04 로 승격.
- **R5. 스킬 read/delete 에 sanitize 를 그대로 적용하면 기존 스킬이 사라진 것처럼 보인다** — mac 에서는 `my:skill` 같은 디렉터리가 정상 존재할 수 있는데, 읽을 때 이름을 변형하면 ENOENT 가 난다. → 샌타이즈는 쓰기 경계에서만, 읽기/삭제는 봉쇄 검증. ADR-05.
- **R6. `index.ts` 를 3개 영역(세션 리스트 / CLI Info / START_TASK / `~` 확장)에서 만진다** — B·C 트랙이 같은 파일을 병렬로 만질 수 있다. → 커밋을 hunk 단위로 분리하고(plan §9), rebase 충돌 시 영역별로 독립 해결 가능하게 한다.
- **R7. `ClaudeSessionService` 의 `findProjectDir` 는 async 이고 3단 fallback 은 전체 스캔을 한다** — `listSessions(cwd)` 는 UI 진입마다 호출된다. → cwd 지정 조회는 `fullScan` 기본값(활성) 유지하되, 프로젝트 디렉터리 수가 많은 사용자를 위해 miss 시에만 비용이 발생함을 확인(히트는 1단에서 끝). 대량 반복 호출을 새로 만들지 않는다.
- **R8. Windows 실기 없이 "고쳤다" 고 선언하게 된다** — 결함 5·6·7·10 은 mac 단위 테스트로는 최종 확인 불가. → plan §11 에 Windows 스모크 체크리스트를 산출물로 남기고, PRD 비목표에 명시한 대로 Phase 4 에서 실행.

## 참조

- 마스터 설계: `~/.claude/plans/toasty-sleeping-simon.md` — Workstream A(A-1~A-4), 작업 순서 Phase 2
- 선행 트랙: `feature/windows-compat/v2-utils/` — `prd.md`(비목표 = 본 트랙 범위), `adr.md`(ADR-01 encodeCwd), `adr-02`(findProjectDir 3단), `adr-03`(env 병합 — R1 의 출처), `adr-04`(claudeBin), `impl-log.md`(§제약 = 본 트랙 인계 사항), `qa-report.md`
- `docs/dev/orca-absorption-notes.md` §7(Windows 한글 env), §8(PTY 스폰), §9 함정 #11
- `CLAUDE.md` → "AIService.runClaudeStream — Windows / macOS 분기 가이드"
- `.agent/wiki/domain-ai-service.md`, `domain-terminal.md`, `domain-mcp-skills.md`, `domain-claude-chat.md`
- 본 디렉터리: `adr.md`, `adr-02-claude-exec-contract.md`, `adr-03-windows-pty-spawn.md`, `adr-04-start-task-prompt-pipe.md`, `adr-05-skill-filename-boundary.md`, `adr-06-mcp-stdio-normalize.md`, `plan.md`
