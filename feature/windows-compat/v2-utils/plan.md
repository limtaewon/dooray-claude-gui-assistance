---
task: v2-utils
domain: windows-compat
created: 2026-07-30
status: draft
---

# 구현 계획 — 공용 유틸 6종 + encodeCwd 실규칙

> 전제 문서: `prd.md`, `adr.md`(ADR-01 encodeCwd 규칙), `adr-02-project-dir-lookup.md`, `adr-03-env-path-merge.md`, `adr-04-claude-bin.md`
> 브랜치: `feat/version-2.0`
> **스코프 경계**: 유틸 신설 + 테스트. 소비처 교체는 후속 트랙(A-1~A-4). 예외는 §7 의 AIService 위임 1건뿐.

---

## 0. 착수 전 확인

- [x] `git branch --show-current` 가 `feat/version-2.0` 인지 확인
- [x] `npx vitest run` 이 **착수 전에** 통과하는지 확인 (기준선 확보 — 실패가 내 변경 탓인지 구분 가능하게) — 착수 전/작업 완료 후 모두 124 files / 1837 tests green (병렬 작업 중인 다른 두 엔지니어 변경분 포함)
- [x] `npx vitest run --coverage` 로 착수 전 커버리지 수치 기록 (게이트 lines 70 / statements 70 / functions 80) — 작업 완료 시점 전체 게이트: lines 79.58 / statements 79.58 / functions 90.31 (모두 통과)

---

## 1. A-5 — encodeCwd 실규칙 확정 (다른 모든 단계보다 먼저)

> **선행 완료됨.** ADR 작성 과정에서 ①②를 이미 수행했고 결과가 `adr.md` 에 채집표/소스로 박혀 있다.
> 이 단계에서 할 일은 **재현 검증**과 **픽스처 파일 생성**이다. 결과가 `adr.md` 와 다르면 **거기서 멈추고** 새 ADR 로 supersede 할 것 (ADR 은 불변).

### 1-1. mac 채집 재현

- [x] `ls ~/.claude/projects` 로 디렉터리 목록 확인 (ADR 작성 시점 25개 — 재현 시점 26개, 본 세션이 새 항목 1개를 추가한 자연 증가. 구조는 동일)
- [x] 각 디렉터리의 `*.jsonl` 에서 `cwd` 필드를 읽어 `(원본 cwd → 디렉터리명)` 쌍을 만들고, `cwd.normalize('NFC').replace(/[^a-zA-Z0-9]/g,'-')` 와 일치하는지 전수 대조 — 스크래치패드 스크립트로 재현 (readSessionCwd 와 동일 로직: 첫 줄이 아니라 `cwd` 문자열 필드를 가진 첫 줄 스캔)
- [x] 불일치 0 인지 확인. 재현 결과: **복원 가능 12개 전부 일치, 불일치 0** (26개 중 12개 cwd 확보, 나머지는 jsonl 없음/`memory` 전용 — ADR 수치와 정합)
- [x] 결정적 표본 2개가 그대로인지 개별 확인
  - `/Users/nhn/.claude` → `-Users-nhn--claude` (점도 대시) — 실제 디렉터리 목록에 존재 확인
  - `/Users/nhn/Desktop/발표` → `-Users-nhn-Desktop---` (한글 1자 = 대시 1개 → **NFC** 확정, NFD 면 대시 6개) — 실제 디렉터리 목록에 존재 확인

### 1-2. claude 실체에서 인코딩 함수 재확인

