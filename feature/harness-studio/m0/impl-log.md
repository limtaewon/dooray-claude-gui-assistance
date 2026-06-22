---
task: harness-studio/m0
agent: main-process-engineer
date: 2026-06-19
---

# Impl Log — Harness Studio M0 (shared/main 타입 스캐폴드)

## 변경한 파일

- `src/shared/types/harness.ts` (신규)
- `src/shared/types/ipc.ts` (HARNESS_* 7개 채널 추가)
- `src/shared/types/ai.ts` (AIModelConfig 에 harnessNormalize / harnessEstimate 추가)

## 결정 사항

- `HarnessModel.schemaVersion` 초기값은 코드에 명시하지 않고(런타임 초기화 책임은 HarnessNormalizer/M2), 타입에는 `number` 로만 선언해 스키마 단계에서 결합도 낮춤.
- `RawBundleSummary.agentStubs` 는 `Pick<HarnessAgent, 'id'|'displayName'|'model'|'modelSource'|'tools'>` 로 선언해 ScanStep 이 AI 없이 즉시 표시할 수 있는 최소 필드만 포함.
- `DryRunResult.answers` 는 Q 코드를 노출하지 않는 자연어 배열로 선언 — arch §3.2 "Q코드 미노출" 요건 반영.
- `DiscoveredHarness` / `CachedHarnessEntry` 를 별도 인터페이스로 분리해 IPC 응답 타입을 명시적으로 유지.
- `ipc.ts` 의 마지막 상수(`CONFIG_CHANGED`)에 trailing comma 를 추가하고 HARNESS_* 블록을 뒤에 붙여 기존 `as const` 닫기 직전에 삽입 — 기존 컨벤션(마지막 항목 comma 없음) 대신 comma 추가 방식을 택했는데, 기존 파일이 마지막 항목에 comma 없이 끝났으므로 CONFIG_CHANGED 에 comma 를 추가하고 새 블록을 이어 붙임.
- `ai.ts` 에 `harnessNormalize` 기본 모델 근거(Sonnet), `harnessEstimate` 기본 모델 근거(Haiku)를 docstring 에 명시 — 후속 AIService 구현자가 `pickModel` 기본값 설정 시 의도를 알 수 있게.

## 제약 (하지 말 것)

- `HarnessModel` 의 [S] 필드(meta.name/source/bundleHash, agents[].id/tools 등)를 AI 정규화기(HarnessNormalizer)가 덮어쓰면 안 된다 — ADR-001 핵심 불변식.
- `schemaVersion` 변경 시 반드시 기존 캐시 무효화 로직(HarnessCache, M2)과 맞춰 버전 번호를 올려야 한다. 타입만 바꾸고 버전 안 올리면 stale 캐시가 로드된다.
- `DryRunResult` 의 highlightPath / parallelGroups / gates / estTimeRel / estCostRel 는 levelPath 순수함수(M2)가 채우는 필드다 — AI(DryRunEstimator)는 level/answers/rationale 만 채운다. 이 경계를 어기면 결정론 보장이 깨진다.
- `AIModelConfig.harnessNormalize` 는 Windows 플랫폼에서 stdin combine 경로(큰 system prompt)에 영향이 크다. 기본값 변경 시 양쪽 플랫폼 테스트 필수 (CLAUDE.md AIService 분기 가이드).
- renderer 파일은 건드리지 않았다 — preload 노출 / main/index.ts 핸들러 등록은 M1 이후 3+1 규칙에 따라 추가할 것.

## tsc 검증 결과

- `tsconfig.node.json` (`--noEmit`): 에러 없음
- `tsconfig.web.json` (`--noEmit`): 에러 없음
- node_modules 는 `npm install --ignore-scripts` 로 설치(electron-rebuild 미실행 — native 모듈 없어도 타입 검증에는 무관).

## 참조

- ADR-harness-studio-001: HarnessModel 스키마 단일화 & 정적/AI 분담
- `docs/planning/harness-studio-arch.md` §1(스키마), §4(IPC 채널 표), §2.3(ai.ts 확장)
