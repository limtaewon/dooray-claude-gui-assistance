---
task: v2-utils
domain: windows-compat
created: 2026-07-30
status: draft
---

# PRD — v2.0 Phase 1 / Workstream A 기반: 공용 유틸 6종 + encodeCwd 실규칙 확정

## 배경 / 문제

v2.0 Workstream A(Windows 호환 수복)의 A-1 ~ A-4 는 전부 "같은 로직이 여러 곳에 복제되어 있고, 그 복제본이 서로 조금씩 다르다" 는 문제 위에 서 있다. 수정 대상을 손대기 전에 **단일 정의(single definition)** 를 먼저 세우지 않으면, 4곳을 각각 고치는 동안 다시 4개의 변종이 생긴다.

실측으로 확인된 복제/드리프트:

| 복제 대상 | 위치 | 드리프트 |
|---|---|---|
| PATH 보강 | `ClaudeChatService.ts:37-41`, `TerminalManager.ts:73-78`, `AIService.ts:310-314`, `index.ts:1508-1513` | 4곳의 `extraPaths` 목록이 서로 다름 (TerminalManager 만 `homebrew/sbin` + nvm `current/bin`, AIService 만 sbin 없음, index.ts 만 `.npm-global` 없음). 순서도 다름 (AIService 만 prepend). 넷 다 `PATH` 키에 무조건 대입 — Windows 의 `Path` 키와 공존 시 중복 |
| claude 바이너리 해석 | `AIService.ts:101-143` (`resolveClaudePath`) | 유일 정의지만 AIService 내부에 갇혀 있어 `index.ts:1517` 은 그냥 `execFile('claude')` 를 씀 (PATHEXT 미해결로 Windows 실패) |
| cwd → 프로젝트 디렉터리 인코딩 | `ClaudeSessionService.ts:69-71`, **그리고 그 테스트 파일 `ClaudeSessionService.test.ts:17-18` 이 로직을 복제** | 테스트가 구현을 복제하므로 규칙이 틀려도 **자기일관으로 통과**. 실제 규칙과 어긋난 상태가 검증되지 않음 |
| 인코딩 역치환 | `index.ts:1357` (`projDir.replace(/-/g,'/')`) | 손실 변환을 역으로 되돌리려는 시도. mac 에서도 이미 오동작 중 (아래) |
| atomic write | `AgentWorkspaceManager.ts:137-139` | 인라인 tmp→rename. Windows EPERM 재시도 없음 |

### 확정된 사실 — encodeCwd 실규칙 (본 트랙에서 리버스엔지니어링 완료)

`~/.claude/projects/{encodedCwd}/` 의 실제 인코딩 규칙을 두 경로로 교차 검증했다.

**① 실측 (mac, `~/.claude/projects` 25개 디렉터리)**

디렉터리 안 `*.jsonl` 의 `cwd` 필드를 읽어 원본 경로를 복원할 수 있었던 12개 전부에서 `[^a-zA-Z0-9] → '-'` 가설이 **12/12 일치, 불일치 0**. 결정적 표본 2개:

- `/Users/nhn/.claude` → `-Users-nhn--claude` (`.` 도 대시 — 현행 구현의 `/`→`-` 규칙으로는 재현 불가)
- `/Users/nhn/Desktop/발표` → `-Users-nhn-Desktop---` (한글 2자 = 대시 2개)

**② claude CLI 바이너리(v2.1.220) 내부 함수 추출**

```js
function art(e){ let t=0; for(let r=0;r<e.length;r++) t=(t<<5)-t+e.charCodeAt(r)|0; return t }
function o0h(e){ return Math.abs(art(e)).toString(36) }
function RA(e){ let t=e.replace(/[^a-zA-Z0-9]/g,"-"); if(t.length<=iRt) return t;
                return `${t.slice(0,iRt)}-${o0h(e)}` }      // iRt = 200
function Fd(e){ return e.normalize("NFC") }
async function GR(e){ try{ return Fd(await realpath(e)) } catch { return Fd(e) } }
```

즉 실규칙은 단순 치환이 아니라 **NFC 정규화 → 비영숫자 치환 → 200자 캡 + djb2 해시 접미** 3단이다. 상세와 결정은 `adr.md` 참조.

