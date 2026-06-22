# Harness Studio — 편집(저작) 기능 마일스톤 계획

> 대상: `harness-studio-edit-arch.md` + ADR-edit-001/002/003
> 작성: architect (Clauday) · 2026-06-22
> 원칙: read-only 회귀 0 (편집 모드 OFF = 기존 동작 100% 보존). 각 마일스톤은 의존 순서. DOD = vitest 70% 라인 커버리지 + ClaudeManual 갱신(사용자 가시 기능).

엔지니어는 이 체크리스트를 위에서 아래로 따른다. `[순수]` 표기 모듈은 vitest 단위 테스트를 동봉(전기-마일스톤 게이트). 각 마일스톤 끝에 `npm run build` 타입 통과 + 기존 harness 테스트 전량 green 확인.

---

## M0 — 타입/스캐폴드 (shared · 의존 없음)

- 도메인: shared · 담당: executor (sonnet)
- [ ] `src/shared/types/harness-edit.ts` 신규: `DraftFileEdit`, `HarnessDraft`, `DraftDiffSummary`, `AgentSourceMap` 정의 (한국어 문서 주석)
- [ ] `src/shared/types/ipc.ts` 에 `HARNESS_READ_FILE`/`HARNESS_DIFF_DRAFT`/`HARNESS_APPLY_DRAFT`/`HARNESS_AI_EDIT`/`HARNESS_LIST_BACKUPS`/`HARNESS_RESTORE_BACKUP` 추가 (`harness:edit:*` 네임스페이스)
- [ ] `src/shared/types/ai.ts` `AIModelConfig` 에 `harnessEdit?: AIModelName` 추가
- 산출물: 컴파일되는 타입. 테스트: 타입 전용이라 별도 단위테스트 불요(타입체크가 게이트)
- 리스크: 없음(append-only)

## M1 — 정적 출처 추적 (main · SourceMap)

- 도메인: main · 담당: executor (sonnet)
- 의존: M0
- [ ] `src/main/harness/BundleScanner.ts` `RawBundle` 에 `agentSourceMap: AgentSourceMap` 추가 (append-only)
- [ ] frontmatter 병합 시점(L466~491)에서 `name`/`model`/`tools` 가 **어느 relPath 에서 왔는지** 기록 (frontmatter.ts 가 키 존재 여부를 반환하도록 보강 필요 시 함께)
- [ ] `RawBundleSummary`/`toSummary` 는 기존 시그니처 유지(회귀 0). SourceMap 은 `HARNESS_READ_FILE` 응답으로만 노출
- 산출물: 출처 파일 추적되는 RawBundle. 테스트: `BundleScanner.__tests__` 에 reined(`_agents` model 출처)·neon(`SKILL.md` model 부재) 케이스 추가. **기존 BundleScanner 테스트 전량 green 필수**
- 리스크: 병합 로직 변경이 read-only 모델에 영향 → 출처 추적은 별 맵으로 분리, 기존 stub 값 불변 유지

## M2 — 폼 편집 순수 로직 (renderer 순수함수, UI 전)

- 도메인: renderer(순수) · 담당: executor (sonnet) + test-engineer
- 의존: M0, M1
- [ ] `edit/editMap.ts` [순수]: `(model, sourceMap) → 필드별 {editable, target:{relPath,locator}, mode:'form'|'raw'|'ai'|'lock'}` (ADR-edit-003 매핑표 구현)
- [ ] `edit/applyFieldEdit.ts` [순수]: `(fileText, fieldPath, newValue) → newFileText`. frontmatter `model:` 치환/신규추가, `tools:`/`allowed-tools:` 리스트 치환. CRLF/BOM 보존
- [ ] `edit/draftReducer.ts` [순수]: draft 누적/같은 파일 재편집 갱신/되돌리기/충돌표시 리듀서
- [ ] `edit/pickEditTargets.ts` [순수]: NL 명령 + model → AI 편집 대상 relPath 추정(에이전트명/게이트 페이즈 매칭)
- 산출물: 순수 로직 + `edit/__tests__/` 4개 테스트 파일. 테스트: model 신규추가/치환, 리스트 치환, 멱등성, CRLF 보존, 모호 명령 폴백
- 리스크: frontmatter 치환이 다양한 YAML 스타일(folded/literal description 인접)에서 깨질 수 있음 → 실제 reined/neon frontmatter 표본을 fixture 로

