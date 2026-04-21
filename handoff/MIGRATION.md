# Clauday Design System → 실제 앱 마이그레이션 plan

디자인 시스템 (`colors_and_type.css` + `ui_kits/clauday-desktop/*`) 을
실제 코드베이스 (`src/…`) 에 점진적으로 이식하기 위한 단계별 가이드.

핵심 원칙: **토큰 → 공통 컴포넌트 → 화면** 순서로, 각 단계마다 독립 PR.
시각적 변화가 한꺼번에 터지지 않게, 롤백 포인트를 명확히.

---

## 요약 (TL;DR)

| 단계 | 브랜치 후보 | 리스크 | 작업량 |
|---|---|---|---|
| 1. 토큰 CSS 교체 | `feat/ds-tokens` | 낮음 — 이름이 거의 호환 | 0.5일 |
| 2. 공통 컴포넌트 추가 | `feat/ds-primitives` | 낮음 — 신규 파일만 | 1일 |
| 3. TitleBar / Sidebar 교체 | `feat/ds-shell` | 중간 — 전역 레이아웃 | 0.5일 |
| 4. MCP / Skills / Monitoring 화면 교체 | 화면별 PR | 중간 | 각 0.5–1일 |
| 5. Dashboard(Dooray) 화면 교체 | `feat/ds-dooray` | 높음 — 핵심 뷰 | 2일 |
| 6. 정리 & 스냅샷 테스트 | `chore/ds-cleanup` | 낮음 | 0.5일 |

---

## 0. 사전 준비

```bash
git checkout -b feat/ds-tokens
mkdir -p src/design-system
```

이 `handoff/` 폴더를 `~/Downloads/clauday-ds/` 쯤에 풀어두고 복붙용 참조로 씁니다.
`bundle.md` 에 모든 소스가 한 파일로 있으니 `Cmd+F` 로 바로 찾아 쓰세요.

---

## 1. 토큰 CSS 교체 (`src/index.css`)

현재 `src/index.css` 와 디자인 시스템 `colors_and_type.css` 의
토큰 이름은 **거의 1:1 호환**입니다. 다만 디자인 시스템 쪽이:

- **라이트 팔레트가 5종** (`cool-minimal` / `crisp-white` / `soft-blue` / `graphite` / `paper` — Clauday 기존 네이밍 유지) 으로 확장됐고
- **의미 토큰 (`--fg-success`, `--fg-danger`, `--bg-success-soft` 등) 이 정리**돼 있으며
- **쉐도우/라디우스/spacing 스케일이 엄격화**돼 있습니다.

### 1-1. 추가되는 토큰 (손실 없이 그냥 붙이세요)

```css
/* 상태 색 — 두 테마 공통으로 의미 토큰이 새로 생김 */
--fg-success / --bg-success-soft / --border-success
--fg-warning / --bg-warning-soft
--fg-danger  / --bg-danger-soft
--fg-info    / --bg-info-soft

/* 라디우스 */
--radius-xs: 4px; --radius-sm: 6px; --radius-md: 8px;
--radius-lg: 12px; --radius-xl: 16px; --radius-pill: 999px;

/* Spacing 스케일 (Linear 수준으로 타이트) */
--space-1: 4px;  --space-2: 8px;   --space-3: 12px;
--space-4: 16px; --space-5: 20px;  --space-6: 24px;
--space-8: 32px; --space-10: 40px; --space-12: 48px;
```

### 1-2. 라이트 팔레트 5종 (전부 포함)

현재 앱은 `[data-theme='light']` 하나지만, 디자인 시스템에는 **Clauday 기존 이름 그대로** 5종이 정의돼 있습니다:

| 팔레트 id | 톤 | 용례 |
|---|---|---|
| `cool-minimal` | 차가운 중성 — **현재 light 테마와 동일** | 기본값, 대부분의 사용자 |
| `crisp-white` | 거의 순백 + 높은 대비 | 밝은 환경·프레젠테이션 |
| `soft-blue` | 은은한 블루 그레이 | 장시간 코딩 — 눈 피로 적음 |
| `graphite` | 짙은 중성 그레이 | 중간 톤 선호, 대비 강조 |
| `paper` | 따뜻한 웜 그레이 (종이 느낌) | 문서 작성·리딩 중심 |

