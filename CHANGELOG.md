# Changelog

## [Unreleased] - Design System v1 (feat/design-system 브랜치)

Claude Design이 생성한 디자인 시스템을 실제 코드베이스에 점진 이식.
`handoff/` 폴더의 MIGRATION.md + bundle.md + screens/ 기반.

### Phase 1 — 토큰 CSS
- 브랜드 토큰 분리 (`:root`): clover-orange/blue, success/warning/danger/info/mention
- spacing 스케일 (`--space-0-5`~`--space-12`, Tailwind 4px base)
- radius 스케일 (`--radius-xs`~`--radius-xl`, `--radius-full`)
- type 스케일 (`--t-9`~`--t-24`) + 시맨틱 클래스 (`.text-title`/`.text-section`/`.text-body`/`.text-meta`/`.text-caption`/`.text-mini`/`.text-label`)
- `.num-xl`/`.num-lg` 대시보드 큰 숫자
- `.ai-gradient-bg`/`.ai-gradient-text` (주황→파랑)
- 라이트 팔레트 5종 (cool-minimal/crisp-white/soft-blue/graphite/paper) 전부 CSS에 선언
- 팔레트 적용 방식: 인라인 CSS 변수 주입 → `<html data-theme="light" data-palette="<id>">` 속성 방식으로 전환
- `useTheme` hook에 `palette` 필드 추가, setPalette/PALETTES/PALETTE_LABELS export
- theme + palette 모두 localStorage + electron-store 이중 기록

### Phase 2 — 공통 primitive 컴포넌트
`design-system.css`에 utility 클래스(`ds-*` prefix) 추가:
- `.ds-btn` (primary/secondary/ghost/danger/ai/success/orange/icon, xs/sm/md/lg)
- `.ds-chip` (blue/orange/emerald/red/violet/yellow/neutral)
- `.ds-card` (default/raised/flat), `.ds-input`, `.ds-avatar`, `.ds-badge-pill`
- `.ds-modal`, `.ds-toast`, `.ds-cp-*` (command palette), `.ds-menu`, `.ds-seg`
- `.ds-state-view` + `.ds-spinner`, `.ds-codeblock`, `.ds-kbd`
- `.ds-titlebar`, `.ds-tabbar`, `.ds-tab`

`src/renderer/src/components/common/ds/` 신설:
- Button.tsx / Chip.tsx / Badge.tsx / Avatar.tsx / Card.tsx / Input.tsx (+ Textarea, FieldLabel)
- Kbd.tsx / SegTabs.tsx / Modal.tsx (createPortal 기반)
- Toast.tsx (ToastHost + useToast context)
- CommandPalette.tsx (⌘K 스타일, 필터링 + 키보드 네비)
- StateViews.tsx (EmptyView/LoadingView/ErrorView)
- TimeAgo.tsx (상대시간 자동 업데이트)
- index.ts re-export

### Phase 3 — Shell (TitleBar + Sidebar)
- **TitleBar**: 높이 40px → 36px (`.ds-titlebar`). 우측에 **⌘K 커맨드 팔레트** 버튼 + **Dark/Light 테마 토글** 추가. 신호등 자리 padding 82px로 고정.
- **Sidebar**: 너비 64px → 56px (w-14). 네비 버튼 40×40 → 36×36 (w-9 h-9). radius 7px + gap 0.5 타이트.
- **App.tsx**: ToastHost로 전체 트리 감싸기, CommandPalette 상시 마운트, ⌘K 글로벌 단축키. command groups: 이동(11 뷰) + 명령(테마 토글).

### Phase 4-1 — MCP 화면
- DS PageHeader 패턴 적용 (Server 아이콘 + 타이틀 + 등록 수 + 우측 액션 버튼)
- Button / EmptyView / LoadingView 공통 컴포넌트로 교체
- `.ds-titlebar` 스타일을 따르는 레이아웃

### Phase 4-3 — Settings
- '앱 동작' 탭 라벨을 '외관 & 동작'으로 명확화
- 팔레트 선택 UI는 useTheme.setPalette와 연결되어 정상 작동 (Phase 1에서 완료)

### Phase 4-4 — Terminal
- 탭바를 `.ds-tabbar` + `.ds-tab` 클래스로 교체 (32px tabbar, 22px tab)

