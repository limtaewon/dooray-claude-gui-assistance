# Clauday

두레이(Dooray) × Claude Code 통합 데스크탑 앱. Electron + React + TypeScript.

## 기술 스택

- **런타임**: Electron 33 (Chromium + Node), `electron-vite` 빌드
- **UI**: React 18, React Router 6, TailwindCSS, lucide-react, recharts
- **터미널**: `@xterm/xterm` (renderer) + `node-pty` (main, native)
- **에디터**: `@monaco-editor/react`
- **저장소**: `electron-store` (JSON), `keytar` (OS keychain, native)
- **외부 연동**: 두레이 REST API, 두레이 Socket Mode(WebSocket via `ws`), CalDAV(`tsdav`), Claude Code CLI(spawn)
- **언어**: TypeScript (strict)

## 디렉터리 구조

```
src/
  main/         Electron main process (Node)
    ai/         AIService (Anthropic 호출 라우팅)
    analytics/  로컬 사용량/이벤트 트래킹
    caldav/     CalDAV 클라이언트 + 캘린더 통합 (v1.5)
    claude/    Claude Code 세션·채팅·첨부 서비스
    config/    MCP/Skills 매니저 + ConfigWatcher
    dooray/    DoorayClient, Task/Wiki/Messenger Service
      mention/      @clauday 멘션 처리 파이프라인
      socket-mode/  두레이 봇 WebSocket
    git/       워크트리/브랜치 관리
    holiday/   공휴일 처리
    skills/    스킬 스토어/공유
    terminal/  TerminalManager (node-pty wrapper)
    usage/     Claude Code 사용량 파서
    watcher/   메신저 와처
    index.ts   Electron entry, IPC 핸들러 등록 (≈1500줄)
  preload/     contextBridge IPC API 노출 (index.ts 단일 파일)
  renderer/    React UI
    src/
      App.tsx              View 라우팅(`activeView` state 기반)
      components/          뷰별 컴포넌트 (Dooray/Terminal/Sessions/MCP/Skills/...)
      hooks/               useTheme, useFontSettings, useAIProgress
      design-system.css    공용 디자인 토큰
  shared/      main↔renderer 공용 타입 (`types/`), 위키 저장소 기본값
```

## 경로 별칭 (renderer 전용)

- `@` → `src/renderer/src`
- `@shared` → `src/shared`

main/preload는 별칭 없이 상대 경로(`../shared/...`)를 사용합니다.

## 빌드 & 개발

```bash
npm install          # postinstall: electron-rebuild로 node-pty, keytar 리빌드
npm run dev          # electron-vite dev
npm run build        # 타입 체크 없이 vite 빌드 (tsc 별도 실행 안 함)
npm run dist         # macOS dmg
npm run dist:win     # Windows exe
npm run dist:all     # mac + win
npm run icons        # scripts/generate-icons.mjs
```

빌드 산출물: `out/` (개발용), `release/` (배포 패키지).

## IPC 패턴

- 채널 상수는 `src/shared/types/ipc.ts` 의 `IPC_CHANNELS` 에 모아둠.
- renderer 는 `window.api.<도메인>.<메서드>` 형태로 호출 (preload `contextBridge`).
- 새 IPC 추가 시 ① shared/types에 타입 → ② preload에서 노출 → ③ main/index.ts 에 `ipcMain.handle` 등록.

## 네이티브 모듈

- `node-pty`, `keytar` 는 OS별 prebuild 필요. `package.json` 의 `postinstall` 이 `electron-rebuild -f -w node-pty,keytar` 실행.
- `electron-builder` 의 `asarUnpack` 으로 두 모듈은 asar에서 풀려서 패키징됨.

## 주요 도메인 노트