활성화: `<html data-theme="light" data-palette="soft-blue">` 식. 다크 모드엔 팔레트 구분 없음.

#### 결정
- **5종 전부 포함**으로 진행 (`colors_and_type.css` 에 이미 전부 선언돼 있음 → 단순 복붙)
- Settings → 외관 탭에 **팔레트 선택 UI** 필수 (단계 4-3 에서 구현)
- `useTheme.ts` 에 `palette: 'cool-minimal' | 'crisp-white' | 'soft-blue' | 'graphite' | 'paper'` 필드 추가, `<html>` 태그에 `data-palette` 반영
- 기본값: `cool-minimal` (현 `[data-theme='light']` 그대로라 사용자에게 시각적 변화 0)

#### Claude DS 내부 네이밍 ↔ Clauday 팔레트 매핑

Claude 쪽 디자인 탐색 단계에서 쓰던 임시 라벨과의 대조표 (참고용 — **코드에는 Clauday 이름만 쓰세요**):

| Claude DS (탐색용 임시 라벨) | Clauday 팔레트 id | 선택 근거 |
|---|---|---|
| `default` (cool neutral) | `cool-minimal` | 둘 다 차가운 중성 베이스, 현행 light 기본값 — 완전 동일 |
| `warm` (따뜻한 베이지) | `paper` | 웜톤 종이 질감 — 동일 컨셉 |
| `slate` (차분한 회색) | `graphite` | 진한 중성 그레이 — 동일 컨셉 |
| `paper` (종이 질감, 거의 흰색) | `crisp-white` | 가장 밝고 대비 높은 계열 → Clauday에선 `crisp-white` 가 해당 |
| `contrast` (고대비) | `soft-blue` | Clauday에 고대비 프리셋은 없음 → 대응 변형인 `soft-blue` 로 매핑 (고대비가 필요하면 단계 1-4 참고) |

> ⚠️ `paper` 라는 이름이 양쪽 체계에 **모두 있으나 가리키는 팔레트가 다릅니다**. 혼동 주의 — 실제 구현에서는 **Clauday 기준 `paper` (웜톤)** 만 사용.

### 1-4. 고대비(accessibility) 프리셋이 필요하면

현재 Clauday 5종에는 WCAG AAA 급 고대비 프리셋이 없습니다. 필요하면 `cool-minimal` 복제 + 텍스트를 `#000` / 배경을 `#FFF` / 보더를 `#000` 으로 밀어 `contrast` 이름으로 한 개 더 추가할 수 있지만, **이번 마이그레이션 범위 밖**. 요청이 생기면 별도 티켓으로 분리 권장.

### 1-3. 실행

```bash
# colors_and_type.css 의 :root / [data-theme=...] 블록을
# src/index.css 의 해당 블록에 그대로 붙여넣기
# (@tailwind, xterm, markdown-body 블록은 건드리지 말 것)
```

**확인 항목:**
- [ ] 다크/라이트 토글 후 기존 화면 전부 멀쩡한지
- [ ] `--bg-primary` alias 가 살아있는지 (`bg-bg-primary` Tailwind 클래스가 깨지지 않아야 함)
- [ ] `tailwind.config.js` 에서 이 토큰들을 참조하는 부분이 있으면 이름 유지

---

## 2. 공통 컴포넌트 추가 (`src/components/common/`)

현재 `common/` 에는 7개 파일만 있어서 **대부분의 UI 가 각 화면에서 직접 조립**되고 있습니다.
디자인 시스템의 primitives 를 TS 로 포팅해서 공통화하세요.

### 2-1. 신규 파일 (디자인 시스템 primitives.jsx / components.jsx 기반)

```
src/components/common/
├── Button.tsx          # variant: primary | secondary | ghost | danger, size: sm | md
├── Input.tsx           # + SearchInput, NumberInput
├── Card.tsx            # + CardHeader, CardBody, CardFooter
├── Badge.tsx           # status 포함: success / warning / danger / info / neutral
├── Tabs.tsx            # 세그먼트 탭 + 라인 탭 2가지
├── Dropdown.tsx        # 기존 Select 대체
├── Modal.tsx           # 포털 기반, esc / backdrop-click 지원
├── Toast.tsx           # + useToast hook, ToastHost
├── CommandPalette.tsx  # ⌘K 전역 팔레트
├── EmptyState.tsx      # StateViews 확장 — 현재 것이랑 통합
├── Avatar.tsx          # 이니셜 + 색상 해시
├── DateTime.tsx        # 상대시간 + 툴팁 절대시간
└── index.ts            # re-export
```

