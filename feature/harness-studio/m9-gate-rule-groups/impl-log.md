---
task: harness-studio-m9-gate-rule-groups
agent: renderer-engineer
date: 2026-06-22
---

# Impl Log — Harness Studio: 게이트 규칙 성격별 그룹핑

## 변경한 파일

### 신규 (순수 함수)

- `src/renderer/src/components/HarnessStudio/views/gateRuleGroups.ts`
  — `categorizeRule(code, message) → RuleCategory` 휴리스틱 분류 함수.
  우선순위: domain(코드 패턴/메시지 키워드) → section(## /섹션) → existence(없음/존재) → content(나머지).
  `groupRuleDetails(ruleDetails) → RuleGroup[]` — 고정 순서(existence→section→content→domain→other), 빈 그룹 제외.
  `CATEGORY_LABEL` 한국어 레이블 맵(산출물 존재/필수 섹션/내용 검증/도메인·코드 규약/기타).

### 신규 (테스트)

- `src/renderer/src/components/HarnessStudio/__tests__/gateRuleGroups.test.ts`
  — `categorizeRule` 21개 케이스: neon analyst 예시 코드 전체 + 경계 케이스(code 패턴 우선, push 소문자 등).
  `groupRuleDetails` 6개 케이스: undefined/빈배열/neon analyst 예시/그룹 순서/한국어 레이블/빈 그룹 제외.

### 수정

- `src/renderer/src/components/HarnessStudio/views/GatesPanel.tsx`
  — lucide 아이콘 추가(FileCheck/ListChecks/CheckCircle2/Dot) + `groupRuleDetails` import.
  `RuleGroupIcon` 내부 컴포넌트 추가(카테고리별 아이콘, DS 토큰 색상).
  게이트 카드의 `ruleDetails` 평탄 나열 → 그룹핑 렌더로 교체.
  그룹 소제목: 아이콘 + 한국어 레이블(text-secondary), 규칙 행: pl-4 들여쓰기.

- `src/renderer/src/components/HarnessStudio/inspector/GateInspector.tsx`
  — 동일 아이콘/import 추가. `RuleGroupIcon` 추가.
  "규칙 코드 (N개) — 무엇을 검사하나" 섹션을 그룹핑 렌더로 교체.
  ruleDetails 없는 경우 ruleCodes 를 빈 message 로 폴백해 groupRuleDetails 에 전달.

- `src/renderer/src/components/HarnessStudio/inspector/AgentInspector.tsx`
  — 동일 아이콘/import 추가. `RuleGroupIcon` 추가.
  "이 단계 게이트" 섹션의 규칙코드 평탄 나열 → 그룹핑 렌더로 교체.
  ruleDetails 없는 경우 ruleCodes 를 빈 message 로 폴백.

## 결정 사항

### 분류 우선순위 — domain 최우선
`AOP01 "파일 없음"` 처럼 code 패턴이 domain 임에도 message 에 '없음'이 포함된 경우,
domain 우선순위가 더 높아 domain 으로 분류된다. 코드 패턴이 의미적으로 더 명확한 신호이기 때문.

### neon analyst 예시 최종 분류 결과
- NEON-G01 "brief.md 없음" → existence (1건)
- NEON-G10/11/12 "## … 누락" → section (3건)
- NEON-G20 "brief.md 측정지표 누락" → content (1건)
- NEON-AOP01 "@Transactional 금지 — AOP 규약" → domain (1건)
합계: 4개 그룹, 6개 규칙.

### 아이콘 선택 근거
- FileCheck(existence): 파일 존재 확인 의미
- ListChecks(section): 항목 목록 검사 의미
- CheckCircle2(content): 내용 유효성 의미
- ShieldAlert(domain): 코드 규약 위반 경고 의미
- Dot(other): 나머지, 최소 시각적 노이즈

### 텍스트 대비 — text-secondary 이상
그룹 소제목과 규칙 메시지 모두 `--text-secondary` 사용. tertiary 저대비 이슈 회피.

## 테스트 결과

- 전체: **104 파일, 1525 테스트 통과** (실패 0)
- 신규: categorizeRule(21개) + groupRuleDetails(6개) = 27개
- typecheck: `tsc --noEmit` 양쪽 통과 (exit 0)
- build: `electron-vite build` 성공 (renderer 3,949 kB)

## 참조

- `src/shared/types/harness.ts` — `HarnessGate.ruleDetails: { code: string; message: string }[]`
- M8 impl-log: GateInspector/AgentInspector 기존 구조 참조
