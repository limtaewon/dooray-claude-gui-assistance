# Clauday Design System — Handoff Source Bundle
Generated for porting into the real Clauday codebase.
All files are UTF-8. JSX files assume React 18 + `@babel/standalone` at runtime
(no build step in the design repo); when porting you'll compile them with your
existing Vite/TSX toolchain and strip the `Object.assign(window, {...})` shims
at the bottom of each file in favor of proper `export` statements.

Files included (in this order):
  1. colors_and_type.css
  2. ui_kits/clauday-desktop/shell.css
  3. ui_kits/clauday-desktop/index.html
  4. ui_kits/clauday-desktop/primitives.jsx
  5. ui_kits/clauday-desktop/components.jsx
  6. ui_kits/clauday-desktop/theme.jsx
  7. ui_kits/clauday-desktop/Shell.jsx
  8. ui_kits/clauday-desktop/Dashboard.jsx
  9. ui_kits/clauday-desktop/Briefing.jsx
  10. ui_kits/clauday-desktop/McpServers.jsx
  11. ui_kits/clauday-desktop/Terminal.jsx
  12. ui_kits/clauday-desktop/Monitoring.jsx

────────────────────────────────────────────────────────────────────


── FILE: colors_and_type.css ──
```css
/* ============================================================
   Clauday Design Tokens
   Dark default + 5 light palettes + semantic type
   Source of truth: src/index.css + ThemePicker.tsx
   ============================================================ */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css');

/* -------- brand (테마 무관) -------- */
:root {
  --clover-orange:        #EA580C;   /* Dooray */
  --clover-orange-light:  #FB923C;
  --clover-orange-soft:   #FBE4D5;
  --clover-blue:          #2563EB;   /* Claude */
  --clover-blue-light:    #3B82F6;
  --clover-blue-soft:     #DCE6FB;

  /* 시맨틱 */
  --success:  #22C55E;
  --warning:  #FBBF24;
  --danger:   #EF4444;
  --info:     #3B82F6;
  --mention:  #A78BFA;

  /* spacing (Tailwind 4px base) */
  --space-0-5: 2px;   --space-1: 4px;    --space-1-5: 6px;
  --space-2:   8px;   --space-2-5: 10px; --space-3: 12px;
  --space-4:   16px;  --space-5: 20px;   --space-6: 24px;
  --space-8:   32px;  --space-10: 40px;  --space-12: 48px;

  /* radii (표준) */
  --radius-xs:  4px;  /* 뱃지/칩 */
  --radius-sm:  6px;  /* 작은 버튼·필드 행·탭 */
  --radius-md:  8px;  /* 카드·버튼·입력 대부분 */
  --radius-lg:  12px; /* 컨테이너·모달 */
  --radius-xl:  16px; /* 대형 힐로 */
  --radius-full: 9999px;

  /* type families */
  --font-ui:    'Inter', 'Pretendard Variable', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', system-ui, sans-serif;
  --font-mono:  'JetBrains Mono', ui-monospace, SFMono-Regular, 'Menlo', monospace;

  /* type scale (px, 16px 기준) */
  --t-9:  9px;
  --t-10: 10px;
  --t-11: 11px;
  --t-12: 12px;
  --t-13: 13px;
  --t-14: 14px;
  --t-15: 15px;
  --t-16: 16px;
  --t-18: 18px;
  --t-20: 20px;
  --t-24: 24px;

  /* app font scaling hook */
  --app-font-scale: 1;
  --app-font-family: var(--font-ui);
}

/* ============================================================
   THEME — light default (Cool Minimal)
   ============================================================ */
:root,
[data-theme='light'] {
  /* 배경 레이어 (4단 계단) */
  --bg-sidebar:        #E9ECF2;
  --bg-base:           #EFF1F5;
  --bg-surface:        #F6F7FA;
  --bg-surface-raised: #FCFCFD;
  --bg-primary:        var(--bg-base);
  --bg-surface-hover:  #E3E6EC;
  --bg-subtle:         #E6E9EF;
  --bg-hover:          #E3E6EC;
  --bg-active:         #D8DCE3;
  --bg-border:         #DFE2E8;
  --bg-border-light:   #C7CBD3;
  --bg-border-strong:  #C7CBD3;

  /* 텍스트 (3단) */
  --text-primary:      #1C2130;
  --text-secondary:    #4F5769;
  --text-tertiary:     #8A91A1;

  /* 액센트 — 라이트 컨텍스트 */
  --accent-blue:       var(--clover-blue);
  --accent-blue-light: var(--clover-blue-light);
  --accent-blue-soft:  var(--clover-blue-soft);
  --accent-blue-fg:    #1E3A8A;
  --accent-orange:       var(--clover-orange);
  --accent-orange-light: var(--clover-orange-light);
  --accent-orange-soft:  var(--clover-orange-soft);

  /* 기타 */
  --link:              var(--clover-blue);
  --code-bg:           #EDEFF4;
  --code-text:         #A14A10;
  --mark-bg:           #FEF3C7;
  --mark-text:         #92400E;
  --scrollbar-track:   #E9ECF2;
  --scrollbar-thumb:   #C7CBD3;
  --scrollbar-thumb-hover: #8A91A1;
  --overlay-bg:        rgba(17,24,39,0.40);

  --shadow-sm:      0 1px 2px rgba(17,24,39,0.04), 0 1px 3px rgba(17,24,39,0.03);
  --shadow-md:      0 2px 4px rgba(17,24,39,0.05), 0 8px 24px rgba(17,24,39,0.06);
  --shadow-lg:      0 12px 40px rgba(17,24,39,0.10), 0 4px 12px rgba(17,24,39,0.06);
  --shadow-raised:  var(--shadow-md);
}

/* ============================================================
   THEME — dark (앱 기본)
   ============================================================ */
[data-theme='dark'] {
  --bg-sidebar:        #111A2A;
  --bg-base:           #162032;
  --bg-surface:        #1f2940;
  --bg-surface-raised: #25304b;
  --bg-primary:        var(--bg-base);
  --bg-surface-hover:  #2a3553;
  --bg-subtle:         #1a2436;
  --bg-hover:          #2a3553;
  --bg-active:         #34406a;
  --bg-border:         #3a4566;
  --bg-border-light:   #4b5773;
  --bg-border-strong:  #4b5773;

  --text-primary:      #F9FAFB;
  --text-secondary:    #B4BCCE;
  --text-tertiary:     #7A869E;

  --accent-blue:         #3B82F6;
  --accent-blue-light:   #60A5FA;
  --accent-blue-soft:    rgba(59,130,246,0.18);
  --accent-blue-fg:      #93C5FD;
  --accent-orange:       #FB923C;
  --accent-orange-light: #FDBA74;
  --accent-orange-soft:  rgba(251,146,60,0.18);

  --link:              #60A5FA;
  --code-bg:           #1f2940;
  --code-text:         #FDBA74;
  --mark-bg:           rgba(251,146,60,0.25);
  --mark-text:         #FDBA74;
  --scrollbar-track:   #1a2436;
  --scrollbar-thumb:   #4b5773;
  --scrollbar-thumb-hover: #6b7a99;
  --overlay-bg:        rgba(0,0,0,0.6);

  --shadow-sm:      0 1px 2px rgba(0,0,0,0.2);
  --shadow-md:      0 4px 12px rgba(0,0,0,0.3);
  --shadow-lg:      0 10px 24px rgba(0,0,0,0.4);
  --shadow-raised:  0 4px 16px rgba(0,0,0,0.35);
}

/* ============================================================
   LIGHT PALETTE VARIANTS
   Activate via  [data-theme='light'][data-palette='<id>']
   (앱에서는 :root 인라인 변수로 주입; 여기서는 정적 매핑)
   ============================================================ */
[data-theme='light'][data-palette='cool-minimal'] {
  --bg-sidebar: #E9ECF2;  --bg-base: #EFF1F5;  --bg-surface: #F6F7FA;  --bg-surface-raised: #FCFCFD;
  --bg-primary: #EFF1F5;  --bg-surface-hover: #E3E6EC;  --bg-subtle: #E6E9EF;
  --bg-hover: #E3E6EC;  --bg-active: #D7DBE3;  --bg-border: #D8DCE4;
  --bg-border-light: #BFC4CE;  --bg-border-strong: #BFC4CE;
  --text-primary: #0F172A;  --text-secondary: #334155;  --text-tertiary: #64748B;
}
[data-theme='light'][data-palette='crisp-white'] {
  --bg-sidebar: #F5F6F8;  --bg-base: #FAFAFB;  --bg-surface: #FFFFFF;  --bg-surface-raised: #FFFFFF;
  --bg-primary: #FAFAFB;  --bg-surface-hover: #F0F1F3;  --bg-subtle: #F3F4F6;
  --bg-hover: #F0F1F3;  --bg-active: #E5E7EB;  --bg-border: #E5E7EB;
  --bg-border-light: #D1D5DB;  --bg-border-strong: #D1D5DB;
  --text-primary: #111827;  --text-secondary: #4B5563;  --text-tertiary: #9CA3AF;
}
[data-theme='light'][data-palette='soft-blue'] {
  --bg-sidebar: #E2E6EE;  --bg-base: #E9EDF3;  --bg-surface: #F2F4F8;  --bg-surface-raised: #FBFCFD;
  --bg-primary: #E9EDF3;  --bg-surface-hover: #DCE0E9;  --bg-subtle: #DFE3EB;
  --bg-hover: #DCE0E9;  --bg-active: #CED4DE;  --bg-border: #D1D6DE;
  --bg-border-light: #B6BCC6;  --bg-border-strong: #B6BCC6;
  --text-primary: #101828;  --text-secondary: #414D5F;  --text-tertiary: #798396;
}
[data-theme='light'][data-palette='graphite'] {
  --bg-sidebar: #DEE2EA;  --bg-base: #E6E9EF;  --bg-surface: #F0F2F6;  --bg-surface-raised: #FAFBFC;
  --bg-primary: #E6E9EF;  --bg-surface-hover: #D9DCE4;  --bg-subtle: #DCDFE7;
  --bg-hover: #D9DCE4;  --bg-active: #CBCFD9;  --bg-border: #CDD2DB;
  --bg-border-light: #B0B6C2;  --bg-border-strong: #B0B6C2;
  --text-primary: #0F172A;  --text-secondary: #334155;  --text-tertiary: #64748B;
}
[data-theme='light'][data-palette='paper'] {
  --bg-sidebar: #EEEEEE;  --bg-base: #F4F4F4;  --bg-surface: #FAFAFA;  --bg-surface-raised: #FFFFFF;
  --bg-primary: #F4F4F4;  --bg-surface-hover: #E8E8E8;  --bg-subtle: #EBEBEB;
  --bg-hover: #E8E8E8;  --bg-active: #DCDCDC;  --bg-border: #E0E0E0;
  --bg-border-light: #C4C4C4;  --bg-border-strong: #C4C4C4;
  --text-primary: #1A1A1A;  --text-secondary: #4A4A4A;  --text-tertiary: #8A8A8A;
}

/* ============================================================
   SEMANTIC TYPE (브라우저 기본이 아닌 앱 맥락에 맞춘 스케일)
   프로토타입에서 <h1>, <p>, <code> 등을 바로 사용 가능
   ============================================================ */
html {
  font-size: calc(16px * var(--app-font-scale, 1));
}

body {
  font-family: var(--app-font-family);
  color: var(--text-primary);
  background: var(--bg-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.55;
}

/* 앱 본문은 큰 h1을 쓰지 않음 — 가장 큰 타이틀도 18px 세미볼드 수준 */
h1, .h1 { font-size: var(--t-18); font-weight: 600; color: var(--text-primary); letter-spacing: -0.01em; }
h2, .h2 { font-size: var(--t-16); font-weight: 600; color: var(--text-primary); letter-spacing: -0.005em; }
h3, .h3 { font-size: var(--t-14); font-weight: 600; color: var(--text-primary); }
h4, .h4 { font-size: var(--t-13); font-weight: 600; color: var(--text-primary); }

.text-title  { font-size: var(--t-18); font-weight: 600; color: var(--text-primary); }
.text-section{ font-size: var(--t-14); font-weight: 600; color: var(--text-primary); }
.text-body   { font-size: var(--t-12); font-weight: 400; color: var(--text-primary); }
.text-meta   { font-size: var(--t-11); font-weight: 400; color: var(--text-secondary); }
.text-caption{ font-size: var(--t-10); font-weight: 400; color: var(--text-tertiary); }
.text-mini   { font-size: var(--t-9);  font-weight: 500; color: var(--text-tertiary); letter-spacing: 0.02em; }
.text-label  { font-size: var(--t-10); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); }

p     { font-size: var(--t-12); color: var(--text-primary); }
small { font-size: var(--t-10); color: var(--text-tertiary); }
a     { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }

code, kbd, samp, pre {
  font-family: var(--font-mono);
  font-size: 0.9em;
}
code {
  background: var(--code-bg);
  color: var(--code-text);
  padding: 0.15em 0.4em;
  border-radius: var(--radius-xs);
}
pre {
  background: var(--code-bg);
  border: 1px solid var(--bg-border);
  border-radius: var(--radius-md);
  padding: 0.8em 1em;
  overflow-x: auto;
}
pre code { background: none; padding: 0; color: var(--text-primary); }
kbd {
  font-family: var(--font-mono);
  font-size: var(--t-10);
  padding: 1px 5px;
  border: 1px solid var(--bg-border);
  border-bottom-width: 2px;
  border-radius: var(--radius-xs);
  background: var(--bg-surface);
  color: var(--text-secondary);
}
mark { background: var(--mark-bg); color: var(--mark-text); padding: 0 2px; border-radius: 2px; }

/* Number display — 대시보드 카드의 큰 숫자 */
.num-xl { font-size: var(--t-24); font-weight: 700; color: var(--text-primary); line-height: 1.1; }
.num-lg { font-size: var(--t-20); font-weight: 700; color: var(--text-primary); line-height: 1.1; }

/* AI gradient text/BG (강조 스팟) */
.ai-gradient-bg   { background: linear-gradient(90deg, var(--clover-orange), var(--clover-blue)); color:#fff; }
.ai-gradient-text { background: linear-gradient(90deg, var(--clover-orange), var(--clover-blue));
                    -webkit-background-clip: text; background-clip: text; color: transparent; }

```