### 이 규칙을 모르고 짜여 있어서 지금 깨져 있는 것

1. **Windows 세션 전멸** — `ClaudeSessionService.encodeCwd` 가 `/`→`-` 만 하므로 `C:\Users\me\proj` 가 `C:\Users\me\proj` 그대로 남아 실제 디렉터리 `C--Users-me-proj` 를 못 찾는다. `listSessions(cwd)` 가 항상 빈 배열 → 세션 목록/이어하기 전멸.
2. **mac 에서도 이미 오동작** — `index.ts:1357` 의 역치환 `-`→`/` 는 손실 변환의 역이라 성립하지 않는다. 이 레포 자신이 반례: `-Users-nhn-Desktop-dooray-claude-gui-assistance` → `/Users/nhn/Desktop/dooray/claude/gui/assistance` 라는 존재하지 않는 경로가 화면에 표시된다. `발표` 케이스는 `/Users/nhn/Desktop///`.
3. **한글 사용자 경로** — 인코딩 입력이 NFD(맥 파일시스템이 흔히 돌려주는 형태)면 자모가 낱개로 분해되어 대시 수가 달라진다. 실측이 NFC 임을 확정 (`발표` NFC 2대시 vs NFD 5대시, 관측값은 NFC).

## 목표 (Goals)

- G1. `src/main/utils/` 4종 + `src/shared/utils/` 1종 + `src/main/utils/paths.ts` — **총 6개 모듈 신설**. 각 모듈은 순수 함수 위주로, electron/fs 의존을 주입 가능하게.
- G2. `encodeCwd` 를 위 ①②로 확정한 실규칙대로 구현하고, **실측 채집표를 그대로 테스트 픽스처로** 고정 (12쌍 + 경계 케이스).
- G3. `findProjectDir` 가 규칙이 미래에 드리프트해도 동작하도록 fallback 을 갖고, fallback 히트 시 `warn` 로그로 드리프트를 관측 가능하게 만든다.
- G4. 모든 신규 모듈에 vitest 동반. 플랫폼 분기 함수는 `darwin` / `win32` **양쪽 케이스 명시**. 신규 모듈 라인 커버리지 90%+ (전체 게이트 70% 를 끌어내리지 않는다).
- G5. `AIService` 는 `claudeBin` 유틸에 위임하되 **외부 동작 무변경** — 특히 mac 경로의 `getClaudeBin()` 반환값과 spawn argv 가 현행과 바이트 단위로 동일.

## 비목표 (Non-goals)

- **소비처 교체 금지.** PATH 보강 4곳, `ClaudeSessionService.encodeCwd`, `index.ts` 인라인 세션 리더, SkillsManager, McpConfigManager, GitService, `index.ts` 의 `~/` 확장 — 전부 후속 트랙(A-1 ~ A-4) 몫. 본 트랙은 **유틸을 만들고 테스트로 계약을 고정하는 것까지**.
  - 유일한 예외: `claudeBin` 이동에 따른 `AIService.ts` 의 최소 위임 변경 (G5).
- Windows 실기 채집표 작성 — 사용자 VM 필요. 본 트랙은 mac 채집 + 바이너리 근거까지. Windows 는 `findProjectDir` fallback 이 방어하고, 후속 트랙에서 채집표로 픽스처를 보강한다.
- `readSessionCwd` 를 쓰는 UI 표시 로직 변경 (`index.ts:1350-1361`) — A-1.
- PTY 스폰 / `detectWindowsShell` / WindowsApps alias 필터 — A-2. 단 `paths.ts` 의 `samePath` 설계는 A-2/A-4 소비를 전제로 한다.

## 수락 기준 (Acceptance Criteria)

