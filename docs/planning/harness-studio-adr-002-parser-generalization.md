---
id: ADR-harness-studio-002
title: 파서 일반화 전략 — BMAD형 우선 + Graceful Degradation
status: proposed
date: 2026-06-19
supersedes: []
domain: ai-service, electron-ipc
---

# 파서 일반화 전략 — BMAD형 우선 + Graceful Degradation

## 컨텍스트

PRD §5는 "내 것만이 아니라 누가 무엇을 올리든 해석"을 목표로 하되, §3 비목표는 "bmad 계열이 아닌 임의 방법론의 완전 일반화는 범위 밖(BMAD형 우선, 부분 스킬은 graceful degradation)"이라 못박는다.

실측: reined-bmad 와 neon-bmad 는 *같은 BMAD 계열인데도* 디렉터리 구조가 다르다 — neon은 `_agents/`·`_templates/` 가 없고 `blocks/` 가 있으며, 레벨 정의 위치·게이트 규칙코드 prefix(`R5xx` vs `NEON-Gxx`)가 다르다. "완벽한 범용 파서"를 노리면 둘 다 깨지거나 한쪽에 과적합된다.

## 결정

**BMAD형 신호를 우선 감지하고, 못 잡으면 부분 모델 + warnings 로 우아하게 축소한다.** import 시 `bundleDetect` 가 `kind` 를 판정한다:

- `bundle`: `_core/` 존재 AND (`_agents/` OR ≥2개 `<role>/SKILL.md`) → 전 뷰 시도.
- `overlay`: `config.md`/`_overlays/*.md` frontmatter 감지 → 개인화 레이어로만 해석.
- `partial-skill`: 단일/소수 `SKILL.md`·frontmatter만 → 에이전트 카탈로그 + 도구만, levels/triage/gates 는 `warnings` 에 "추출 불가" 기록.
- `task`: 두레이 URL/평문 → Dry-run 입력.

AI 정규화는 *정적으로 확실한 골격이 잡힌 뒤* 비어있는 [AI] 필드만 보강하며(ADR-001), AI가 JSON 파싱 실패/스키마 위반 시에도 **정적 스켈레톤만으로 축소 모델을 반환**(절대 크래시 금지). 게이트 스크립트(`.sh`)는 *실행하지 않고 텍스트로만* 파싱한다.

## 대안과 기각 이유

1. **완전 범용 방법론 파서(BMAD 비의존)** — 기각: 입력 형식이 무한대라 실측 두 BMAD 번들조차 구조가 갈리는 마당에 ROI 음수. PRD 비목표 위반. 유지보수 폭발.
2. **번들별 전용 파서(reined 파서 + neon 파서 따로)** — 기각: 임의 import("누가 무엇을 올리든") 불가. 새 번들마다 코드 추가. 일반화 목표 정면 위배.
3. **실패 시 import 거부(엄격)** — 기각: 부분 스킬/낯선 구조도 "에이전트 카탈로그라도 보여주는" 게 온보딩 가치(PRD §4 일반 사용자). 거부는 도구 효용을 죽임.

## 결과 (Consequences)

- 긍정: 두 BMAD 번들 + 부분 스킬을 한 코드로 처리. 낯선 번들도 크래시 없이 "얻을 수 있는 만큼" 보여줌.
- 긍정: `.sh` 비실행 파싱으로 신뢰경계 안전(임의 번들 import 시 코드 실행 위험 0).
- 부정/트레이드오프: degradation 모델은 뷰가 부분적으로 빈 상태(StateViews) → 사용자 기대 관리 필요. warnings UI 노출로 완화.
- 부정: `kind` 오판(예: bundle인데 partial로) 가능 → 감지 신호를 보수적으로(상위 kind 우선) 잡고, 사용자가 ScanStep 에서 kind 를 수동 교정할 수 있게 한다.
- 모니터링: import 별 kind 분포 + warnings 유형 빈도 로깅. 특정 warning 이 잦으면 스캐너 일반화 보강 후보.