── FILE: ui_kits/clauday-desktop/shell.css ──
```css
/* Clauday shell — stylesheet for the UI kit.
   Density target: Linear-level. Row heights 28–32px, titlebar 36px,
   tab 28px. Body text stays at 12–13px for readability. */
@import url('../../colors_and_type.css');

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: var(--font-ui);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
button { font-family: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
input, textarea, select { font-family: inherit; color: inherit; }

/* ---------- App shell ---------- */
.app { display: flex; flex-direction: column; height: 100vh; }

.titlebar {
  height: 36px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--bg-border);
  display: flex;
  align-items: center;
  padding: 0 10px;
  position: relative;
  overflow: hidden;
  flex: none;
}
.titlebar::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, rgba(234,88,12,0.04), transparent 50%, rgba(37,99,235,0.04));
  pointer-events: none;
}
.titlebar .traffic {
  display: flex; gap: 6px; align-items: center; margin-right: 10px;
}
.traffic span { width: 11px; height: 11px; border-radius: 999px; display: inline-block; }
.traffic .r { background: #FF5F57; }
.traffic .y { background: #FEBC2E; }
.traffic .g { background: #28C840; }
.titlebar .brand { display: flex; align-items: center; gap: 6px; margin-left: 8px; position: relative; z-index: 1; }
.titlebar .brand-name { font-size: 12px; font-weight: 600; white-space: nowrap; }
.titlebar .brand-sub { font-size: 10px; color: var(--text-secondary); white-space: nowrap; }
.titlebar .spacer { flex: 1; }
.titlebar .ai-indicator {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 8px; border-radius: 999px;
  background: rgba(251,146,60,0.10); border: 1px solid rgba(251,146,60,0.28);
  color: #FB923C; font-size: 10px; white-space: nowrap;
}
.ai-indicator .pulse { width: 5px; height: 5px; border-radius: 999px; background: #FB923C; animation: pulse 1.4s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

.body { display: flex; flex: 1; min-height: 0; }

/* Sidebar — 56px rail */
.sidebar {
  width: 56px;
  background: var(--bg-surface);
  border-right: 1px solid var(--bg-border);
  display: flex; flex-direction: column; align-items: center;
  padding: 8px 0; gap: 2px;
  flex: none;
}
.sidebar .navbtn {
  position: relative;
  width: 36px; height: 36px;
  border-radius: 7px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-secondary);
  transition: background .12s, color .12s, transform .08s;
}
.sidebar .navbtn:hover { color: var(--text-primary); background: var(--bg-surface-hover); }
.sidebar .navbtn:active { transform: scale(0.96); }
.sidebar .navbtn.active {
  background: linear-gradient(135deg, var(--clover-blue), rgba(37,99,235,0.82));
  color: #fff;
  box-shadow: 0 4px 10px rgba(37,99,235,0.22);
}
.sidebar .badge {
  position: absolute; top: -1px; right: -1px;
  min-width: 14px; height: 14px; padding: 0 3px;
  border-radius: 999px;
  background: var(--clover-orange);
  color: #fff; font-size: 9px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--bg-surface);
}
.sidebar .sep { width: 28px; height: 1px; background: var(--bg-border); opacity: .6; margin: 4px 0; }
.sidebar .grow { flex: 1; }

/* Main */
.main { flex: 1; display: flex; flex-direction: column; min-width: 0; background: var(--bg-primary); }
.tabbar {
  height: 32px;
  display: flex; align-items: center; gap: 1px;
  padding: 0 8px;
  border-bottom: 1px solid var(--bg-border);
  background: var(--bg-surface);
  flex: none;
  overflow-x: auto;
}
.tab {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 500;
  height: 22px;
  padding: 0 8px;
  border-radius: 5px;
  color: var(--text-secondary);
  white-space: nowrap;
  flex: none;
  cursor: pointer;
  transition: background .12s, color .12s;
}
.tab:hover { color: var(--text-primary); background: var(--bg-surface-hover); }
.tab.active { background: rgba(37,99,235,0.12); color: var(--clover-blue); }
.tab.ai.active { background: linear-gradient(90deg, rgba(234,88,12,0.18), rgba(37,99,235,0.18)); color: var(--text-primary); }
.tab .close { opacity: 0; width: 13px; height: 13px; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; color: var(--text-tertiary); }
.tab:hover .close { opacity: 1; }
.tab .close:hover { color: var(--text-primary); background: var(--bg-border); }
.tab.newtab { color: var(--text-tertiary); padding: 0 6px; height: 22px; }
.tab.newtab:hover { color: var(--text-primary); background: var(--bg-surface-hover); }

.screen { flex: 1; min-height: 0; overflow: auto; }
.screen-inner { padding: 12px 16px; }

/* ---------- Chips / Badges ---------- */
.chip {
  display: inline-flex; align-items: center; gap: 4px;
  height: 18px; padding: 0 7px;
  border-radius: 999px;
  font-size: 10px; font-weight: 500; line-height: 1;
  white-space: nowrap; flex: none;
}
.chip.sq { border-radius: 4px; }
.chip.blue { background: rgba(37,99,235,0.12); color: #60A5FA; }
.chip.orange { background: rgba(234,88,12,0.12); color: #FB923C; }
.chip.emerald { background: rgba(34,197,94,0.14); color: #22C55E; }
.chip.red { background: rgba(239,68,68,0.14); color: #F87171; }
.chip.violet { background: rgba(167,139,250,0.14); color: #A78BFA; }
.chip.yellow { background: rgba(250,204,21,0.14); color: #FACC15; }
.chip.neutral { background: var(--bg-surface); color: var(--text-secondary); border: 1px solid var(--bg-border); }
.chip .dot { width: 5px; height: 5px; border-radius: 999px; background: currentColor; }

/* ---------- Buttons ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  height: 26px; padding: 0 10px;
  border-radius: 6px;
  font-size: 11px; font-weight: 500;
  border: 1px solid transparent;
  transition: background .12s, border-color .12s, color .12s, opacity .12s;
  white-space: nowrap; flex: none;
}
.btn.primary { background: var(--clover-blue); color: #fff; }
.btn.primary:hover { background: rgba(37,99,235,0.88); }
.btn.ai {
  background: linear-gradient(90deg, var(--clover-orange), var(--clover-blue));
  color: #fff;
}
.btn.ai:hover { opacity: .88; }
.btn.success { background: #10B981; color: #fff; }
.btn.success:hover { background: rgba(16,185,129,.88); }
.btn.secondary { background: var(--bg-surface); color: var(--text-primary); border-color: var(--bg-border); }
.btn.secondary:hover { background: var(--bg-surface-hover); }
.btn.ghost { color: var(--text-secondary); }
.btn.ghost:hover { background: var(--bg-surface-hover); color: var(--text-primary); }
.btn.danger { color: #F87171; }
.btn.danger:hover { background: rgba(239,68,68,0.10); }
.btn.orange { background: var(--clover-orange); color: #fff; }
.btn.orange:hover { background: rgba(234,88,12,0.88); }
.btn.sm { height: 22px; padding: 0 8px; font-size: 10px; border-radius: 5px; }
.btn.xs { height: 18px; padding: 0 6px; font-size: 10px; border-radius: 4px; }
.btn.lg { height: 30px; padding: 0 12px; font-size: 12px; border-radius: 7px; }
.btn.icon { width: 24px; height: 24px; padding: 0; color: var(--text-secondary); border-radius: 5px; }
.btn.icon:hover { background: var(--bg-surface-hover); color: var(--text-primary); }
.btn.icon.sm { width: 20px; height: 20px; border-radius: 4px; }

/* ---------- Card ---------- */
.card {
  background: var(--bg-surface);
  border: 1px solid var(--bg-border);
  border-radius: 8px;
  padding: 10px;
}
.card.raised { background: var(--bg-surface-raised); box-shadow: var(--shadow-sm); }
.card.flat { background: transparent; border-color: var(--bg-border); }

/* ---------- Inputs ---------- */
.input {
  width: 100%;
  height: 28px;
  padding: 0 10px;
  background: var(--bg-primary);
  border: 1px solid var(--bg-border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
  transition: border-color .12s, box-shadow .12s;
}
.input::placeholder { color: var(--text-tertiary); }
.input:focus { outline: none; border-color: var(--clover-blue); box-shadow: 0 0 0 3px rgba(37,99,235,0.14); }
.input.sm { height: 24px; font-size: 11px; padding: 0 8px; border-radius: 5px; }

textarea.input { height: auto; padding: 6px 10px; resize: vertical; line-height: 1.5; }

.field-label {
  display: block; font-size: 10px; font-weight: 600;
  color: var(--text-secondary); text-transform: uppercase;
  letter-spacing: 0.04em; margin-bottom: 4px;
}

.kbd {
  font-family: var(--font-mono); font-size: 10px;
  height: 17px; min-width: 17px; padding: 0 4px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--bg-surface); border: 1px solid var(--bg-border);
  border-bottom-width: 2px; border-radius: 3px;
  color: var(--text-secondary); line-height: 1;
}

/* ---------- Avatar ---------- */
.avatar {
  width: 22px; height: 22px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--bg-surface-hover); color: var(--text-primary);
  font-size: 10px; font-weight: 600;
  border: 1px solid var(--bg-border);
  flex: none;
}
.avatar.sm { width: 18px; height: 18px; font-size: 9px; }
.avatar.lg { width: 28px; height: 28px; font-size: 11px; }
.avatar.xl { width: 36px; height: 36px; font-size: 13px; }

/* ---------- Toast ---------- */
.toast-viewport {
  position: fixed; bottom: 14px; right: 14px;
  display: flex; flex-direction: column; gap: 6px;
  z-index: 80;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  min-width: 260px; max-width: 360px;
  background: var(--bg-surface-raised);
  border: 1px solid var(--bg-border);
  border-left: 3px solid var(--clover-blue);
  border-radius: 7px;
  padding: 8px 10px 8px 12px;
  display: flex; align-items: flex-start; gap: 8px;
  box-shadow: var(--shadow-md);
  animation: toastIn .22s cubic-bezier(.2,.8,.2,1);
}
.toast.success { border-left-color: #22C55E; }
.toast.error { border-left-color: #EF4444; }
.toast.warn { border-left-color: #FBBF24; }
.toast.ai { border-left-color: var(--clover-orange); }
.toast .t-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.toast .t-body { font-size: 11px; color: var(--text-secondary); margin-top: 2px; line-height: 1.4; }
.toast .t-close { color: var(--text-tertiary); }
.toast .t-close:hover { color: var(--text-primary); }
@keyframes toastIn {
  from { opacity: 0; transform: translateY(6px) scale(.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ---------- Modal / Dialog ---------- */
.modal-backdrop {
  position: fixed; inset: 0; background: var(--overlay-bg);
  display: flex; align-items: center; justify-content: center;
  z-index: 60; animation: bdIn .15s ease-out;
}
@keyframes bdIn { from{opacity:0} to{opacity:1} }
.modal {
  width: 460px; max-width: calc(100vw - 32px);
  background: var(--bg-surface-raised);
  border: 1px solid var(--bg-border);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: modalIn .18s cubic-bezier(.2,.9,.2,1);
}
@keyframes modalIn {
  from { opacity: 0; transform: translateY(8px) scale(.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.modal .m-head {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--bg-border);
}
.modal .m-title { font-size: 13px; font-weight: 600; }
.modal .m-body { padding: 14px; font-size: 12px; color: var(--text-primary); line-height: 1.55; }
.modal .m-foot {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid var(--bg-border);
  background: var(--bg-base);
  justify-content: flex-end;
}

/* ---------- Command Palette ---------- */
.cp-backdrop {
  position: fixed; inset: 0;
  background: var(--overlay-bg);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 96px;
  z-index: 70;
  animation: bdIn .12s ease-out;
}
.cp {
  width: 520px; max-width: calc(100vw - 32px);
  background: var(--bg-surface-raised);
  border: 1px solid var(--bg-border);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: modalIn .18s cubic-bezier(.2,.9,.2,1);
}
.cp-search {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--bg-border);
}
.cp-search input {
  flex: 1; border: 0; outline: 0; background: none;
  font-size: 13px; color: var(--text-primary);
}
.cp-list { max-height: 340px; overflow-y: auto; padding: 4px; }
.cp-group-label {
  font-size: 9px; font-weight: 600;
  color: var(--text-tertiary); text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 6px 8px 4px;
}
.cp-item {
  display: flex; align-items: center; gap: 8px;
  height: 28px; padding: 0 8px;
  border-radius: 5px;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
}
.cp-item:hover, .cp-item.sel { background: var(--bg-surface-hover); }
.cp-item .cp-icon { color: var(--text-secondary); display: flex; }
.cp-item .cp-lbl { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cp-item .cp-hint { font-size: 10px; color: var(--text-tertiary); }
.cp-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px;
  border-top: 1px solid var(--bg-border);
  background: var(--bg-base);
  font-size: 10px; color: var(--text-tertiary);
}

/* ---------- Dropdown menu ---------- */
.menu {
  position: absolute;
  min-width: 180px;
  background: var(--bg-surface-raised);
  border: 1px solid var(--bg-border);
  border-radius: 7px;
  box-shadow: var(--shadow-md);
  padding: 4px;
  z-index: 50;
  animation: modalIn .14s cubic-bezier(.2,.9,.2,1);
}
.menu-item {
  display: flex; align-items: center; gap: 8px;
  height: 26px; padding: 0 8px;
  border-radius: 4px;
  font-size: 12px; color: var(--text-primary);
  cursor: pointer;
}
.menu-item:hover { background: var(--bg-surface-hover); }
.menu-item.danger { color: #F87171; }
.menu-item.danger:hover { background: rgba(239,68,68,0.10); }
.menu-item .mi-hint { margin-left: auto; font-size: 10px; color: var(--text-tertiary); }
.menu-sep { height: 1px; background: var(--bg-border); margin: 4px 0; }
.menu-label {
  font-size: 9px; font-weight: 600;
  color: var(--text-tertiary); text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 6px 8px 2px;
}

/* ---------- Badge ---------- */
.badge-pill {
  display: inline-flex; align-items: center;
  height: 16px; padding: 0 5px;
  font-size: 9px; font-weight: 700;
  border-radius: 999px;
  background: var(--clover-orange); color: #fff;
}

/* ---------- Tabs component (non-titlebar) ---------- */
.seg {
  display: inline-flex;
  height: 26px; padding: 2px;
  background: var(--bg-surface);
  border: 1px solid var(--bg-border);
  border-radius: 6px;
  gap: 1px;
}
.seg .seg-item {
  height: 20px;
  padding: 0 10px;
  border-radius: 4px;
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
}
.seg .seg-item:hover { color: var(--text-primary); }
.seg .seg-item.active { background: var(--bg-surface-raised); color: var(--text-primary); box-shadow: var(--shadow-sm); }

/* ---------- Markdown body ---------- */
.markdown-body {
  font-size: 13px; line-height: 1.65; color: var(--text-primary);
}
.markdown-body h1 { font-size: 16px; font-weight: 700; margin: 20px 0 8px; }
.markdown-body h2 { font-size: 14px; font-weight: 700; margin: 16px 0 6px; border-bottom: 1px solid var(--bg-border); padding-bottom: 4px; }
.markdown-body h3 { font-size: 13px; font-weight: 600; margin: 12px 0 4px; }
.markdown-body p { margin: 0 0 10px; font-size: 13px; }
.markdown-body ul, .markdown-body ol { margin: 0 0 10px; padding-left: 18px; }
.markdown-body li { margin: 2px 0; font-size: 13px; }
.markdown-body a { color: var(--clover-blue); }
.markdown-body code {
  background: var(--code-bg); color: var(--code-text);
  padding: 1px 5px; border-radius: 3px;
  font-family: var(--font-mono); font-size: 11px;
}
.markdown-body pre {
  background: var(--code-bg);
  border: 1px solid var(--bg-border);
  border-radius: 7px;
  padding: 10px 12px;
  overflow-x: auto;
  font-size: 11px; line-height: 1.5;
  margin: 0 0 10px;
}
.markdown-body pre code {
  background: none; padding: 0; color: var(--text-primary);
  font-size: 11px;
}
.markdown-body blockquote {
  margin: 0 0 10px; padding: 4px 10px;
  border-left: 3px solid var(--bg-border);
  color: var(--text-secondary);
}

/* ---------- Code block container (with header) ---------- */
.codeblock {
  background: var(--code-bg);
  border: 1px solid var(--bg-border);
  border-radius: 7px;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 11px;
}
.codeblock .cb-head {
  display: flex; align-items: center; gap: 6px;
  height: 24px; padding: 0 8px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--bg-border);
  color: var(--text-tertiary);
  font-family: var(--font-ui); font-size: 10px;
}
.codeblock pre { margin: 0; padding: 8px 10px; overflow-x: auto; line-height: 1.55; }
.diff-add { background: rgba(34,197,94,0.12); color: #86EFAC; display: block; }
.diff-del { background: rgba(239,68,68,0.12); color: #FCA5A5; display: block; }
.diff-ctx { color: var(--text-secondary); display: block; }

/* ---------- Empty / Loading / Error states ---------- */
.state-view {
  height: 100%; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 8px; padding: 24px; text-align: center;
}
.state-icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: var(--bg-surface); border: 1px solid var(--bg-border);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-tertiary);
}
.state-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.state-body { font-size: 11px; color: var(--text-tertiary); max-width: 360px; line-height: 1.5; }

.spinner {
  width: 18px; height: 18px;
  border: 2px solid var(--bg-border);
  border-top-color: var(--clover-blue);
  border-radius: 999px;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ---------- Relative / absolute time ---------- */
.time-rel { color: var(--text-secondary); font-size: 10px; white-space: nowrap; }
.time-abs { color: var(--text-tertiary); font-size: 10px; font-family: var(--font-mono); }

/* ---------- Utility helpers ---------- */
.row { display: flex; align-items: center; }
.col { display: flex; flex-direction: column; }
.gap-1 { gap: 4px; } .gap-2 { gap: 6px; } .gap-3 { gap: 10px; } .gap-4 { gap: 14px; } .gap-6 { gap: 20px; }
.grow { flex: 1; }
.mono { font-family: var(--font-mono); white-space: nowrap; }
.muted { color: var(--text-secondary); }
.subtle { color: var(--text-tertiary); }
.xs { font-size: 10px; white-space: nowrap; }
.sm { font-size: 11px; white-space: nowrap; }
.md { font-size: 12px; white-space: nowrap; }
.lg { font-size: 13px; white-space: nowrap; }
.xl { font-size: 14px; }
.b { font-weight: 500; }
.sb { font-weight: 600; }
.bold { font-weight: 700; }
.truncate { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.border-t { border-top: 1px solid var(--bg-border); }
.border-b { border-bottom: 1px solid var(--bg-border); }

/* scrollbar */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bg-border); border-radius: 999px; border: 1px solid transparent; background-clip: padding-box; }
::-webkit-scrollbar-thumb:hover { background: var(--bg-border-strong); background-clip: padding-box; }

```