## M3 — 쓰기 게이트 + 백업 + 적용 파사드 (main)

- 도메인: main · 담당: deep-executor (opus, 안전 핵심) + test-engineer
- 의존: M0, M1
- [ ] `src/main/harness/pathGate.ts` `assertWritablePath(bundleRoot, relPath)` 추가 [순수에 가까움, fs.realpath만] — `..` 거부 / 확장자 화이트리스트 / bundleRoot 하위 강제 / 신규파일은 부모 realpath 검증
- [ ] `src/main/harness/backup.ts`: 백업 경로 계산(순수, sanitize bundleName) + 원본 복사. [순수] 경로 계산부 분리 테스트
- [ ] `src/main/harness/draftDiff.ts` [순수]: `baseContent↔draftContent` → 변경/추가 줄 수 + 충돌(sha 대조) 요약
- [ ] `src/main/harness/HarnessEditService.ts`: `readFile`/`diff`/`apply`/`listBackups`/`restore`. apply = 게이트→STALE대조→백업→temp-write+rename→cache clear→`normalize(force=true)`
- 산출물: 적용 파사드 + 테스트(임시 디렉터리 주입). 테스트: 경로탈출(`..`/심링크) 거부, 확장자 거부, STALE 거부, 백업 생성, 부분실패 복원, 재정규화 호출
- 리스크: TOCTOU/심링크 우회 → security-reviewer 리뷰 필수. `.sh` 비실행 단언 테스트 포함

## M4 — AI 편집제안 (main · AIService)

