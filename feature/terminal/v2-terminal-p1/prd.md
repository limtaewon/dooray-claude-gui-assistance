---
task: v2-terminal-p1
domain: terminal, electron-ipc, renderer-only
created: 2026-07-30
date: 2026-07-30
status: draft
---

# PRD — v2.0 Phase 1 · Workstream B 소형 3종 (PTY exit 통지 · 검색 고도화 · 탭 reorder)

## 배경 / 문제

Clauday v2.0 마스터 설계(`~/.claude/plans/toasty-sleeping-simon.md`)의 Workstream B 중 **서로 독립적이고 작은** 3건을 Phase 1 에서 먼저 낸다. 세 건 모두 사용자 보고 기반이고, 뒤이어 오는 B-3/B-4(split pane)·B-5(영속화 v2)의 전제를 오염시키지 않는다.

1. **B-1 죽은 탭 (PTY exit 통지 부재)** — `TerminalManager.create()` 의 `onExit` 은 `sessions.delete(id)` 만 하고 렌더러에 아무것도 알리지 않는다(`src/main/terminal/TerminalManager.ts:150-152`). 셸이 `exit` 하거나 프로세스가 죽어도 탭은 그대로 남고, 사용자는 커서가 깜빡이는 화면에 타이핑하다가 "왜 반응이 없지"를 겪는다. `terminal.input()` 은 세션이 사라졌으므로 조용히 no-op — **silent failure**.
   - 곁가지: `addOutputListener()` 는 등록 인터페이스만 있고 `onData` 에서 **한 번도 호출되지 않는다**(`TerminalManager.ts:84,91-94` ↔ `138-148`). 현재 소비자는 0이지만 `.agent/wiki/domain-terminal.md` 는 "멘션 종료 마커 감지에 사용" 이라고 기술하고 있어 문서-구현 불일치 상태이며, 후속(B-5 스냅샷 트리거·C-2 AgentRunSpawner)이 이 훅을 전제한다.
2. **B-2 검색이 "찾긴 찾는데 몇 개인지 모른다"** — 현행 검색은 `TerminalPane.tsx:514-525, 604-636` 에 인라인으로 박혀 있고 `caseSensitive: false` 고정. 매치 수·현재 위치·정규식·단어 단위·overview ruler 전부 없음. 680줄짜리 `TerminalPane` 이 B-3/B-4 에서 더 커지기 전에 검색부를 떼어내야 한다.
3. **B-8 탭 순서를 바꿀 수 없다** (사용자 보고) — 탭은 생성 순서로 고정. 오래 켜 두는 터미널일수록 순서 정리 요구가 크다.

Orca(stablyai, MIT) 소스 분석에서 세 건 모두에 대해 **이미 검증된 교정 사항**이 나왔다(`docs/dev/orca-absorption-notes.md` §5, §9). 특히 "suppressed exit", "safeFind", "@dnd-kit + 삽입 인디케이터"는 재발명하면 같은 함정을 다시 밟는다.

## 목표 (Goals)

- **G1** — PTY 가 종료되면 1초 이내에 해당 pane 에 종료 오버레이가 뜨고(`세션이 종료되었습니다 (exit N)`) 그 pane 의 키 입력이 PTY 로 나가지 않는다. 오버레이는 **자동으로 사라지지 않는다**(사용자가 닫기 전까지 exit code 와 마지막 출력 보존).
- **G2** — 사용자가 탭/pane 을 **의도적으로** 닫거나 앱이 종료될 때는 종료 오버레이가 뜨지 않는다(suppressed exit). 같은 세션 id 에 대해 exit 통지는 **최대 1회**.
- **G3** — `TerminalManager.addOutputListener` 로 등록한 콜백이 실제로 PTY 출력 청크마다 호출된다. 콜백 1개가 throw 해도 IPC 출력 전송과 다른 콜백은 영향받지 않는다.
- **G4** — 검색바에서 `3/47` 형태의 매치 카운트가 보이고, 매치 1000건 이상은 `>999` 로 표기된다. 대소문자 구분 / 정규식 / 단어 단위 3토글이 동작하고 토글 변경이 즉시 재검색에 반영된다.
- **G5** — 매치가 overview ruler(우측 14px 스트립)에 마커로 표시되고 활성 매치가 구분된다.
- **G6** — 잘못된 정규식·비정상 decoration 등 어떤 검색 실패도 **터미널을 죽이지 않는다**. 실패는 검색바에서 사용자에게 보이고(카운트 자리 대체 표기) `console.warn` 에 sessionId 와 함께 1회 남는다.
- **G7** — 터미널 탭을 드래그해 순서를 바꿀 수 있다. 드래그 중 탭 자체는 움직이지 않고 **2px 삽입 인디케이터**만 이동한다. 더블클릭 이름 변경은 회귀 없이 동작한다(12px 이동 전에는 드래그가 시작되지 않음).
- **G8** — 탭을 닫으면 다음 활성 탭이 **MRU(최근 사용) 스택** 기준으로 선택된다(없으면 오른쪽 → 왼쪽 이웃).
- **G9** — 재배치한 탭 순서가 현행 저장 경로(`terminalSessions`)에 반영되어 앱 재시작 후 복원 순서에 나타난다. 이름 영속화와 **동일한 신뢰도**면 충분(B-5 가 근본 개선).
- **G10** — 세 기능 모두 vitest 단위 테스트 동반. 기존 테스트 계약 3곳(아래 §리스크)이 갱신되어 `npm run test:run` 전체 통과, 커버리지 게이트(라인 70%) 유지.