── FILE: ui_kits/clauday-desktop/index.html ──
```html
<!doctype html>
<html lang="ko" data-theme="dark">
<head>
<meta charset="utf-8" />
<title>Clauday Desktop — UI Kit</title>
<link rel="icon" href="../../assets/clauday-icon.png" />
<link rel="stylesheet" href="shell.css" />
</head>
<body>
<div id="root"></div>

<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>
<script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.js"></script>

<script type="text/babel" src="primitives.jsx"></script>
<script type="text/babel" src="components.jsx"></script>
<script type="text/babel" src="theme.jsx"></script>
<script type="text/babel" src="Shell.jsx"></script>
<script type="text/babel" src="Dashboard.jsx"></script>
<script type="text/babel" src="Briefing.jsx"></script>
<script type="text/babel" src="McpServers.jsx"></script>
<script type="text/babel" src="Terminal.jsx"></script>
<script type="text/babel" src="Monitoring.jsx"></script>

<script type="text/babel">
const { useState, useEffect, useMemo } = React;
const {
  LucideIcon, Chip, Button, StatCard, Avatar, Badge, TimeAgo,
  EmptyView, LoadingView, ErrorView,
  Modal, ToastHost, useToast,
  Dropdown, SegTabs, CommandPalette,
  CodeBlock, Diff, MarkdownBody,
  TitleBar, Sidebar, TabBar,
  Dashboard, Briefing, McpServers, TerminalScreen, Monitoring,
  PALETTES, useTheme, ThemeToggleButton, ThemePickerModal
} = window;

const INITIAL_TABS = {
  dooray: [
    { id:'dash',    label:'대시보드', icon:'LayoutDashboard', ai:true,  component:() => <Dashboard /> },
    { id:'brief',   label:'브리핑',   icon:'Sparkles',        ai:true,  component:() => <Briefing /> },
    { id:'tasks',   label:'태스크',   icon:'ListTodo',                  component:() => <ComingSoon name="태스크 / 위키 / 캘린더 / 메신저" /> }
  ],
  monitoring: [{ id:'feed', label:'와쳐', icon:'Radar', component:() => <Monitoring /> }],
  terminal:   [{ id:'t1', label:'zsh — ~/clauday', icon:'Terminal', component:() => <TerminalScreen /> }],
  git:        [{ id:'br', label:'브랜치', icon:'GitBranch', component:() => <ComingSoon name="브랜치 작업" /> }],
  community:  [{ id:'co', label:'커뮤니티', icon:'Users', component:() => <ComingSoon name="커뮤니티" /> }],
  mcp:        [{ id:'mcp', label:'서버', icon:'Server', component:() => <McpServers /> }],
  skills:     [{ id:'sk', label:'스킬', icon:'Sparkles', component:() => <SkillsScreen /> }],
  sessions:   [{ id:'se', label:'세션', icon:'MessageSquare', component:() => <ComingSoon name="세션" /> }],
  usage:      [{ id:'us', label:'사용량', icon:'BarChart3', component:() => <ComingSoon name="사용량" /> }],
  manual:     [{ id:'ma', label:'매뉴얼', icon:'BookOpen', component:() => <ComingSoon name="매뉴얼" /> }],
  settings:   [{ id:'st', label:'설정', icon:'Settings', component:() => <SettingsScreen /> }]
};

function ComingSoon({ name }) {
  return <EmptyView icon="Construction" title={name}
    body="이 영역은 UI kit 범위 밖이라 비워두었어요. 원본 코드와 Figma를 참조해 필요 시 확장 가능합니다." />;
}

function SkillsScreen() {
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 900); return () => clearTimeout(t); }, []);
  if (loading) return <LoadingView label="~/.clauday/skills 스캔 중..." />;
  return (
    <div className="screen-inner col gap-3">
      <div className="row gap-2">
        <LucideIcon name="Sparkles" size={15} color="var(--clover-orange)" />
        <span className="lg sb">Claude 스킬</span>
        <span className="chip neutral">3개</span>
        <div className="grow" />
        <SegTabs value="all" onChange={()=>{}} items={[
          { key:'all', label:'전체' },{ key:'mine', label:'내 스킬' },{ key:'shared', label:'공유' }
        ]} />
        <Button variant="primary" size="sm" icon="Plus">스킬 추가</Button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {[
          { name:'dooray-task-scribe', desc:'두레이 태스크 본문 초안 생성', tone:'orange', updated:'2시간 전' },
          { name:'code-review-ko',     desc:'한국어 코드 리뷰 코멘트 생성', tone:'blue',   updated:'어제' },
          { name:'briefing-digest',    desc:'멀티채널 요약 브리핑 생성',   tone:'violet', updated:'3일 전' }
        ].map(s => (
          <div key={s.name} className="card" style={{ padding:10 }}>
            <div className="row gap-2">
              <div style={{
                width:28, height:28, borderRadius:7, flex:'none',
                background:'var(--bg-surface-hover)',
                color:{orange:'#FB923C',blue:'#60A5FA',violet:'#A78BFA'}[s.tone],
                display:'flex', alignItems:'center', justifyContent:'center'
              }}>
                <LucideIcon name="Sparkles" size={13} />
              </div>
              <div className="col" style={{ flex:1, minWidth:0 }}>
                <span className="md sb truncate">{s.name}</span>
                <span className="xs subtle truncate">{s.desc}</span>
              </div>
              <Dropdown
                align="right"
                trigger={<button className="btn icon sm"><LucideIcon name="Ellipsis" size={12} /></button>}
                items={[
                  { name:'편집', icon:'Pencil' },
                  { name:'복제', icon:'Copy' },
                  { sep:true },
                  { name:'삭제', icon:'Trash2', danger:true }
                ]}
              />
            </div>
            <div className="row gap-2" style={{ marginTop:6 }}>
              <span className="xs subtle">업데이트 <TimeAgo date={new Date(Date.now() - 1000*60*60*2)} /></span>
              <div className="grow" />
              <Button variant="ghost" size="xs" icon="Play">실행</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsScreen() {
  const [section, setSection] = useState('appearance');
  return (
    <div className="row" style={{ height:'100%' }}>
      <aside style={{ width:200, borderRight:'1px solid var(--bg-border)', background:'var(--bg-surface)', padding:8, flex:'none' }}>
        {[
          ['general','General','Settings'],
          ['appearance','외관','Palette'],
          ['dooray','두레이','Calendar'],
          ['claude','Claude Code','Sparkles'],
          ['mcp','MCP','Server'],
          ['keymap','단축키','Keyboard'],
          ['about','정보','Info']
        ].map(([k, label, icon]) => (
          <button key={k}
            className="row gap-2"
            onClick={() => setSection(k)}
            style={{
              width:'100%', height:28, padding:'0 8px', borderRadius:5,
              color: section === k ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: section === k ? 'var(--bg-surface-hover)' : 'transparent',
              cursor:'pointer'
            }}>
            <LucideIcon name={icon} size={12} />
            <span className="sm b">{label}</span>
          </button>
        ))}
      </aside>
      <div style={{ flex:1, padding:'14px 20px', overflow:'auto' }}>
        {section === 'appearance' && <AppearanceSettings />}
        {section !== 'appearance' && (
          <EmptyView icon="Construction" title="준비 중"
            body="이 설정 섹션은 UI kit 데모에 포함되지 않았어요." />
        )}
      </div>
    </div>
  );
}

function AppearanceSettings() {
  const { theme, setMode, setPalette } = window.__theme;
  return (
    <div className="col gap-4" style={{ maxWidth: 560 }}>
      <div className="col gap-1">
        <span className="lg sb">외관</span>
        <span className="xs subtle">다크 모드와 5종 라이트 팔레트 중 선택하세요.</span>
      </div>

      <div className="col gap-2">
        <span className="field-label">모드</span>
        <div className="row gap-2">
          {['dark','light'].map(m => (
            <button key={m}
              className={`btn ${theme.mode === m ? 'primary' : 'secondary'} sm`}
              onClick={() => setMode(m)}>
              <LucideIcon name={m === 'dark' ? 'Moon' : 'Sun'} size={11} />
              {m === 'dark' ? '다크' : '라이트'}
            </button>
          ))}
        </div>
      </div>

      <div className="col gap-2">
        <span className="field-label">라이트 팔레트</span>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
          {PALETTES.map(p => {
            const isActive = theme.mode === 'light' && theme.palette === p.id;
            return (
              <button key={p.id}
                onClick={() => setPalette(p.id)}
                style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding:'8px 10px', borderRadius:7,
                  background: isActive ? 'var(--accent-blue-soft)' : 'var(--bg-surface)',
                  border:`1px solid ${isActive ? 'var(--clover-blue)' : 'var(--bg-border)'}`,
                  cursor:'pointer', textAlign:'left'
                }}>
                <span style={{ width:28, height:28, borderRadius:7, background:p.swatch, border:'1px solid var(--bg-border)', flex:'none' }} />
                <div style={{ display:'flex', flexDirection:'column', gap:1, minWidth:0 }}>
                  <span className="sm sb truncate" style={{ color:'var(--text-primary)' }}>{p.name}</span>
                  <span className="xs subtle truncate">{p.hint}</span>
                </div>
                {isActive && <LucideIcon name="Check" size={14} color="var(--clover-blue)" style={{ marginLeft:'auto' }} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AppInner() {
  const themeApi = useTheme();
  // expose to SettingsScreen without prop drilling
  window.__theme = themeApi;

  const [activeView, setActiveView] = useState('dooray');
  const [tabsByView, setTabsByView] = useState(INITIAL_TABS);
  const [activeTabByView, setActiveTabByView] = useState(() => {
    const m = {}; Object.keys(INITIAL_TABS).forEach(k => m[k] = INITIAL_TABS[k][0].id); return m;
  });
  const [themeOpen, setThemeOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const toast = useToast();

  // ⌘K global shortcut
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setCmdOpen(o => !o);
      } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault(); setThemeOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Seed a welcome toast once
  useEffect(() => {
    const t = setTimeout(() => toast.ai('환영합니다!', '⌘K 로 명령 팔레트를 열 수 있어요.'), 800);
    return () => clearTimeout(t);
  }, [toast]);

  const tabs = tabsByView[activeView] || [];
  const activeTabId = activeTabByView[activeView];
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const selectTab = (id) => setActiveTabByView(s => ({ ...s, [activeView]: id }));
  const closeTab = (id) => {
    setTabsByView(s => ({ ...s, [activeView]: s[activeView].filter(t => t.id !== id) }));
    if (activeTabId === id) {
      const remaining = tabs.filter(t => t.id !== id);
      if (remaining.length) selectTab(remaining[0].id);
    }
  };

  // Command palette commands
  const commands = useMemo(() => ([
    { label:'이동', items: [
      { label:'두레이 대시보드', icon:'LayoutDashboard', hint:'⌘1', run:() => setActiveView('dooray') },
      { label:'AI 브리핑', icon:'Sparkles', hint:'⌘2', run:() => { setActiveView('dooray'); selectTab('brief'); } },
      { label:'와쳐', icon:'Radar', hint:'⌘3', run:() => setActiveView('monitoring') },
      { label:'터미널', icon:'Terminal', hint:'⌘4', run:() => setActiveView('terminal') },
      { label:'MCP 서버', icon:'Server', run:() => setActiveView('mcp') },
      { label:'Claude 스킬', icon:'Sparkles', run:() => setActiveView('skills') },
      { label:'설정', icon:'Settings', hint:'⌘,', run:() => setActiveView('settings') }
    ]},
    { label:'명령', items: [
      { label:'새 태스크 생성', icon:'Plus', hint:'⌘N', run:() => toast.success('새 태스크', '빠른 생성 폼을 열었어요') },
      { label:'새 브리핑 생성', icon:'Sparkles', hint:'⌘⇧B', run:() => toast.ai('브리핑 생성 중', '12초 정도 걸려요') },
      { label:'테마 바꾸기', icon:'Palette', run:() => setThemeOpen(true) },
      { label:'정보', icon:'Info', run:() => setAboutOpen(true) }
    ]},
    { label:'최근 파일', items: [
      { label:'src/components/Dooray/DashboardView.tsx', icon:'FileCode', hint:'방금 전' },
      { label:'src/components/Briefing/BriefingCard.tsx', icon:'FileCode', hint:'5분 전' },
      { label:'~/.clauday/mcp.json', icon:'FileJson', hint:'어제' }
    ]}
  ].map(g => ({ ...g, items: g.items.map(it => ({ ...it, onRun: it.run })) }))), [toast]);

  return (
    <div className="app">
      <TitleBar
        aiActive={false}
        theme={themeApi.theme}
        onOpenTheme={() => setThemeOpen(true)}
        onOpenCmd={() => setCmdOpen(true)}
      />
      <div className="body">
        <Sidebar activeView={activeView} onNav={setActiveView} />
        <div className="main">
          <TabBar
            tabs={tabs}
            activeTab={activeTabId}
            onSelect={selectTab}
            onClose={tabs.length > 1 ? closeTab : undefined}
          />
          <div className="screen" key={activeView + ':' + activeTabId}>
            {activeTab && activeTab.component()}
          </div>
        </div>
      </div>

      <ThemePickerModal
        open={themeOpen}
        onClose={() => setThemeOpen(false)}
        theme={themeApi.theme}
        onChangeMode={themeApi.setMode}
        onChangePalette={themeApi.setPalette}
      />
      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        commands={commands}
        onRun={(it) => it.run?.()}
      />
      <Modal open={aboutOpen} onClose={() => setAboutOpen(false)} title="Clauday" icon="Clover"
        footer={<button className="btn primary sm" onClick={() => setAboutOpen(false)}>확인</button>}>
        <div className="col gap-2">
          <div className="row gap-2">
            <img src="../../assets/clauday-icon.png" width="36" height="36" style={{ borderRadius:8 }} />
            <div className="col">
              <span className="md sb">Clauday 0.3.0</span>
              <span className="xs subtle">Dooray + Claude Code 통합 AI 업무 비서</span>
            </div>
          </div>
          <div className="xs muted" style={{ lineHeight:1.55 }}>
            주황 <b style={{ color:'var(--clover-orange)' }}>Dooray</b> + 파랑 <b style={{ color:'var(--clover-blue)' }}>Claude</b> 두 액센트로 업무와 AI를 한 자리에서 다룹니다.
          </div>
        </div>
      </Modal>
    </div>
  );
}

function App() {
  return (
    <ToastHost>
      <AppInner />
    </ToastHost>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
</body>
</html>

```


