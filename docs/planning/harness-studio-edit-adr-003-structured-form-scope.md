---
id: ADR-harness-studio-edit-003
title: 구조화 폼 편집 범위 — 역매핑 가능 필드(frontmatter/템플릿)로 한정
status: proposed
date: 2026-06-22
supersedes: []
domain: renderer-only, electron-ipc
---

# 구조화 폼 편집 범위 — 역매핑 가능 필드로 한정

## 컨텍스트

수동 편집은 (a) 구조화 필드 폼 + (b) raw 파일 에디터(Monaco) 둘 다 제공하기로 확정됐다. 문제는 구조화 폼이 **어느 필드를 편집 가능하게 할지**다. `HarnessModel` 의 상당수 필드는 AI 가 산문/스크립트에서 추론한 해석값(`role/reads/writes/phaseClass/levels/triage/persist/score/stateMachine/parallelGroups/loops`)이라 원본 파일에 1:1 대응 위치가 없다. 이런 필드를 폼으로 "편집"하게 하면 사용자는 값을 바꿨다고 믿지만 **적용 시 어느 파일에 쓸지 결정 불가**하거나, 산문을 임의로 재작성해야 해 의미가 왜곡된다.

실측(arch.md §0): frontmatter(`agents[].model`, `agents[].tools`)와 템플릿 파일(`_templates/*.md`)·게이트 스크립트(`.sh`)는 파일로 깔끔히 역매핑된다. 단 `tools`/`model` 은 reined(`_agents/*.md`)·neon(`<role>/SKILL.md`) 으로 위치가 다르고, 현재 스캐너는 출처 파일을 병합하며 버린다 → 출처 추적(SourceMap)이 선행돼야 폼 편집이 가능하다.

## 결정

구조화 폼은 **파일로 결정론적으로 역매핑되는 필드만** 편집 대상으로 한다.

폼 편집 허용(`[FORM]`):
- `agents[].model` — SourceMap 의 `modelFile`(없으면 `nameFile`)의 frontmatter `model:` 치환/추가.
- `agents[].tools` — SourceMap 의 `toolsFile` 의 `tools:`/`allowed-tools:` 리스트 치환.

폼 편집 금지 — raw 에디터 또는 AI 편집으로만:
- `[RAW]`: `artifacts[].template`(템플릿 파일), 게이트 `ruleCodes/ruleDetails`(`.sh` 텍스트), `meta.author/tagline`(README), `overlay.*`(config.md).
- `[AI]`: `role/reads/writes/phaseClass/escalation/signals/riskNote/levels/triage/persist/producer/consumers/parallelGroups/loops/stateMachine/gate.description/hook.enforces` — 전부 AI 해석값.
- `[LOCK]`: `agents[].id`(name; 참조 파급으로 rename 위험), `score`(구조에서 결정론 계산 — 직접 편집 무의미).

폼 편집은 순수함수 `applyFieldEdit(파일텍스트, fieldPath, newValue)` 로 파일 텍스트 변경(`DraftFileEdit`)으로 환원한다. 폼은 `editMap.ts`(순수)로 "이 필드가 편집 가능한지/어느 파일로 가는지"를 결정한다. 편집 불가 필드는 폼에서 **읽기 전용 + "raw/AI 로 편집" 안내**를 표시한다.

## 대안과 기각 이유

1. **모든 필드를 폼으로 편집 가능하게** — 기각: AI 해석값은 원본 파일 위치가 없어 적용 불가하거나, 폼이 산문 전체를 재작성해야 해 사용자가 의도치 않은 의미 손실을 만든다. "편집했는데 적용 안 됨"은 신뢰 붕괴.
2. **폼 편집 결과를 모델에만 반영(파일 안 씀)** — 기각: 확정 요구사항(파일에 적용)에 위배. 재오픈/재스캔 시 사라지는 유령 편집.
3. **폼을 아예 없애고 raw 에디터만** — 기각: 확정 요구사항(구조화 폼 + raw 둘 다)에 위배. model/tools 같은 정형 필드는 드롭다운/멀티셀렉트가 raw YAML 직접 편집보다 안전·발견 용이.
4. **id(name) rename 폼 허용** — 기각: id 는 levels 체인·artifacts producer/consumer 가 참조하므로 한 파일만 고치면 모델 정합이 깨진다. rename 은 다중 파일 일괄 치환이 필요한 별도 후속 기능.

## 결과 (Consequences)

- 긍정: "폼으로 바꾼 건 항상 파일에 정확히 반영된다"는 신뢰 보장. AI 해석값은 raw/AI 경로로 우회해 의미 왜곡 방지.
- 긍정: 폼 편집 대상이 명확해 `editMap`/`applyFieldEdit` 테스트 범위가 좁고 견고.
- 부정/트레이드오프: 사용자가 "역할 한 줄을 폼에서 못 고치네?"라고 느낄 수 있음 → 편집 불가 필드 옆 "raw/AI 로 편집" 안내 + AI 명령 유도로 완화.
- 부정: SourceMap 추가가 BundleScanner 수정을 요구(read-only 회귀 주의) → append-only + 기존 테스트 전량 통과 게이트.
- 모니터링: 폼 편집 vs raw vs AI 사용 비율. 폼 편집 후 적용 실패(치환 오류)율 — applyFieldEdit 버그 신호.
