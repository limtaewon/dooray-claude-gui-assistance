---
task: harness-studio-m2
agent: main-process-engineer
date: 2026-06-19
---

# Impl Log — Harness Studio M2 (AIService 확장 + 캐시)

## 변경한 파일

- `src/main/harness/normalizePrompt.ts` (신규) — 번들 정규화/레벨추정 프롬프트 빌더 (순수 함수 4개)
- `src/main/harness/taskHash.ts` (신규) — taskHash 계산 순수 함수 (normalizeTaskText + computeTaskHash)
- `src/main/harness/HarnessCache.ts` (신규) — 파일 JSON 캐시 (userDataPath 주입, schemaVersion 무효화, 손상JSON 무효화)
- `src/main/ai/AIService.ts` (수정) — normalizeHarness() / estimateLevel() 메서드 추가. import 2개 추가.
- `src/main/harness/normalizePrompt.test.ts` (신규) — 26 테스트 (빌더 계약 검증, 머지 계약, Q코드 노출 금지)
- `src/main/harness/taskHash.test.ts` (신규) — 14 테스트 (normalizeTaskText/computeTaskHash 엣지 케이스)
- `src/main/harness/HarnessCache.test.ts` (신규) — 23 테스트 (hit/miss/schemaVersion 무효화/손상JSON/clear/listCached)
- `src/main/ai/AIService.test.ts` (수정) — 15 테스트 추가 (normalizeHarness/estimateLevel, Mac/Windows 양쪽 platform 분기)

## 결정 사항

1. **runClaudeStream 분기 코드 미수정** — normalizeHarness/estimateLevel 은 buildArgs() 로 argv 구성 후 runWithProgress() 를 재사용. Windows/Mac 분기는 runClaudeStream 내부에서 처리 (CLAUDE.md 함정 #1·#3 준수).

2. **noTools: true 옵션** — 번들 정규화/레벨추정은 텍스트 분석만 필요. `--disallowedTools mcp__*,Bash,...` 를 붙여 AI 가 도구를 호출하지 못하게 한다. 비용 절감 + 응답 포커스.

3. **normalizeHarness throw 금지** — JSON 파싱 실패 시 throw 대신 부분(축소) HarnessModel 반환 + warnings 기록. ADR-002 "절대 크래시 금지" 준수. estimateLevel 도 동일 — L1 기본값 폴백.

4. **HarnessCache 생성자 주입 패턴** — `app.getPath('userData')` 를 생성자 인자로 받아 electron 의존 격리. 테스트에서 tmpdir() 주입으로 fs 부작용 없이 검증.

5. **taskHash 구분자 `\x00`** — bundleHash + '\x00' + normalizedTaskText 로 이어 붙여 "abcdef" / "" 조합과 "abc" / "def" 조합이 같은 입력으로 충돌하는 케이스 방지.

6. **normalizePrompt: rawBundleText 는 빌더 외부에서 주입** — 이 모듈은 텍스트 조합만 담당. 번들 파일 읽기/결합은 호출자(HarnessNormalizer — M3) 책임. 파일 IO 없이 순수 함수로 유지.

7. **FEATURE_TO_TARGET 매핑 미추가** — normalizeHarness/estimateLevel 은 사용자 스킬 적용 대상이 아님 (번들 분석은 스킬 관여 없이 스키마 강제). buildSystemPrompt 가 아닌 buildNormalizeSystemPrompt 를 직접 사용.

## 제약 (하지 말 것)

- **runClaudeStream 의 Windows/Mac 분기 수정 금지** — normalizeHarness/estimateLevel 이 큰 system prompt 를 전달하므로 Windows stdin combine 경로에 영향이 크다. 분기 로직 자체는 건드리지 말 것.
- **HarnessCache 를 electron 없이 직접 instantiate 하지 말 것** — userDataPath 는 반드시 주입. main/index.ts 에서 `app.getPath('userData')` 로 생성 후 HarnessService 에 전달해야 함.
- **normalizePrompt 가 파일 IO 하지 않도록** — 순수 함수 유지. 번들 파일 결합은 HarnessNormalizer 의 책임.
- **BundleScanner / bundleDetect / frontmatter / bundleHash 파일 수정 금지** — M1 병렬 엔지니어 영역. src/main/harness/__tests__/ 의 기존 실패(BundleScanner.test.ts 1건)는 M1 엔지니어 문제, M2 미관련.

## 참조

- ADR-harness-studio-001 (정적/AI 분담 · 머지계약)
- ADR-harness-studio-004 (파일 JSON 캐시 · 내용해시)
- arch.md §2.3 (AIService 확장 — runClaudeStream 재사용)
- arch.md §3 (데이터 흐름 · 정적 스켈레톤 우선)
- arch.md §6 (캐시 전략)
- CLAUDE.md "AIService.runClaudeStream Windows/Mac 분기 가이드" 전체 준수