- [ ] `src/main/utils/env.ts` — `mergePathIntoEnv(base, extraPaths, { position })` 가 `base` 의 PATH 키를 **대소문자 무시로 탐색해 그 키만 갱신**한다. `{ Path: 'C:\\a' }` 입력에 대해 결과 객체의 키는 여전히 `Path` 하나뿐이고 `PATH` 키가 새로 생기지 않는다.
- [ ] 같은 함수가 PATH 키 부재 시 `PATH`(win32 면 `Path`) 를 신설하고, 대소문자만 다른 키가 2개 이상 있으면 **먼저 발견된 하나만** 갱신 + `warn` 로그.
- [ ] `claudeExtraPaths()` 가 4개 복제본의 **합집합**을 플랫폼별로 단일 반환. 중복 제거 + 순서 안정.
- [ ] `src/main/utils/claudeBin.ts` — `resolveClaudeBin()` 이 mac 에서 현행 `resolveClaudePath()` 와 동일 결과. Windows 에서 `where claude` 다중 결과를 `\r\n` 로 분리하고 `.cmd` → `.exe` → `.bat` 우선순위로 고른다.
- [ ] `quoteWinShellArg()` 가 공백 포함 경로를 `"..."` 로 감싸고, 이미 인용된 값을 이중 인용하지 않는다.
- [ ] `claudeSpawnCommand()` 가 darwin 에서 `{ command: <절대경로>, shell: false, windowsVerbatimArguments: false }` 를, win32 에서 `{ command: <인용된 절대경로>, shell: true, windowsVerbatimArguments: true }` 를 반환. **양쪽 테스트 모두 존재**.
- [ ] `src/main/utils/claudeProjects.ts` — `encodeCwd()` 가 아래 12쌍 픽스처를 전부 통과 (`adr.md` 채집표).
- [ ] `encodeCwd()` 가 200자 초과 시 `slice(0,200) + '-' + base36(|djb2(NFC입력)|)` 를 반환. 해시 입력은 **대시 치환 전 NFC 정규화된 원본 경로**.
- [ ] `encodeCwd()` 가 NFD 입력을 NFC 로 정규화한 뒤 인코딩 (`'/Users/nhn/Desktop/발표'.normalize('NFD')` → `-Users-nhn-Desktop---`).
- [ ] `readSessionCwd(jsonlPath)` 가 **첫 줄이 아니라** `cwd` 문자열 필드를 가진 첫 줄을 찾는다 (실측: 선두 3줄은 `mode`/`permission-mode`/`file-history-snapshot` 타입으로 `cwd` 없음). 스캔 상한(줄 수 또는 바이트) 초과 시 `undefined`.
- [ ] `findProjectDir(cwd)` 3단: ① `encodeCwd` 정확 일치 ② 해시 접미 prefix 스캔 ③ 전체 스캔(각 디렉터리의 jsonl 에서 `readSessionCwd` 후 비교). ②③ 히트 시 `warn` 로그에 cwd + 실제 디렉터리명 포함.
- [ ] `src/main/utils/atomicWrite.ts` — `writeFileAtomic(path, data)` 가 tmp→rename. rename 이 `EPERM`/`EACCES`/`EBUSY` 로 실패하면 **1회** 재시도 후 실패 시 throw. tmp 파일은 실패 경로에서도 정리.
- [ ] `src/shared/utils/filename.ts` — `sanitizeSkillFilename()` 이 `<>:"/\|?*` + 제어문자 제거, `..` traversal 무력화, Windows 예약어(`CON` `PRN` `AUX` `NUL` `COM1-9` `LPT1-9`, 확장자 붙은 형태 포함) 회피, 후행 점/공백 제거, 빈 결과는 fallback 문자열.
- [ ] `src/main/utils/paths.ts` — `expandHome()` 이 `~`, `~/`, `~\` 를 처리하고 `~user` 형태는 **확장하지 않는다**. `samePath()` 가 구분자 정규화 + win32 대소문자 무시 + 후행 구분자 무시, 플랫폼은 파라미터 주입 가능.
- [ ] `AIService.ts` 가 `claudeBin` 유틸에 위임하고 기존 `getClaudeBin()` export 시그니처 유지. 기존 `AIService.test.ts` 전부 무수정 통과.
- [ ] `npx vitest run` 전체 통과 + 커버리지 게이트(lines 70 / statements 70 / functions 80) 유지.
- [ ] `npx tsc --noEmit` 통과.

## 영향 도메인

- **windows-compat** (신규 — 본 트랙이 최초 진입점)
- 인접(읽기만, 이번 트랙에서 수정 안 함): ai-service(위임 1건만), claude-chat, terminal, mcp-skills

> `ai-service` 가 인접 도메인이므로 `CLAUDE.md` / `.agent/wiki/domain-ai-service.md` 의 **Windows/Mac 분기 가이드**가 그대로 적용된다. `adr-04-claude-bin.md` 에서 "mac 반환값 무변경" 을 불변식으로 못박았다.

## 리스크 / 제약

- **R1. encodeCwd 규칙이 claude 버전에 따라 바뀔 수 있다** — 리버스엔지니어링 결과는 v2.1.220 기준. → `findProjectDir` 3단 fallback + fallback 히트 warn 로그로 드리프트를 조기 관측. `adr-02` 참조.
- **R2. 200자 캡은 실측 미확인** — 본 머신 최장 디렉터리명이 55자라 캡 경로를 실물로 관측하지 못했다. 바이너리 소스 근거만 있음. → 구현은 소스대로, 실증은 plan 의 선택 단계(P2 프로브)로. v2.0 Workstream C 가 워크트리를 `~/Clauday-Workspaces/workspace/` 아래 만들고 브랜치명이 한글 태스크 제목에서 파생되면(한글 1자 = 대시 1개) 200자는 실제 도달 가능한 범위라 무시할 수 없다.
- **R3. `AIService` 위임이 초기화 순서를 깨뜨릴 수 있다** — 현행 `resolveClaudePath()` 는 **모듈 로드 시점**에 즉시 실행되어 `CLAUDE_CLI` 상수에 박히고, 곧바로 `captureClaudeVersion()` 이 그 값을 쓴다. 유틸로 옮기면서 lazy 로 바꾸면 `cliLogger` 의 버전 캐싱 타이밍이 달라진다. → 위임만 하고 **평가 시점을 바꾸지 않는다** (모듈 로드 시 1회 평가 유지). `adr-04` 결과 섹션.
- **R4. `mergePathIntoEnv` 를 만들어두고 소비처를 안 바꾸면 당분간 죽은 코드** — 커버리지 대상(`src/main/**`)이라 테스트 없으면 게이트를 끌어내린다. → 수락 기준 G4 로 강제. 소비 시점은 A-1 ~ A-4.
- **R5. `src/shared/utils/` 는 신규 디렉터리** — renderer 가 `@shared/utils/filename` 으로 import 하게 된다. main 전용 API(fs/path)를 절대 넣지 말 것. `sanitizeSkillFilename` 을 shared 에 두는 이유는 A-3 에서 renderer 의 위키 다운로드 2곳(`SkillsManager.tsx:208,383`)이 **저장 요청 전에** 같은 규칙으로 미리 정제해야 하기 때문 (main 에만 두면 IPC 왕복 없이는 파일명 미리보기를 못 만든다).
- **R6. claude 는 encode 전에 `realpath` 를 적용한다** (`GR()`). mac 의 `/tmp` → `/private/tmp` 심볼릭이 대표 사례이고, 실제로 관측된 stale 인덱스 항목이 `/private/tmp/chunks` 였다. → `encodeCwd` 자체는 **순수 함수로 유지**(realpath 안 함)하고, realpath 는 호출자가 하도록 계약에 명시 + `findProjectDir` 에서 원본/realpath 두 후보를 모두 시도.

## 참조

- 마스터 설계: `~/.claude/plans/toasty-sleeping-simon.md` — Workstream A(A-0 표, A-5), 작업 순서 Phase 1
- `docs/dev/orca-absorption-notes.md` §8 (PTY 스폰 Windows 함정) — 본 트랙 대상은 아니지만 `paths.ts`/`env.ts` 의 소비처가 될 A-2 의 전제
- `CLAUDE.md` → "AIService.runClaudeStream — Windows / macOS 분기 가이드"
- `.agent/wiki/domain-ai-service.md` §Windows/Mac 분기 함정
- 본 디렉터리: `adr.md`(encodeCwd 실규칙), `adr-02-project-dir-lookup.md`, `adr-03-env-path-merge.md`, `adr-04-claude-bin.md`, `plan.md`