- **@clauday 봇** (`src/main/dooray/socket-mode/`, `src/main/dooray/mention/`): 두레이 WebSocket 으로 멘션 수신 → `ContextCollector` 로 최근 메시지 수집 → `promptBuilder` 로 프롬프트 합성 → `MentionTerminalSpawner` 가 Claude Code CLI 를 spawn → `HookServer` 의 stop hook으로 응답 수집 → `ClaudayResponder` 가 채팅방에 회신. 채널별 작업 폴더는 `~/Clauday-Workspaces/agent/{channelId}/`.
- **터미널** (`src/main/terminal/TerminalManager.ts`): 로그인 셸로 `node-pty` 스폰. `LANG=ko_KR.UTF-8` 강제, Unicode11 + IME 폭 보정. 세션 이름은 `electron-store` 에 영속화.
- **Claude Code 채팅** (`src/main/claude/`): 세션 메타는 `ClaudeSessionService`, 메시지 스트리밍은 `ClaudeChatService`. `claude -r {sessionId}` 로 resume.
- **MCP / Skills 관리**: 활성/비활성 토글은 실제로 Claude Code 가 보는 설정 파일을 갈라치기 — 비활성 항목은 별도 보관함으로 옮겨서 로드되지 않게 함. 공유는 두레이 위키(`WikiStorageService`)에 컨테이너 페이지 자동 생성.
- **캘린더 (v1.5)**: 두레이 네이티브 API 대신 CalDAV(`tsdav`) 로 전환. `UnifiedCalendarService` 가 원격(CalDAV) + 로컬(`LocalEventStore`) 통합. `CTagPoller` 로 변경 감지.
- **AI 모델 라우팅** (`src/main/ai/AIService.ts`): 기능별 모델 선택. 짧은 요약은 Haiku, 브리핑/위키 분석은 Sonnet, 추천/설계는 Opus.

## ⚠️ AIService.runClaudeStream — Windows / macOS 분기 가이드

`AIService.runClaudeStream` 은 플랫폼별로 **의도적으로 다른 경로** 를 탄다. 한쪽만 보고 양쪽에 동일 변경을 적용하면 다른 쪽이 회귀로 깨진다. 변경 전 반드시 양쪽 영향을 점검하고, 가능하면 회귀 테스트도 양쪽 케이스 모두 작성.

### Mac / Linux 경로 (정상 동작 중)
- `spawn(CLAUDE_CLI, argv, { shell: false })` — 직접 실행
- `windowsVerbatimArguments: false`
- argv 에 `--append-system-prompt <content>` 로 system prompt 그대로 전달. claude 가 시스템 프롬프트 캐싱 적용
- `-p` 의 prompt 본문만 stdin 으로 분리 (argv 길이 한계 회피 — 양쪽 공통 적용)
- 결과: stream-json 정상 수신 → JSON 응답 → BriefingPanel/ReportGenerator 의 구조화 카드 표시

### Windows 경로
- `spawn(CLAUDE_CLI, argv, { shell: true, windowsVerbatimArguments: true })` — `claude.cmd` 가 .cmd 라 shell 경유 필요
- `windowsVerbatimArguments: true` 로 cmd 의 codepage 변환 차단 (한글 mojibake 방지)
- argv 에서 **`--append-system-prompt` 도 제거하고 stdin 으로 합쳐 보낸다** — Mac 과 다른 핵심 분기:
  ```
  [시스템 지시 — 반드시 준수]
  {system prompt}

  ---

  [사용자 요청]
  {user prompt}
  ```
- Why: v1.5.4 진단 데이터에서 system prompt 본문(3000+ chars) 내 공백/개행이 cmd 의 인자 파싱과 충돌해 뒤의 `--output-format stream-json` 옵션이 잘려나가는 케이스 확인 (claude 가 평문으로 응답).
- 트레이드오프: system prompt 가 user prompt 로 흡수되어 claude 의 시스템 프롬프트 캐싱 효과는 못 받음. 하지만 응답 자체는 정상 수신.

### 자주 무너지는 함정
1. **"양쪽 일관성" 의 함정** — "이게 더 깔끔하니까 Mac 도 stdin 으로 통일하자" 같은 생각은 Mac 의 캐싱 이점을 깨뜨림. Windows 와 Mac 은 서로 다른 동기로 다른 경로를 탄다.
2. **테스트 한쪽만** — `process.platform` 분기 코드는 vitest 에서 Mac 으로만 도는 한 Windows 경로가 검증 안 됨. 테스트에 양쪽 케이스를 직접 명시 (`Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })` 등).
3. **shell:true 의존성** — Windows 의 `shell: true` 는 cmd.exe 가 끼는데, 그게 다시 codepage / 명령줄 한계 / argv escape 문제를 만든다. shell 옵션 변경은 영향 광범위 — 그쪽 손대지 말고 대신 stdin 사용량을 늘리는 방향으로.
4. **진단 로그 잊기** — 모든 호출은 `cliLogger` 로 진단 로그 남김. 새 분기 추가 시 platform/argv 가 로그에 자연스럽게 남는지 확인.

### 관련 변경 이력
- v1.5.2: prompt 본문 → stdin (양쪽 공통, 명령줄 8KB 한계 회피)
- v1.5.4: raw stdout fallback (stream-json 못 받아도 본문 살림)
- v1.5.5: Windows 한정 `--append-system-prompt` → stdin combine (이 가이드 작성 계기)

## 색 사용 원칙 (v2.0 확정 · v2.0.4 보강)

