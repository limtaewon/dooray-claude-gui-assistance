---
task: v2-workspace-p0
agent: test-engineer
date: 2026-07-30
verdict: PASS
---

# QA Report — v2.0 Workstream C-0: 선행 추출 리팩터 + ClaudeHookRouter

> 범위: renderer 추출 4종(`TaskRow`/`taskStyles`/`DiffPanel`/`FileComparePanel`) + main 추출(`claudeDirSetup`/`ClaudeHookRouter`/`MentionHookHandler` + `index.ts` 재배선). 커밋 전 워킹트리 상태를 검증했다. AC11/AC12(수동 QA)는 브리핑 지시대로 **미실행**으로 명기하고 verdict 판단에서 제외했다.

## 수락 기준 × 검증 매트릭스

| AC | 검증 방법 | 테스트 위치 / 확인 방법 | 결과 |
|---|---|---|---|
| AC1 — `npm run test:run` 전체 통과, 기존 테스트 무수정(예외 1건) | vitest 전체 실행 + `git diff` 로 기존 테스트 파일 수정 범위 확인 | 전체 스위트 | PASS — 131 files / 1942 tests(재검증 시점, 병렬 트랙 포함) 전부 통과. `AgentWorkspaceManager.test.ts` 는 ADR-02 명시 예외(deps seam 주입)로만 수정, 프로덕션 단언 유지 확인 |
| AC2 — `npm run typecheck` (node+web) | tsc 실행 | 전체 | PASS — 0 에러 |
| AC3 — 추출 6블록 텍스트 동일성(허용 변형 4종 외 0) | `git show HEAD:<원본>` baseline 재추출 후 신규 파일과 라인 단위 diff | scratchpad `c0/*.before` vs 신규 파일 | PASS — 6블록 전부 허용 변형만 확인. 예외 1건(`claudeDirSetup.writeHookSettings` 내부 지역변수 `dir`→`hookSettingsDir` 리네임, 매개변수명 `dir` 채택에 따른 불가피한 파생)은 impl-log 에 문서화돼 있고 로직/문자열/분기 순서 불변 — 브리핑이 명시한 "문서화된 예외 1건"과 일치, 추가 위반 0 |
| AC4 — `TaskRow`/`DiffPanel`/`FileComparePanel` 렌더 테스트 | vitest + RTL | `TaskRow.test.tsx`(14) / `DiffPanel.test.tsx`(6) / `FileComparePanel.test.tsx`(3) | PASS — 스냅샷 3종, 태그 클릭 stopPropagation, 빈/파일목록/patch 색상 3분기, 좌우 브랜치+onBack 전부 커버 |
| AC5 — `taskStyles` 테스트 | vitest | `taskStyles.test.ts`(10) | PASS — light/dark 분기, `ffffff`/undefined→`{}`, 캐시 히트 동일 참조, `theme-changed` 후 새 참조, `getWorkflowName` 4단, `WORKFLOW_BG_COLORS` 5키 |
| AC6 — `ClaudeHookRouter` 테스트 | vitest | `ClaudeHookRouter.test.ts`(7) | PASS — first-match, 전부 null 무로그, 미등록 kind warn, 핸들러 예외 전파, dispatch await, resolver throw 후 계속, setHandler 재호출 덮어쓰기 |
| AC7 — `MentionHookHandler` 회귀 테스트(핵심 8케이스+α) | vitest | `MentionHookHandler.test.ts`(27, 이번 QA에서 2건 보강) | PASS — resolve 7종(형제경로 버그 포함)+thunk, 도구 누적/9건초과/버퍼비움, `last_assistant_message` 3형태+content 배열 혼합/문자열 형태(보강), transcript fallback, 세션id 저장, orgId 유무, send→markIdle 순서, send reject 시 markIdle 스킵, 미상 이벤트 무시 |
| AC8 — `claudeDirSetup` 테스트 | vitest | `claudeDirSetup.test.ts`(9) | PASS — hookConfig null 시 `.claude` 미생성, URL/시크릿/matcher, 멱등, port/secret 변경 재기록, trust 4분기+`console.warn` |
| AC9 — `index.ts` 잔여물 0 | `grep -n` 재실행 | `src/main/index.ts` | PASS — `handleClaudeHook`/`turnBuffers`/`extractChannelIdFromCwd`/`composeStopMessage`/`extractAssistantMessage`/`formatToolDetail` 0건. 죽은 import(`HookEventPayload`, `transcriptReader` 2개, `path`의 relative/sep/basename) 확인. 조립부는 주석 2줄 제외 실제 코드 8줄 |
| AC10 — 70% 라인 게이트 유지 | `npm run test:coverage` | 전체 | PASS — 전체 79.81%(재검증 시점 동일) lines / 81.96% branch / 90.45% functions. 신규 main 3종: `claudeDirSetup.ts` 100%, `ClaudeHookRouter.ts` 100%, `MentionHookHandler.ts` 97.97%(보강 후, 이전 94.94%) |
| AC11 — 실채널 수동 QA(멘션→회신→`--resume`) | 수동 | — | **미실행** — 브리핑 지시대로 verdict 제외. characterization 테스트(AC7)로 로직 대체 검증됨 |
| AC12 — Git뷰/태스크뷰 눈 비교 | 수동 | — | **미실행** — 브리핑 지시대로 verdict 제외 |

