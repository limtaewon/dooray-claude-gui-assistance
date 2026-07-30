---
task: v2-utils
agent: main-process-engineer
date: 2026-07-30
---

# Impl Log — 공용 유틸 6종 + encodeCwd 실규칙 확정

## 변경한 파일

- `src/main/utils/claudeProjects.ts` (신규) — `encodeCwd`, `claudeProjectsRoot`, `readSessionCwd`, `findProjectDir`, `findProjectDirDetailed`
- `src/main/utils/claudeProjects.test.ts` (신규, 37 tests)
- `src/main/utils/__fixtures__/claudeProjectDirs.ts` (신규) — ADR 실측 채집표 12쌍 + 경계 케이스 5개
- `src/main/utils/env.ts` (신규) — `claudeExtraPaths`, `mergePathIntoEnv`
- `src/main/utils/env.test.ts` (신규, 14 tests)
- `src/main/utils/claudeBin.ts` (신규) — `resolveClaudeBin`, `getClaudeBin`, `resetClaudeBinCache`, `quoteWinShellArg`, `claudeSpawnCommand`
- `src/main/utils/claudeBin.test.ts` (신규, 24 tests)
- `src/main/utils/atomicWrite.ts` (신규) — `writeFileAtomic`, `writeJsonAtomic`
- `src/main/utils/atomicWrite.test.ts` (신규, 8 tests)
- `src/main/utils/paths.ts` (신규) — `expandHome`, `samePath`, `normalizePathForCompare`
- `src/main/utils/paths.test.ts` (신규, 19 tests)
- `src/shared/utils/filename.ts` (신규, `src/shared/utils/` 디렉터리 자체가 신규) — `sanitizeSkillFilename`
- `src/shared/utils/filename.test.ts` (신규, 46 tests)
- `src/main/ai/AIService.ts` (수정) — `resolveClaudePath()` 인라인 구현 삭제, `claudeBin.ts` 의 `getClaudeBin()` 으로 위임. `AIService.test.ts` 무수정 통과
- `CHANGELOG.md` (Unreleased 섹션 신설, 항목 추가)
- `feature/windows-compat/v2-utils/plan.md` (체크박스 갱신)

소비처 교체는 전부 후속 트랙(A-1~A-4) 몫이라 손대지 않음. `src/main/index.ts` 무수정.

## §1-1/1-2 재현 결과 (adr.md 검증)

이 개발 환경 자체가 실제 claude CLI 가 설치된 mac 이라, ADR 의 실측을 동일 데이터로 재현할 수 있었다.

- `~/.claude/projects` 26개 디렉터리 (ADR 작성 시점 25개 + 본 세션이 만든 항목 1개 자연 증가).
- 스크래치패드에 `encodeCwd` 와 동일 로직(NFC → `[^a-zA-Z0-9]`→`-`) + `readSessionCwd` 와 동일 스캔 로직(첫 줄이 아니라 `cwd` 문자열 필드를 가진 첫 줄)을 재구현해 26개 디렉터리 전수 대조 → **cwd 복원 가능 12개 전부 일치, 불일치 0**. ADR 수치와 정합.
- 결정적 표본 2개(`/Users/nhn/.claude` → `-Users-nhn--claude`, `/Users/nhn/Desktop/발표` → `-Users-nhn-Desktop---`) 실제 디렉터리 목록에 존재 확인.
- `which claude` → `~/.local/bin/claude` → 심볼릭 실체 `~/.local/share/claude/versions/2.1.220`. `claude --version` = `2.1.220 (Claude Code)` — ADR 채집 시점과 동일 버전.
- `strings -n 6 <실체> | grep -F 'a-zA-Z0-9]/g,"-"'` 로 리터럴 `[^a-zA-Z0-9]/g,"-")` 존재 확인 + djb2 시프트 패턴 `<<5)-` 도 바이너리 내 존재 확인(3건 매치). 단, 변수명 단위(`RA`/`iRt`/`art`/`o0h`/`Fd`/`GR`) 역참조까지는 본 트랙 스코프상 생략 — PRD 지시("adr 에 확정된 실규칙 그대로")에 따라 ADR 결과를 그대로 신뢰.

## §1-4 (P2, 200자 캡 실증) — 미실행

200자를 넘는 실제 cwd 로 claude 를 구동해 캡+해시 디렉터리가 생기는지 실증하는 단계는 스코프 밖으로 남겨뒀다. PRD R2 에 명시된 대로 소스 근거(claude 바이너리에서 추출한 `RA()` 함수)만으로 구현했고, 실측 검증은 후속(v2.0 Workstream C 워크트리가 실제로 200자에 도달하는 시점)으로 넘긴다.

## 결정 사항 (해야 할 것)

