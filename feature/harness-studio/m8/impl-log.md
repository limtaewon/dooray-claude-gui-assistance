---
task: harness-studio-m8
agent: renderer-engineer
date: 2026-06-22
---

# Impl Log — Harness Studio M8: P3 기능 일괄 (오버레이·Doctor·Compare·Export·EXPLAIN UI)

## 변경한 파일

### 신규 (순수 함수)

- `src/renderer/src/components/HarnessStudio/views/doctorUtils.ts`
  — 7가지 정적 정합 점검 순수함수. `runDoctorChecks(model)` → `DoctorReport`. AI 없이 즉시 실행.
  점검: 고아 에이전트 / 체인 미정의 참조 / 소비자 없는 산출물 / 생산자 없는 산출물 / 게이트-페이즈 불일치 / unknown 모델 / score 결측.
  `buildWeakAxesSummary` 로 6축 약점 순위도 반환.

- `src/renderer/src/components/HarnessStudio/views/compareUtils.ts`
  — 두 HarnessModel diff 순수함수. `diffModels(left, right)` → `HarnessDiff`.
  에이전트(`diffAgents`), 레벨 체인(`diffLevelChains`), 게이트(`diffGates`), 점수(`diffScores`) 각각 분리된 순수함수로 구현.
  delta 계산: 정규화 백분율 기준(0~100%).

- `src/renderer/src/components/HarnessStudio/export/exportHtml.ts`
  — `buildHtmlReport(model)` → 독립 HTML 문자열 직렬화. 인라인 CSS, 다크/라이트 media query.
  `downloadHtmlReport(model)` — Blob URL 다운로드 폴백 (main IPC 없을 때).
  `copyHtmlReportToClipboard(model)` — 클립보드 복사 대안.
  **PNG export 미구현**: `html-to-image` 새 의존성 필요 → 후속 마일스톤으로 명시.

### 신규 (React 컴포넌트)

- `src/renderer/src/components/HarnessStudio/views/DoctorPanel.tsx`
  — `doctorUtils.runDoctorChecks` 결과를 FAIL→WARN→PASS 순으로 표시.
  섹션: 전체 요약 배지 + 점검 항목 목록 + 6축 약점 테이블.
  각 항목은 초기 expanded 상태 = severity≠PASS (문제 항목만 펼침).

- `src/renderer/src/components/HarnessStudio/views/CompareView.tsx`
  — `cachedList` 에서 비교 대상 선택 → `window.api.harness.normalize` 재호출(캐시 hit 즉시) → `diffModels` diff 표시.
  섹션별 접이식(Accordion): 에이전트/레벨/게이트/점수 diff 테이블.
  changed/added/removed 색 구분: emerald/red/yellow/neutral.

### 수정

- `src/renderer/src/components/HarnessStudio/flow/buildGraph.ts`
  — `overlayEnabled: boolean = true` 파라미터 추가.
  `AgentNodeData` 에 `overlayDisabled: boolean`, `originalModel?: HarnessModelName` 필드 추가.
  오버레이 반영 로직: `disabledAgents` → `effectiveActiveChain` 에서 제외 + dimmedAgents 영역 배치 + `overlayDisabled=true` 마킹.
  `modelOverrides` → 해당 에이전트 노드의 `model` 을 오버라이드 값으로 교체, `originalModel` 에 원본 저장.
  체인 맵(`chainColMap/chainRowMap`)을 `effectiveActiveChain` 기준으로 재계산.
  게이트/엣지 처리도 `effectiveActiveChain` 기준으로 통일.

- `src/renderer/src/components/HarnessStudio/inspector/AgentInspector.tsx`
  — `bundlePath?: string` prop 추가.
  "AI 설명 생성" 버튼 → `window.api.harness.explain?.({ path, topic })` optional chaining 호출.
  explain IPC 가 없는 환경(main 미구현 시)에서도 graceful degradation.
  결과 markdown 을 접이식 패널로 표시(최대 높이 48, overflow-y-auto).
  `import type React` 중복 제거.