### Phase 5 — Dooray 탭바
- DoorayAssistant 상단 탭바를 `.ds-tabbar` + `.ds-tab`으로 교체
- AI 탭(dashboard/briefing/report/messenger)에 `.ai` 변형 (gradient + 오렌지)
- 전체 Dashboard/Briefing/Watcher 뷰 내부 리라이트는 향후 feature flag 기반 별도 작업

### 후속 작업 (v1.2+)
- Phase 4-2: Skills / Community / Monitoring / Usage 화면 세부 리라이트 (PageHeader/FilterBar 공통화)
- Phase 5 full: Dooray Dashboard/Briefing/Watcher 내부를 DS Dashboard.jsx 구조로 전면 교체 (feature flag `ui.v2.dooray`)
- Phase 6: Playwright 스냅샷 + 접근성(WCAG AA) 검증

### 호환성
- 기존 Tailwind 기반 컴포넌트 대부분 그대로 동작 (토큰 이름 1:1 호환)
- 기본 팔레트 `cool-minimal`이 이전 `[data-theme='light']`와 완전 동일 → 시각 변화 최소

## [1.1.0] - 2026-04-21

### v1 피드백 반영 (버그 수정)

- **캘린더 먹통 해결**: DoorayClient에 15초 요청 타임아웃 추가, CalendarService가 에러를 silent swallow하지 않고 UI에 표시. fallback이 5개 캘린더로 제한되던 문제 제거.
- **AI "Not logged in" 개선**: Claude CLI 인증 오류를 감지하여 복구 가이드 메시지 표시. 키체인 접근 불가능한 패키징 앱을 위해 Settings에서 `ANTHROPIC_API_KEY` 직접 입력 가능.
- **브리핑 fallback 제거**: AI JSON 파싱 실패 시 의미없는 기본값 대신 명확한 에러 표시. 누락된 필드는 안전한 기본값으로 보정.

### UX 개선

- **프로젝트 사이드바 강화**: 프로젝트 6개 이상일 때 인라인 검색창 노출. 마지막 선택한 프로젝트를 저장하여 앱 재시작 시 복원.
- **위키 커스텀 순서**: 사이드바에서 위/아래 화살표로 도메인 순서 변경 가능. 설정에 저장되어 재시작 후 유지.
- **터미널 UX**: '새 터미널' 버튼을 드롭다운으로 확장 — 일반 터미널 / Claude Code / 폴더 선택 후 시작. `⌘T`/`⌘W`/`⌘1-9` 단축키 유지.
- **입력창 빨간 테두리 제거**: 브라우저 기본 `:invalid` 상태의 box-shadow/outline 글로벌 오버라이드.

### Phase 1 — AI 업무 대시보드 (신규)

- **대시보드 탭 추가**: 두레이 진입 시 기본 화면.
- **상태별 집계 카드**: 전체 / 진행 중 / 등록 / 오늘 마감 / 완료 태스크 수를 한눈에.
- **자연어 태스크 생성**: "내일까지 로그인 API 리팩토링" 같은 지시 → AI가 제목/본문 구조화 → 미리보기 확인 후 두레이에 생성.
- **오늘 집중 태스크**: 진행 중 + 오늘 마감 태스크를 통합 표시.

### Phase 2 — AI 업무 보고

- **캘린더 이벤트에 회의록 생성 버튼**: 각 이벤트 hover 시 'AI 회의록' 버튼. 클릭하면 인라인으로 회의록 템플릿 표시 + 클립보드 복사.
- 기존 일간/주간 보고서 + 위키 초안 작성 기능 유지.

### Phase 3 — Claude Code 통합 (신규)

- **태스크 상세 패널에 'AI 코드리뷰' 버튼**: 작업 폴더 선택 → git diff 읽기 → AI가 마크다운 리뷰 생성 → 두레이 태스크 코멘트로 자동 게시.
- 리뷰 섹션: 요약 / 잘된 점 / 개선 제안 / 버그·리스크.

### Phase 4 — 팀 인사이트

- **인사이트 탭 노출**: 프로젝트별 워크로드 시각화 (기존 TeamInsights 컴포넌트).

### 릴리즈/CI

- **macOS dmg 빌드 추가**: GitHub Actions `Release` 워크플로우에 `build-macos` job 추가. 태그 push 시 Windows exe와 macOS dmg가 같은 릴리즈에 업로드됨. Apple 서명 secrets가 있으면 서명, 없으면 unsigned.

## [1.0.0] - 2026-04-16

- 초기 릴리즈: Dooray + Claude Code 통합 GUI 앱 (Electron).
