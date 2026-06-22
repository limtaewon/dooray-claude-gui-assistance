---
id: ADR-harness-studio-001
title: HarnessModel 스키마 단일화 & 정적스캔/AI 정규화 분담
status: proposed
date: 2026-06-19
supersedes: []
domain: ai-service, electron-ipc, renderer-only
---

# HarnessModel 스키마 단일화 & 정적스캔/AI 정규화 분담

## 컨텍스트

렌더러(Flow Canvas + 6뷰)는 **하네스-agnostic** 해야 한다 — reined-bmad·neon-bmad·임의 번들 무엇이 오든 *하나의 JSON*(HarnessModel)만 그린다. 따라서 "무엇이 정적으로 확실히 얻어지고, 무엇은 AI 추론이 필요한가"의 경계를 스키마에 못 박지 않으면, 렌더러가 번들마다 분기하거나 AI가 정적으로 확실한 값을 잘못 덮어쓴다.

실제 두 번들을 열어본 결과(arch.md §0):
- frontmatter(`name`/`tools`/`allowed-tools`/`model?`/`description`)와 파일트리 토폴로지는 **번들 불문 정적 100%**.
- 그러나 `model:` 은 neon 파이프라인 에이전트에 **부재**, 레벨/triage/체인/게이트의미/reads/writes/role/escalation/persist/6축점수 는 **번들마다 위치·형식이 다른 산문/스크립트** → 정규식만으로 안전 추출 불가.

## 결정

`src/shared/types/harness.ts` 에 단일 `HarnessModel` 스키마를 정의하고, **모든 필드에 출처(FieldSource: static|ai|inferred|absent)를 동반하는 `provenance` 맵을 포함**한다. 채우는 책임을 다음으로 고정한다:

1. **정적 스캐너(`BundleScanner`, AI 없음)가 먼저** [S] 필드(meta 기본/agents id·tools·model(frontmatter 있을 때)·artifact 템플릿·gate phase·ruleCodes·hook 파일)로 *스켈레톤* 을 만든다.
2. **AI 정규화기(`HarnessNormalizer`, Opus)는 비어있는 [AI] 필드만** JSON 으로 산출해 머지한다. **AI는 [S] 필드를 덮어쓰지 못한다**(정적이 더 신뢰도 높음). `model:` 이 frontmatter에 없으면 `_core/models.md` 매트릭스를 정적 파싱 시도 → 그래도 없으면 AI/`unknown` + provenance 기록.
3. degradation 시 `warnings[]` + provenance 로 신뢰도를 항상 UI에 노출한다.

스키마는 `schemaVersion` 필드를 가지며, 변경 시 캐시는 버전 비교로 자동 무효화된다.

## 대안과 기각 이유

1. **순수 AI 정규화(전 필드를 AI에게)** — 기각: frontmatter `tools`/`model` 같이 *기계가 100% 정확히 읽는* 값을 AI에 맡기면 환각·누락 위험 + 토큰 낭비 + 매 import 비용. 정적으로 확실한 건 정적으로.
2. **순수 정적 파서(정규식만)** — 기각: 실측상 레벨/triage/체인/게이트의미가 번들마다 위치·형식이 달라(triage가 reined는 `_core/triage.md`, neon은 `_core/concepts.md §7`) 정규식이 한 번들에 과적합된다. 일반화(PRD §5 "누가 무엇을 올리든") 불가.
3. **provenance 없이 model만** — 기각: AI 추정값과 정적값이 섞이면 사용자가 "이 모델배지가 진짜인지 추정인지" 구분 못 함. 저자 점검 페르소나(PRD §4)에 치명적 — 잘못된 추정을 사실로 오인.

## 결과 (Consequences)

- 긍정: 렌더러는 번들 분기 0 — HarnessModel 하나만 안다. 정적 확실값 보호로 신뢰도↑, AI 토큰 최소화.
- 긍정: provenance/warnings 로 "AI 추정" 투명 표기 → 저자 디버깅·온보딩 신뢰.
- 부정/트레이드오프: 스키마가 크고(필드별 출처 추적) 정규화 프롬프트가 "비어있는 필드만 JSON" 계약을 엄격히 지켜야 함 → 프롬프트/머지 로직 복잡도↑. `normalizePrompt.ts` 순수함수 + 스키마 검증으로 완화.
- 모니터링: 정규화 결과의 provenance 분포(ai 비율)와 warnings 발생률을 로깅. ai 비율이 비정상적으로 높으면(정적이 안 잡힘) 스캐너 버그 신호.
