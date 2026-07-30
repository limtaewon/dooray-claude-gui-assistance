---
task: v2-utils
agent: test-engineer
date: 2026-07-30
verdict: PASS
---

# QA Report — 공용 유틸 6종 + encodeCwd 실규칙 확정

## 검증 범위

`src/main/utils/**` + `src/shared/utils/filename.ts` + `AIService.ts` 의 `claudeBin` 위임 1건 (커밋 전 워킹트리 상태). 다른 트랙(`terminal/`, `workspace/`) 파일은 열람만 하고 수정하지 않았다.

## 수락 기준 × 검증 매트릭스

| AC (prd.md) | 검증 방법 | 테스트 위치 |
|---|---|---|
| `mergePathIntoEnv` — 대소문자 무시 탐색, 그 키만 갱신 (`Path` 유지, `PATH` 신설 안 함) | vitest unit | `src/main/utils/env.test.ts` |
| PATH 키 부재 시 신설(win32 `Path`/그 외 `PATH`), 중복 키 2개↑ 시 첫 키만 + warn | vitest unit | `env.test.ts` |
| `claudeExtraPaths` 4곳 합집합, 중복 제거, 순서 고정 | vitest unit | `env.test.ts` |
| `resolveClaudeBin` — mac 현행 동일, win32 `where` 다중결과 `\r\n` 분리 + `.cmd`→`.exe`→`.bat` 우선순위 | vitest unit | `src/main/utils/claudeBin.test.ts` |
| `quoteWinShellArg` — 공백 인용, 이미 인용된 값 이중 인용 안 함 | vitest unit | `claudeBin.test.ts` |
| `claudeSpawnCommand` — darwin/win32 각각의 shell/verbatim 플래그, 양쪽 케이스 존재 | vitest unit | `claudeBin.test.ts` |
| `encodeCwd` — 실측 12쌍 전수 | vitest unit (`it.each`) | `src/main/utils/claudeProjects.test.ts` + `__fixtures__/claudeProjectDirs.ts` |
| `encodeCwd` — 200자 초과 시 `slice(0,200)+hash`, 해시 입력은 치환 전 NFC | vitest unit | `claudeProjects.test.ts` (199/200/201 경계 + 같은 prefix 다른 해시) |
| `encodeCwd` — NFD → NFC 정규화 | vitest unit | `claudeProjects.test.ts` |
| `readSessionCwd` — 첫 줄이 아닌 `cwd` 필드 첫 줄 탐색, 상한 초과 시 undefined | vitest unit | `claudeProjects.test.ts` |
| `findProjectDir` 3단(정확일치→realpath재시도→해시prefix→전체스캔) + fallback warn 로그 | vitest unit (실제 tmp 파일시스템 + 실제 symlink) | `claudeProjects.test.ts` |
| `writeFileAtomic` — tmp→rename, EPERM/EACCES/EBUSY 1회 재시도, 실패 시 tmp 정리 | vitest unit (fsImpl 주입 + 실제 파일시스템) | `src/main/utils/atomicWrite.test.ts` |
| `sanitizeSkillFilename` — 금지문자/제어문자/traversal/예약어/후행점공백/길이상한/멱등 | vitest unit | `src/shared/utils/filename.test.ts` |
| `expandHome` — `~`/`~/`/`~\`(win32)/`~user`(미확장) | vitest unit | `src/main/utils/paths.test.ts` |
| `samePath` — 구분자 정규화, win32 대소문자 무시, 후행 구분자 무시, UNC | vitest unit | `paths.test.ts` |
| `AIService.ts` — `claudeBin` 위임 + `getClaudeBin()` 시그니처 유지 + `AIService.test.ts` 무수정 통과 | 회귀 확인 (git diff 로 무수정 확인 + 전체 통과) | `src/main/ai/AIService.test.ts` (수정 없음, 65개 그대로 통과) |
| `npx vitest run` 전체 통과 + 커버리지 게이트(lines 70/statements 70/functions 80) | CLI 실행 | 전체 스위트 |
| `npx tsc --noEmit` 통과 | CLI 실행 | `tsconfig.node.json` |

## 실행 결과

- `npx vitest run` — **PASS** (134 files / 1972 tests, 전부 green — 병렬 작업 중인 terminal/workspace 트랙 변경분 포함)
- `npx vitest run --coverage` — **PASS**. 전체 게이트 lines 79.95 / statements 79.95 / functions 90.45 (기준 70/70/80 모두 충족)
- `npx tsc --noEmit -p tsconfig.node.json` — **PASS**
- `npm run build` — **PASS** (main/preload/renderer 3 빌드 전부 성공, `src/shared/utils/` 신규 디렉터리 정상 번들링)
- 신규 6개 모듈 라인 커버리지 (본 트랙에서 보강 후):
  - `atomicWrite.ts` **100%** (기존 97.82% → 보강)
  - `claudeBin.ts` **100%** (기존 97.33% → 보강)
  - `claudeProjects.ts` **99.33%** (기존 92.66% → 보강, 잔여 1줄은 아래 "의도적 잔여 gap" 참조)
  - `env.ts` **100%** (기존에도 100%, 브랜치 보강)
  - `paths.ts` **100%** (기존에도 100%, 브랜치 보강)
  - `filename.ts` **100%** (기존에도 100%, 브랜치 보강)
  - 전부 PRD G4 "신규 모듈 라인 커버리지 90%+" 를 상회
- 회귀 의심 영역: **없음 — 명시적 기록**. `AIService.ts` 는 git diff 상 `resolveClaudePath()` 함수 본체 삭제 + `getClaudeBin as resolveClaudeBinCached` import 로 교체된 것 외에 다른 변경 없음. mac 후보 목록/순서/`$SHELL -l -c` 로그인 셸 사용/최종 폴백 `'claude'` 가 `claudeBin.ts` 로 바이트 단위로 그대로 이식되었음을 직접 대조 확인. `AIService.test.ts` 는 `git diff` 상 무수정이고 65개 테스트 전부 그대로 통과.

## 테스트 공백 보강 — 무엇을 어디에 추가했는가

engineer 산출물은 이미 상당히 촘촘했다(신규 6개 모듈 173개 테스트, plan.md 체크리스트 대부분 이행). 코드/커버리지 리포트 대조로 실제 미검증 분기를 찾아 아래를 보강:

1. **`findProjectDir` 의 `via='realpath'` 히트 경로가 완전히 미검증**이었다 — ADR-02·R6 가 "mac `/tmp`→`/private/tmp` 심볼릭" 을 명시적 설계 근거로 들었는데도 이 분기를 타는 테스트가 없었다. 실제 tmp 디렉터리에 실제 symlink 를 만들어(mock 없이) 검증하는 테스트를 `claudeProjects.test.ts` 에 추가.
2. **`claudeBin.ts` 의 `pickWindowsCandidate` 최후 수단(확장자 없는 shim 선택)** 이 미검증 — 이 분기가 존재하는 이유(ADR-04: npm 이 까는 sh shim 회피) 자체를 검증하는 테스트가 없어서 추가. `claudeBin.test.ts`.
3. **`paths.ts` 의 UNC 경로(`isUnc` 보존 로직)가 완전히 미검증** — `normalizePathForCompare`/`samePath` 코드에 UNC 전용 분기가 명시적으로 있는데 테스트가 하나도 없었다. `paths.test.ts` 에 추가.
4. **`env.ts`/`paths.ts`/`claudeBin.ts` 의 "opts 생략 시 `process.platform` 기본값 사용" 분기** — 기존 테스트가 전부 `platform` 을 명시적으로 주입해서, `?? process.platform` 우변이 한 번도 실행되지 않았다. `Object.defineProperty(process, 'platform', ...)` 로 양쪽 플랫폼을 강제해 기본값 분기를 닫음(CLAUDE.md 플랫폼 분기 이중 검증 원칙 적용).
5. **`readSessionCwd` 의 "`cwd` 문자열은 포함하지만 JSON.parse 자체가 실패" 분기** — 기존 "깨진 JSON" 테스트는 `"cwd"` 문자열이 없는 줄이라 사전 필터에서 걸러져 `JSON.parse` 호출 자체가 스킵됐다(진짜 catch 블록은 미실행). `"cwd"` 를 포함하되 문법이 깨진 줄로 다시 작성해 실제 `catch` 를 태우는 테스트 추가.
6. **`atomicWrite.ts` 의 `cleanupTmp` 자체 실패(추가 unlink 오류) 를 삼키는 분기** — rename 실패 후 정리 시도한 unlink 마저 실패해도 원래 rename 에러가 가려지지 않는지 검증.
7. **`claudeProjects.ts` 3단 스캔에서 readdir 대상이 디렉터리가 아닌 경우(`latestJsonlPath` 의 ENOTDIR catch)** — root 아래 순수 파일이 섞여도 크래시 없이 스킵하는지 검증.
8. **`filename.ts` — `name` 인자에 `null`/`undefined` 가 (타입 우회로) 들어오는 경우** — IPC 경계를 넘어오는 값은 런타임에 TS 타입이 강제되지 않으므로 방어 코드(`name ?? ''`)가 실제로 동작하는지 검증.

## 의도적으로 남긴 잔여 gap (RETURN 사유 아님)

- `claudeProjects.ts` 124행 — `latestJsonlPath` 의 mtime 조회 루프에서 `readdir` 이후 `stat` 사이 TOCTOU 레이스(파일이 그 사이 사라짐)를 삼키는 `catch`. 실제 파일시스템으로 결정적으로 재현하기 어렵고(레이스 자체가 목적), fs 를 모킹해서 흉내내는 것은 "구현을 흉내내는 테스트" 가 되어 이 트랙의 원칙(구현 복제 금지)과 어긋난다고 판단해 남겨둠. 라인 커버리지 99.33% 로 PRD G4(90%+) 는 이미 충족.
- `env.ts`/`paths.ts` 의 `home ?? homedir()` 완전 생략(빈 `{}` 전달) 조합까지는 개별로 다 닫지 않음 — `platform` 기본값 분기와 `home` 주입 반영은 각각 별도 테스트로 이미 충분히 검증되어 조합 폭발을 만들 실익이 낮다고 판단.

## 코드 검토 중 발견한 사항 (버그 아님 — 참고용 기록)

- `adr-02-project-dir-lookup.md` §결정 은 "1단 realpath 재시도 히트 시 **debug 로그**" 를 명시하지만, 실제 `findProjectDirDetailed` 구현에는 이 경로에 로그 호출이 전혀 없다(2·3단 `warn` 만 존재). 다만 **PRD 의 수락 기준 문구는 "②③ 히트 시 warn 로그" 로 한정**하고 있어 이 debug 로그는 PRD AC 가 아니라 ADR 부기 사항이다. 기능 결함이 아니고(realpath 재시도 자체는 정상 동작, 테스트로 확인 완료), 로그 레벨 하나가 ADR 서술과 어긋나는 수준이라 **RETURN 사유로 보지 않았다**. 다음 트랙(A-1, 실제 소비처 연결 시점)에서 이 fallback 이 실사용되기 시작하면 관측성 관점에서 `console.debug` 한 줄 추가를 고려할 만하다는 점만 기록.

## 수동 시나리오

본 트랙은 유틸 신설 + 위임 1건뿐이고 실제 소비처 교체가 없어(PRD 비목표, A-1~A-4 로 이연) **사용자 가시 동작 변화가 없다**. 그럼에도 회귀 확인 차원에서 아래는 PR 리뷰어가 원하면 재현 가능:

1. `git stash` 없이 현재 워킹트리에서 `npm run dev` 로 앱 기동 → 브리핑/보고서 생성 등 Claude CLI 를 spawn 하는 기능이 기존과 동일하게 동작하는지 확인 (mac 한정, `CLAUDE_CLI` 해석 경로가 `AIService.ts` → `claudeBin.ts` 로 위임되었을 뿐 값은 동일해야 함).
2. 터미널 하단 상태바 또는 로그에 찍히는 claude 바이너리 경로가 위임 전/후 동일한지(`getClaudeBin()` 반환값) 육안 대조.
3. Windows 실기 검증은 본 트랙 스코프 밖(PRD 비목표) — 사용자 VM 확보 후 후속 트랙(A-1~A-4)에서 `where claude` 다중 결과 환경의 `.cmd` 우선 선택, 공백 포함 설치 경로 등을 실기로 확인 필요.

## Verdict

**PASS** — 머지 가능. PRD 수락 기준 전항목 테스트로 검증됨. `npx vitest run` 1972/1972 통과, 커버리지 게이트 통과, `tsc --noEmit` 통과, `npm run build` 통과. 신규 6개 모듈 라인 커버리지 전부 99.3%~100%. 운영 코드는 수정하지 않았고(테스트 파일만 추가/보강), engineer 산출물에서 기능적 버그는 발견되지 않았다.

## 참조

- ADR-v2-utils-01 (`adr.md`), ADR-v2-utils-02 (`adr-02-project-dir-lookup.md`), ADR-v2-utils-03 (`adr-03-env-path-merge.md`), ADR-v2-utils-04 (`adr-04-claude-bin.md`)
- `feature/windows-compat/v2-utils/impl-log.md`, `plan.md`, `prd.md`