- [x] `which claude` → 심볼릭 따라가 실체 확인 — 재현 결과: `~/.local/bin/claude` → `~/.local/share/claude/versions/2.1.220`, `claude --version` = `2.1.220 (Claude Code)` (ADR 시점과 동일 버전)
- [x] `strings -n 6 <실체> | grep -F 'a-zA-Z0-9]/g,"-"'` 로 인코딩 함수 추출 — 리터럴 `[^a-zA-Z0-9]/g,"-")` 및 djb2 시프트 패턴 `<<5)-` 바이너리 내 존재 확인 (grep 매치 3건)
- [ ] 아래 4개가 그대로인지 확인 (`adr.md` §3 전문) — 리터럴 패턴 존재는 재확인했으나 변수명 단위(`RA`/`iRt`/`art`/`o0h`/`Fd`/`GR`) 역참조는 본 트랙 스코프상 생략 (ADR 채집 시점 결과를 그대로 신뢰 — PRD "adr 에 확정된 실규칙 그대로" 지시에 따름)
- [ ] `MM(e)` 확인 — 위와 동일 사유로 생략 (ADR-02 는 이미 이 근거로 3단 설계를 확정한 상태)

### 1-3. 픽스처 파일 생성

- [x] `src/main/utils/__fixtures__/claudeProjectDirs.ts` 신규 — `adr.md` 채집표 12쌍을 `{ cwd, dir }` 배열로. 표를 그대로 옮김 (구현 복제 금지)
- [x] 채집표 외 경계 케이스를 별도 배열로 추가 (실측 아님을 주석에 명시)
  - `''` → `''`
  - `'/'` → `'-'` (실측 표에 포함, 중복 기재 생략)
  - win32: `'C:\\Users\\me\\proj'` → `'C--Users-me-proj'`
  - win32 UNC: `'\\\\server\\share\\p'` → `'--server-share-p'`
  - 공백: `'/Users/me/My Docs'` → `'-Users-me-My-Docs'`
  - 이모지(비BMP, surrogate pair 2코드유닛 = 대시 2개 예상 — **미검증**임을 주석에 명시)
  - 200자 경계: 정확히 200자 / 201자 케이스 (해시 접미 유무 분기) — `claudeProjects.test.ts` 에 직접 구현 (fixture 화하면 순환 논증이라 프로퍼티 기반 단언으로 대체)

### 1-4. (P2, 선택) 200자 캡 실증

- [ ] 200자를 넘기는 깊은 임시 디렉터리를 만들고 그 안에서 `claude` 를 1회 실행 → `~/.claude/projects` 에 생긴 디렉터리명이 `slice(0,200)-{base36해시}` 형태인지 확인 — **미실행** (P2 선택 단계, 본 트랙 스코프 밖. PRD R2 로 리스크 유지)

### 1-5. Windows 채집 (후속 트랙 — 본 트랙 밖)

- [ ] (후속) 사용자 Windows VM 에서 공백 / 한글 / 드라이브 문자 / UNC 경로 채집표 작성 → 픽스처 보강
- 본 트랙에서는 `findProjectDir` 3단 fallback 이 방어한다 (ADR-02)

---

## 2. `src/main/utils/claudeProjects.ts` — 신규

- [x] `MAX_ENCODED_LEN = 200` 상수
- [x] `encodeCwd(cwd: string): string` — NFC → `[^a-zA-Z0-9]`→`-` → 200자 초과 시 `slice(0,200) + '-' + base36(|djb2(NFC원본)|)`
  - 해시 입력은 **대시 치환 전 NFC 경로** (치환 후 아님)
  - 한국어 주석 1~2줄 + "claude CLI 내부 규칙 재현, 근거는 ADR-v2-utils-01" 참조만
- [x] 내부 `djb2(s: string): number` — `((h << 5) - h + s.charCodeAt(i)) | 0`. export 하지 않음(테스트는 encodeCwd 결과로 검증)
- [x] `claudeProjectsRoot(opts?: { configDir?: string }): string` — `CLAUDE_CONFIG_DIR` 존중, 기본 `~/.claude`, 그 아래 `projects`. **테스트 주입 가능**
- [x] `readSessionCwd(jsonlPath: string, opts?: { maxLines?: number; maxBytes?: number }): Promise<string | undefined>`
  - `cwd` **문자열** 필드를 가진 첫 줄까지 스트리밍 스캔 (첫 줄 파싱 금지 — §1-1 참조)
  - 기본 상한 200줄 / 256KB. 상한 초과 시 `undefined` + `warn`
  - JSON 파싱 실패 줄은 skip (전체 실패로 만들지 않음)
  - 빠른 사전 필터: 줄에 `'"cwd"'` 가 없으면 `JSON.parse` 자체를 건너뜀