> **v2.0.4 에서 더해진 것** (외부 디자인 리뷰 반영):
> 0. **어두운 면끼리는 밝기로 위계를 못 만든다.** `--bg-base` 와 `--bg-surface` 대비는 1.12:1 이 한계다.
>    영역 구분은 `--bg-border`, 부상은 `--elev-2` + `--bg-border-light`, 선택은 `--bg-active` + `.ds-rail`.
>    hover · raised · active 는 **반드시 서로 다른 값**이어야 한다.
> 0b. **조판 하한 11px, 대비 하한 AA(4.5:1) — 두 테마 모두.** `--t-9`/`--t-10` 은 폐기했다.
>    `--text-tertiary` 는 AA 를 넘지만 하한이라 "읽어야 하는 값"에는 쓰지 않는다(구분점·비활성 아이콘 전용).
> 0c. **포커스 링은 불투명 2중 링.** 반투명은 어두운 면 위에서 1.6:1 까지 떨어진다.
>    `outline: none` 으로 포커스를 없애는 예외는 없다.
> 0d. 무채색 크롬 정책은 **라이트에도 똑같이** 적용한다 — 한쪽 테마에만 있으면 정책이 아니라 예외다.
>
> 가드: `contrast.guard.test.ts` · `typeScale.guard.test.ts` · `palette.guard.test.ts` · `cssVarAlpha.guard.test.ts`
> (팔레트 가드는 잔존 213곳을 BASELINE 으로 두고 **증가만** 막는다 — 정리하면 BASELINE 도 함께 낮춘다)


1. **크롬(배경·테두리·일반 텍스트·폼 포커스·탭·아이콘 버튼)은 무채색.** `--bg-*` / `--text-*` 만 쓴다.
   - **회색 면(`--bg-active`)으로 선택을 표현하는 건 좌측 사이드바·탭 같은 내비게이션에 한한다.**
   - 내용 영역의 "고른 값"(글꼴 카드, 크기 프리셋, 옵션 목록)은 **밝기와 테두리로** 드러낸다 —
     선택 = `text-text-primary` + `bg-bg-active` + `border-bg-border-strong`.
     ⚠️ 선택된 항목이 선택 안 된 것보다 **어두우면 비활성으로 읽힌다.** 위계를 뒤집지 말 것.
2. **색은 "정보가 있다"는 신호일 때만.** 카운트 배지, 상태 칩, 링크, 파괴적 동작, 도메인 진입점. 장식으로 쓰지 않는다 — 장식색이 늘면 진짜 신호가 묻힌다.
3. **도메인 식별색은 뷰 안까지 이어진다.** Claude=`brand-claude`(주황), 두레이=`brand-dooray`(파랑), 터미널=`brand-terminal`(초록). 사이드바에서 파란 항목을 눌렀으면 그 뷰의 대표 아이콘도 파랑이다. 단 뷰 안의 **범용 크롬 액션(새로고침·닫기·설정)에는 도메인색을 주지 않는다.**
4. ⚠️ **CSS 변수 색에 `/10` 같은 불투명도 수정자를 절대 붙이지 않는다.** Tailwind 3 은 `var(--x)` 색의 알파를 합성하지 못해 **그 유틸리티 규칙을 통째로 생성하지 않는다** — 조용히 무시되는 정도가 아니라 CSS 에 아예 없다. `bg-x/10` 은 배경이 사라지고, `border border-x/30` 은 브라우저 기본 회색 테두리가 드러나며, hover 변형은 반응 자체가 없다. tint 가 필요하면 미리 정의된 **`-bg`/`-fg` 페어**를 쓴다: `bg-c-blue-bg text-c-blue-fg`, `bg-brand-dooray-bg text-brand-dooray`. `src/renderer/src/hooks/cssVarAlpha.guard.test.ts` 가 이 규칙을 강제한다.
5. **하드코딩 Tailwind 팔레트(`text-red-400`) 금지.** 컴파일은 되지만 테마를 따르지 않는다. 위험/성공/경고는 `c-red-*` / `c-emerald-*` / `c-orange-*`, 두레이 상태는 `--wf-*`, git 은 `--git-*`.
6. **파괴적 동작은 hover 전에 이미 붉어야 한다.** rest 상태부터 `c-red-fg`(= `.ds-btn.danger`). hover 에서야 색이 나타나면 실수 클릭을 막지 못한다.
7. **링크는 `text-link` 하나로 통일.** 외부 이동은 아이콘(`ExternalLink`)과 색을 함께 준다 — 하나만으로는 어포던스가 부족하다.

