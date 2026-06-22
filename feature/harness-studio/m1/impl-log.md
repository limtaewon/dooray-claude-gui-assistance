---
task: harness-studio-m1
agent: main-process-engineer
date: 2026-06-19
---

# Impl Log — Harness Studio M1 — 정적 번들 스캐너

## 변경한 파일

### 신규 (src/main/harness/)
- `frontmatter.ts` — 순수 YAML frontmatter 파서 (name/tools/allowed-tools/model/description 추출)
- `bundleHash.ts` — 순수 SHA-256 해시 계산 (bundleHash / taskHash)
- `bundleDetect.ts` — 순수 kind 감지 (bundle/overlay/partial-skill/task)
- `BundleScanner.ts` — 파일트리 워크 + frontmatter 파싱 + 게이트/hook 정적 파싱 → RawBundle

### 신규 (테스트)
- `src/main/harness/__tests__/frontmatter.test.ts` (21 테스트)
- `src/main/harness/__tests__/bundleHash.test.ts` (17 테스트)
- `src/main/harness/__tests__/bundleDetect.test.ts` (17 테스트)
- `src/main/harness/__tests__/BundleScanner.test.ts` (32 테스트)

### 신규 (픽스처)
- `src/main/harness/__tests__/fixtures/reined-fixture/` — reined-bmad 축소 번들
  - `_agents/reined-fixture-developer.md` (model: sonnet, tools 인라인)
  - `_agents/reined-fixture-qa.md` (model: haiku)
  - `developer/SKILL.md` (allowed-tools)
  - `_core/concepts.md`
  - `_hooks/gate.sh` (R501/R520/R551/R560, exit 1)
- `src/main/harness/__tests__/fixtures/neon-fixture/` — neon-bmad 축소 번들
  - `developer/SKILL.md` (model 없음, allowed-tools + mcp__ 포함)
  - `qa/SKILL.md` (model 없음)
  - `_core/concepts.md`
  - `_hooks/neon-fixture-gate-check.sh` (NEON-G*/AOP01/LYR01, exit 2)
  - `blocks/pipeline.sh`
- `src/main/harness/__tests__/fixtures/partial-fixture/SKILL.md` (model: haiku, partial-skill)

## 결정 사항

### frontmatter.ts
- js-yaml 이 deps 에 없어 경량 직접 파싱 구현. 지원 형식: 인라인 스칼라, folded(>)/literal(|) 블록, 인라인/블록 시퀀스, 대괄호 배열.
- `tools` + `allowed-tools` 를 모두 인식해서 중복 제거 후 합산. mcp__ 도구명 그대로 유지.
- 절대 throw 하지 않음 — frontmatter 없으면 빈 결과 반환.

### bundleHash.ts
- `sha256(정렬된 [상대경로\0mtimeMs\0size\0frontmatterRaw\0\0] 연결)` — 파일 순서 무관 안정.
- `\0\0` 이중 구분자로 파일 간 경계 충돌 방지.
- taskHash: 소문자+연속공백 정규화 후 hash. 같은 태스크 텍스트 변형도 동일 해시.

### bundleDetect.ts
- 우선순위: bundle > overlay > partial-skill > task. 보수적 상위 kind 우선.
- bundle 조건: `_core/` 하위 파일 존재 AND (`_agents/` 존재 OR SKILL.md ≥ 2개). neon-bmad 처럼 `_agents/` 없어도 SKILL.md ≥ 2개면 bundle.
- overlay 조건: `_overlays/` OR config.md frontmatter 에 stack/domains/model-overrides/disabled-agents 키.

### BundleScanner.ts
- `_agents/` + `SKILL.md` 에서 에이전트 스텁을 수집. 동일 id 는 `_agents/` 정의 우선, SKILL.md 로 tools 보강.
- 게이트 스크립트 규칙코드 정규식: `R[0-9]{2,4}`, `[A-Z]{2,10}-[A-Z]{1,10}[0-9]{1,3}` (NEON-AOP01 등 복합코드), `[A-Z]{2,10}[0-9]{2,3}` (단독).
- case 블록 바깥의 헬퍼 함수(code_domain_checks 등) 내 코드도 포함: case 이전 텍스트에서 baseCodes 추출 후 각 phase 코드에 union.
- blocking: exit 1 또는 exit 2 존재 시 true.
- 오류는 모두 warnings 에 기록, 크래시 금지.

## 제약 (하지 말 것)

- **AI 호출 금지**: M1 범위. `BundleScanner`, `bundleDetect`, `frontmatter`, `bundleHash` 는 모두 순수 정적. `HarnessNormalizer`(M2)가 AI를 호출한다.
- **스크립트 실행 금지**: `.sh` 파일은 텍스트로만 읽는다. `spawn`/`exec` 절대 금지.
- **renderer 수정 금지**: `BundleScanner`의 `RawBundle`/`AgentStub`/`RawGate`/`RawHook` 타입은 main 내부 중간표현. renderer 는 `RawBundleSummary`(shared/types/harness.ts)만 본다.
- **bundleHash 알고리즘 변경 시** 반드시 캐시 무효화 확인: 해시 공식이 바뀌면 기존 캐시 파일이 영원히 hit 됨. 변경 시 `schemaVersion` 올릴 것.
- **frontmatter 파서 범위**: 현재 파서는 단순 YAML subset 지원. 복잡한 nested YAML(anchor/alias/multiline quoted string 등)은 지원 안 함. 지원 필요 시 js-yaml 도입 후 `parseFrontmatter` 인터페이스는 유지.

## 커버리지 결과

- `main/harness`: 90.18% statements / 82.12% branches / 97.95% functions / 90.18% lines
- 전체: 76.09% lines (70% 임계값 통과)
- 테스트: 914 passed (914) — 기존 테스트 회귀 없음

## 참조

- `docs/planning/harness-studio-arch.md` — §0 실측 번들 구조, §2.2 파일경로, §6 bundleHash 규칙, §7 degradation
- `docs/planning/harness-studio-adr-002-parser-generalization.md` — BMAD형 우선 + degradation
- `src/shared/types/harness.ts` — RawBundleSummary, HarnessAgent, HarnessGate, HarnessHook
