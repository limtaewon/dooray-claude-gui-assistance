---
id: ADR-harness-studio-003
title: 그래프 렌더링에 @xyflow/react 채택 & Clauday 디자인시스템 테마 통합
status: proposed
date: 2026-06-19
supersedes: []
domain: renderer-only
---

# 그래프 렌더링에 @xyflow/react 채택 & Clauday 디자인시스템 테마 통합

## 컨텍스트

Flow Canvas(PRD 7-1)와 Dry-run 경로 하이라이트(7-2)는 에이전트 노드·산출물 엣지·게이트 칩·병렬 그룹·RETURN 루프를 인터랙티브하게(클릭→Inspector, 줌/팬, L0~L3 토글 재구성) 그려야 한다. 사용자 결정으로 **`@xyflow/react` 도입이 확정**되었다(직접 SVG 비교 불필요). 단 Clauday는 자체 디자인시스템(시맨틱 토큰, 다크/라이트, useTheme, lucide-react)을 강제하므로 라이브러리 기본 비주얼을 그대로 쓰면 안 된다.

`@xyflow/react` 는 현재 `package.json` 에 없는 **신규 외부 의존성**이다.

## 결정

`@xyflow/react`(react-flow v12 계열)를 신규 의존으로 추가하고, 사용을 `components/HarnessStudio/flow/` 하위로 **격리**한다. DS 통합:

- 모든 노드는 **커스텀 노드 타입**(`AgentNode`/`GateNode`)으로 구현 — 기본 노드 스타일 미사용. 색=`PhaseColor`(DS 시맨틱 토큰), 모델배지=`Badge`(ds), 아이콘=`lucide-react`.
- 커스텀 엣지 `HandoffEdge`(라벨=산출물, 조건부=점선, RETURN=회귀색).
- `flowTheme.ts` 가 react-flow 배경/그리드/미니맵/컨트롤 색을 **CSS 변수(`--bg-*`/`--border-*`/`--text-*`)에 바인딩** → `useTheme` 변경 시 CSS 변수 상속만으로 다크/라이트 전환(재렌더 불필요).
- 그래프 구성은 순수함수 `buildGraph(model, levelId)` → nodes/edges. 레이아웃은 우선 **수동 컬럼 배치**(레벨별 좌→우)로 시작, 복잡해지면 `dagre` 추가 검토(추가 의존 시 본 ADR 갱신/신규 ADR).

## 대안과 기각 이유

1. **직접 SVG/Canvas 렌더링** — 기각(사용자 결정): 줌/팬·노드드래그·엣지라우팅·히트테스트를 자체 구현하면 공수 폭증, 인터랙션 품질 불안정. P1~P3 인터랙션 요구를 검증된 라이브러리로 흡수.
2. **react-flow 기본 노드 스타일 사용** — 기각: hex/기본 테마가 Clauday DS(시맨틱 토큰·다크라이트)와 충돌. CLAUDE.md 디자인 방침(이모지→lucide, hex→토큰) 위반. 커스텀 노드 필수.
3. **다른 그래프 라이브러리(cytoscape/d3-force)** — 기각: 사용자가 react-flow 채택을 이미 확정. React 친화성·커스텀 노드 React 컴포넌트 지원이 본 용도(클릭→Inspector React 패널)에 최적.

## 결과 (Consequences)

- 긍정: 인터랙션(줌/팬/클릭/토글재구성) 검증된 구현 위에서 빠르게 진행. 커스텀 노드가 React 라 Inspector 연동 자연스러움.
- 긍정: flow/ 격리로 의존 영향 국소화. 다른 5뷰는 react-flow 무의존.
- 부정/트레이드오프: 번들 크기 증가(react-flow). flow/Dry-run 뷰에서만 쓰므로 **동적 import(lazy)** 로 초기 로드 영향 최소화 권장.
- 부정: 신규 의존 = 보안/유지보수 표면 증가. 버전 핀 고정 + 정기 업데이트. 네이티브 모듈 아님(asarUnpack 불필요).
- 모니터링: Harness Studio 진입 시 초기 렌더 시간(노드 수 大 번들에서) 관측. 느리면 dagre 도입 또는 가상화 검토.
