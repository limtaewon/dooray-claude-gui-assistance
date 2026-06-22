---
task: harness-studio/m10-project-profile
agent: main-process-engineer
date: 2026-06-22
---

# Impl Log — Dry-run 로컬 프로젝트 맥락 기반 레벨 추정

## 변경한 파일

- `src/shared/types/harness-dryrun.ts` (신규) — ProjectProfile / TechStackSignal / ModuleSignal / ScopeSignal 타입 + toPromptText() / profileSignature() 순수 함수
- `src/main/harness/projectProfile.ts` (신규) — gatherProjectProfile() + extractKeywords() 정적 스캔 서비스
- `src/main/harness/__tests__/projectProfile.test.ts` (신규) — extractKeywords / gatherProjectProfile / toPromptText / profileSignature 단위 테스트 (18개)
- `src/main/harness/taskHash.ts` — computeTaskHash() 에 optional `projectContextSig` 인자 추가, 캐시 분리 지원
- `src/main/harness/DryRunEstimator.ts` — IAIServiceForEstimator.estimateLevel 시그니처에 `projectContext?` 추가, estimate() 에 `projectContext?` / `projectContextSig?` 추가
- `src/main/harness/DryRunEstimator.test.ts` — projectContext/Sig 관련 테스트 4개 추가, requestId 어설션 수정
- `src/main/harness/HarnessService.ts` — import 추가, dryrun() 에 optional `projectPath?` 인자 추가, IAIServiceForHarness.estimateLevel 시그니처 갱신
- `src/main/ai/AIService.ts` — estimateLevel() 에 optional `projectContext?` 인자 추가, "## 프로젝트 맥락" 섹션 삽입 로직
- `src/shared/types/ipc.ts` — HARNESS_PICK_DIR: 'harness:pick-dir' 채널 상수 추가
- `src/preload/index.ts` — api.harness.dryrun 시그니처에 `projectPath?` 추가, api.harness.pickProjectDir() 노출
- `src/main/index.ts` — HARNESS_DRYRUN 핸들러 업데이트(projectPath 전달), HARNESS_PICK_DIR 핸들러 신규 등록

## 결정 사항

- `ProjectProfile` 타입을 `src/shared/types/harness-dryrun.ts` 별도 파일에 분리 — harness.ts 가 이미 크고, Dry-run 프로파일은 도메인적으로 독립적.
- `toPromptText()` 와 `profileSignature()` 를 shared/types 에 둔 이유: main 과 test 양쪽에서 순수 함수로 임포트 가능해 의존 역전 없이 사용.
- taskHash 에 projectContextSig 를 포함(= 캐시 분리) — 같은 번들+태스크라도 프로젝트가 다르면 추정 결과가 달라야 하므로 별도 캐시 항목 생성.
- `gatherProjectProfile` 내부의 collectTechStack / collectModules / collectScope 를 Promise.all 로 병렬 실행 — 세 단계가 독립적.
- `CLAUDE.md`/`README.md` 는 fd.read 로 정확히 MAX_HEAD_BYTES(2048) 바이트만 읽음 — 파일 전체 로드 금지.
- `HARNESS_PICK_DIR` 는 scan 용 다이얼로그(HARNESS_SCAN pickDialog)와 별도 채널로 분리 — 목적이 다름(번들 선택 vs 프로젝트 컨텍스트 선택).

## 제약 (하지 말 것)

- `gatherProjectProfile` 는 파일 내용을 package.json / CLAUDE.md / README.md 머리 2KB 외에 절대 읽지 않는다 — 파일트리 walk 는 경로/이름만.
- `AIService.runClaudeStream` 분기(Mac/Windows) 는 수정하지 않음 — projectContext 는 userPrompt 레벨에서만 조합.
- `computeTaskHash` 의 기존 두 인자 호출 패턴을 유지 — projectContextSig 없는 기존 호출은 서명 없이 동작.

## 참조

- CLAUDE.md §AIService.runClaudeStream Windows/Mac 분기 가이드
- src/main/harness/DryRunEstimator.ts — estimate() 캐시 전략
- src/shared/types/harness.ts — DryRunResult / HarnessLevelId
