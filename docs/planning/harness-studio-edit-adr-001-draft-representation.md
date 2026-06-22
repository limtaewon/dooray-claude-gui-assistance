---
id: ADR-harness-studio-edit-001
title: 편집 draft 표현 — file-centric (파일 경로 → 새 내용) 채택
status: proposed
date: 2026-06-22
supersedes: []
domain: electron-ipc, ai-service, renderer-only
---

# 편집 draft 표현 — file-centric 채택

## 컨텍스트

Harness Studio 에 편집(저작) 기능을 추가한다. 확정된 반영 모델은 "in-memory draft 누적 → diff 승인 → 파일 적용"이다. draft 를 무엇의 집합으로 표현할지가 후속 모든 편집/적용/diff 로직의 전제가 된다. 두 후보:

- **file-centric**: draft = `relPath → { baseContent, draftContent }` 집합. 단위 = 파일 텍스트.
- **model-patch**: draft = `HarnessModel` 필드 패치 집합(JSON Patch 류). 단위 = 모델 필드.

실측 제약(arch.md §0): `HarnessModel` 의 상당수 필드(`levels/triage/role/reads/writes/phaseClass/persist/score/stateMachine`)는 AI 가 산문·스크립트에서 추론한 **해석값**이라 원본 파일에 1:1 대응 위치가 없다. 반면 frontmatter(`model/tools`)·게이트 스크립트·템플릿 파일은 파일로 깔끔히 역매핑된다. 또한 적용 대상 진실은 디스크의 파일이며 `HarnessModel` 은 그 파생물이다. 캐시 무효화도 파일 mtime 기반 `bundleHash` 로 동작한다(ADR-004).

## 결정

draft 를 **file-centric** 으로 표현한다.

```ts
interface DraftFileEdit { relPath; baseContent; draftContent; origin:'form'|'raw'|'ai'; fieldPath?; aiCommand?; editedAt }
interface HarnessDraft  { bundlePath; baseBundleHash; edits: Record<relPath, DraftFileEdit> }
```

- 구조화 폼/raw/AI **세 입력 경로 모두** 동일한 `DraftFileEdit`(파일 텍스트 변경)로 수렴한다. 폼 편집은 순수함수 `applyFieldEdit(파일텍스트, fieldPath, newValue)` 로 파일 텍스트 변경으로 환원한다.
- 한 파일은 최신 draft 1건만 유지하고 `baseContent` 는 최초 스냅샷으로 고정(충돌 감지 기준).
- 적용은 draft 의 파일 텍스트를 그대로 쓰고, 쓰기 후 `normalize(force=true)` 로 모델을 재생성한다(모델은 절대 직접 패치하지 않는다).

## 대안과 기각 이유

1. **model-patch (HarnessModel 필드 직접 패치)** — 기각:
   - 역매핑 비1:1로 **적용 불가 필드가 다수**다. `levels[1].agentChain` 을 패치해도 어느 파일에 어떻게 쓸지 결정할 수 없어 적용 단계에서 막힌다.
   - "파일↔모델" 이중 진실이 생긴다. 패치된 모델과 재스캔 모델이 갈라질 위험.
   - diff 를 사용자에게 보여주려면 모델 패치를 다시 파일 변경으로 역합성해야 하는데, 위치 정보가 없어 불안정.
2. **하이브리드(역매핑 가능 필드는 model-patch, 나머지는 file-centric)** — 기각: 적용/diff/충돌 로직이 두 갈래가 되어 복잡도·버그 표면이 2배. 단일 모델(file-centric)이 모든 경로를 흡수하므로 불필요.
3. **AST/구조화 패치(YAML 노드 단위 패치)** — 기각: `.sh`/산문 마크다운에는 안정적 AST 가 없고, frontmatter 만으로는 범위가 좁다. 파일 텍스트 전체가 가장 일반적이고 안전한 단위.

## 결과 (Consequences)

- 긍정: 적용 로직 1개로 통일(폼/raw/AI 동일 흐름). diff 가 `baseContent↔draftContent` 로 직접 도출. 파일이 유일 진실 → 재스캔/재정규화가 항상 일관.
- 긍정: model-patch 의 "적용 불가 필드" 문제를 원천 회피.
- 부정/트레이드오프: 구조화 폼이 "필드 → 파일 텍스트 안전 치환"을 정확히 해야 한다(YAML frontmatter). → `applyFieldEdit()` 순수함수 + 집중 테스트로 방어.
- 부정: 같은 파일에 여러 필드를 폼 편집하면 draft 의 `draftContent` 를 누적 갱신해야 함(이전 폼 편집 위에 다음 편집). 리듀서(`draftReducer`)로 명시 관리.
- 모니터링: 적용 시 충돌(STALE) 발생률, 적용 후 재정규화 실패율 로깅. STALE 잦으면 외부 편집 동시성 안내 강화.