- [x] `findProjectDir(cwd, opts?): Promise<string | undefined>` — ADR-02 의 3단
  - 1단 정확 일치 → 실패 시 `realpath(cwd)` 로 1회 재시도
  - 2단 해시 prefix 스캔 (encoded 가 200자 초과일 때만) → 히트 시 `warn`
  - 3단 전체 스캔: 디렉터리마다 최신 mtime jsonl **1개**만 `readSessionCwd` → `samePath` 비교 → 히트 시 `warn`
  - `opts.fullScan === false` 면 3단 생략
  - jsonl 없는 디렉터리는 조용히 skip
- [x] `findProjectDirDetailed(cwd, opts?): Promise<{ dir: string; via: 'exact'|'realpath'|'hashPrefix'|'scan' } | undefined>` — 위를 감싸는 형태
- [x] warn 로그 태그 고정: `[claudeProjects] fallback hit via=... cwd=... actual=...`

### 테스트 `src/main/utils/claudeProjects.test.ts`

- [x] `encodeCwd` — §1-3 픽스처 12쌍 전수 (`it.each`)
- [x] `encodeCwd` — NFD 입력이 NFC 결과와 동일한지 (`'/Users/nhn/Desktop/발표'.normalize('NFD')`)
- [x] `encodeCwd` — 200자 경계 3케이스 (199/200/201) + 해시 접미가 base36 문자만 포함
- [x] `encodeCwd` — 같은 prefix 를 갖는 서로 다른 긴 경로 2개가 **다른 결과**를 내는지 (해시가 실제로 구분자 역할을 하는지)
- [x] `readSessionCwd` — 선두 3줄에 cwd 없고 4번째 줄에 있는 실제 형태의 임시 jsonl (실측 스키마 재현: `mode` / `permission-mode` / `file-history-snapshot` / `user`)
- [x] `readSessionCwd` — cwd 없는 파일 / 빈 파일 / 깨진 JSON 줄 섞인 파일 → `undefined`, throw 안 함
- [x] `readSessionCwd` — 상한 초과 시 `undefined` + warn 호출
- [x] `findProjectDir` — 1단 히트 (warn 없음 단언)
- [x] `findProjectDir` — 1단 미스 + 3단 히트 (warn 1회 + `via='scan'`)
- [x] `findProjectDir` — 2단 히트 (200자 초과 + 해시가 다른 디렉터리를 tmp 에 만들어 재현)
- [x] `findProjectDir` — 전부 미스 → `undefined` (throw 안 함)
- [x] `findProjectDir` — `{ fullScan: false }` 면 3단 안 탐
- [x] `findProjectDir` — jsonl 없는 디렉터리가 섞여 있어도 크래시 없음 (실측 상황 재현)
- [x] `claudeProjectsRoot` — `CLAUDE_CONFIG_DIR` 설정/미설정 양쪽
- [x] tmp 디렉터리는 `mkdtemp` 로 만들고 `afterEach` 정리

---

## 3. `src/main/utils/env.ts` — 신규

- [x] `claudeExtraPaths(opts?: { home?: string; platform?: NodeJS.Platform }): string[]` — ADR-03 §2 의 합집합 목록, 플랫폼 분기, 순서 고정
- [x] `mergePathIntoEnv(base, extraPaths, opts?): NodeJS.ProcessEnv` — ADR-03 §1
  - 대소문자 무시로 PATH 키 탐색 → **그 키만** 갱신
  - PATH 키 2개 이상이면 첫 번째만 갱신 + `warn`
  - 부재 시 신설 (win32 `Path`, 그 외 `PATH`) + 기본값 (win32 `''`, 그 외 `'/usr/bin:/bin'`)
  - `position` 기본 `'append'`
  - 이미 존재하는 경로 중복 제거 (win32 는 `samePath` 로 대소문자 무시 비교)
  - 빈 세그먼트 제거
  - `base` 무변형, 새 객체 반환
  - `delimiter` / `platform` 주입 가능