── FILE: ui_kits/clauday-desktop/primitives.jsx ──
```jsx
// primitives.jsx — shared Icon(lucide), Chip, Button helpers
// Uses lucide-react loaded as UMD on window.lucide? — we go via inline SVG strings for reliability.
// Instead, we render Lucide SVG via a lookup of stroke paths kept minimal — we'll lazy-load from esm.sh.

// We expose:
//   <LucideIcon name="Sparkles" size={16} />
//   <Chip tone="blue">...</Chip>
//   <Button variant="primary"|"ai"|...>...</Button>

const { useEffect, useState, useRef } = React;

// Lucide UMD. Documented approach: render <i data-lucide="kebab-name"> + call lucide.createIcons()
// which scans and replaces them with SVGs. Works reliably across Lucide versions.
const _pascalToKebab = (n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

let _lucideReady = false;
const _waiters = [];
function whenLucideReady(cb) {
  if (_lucideReady) return cb();
  if (window.lucide) { _lucideReady = true; return cb(); }
  _waiters.push(cb);
  if (_waiters.length === 1) {
    const t = setInterval(() => {
      if (window.lucide) {
        clearInterval(t);
        _lucideReady = true;
        _waiters.splice(0).forEach(fn => fn());
      }
    }, 60);
  }
}

function LucideIcon({ name, size = 16, color, className, style }) {
  const ref = useRef(null);
  useEffect(() => {
    let cancelled = false;
    whenLucideReady(() => {
      if (cancelled || !ref.current) return;
      const kebab = _pascalToKebab(name);
      ref.current.innerHTML = `<i data-lucide="${kebab}" style="width:${size}px;height:${size}px;display:inline-flex"></i>`;
      try {
        window.lucide.createIcons({
          icons: window.lucide.icons ? undefined : undefined, // let it use global set
          attrs: { width: size, height: size, 'stroke-width': 2 }
        });
      } catch (e) { /* ignore */ }
    });
    return () => { cancelled = true; };
  }, [name, size]);
  return <span ref={ref} className={className} style={{ display:'inline-flex', width:size, height:size, flex:'none', color, ...style }} />;
}

function Chip({ tone = 'neutral', dot = false, children }) {
  return (
    <span className={`chip ${tone}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

function Button({ variant = 'secondary', size, icon, children, onClick, title, className = '' }) {
  const sz = size ? ` ${size}` : '';
  return (
    <button className={`btn ${variant}${sz} ${className}`} onClick={onClick} title={title}>
      {icon && <LucideIcon name={icon} size={variant === 'ai' ? 12 : 12} />}
      {children}
    </button>
  );
}

function StatCard({ label, value, tone = 'neutral', dotColor }) {
  const color = { blue:'#60A5FA', orange:'#FB923C', red:'#F87171', emerald:'#22C55E' }[tone];
  return (
    <div className="card" style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ fontSize:9, fontWeight:600, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'0.04em', display:'flex', alignItems:'center', gap:4 }}>
        {dotColor && <span style={{ width:10, height:10, borderRadius:2, background:dotColor, display:'inline-block' }} />}
        {label}
      </div>
      <div style={{ fontSize:20, fontWeight:700, color: color || 'var(--text-primary)', lineHeight:1 }}>{value}</div>
    </div>
  );
}

window.LucideIcon = LucideIcon;
window.Chip = Chip;
window.Button = Button;
window.StatCard = StatCard;

```


── FILE: ui_kits/clauday-desktop/components.jsx ──
```jsx
// components.jsx — shared interactive primitives
// Provides: Modal, Toast/ToastHost, CommandPalette, Menu, Tabs, EmptyView, LoadingView, ErrorView,
//           MarkdownBody, CodeBlock, Badge, Avatar, TimeAgo, Dropdown

const { useEffect, useState, useRef, useLayoutEffect, useMemo, useCallback } = React;
const { LucideIcon } = window;

/* ---------------- Avatar ---------------- */
function Avatar({ name = '', size = 'md', tone }) {
  const initials = name.trim().slice(0, 2).toUpperCase() || '·';
  const palette = ['#EA580C','#2563EB','#22C55E','#A78BFA','#FACC15','#EF4444'];
  const idx = Math.abs([...name].reduce((a, c) => a + c.charCodeAt(0), 0)) % palette.length;
  const bg = tone || palette[idx];
  return (
    <span className={`avatar ${size}`} style={{ background: bg + '22', color: bg, borderColor: bg + '44' }}>
      {initials}
    </span>
  );
}

/* ---------------- Badge ---------------- */
function Badge({ children, tone = 'orange' }) {
  const bg = { orange:'var(--clover-orange)', blue:'var(--clover-blue)', emerald:'#22C55E', red:'#EF4444', violet:'#A78BFA' }[tone] || tone;
  return <span className="badge-pill" style={{ background: bg }}>{children}</span>;
}

