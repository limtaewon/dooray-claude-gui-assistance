---
task: harness-studio-edit-m0-m1
agent: main-process-engineer
date: 2026-06-22
---

# Impl Log — Harness Studio 편집 M0(shared 타입/IPC) + M1(정적 출처추적)

## 변경한 파일

### 신규
- `src/shared/types/harness-edit.ts` — 편집 기능 공용 타입 (AgentSourceMap, DraftFileEdit, HarnessDraft, DraftDiffSummary, AIEditProposal, BackupEntry 등 한국어 문서주석 포함)

### 수정
- `src/shared/types/ipc.ts` — `HARNESS_READ_FILE`/`HARNESS_DIFF_DRAFT`/`HARNESS_APPLY_DRAFT`/`HARNESS_AI_EDIT`/`HARNESS_LIST_BACKUPS`/`HARNESS_RESTORE_BACKUP` 6개 채널 추가 (`harness:edit:*` 네임스페이스, 기존 채널 불변)
- `src/shared/types/ai.ts` — `AIModelConfig` 에 `harnessEdit?: AIModelName` 추가
- `src/main/harness/BundleScanner.ts`
  - `import AgentSourceMap` from `harness-edit.ts`
  - `RawBundle` 에 `agentSourceMap: AgentSourceMap` 필드 추가 (append-only)
  - `scan()` 내 `sourceMapBuilder` 맵으로 병합 시점에 nameFile/modelFile/toolsFile 출처 기록
  - `return` 에 `agentSourceMap: Object.fromEntries(sourceMapBuilder)` 추가
- `src/main/harness/HarnessNormalizer.test.ts` — `makeRawBundle` 픽스처에 `agentSourceMap: {}` 추가 (새 필수 필드 대응)
- `src/main/harness/__tests__/BundleScanner.test.ts` — AgentSourceMap M1 출처 추적 테스트 17개 추가

## 결정 사항

### AgentSourceMap 설계
- `nameFile`: 항상 존재 (에이전트 id 가 정의된 파일). 최초 정의 파일 = nameFile.
- `modelFile`: `fm.model !== undefined` (parseFrontmatter 가 undefined 반환) 이면 해당 relPath, 없으면 undefined.
- `toolsFile`: `fm.tools.length > 0` 이면 해당 relPath, 없으면 undefined.
- 중복 id 처리: tools 보강 시 toolsFile 갱신, model 보강(absent→static) 시 modelFile 갱신. 기존 agentStubs 병합 로직과 동일 조건.
- `Object.fromEntries(sourceMapBuilder)` 로 Map → plain object 변환하여 직렬화(IPC/JSON) 호환.

### RawBundle append-only 원칙
- 기존 필드(agentStubs/gates/hooks/templates 등) 시그니처·값 불변.
- `toSummary` 는 `RawBundleSummary` 만 반환 — agentSourceMap 포함하지 않음 (기존 IPC 응답 영향 없음).
- read-only 기능(HarnessNormalizer/HarnessService/HarnessCache)은 agentSourceMap 을 무시해도 동작 100% 동일.

### IPC 채널 명명
- `harness:edit:*` 네임스페이스: 기존 `harness:*` 와 명확히 구분.
- 각 채널 JSDoc 에 요청/응답 타입 + 처리 순서 + 제약 기록.
- HARNESS_AI_EDIT 의 AI_PROGRESS 재사용 결정: 신규 push 채널 없이 requestId 로 구분.

### frontmatter model 키 판정
- `parseFrontmatter` 가 `model: undefined` 를 반환하면 "키 부재" 로 판단.
- `fm.model !== undefined` 체크로 키 자체의 유무를 구분 (빈 값 `model: ` 은 undefined 로 파싱됨 — extractScalar 가 빈 값을 undefined 반환하는 기존 동작 재사용).

## 제약 (하지 말 것)

- **toSummary 시그니처 변경 금지**: agentSourceMap 을 RawBundleSummary 에 넣지 말 것. IPC 응답 크기와 기존 renderer 코드에 영향을 줌. agentSourceMap 은 HARNESS_READ_FILE 응답(M3)에서만 노출.
- **agentStubs 값 변경 금지**: SourceMap 추출은 병렬 맵(`sourceMapBuilder`)에서만 이루어져야 함. agentStubMap 의 model/tools/modelSource 값은 기존 로직 그대로.
- **modelFile 조건 변경 주의**: `fm.model !== undefined` 가 "키 존재" 의 유일한 신호. parseFrontmatter 동작이 바뀌면 재검증 필요.
- **IPC 채널 상수 문자열 변경 금지**: 이미 정의된 채널 키의 문자열값을 변경하면 preload/handler/renderer 3곳 동시 업데이트 필요.

## 검증 결과

- `npm run typecheck` — 오류 0 (node+web tsconfig 양쪽)
- `npm run test:run` — 94 test files, 1309 tests, 전량 passed
- `BundleScanner.test.ts` — 49 tests passed (기존 32 + 신규 17)
- 회귀: HarnessNormalizer.test.ts 33 tests passed (makeRawBundle 픽스처 agentSourceMap 추가로 대응)

## 참조

- `docs/planning/harness-studio-edit-arch.md` §2.2 SourceMap 설계
- `docs/planning/harness-studio-edit-plan.md` M0/M1 체크리스트
- ADR-harness-studio-edit-001 (file-centric draft)
- ADR-harness-studio-edit-003 (구조화 폼 범위)