### 2-2. JSX → TSX 포팅 팁

디자인 시스템 소스는 babel-standalone 용이라 타입이 없어요. 포팅할 때:

1. 각 파일 맨 아래 `Object.assign(window, {...})` 를 지우고 `export` 로 교체
2. `React.forwardRef` 는 `React.forwardRef<HTMLButtonElement, ButtonProps>` 식으로 타입 달기
3. 스타일은 className 기반. Tailwind 를 쓰거나, 디자인 시스템의 `shell.css` 에 있는
   클래스 (`.btn`, `.btn-primary`, `.card`, `.input` …) 를 `src/index.css` 뒤에
   그대로 붙여넣고 공유
4. 아이콘은 이미 `lucide-react` 쓰고 있으니 그대로 매칭

### 2-3. 확인 항목
- [ ] Storybook 같은 게 없으면 `src/components/common/__preview__.tsx` 임시 페이지에서
      모든 primitive 를 한 페이지에 렌더해서 눈으로 확인
- [ ] 기존 로컬 `<button className="bg-accent-blue ...">` 들은 **이 단계에서 건드리지 마세요**
      (다음 단계에서 화면별로 교체)

---

## 3. Shell — TitleBar / Sidebar 교체

### 3-1. TitleBar (`src/components/Layout/TitleBar.tsx`)

디자인 시스템 `Shell.jsx` 의 titlebar 참고:

- 좌측: 신호등 + 앱 아이콘 + **"Clauday" 워드마크 + "Claude Code GUI" subtitle** (현재 없음)
- 우측: 전역 검색 (⌘K 트리거) + Dark/Light 토글
- 높이 **36px**, `-webkit-app-region: drag`

### 3-2. Sidebar (`src/components/Layout/Sidebar.tsx`)

현재도 아이콘 사이드바인데, 디자인 시스템에서:

- 너비 **44px** 고정 (현재보다 살짝 좁아짐)
- 아이콘 영역 32×32, 활성 상태는 왼쪽 2px 블루 바 + 배경 `--bg-active`
- 네비 아이템에 **상단 그룹 (Dashboard/Dooray/Watcher/Terminal/Git)** 과
  **하단 그룹 (Manual/Settings)** 분리 — 현재도 비슷하지만 구분선을 명확히
- Dooray 활성 시 우상단 모서리에 **orange dot** (현재 알림 배지 유지)

---

## 4. 화면별 교체 (화면당 독립 PR)

**순서 권장: MCP → Skills → Monitoring → Settings → Terminal → Dooray (Dashboard)**.
가장 단순한 화면부터 바꿔서 패턴을 확립하고, 마지막에 가장 복잡한 Dooray.

### 4-1. MCP (`src/components/MCP/MCPManager.tsx`)

디자인 시스템 `McpServers.jsx` 참고:

- 2열 그리드, 카드당 **min-width: 320px** (현재 카드 이름이 잘리는 이슈 해결)
- 헤더: 아이콘 + 이름 + `Badge(status)` + 우측 액션 아이콘 3개 (편집/토글/삭제)
- 본문: `command` + args 를 code chip 나열
- 푸터 힌트: `~/.clauday/mcp.json` path + ⌘R refresh

### 4-2. Skills / Community / Monitoring / Usage

모두 비슷한 패턴 — **리스트/그리드 + 필터 바** 조합. 공통 컴포넌트:
- `<PageHeader title actions/>` 신설 권장 (제목 + 우측 액션 버튼 묶음)
- `<FilterBar>` (검색 + 칩 필터)
- 빈 상태는 `<EmptyState>` 로 통일

### 4-3. Settings (`src/components/Settings/SettingsView.tsx`)

- 좌측 탭 (세그먼트) → **외관 / AI 모델 / Dooray / MCP / 데이터 / 정보** 6탭
- **외관 탭에 팔레트 선택 UI 추가** — 5종 스와치 라디오 (`cool-minimal` / `crisp-white` / `soft-blue` / `graphite` / `paper`), 각 스와치는 해당 팔레트의 `--bg-base` + `--bg-surface` + `--text-primary` + `--accent-blue` 4색을 2×2 로 보여주면 충분
- 토글 / 라디오 / 슬라이더 모두 공통 컴포넌트로