- 도메인: main(ai) · 담당: executor (sonnet) + test-engineer
- 의존: M0, M2(pickEditTargets), M3
- [ ] `src/main/ai/harnessEditPrompt.ts` [순수]: proposeEdit system/user 프롬프트 빌더(전체 파일 JSON 출력 계약, relPath 화이트리스트 지시)
- [ ] `src/main/ai/AIService.ts` `proposeEdit(command, targetFiles, requestId)` 추가 — `buildArgs`+`pickModel('harnessEdit','sonnet')`+`runWithProgress` 재사용. **runClaudeStream 분기 손대지 않음**. lenient JSON 파싱 + relPath 화이트리스트 교집합만 채택 + 입력 40KB 상한
- 산출물: proposeEdit + 테스트. 테스트: **Windows/Mac 양쪽 platform 분기**(CLAUDE.md 함정 #2, `Object.defineProperty(process,'platform',...)`), JSON 파싱 실패 degradation, 화이트리스트 외 relPath 드롭, 입력 초과 에러
- 리스크: AI 가 화이트리스트 밖 파일 제안 → 교집합 필터 단언. 큰 system prompt Windows stdin 경로 → 양쪽 테스트

## M5 — IPC 배선 (main + preload)

- 도메인: main + preload · 담당: executor (sonnet)
- 의존: M3, M4
- [x] `src/main/index.ts`: `HarnessEditService` 인스턴스화(`getHarnessService` 와 동일 lazy 패턴, userData 주입) + 6개 `ipcMain.handle` 등록
- [x] `src/preload/index.ts`: `api.harness.edit.{readFile,diff,apply,aiPropose,listBackups,restore}` contextBridge 노출
- [x] AI 편집 진행률은 기존 `AI_PROGRESS`/`useAIProgress` 재사용(requestId)
- 산출물: 동작하는 IPC. 테스트: 핸들러 핵심 로직은 HarnessEditService 에 있어 M3 에서 커버. 배선은 수동 스모크
- 리스크: 핸들러에서 입력 검증 누락 → HarnessEditService 가 게이트하므로 핸들러는 위임만

## M6 — 편집 모드 UI (renderer)

- 도메인: renderer · 담당: designer (sonnet) + executor
- 의존: M2, M5
- [ ] `HarnessStudioView.tsx`: `editMode` 토글 + `edit` 탭(기본 OFF, 회귀 0). draft 1건+ 시 헤더 "변경 N개 · 적용/취소" 배지
- [ ] `edit/EditPanel.tsx` 셸(파일트리/필드폼 · Monaco · draft 목록)
- [ ] `edit/StructuredFieldForm.tsx`: editMap 기반 [FORM] 필드(model 드롭다운/tools 멀티셀렉트), 편집불가 필드는 읽기전용+안내
- [ ] `edit/RawFileEditor.tsx`: `@monaco-editor/react`(기존 deps) 파일 원문 편집
- [ ] `edit/DraftDiffView.tsx`: Monaco `DiffEditor` relPath별 + 파일별 승인/되돌리기
- [ ] `edit/AICommandBar.tsx`: NL 입력 → aiPropose → 제안 diff 모달(2단계 승인)
- [ ] `edit/ApplyDialog.tsx`: 백업 안내 + `.sh` 변경 빨간 경고 + 충돌 차단
- [ ] `edit/BackupRestorePanel.tsx`: listBackups → restore
- 산출물: 편집 UI + draftReducer/editMap UI 연결. 테스트: 순수로직은 M2 커버, 컴포넌트는 스냅샷/렌더 표본
- 리스크: DS 토큰/테마 준수(design-system.css, useTheme). Monaco DiffEditor 다크/라이트

## M7 — DOD + 회귀 (cross)

- 도메인: cross · 담당: writer + verifier
- 의존: M0~M6
- [ ] `ClaudeManual.tsx` SECTIONS 에 "Harness Studio 편집 모드" 항목(한국어): 편집 토글/구조화 폼 한계/AI 명령/diff 승인/백업 복원
- [ ] `CHANGELOG.md` 차기 버전 항목 + (사용자 가시) `README.md` 점검
- [ ] read-only 회귀: 편집 모드 OFF 에서 기존 8뷰/scan/normalize/dryrun 동작 변경 0 검증
- [ ] 커버리지 70% 게이트 통과(`vitest.config.ts` thresholds)
- [ ] security-reviewer: assertWritablePath 우회/AI relPath 화이트리스트/백업 경로 주입/TOCTOU 리뷰
- 산출물: 매뉴얼+체인지로그+검증 증거. 테스트: 전체 green + 커버리지

---

## 마일스톤 의존 그래프

```
M0 ──┬─ M1 ──┬─ M2 ──┐
     │       └─ M3 ──┼─ M4 ── M5 ── M6 ── M7
     └───────────────┘
```

## 잔여 결정 (사용자 확인 필요)

1. **draft 영속 여부**: 앱 재시작 시 draft 유지할지(현재안: in-memory, 재시작 소멸). 영속하면 `<userData>` 에 draft JSON 저장 필요.
2. **백업 보존 정책**: 무제한 + 수동 정리(현재안) vs LRU/개수 상한/만료.
3. **AI 편집 기본 모델**: Sonnet(현재안) vs 설계 변경급 명령은 Opus 승격 토글 노출 여부.
4. **버전 번호**: 차기 릴리즈를 v1.8 로 둘지(CHANGELOG/README 표기 일관성).
5. **id(name) rename**: 본 범위 제외(LOCK). 별도 후속 기능으로 다중 파일 일괄 치환을 다룰지.
6. **`.sh` 편집 허용 수준**: 텍스트 편집 허용(현재안) vs 게이트 스크립트는 읽기전용으로 더 보수적 차단.