/* ---------------- Time ---------------- */
function formatRelative(date) {
  const now = Date.now();
  const d = (date instanceof Date ? date : new Date(date)).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 5) return '방금';
  if (diff < 60) return `${diff}초 전`;
  if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff/86400)}일 전`;
  return new Date(d).toLocaleDateString('ko-KR');
}
function TimeAgo({ date, absolute }) {
  const d = date instanceof Date ? date : new Date(date);
  const abs = d.toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  return <span className={absolute ? 'time-abs' : 'time-rel'} title={abs}>{absolute ? abs : formatRelative(d)}</span>;
}

/* ---------------- State views ---------------- */
function EmptyView({ icon = 'Inbox', title, body, action }) {
  return (
    <div className="state-view">
      <div className="state-icon"><LucideIcon name={icon} size={20} /></div>
      <div className="state-title">{title}</div>
      {body && <div className="state-body">{body}</div>}
      {action}
    </div>
  );
}
function LoadingView({ label = '불러오는 중...' }) {
  return (
    <div className="state-view">
      <div className="spinner" />
      <div className="state-body">{label}</div>
    </div>
  );
}
function ErrorView({ title = '문제가 발생했어요', body, onRetry }) {
  return (
    <div className="state-view">
      <div className="state-icon" style={{ color:'#F87171' }}><LucideIcon name="CircleAlert" size={20} /></div>
      <div className="state-title">{title}</div>
      {body && <div className="state-body">{body}</div>}
      {onRetry && <button className="btn secondary sm" onClick={onRetry}><LucideIcon name="RotateCcw" size={11} /> 다시 시도</button>}
    </div>
  );
}

/* ---------------- Modal ---------------- */
function Modal({ open, onClose, title, icon, children, footer, width }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={width ? { width } : null} onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          {icon && <LucideIcon name={icon} size={14} color="var(--text-secondary)" />}
          <span className="m-title">{title}</span>
          <span className="grow" />
          <button className="btn icon sm" onClick={onClose}><LucideIcon name="X" size={12} /></button>
        </div>
        <div className="m-body">{children}</div>
        {footer && <div className="m-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- Toast ---------------- */
const ToastCtx = React.createContext(null);
function useToast() { return React.useContext(ToastCtx); }
function ToastHost({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(s => [...s, { id, tone:'default', ...t }]);
    setTimeout(() => setToasts(s => s.filter(x => x.id !== id)), t.duration ?? 3600);
  }, []);
  const dismiss = (id) => setToasts(s => s.filter(x => x.id !== id));
  const api = useMemo(() => ({
    push,
    success: (title, body) => push({ tone:'success', icon:'CircleCheck', title, body }),
    error:   (title, body) => push({ tone:'error',   icon:'CircleAlert',  title, body }),
    warn:    (title, body) => push({ tone:'warn',    icon:'TriangleAlert',title, body }),
    ai:      (title, body) => push({ tone:'ai',      icon:'Sparkles',     title, body }),
    info:    (title, body) => push({ tone:'default', icon:'Info',         title, body })
  }), [push]);
  const iconColor = {
    success:'#22C55E', error:'#EF4444', warn:'#FBBF24',
    ai:'var(--clover-orange)', default:'var(--clover-blue)'
  };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-viewport">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.icon && <LucideIcon name={t.icon} size={14} color={iconColor[t.tone]} style={{ marginTop:1 }} />}
            <div style={{ flex:1, minWidth:0 }}>
              <div className="t-title">{t.title}</div>
              {t.body && <div className="t-body">{t.body}</div>}
            </div>
            <button className="t-close" onClick={() => dismiss(t.id)}>
              <LucideIcon name="X" size={11} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- Dropdown menu ---------------- */
function Dropdown({ trigger, items, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <span ref={ref} style={{ position:'relative', display:'inline-flex' }}>
      <span onClick={() => setOpen(o => !o)}>{trigger}</span>
      {open && (
        <div className="menu" style={{ top:'calc(100% + 4px)', [align]: 0 }}>
          {items.map((it, i) => {
            if (it.sep) return <div key={i} className="menu-sep" />;
            if (it.label) return <div key={i} className="menu-label">{it.label}</div>;
            return (
              <div key={i} className={`menu-item ${it.danger ? 'danger' : ''}`}
                onClick={() => { setOpen(false); it.onClick?.(); }}>
                {it.icon && <LucideIcon name={it.icon} size={13} />}
                <span>{it.name}</span>
                {it.hint && <span className="mi-hint">{it.hint}</span>}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}

/* ---------------- Segmented Tabs ---------------- */
function SegTabs({ items, value, onChange }) {
  return (
    <div className="seg">
      {items.map(it => (
        <button key={it.key} className={`seg-item ${value === it.key ? 'active' : ''}`}
          onClick={() => onChange(it.key)}>
          {it.icon && <LucideIcon name={it.icon} size={11} />}
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Command Palette ---------------- */
function CommandPalette({ open, onClose, commands, onRun }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    setQ(''); setSel(0);
    setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);
  const filtered = useMemo(() => {
    if (!q.trim()) return commands;
    const lq = q.toLowerCase();
    return commands
      .map(g => ({ ...g, items: g.items.filter(i =>
        i.label.toLowerCase().includes(lq) || (i.hint && i.hint.toLowerCase().includes(lq))
      )}))
      .filter(g => g.items.length);
  }, [q, commands]);
  const flat = useMemo(() => filtered.flatMap(g => g.items.map(i => ({ ...i, group: g.label }))), [filtered]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(flat.length - 1, s + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = flat[sel]; if (it) { onRun?.(it); onClose?.(); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, flat, sel, onClose, onRun]);
  if (!open) return null;
  return (
    <div className="cp-backdrop" onClick={onClose}>
      <div className="cp" onClick={(e) => e.stopPropagation()}>
        <div className="cp-search">
          <LucideIcon name="Search" size={14} color="var(--text-tertiary)" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
            placeholder="명령 또는 파일 검색..." />
          <span className="kbd">ESC</span>
        </div>
        <div className="cp-list">
          {flat.length === 0 && (
            <div style={{ padding:'18px 12px', textAlign:'center', color:'var(--text-tertiary)', fontSize:11 }}>
              결과가 없어요
            </div>
          )}
          {filtered.map((g, gi) => (
            <React.Fragment key={gi}>
              <div className="cp-group-label">{g.label}</div>
              {g.items.map((it, i) => {
                const idx = filtered.slice(0, gi).reduce((a, x) => a + x.items.length, 0) + i;
                return (
                  <div key={i} className={`cp-item ${sel === idx ? 'sel' : ''}`}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => { onRun?.(it); onClose?.(); }}>
                    <span className="cp-icon"><LucideIcon name={it.icon || 'ChevronRight'} size={13} /></span>
                    <span className="cp-lbl">{it.label}</span>
                    {it.hint && <span className="cp-hint">{it.hint}</span>}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        <div className="cp-foot">
          <span className="row gap-1"><span className="kbd">↑</span><span className="kbd">↓</span> 이동</span>
          <span className="row gap-1"><span className="kbd">↵</span> 실행</span>
          <span className="grow" />
          <span>{flat.length}건</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Code / Diff ---------------- */
function CodeBlock({ lang = 'tsx', filename, children }) {
  return (
    <div className="codeblock">
      <div className="cb-head">
        <LucideIcon name="Code" size={11} />
        <span>{filename || lang}</span>
      </div>
      <pre>{children}</pre>
    </div>
  );
}
function Diff({ filename, lines }) {
  return (
    <div className="codeblock">
      <div className="cb-head">
        <LucideIcon name="GitCompareArrows" size={11} />
        <span>{filename}</span>
      </div>
      <pre>
        {lines.map((l, i) => (
          <span key={i} className={l.type === '+' ? 'diff-add' : l.type === '-' ? 'diff-del' : 'diff-ctx'}>
            {l.type === '+' ? '+ ' : l.type === '-' ? '- ' : '  '}{l.text}
          </span>
        ))}
      </pre>
    </div>
  );
}

/* ---------------- Markdown (simple renderer) ---------------- */
function MarkdownBody({ children }) {
  // Render children as-is HTML wrapped in markdown-body class
  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: children }} />;
}

Object.assign(window, {
  Avatar, Badge, TimeAgo,
  EmptyView, LoadingView, ErrorView,
  Modal, ToastHost, useToast,
  Dropdown, SegTabs, CommandPalette,
  CodeBlock, Diff, MarkdownBody
});

```


── FILE: ui_kits/clauday-desktop/theme.jsx ──
```jsx
// theme.jsx — theme + palette state, toggle button, settings modal

const { useEffect, useState, useCallback } = React;
const { Modal, LucideIcon } = window;

const PALETTES = [
  { id:'cool-minimal', name:'Cool Minimal',  hint:'라이트 · 중성 블루그레이', swatch:'#EFF1F5' },
  { id:'crisp-white',  name:'Crisp White',   hint:'라이트 · 순백',           swatch:'#FFFFFF' },
  { id:'soft-blue',    name:'Soft Blue',     hint:'라이트 · 시원한 블루',    swatch:'#E9EDF3' },
  { id:'graphite',     name:'Graphite',      hint:'라이트 · 차분한 회색',    swatch:'#E6E9EF' },
  { id:'paper',        name:'Paper',         hint:'라이트 · 오프화이트',     swatch:'#F4F4F4' }
];
const DEFAULT_THEME = { mode:'dark', palette:'cool-minimal' };

function applyTheme({ mode, palette }) {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  if (mode === 'light') root.setAttribute('data-palette', palette);
  else root.removeAttribute('data-palette');
}

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem('clauday-theme') || '{}') }; }
    catch { return DEFAULT_THEME; }
  });
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('clauday-theme', JSON.stringify(theme));
  }, [theme]);
  const setMode = useCallback((mode) => setTheme(t => ({ ...t, mode })), []);
  const setPalette = useCallback((palette) => setTheme(t => ({ ...t, palette, mode:'light' })), []);
  return { theme, setMode, setPalette, setTheme };
}

function ThemeToggleButton({ theme, onOpen }) {
  const isDark = theme.mode === 'dark';
  return (
    <button className="btn ghost sm" onClick={onOpen} title="테마 설정">
      <LucideIcon name={isDark ? 'Moon' : 'Sun'} size={12} />
      <span>{isDark ? 'Dark' : PALETTES.find(p => p.id === theme.palette)?.name || 'Light'}</span>
    </button>
  );
}

function ThemePickerModal({ open, onClose, theme, onChangeMode, onChangePalette }) {
  return (
    <Modal open={open} onClose={onClose} title="외관 설정" icon="Palette" width={520}
      footer={<button className="btn secondary sm" onClick={onClose}>닫기</button>}>
      <div className="field-label">모드</div>
      <div className="row gap-2" style={{ marginBottom:14 }}>
        {['dark','light'].map(m => (
          <button key={m}
            className={`btn ${theme.mode === m ? 'primary' : 'secondary'} sm`}
            onClick={() => onChangeMode(m)}>
            <LucideIcon name={m === 'dark' ? 'Moon' : 'Sun'} size={11} />
            {m === 'dark' ? '다크' : '라이트'}
          </button>
        ))}
      </div>
      <div className="field-label">라이트 팔레트</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
        {PALETTES.map(p => {
          const isActive = theme.mode === 'light' && theme.palette === p.id;
          return (
            <button key={p.id}
              onClick={() => onChangePalette(p.id)}
              style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'8px 10px', borderRadius:7,
                background: isActive ? 'var(--accent-blue-soft)' : 'var(--bg-surface)',
                border:`1px solid ${isActive ? 'var(--clover-blue)' : 'var(--bg-border)'}`,
                cursor:'pointer', textAlign:'left'
              }}>
              <span style={{
                width:28, height:28, borderRadius:7,
                background: p.swatch, border:'1px solid var(--bg-border)',
                flex:'none'
              }} />
              <div style={{ display:'flex', flexDirection:'column', gap:1, minWidth:0 }}>
                <span className="sm sb truncate" style={{ color:'var(--text-primary)' }}>{p.name}</span>
                <span className="xs subtle truncate">{p.hint}</span>
              </div>
              {isActive && <LucideIcon name="Check" size={14} color="var(--clover-blue)" style={{ marginLeft:'auto' }} />}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop:14, fontSize:10, color:'var(--text-tertiary)', lineHeight:1.5 }}>
        <LucideIcon name="Info" size={10} style={{ marginRight:4, verticalAlign:-1 }} />
        설정은 브라우저에 저장돼요. 실제 앱에서는 Settings → 외관에서 동일한 옵션을 노출합니다.
      </div>
    </Modal>
  );
}

Object.assign(window, { PALETTES, useTheme, ThemeToggleButton, ThemePickerModal });

```


── FILE: ui_kits/clauday-desktop/Shell.jsx ──
```jsx
// Shell.jsx — TitleBar + Sidebar + TabBar

const { LucideIcon, Button, ThemeToggleButton } = window;

const NAV = [
  { group: 'work', items: [
    { key: 'dooray', icon: 'Calendar', label: '두레이' },
    { key: 'monitoring', icon: 'Radar', label: '와쳐', badge: 11 },
    { key: 'terminal', icon: 'Terminal', label: '터미널' },
    { key: 'git', icon: 'GitBranch', label: '브랜치 작업' },
    { key: 'community', icon: 'Users', label: '커뮤니티' }
  ]},
  { group: 'tools', items: [
    { key: 'mcp', icon: 'Server', label: 'MCP 서버' },
    { key: 'skills', icon: 'Sparkles', label: 'Claude 스킬' },
    { key: 'sessions', icon: 'MessageSquare', label: '세션' },
    { key: 'usage', icon: 'BarChart3', label: '사용량' }
  ]}
];
const STANDALONE = [
  { key: 'manual', icon: 'BookOpen', label: '매뉴얼' },
  { key: 'settings', icon: 'Settings', label: '설정' }
];

function TitleBar({ aiActive, theme, onOpenTheme, onOpenCmd }) {
  return (
    <header className="titlebar">
      <div className="traffic"><span className="r" /><span className="y" /><span className="g" /></div>
      <div className="brand">
        <LucideIcon name="Clover" size={16} color="var(--clover-orange)" />
        <span className="brand-name">Clauday</span>
        <span className="brand-sub">Claude Code GUI</span>
      </div>
      <div className="spacer" />
      {aiActive && (
        <div className="ai-indicator" style={{ position:'absolute', left:'50%', transform:'translateX(-50%)' }}>
          <span className="pulse" />
          <span>AI 브리핑 생성 중 · 12초</span>
        </div>
      )}
      <div className="row gap-1" style={{ position:'relative', zIndex:1 }}>
        <button className="btn ghost sm" onClick={onOpenCmd} title="명령 팔레트">
          <LucideIcon name="Search" size={11} />
          <span className="kbd">⌘K</span>
        </button>
        {theme && <ThemeToggleButton theme={theme} onOpen={onOpenTheme} />}
      </div>
    </header>
  );
}

function Sidebar({ activeView, onNav }) {
  const NavBtn = ({ item }) => {
    const isActive = activeView === item.key;
    return (
      <button
        className={`navbtn ${isActive ? 'active' : ''}`}
        title={item.label}
        onClick={() => onNav(item.key)}
      >
        <LucideIcon name={item.icon} size={20} />
        {item.badge > 0 && <span className="badge">{item.badge > 99 ? '99+' : item.badge}</span>}
      </button>
    );
  };
  return (
    <aside className="sidebar">
      {NAV.map((g, gi) => (
        <React.Fragment key={g.group}>
          {g.items.map((it) => <NavBtn key={it.key} item={it} />)}
          {gi < NAV.length - 1 && <div className="sep" />}
        </React.Fragment>
      ))}
      <div className="grow" />
      <div className="sep" />
      {STANDALONE.map((it) => <NavBtn key={it.key} item={it} />)}
    </aside>
  );
}

function TabBar({ tabs, activeTab, onSelect, onClose, onNew }) {
  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <div
          key={t.id}
          className={`tab ${t.ai ? 'ai' : ''} ${activeTab === t.id ? 'active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          <LucideIcon name={t.icon} size={12} />
          <span>{t.label}</span>
          {onClose && (
            <span
              className="close"
              onClick={(e) => { e.stopPropagation(); onClose(t.id); }}
              title="닫기"
            >
              <LucideIcon name="X" size={10} />
            </span>
          )}
        </div>
      ))}
      {onNew && (
        <button className="tab newtab" onClick={onNew} title="새 탭">
          <LucideIcon name="Plus" size={12} />
        </button>
      )}
    </div>
  );
}

