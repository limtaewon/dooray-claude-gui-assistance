# Clauday Design System — Handoff Package

실제 Clauday 코드베이스 (`src/…`) 로 이식하기 위한 자료 묶음.

## 포함 내역

```
handoff/
├── README.md         ← 이 파일
├── MIGRATION.md      ← 단계별 마이그레이션 plan (여기부터 읽으세요)
├── bundle.md         ← 12개 소스 파일 전체 내용 한 파일에 통합 (Cmd+F 로 조회)
└── screens/
    ├── dashboard.png ← Dashboard 탭 (두레이 대시보드)
    ├── briefing.png  ← AI 브리핑 탭
    ├── watcher.png   ← 와쳐 모니터링 화면
    ├── terminal.png  ← 터미널 (+ Claude Code 탭)
    └── mcp.png       ← MCP 서버 관리
```

## 추천 사용 순서

1. **`MIGRATION.md`** 통독 — 토큰 → 공통 컴포넌트 → 화면 순서로 PR 설계
2. **`screens/*.png`** 을 Figma 나 Preview 에 띄워놓고 목표 UI 로 참조
3. **`bundle.md`** 에서 필요한 컴포넌트 소스를 Cmd+F 로 찾아 복붙
   - 예: `── FILE: ui_kits/clauday-desktop/primitives.jsx ──` 로 점프

## 소스 파일 원문이 필요할 때

`bundle.md` 대신 각 파일을 직접 받고 싶으면 왼쪽 프로젝트 파일 트리에서:

- `colors_and_type.css` — 토큰 CSS (다크 + 라이트 5종 팔레트)
- `ui_kits/clauday-desktop/` — UI kit 디렉토리 전체
  - `shell.css` — primitive CSS 클래스 (btn/card/input/...)
  - `primitives.jsx` — Button / Input / Card / Badge / Tabs / Dropdown
  - `components.jsx` — Modal / Toast / CommandPalette / EmptyState / Avatar / DateTime
  - `Shell.jsx` — TitleBar + Sidebar 레이아웃
  - `Dashboard.jsx` / `Briefing.jsx` / `McpServers.jsx` / `Terminal.jsx` / `Monitoring.jsx`
  - `theme.jsx` — ThemeProvider + 팔레트 토글 hook
  - `index.html` — 모든 화면을 한 번에 돌아보는 데모 진입점

## 화면 매핑

| 스크린샷 | 디자인 시스템 컴포넌트 | 대상 파일 |
|---|---|---|
| `dashboard.png` | `Dashboard.jsx` | `src/components/Dooray/tabs/DashboardTab.tsx` (신설) |
| `briefing.png` | `Briefing.jsx` | `src/components/Dooray/tabs/BriefingTab.tsx` (신설) |
| `watcher.png` | `Monitoring.jsx` (watcher 섹션) | `src/components/Dooray/tabs/WatcherTab.tsx` (신설) |
| `terminal.png` | `Terminal.jsx` | `src/components/Terminal/TerminalView.tsx` (스타일만 교체) |
| `mcp.png` | `McpServers.jsx` | `src/components/MCP/MCPManager.tsx` (교체) |

## 주의

- 모든 JSX 파일은 babel-standalone 런타임용으로 작성됨 → TS 포팅 시 하단 `Object.assign(window, {...})` 제거 후 `export` 로 교체
- 타이포/스페이싱 값을 **그대로** 옮기세요. 눈대중으로 미세조정하면 밀도가 다시 풀어집니다.
- 라이트 팔레트 5종은 단계 1에서 전부 토큰만 선언해두고, 실제 토글 UI 는 단계 4-3 (Settings) 에서 붙이는 걸 권장