## 실행 결과

- `npm run test:run` — PASS (131 files / 1942 tests, 워크스페이스 트랙 한정 재실행 시 10 files / 96 tests)
- `npm run typecheck` (node+web) — PASS, 0 에러
- `npm run test:coverage` — PASS. 전체 79.81% lines / 81.96% branches / 90.45% functions (게이트 70/70/80 전부 상회)
- 신규 main 모듈 라인 커버리지: `claudeDirSetup.ts` 100%, `ClaudeHookRouter.ts` 100%, `MentionHookHandler.ts` 97.97%(보강 후)
- 신규 renderer 모듈 라인 커버리지(별도 측정, vitest.config.ts coverage.include 범위 밖이라 게이트 비대상): `TaskRow.tsx` 100%, `taskStyles.ts` 100%, `DiffPanel.tsx` 100%, `FileComparePanel.tsx` 100%
- 홈 디렉터리(`~/.claude.json`) 오염 제거: `AgentWorkspaceManager.test.ts` 실행 전/후 `shasum ~/.claude.json` 동일함을 직접 재현·확인(`5bdbebd9f38a154514a6f28870388a45fdf15030` → 동일)
- 회귀 의심 영역: 없음 — 명시적 기록. 6블록 baseline diff, index.ts grep, 커버리지, 홈오염 재현까지 전부 독립 재검증했고 impl-log 의 서술과 실측이 전부 일치했다.

## 무동작변경 재검 상세

- `taskStyles.ts`/`TaskRow.tsx` — baseline과 라인 단위 diff, 함수 본문·JSX·className 문자열 100% 동일. 유일한 차이는 `export` 키워드, import 추가, memo comparator 승격(조건식 6줄 그대로) — 허용 변형 내.
- `DiffPanel.tsx`/`FileComparePanel.tsx` — JSX·로직·문자열 100% 동일. prop 타입만 ADR-04 가 코드 스니펫으로 직접 지정한 대로 `GitDiffResult`/`GitFileCompare`로 교체(구조적 호환, 호출부 3곳 무수정 확인).
- `claudeDirSetup.ts` — `writeHookSettings`/`preApproveTrust` 본문·분기·`console.warn` 문구/위치 100% 동일. 유일한 이탈은 지역변수 리네임 1건(브리핑이 언급한 "문서화된 예외").
- `MentionHookHandler.ts` — `composeStopMessage`/`extractAssistantMessage`/`formatToolDetail` 3개 순수 함수는 baseline과 완전 동일(export 키워드, `pathBasename`→`basename` 리네임 제외). `resolve`/`handle`은 ADR-01이 사전 설계한 시그니처 전환(클래스 메서드 + route 래핑)이라 텍스트 동일성 대상이 아니지만, 내부 로직·분기 순서·문자열을 라인 단위로 재대조해 전부 일치 확인.
- `index.ts` — 삭제 대상 6개 심볼 grep 0건, 조립부(`hookRouter`/`mentionHookHandler` 생성 및 등록) 재검토 결과 `getAgentRoot`가 값이 아닌 thunk(`() => agentWorkspace.getAgentRoot()`)로 주입돼 있어 `setRoot()`가 조립 이후(`createWindow()` 내부, :270)에 실행되어도 커스텀 root가 정상 반영됨을 코드로 확인. `hookServer.setHandler((ev) => hookRouter.dispatch(ev))` 배선도 확인.
- `git diff --stat`/`git diff` 로 index.ts, ProjectTaskView.tsx, BranchWorkspace.tsx, index.test.ts 전체를 재확인 — 워크스페이스 트랙 스코프 밖의 변경(터미널 트랙의 `TERMINAL_REORDER`, `termExitInfo`/`TerminalExitPayload` 등)이 같은 워킹트리에 섞여 있음을 재확인했으나 전부 물리적으로 분리돼 있고 워크스페이스 트랙 파일 목록과 겹치지 않음 — impl-log 서술과 일치.

## 보존 대상 결함 2건 — characterization 테스트 고정 확인