## 비목표 (Non-goals)

- **split pane (B-4)** — 본 사이클 스코프 아님. `TerminalPane` 의 `isActive` prop 은 **그대로 유지**하고 `isVisible`/`isFocused` 분리(B-3)는 하지 않는다. 종료 오버레이는 "pane 1개 = 탭 1개" 전제에서 동작하면 된다.
- **스크롤백 영속화 v2 (B-5)** — `terminalWorkspaceV2` 스냅샷, `@xterm/addon-serialize`, before-quit flush 프로토콜 모두 스코프 밖. 본 사이클의 순서 영속화는 **현행 `terminalSessions` 경로에 최소 반영**만 하며, `window-all-closed` → `dispose()` → 빈 export 덮어쓰기 기존 버그는 **고치지 않는다**(B-5 소관).
- **WebGL (B-6) / 링크 프로바이더 재작성 (B-7) / IME·유니코드 (B-9)** — 스코프 밖. 단, B-2 가 만드는 `safeFind` 래퍼는 B-7 의 provider guard 와 **같은 계열의 방어**이므로 네이밍/주석에서 서로를 참조만 한다.
- **단축키 레지스트리 (Workstream D)** — 새 단축키를 레지스트리로 등록하지 않는다. `⌘F` 는 현행 `attachCustomKeyEventHandler` 위치를 유지.
- **BranchWorkspace / MentionAgentView 탭의 드래그 reorder** — 미적용(Orca 노트 §5 결론). 두 뷰는 exit 통지만 구독.
- **키보드 드래그(접근성 DnD)** — `@dnd-kit` KeyboardSensor 미탑재. 스크린리더 안내 문구(한국어)만 제공.
- **검색 이력 / 전체 버퍼 검색 결과 목록 패널** — 스코프 밖.

## 수락 기준 (Acceptance Criteria)

### B-1 exit 통지
- [ ] `IPC_CHANNELS.TERMINAL_EXIT`(`'terminal:exit'`)가 shared 카탈로그에 존재하고, `TerminalExitPayload{ id: string; exitCode: number; signal: number | null }` 이 `src/shared/types/terminal.ts` 에 정의된다.
- [ ] main 에서 PTY 가 종료되면 `mainWindow.webContents.send(TERMINAL_EXIT, payload)` 가 1회 발생하고, `terminalManager.addExitListener(cb)` 로 등록한 콜백도 같은 payload 를 받는다(unsubscribe 함수 반환).
- [ ] `terminalManager.kill(id)` 또는 `dispose()` 로 종료된 세션은 `TERMINAL_EXIT` 를 **보내지 않는다**. 이미 종료된 id 에 `kill()` 을 다시 호출해도 suppression 항목이 남지 않는다.
- [ ] 동일 세션의 `onExit` 이 두 번 발화해도 통지는 1회(at-most-once).
- [ ] `addOutputListener` 콜백이 `onData` 마다 `(id, data)` 로 호출된다. 콜백이 throw 해도 `webContents.send` 와 나머지 콜백은 정상 수행되고 warn 로그에 sessionId 가 포함된다.
- [ ] preload 가 `window.api.terminal.onExit(cb)` 를 노출하고 unsubscribe 함수를 반환한다(단일 `ipcRenderer.on` 공유 fan-out — `TERMINAL_OUTPUT` 과 동일 패턴).
- [ ] 종료된 pane 에 오버레이가 뜨고 **자동으로 사라지지 않는다**. 오버레이 표시 중 키 입력/붙여넣기/드래그드롭이 PTY 로 전달되지 않는다.
- [ ] `TerminalView` / `MentionAgentView` / `BranchWorkspace` 3곳이 각각 `onExit` 을 구독하고, 자기 소유 세션의 exit 만 반영한다(다른 뷰 세션 id 무시).
- [ ] 탭 라벨에도 종료 상태가 보인다(디밍 + `종료됨` 표기).