### 4-4. Terminal (`src/components/Terminal/TerminalView.tsx`)

- 탭바 + 터미널 영역. 디자인 시스템과 거의 동일 — 탭 스타일만 업데이트
- `data-theme` 변경 시 xterm theme 도 같이 갈아끼우는지 점검

### 4-5. Dooray (`src/components/Dooray/DoorayAssistant.tsx`) ⚠️ 가장 큰 변경

디자인 시스템의 **Dashboard / Briefing / Watcher** 3탭 구조를 여기 적용.
대시보드/브리핑/와쳐 컴포넌트를 `src/components/Dooray/` 하위에 신설:

```
Dooray/
├── DoorayAssistant.tsx    # 탭 컨테이너 (기존)
├── tabs/
│   ├── DashboardTab.tsx   # 디자인 시스템 Dashboard.jsx 기반
│   ├── BriefingTab.tsx    # Briefing.jsx 기반
│   └── WatcherTab.tsx     # Monitoring.jsx 기반 (watcher 파트만)
```

리스크가 크니 **feature flag** (`settings.get('ui.v2.dooray')`) 뒤로 숨겨서
내부 dogfood 한 뒤 전환하는 걸 권장.

---

## 5. 검증 & 정리

### 5-1. 스냅샷
- Playwright 로 화면당 다크/라이트 두 장씩 캡처해서 PR 에 첨부
- **이 폴더의 `screens/*.png` 이 목표 UI** — 픽셀까지는 아니어도 밀도/여백/톤 일치가 기준

### 5-2. 접근성
- 모든 아이콘 버튼 `aria-label`
- 모달 focus trap, esc close
- 다크/라이트 contrast WCAG AA 통과 (이미 토큰 설계상 맞춰져 있음)

### 5-3. 정리
- 사용 안 쓰게 된 로컬 스타일 제거
- `tailwind.config.js` 에서 토큰 재노출 블록 최신화
- `CHANGELOG.md` 에 "Design System v1 적용" 기록

---

## 파일 매핑 치트시트

| 디자인 시스템 파일 | 대상 위치 |
|---|---|
| `colors_and_type.css` (토큰 블록) | `src/index.css` (`:root` / `[data-theme=…]`) |
| `ui_kits/clauday-desktop/shell.css` (primitive 클래스) | `src/index.css` 뒤에 append |
| `primitives.jsx` → Button/Input/Card/Badge/Tabs/Dropdown | `src/components/common/*.tsx` |
| `components.jsx` → Modal/Toast/CommandPalette/EmptyState/Avatar | `src/components/common/*.tsx` |
| `Shell.jsx` → TitleBar/Sidebar | `src/components/Layout/*.tsx` |
| `Dashboard.jsx` | `src/components/Dooray/tabs/DashboardTab.tsx` |
| `Briefing.jsx` | `src/components/Dooray/tabs/BriefingTab.tsx` |
| `McpServers.jsx` | `src/components/MCP/MCPManager.tsx` |
| `Terminal.jsx` | `src/components/Terminal/TerminalView.tsx` 스타일 부분 |
| `Monitoring.jsx` (watcher 섹션) | `src/components/Dooray/tabs/WatcherTab.tsx` |

---

## 알려진 차이점 / 결정 필요

1. **폰트 스택**: 디자인 시스템은 Pretendard 우선, 현재 코드는 Inter 우선.
   → Settings 외관 탭에서 선택 가능한 옵션으로 유지 (`useFontSettings.ts` 가 이미 있음)
2. **Command Palette**: 디자인 시스템엔 있지만 현재 앱엔 없음.
   → 2단계에서 추가하고, 전역 단축키 (`⌘K`) 등록 필요 (main process 쪽도 한 번 점검)
3. **워터처(Watcher) 데이터 모델**: 디자인 시스템 쪽 mock 기준으로 만들어진 UI.
   실제 API 와 필드가 일치하는지 `src/components/Monitoring/` 보고 조정 필요
4. **아이콘**: 디자인 시스템은 lucide 사용, 현재 앱도 lucide — OK