window.TitleBar = TitleBar;
window.Sidebar = Sidebar;
window.TabBar = TabBar;

```


── FILE: ui_kits/clauday-desktop/Dashboard.jsx ──
```jsx
// Dashboard.jsx — 업무 대시보드 (Linear 밀도)

const { useState: useStateDB } = React;
const { LucideIcon, Chip, Button, StatCard, Avatar, Dropdown, useToast } = window;

const MOCK_TODAY_TASKS = [
  { cls: 'working',    subject: '로그인 API 리팩토링',               code: 'CLOVER', due: '11월 21일', assignee:'김현우' },
  { cls: 'registered', subject: '두레이 웹훅 연동 검증',             code: 'CLOVER', due: '오늘',      assignee:'이서연' },
  { cls: 'working',    subject: '모니터링 대시보드 필터 리뉴얼',     code: 'DASH',   due: null,        assignee:'박도윤' },
  { cls: 'registered', subject: 'MCP 서버 편집 UX 수정',             code: 'CLOVER', due: '11월 23일', assignee:'김현우' },
  { cls: 'working',    subject: '사용량 화면 차트 라이브러리 교체',  code: 'DASH',   due: null,        assignee:'최지우' },
  { cls: 'registered', subject: '커뮤니티 댓글 알림 설계',            code: 'COMM',   due: null,        assignee:'이서연' },
  { cls: 'closed',     subject: '세션 히스토리 무한스크롤',           code: 'CLOVER', due: null,        assignee:'박도윤' }
];

const CLS_CHIP = {
  working:    { tone:'blue',    label:'진행 중' },
  registered: { tone:'orange',  label:'등록' },
  backlog:    { tone:'neutral', label:'백로그' },
  closed:     { tone:'emerald', label:'완료' }
};