> 새 컴포넌트를 만들 때 자문: **"이 색이 사라지면 사용자가 잃는 정보가 있는가?"** 없으면 무채색이 정답이다.
>
> `clauday-blue` / `clauday-orange` 는 다크에서 **회색으로 중성화된 크롬 토큰**이다(이름과 달리 파랑·주황이 아니다). 새 코드에서는 쓰지 말고 `bg-*`/`text-*` 또는 `brand-*` 를 쓴다.

## 코드 컨벤션

- TypeScript strict, 타입은 `shared/types/` 에 우선 정의 후 main/renderer 양쪽에서 import.
- React 컴포넌트는 함수형 + hooks. 클래스 컴포넌트는 `ErrorBoundary` 외에는 사용하지 않음.
- 디자인 토큰 / 공용 컴포넌트는 `components/common/ds`. 새 UI는 가급적 디자인 시스템 컴포넌트를 재사용.
- 한글 주석 OK. 사용자 문구는 자연스러운 한국어로.

## 기능 추가 시 필수 작업 (Definition of Done)

새 기능 / 새 모듈을 추가하거나 사용자 가시 동작을 변경할 때 아래 둘은 같은 PR 안에 반드시 포함한다.

1. **테스트 코드 작성**
   - 새 모듈(`src/main/**`, `src/shared/**` 의 유틸/서비스)은 vitest 단위 테스트 동봉. 회귀 방지 목적의 표본 케이스만이라도 1개 이상.
   - 버그 수정은 그 버그를 재현하는 테스트를 먼저 (또는 같이) 추가 — off-by-one, 정규식, 시간대 등 회귀가 자주 나는 영역은 특히 필수.
   - IPC 핸들러처럼 electron 의존이 큰 코드는 핵심 로직만 순수 함수로 분리해서 테스트.
   - 단위 게이트는 70% 라인 커버리지 (`vitest.config.ts` 의 thresholds) — 신규 모듈로 떨어뜨리지 말 것.

2. **온보딩 업데이트** (읽는 매뉴얼은 v2.0 에서 폐기 — 설명은 그 기능이 있는 화면에서 한다)
   - 사용자 가시 기능이면 `src/renderer/src/components/common/onboarding/tours.ts` 의 해당 메뉴 `TOURS` 에 단계를 추가하고, 가리킬 요소에 `data-tour="..."` 를 붙인다.
   - 앵커 이름은 전역에서 유일해야 한다 (`tours.test.ts` 가 중복을 막는다). 앵커를 못 찾으면 그 단계는 화면 가운데 카드로 나온다 — 동작은 하지만 가리키지는 못하므로 되도록 붙인다.
   - 빈 화면 문구(`VIEW_ONBOARDING`)도 새 메뉴면 함께 추가. 단축키/토글/새 패널처럼 발견이 어려운 기능은 반드시 투어에. 내부 구조 변경만은 대상 X.
   - 큰 사이클이 끝나면 `CHANGELOG.md` 에 항목 추가, 사용자에게 보이는 변경은 `README.md` 의 스크린샷/스펙도 점검.

## 릴리즈

태그 푸시(`vX.Y.Z`)가 트리거. `.github/workflows/release.yml` 이 **Windows(exe) + `latest.yml` 만** 빌드해 GitHub Release 에 자동 업로드한다. main 머지만으로는 배포되지 않음.

**macOS dmg 는 CI 가 만들지 않는다 — 릴리즈마다 손으로 올려야 한다.** 태그를 민 뒤 mac 에서 `npm run dist` 를 돌리고 `release/Clauday-<버전>-arm64.dmg` 를 `gh release upload <태그> <파일>` 로 붙인다. 이 단계를 빠뜨리면 mac 사용자는 업데이트 알림을 받고도 받을 파일이 없다 (`pickAssetForPlatform` 이 dmg 를 못 찾음).

같이 생성되는 `latest-mac.yml` 은 올리지 않는다. macOS 는 ad-hoc 서명(`identity: "-"`) 때문에 autoUpdater 를 의도적으로 안 쓰고 Releases API 로 dmg 를 직접 고른다 — 자세한 건 `UpdateService` 클래스 주석.

## 참고 문서

- `README.md` — 사용자용 기능 소개 (스크린샷 포함)
- `CHANGELOG.md` — 버전별 변경 이력
- `handoff/` — 마이그레이션 / 핸드오프 노트
- `docs/readme/` — README 용 그래픽 (실제 화면을 디자인 토큰으로 재조판한 목업)
- `docs/brand/` — 브랜드 마크 SVG 원본. `build/icon.svg` 와 `ClaudayMark.tsx` 가 같은 좌표를 공유한다