- `src/renderer/src/components/HarnessStudio/HarnessStudioView.tsx`
  — `StudioTab` 타입에 `'doctor' | 'compare'` 추가 → 8뷰 탭.
  `STUDIO_TABS` 에 Doctor / Compare 항목 추가.
  헤더 버튼 3개 추가: Doctor(이동) / Compare(이동) / Export(HTML 다운로드).
  `TabContent` 에 `cachedList` prop 추가 → CompareView 에 전달.
  `TabPlaceholder` 에서 `TAB_PLACEHOLDER_LABELS` 참조 제거(삭제된 상수).

- `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx`
  — `harness-studio` 섹션 갱신:
    · Agent Inspector AI 설명 버튼 안내 추가
    · 오버레이 반영(disabledAgents/modelOverrides) 항목 추가
    · 주요 뷰 테이블에 Doctor/Compare 행 추가
    · 헤더 버튼(Doctor/Compare/Export) 테이블 추가
    · Doctor 정합 점검 7가지 항목 설명 추가
    · Compare diff 항목 설명 추가

- `src/renderer/src/components/HarnessStudio/__tests__/buildGraph.test.ts`
  — `makeModel` 에 `overlay` 필드 지원 추가.
  오버레이 테스트 2 describe 블록 추가 (총 10개 신규 케이스):
    · `disabledAgents` 노드 overlayDisabled 마킹, 체인 엣지 제외, `overlayEnabled=false` 비활성화
    · `modelOverrides` 노드 model 교체, originalModel 저장, 미오버라이드 에이전트 originalModel=undefined

### 신규 (테스트)

- `src/renderer/src/components/HarnessStudio/__tests__/doctorUtils.test.ts`
  — 29개 케이스: 각 점검 함수 독립 테스트 + `runDoctorChecks` 통합 3케이스.

- `src/renderer/src/components/HarnessStudio/__tests__/compareUtils.test.ts`
  — 21개 케이스: `diffAgentFields`, `diffAgents`, `diffLevelChains`, `diffGates`, `diffScores`, `diffModels` 각각 독립 테스트.

## 결정 사항

### EXPLAIN IPC 시그니처 — optional chaining
`window.api.harness.explain` 이 아직 main 에 구현되지 않았으므로,
`window as unknown as { api?: { harness?: { explain?: ... } } }` 캐스팅 + optional chaining 으로 호출.
IPC 없는 환경에서 버튼은 노출되나 호출 시 "AI 설명을 받지 못했습니다" 에러로 graceful degradation.
시그니처: `{ path: string; topic: string } => Promise<{ markdown: string }>`

### PNG Export — 후속 작업
`html-to-image` 패키지가 새 의존성이고 번들 크기 영향이 있어 이번 M8 에서는 HTML-only 로 구현.
PNG export 는 별도 마일스톤에서 의존성 추가 여부를 결정 후 구현.

### Doctor — AI 없는 정적 점검 원칙
`runDoctorChecks` 는 순수함수로 외부 호출 없음. HarnessModel 데이터만 참조.
Doctor 탭을 열 때 즉각 결과 표시 — 로딩 상태 없음.

### Compare — cachedList 전달 경로
`HarnessStudioView` 가 이미 `cachedList` 를 보유하므로 `TabContent` props 로 내려줌.
CompareView 내에서 선택한 항목을 `window.api.harness.normalize` 로 재로드 (캐시 hit 시 즉시).

### overlayEnabled 파라미터 기본값 true
기존 `buildGraph` 호출부(FlowCanvas 등)는 파라미터 추가 없이 자동으로 오버레이 반영.
테스트에서 `overlayEnabled=false` 로 오버레이 무시 검증 가능.

## 테스트 결과

- 전체: **90 파일, 1203 테스트 통과** (실패 0)
- 신규 M8: doctorUtils (29개) + compareUtils (21개) + buildGraph 오버레이 (10개) = 60개
- typecheck: `tsc --noEmit` 양쪽 통과 (exit 0)
- build: `electron-vite build` 성공 (renderer 3.8MB)

## 참조

- `docs/planning/harness-studio-plan.md` M8 항목
- `docs/planning/harness-studio-prd.md` §5(오버레이), §11(P3), §12-7(Doctor), §12-8(Compare)
- `src/shared/types/harness.ts` — `HarnessOverlay`, `HarnessModel` 타입 참조
- M5: buildGraph 기반 구현 (flow/buildGraph.ts)
- M6: views/* 패널 컴포넌트 패턴 참조