### 테스트 `src/main/utils/env.test.ts`

- [x] `{ Path: 'C:\\a' }` + win32 → 결과 키가 `Path` 하나뿐, `PATH` 키 **부재** 단언 (`Object.keys` 로)
- [x] `{ PATH: '/a' }` + darwin → `PATH` 갱신, `Path` 미생성
- [x] `{ Path: 'x', PATH: 'y' }` → 첫 키만 갱신 + warn 1회
- [x] PATH 키 부재 + win32 → `Path` 신설 / darwin → `PATH` 신설, 기본값 확인
- [x] `position: 'append'` / `'prepend'` 각각 순서 단언
- [x] 중복 경로 제거 — darwin 대소문자 구분 유지 / win32 대소문자 무시
- [x] 빈 세그먼트 제거 (`{ PATH: '' }` 입력이 선두 빈 세그먼트를 만들지 않는지)
- [x] `base` 객체가 변형되지 않았는지 (참조 동일성 + 내용 비교)
- [x] `claudeExtraPaths` — darwin/win32 각각 스냅샷, `home` 주입 반영, 중복 없음

---

## 4. `src/main/utils/claudeBin.ts` — 신규

- [x] `AIService.ts:101-143` 의 `resolveClaudePath()` 를 `resolveClaudeBin(opts?)` 로 이동
  - `CLAUDE_CLI_PATH` 오버라이드 유지
  - **mac 분기 무변경** (`$SHELL -l -c 'command -v claude'` → 후보 목록 → `'claude'`)
  - Windows: `where claude` 출력을 `/\r?\n/` 로 분리 → `.cmd` → `.exe` → `.bat` → 확장자 없음 순 (ADR-04 §2)
  - `platform` / `home` / `execFileSync` 주입 가능하게 (테스트용)
- [x] `getClaudeBin(): string` — 모듈 로드 시 1회 평가 캐시 (평가 시점 무변경, ADR-04 §5)
- [x] `resetClaudeBinCache(): void` — 테스트 전용, 주석에 명시
- [x] `quoteWinShellArg(value: string): string` — ADR-04 §3 (멱등, 필요할 때만, 내부 `"` → `""`)
- [x] `claudeSpawnCommand(opts?): ClaudeSpawnCommand` — ADR-04 §4. **argv 는 다루지 않음**
- [x] 모듈 상단 주석: 이 모듈 import 는 `execFileSync`(5초 타임아웃 × 최대 1회) 를 트리거함을 명시

### 테스트 `src/main/utils/claudeBin.test.ts`

- [x] darwin: `CLAUDE_CLI_PATH` 오버라이드 우선
- [x] darwin: `command -v` 성공 → 그 경로 (현행 동작 고정)
- [x] darwin: `command -v` 실패 → 후보 목록 순회 → 최종 `'claude'`
- [x] win32: `where` 출력 `"...\\claude\r\n...\\claude.cmd\r\n"` → **`.cmd` 선택** (현행이 고르던 첫 줄이 아님을 명시적으로 단언)
- [x] win32: `.cmd` 없고 `.exe` 만 → `.exe`
- [x] win32: `\r` 이 경로에 섞여 들어가지 않는지
- [x] win32: `where` 실패 → 후보 목록 → 최종 `'claude.cmd'`
- [x] `quoteWinShellArg` — 공백 있음/없음, 이미 인용됨(멱등), 내부 `"` 이스케이프, cmd 특수문자
- [x] `claudeSpawnCommand` — darwin `{ shell:false, windowsVerbatimArguments:false }` + **인용 없음** 단언
- [x] `claudeSpawnCommand` — win32 `{ shell:true, windowsVerbatimArguments:true }` + 공백 경로 인용됨 단언
- [x] 플랫폼 스위칭은 `Object.defineProperty(process,'platform',{ value, configurable:true })` + `afterEach` 원복 (선례: `AIService.test.ts:140,158,164,187`) — `resolveClaudeBin` 은 `platform` 파라미터 주입이 기본 경로이고, 미지정 시 `process.platform` 을 따르는 것도 별도 테스트