### B-2 검색 고도화
- [ ] 검색 로직이 `useTerminalSearch.ts`(훅) + `TerminalSearchBar.tsx`(뷰) + 순수 헬퍼 모듈로 분리되고 `TerminalPane.tsx` 에서 검색 관련 인라인 상태/JSX 가 제거된다.
- [ ] 매치 카운트가 `현재/전체` 로 표시된다. 전체 0 → `0/0`, 활성 매치 없음 → `-/N`, 1000건 이상 → `N/>999`.
- [ ] `Aa`(대소문자) · `.*`(정규식) · `\b`(단어 단위) 토글이 동작하고, 토글 시 **새 옵션 객체**로 재검색된다(이전 옵션 객체 변이 금지 — 목업 시나리오의 그 버그).
- [ ] 정규식 토글 상태에서 잘못된 정규식을 입력하면 검색바가 오류 상태를 보여주고 터미널은 살아있다.
- [ ] Terminal 옵션에 `overviewRulerWidth: 14` 가 추가되고, 검색 결과 decoration(`matchOverviewRuler` / `activeMatchColorOverviewRuler` 등)이 목업 색상 계열로 지정된다.
- [ ] 2048자를 넘는 쿼리는 잘려서 검색된다(무한 정규식 백트래킹/성능 사고 차단).
- [ ] 검색바를 닫으면 decoration 이 제거되고 터미널 포커스가 복귀한다.
- [ ] IME 조합 중(한글)에는 중간 조합 문자열로 검색이 발화하지 않는다.

### B-8 탭 reorder
- [ ] `@dnd-kit/core`, `@dnd-kit/sortable` 이 dependencies 에 추가된다.
- [ ] 터미널 탭을 드래그하면 삽입 위치에 2px 인디케이터가 표시되고, 드롭 시 순서가 바뀐다. 드래그 중 탭 자체에는 transform 이 적용되지 않는다.
- [ ] 12px 미만 이동으로는 드래그가 시작되지 않는다 → 더블클릭 rename, 닫기(X), 연필 버튼 모두 기존대로 동작한다.
- [ ] 드래그 중 창 포커스를 잃거나 pointerup 을 놓쳐도 인디케이터가 남지 않는다(missed-end fallback).
- [ ] 탭을 닫으면 MRU 스택 기준으로 다음 탭이 활성화된다. MRU 후보가 없으면 오른쪽 → 왼쪽 이웃.
- [ ] 순서를 바꾼 뒤 앱을 재시작하면 복원된 탭이 그 순서로 나타난다.
- [ ] 순수 함수 `moveTab` / `pickNextActiveTab` / `pushMru` / `applySessionOrder` 에 vitest 단위 테스트가 있다.

### 공통 / 회귀
- [ ] 기존 테스트 계약 갱신: `src/main/index.test.ts`(채널 등록 검증 :304-358), `test/helpers/mockWindowApi.ts`(:133-150), `src/main/terminal/TerminalManager.test.ts`(`emitExit` 시그니처).
- [ ] `npx tsc --noEmit` 통과, `npm run test:run` 전체 통과, 커버리지 라인 70% 유지.
- [ ] `ClaudeManual.tsx` 의 `SECTIONS` 에 종료 오버레이 / 검색 고도화 / 탭 드래그가 한국어로 추가되고, 단축키 표가 현실과 맞게 갱신된다.
- [ ] `CHANGELOG.md` 에 항목 추가.

## 영향 도메인

- **terminal** (주) — `TerminalManager`, `TerminalPane`, `TerminalView`
- **electron-ipc** — 채널 2개 신설(`TERMINAL_EXIT` push, `TERMINAL_REORDER` fire-and-forget)
- **renderer-only** — 검색 UI, 탭 DnD, MentionAgentView / BranchWorkspace 구독
- `ai-service` 무관 → **Windows/Mac 분기 검토 대상 아님**. 단 `TerminalManager` 는 플랫폼 분기 코드를 가지고 있으므로 본 변경이 그 분기(`enrichedTerminalPath`, 셸 선택)를 **건드리지 않는다**는 것을 impl-log 에 명시.

## 리스크 / 제약

