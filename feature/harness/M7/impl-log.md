---
task: harness-M7
agent: main-process-engineer
date: 2026-06-19
---

# Impl Log — Harness Studio M7: Dry-run 엔진 + IPC

## 상태 확인 결과

M0~M6 커밋 이후 main process 측 핵심 파일들이 이미 구현되어 있었다:

- `src/main/harness/levelPath.ts` — 순수 함수 완전 구현
- `src/main/harness/DryRunEstimator.ts` — AIService 주입형 완전 구현
- `src/main/harness/HarnessService.ts` — `dryrun()` 메서드 포함
- `src/main/index.ts` — `HARNESS_DRYRUN` IPC 핸들러 등록 완료
- `src/preload/index.ts` — `window.api.harness.dryrun(...)` 노출 완료
- `src/main/harness/__tests__/levelPath.test.ts` — 20개 테스트 존재

## 문제점 발견

`HarnessService.test.ts` 에 M7 이전 단계에서 작성된 스텁 테스트가 남아 있었다:
- `describe('estimateLevel', ...)` — `service.estimateLevel()` 메서드 호출
- 해당 메서드는 M7 에서 `dryrun()` 으로 교체되었으므로 존재하지 않음
- typecheck: `Property 'estimateLevel' does not exist on type 'HarnessService'` 에러 3건

## 변경한 파일

- `src/main/harness/HarnessService.test.ts` (수정) — 스텁 `estimateLevel` 테스트를 `dryrun` 테스트로 교체
- `src/main/harness/DryRunEstimator.test.ts` (신규) — DryRunEstimator 단위 테스트 12개

## 결정 사항

- `HarnessService.test.ts` 의 `estimateLevel` 스텁 테스트를 완전 교체. M7 이후 공개 API는 `dryrun()` 이므로 스텁 계약("highlightPath 는 []")이 아닌 실제 동작(levelPath 결합 결과)을 검증하도록 변경.
- `DryRunEstimator.test.ts` 는 `HarnessCache` 실제 인스턴스(tmp 디렉터리)를 사용해 캐시 hit/miss 를 진짜 fs 수준에서 검증. AIService 만 `vi.fn()` 으로 모킹.
- levelPath 결정론 검증(L0~L3 highlightPath, securityOverride neon 스타일)을 `DryRunEstimator.test.ts` 에도 포함 — `levelPath.test.ts` 와 상호 보완.

## 제약 (하지 말 것)

- `src/main/harness/levelPath.ts` 의 `LEVEL_TIME_WEIGHT` / `LEVEL_COST_WEIGHT` 상수는 테스트가 정확한 숫자에 의존하므로 변경 시 테스트도 함께 갱신 필요.
- `DryRunEstimator` 의 캐시 키는 `computeTaskHash(bundleHash, taskText)` — bundleHash 와 taskText 정규화 방식이 바뀌면 기존 캐시 자동 무효화됨 (의도된 동작이므로 유지).
- `runClaudeStream` 플랫폼 분기는 건드리지 않음 (CLAUDE.md 절대 규칙 — Windows/Mac 분기 가이드 준수).

## 검증 결과

- `npm run typecheck` — 통과 (0 errors)
- `npm run test:run` — 88 test files, 1144 tests, 모두 통과
- Coverage: Lines 77.2% / Branches 81.1% / Functions 91.96% (임계값 70% 초과)
  - `DryRunEstimator.ts`: 100% / 100% / 100%
  - `levelPath.ts`: 100% / 97.77% / 100%
  - `HarnessService.ts`: 95.71%

## 참조

- arch.md §3.2 — Dry-run 흐름
- arch.md §4 — HARNESS_DRYRUN IPC 채널
- harness-studio-plan.md M7
- PRD §7-2, §2 결정론 통찰