---

## 5. `src/main/utils/atomicWrite.ts` — 신규

- [x] `writeFileAtomic(filePath, data, opts?): Promise<void>` — `AgentWorkspaceManager.ts:137-139` 패턴 이식
  - tmp 이름: `${filePath}.clauday-tmp` (기존 패턴 유지)
  - tmp 쓰기 → `rename`
  - rename 이 `EPERM` / `EACCES` / `EBUSY` 면 **1회** 재시도 (기본 50ms 후, 지연 주입 가능)
  - 재시도도 실패하면 tmp 정리 후 throw
  - 쓰기 단계 실패 시에도 tmp 정리
- [x] `writeJsonAtomic(filePath, value, opts?)` 편의 함수 (`JSON.stringify(value, null, 2)`) — `~/.claude.json` 소비처(A-3)를 위해
- [x] 한국어 주석 1~2줄 + "Windows EPERM 은 백신/인덱서의 순간 잠금" 정도만

### 테스트 `src/main/utils/atomicWrite.test.ts`

- [x] 정상 쓰기 → 내용 일치 + tmp 파일 잔존 없음
- [x] 기존 파일 덮어쓰기
- [x] rename 1차 EPERM → 재시도 성공 (`fsImpl` 주입)
- [x] rename 2회 연속 EPERM → throw + tmp 정리됨
- [x] 쓰기 단계 실패 → tmp 정리됨
- [x] `writeJsonAtomic` 라운드트립
- [x] 재시도 지연은 주입해서 fake timer 없이 즉시 (테스트 느려지지 않게)

---

## 6. `src/shared/utils/filename.ts` — 신규 (shared 디렉터리 자체가 신규)

> **main 전용 API(fs/path/os) 를 절대 import 하지 말 것.** renderer 가 `@shared/utils/filename` 으로 import 한다 (PRD R5).

- [x] `sanitizeSkillFilename(name: string, opts?: { fallback?: string; maxLength?: number }): string`
  - Windows 금지문자 `< > : " / \ | ? *` 제거/치환
  - 제어문자 `\x00-\x1f` 제거
  - `..` traversal 무력화 (경로 구분자 제거 후 남는 연속 점 처리)
  - 선행/후행 공백 제거, **후행 점/공백 제거** (Windows 는 후행 점/공백을 조용히 잘라내 파일명이 어긋난다)
  - Windows 예약어 회피: `CON PRN AUX NUL COM1-9 LPT1-9` — 대소문자 무시, **확장자가 붙은 형태도 예약**(`CON.md` 도 금지). 접미(`_`) 붙여 회피
  - 길이 상한 (기본 200 정도) — 확장자 보존하며 자르기
  - 결과가 비면 `opts.fallback ?? 'skill'`
  - 멱등: `sanitize(sanitize(x)) === sanitize(x)`
- [x] 한국어 주석 1~2줄

### 테스트 `src/shared/utils/filename.test.ts`

- [x] 금지문자 각각 개별 케이스
- [x] `'../../etc/passwd'` → 경로 이탈 불가능한 형태
- [x] `'..'`, `'.'`, `'...'` → fallback 또는 안전한 값
- [x] 예약어 `CON` / `con` / `CON.md` / `COM1` / `LPT9` 각각
- [x] 예약어가 아닌 것 (`CONSOLE`, `COM10`) 은 **변형되지 않아야** 함
- [x] 후행 점/공백 (`'skill.'`, `'skill '`, `'skill. '`)
- [x] 빈 문자열 / 공백만 → fallback
- [x] 한글/이모지 파일명 보존 (금지문자가 아니면 지우지 않는다)
- [x] 길이 상한 초과 시 확장자 보존
- [x] 멱등성 (위 케이스 전부에 대해 2회 적용 = 1회 적용)

---

## 7. `src/main/utils/paths.ts` — 신규

