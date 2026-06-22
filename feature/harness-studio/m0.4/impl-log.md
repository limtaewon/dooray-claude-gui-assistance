# impl-log — Harness Studio M0.4

agent: renderer-engineer
date: 2026-06-19
milestone: M0.4 (View 유니온 + Sidebar 항목 + 빈 HarnessStudioView 마운트)

---

## 변경 파일

| 파일 | 변경 종류 | 설명 |
|---|---|---|
| `src/renderer/src/App.tsx` | 수정 | `View` 유니온에 `'harness'` 추가, `HarnessStudioView` import, `vis('harness')` 마운트 블록 추가, RecentViewsPalette 레이블 케이스 추가, CommandPalette 이동 항목 추가 |
| `src/renderer/src/components/Layout/Sidebar.tsx` | 수정 | `SidebarView` 유니온에 `'harness'` 추가, `Workflow` 아이콘 import, `CUSTOMIZABLE_NAV_ITEMS`에 `{ view: 'harness', icon: Workflow, label: 'Harness Studio' }` 추가 |
| `src/renderer/src/components/HarnessStudio/HarnessStudioView.tsx` | 신규 | M0 placeholder. `active?: boolean` prop(다른 뷰와 동일 시그니처). 헤더(Workflow 아이콘 + 타이틀 + '미리보기' 칩) + EmptyView 빈 상태 안내. |

---

## 설계 결정

- **아이콘 선택**: `Workflow`(lucide-react). 하니스가 "에이전트 작업 흐름 시각화"를 핵심 메타포로 삼으므로 Workflow가 가장 직관적. Boxes/Network는 구조 강조, GitBranch는 git 작업과 혼동 우려.
- **레이블**: `'Harness Studio'` 영문 유지. 다른 항목 중 기술 브랜드명(MCP, Claude 등)은 영문 그대로이고, 사용자 피드백 문구("하니스를 import 하세요")는 한국어로 자연스럽게.
- **Sidebar 위치**: `git` 바로 뒤, `community` 앞 — 개발/도구 그룹(terminal, git, harness)이 모이도록.
- **기존 prefs 사용자**: `resolveOrderedItems`의 신규 항목 append 로직이 자동 처리. 별도 마이그레이션 불필요.
- **`active` prop 사용 안 함**: M0 placeholder라 실제 lazy init 로직 없음. 파라미터명 앞에 `_active`로 표기해 미사용 의도 명시.
- **`window.api.harness.*` 호출 없음**: MPE 병렬 작업(M0.1~0.3)이 완료되기 전이므로 정적 UI만.

---

## 확인 사항

- `node_modules` 미설치 상태(설치 진행 중)라 `npm run build` 실행 불가. 타입 에러 여부는 설치 완료 후 확인 필요.
- 코드 자체의 타입 정합성:
  - `View` 유니온이 `App.tsx`와 `Sidebar.tsx` 양쪽에 선언되어 있으나 둘 다 동일하게 `'harness'` 추가됨 — 기존 패턴 유지.
  - `HarnessStudioView`의 `active` prop은 `MonitoringView`, `ClaudeCodeSessionsView`와 동일한 `{ active?: boolean }` 시그니처.
  - `EmptyView`의 `icon` prop은 `typeof Inbox` 타입인데 `Workflow`는 lucide-react의 동일 FC 타입이므로 호환.

---

## 후속 마일스톤 연결

- M4: `ImportWizard` 구현 시 `HarnessStudioView.tsx`에 상태(model/step) 추가, EmptyView 대신 위저드 마운트.
- M0.1~0.3 (MPE): shared 타입(`harness.ts`, IPC 채널) 완료 후 M4에서 `window.api.harness.*` 호출 연결.