- **R1. main + renderer 동시 변경** — 두 에이전트가 같은 task 폴더에서 작업. → `plan.md` 에서 파일 소유를 완전히 분리하고, `shared/types` 는 **main 담당이 먼저** 확정한다. `impl-log.md` 는 `## [main-process-engineer] ...` / `## [renderer-engineer] ...` 헤더로 **append 만** 한다(상대 섹션 수정 금지).
- **R2. `src/main/index.ts` 충돌** — A-2(`CLAUDE_START_TASK` :983-995)·A-4(:1517)·C-0(hook 라우팅 :190-298) 트랙이 같은 파일을 만진다. → B-1 은 push 전용이라 **index.ts 변경 0줄**. 본 사이클의 index.ts 변경은 `ipcMain.on(TERMINAL_REORDER)` **1건(3줄)** 뿐이며, 충돌 회피를 위해 `TERMINAL_RESIZE` 등록 직후(≈ :958)에 삽입한다.
- **R3. 죽은 훅 수리의 부작용** — `addOutputListener` 를 실제로 호출하게 만들면 이후 등록되는 소비자가 갑자기 살아난다. → 현재 소비자 0건임을 확인(`grep addOutputListener` 결과 정의부와 테스트뿐). 수리 자체는 무회귀. 다만 콜백은 **동기 호출 + try/catch 격리**로 감싸 PTY 출력 경로를 막지 못하게 한다.
- **R4. `emitExit()` 시그니처 변경으로 기존 테스트 깨짐** — `TerminalManager.test.ts:25,154` 의 mock 은 인자 없이 호출한다. → 프로덕션 코드는 `exitCode ?? 0` 로 방어하고, mock 은 `{ exitCode, signal }` 을 넘기도록 갱신한다(테스트 계약 변경을 impl-log 에 명시).
- **R5. exit 오버레이가 "정상 종료" 에도 뜬다** — `exit` 을 직접 친 사용자에게도 오버레이가 뜬다. 이는 **의도된 동작**(자동 제거 없음 = 사용자 결정으로 닫기). 다만 오버레이에 exit code 0 은 초록 dot, 0 이 아니면 빨강 dot 으로 시각 구분한다(목업 `.dot-ok`).
- **R6. `@dnd-kit` 신규 의존성** — 번들 +약 40KB(min). Electron 데스크탑이라 수용. MIT. 라이선스 고지는 verbatim 복사가 발생할 때만 `THIRD-PARTY-NOTICES.md` 에 등재(공개 API 상속만 하면 미발생 — impl-log 에 어느 쪽인지 기록).
- **R7. 드래그와 rename 더블클릭 충돌** — 사용자 보고에서 가장 아픈 회귀 지점. → 12px + 2샘플 확인 센서 + 버튼류 `pointerdown` stopPropagation. TerminalView.test.tsx 의 rename 테스트가 회귀 게이트 역할.
- **R8. 순서 영속화의 신뢰도 한계** — `window-all-closed` → `dispose()` 이후 `before-quit` 이 빈 배열을 덮어쓰는 기존 버그가 있어 순서/이름 모두 유실될 수 있다. 본 사이클에서 **고치지 않는다**(B-5). 사용자 문서에도 순서 영속화를 과장하지 않는다.
- **R9. 검색 decoration 성능** — 매치 수천 건이면 decoration 생성이 무겁다. → 쿼리 2048자 상한 + 카운트 `>999` 표기. decoration 개수 제한은 xterm 내부 정책에 위임하고, 체감 저하 발견 시 impl-log 에 수치와 함께 기록(후속 튜닝 근거).
- **제약 C1** — `TerminalPane` 의 기존 prop 시그니처(`sessionId`, `isActive`, `initialOutput`)를 **깨지 않는다**. 신규 prop 은 전부 optional.
- **제약 C2** — `AIService` / `ClaudeChatService` / 멘션 파이프라인 파일은 건드리지 않는다.
- **제약 C3** — 작업과 무관한 리팩터·포맷팅 금지(전역 CLAUDE.md §9). `TerminalPane` 에서 옮기는 것은 검색 관련 코드만.

## 참조

- 마스터 설계: `~/.claude/plans/toasty-sleeping-simon.md` — Workstream B (B-1, B-2, B-8), 작업 순서 Phase 1
- `docs/dev/orca-absorption-notes.md` §5(split/탭 설계 교정 — suppressed exit, safeFind, @dnd-kit, MRU), §9(함정 요약 #5)
- UI 목업: `docs/mockups/v2/terminal-split.html` — 검색바(`.searchbar`/`.scount`/`.stoggles`), overview ruler(`.ruler`), 종료 오버레이(`.exit-overlay`/`.exit-badge`), 하단 구현 매핑 노트 3)·4)
- `.agent/wiki/domain-terminal.md`, `.agent/wiki/domain-electron-ipc.md`(IPC 3+1), `.agent/wiki/decisions-log.md`
- 스킬: `.claude/skills/electron-ipc-patterns/SKILL.md`, `.claude/skills/vitest-patterns/SKILL.md`
- 현행 코드: `src/main/terminal/TerminalManager.ts`, `src/main/index.ts:949-977`, `src/preload/index.ts:6-21,364-396`, `src/renderer/src/components/Terminal/{TerminalPane,TerminalView}.tsx`, `src/renderer/src/components/MentionAgent/MentionAgentView.tsx:97`, `src/renderer/src/components/Git/BranchWorkspace.tsx:295-311,664-676`
- ADR: `feature/terminal/v2-terminal-p1/adr.md` (ADR-v2-terminal-p1-01 ~ 05)