1. **형제 경로 오매칭** (`resolve()`, 구 `extractChannelIdFromCwd`) — `<agentRoot>-sibling` 입력 시 `path.relative` 결과가 `'..'`로 나와 `channelId`가 `'..'`이 되는 버그. `MentionHookHandler.test.ts`의 `'agentRoot 의 형제 경로(prefix 매칭 오류) → 현행 동작 고정 (ADR-v2-workspace-p0-05) — 개선은 후속'` 케이스가 실제로 `{ kind: MENTION_HOOK_KIND, id: '..' }`를 단언하며 통과함을 재실행으로 확인. 직접 계산으로도 재현됨(`AGENT_ROOT='/tmp/clauday-agent-root'`, sibling`='/tmp/clauday-agent-root-sibling'` → `startsWith` true → `relative` = `'../clauday-agent-root-sibling'` → 첫 세그먼트 `'..'`).
2. **`send` 실패 시 `markIdle` 스킵** (`handle()`) — `claudayResponder.send()`가 reject하면 `markIdle`이 호출되지 않고 채널이 busy로 남는 버그. `MentionHookHandler.test.ts`의 `'send 가 reject 하면 markIdle 은 호출되지 않고 handle 도 reject 한다 (현행 동작 고정 — ADR-v2-workspace-p0-05, 개선은 후속)'` 케이스가 `mockRejectedValueOnce` + `markIdle` 미호출 + `handle()` reject 전파를 동시에 검증하며 통과함을 재실행으로 확인. 구현부에 `try/finally`가 없어 실제로 예외가 `markIdle` 호출 전에 전파되는 것을 코드 레벨로도 확인.

두 케이스 모두 `it(...)` 설명 문구 자체에 `현행 동작 고정 (ADR-v2-workspace-p0-05) — 개선은 후속`이 명시돼 있어 후속 트랙이 무심코 "고치는" 변경을 넣으면 이 테스트가 실패로 신호를 준다.

## 보강한 테스트 (이번 QA에서 추가)

기존 테스트가 이미 AC1~AC10을 전부 충족했으나, 핵심 회귀 안전망인 `extractAssistantMessage`(멘션 응답 본문 파싱)의 방어적 분기 2개가 미검증 상태였다(라인 커버리지 94.94%). 운영 코드는 건드리지 않고 테스트만 보강했다.

- `src/main/dooray/mention/MentionHookHandler.test.ts`
  - `extractAssistantMessage — content 배열에 순수 문자열 원소가 섞여도 합쳐진다` — `{content:['a', {type:'text',text:'b'}, 'c']}` → `'a\nb\nc'`
  - `extractAssistantMessage — content 가 문자열이면 그대로(trim) 사용` — `{content:'  평문 응답  '}` → `'평문 응답'`
  - 결과: 25 → 27 tests, `MentionHookHandler.ts` 라인 커버리지 94.94% → 97.97%. 전체 스위트/typecheck 재확인 통과.

## 수동 시나리오 (AC11/AC12 — 미실행, 참고용 절차만 기재)

브리핑 지시에 따라 이번 QA 사이클에서는 실행하지 않았다. 후속 integrator/사용자가 그대로 따라갈 수 있도록 plan.md에 있는 절차를 재정리만 해둔다.

**AC11 (main, 멘션 파이프라인)**
1. 두레이 봇 설정 후 실제 채널에서 `@clauday <요청>` 멘션.
2. 터미널이 spawn 되고 claude code 가 작업을 수행하는지 확인.
3. 완료 후 채널에 `[Clauday]` prefix 응답 + `— 사용 도구:` 요약 라인이 오는지 확인.
4. 같은 채널에서 재멘션 시 `claude -r <sessionId>` 로 이어붙는지(= `claudeSessionId` 보존) 로그로 확인.

**AC12 (renderer, 시각 대조)**
1. `npm run dev` 기동.
2. 두레이 태스크 뷰: 목록 렌더/선택 하이라이트/태그 클릭 필터/`+N` 배지/마감일 표기를 리팩터 전(HEAD) 스크린샷과 대조.
3. Git 뷰: 변경사항 탭(DiffPanel)/브랜치 비교/파일 비교(FileComparePanel) 3패널을 폰트·여백·색상 기준으로 대조.
4. 테마 토글 후 태그 칩 색이 즉시 갱신되는지 확인(`theme-changed` 캐시 무효화 생존 확인).

## Verdict

**PASS — 머지 가능** (AC1~AC10 기준. AC11/AC12는 브리핑 지시대로 미실행이며 verdict 판단에서 제외)

근거:
- baseline 텍스트 동일성 재검증 결과 브리핑이 언급한 문서화된 예외 1건(`dir`→`hookSettingsDir`) 외 위반 0건.
- 멘션 회귀 characterization 테스트 27건(핵심 8케이스 포함) 전부 실재하고 통과, 보존 대상 버그 2건 모두 실제로 고정됨을 코드 레벨 재현으로 확인.
- `index.ts` 잔여물 grep 0건, 조립부 8줄, thunk 배선 정상.
- 홈 디렉터리(`~/.claude.json`) 오염 제거를 checksum 재현으로 직접 확인.
- 전체 테스트/typecheck/coverage 게이트 전부 통과, 신규 모듈 커버리지 97~100%.
- 운영 코드는 이번 QA 세션에서 전혀 수정하지 않았다(테스트 파일 1건만 보강).

## 참조

- ADR-v2-workspace-p0-01~05, `feature/workspace/v2-workspace-p0/{prd.md,adr.md,plan.md,impl-log.md}`
- 원본 위치(HEAD `23c043f`): `index.ts:183-298`, `AgentWorkspaceManager.ts:84-143`, `ProjectTaskView.tsx:11-157`, `BranchWorkspace.tsx:805-923`
