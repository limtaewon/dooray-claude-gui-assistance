# impl-log — Harness Studio Edit M2 (폼 편집 순수 로직)

agent: renderer-engineer
date: 2026-06-22
milestone: M2
branch: feature/harness-studio

---

## 구현 파일 목록

### 신규 생성

| 파일 | 역할 |
|---|---|
| `src/renderer/src/components/HarnessStudio/edit/editMap.ts` | HarnessModel + AgentSourceMap → 필드별 편집 가능 여부/대상 파일 매핑 (ADR-003 구현) |
| `src/renderer/src/components/HarnessStudio/edit/applyFieldEdit.ts` | frontmatter `model:` / `tools:` / `allowed-tools:` 치환 순수 함수. CRLF/BOM 보존, 멱등성 보장 |
| `src/renderer/src/components/HarnessStudio/edit/draftReducer.ts` | HarnessDraft in-memory 누적 리듀서. React useReducer 호환. `DraftFileEditWithStale` 충돌 표시 포함 |
| `src/renderer/src/components/HarnessStudio/edit/pickEditTargets.ts` | NL 명령 → AI 편집 대상 relPath 추정 (에이전트명/게이트 페이즈/범용 키워드/모호 폴백) |
| `src/renderer/src/components/HarnessStudio/edit/__tests__/editMap.test.ts` | editMap 테스트: reined/neon/SourceMap-없음 케이스, LOCK/AI/RAW/FORM 매핑, formEditableCount |
| `src/renderer/src/components/HarnessStudio/edit/__tests__/applyFieldEdit.test.ts` | applyFieldEdit 테스트: model 신규추가/치환, tools 리스트 치환, 블록→인라인, CRLF 보존, 멱등성, 에러처리 |
| `src/renderer/src/components/HarnessStudio/edit/__tests__/draftReducer.test.ts` | draftReducer 테스트: 누적/갱신/revert/reset/stale/clearAfterApply, useReducer 액션 |
| `src/renderer/src/components/HarnessStudio/edit/__tests__/pickEditTargets.test.ts` | pickEditTargets 테스트: 에이전트매칭/게이트매칭/범용키워드/모호폴백/엣지케이스 |

---

## ADR-003 매핑표 구현 요지 (editMap.ts)

| 필드 | mode | 대상 파일 결정 방법 |
|---|---|---|
| `agents[].model` | FORM | `AgentSourceMap[id].modelFile` → 없으면 `nameFile` 폴백 |
| `agents[].tools` | FORM | `AgentSourceMap[id].toolsFile` → 없으면 `nameFile` 폴백. SKILL.md이면 `allowed-tools` 키 사용 |
| `agents[].id` | LOCK | id 변경은 levels/artifacts 참조 파급으로 편집 금지 |
| `agents[].role / reads / writes / phaseClass / escalation / signals / riskNote` | AI | AI 해석값 — 원본 파일 1:1 매핑 불가 |
| `score` | LOCK | computeHarnessScore 결정론 재계산 — 직접 편집 무의미 |
| `controlFlow.gates[*]` | RAW | .sh 스크립트 텍스트, 구조화 폼 위험 |
| `meta.author / tagline` | RAW | README 산문 AI 추출값 |
| `artifacts[].template` | RAW | _templates/*.md 직접 편집 |
| `levels[].agentChain` | AI | triage.md/concepts.md 산문 AI 추출 |
| SourceMap 없는 경우 model/tools | LOCK → graceful degradation | "파악 불가" 안내 |

---

## 테스트 결과

```
Test Files  102 passed (102)
Tests       1462 passed (1462)
Typecheck   PASS (tsc --noEmit)
```

M2 신규 테스트 4파일: 총 69개 케이스 전부 통과.
기존 harness 테스트 전량 회귀 없음 (100 passed → 102 passed, +2 내 신규).

---

## 주요 구현 결정 사항

### applyFieldEdit.ts — CRLF 보존 전략
- 내부 처리는 LF 로 정규화 후 마지막에 원본 줄끝 문자 복원.
- `detectLineEnding()`이 CRLF 비율로 결정 — 혼용 파일도 처리.
- `normalizeLF()`가 BOM도 동시 제거.

### applyFieldEdit.ts — frontmatter 없는 파일 신규 추가
- neon SKILL.md 처럼 `model:` 키가 없는 경우 `---\nmodel: value\n---\n` 블록을 닫는 `---` 바로 앞 줄에 삽입.
- frontmatter 자체가 없는 파일은 파일 맨 앞에 신규 frontmatter 블록 생성.

### applyFieldEdit.ts — 블록 시퀀스 → 인라인 변환
- `tools:\n  - Read\n  - Edit` 형식을 인라인 `tools: Read, Edit`으로 치환.
- 아키텍처 결정: 블록/인라인 혼용보다 인라인 일관성이 이후 재치환 멱등성을 보장.

### draftReducer.ts — DraftFileEditWithStale 확장
- `HarnessDraft` 의 `edits` 값 타입은 `DraftFileEdit`이나 런타임에는 `stale?` 필드가 추가된 확장 타입 사용.
- IPC 전송 전 별도 제거 불필요 — main이 독립적으로 stale을 재검증하므로.

### pickEditTargets.ts — 에이전트명 우선 원칙
- 에이전트명이 매칭되면 게이트/범용 키워드를 무시하고 에이전트 파일을 반환.
- "qa gate" 같은 명령은 qa 에이전트가 먼저 매칭 → 에이전트 파일 반환. 순수 게이트 명령은 에이전트명 없는 "게이트 규칙" 등으로 구성 필요.
- `pickEditTargetsWithFileTree` 오버로드로 게이트 스크립트 경로를 fileTree에서 추정 (HarnessModel에 scriptFile이 없으므로).

---

## 미조치 사항 (M6 범위)

- UI 컴포넌트(EditPanel, StructuredFieldForm, RawFileEditor, DraftDiffView, AICommandBar, ApplyDialog, BackupRestorePanel) — M6 범위.
- HarnessStudioView editMode 토글 — M6 범위.
- ClaudeManual.tsx SECTIONS 갱신 — M7(사용자 가시 기능 완성 후).