function Dashboard() {
  const [expanded, setExpanded] = useStateDB(false);
  const [subject, setSubject] = useStateDB('');
  const [body, setBody] = useStateDB('');
  const [activeProj, setActiveProj] = useStateDB('CLOVER');
  const toast = useToast();

  const fakeCreate = () => {
    if (!subject.trim()) { toast.warn('제목이 필요해요', '태스크 제목을 먼저 입력하세요'); return; }
    toast.success(`${activeProj}에 생성됨`, `"${subject}" 태스크가 두레이에 등록됐어요`);
    setSubject(''); setBody('');
  };

  return (
    <div className="screen-inner" style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Page head */}
      <div className="row gap-2" style={{ alignItems:'center' }}>
        <LucideIcon name="LayoutDashboard" size={15} color="var(--text-primary)" />
        <span className="lg sb">대시보드</span>
        <span className="chip neutral">CLOVER · DASH · COMM</span>
        <div className="grow" />
        <Dropdown
          align="right"
          trigger={<button className="btn icon"><LucideIcon name="Filter" size={12} /></button>}
          items={[
            { label:'필터' },
            { name:'내가 담당', icon:'User' },
            { name:'이번 주 마감', icon:'Calendar' },
            { sep:true },
            { name:'필터 초기화', icon:'RotateCcw' }
          ]}
        />
        <Button variant="secondary" size="sm" icon="RotateCcw">새로고침</Button>
      </div>

      {/* Stat row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8 }}>
        <StatCard label="전체 태스크" value="47" />
        <StatCard label="진행 중" value="12" tone="blue" dotColor="#60A5FA" />
        <StatCard label="등록됨" value="23" tone="orange" dotColor="#FB923C" />
        <StatCard label="오늘 마감" value="3" tone="red" dotColor="#F87171" />
        <StatCard label="완료 (7일)" value="18" tone="emerald" dotColor="#22C55E" />
      </div>

      {/* Quick create */}
      <div className="card" style={{ padding: 0 }}>
        <button
          className="row gap-2"
          style={{ width:'100%', padding:'8px 12px', cursor:'pointer' }}
          onClick={() => setExpanded(e => !e)}
        >
          <LucideIcon name={expanded ? 'ChevronDown' : 'ChevronRight'} size={12} color="var(--text-secondary)" />
          <LucideIcon name="Plus" size={12} color="var(--clover-blue)" />
          <span className="sb md">빠른 태스크 생성</span>
          <span className="subtle xs">· 제목을 먼저 쓰고 AI로 본문 채우기</span>
          <div className="grow" />
          <span className="kbd">⌘N</span>
        </button>
        {expanded && (
          <div className="col gap-2" style={{ padding:'10px 12px 12px', borderTop:'1px solid var(--bg-border)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'160px 1fr', gap:8 }}>
              <div className="col gap-1">
                <span className="field-label">프로젝트</span>
                <select className="input sm" value={activeProj} onChange={(e) => setActiveProj(e.target.value)}>
                  <option>CLOVER</option><option>DASH</option><option>COMM</option>
                </select>
              </div>
              <div className="col gap-1">
                <span className="field-label">제목</span>
                <input className="input sm" placeholder="예: 로그인 세션 만료 이슈 수정"
                  value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            </div>
            <div className="col gap-1">
              <div className="row gap-2">
                <span className="field-label" style={{ marginBottom:0 }}>본문</span>
                <span className="subtle xs">· 마크다운</span>
                <div className="grow" />
                <Button variant="ghost" size="xs" icon="FileText">템플릿</Button>
                <Button variant="ai" size="xs" icon="Wand2">AI로 채우기</Button>
              </div>
              <textarea className="input mono" rows={4}
                style={{ resize:'none', fontSize:11, whiteSpace:'pre' }}
                placeholder="## 요약&#10;- [ ] 세션 만료 5분 → 30분"
                value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="row gap-2">
              <div className="grow" />
              <Button variant="ghost" size="sm" onClick={() => { setSubject(''); setBody(''); }}>취소</Button>
              <Button variant="success" size="sm" icon="Send" onClick={fakeCreate}>두레이에 생성</Button>
            </div>
          </div>
        )}
      </div>

      {/* Today focus list */}
      <div className="col gap-2">
        <div className="row gap-2">
          <LucideIcon name="Target" size={13} color="var(--text-secondary)" />
          <span className="sb md">오늘 집중할 태스크</span>
          <span className="chip neutral">{MOCK_TODAY_TASKS.filter(t => t.cls !== 'closed').length}</span>
          <div className="grow" />
          <Button variant="ghost" size="xs" icon="ArrowRight">전체 보기</Button>
        </div>
        <div className="card" style={{ padding: 3 }}>
          {MOCK_TODAY_TASKS.map((t, i) => {
            const chip = CLS_CHIP[t.cls];
            return (
              <div key={i} className="row gap-2"
                style={{
                  padding:'5px 8px',
                  borderRadius:5,
                  cursor:'pointer',
                  background: i === 1 ? 'var(--bg-surface-raised)' : 'transparent'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = i === 1 ? 'var(--bg-surface-raised)' : 'transparent'}
              >
                <Chip tone={chip.tone}>{chip.label}</Chip>
                <span className="md" style={{ flex:1, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.subject}</span>
                <Avatar name={t.assignee} size="sm" />
                <span className="mono xs subtle">{t.code}</span>
                {t.due && <span className="xs" style={{ color: t.due === '오늘' ? '#F87171' : 'var(--text-tertiary)', whiteSpace:'nowrap' }}>{t.due}</span>}
                <LucideIcon name="ArrowRight" size={11} color="var(--text-tertiary)" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;

```


── FILE: ui_kits/clauday-desktop/Briefing.jsx ──
```jsx
// Briefing.jsx — AI 브리핑

const { LucideIcon: _LIB, Chip: _ChipB, Button: _BtnB } = window;
const LucideIcon = _LIB, Chip = _ChipB, Button = _BtnB;

const MOCK_BRIEFING = {
  greeting: '안녕하세요, 오늘도 좋은 하루 보내세요. 긴급 3건이 대기 중이에요.',
  urgent: [
    { subject: '로그인 세션 만료 버그 복구', project: 'CLOVER', why: '오늘 18시 배포 예정' },
    { subject: 'MCP 서버 편집 시 크래시', project: 'CLOVER', why: '어제 장애 이어짐' },
    { subject: 'Dooray 토큰 만료 알림 누락',   project: 'DASH',   why: 'QA 리포트' }
  ],
  focus: [
    { subject: '두레이 웹훅 연동 검증', project: 'CLOVER', why: '어제부터 진행, 오늘 마무리 가능' },
    { subject: '브리핑 히스토리 UX 정리', project: 'CLOVER', why: '일찍 끝내면 내일 여유' }
  ],
  mentions: [
    { subject: '@you — 디자인 토큰 마이그레이션 리뷰 부탁드려요', from: '김이박', channel: '#design-system' },
    { subject: '@you — 모니터링 필터, 어제 말한 것 반영 가능한가요?', from: '박송이', channel: '#dash' }
  ],
  meetings: [
    { time: '10:30', title: '위클리 스탠드업', note: '대시보드 진척 공유' },
    { time: '14:00', title: '두레이 연동 회고',  note: 'AI 기능 이후 수치 공유' }
  ],
  tips: [
    '오전 2시간을 긴급 2건에 할당하면 오후에 여유가 생깁니다.',
    '@김이박 리뷰 요청을 25분 안에 답해두면 코드 리뷰 체증이 풀려요.'
  ]
};

function BriefingHeader({ onGenerate, generating }) {
  return (
    <div className="row border-b" style={{ padding:'10px 16px', gap:8 }}>
      <LucideIcon name="Sparkles" size={16} color="var(--clover-orange)" className={generating ? 'spin' : ''} />
      <span className="md sb">AI 브리핑</span>
      <button className="row gap-1 xs subtle" style={{ padding:'2px 8px', borderRadius:4, background:'var(--bg-surface-raised)' }}>
        히스토리 4개 <LucideIcon name="ChevronDown" size={10} />
      </button>
      <span className="subtle xs">· 오늘 07:30 생성</span>
      <div className="grow" />
      <Button variant="ghost" size="sm" icon="Trash2" title="삭제"></Button>
      <Button variant="ai" size="sm" icon="Sparkles" onClick={onGenerate}>새 브리핑 생성</Button>
    </div>
  );
}

function BriefingSection({ tone, icon, title, items, renderItem }) {
  const toneMap = {
    red:     { text:'#F87171', bgFrom:'rgba(239,68,68,0.08)',  border:'rgba(239,68,68,0.22)'  },
    blue:    { text:'#60A5FA', bgFrom:'rgba(37,99,235,0.08)',  border:'rgba(37,99,235,0.22)'  },
    violet:  { text:'#A78BFA', bgFrom:'rgba(167,139,250,0.10)', border:'rgba(167,139,250,0.22)'},
    emerald: { text:'#22C55E', bgFrom:'rgba(34,197,94,0.08)',  border:'rgba(34,197,94,0.22)'  },
    yellow:  { text:'#FACC15', bgFrom:'rgba(250,204,21,0.10)', border:'rgba(250,204,21,0.22)' }
  }[tone];
  return (
    <div style={{
      borderRadius:12,
      padding:'12px 14px',
      background: `linear-gradient(90deg, ${toneMap.bgFrom}, transparent)`,
      border: `1px solid ${toneMap.border}`,
      display:'flex', flexDirection:'column', gap:8
    }}>
      <div className="row gap-2">
        <LucideIcon name={icon} size={14} color={toneMap.text} />
        <span className="sb md" style={{ color: toneMap.text }}>{title}</span>
        <span className="xs subtle">· {items.length}</span>
      </div>
      <div className="col gap-1">
        {items.map(renderItem)}
      </div>
    </div>
  );
}

function Briefing() {
  const [generating, setGenerating] = React.useState(false);
  const [bri, setBri] = React.useState(MOCK_BRIEFING);

  const regenerate = () => {
    setGenerating(true);
    setTimeout(() => setGenerating(false), 2000);
  };

  return (
    <div className="col" style={{ height:'100%' }}>
      <BriefingHeader onGenerate={regenerate} generating={generating} />
      <div className="col gap-3" style={{ padding:'16px 20px', overflow:'auto', flex:1, maxWidth: 960, width:'100%', margin:'0 auto' }}>
        {/* Greeting */}
        <div className="card" style={{ borderColor: 'transparent', background: 'linear-gradient(90deg, rgba(234,88,12,0.06), rgba(37,99,235,0.06))', padding:'14px 16px' }}>
          <div className="md" style={{ color: 'var(--text-primary)', lineHeight:1.6 }}>
            {bri.greeting}
          </div>
          <div className="row gap-2" style={{ marginTop:8 }}>
            <Chip tone="orange" dot>긴급 3</Chip>
            <Chip tone="blue" dot>집중 2</Chip>
            <Chip tone="violet" dot>멘션 2</Chip>
            <Chip tone="emerald" dot>회의 2</Chip>
          </div>
        </div>

        <BriefingSection
          tone="red" icon="AlertTriangle" title="긴급"
          items={bri.urgent}
          renderItem={(it, i) => (
            <div className="row gap-2" key={i}>
              <span className="md" style={{ flex:1, color:'var(--text-primary)' }}>{it.subject}</span>
              <span className="mono xs subtle">{it.project}</span>
              <span className="xs muted" style={{ flex:'0 0 auto' }}>· {it.why}</span>
            </div>
          )}
        />
        <BriefingSection
          tone="blue" icon="Target" title="오늘 집중"
          items={bri.focus}
          renderItem={(it, i) => (
            <div className="row gap-2" key={i}>
              <span className="md" style={{ flex:1, color:'var(--text-primary)' }}>{it.subject}</span>
              <span className="mono xs subtle">{it.project}</span>
              <span className="xs muted">· {it.why}</span>
            </div>
          )}
        />
        <BriefingSection
          tone="violet" icon="MessageSquare" title="멘션/답장"
          items={bri.mentions}
          renderItem={(it, i) => (
            <div className="row gap-2" key={i}>
              <span className="md" style={{ flex:1, color:'var(--text-primary)' }}>{it.subject}</span>
              <span className="xs muted">{it.from} · {it.channel}</span>
            </div>
          )}
        />
        <BriefingSection
          tone="emerald" icon="Calendar" title="오늘 회의"
          items={bri.meetings}
          renderItem={(it, i) => (
            <div className="row gap-2" key={i}>
              <span className="mono xs" style={{ color:'#22C55E' }}>{it.time}</span>
              <span className="md" style={{ flex:1, color:'var(--text-primary)' }}>{it.title}</span>
              <span className="xs subtle">{it.note}</span>
            </div>
          )}
        />
        <BriefingSection
          tone="yellow" icon="Lightbulb" title="AI 제안"
          items={bri.tips}
          renderItem={(tip, i) => (
            <div className="row gap-2" key={i}>
              <span className="md" style={{ flex:1, color:'var(--text-primary)' }}>{tip}</span>
            </div>
          )}
        />

        {/* Feedback */}
        <div className="row gap-2" style={{ marginTop:4, justifyContent:'center' }}>
          <span className="xs subtle">이 브리핑이 유용했나요?</span>
          <Button variant="ghost" size="xs" icon="ThumbsUp">도움 됨</Button>
          <Button variant="ghost" size="xs" icon="ThumbsDown">별로</Button>
        </div>
      </div>
    </div>
  );
}

window.Briefing = Briefing;

```


── FILE: ui_kits/clauday-desktop/McpServers.jsx ──
```jsx
// McpServers.jsx — MCP 서버 리스트 화면

const { LucideIcon: _LIMcp, Chip: _ChipMcp, Button: _BtnMcp } = window;
const LucideIcon = _LIMcp, Chip = _ChipMcp, Button = _BtnMcp;

const MOCK_MCP = [
  { id:'fs', name:'filesystem', cmd:'npx', args:['-y','@modelcontextprotocol/server-filesystem','/Users/me'], enabled:true, tools:12 },
  { id:'gh', name:'github',     cmd:'docker', args:['run','-i','--rm','-e','GITHUB_TOKEN','mcp/github'], enabled:false, tools:8 },
  { id:'dr', name:'dooray',     cmd:'node', args:['./scripts/dooray-mcp.js'], enabled:true, tools:21 },
  { id:'pg', name:'postgres',   cmd:'npx', args:['-y','@mcp/postgres','postgres://localhost/app'], enabled:true, tools:7 },
  { id:'ws', name:'web-search', cmd:'uvx', args:['mcp-server-websearch'], enabled:false, tools:3 }
];

function McpCard({ s }) {
  return (
    <div className="card" style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
      <div className="row" style={{ alignItems:'flex-start', gap:8 }}>
        <div style={{ width:36, height:36, borderRadius:8, background:'rgba(37,99,235,0.12)', display:'flex', alignItems:'center', justifyContent:'center', color:'#60A5FA', flex:'none' }}>
          <LucideIcon name="Server" size={16} />
        </div>
        <div className="col" style={{ flex:1, minWidth:0 }}>
          <div className="row gap-2">
            <span className="md sb truncate">{s.name}</span>
            {s.enabled
              ? <Chip tone="emerald" dot>활성</Chip>
              : <Chip tone="orange">비활성</Chip>}
          </div>
          <div className="row gap-2" style={{ marginTop:2 }}>
            <span className="mono xs subtle">{s.cmd}</span>
            <span className="xs subtle">· 도구 {s.tools}개</span>
          </div>
        </div>
        <div className="row gap-1">
          <Button variant="icon" icon="Pencil" title="편집" />
          <Button variant="icon" icon="Power" title={s.enabled ? '중지' : '시작'} />
          <Button variant="icon" icon="Trash2" title="삭제" />
        </div>
      </div>
      <div className="row" style={{ flexWrap:'wrap', gap:4 }}>
        {s.args.map((a, i) => (
          <span key={i} className="mono xs" style={{ padding:'2px 7px', borderRadius:3, background:'var(--bg-border)', color:'var(--text-secondary)' }}>{a}</span>
        ))}
      </div>
    </div>
  );
}

function McpServers() {
  return (
    <div className="screen-inner col gap-4">
      <div className="row gap-3">
        <LucideIcon name="Server" size={18} />
        <span className="lg sb">MCP 서버</span>
        <span className="subtle sm">· 5개 · 활성 3</span>
        <div className="grow" />
        <Button variant="secondary" size="sm" icon="Upload">가져오기</Button>
        <Button variant="primary" size="sm" icon="Plus">서버 추가</Button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {MOCK_MCP.map(s => <McpCard key={s.id} s={s} />)}
      </div>
      <div className="xs subtle">💡 설정은 <span className="mono">~/.clauday/mcp.json</span>에 저장됩니다. Ctrl+R로 새로고침.</div>
    </div>
  );
}

window.McpServers = McpServers;

```


── FILE: ui_kits/clauday-desktop/Terminal.jsx ──
```jsx
// Terminal.jsx — 터미널 (일반 + Claude Code)

const { LucideIcon: _LIT, Button: _BtnT } = window;
const LucideIcon = _LIT, Button = _BtnT;

const MOCK_LINES = [
  { p:'$', t:'git status', kind:'cmd' },
  { t:'On branch feat/dashboard', kind:'out' },
  { t:"Your branch is up to date with 'origin/feat/dashboard'.", kind:'out' },
  { t:'', kind:'out' },
  { t:'Changes not staged for commit:', kind:'out' },
  { t:'  modified:   src/components/Dooray/DashboardView.tsx', kind:'out-red' },
  { t:'  modified:   src/index.css', kind:'out-red' },
  { t:'', kind:'out' },
  { p:'$', t:'pnpm run dev', kind:'cmd' },
  { t:'vite v5.4.11 dev server running at:', kind:'out-green' },
  { t:'  ➜  Local:   http://localhost:5173/', kind:'out' },
  { t:'  ➜  press h + enter to show help', kind:'out-dim' }
];

const MOCK_CC = [
  { who:'user', text:'대시보드 StatCard에서 숫자 색깔이 상태 색과 일치하도록 수정해줘' },
  { who:'ai',   text:'DashboardView.tsx의 stat 컴포넌트를 확인했어요. `value`에 tone별 CSS 변수를 바인딩하면 됩니다.' },
  { who:'tool', text:'Read src/components/Dooray/DashboardView.tsx (501 lines)' },
  { who:'tool', text:'Edit src/components/Dooray/DashboardView.tsx +3 −1' },
  { who:'ai',   text:'1곳 수정했어요. 계속할까요? (y/n)' }
];

function TerminalScreen() {
  const [mode, setMode] = React.useState('shell');
  return (
    <div className="col" style={{ height:'100%' }}>
      {/* sub-tab strip */}
      <div className="row border-b" style={{ padding:'6px 12px', gap:6, background:'var(--bg-surface)' }}>
        <button className={`tab ${mode === 'shell' ? 'active' : ''}`} onClick={() => setMode('shell')}>
          <LucideIcon name="Terminal" size={12} /><span>zsh — ~/clauday</span>
        </button>
        <button className={`tab ai ${mode === 'cc' ? 'active' : ''}`} onClick={() => setMode('cc')}>
          <LucideIcon name="Sparkles" size={12} /><span>Claude Code — main</span>
        </button>
        <div className="grow" />
        <Button variant="icon" icon="FolderOpen" title="작업 폴더 변경" />
        <Button variant="icon" icon="RotateCcw" title="재시작" />
      </div>
      <div style={{ flex:1, background:'#0b1020', fontFamily:'var(--font-mono)', fontSize:12, padding:'12px 16px', overflow:'auto', color:'#CBD5E1' }}>
        {mode === 'shell'
          ? MOCK_LINES.map((l, i) => (
              <div key={i} style={{
                color: l.kind === 'out-red' ? '#F87171'
                     : l.kind === 'out-green' ? '#4ADE80'
                     : l.kind === 'out-dim' ? '#94A3B8'
                     : l.kind === 'cmd' ? '#F9FAFB' : '#CBD5E1',
                whiteSpace:'pre'
              }}>
                {l.p && <span style={{ color:'#FB923C', marginRight:8 }}>{l.p}</span>}
                {l.t}
              </div>
            ))
          : MOCK_CC.map((m, i) => (
              <div key={i} style={{ marginBottom:10, display:'flex', gap:8 }}>
                <span style={{
                  fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:3, height:'fit-content',
                  color: m.who === 'user' ? '#60A5FA' : m.who === 'ai' ? '#FB923C' : '#A78BFA',
                  background: m.who === 'user' ? 'rgba(37,99,235,0.15)' : m.who === 'ai' ? 'rgba(234,88,12,0.15)' : 'rgba(167,139,250,0.15)'
                }}>{m.who === 'user' ? 'YOU' : m.who === 'ai' ? 'AI' : 'TOOL'}</span>
                <div style={{ flex:1, whiteSpace:'pre-wrap', fontFamily: m.who === 'tool' ? 'var(--font-mono)' : 'var(--font-ui)', fontSize: m.who === 'tool' ? 11 : 12 }}>{m.text}</div>
              </div>
            ))
        }
        <div style={{ color:'#F9FAFB' }}>
          <span style={{ color:'#FB923C', marginRight:8 }}>{mode === 'shell' ? '$' : '›'}</span>
          <span style={{ borderRight:'2px solid #F9FAFB', paddingRight:2, animation:'blink 1s infinite' }}></span>
        </div>
      </div>
      <style>{`@keyframes blink{50%{border-right-color:transparent}}`}</style>
    </div>
  );
}

window.TerminalScreen = TerminalScreen;

```


── FILE: ui_kits/clauday-desktop/Monitoring.jsx ──
```jsx
// Monitoring.jsx — Watcher (메신저 룸 · 키워드 · 기간 필터 매치)

const { LucideIcon: _LIM, Chip: _ChipM, Button: _BtnM } = window;
const LucideIcon = _LIM, Chip = _ChipM, Button = _BtnM;

const { useState: _useS, useMemo: _useM } = React;

// --- Mock watchers ---
// Each watcher = room + keyword(s) + date range
const WATCHERS = [
  {
    id:'w1', name:'출시 이슈 트래킹',
    room:{ app:'dooray', name:'#clover-release', members:18 },
    keywords:['장애','p95','rollback'],
    range:{ from:'2024-11-18', to:'2024-11-25', label:'최근 7일' },
    lastRun:'방금 전', newHits:8, totalHits:24, active:true
  },
  {
    id:'w2', name:'"@디자인팀" 멘션',
    room:{ app:'slack', name:'#product-design', members:34 },
    keywords:['@디자인팀'],
    range:{ from:'2024-11-21', to:'2024-11-21', label:'오늘' },
    lastRun:'3분 전', newHits:3, totalHits:12, active:true
  },
  {
    id:'w3', name:'두레이 토큰 만료',
    room:{ app:'dooray', name:'#devops', members:9 },
    keywords:['토큰','만료','expired'],
    range:{ from:'2024-11-11', to:'2024-11-25', label:'지난 2주' },
    lastRun:'12분 전', newHits:0, totalHits:6, active:true
  },
  {
    id:'w4', name:'신규 입사자 온보딩',
    room:{ app:'slack', name:'#newbies', members:42 },
    keywords:['온보딩','첫 출근'],
    range:{ from:'2024-11-01', to:'2024-11-25', label:'이번 달' },
    lastRun:'1시간 전', newHits:0, totalHits:4, active:false
  }
];

// --- Mock messages for w1 ---
const MESSAGES = {
  w1: [
    { t:'오늘 11:42', author:'김현우', role:'백엔드', avatar:'KH',
      text:'배포 직후 p95 latency 420ms 찍힘. rollback 필요할지 판단 부탁드려요.', hit:['p95','rollback'] },
    { t:'오늘 11:40', author:'박도윤', role:'SRE', avatar:'PD',
      text:'장애 의심됩니다. 방금 alert 떴어요 — 대시보드 확인 중이에요.', hit:['장애'] },
    { t:'어제 18:22', author:'이서연', role:'프론트', avatar:'LS',
      text:'p95는 안정적인데 에러율이 살짝 튀네요. 로그 원인 분석 필요.', hit:['p95'] },
    { t:'어제 16:05', author:'최지우', role:'QA', avatar:'CJ',
      text:'스테이징에서 세션 만료 이슈 재현돼요. 릴리즈 노트에 rollback 플랜 넣어주세요.', hit:['rollback'] },
    { t:'11/19 09:11', author:'김현우', role:'백엔드', avatar:'KH',
      text:'과거 장애 케이스 보니 같은 패턴이었어요. 토큰 캐시 무효화 타이밍 점검 필요.', hit:['장애'] },
    { t:'11/18 14:30', author:'박송이', role:'PM', avatar:'PS',
      text:'rollback 기준: p95 > 400ms 5분 이상 유지될 때로 합의했어요.', hit:['rollback','p95'] }
  ],
  w2: [
    { t:'오늘 09:32', author:'박송이', role:'PM', avatar:'PS',
      text:'@디자인팀 대시보드 진행도 컴포넌트 리뷰 부탁드려요. 오늘 중 배포 예정이에요.', hit:['@디자인팀'] },
    { t:'오늘 08:14', author:'이서연', role:'프론트', avatar:'LS',
      text:'@디자인팀 어제 공유드린 토큰 네이밍 시안 확정할까요?', hit:['@디자인팀'] },
    { t:'오늘 07:40', author:'DevOps', role:'봇', avatar:'DO',
      text:'@디자인팀 스테이징 환경에 새 테마 토큰 적용 완료. 확인 부탁드려요.', hit:['@디자인팀'] }
  ],
  w3: [],
  w4: []
};

function AppIcon({ app, size = 14 }) {
  const c = app === 'dooray' ? '#EA580C' : app === 'slack' ? '#611F69' : '#64748B';
  return (
    <span style={{
      width: size + 6, height: size + 6, flex:'none',
      borderRadius: 4, background: c,
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      color:'#fff', fontSize: size - 4, fontWeight: 800, letterSpacing:'0.02em'
    }}>
      {app === 'dooray' ? 'D' : app === 'slack' ? '#' : '·'}
    </span>
  );
}

// Highlight keyword occurrences inside a message
function highlight(text, kws) {
  if (!kws?.length) return text;
  const re = new RegExp('(' + kws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  const parts = text.split(re);
  return parts.map((p, i) => re.test(p) ?
    <mark key={i} style={{
      background:'rgba(234,88,12,0.22)', color:'var(--text-primary)',
      padding:'0 3px', borderRadius:3, fontWeight:600
    }}>{p}</mark>
    : <React.Fragment key={i}>{p}</React.Fragment>
  );
}

function WatcherListItem({ w, active, onClick }) {
  const hasNew = w.newHits > 0;
  return (
    <button onClick={onClick} className="row gap-2" style={{
      width:'100%', padding:'8px 10px', borderRadius:6,
      background: active ? 'var(--bg-surface-hover)' : 'transparent',
      borderLeft: active ? '2px solid var(--clover-blue)' : '2px solid transparent',
      textAlign:'left', cursor:'pointer'
    }}>
      <AppIcon app={w.room.app} />
      <div className="col" style={{ flex:1, minWidth:0, gap:2 }}>
        <div className="row gap-1" style={{ minWidth:0 }}>
          <span className="md sb truncate" style={{ color: w.active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{w.name}</span>
        </div>
        <span className="xs subtle truncate">{w.room.name} · {w.range.label}</span>
        <div className="row gap-1" style={{ flexWrap:'wrap', marginTop:2 }}>
          {w.keywords.slice(0,3).map(k =>
            <span key={k} style={{
              fontSize:9.5, padding:'1px 5px', borderRadius:3,
              background:'rgba(234,88,12,0.10)', color:'#FB923C',
              fontFamily:'var(--font-mono)', fontWeight:500
            }}>{k}</span>
          )}
        </div>
      </div>
      {hasNew && <span className="chip orange" style={{ alignSelf:'flex-start' }}>+{w.newHits}</span>}
      {!w.active && <LucideIcon name="PauseCircle" size={12} color="var(--text-tertiary)" />}
    </button>
  );
}

function WatcherDetail({ w }) {
  const [from, setFrom] = _useS(w.range.from);
  const [to, setTo] = _useS(w.range.to);
  const [kwDraft, setKwDraft] = _useS('');
  const [kws, setKws] = _useS(w.keywords);
  const msgs = MESSAGES[w.id] || [];

  // reset form state when watcher changes
  React.useEffect(() => { setFrom(w.range.from); setTo(w.range.to); setKws(w.keywords); setKwDraft(''); }, [w.id]);

  const addKw = () => { if (kwDraft.trim()) { setKws([...kws, kwDraft.trim()]); setKwDraft(''); } };
  const rmKw = (k) => setKws(kws.filter(x => x !== k));

  return (
    <div className="col" style={{ height:'100%' }}>
      {/* Detail header */}
      <div className="col" style={{ padding:'10px 16px', borderBottom:'1px solid var(--bg-border)', gap:8 }}>
        <div className="row gap-2">
          <AppIcon app={w.room.app} size={16} />
          <span className="lg sb">{w.name}</span>
          <span className="xs subtle">{w.room.name} · 멤버 {w.room.members}명</span>
          <div className="grow" />
          <Button variant="ghost" size="sm" icon={w.active ? 'Pause' : 'Play'}>{w.active ? '일시정지' : '활성화'}</Button>
          <Button variant="ghost" size="sm" icon="Bell">알림</Button>
          <Button variant="ghost" size="sm" icon="Ellipsis" />
        </div>

        {/* Filter bar — room / keywords / date range */}
        <div className="row gap-2" style={{ flexWrap:'wrap' }}>
          {/* Keywords input */}
          <div className="row gap-1" style={{
            padding:'4px 6px', background:'var(--bg-surface)',
            border:'1px solid var(--bg-border)', borderRadius:6,
            flexWrap:'wrap', minHeight:28, minWidth:260, flex:1
          }}>
            <LucideIcon name="Search" size={12} color="var(--text-tertiary)" />
            {kws.map(k => (
              <span key={k} className="row gap-1" style={{
                height:20, padding:'0 6px', borderRadius:4,
                background:'rgba(234,88,12,0.14)', color:'#FB923C',
                fontFamily:'var(--font-mono)', fontSize:10.5, fontWeight:600
              }}>
                {k}
                <button onClick={() => rmKw(k)} style={{
                  background:'none', border:0, color:'inherit', cursor:'pointer', padding:0,
                  display:'flex', opacity:.7
                }}>
                  <LucideIcon name="X" size={10} />
                </button>
              </span>
            ))}
            <input value={kwDraft}
              onChange={e => setKwDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addKw(); }}
              placeholder="키워드 추가…"
              style={{
                flex:1, minWidth:80, height:20, border:0, outline:'none',
                background:'transparent', color:'var(--text-primary)', fontSize:12
              }} />
          </div>

          {/* Date range */}
          <div className="row gap-1" style={{
            padding:'0 8px', height:28,
            background:'var(--bg-surface)', border:'1px solid var(--bg-border)',
            borderRadius:6, color:'var(--text-secondary)'
          }}>
            <LucideIcon name="Calendar" size={12} />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{
              border:0, outline:'none', background:'transparent',
              color:'var(--text-primary)', fontSize:11, fontFamily:'var(--font-mono)'
            }} />
            <span className="xs subtle">→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{
              border:0, outline:'none', background:'transparent',
              color:'var(--text-primary)', fontSize:11, fontFamily:'var(--font-mono)'
            }} />
          </div>

          {/* Quick presets */}
          <div className="row gap-0" style={{
            padding:2, background:'var(--bg-surface)', border:'1px solid var(--bg-border)', borderRadius:6
          }}>
            {['오늘','7일','30일'].map(p =>
              <button key={p} style={{
                height:22, padding:'0 8px', borderRadius:4, border:0,
                background: p==='7일' ? 'var(--bg-surface-raised)' : 'transparent',
                color: p==='7일' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize:11, fontWeight:500, cursor:'pointer'
              }}>{p}</button>
            )}
          </div>

          <Button variant="secondary" size="sm" icon="RefreshCw">재검색</Button>
        </div>

        {/* Result stats */}
        <div className="row gap-3" style={{ paddingTop:2 }}>
          <span className="xs subtle">
            매치된 메시지 <b style={{ color:'var(--text-primary)' }}>{msgs.length}</b>건
            {w.newHits > 0 && <> · <span style={{ color:'#FB923C' }}>신규 {w.newHits}</span></>}
          </span>
          <span className="xs subtle">마지막 스캔: {w.lastRun}</span>
          <div className="grow" />
          <button className="xs subtle" style={{ background:'none', border:0, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
            <LucideIcon name="Download" size={11} /> CSV 내보내기
          </button>
        </div>
      </div>

      {/* Message stream */}
      {msgs.length === 0 ? (
        <div className="col" style={{ flex:1, alignItems:'center', justifyContent:'center', gap:10 }}>
          <div className="state-icon"><LucideIcon name="Search" size={20} /></div>
          <div className="state-title">이 기간에 매치된 메시지가 없어요</div>
          <div className="state-body">키워드나 날짜 범위를 넓혀보세요.</div>
        </div>
      ) : (
        <div className="col" style={{ overflow:'auto', flex:1, padding:'6px 0' }}>
          {msgs.map((m, i) => {
            const prev = msgs[i-1];
            const sameAuthor = prev && prev.author === m.author;
            return (
              <div key={i} className="row gap-3" style={{
                padding: sameAuthor ? '2px 20px 2px 20px' : '10px 20px 4px 20px',
                alignItems:'flex-start'
              }}>
                {!sameAuthor ? (
                  <div style={{
                    width:28, height:28, borderRadius:'50%', flex:'none',
                    background:'var(--bg-surface-hover)', color:'var(--text-primary)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:10, fontWeight:700
                  }}>{m.avatar}</div>
                ) : (
                  <div style={{ width:28, flex:'none' }} />
                )}
                <div className="col" style={{ flex:1, minWidth:0, gap:2 }}>
                  {!sameAuthor && (
                    <div className="row gap-2">
                      <span className="md sb" style={{ color:'var(--text-primary)' }}>{m.author}</span>
                      <span className="xs subtle">{m.role}</span>
                      <span className="xs subtle">· {m.t}</span>
                    </div>
                  )}
                  <div className="md" style={{ color:'var(--text-primary)', lineHeight:1.55 }}>
                    {highlight(m.text, w.keywords)}
                  </div>
                  <div className="row gap-2" style={{ marginTop:2, opacity:0.8 }}>
                    {m.hit.map(h => (
                      <span key={h} style={{
                        fontSize:9.5, padding:'1px 5px', borderRadius:3,
                        background:'rgba(234,88,12,0.10)', color:'#FB923C',
                        fontFamily:'var(--font-mono)', fontWeight:500
                      }}>{h}</span>
                    ))}
                    <div className="grow" />
                    <button className="xs subtle" style={{
                      background:'none', border:0, cursor:'pointer',
                      display:'flex', alignItems:'center', gap:4
                    }}>
                      <LucideIcon name="ExternalLink" size={10} /> 원문 열기
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Monitoring() {
  const [watchers] = _useS(WATCHERS);
  const [selId, setSelId] = _useS(WATCHERS[0].id);
  const sel = watchers.find(w => w.id === selId);

  return (
    <div className="row" style={{ height:'100%' }}>
      {/* Left: watchers list */}
      <aside style={{
        width: 280, flex:'none',
        borderRight:'1px solid var(--bg-border)',
        background:'var(--bg-surface)',
        display:'flex', flexDirection:'column'
      }}>
        <div className="row gap-2" style={{ padding:'10px 12px', borderBottom:'1px solid var(--bg-border)' }}>
          <LucideIcon name="Radar" size={14} color="var(--clover-orange)" />
          <span className="md sb">와쳐</span>
          <span className="chip neutral">{watchers.length}</span>
          <div className="grow" />
          <Button variant="primary" size="xs" icon="Plus">새 와쳐</Button>
        </div>
        <div style={{ padding:'6px 8px', borderBottom:'1px solid var(--bg-border)' }}>
          <div className="row gap-1" style={{
            padding:'4px 8px', borderRadius:5,
            background:'var(--bg-primary)', border:'1px solid var(--bg-border)'
          }}>
            <LucideIcon name="Search" size={11} color="var(--text-tertiary)" />
            <input placeholder="와쳐 검색…" style={{
              flex:1, height:20, border:0, outline:'none', background:'transparent',
              color:'var(--text-primary)', fontSize:11
            }} />
          </div>
        </div>
        <div className="col" style={{ padding:4, overflow:'auto', flex:1, gap:1 }}>
          {watchers.map(w =>
            <WatcherListItem key={w.id} w={w} active={w.id === selId} onClick={() => setSelId(w.id)} />
          )}
        </div>
        <div className="col" style={{ padding:'8px 12px', borderTop:'1px solid var(--bg-border)', gap:2 }}>
          <span className="xs subtle">총 매치 {watchers.reduce((s,w)=>s+w.totalHits,0)}건 · 신규 {watchers.reduce((s,w)=>s+w.newHits,0)}건</span>
        </div>
      </aside>

      {/* Right: selected watcher detail */}
      {sel ? <div style={{ flex:1, minWidth:0 }}><WatcherDetail w={sel} key={sel.id} /></div> : null}
    </div>
  );
}

window.Monitoring = Monitoring;

```