- `encodeCwd`/`readSessionCwd`/`findProjectDir` 는 ADR-01/02 문면을 그대로 구현. 테스트 픽스처는 ADR 채집표를 손으로 재계산하지 않고 그대로 옮겼다(구현 복제 금지가 이 트랙의 요점).
- `mergePathIntoEnv`/`claudeExtraPaths` 의 win32 후보 경로 생성에 `path.join`(런타임 플랫폼 바인딩) 대신 `path.win32.join`/`path.posix.join` 을 명시적으로 골라 썼다 — `platform` 옵션 주입이 mac CI 에서도 실제로 win32 구분자를 내도록 하기 위함. `claudeBin.ts` 도 동일 패턴.
- `claudeBin.ts` 의 `getClaudeBin()` 은 **모듈 로드 시 top-level 에서 즉시 평가**(`let cachedBin = resolveClaudeBin()`)해 캐싱한다. lazy 캐시가 아님 — ADR-04 §5 의 "AIService 로드 시 이미 확정" 관찰 가능한 성질을 그대로 보존하기 위한 선택. `resetClaudeBinCache(opts?)` 는 테스트가 platform/env 를 바꾼 뒤 캐시를 강제로 재평가하는 용도로만 존재.
- `AIService.ts` 의 위임은 import 1줄 + 함수 본체 삭제뿐이고, `enrichedEnv()`/spawn 옵션(`shell`/`windowsVerbatimArguments`)/`runClaudeStream` 의 Windows-Mac 분기는 전혀 건드리지 않았다. `AIService.test.ts` 65개 전부 무수정 통과로 확인.
- `atomicWrite.ts` 는 fs 구현을 `opts.fsImpl` 로 주입 가능하게 열어 rename EPERM/EACCES/EBUSY 재시도 경로를 실제 파일시스템 mock 없이 순수 함수 레벨에서 재현 가능하게 했다. 정상 경로(쓰기/덮어쓰기/JSON 라운드트립)는 `mkdtemp` 실제 파일시스템으로 검증.
- `findProjectDir` 3단(전체 스캔)은 디렉터리마다 **최신 mtime jsonl 1개만** 읽는다(ADR-02 §2 비용 상한). jsonl 이 없는 디렉터리는 `latestJsonlPath` 가 `undefined` 를 돌려주고 조용히 skip — 실측 상 절반 가까운 디렉터리가 `cwd` 를 못 준다는 전제를 그대로 반영.
- `sanitizeSkillFilename` 은 forbidden 문자(`< > : " / \ | ? *`)는 `_` 로 치환하고 제어문자(`\x00-\x1f`)는 완전 제거로 구분했다 — 전자는 사용자가 눈으로 보고 원인을 유추할 수 있게, 후자는 애초에 표시 의미가 없어서.

## 제약 (하지 말 것)

- **`src/main/index.ts` / `ClaudeSessionService.ts` / `TerminalManager.ts` / `ClaudeChatService.ts` / `AgentWorkspaceManager.ts` 의 소비처 교체는 이 트랙에서 하지 않았다.** 후속 A-1~A-4 몫 — 이유: 병렬로 다른 두 엔지니어가 같은 워킹트리에서 `index.ts`/`TerminalManager.ts` 등을 건드리고 있어 충돌 위험, 그리고 PRD 비목표로 명시.
- **`mergePathIntoEnv`/`claudeExtraPaths`/`writeFileAtomic`/`sanitizeSkillFilename` 은 현재 아무도 호출하지 않는 죽은 코드다.** 의도된 상태(PRD R4) — 소비 전에 미리 지우거나 "혹시 몰라서" 다른 곳에 끼워 넣지 말 것. 소비 시점은 A-1~A-4.
- **`claudeSpawnCommand()` 에 argv 조립 로직을 추가하지 말 것.** ADR-04 §4 가 명시적으로 경계를 "command + spawn 플래그"로 좁혀뒀다. `AIService.runClaudeStream` 의 Windows `--append-system-prompt` → stdin combine 로직은 이 함수의 책임이 아니고, 여기 섞는 순간 CLAUDE.md 함정 1("양쪽 일관성의 함정")을 그대로 재현하게 된다.
- **`encodeCwd` 에 realpath/fs 접근을 넣지 말 것.** 순수 함수로 유지해야 테스트·재사용이 유지된다(ADR-01 §5). 심볼릭 링크 보정은 `findProjectDir` 의 1단 재시도가 전담.
- **디렉터리명 → 원본 경로 역치환 함수를 다시 만들지 말 것.** ADR-01 §4 가 영구 폐기를 결정했다. 원본 cwd 가 필요하면 항상 `readSessionCwd(jsonlPath)` 로 jsonl 을 읽는다.

## 참조

- ADR-v2-utils-01 (`adr.md`) — encodeCwd 실규칙
- ADR-v2-utils-02 (`adr-02-project-dir-lookup.md`) — findProjectDir 3단
- ADR-v2-utils-03 (`adr-03-env-path-merge.md`) — mergePathIntoEnv/claudeExtraPaths
- ADR-v2-utils-04 (`adr-04-claude-bin.md`) — claudeBin 단일 출처
