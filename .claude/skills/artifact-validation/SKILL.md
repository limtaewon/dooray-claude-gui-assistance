---
name: artifact-validation
description: feature/<도메인>/<task-id>/ 산출물 (prd, adr, plan, impl-log, qa-report) 의 YAML frontmatter / 필수 섹션 / 불변성 검증. integrator 가 게이트 진입 시 호출.
---

# artifact-validation

> 산출물이 *형식적으로* 정합해야 자동화 가능. 본 스킬이 그 형식 검증.

## 대상 파일

`feature/<도메인>/<task-id>/` 안:
- `prd.md`
- `adr.md`
- `plan.md`
- `impl-log.md`
- `qa-report.md`

## 공통 — YAML Frontmatter

모든 산출물의 첫 줄은 `---`, 닫는 `---` 으로 frontmatter 블록 시작. 누락은 즉시 RETURN.

```yaml
---
task: <id>   # 필수
date: YYYY-MM-DD   # 필수
---
```

`task` 가 비어있거나 `<id>` 같은 placeholder → RETURN.

## prd.md 검증

```yaml
---
task: <id>
domain: <도메인 또는 콤마 구분>
created: YYYY-MM-DD
status: draft | accepted
---
```

본문 필수 섹션 (제목 정확히):
- `## 배경 / 문제`
- `## 목표 (Goals)`
- `## 비목표 (Non-goals)` (없으면 "없음 — 명시적 기록")
- `## 수락 기준 (Acceptance Criteria)` — 체크박스 ≥ 1
- `## 영향 도메인`
- `## 리스크 / 제약` (없으면 "없음 — 명시적 기록")
- `## 참조`

위 중 하나라도 빠지면 RETURN (architect 또는 main 세션).

## adr.md 검증 (불변성 규칙)

```yaml
---
id: ADR-<task>-<NN>
title: <한 줄>
status: proposed | accepted | superseded
date: YYYY-MM-DD
supersedes: []  # 또는 ["ADR-XX-01"]
domain: <도메인>
---
```

본문 필수 섹션:
- `## 컨텍스트`
- `## 결정`
- `## 대안과 기각 이유` — 적어도 1개의 기각된 대안
- `## 결과 (Consequences)` — 긍정/부정/모니터링

**불변성 검증**:
- `status: accepted` 인 ADR 은 수정 금지. 결정이 바뀌면 새 ADR 로 `supersedes: ["ADR-<...>"]` 후 status `superseded` 로 변경.
- 같은 task 안 ADR ID 시퀀스는 01, 02, 03... 으로 충돌 없이.

## plan.md 검증

```yaml
---
task: <id>
date: YYYY-MM-DD
---
```

본문:
- `## 구현 단계` — 체크박스 ≥ 1
- (선택) `## 분리 영역` — main/renderer 분리 기재

integrator 시점: 모든 체크박스가 `[x]` 면 통과. `[ ]` 있으면 RETURN (engineer).

## impl-log.md 검증

```yaml
---
task: <id>
agent: main-process-engineer | renderer-engineer
date: YYYY-MM-DD
---
```

본문:
- `## 변경한 파일` — 1 줄 ≥ 1
- `## 결정 사항 (해야 할 것)` — 1 줄 ≥ 1 (없으면 "없음 — 명시적 기록")
- `## 제약 (하지 말 것)` — 1 줄 ≥ 1 (없으면 "없음 — 명시적 기록")
- `## 참조`

main + renderer 같이 작업한 경우 같은 파일에 둘이 append. agent 마다 자기 섹션 ## 헤더로 구분 권장:

```md
## [main-process-engineer] 변경한 파일
- ...

## [renderer-engineer] 변경한 파일
- ...
```

## qa-report.md 검증

```yaml
---
task: <id>
agent: test-engineer
date: YYYY-MM-DD
verdict: PASS | RETURN | BLOCK
---
```

본문:
- `## 수락 기준 × 검증 매트릭스`
- `## 실행 결과` — npm test 결과 + 커버리지 명시
- `## 수동 시나리오` (UI 또는 외부 시스템 영향 시)
- `## Verdict` — 본문 자체에 verdict 사유

`verdict: PASS` 만 integrator 진입. RETURN/BLOCK 은 해당 단계로 돌아감.

## 빈 섹션의 명시적 기록

"없음" 이 정말 없는 것인지, 작성자가 빠뜨린 것인지 구분이 안 됨. 그래서:

```md
## 제약 (하지 말 것)

없음 — 명시적 기록
```

이 문구가 없으면 빠뜨림으로 간주 → RETURN.

## 검증 실행 (의사 코드)

integrator 가 아래 의사 코드처럼 검증:

```python
def validate_artifact(path):
    content = read(path)
    frontmatter, body = split_frontmatter(content)
    
    if not frontmatter:
        return RETURN("frontmatter 누락")
    
    # 파일별 필수 키 검사
    required_keys = {
        'prd.md': ['task', 'domain', 'created', 'status'],
        'adr.md': ['id', 'title', 'status', 'date', 'domain'],
        ...
    }
    for k in required_keys[basename(path)]:
        if k not in frontmatter or not frontmatter[k]:
            return RETURN(f"{k} 누락")
    
    # 필수 섹션 검사
    required_sections = {...}
    for s in required_sections[basename(path)]:
        if f"## {s}" not in body:
            return RETURN(f"섹션 {s} 누락")
    
    # 빈 섹션의 명시적 기록 검사
    ...
    
    return PASS
```

(실제로는 Read + 정규식 grep 으로 인라인 검증)

## RETURN 시 메시지 형식

```md
[artifact-validation] RETURN
File: feature/<도메인>/<task-id>/<file>.md
Issue: <구체적 누락 사항>
Action: <어느 에이전트로 돌아갈지>
```