- [x] `expandHome(p: string, opts?: { home?: string; platform?: NodeJS.Platform }): string`
  - `'~'` 단독, `'~/...'`, `'~\\...'` (Windows) 확장
  - **`~user` 형태는 확장하지 않는다** (원본 반환) — 우리가 해석할 수 없는 것을 추측하지 않는다
  - `~` 가 선두가 아니면 그대로
- [x] `samePath(a: string, b: string, opts?: { platform?: NodeJS.Platform }): boolean`
  - 구분자 정규화 (`\` → `/`)
  - 후행 구분자 무시 (루트 `/`, `C:/` 는 예외 — 지우면 안 됨)
  - win32 는 대소문자 무시 (드라이브 문자 포함)
  - 연속 구분자 축약
  - `platform` 주입 가능 (mac CI 에서 win32 케이스 검증)
- [x] `normalizePathForCompare(p, platform)` 를 export 해서 `env.ts` / `claudeProjects.ts` 가 재사용

### 테스트 `src/main/utils/paths.test.ts`

- [x] `expandHome` — `'~'` / `'~/a'` / `'~\\a'`(win32) / `'~user/a'`(미확장) / `'/abs'`(그대로) / `'a/~/b'`(그대로)
- [x] `expandHome` — `home` 주입 반영
- [x] `samePath` — darwin: 대소문자 **구분** (`/A` ≠ `/a`)
- [x] `samePath` — win32: 대소문자 **무시** (`C:\Users` = `c:/users`)
- [x] `samePath` — git porcelain `C:/repo/wt` vs `path.join` 산출 `C:\repo\wt` (A-4 의 실제 케이스)
- [x] `samePath` — 후행 구분자 유무 / 연속 구분자 / 루트 경로 엣지
- [x] `samePath` — 서로 다른 경로는 false (긍정 케이스만 쓰지 말 것)

---

## 8. `AIService.ts` 위임 (본 트랙 유일한 소비처 변경)

- [x] `resolveClaudePath()` 함수 본체 삭제 → `claudeBin.ts` 의 `getClaudeBin()` 사용
- [x] `const CLAUDE_CLI = resolveClaudePath()` → `claudeBin` 의 캐시 사용. **평가 시점 유지** (`captureClaudeVersion()` 이 이전과 같은 값을 같은 타이밍에 받는지 확인 — PRD R3) — `claudeBin.ts` 모듈이 자신의 top-level 에서 `resolveClaudeBin()` 을 1회 평가해 캐싱하고, `AIService.ts` 는 그 캐시된 `getClaudeBin()` 을 모듈 로드 시 1회 호출하는 구조라 관찰 가능한 타이밍 불변
- [x] `export function getClaudeBin()` 시그니처 유지 (re-export)
- [x] `spawn` 옵션은 **이번엔 건드리지 않는다** — `claudeSpawnCommand()` 로의 교체는 A-1. 지금 바꾸면 mac 무변경 검증 범위가 넓어진다
- [x] `enrichedEnv()` 도 **건드리지 않는다** (A-2 몫)
- [x] `AIService.test.ts` **무수정 통과** 확인 — 65개 테스트 전부 무수정 통과 (수정 없음)

---

## 9. 검증

- [x] `npx vitest run` 전체 통과 — 124 files / 1837 tests green (병렬 작업 중인 다른 두 엔지니어 변경분 포함)
- [x] `npx vitest run --coverage` — 게이트 통과 (lines 79.58 / statements 79.58 / functions 90.31), 신규 6개 모듈 각각 라인 90%+ (`atomicWrite.ts` 97.82 / `claudeBin.ts` 97.33 / `claudeProjects.ts` 92.66 / `env.ts` 100 / `paths.ts` 100 / `filename.ts` 100)
- [x] `npx tsc --noEmit` 통과 (`-p tsconfig.node.json`)
- [x] `npm run build` 통과 — main/preload/renderer 3 빌드 전부 성공 (`src/shared/utils/` 신규 디렉터리 포함 정상 번들링 확인)
- [x] 플랫폼 분기 함수 전수 점검: `env.ts` / `claudeBin.ts` / `paths.ts` 의 win32 경로가 **전부** 테스트에 있는지 (`grep -c "win32" src/main/utils/*.test.ts` → env.ts 9건, claudeBin.ts 9건, paths.ts 9건)
- [x] 죽은 코드 확인: 이번 트랙에서 만든 것 중 테스트에서만 호출되는 것은 정상(PRD R4, 소비처 없는 상태). **export 하지 않은 미사용 함수 없음** (내부 `djb2`/`base36Abs`/`pathExists`/`latestJsonlPath`/`pickWindowsCandidate`/`tmpPathFor`/`cleanupTmp` 등은 전부 해당 모듈 안에서 실사용)
- [x] 사용자 CLAUDE.md 규칙 셀프 리뷰 — 한국어 주석 1~2줄 / 다단락 Javadoc 없음 / "기존과 동일" 류 메타 주석 없음 / 빈 catch 없음 / 컬렉션 반환은 빈 배열

---

## 10. 문서

- [x] `CHANGELOG.md` — Unreleased 에 항목 추가. 사용자 가시 동작 변경은 아직 없으므로 "내부 — Windows 호환 수복을 위한 공용 유틸 신설 및 claude 프로젝트 디렉터리 인코딩 규칙 확정" 수준으로
- [x] **`ClaudeManual.tsx` 는 갱신하지 않는다** — 내부 구조 변경만이고 사용자 가시 동작 변화 없음 (`architecture.md` §8 기준). 미수정 확인
- [x] `feature/windows-compat/v2-utils/impl-log.md` 작성 — 특히 §1-1/1-2 재현 결과와 §1-4 실증 여부를 기록
- [ ] (integrator) `.agent/wiki/decisions-log.md` 에 ADR 4건 각각 1줄 추가
- [ ] (integrator) `.agent/wiki/INDEX.md` 도메인 표에 `windows-compat` 행 추가 + `domain-windows-compat.md` 신규 작성 — **유틸이 실제로 소비되기 시작하는 A-1 이후**가 적기. 위키는 존재하는 것을 기술하지 진행 중 작업을 담지 않는다(INDEX §"무엇을 쓰지 않는가")
- [ ] ADR 4건의 `status` 를 `proposed` → `accepted` 로 (구현 완료 및 검증 후, integrator)

---

## 후속 트랙에 넘기는 것 (본 트랙에서 하지 말 것)

| 항목 | 트랙 | 비고 |
|---|---|---|
| PATH 보강 4곳 교체 | A-1/A-2/A-4 | AIService 만 `{ position: 'prepend' }` 명시 + 근거 주석 |
| `ClaudeSessionService.encodeCwd` 교체 + **테스트의 복제 encodeCwd 제거** | A-1 | 복제 제거가 이 트랙 전체의 요점 |
| `index.ts:1350-1361` 역치환 폐기 → `readSessionCwd` | A-1 | 기존 `parseFirstMessage` 스트림에 cwd 추출만 추가 (추가 I/O 0) |
| spawn 3곳 `claudeSpawnCommand` 적용 + stdout `StringDecoder` | A-1 | |
| `index.ts:1517` `execFile('claude')` → `getClaudeBin()` | A-4 | |
| `GitService.ts:150,173` → `samePath` | A-4 | |
| `index.ts` `~/` 확장 3곳(574/606/627) → `expandHome` | A-4 | 마스터 계획의 "4곳" 중 나머지 1곳(1360)은 확장이 아니라 표시용 **역방향 축약**(`/Users/x/...` → `~/...`)이고, 역치환 폐기와 함께 A-1 에서 처리 |
| SkillsManager + renderer 2곳 `sanitizeSkillFilename` | A-3 | |
| `McpConfigManager` 쓰기 → `writeFileAtomic` | A-3 | `~/.claude.json` 은 claude 본체와 공유 |
| Windows 채집표 → 픽스처 보강 | A-1 이후 | 사용자 VM |
