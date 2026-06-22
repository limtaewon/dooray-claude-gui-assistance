# Changelog

## [1.8.0] - Harness Studio 편집(저작) 모드

read-only 분석 도구였던 Harness Studio 에 **편집(저작)** 기능 추가. 편집 모드는 기본 OFF — 켜기 전까지 기존 동작 그대로.

### 신규 기능

- **편집 모드 토글** — 켜면 구조화 필드 폼 + 원본 파일 에디터로 하네스를 수정.
- **구조화 필드 폼** — 에이전트 모델/도구 등 frontmatter 기반 필드를 폼으로 편집(AI 해석값은 원본/AI 편집으로 안내).
- **원본 파일 에디터** — 번들의 `.md`/`.sh` 를 Monaco 에디터로 직접 편집(`.sh` 는 경고 표시).
- **AI 편집** — 자연어 명령(예: "보안 검토자를 opus로") → AI 가 변경안(diff) 제시 → 2단계 승인.
- **Draft → diff → 적용** — 편집은 draft 에 쌓이고, diff 확인 후 **명시적으로 '파일에 적용'**(자동 쓰기 없음). 적용 시 자동 백업.
- **백업/복원** — 적용 전 원본 백업, 백업 목록에서 복원 가능.
- 안전장치 — 번들 폴더 밖 쓰기 차단(경로 게이트·심링크 해소), `.sh` 비실행, 외부 변경 충돌(STALE) 시 적용 거부, 적용 후 자동 재정규화.

## [1.7.0] - Harness Studio (bmad 번들 분석 도구)

에이전트 오케스트레이션 번들(reined-bmad, neon-bmad 등)을 가져와 구조, 체인, 게이트, 산출물을 한눈에 분석하는 시각화 도구. **정적 스캔 + AI 정규화 + 정합점검 + 비교** 기능으로 하네스 품질 보증.

### 신규 기능

- **Import 위저드 (4단계)** — 번들 폴더 지정 → 구조 인식(정적) → AI 정규화(Opus) → 오버레이 반영 후 Harness Studio 열기
- **Flow Canvas 탭** — react-flow 기반 에이전트 그래프. L0~L3 레벨 토글, 노드별 역할 색상(analyst/pm/architect/dev/security 등), 모델 배지(haiku/sonnet/opus), 핸드오프 엣지에 산출물 라벨, 오버레이(비활성/모델 override) 반영, Agent Inspector 패널(역할·도구·위험·AI 설명)
- **Dry-run 탭** — 태스크 설명 입력 → 예상 레벨·에이전트 경로·단계 추정 (Haiku)
- **Skills/Blocks 탭** — 에이전트별 역할 카드·도구 목록
- **Gates 탭** — 게이트 규칙 코드(R5xx/NEON-Gxx)·훅·상태기계 전이
- **Artifacts 탭** — 산출물 트리·persist 구분(git/ignore/dooray)
- **Score 탭** — 6축 레이더 차트(강제력·제어흐름·상태·차단게이트·피드백루프·관측가능성)
- **Doctor 탭** — AI 없는 정적 정합 검사. 체인 미포함·미정의 에이전트·고아 산출물·게이트-페이즈 불일치·unknown 모델·점수 결측 7가지 검사. PASS/WARN/FAIL.
- **Compare 탭** — 캐시된 두 하네스 비교. 에이전트·레벨 체인·게이트·6축 점수 변화량 표시
- **신뢰도 배지 (Provenance)** — 각 필드의 출처(정적/AI/파생/없음) 시각화
- **최근 하네스** — 랜딩 화면에 최근 열어본 번들 목록. 캐시에서 즉시 재오픈
- **HTML 리포트 Export** — 현재 하네스를 독립 HTML 파일로 다운로드 (스타일·차트 자체 포함)
- **AI 설명** — Agent Inspector 에서 "AI 설명 생성" 버튼 클릭 → Sonnet이 해당 에이전트 역할·동작을 자연어로 설명

### 기술 변경

- **사이드바 새 항목** — Workflow 아이콘 "Harness Studio"
- **캐싱 전략** — 번들 해시 기반 캐시, AI 정규화 결과 저장 → 재오픈 시 즉시 표시
- **번들 종류 감지** — bundle / overlay / partial-skill / task 자동 식별 + 수동 교정 버튼

### 문서

- **ClaudeManual** — 'Harness Studio' 섹션 추가. Import 위저드·Flow Canvas·Dry-run·8개 탭·신뢰도 배지·Doctor·Compare·Export 전체 가이드
- **README.md** — 기능 소개에 Harness Studio 추가

### 테스트

- 751 tests pass, typecheck clean.

## [1.6.0] - 사용자 피드백 채널 (두레이 Agent 직접 전달)

Claude Code 사용 중 불편사항, 기능 제안, 개선 아이디어를 **두레이 Agent 채널로 직접 전달**하는 피드백 시스템 도입. 사용자가 앱 내에서 바로 피드백을 작성하면 두레이 웹훅을 통해 Agent 가 실시간으로 수신 → 빠른 대응과 기능 반영.

### 신규 기능
- **피드백 모달** — 카테고리 (버그/기능제안/개선), 제목, 본문 입력. 버그 리포트는 진단 정보 (OS, 앱 버전, Claude CLI 버전, 에러 스택) 자동 포함.
- **단축키** — `Cmd/Ctrl+Shift+B` 로 어디서나 모달 즉시 호출.
- **두레이 연동** — Incoming Webhook 으로 포맷팅된 메시지 전송 (카테고리별 색상: bug=orange, feature=blue, improvement=green).
- **클립보드 fallback** — 웹훅 실패 시 피드백 내용을 자동으로 클립보드에 복사 + 사용자 알림.

### 기술 변경
- **환경변수** — `VITE_FEEDBACK_HOOK_URL` (renderer/main 통일). 미설정 시 graceful degradation (에러 코드 반환).
- **IPC 채널** — `feedback:submit` 추가.
- **역호환** — 기존 `ErrorReportService.submitCommunity()` 는 유지하되 deprecation 경고 추가.

### 문서
- **ClaudeManual** — '피드백 보내기' 섹션 추가 (사용법, 단축키, 처리 흐름).
- **CLAUDE.md** — FeedbackService 분기 가이드 추가.

### 테스트
- `FeedbackService.test.ts` — 성공/HTTP 에러/네트워크 에러/환경변수 미설정/카테고리별 색상 검증.
- 739 tests pass, typecheck clean.

## [1.5.5] - Windows stream-json 정상 수신 — system prompt 도 stdin 합치기

v1.5.4 의 raw stdout fallback 으로 응답은 살렸지만 윈도우 사용자는 여전히 마크다운 평문이 greeting 한 줄로 흘러서 mac 처럼 예쁜 카드(긴급/오늘 집중/AI 추천)가 안 보임. 진단 데이터 추적 결과, `--append-system-prompt` 의 큰 값(3000+ chars)이 argv 로 전달되면서 cmd 의 인자 파싱과 충돌해 뒤의 `--output-format stream-json` 옵션이 잘려나가는 게 본질.

### 버그 수정 — Windows 한정
- **`--append-system-prompt` → stdin combine** — Windows 에서만 system prompt 본문을 argv 에서 빼서 stdin prompt 의 prefix 로 합쳐 보냄. argv 가 짧고 깨끗해져서 cmd 의 잘못된 파싱을 피하고 `--output-format stream-json` 이 제대로 전달됨. 결과: Windows 도 mac 처럼 stream-json 정상 수신 → 구조화된 카드(긴급/오늘 집중/AI 추천) 표시 회복.

### Mac/Linux 동작
- **변경 없음.** 기존 argv 의 `--append-system-prompt` 경로 그대로 (시스템 프롬프트 캐싱 효과 보존). `process.platform === 'win32'` 분기로 격리.

### 문서
- `CLAUDE.md` 에 **AIService.runClaudeStream — Windows/macOS 분기 가이드** 섹션 추가. 양쪽 경로가 의도적으로 다르다는 점, 함정(양쪽 일관성 시도, shell:true 의존성, 테스트 한쪽만 등), 관련 변경 이력 명시. 미래 개선이 한 플랫폼만 보고 다른 쪽을 깨뜨리는 회귀를 막기 위함.

### 테스트
- `Mac/Linux 경로` 케이스 — argv 에 `--append-system-prompt` 가 살아있는지 검증
- `Windows 경로` 케이스 — argv 에서 빠지고 stdin 에 "[시스템 지시]" prefix 가 합쳐졌는지 검증
- 739 tests pass, typecheck clean.

## [1.5.4] - Windows stream-json 미수신 fallback

v1.5.3 의 오류 리포트로 들어온 첫 진단: 윈도우 사용자가 같은 claude CLI 버전임에도 stdout 으로 stream-json 이 아니라 평문 마크다운을 흘리는 케이스 확인. claude 는 응답을 정상 생성했는데 우리 파서가 stream-json 의 `type:"result"` 라인만 기다리다 빈 결과로 처리 → `AI 응답에서 JSON을 찾지 못했습니다` 로 간접 실패. 원인 종류 무관한 방어 패치.

### 버그 수정
- **raw stdout fallback** — `runClaudeStream` 종료 시 `finalResult`/`accumulated` 둘 다 비어있고 raw stdout 에 텍스트가 있으면 그 raw 를 result 로 사용. 정상 stream-json 모드에서는 이 분기 진입 자체가 없으므로 회귀 위험 없음. 200KB 까지 누적.
- **briefing 의 JSON 미발견 → textFallback 일반화** — 기존엔 `allEmpty` 일 때만 raw 텍스트를 greeting 으로 폴백했는데, 데이터가 있는 일반 케이스도 raw 본문을 살려서 보여줌 (구조화된 urgent/focus 카테고리는 못 얻지만 사용자가 본문을 볼 수 있음).

### 진단 강화
- **`claude --version` 자동 기록** — 앱 부팅 시 한 번 캐싱 → 모든 cliLogger 엔트리와 오류 리포트 본문에 자동 포함. 사용자별 버전 차이를 즉시 비교 가능.

## [1.5.3] - 오류 리포트 인프라

v1.5.2 윈도우 핫픽스가 여전히 일부 환경에서 실패하는 보고가 들어와, **비개발자 사용자도 한 번에 제보할 수 있는 인프라** 를 먼저 깔았다. 다음 사이클에 정확한 윈도우 픽스를 박기 위한 진단 데이터 확보 목적.

### 신규 기능
- **🐞 오류 리포트 버튼** — AI 호출(브리핑 / AI 채우기 / 요약 / 보고서 / 추천 / 스킬 생성 등) 실패 시 토스트 또는 에러 화면에 같이 표시. 클릭하면 진단 정보 자동 수집 + 모달에서 편집 가능. 보낼 곳 선택:
  - 🌐 **커뮤니티에 게시** — Clauday 두레이 커뮤니티 채널에 본인 계정으로 글 등록. 같은 문제 다른 사용자도 보고 워크어라운드 공유 가능
  - 📋 **클립보드 복사** — 두레이 메신저에 직접 붙여넣기

### 내부 인프라
- **Claude CLI 진단 로그** — \`<userData>/logs/claude-cli.log\` (JSONL, ring buffer 50건). \`runClaudeStream\` 의 모든 호출이 자동 기록: feature 명, argv 요약(시스템 프롬프트 본문은 길이만), prompt 첫 500자, stdout/stderr 첫 2KB, exit code, duration, 우리쪽 에러 사유. 사용자 제보 시 자동 첨부됨. Windows: \`%APPDATA%\\clauday\\logs\\claude-cli.log\`.
- **ErrorReportService** — main process. 진단 정보 수집(\`collect\`), 두레이 커뮤니티 게시(\`submitCommunity\`), 클립보드 복사(\`copyToClipboard\`) IPC 제공. 두레이 커뮤니티 프로젝트(ID \`4312559241344624232\`) 의 \`tasks.create\` 재사용.
- **ErrorReportProvider** — renderer 글로벌 컨텍스트. \`useErrorReport()\` 훅으로 어디서든 모달 호출 가능.
- **Toast 시스템에 액션 버튼 지원** — \`ToastInput.action: { label, onClick }\` 추가. 액션 버튼이 있는 토스트는 8초 노출(기본 3.6초의 두 배).
- **ErrorView 에 onReport 옵션** — 인라인 에러 화면에서도 리포트 버튼 노출 가능.

### 기록 범위
- 모든 AI 기능 호출이 진단 로그를 남김: \`briefing\`, \`report\`, \`ask\`, \`summarizeTask\`, \`wikiProofread\`, \`wikiImprove\`, \`wikiDraft\`, \`messengerCompose\`, \`filterRule\`, \`generateSkill\`, \`recommend\`
- benign stderr (Warning, OMC 훅 실패 등) 으로 빈 결과 반환된 케이스도 \`errorMessage: 'benign stderr — 빈 결과로 통과'\` 로 명시 기록 → 진단 시 "정상 종료인데 결과 없음" 케이스 식별 가능

## [1.5.2] - 윈도우 AI 호출 핫픽스

윈도우에서 브리핑이 "명령줄이 너무 깁니다" 로 죽고, AI 채우기/요약 등은 "AI 응답에서 JSON을 찾을 수 없습니다" 로 간헐 실패하던 문제를 한 번에 해결.

### 버그 수정
- **윈도우 명령줄 길이 한계 + 한글 prompt 깨짐 동시 해결** — Claude CLI 가 `.cmd` 라 `shell:true` 로 spawn 되면서 내부적으로 cmd.exe 가 끼는데, prompt 본문이 argv 로 전달되면 두 가지 문제가 동시에 발생:
  1. cmd 의 **~8KB 명령줄 한계** 에 걸려 브리핑처럼 태스크 JSON 덤프가 누적되는 호출이 "명령줄이 너무 깁니다" 로 실패
  2. cmd 의 **현재 codepage** 에 따라 한글 argv 가 깨져 claude 가 망가진 prompt 를 받고 JSON 이 아닌 서술형으로 응답 → 호출자가 "JSON 을 찾을 수 없습니다" 로 간접 실패. (AI 채우기 / 요약 / 추천 등 JSON 요구하는 거의 모든 경로)

  `runClaudeStream` 이 `-p <prompt>` 의 prompt 본문을 argv 에서 분리해 자식 프로세스 stdin 으로 raw UTF-8 바이트로 직접 write 하도록 변경. claude CLI 는 `-p` 단독이면 stdin 을 prompt 로 읽으므로 동작은 동일하면서 cmd 의 명령줄 파싱과 codepage 변환을 통째로 우회. 브리핑·AI 채우기·요약·필터 규칙 생성·메신저 작성·위키 교정/개선·스킬 생성 등 모든 AI 호출 경로가 한 번에 잡힘. 플랫폼 무관 일괄 적용 (mac 도 회귀 없이 그대로 동작).

## [1.5.1] - 윈도우 핫픽스

윈도우 사용자가 브리핑/스킬 생성/Claude 채팅/브랜치 작업을 돌릴 때 깨진 문자(◇◇◇) 에러가 뜨거나, 정상 동작인데 OMC 플러그인의 SessionEnd 훅 노이즈 때문에 거짓 실패로 표시되던 문제 핫픽스 + 윈도우 키보드 단축키/복붙 호환.

### 신규 기능
- **할 일 빠른 추가 (전역 단축키)** — 어디서든 **⌘/Ctrl + /** 누르면 오늘 자 종일 로컬 todo 를 한 줄로 등록하는 모달이 뜸. 캘린더 화면 안 가도 됨. CommandPalette(⌘K) 의 "오늘 할 일 빠른 추가" 메뉴로도 동일 호출.
- **⌘E 최근 뷰 포커스 개선** — 터미널/xterm 이 활성화된 상태에서 ⌘E 로 최근 뷰 팔레트를 열면 화살표가 xterm 으로 흘러가 동작 안 하던 문제. 팔레트가 자체적으로 포커스를 잡고 활성 요소를 blur 해 키 이벤트가 곧바로 팔레트로 들어가도록.

### 윈도우 키보드 호환
- **터미널 복붙** — 윈도우에서는 Cmd 가 없어 기존 Mac 단축키가 동작 안 함. **Ctrl+Shift+C** (복사) / **Ctrl+Shift+V** (붙여넣기, 텍스트·이미지 모두) / **Ctrl+Insert** (복사, 레거시) 추가. 기존 Shift+Insert(붙여넣기)도 유지. 일반 Ctrl+C 는 PTY 의 SIGINT 와 충돌하므로 Shift 필수 (윈도우 터미널 표준 패턴).
- **앱 단축키 Cmd → Ctrl 동등 대응** — 기존엔 `e.metaKey` 만 체크해 Mac 전용으로 동작하던 단축키들을 `metaKey || ctrlKey` 로 변경:
  - **Ctrl+T** (새 터미널 탭), **Ctrl+W** (탭 닫기), **Ctrl+1~9** (탭 전환) — `TerminalView`
  - **Ctrl+Enter** (메시지 전송) — `CommunityView`, `AIRecommendView`
  - **Ctrl+K** (커맨드 팔레트), **Ctrl+E** (최근 뷰), **Ctrl+F** (터미널 검색) 등은 이미 양쪽 지원이라 표기/매뉴얼만 통일
- **앱 메뉴 accelerator 명시** — Electron 의 Edit submenu role 만 두면 윈도우에서 단축키가 등록 안 되는 케이스가 있어 `Ctrl+Z/X/C/V/A` 를 명시. `pasteAndMatchStyle` 의 기본 `Ctrl+Shift+V` 는 터미널 paste 와 충돌 방지를 위해 미할당.

### 버그 수정
- **윈도우 한국어 에러 mojibake (전 범위)** — Claude CLI / git 등이 한국 Windows 콘솔에서 cp949(euc-kr) 로 stderr 를 출력하는 경우 utf-8 로만 디코드해 `�������� �ʹ� ��ϴ�` 같이 깨져 보이던 문제. 공용 `decodeProcessText` 헬퍼(`src/main/utils/procText.ts`) 신설 — raw Buffer 누적 후 utf-8 디코드 → U+FFFD 가 검출되면 euc-kr 로 재디코드해 어느 쪽이 덜 깨졌는지로 선택 (Electron full-ICU 번들). 적용 범위:
  - `AIService.runClaude` / `runClaudeStream` — 브리핑, 보고서, AI 채우기, 스킬 생성 등 모든 AI 호출
  - `ClaudeChatService` — 인앱 Claude Code 채팅 세션
  - `GitService` — 브랜치/워크트리 작업
  - `ipcMain.handle('claude-cli:info')` — Claude CLI 도움말 한국어 번역
- **벤긴(benign) stderr 노이즈를 fatal 로 오인하던 문제** — 기존엔 `^warning:` 만 비치명으로 인식했는데, OMC 류 플러그인이 출력하는 `SessionEnd hook [...] failed: Hook cancelled` 등은 매칭이 안 돼 실제 응답이 정상이어도 사용자에게 에러로 노출. 공용 `isBenignStderr` 헬퍼 신설 — `Warning/SessionEnd hook/SessionStart hook/PreToolUse hook/PostToolUse hook/Stop hook ... failed` 패턴과 `If piping from...` 같은 멀티라인 경고 뒷부분 매칭. exit code 비-0 인 경우에도 stderr 가 전부 비치명이면 작업 흐름 끊지 않고 빈 결과로 통과. AIService + ClaudeChatService 양쪽 적용.

## [1.5.0] - CalDAV 자체 캘린더 + 에이전틱 브리핑/보고서

v1.5는 두 가지 큰 축이 있습니다. 첫째, 두레이 캘린더를 CalDAV 로 자체 수집해 구글 캘린더 스타일 월간 뷰까지 연결한 캘린더 도메인 자립. 둘째, AI 브리핑과 보고서가 두레이 데이터만 정리하던 단계를 넘어 사용자 셸 명령(gh, git, npm 등) · 웹 검색 · MCP 도구를 직접 호출해 외부 시스템 상태(PR, CI, 배포, 이슈)를 fetch 한 뒤 결과 URL 까지 브리핑 본문에 인용하는 에이전틱 모드. 부차적으로 디자인 시스템 v2 시맨틱 토큰, 라이트 모드 가독성 패치, 광범위한 단위/통합 테스트(700+) 와 CI 게이트(typecheck, coverage 70%) 정착 등 안정화 기반이 정비됐습니다.

### 신규 기능 — 캘린더 자립
- **CalDAV 자체 통합** — 두레이 캘린더 토큰만으로 회사 캘린더를 직접 동기화. CTag polling 3분 주기 + 429 backoff 5 tick, 80ms emitUpdate debounce, fullSync 진행 중 빈 결과 시 캐시 보류로 두레이 quota 보호
- **구글 캘린더 스타일 월간 뷰** — 드래그로 일정 이동/리사이즈, dot/bar 시각화, 종일/타임드 일정 분리, 멀티데이 멀티위크 segment 분할
- **빠른 할 일 입력** — 헤더 인라인 입력 → 종일 로컬 일정 즉시 생성. 캘린더 list 즉시 반영
- **표시할 캘린더 선택 + 사용자 지정 색** — ⚙ 아이콘 dropdown, 활성 개수 badge. 캘린더별 색상 override + reset
- **공휴일 가상 캘린더** (한국) — `dooray-claude-holidays-ko` 디스크 캐시, 보라 톤 고정
- **CalDAV displayName 강건화** — 두레이가 displayName 을 동일 문자열("두레이") 로 주거나 객체(`{_text}`) 로 주는 케이스 대응 + URL segment 폴백으로 항상 구분 가능한 라벨

### 신규 기능 — 에이전틱 AI (브리핑/보고서)
- **에이전틱 brief/report** — Claude CLI 호출 시 `Bash` + `WebSearch` + `WebFetch` + 사용자가 선택한 MCP 광범위 허용. effort `high`, budget 2.5~3.0 USD. Edit/Write/TodoWrite/Task 는 명시적 차단 (read-only)
- **사용자 스킬 기반 grounding** — 캘린더 일정·todo 키워드를 사용자 스킬(`task`/`briefing`/`report` 타겟) 의 트리거에 매칭, 스킬이 지시한 셸 명령(예: `gh pr list`)/MCP 호출/웹 fetch 를 LLM 이 직접 실행한 뒤 그 결과를 본문에 인용
- **확인한 출처(probes) 노출** — 헤더 메타 아래 `🔎 AI 가 확인한 외부 출처 N개` 디테일. 호출된 도구 이름과 인자 요약을 모노스페이스로 펼쳐 보기
- **URL 자동 링크화** — `linkifyText` 헬퍼가 본문의 http(s) URL 을 호스트별 라벨링된 칩으로 자동 변환 (예: `nhnent #1234`, `github org/repo`). recommendations 와 TaskItem detail 양쪽 적용
- **빠른 태스크 AI 채우기 (MCP 허용)** — DashboardView 의 AI 자동작성 카드에 `AIToolsPopover` 추가. 사용자가 dooray-mcp 등을 토글하면 스킬의 `mcp__dooray-mcp__get_task_list_with_param` 같은 호출이 실제로 동작
- **템플릿 ID 전달** — 빠른 태스크에서 두레이 템플릿을 선택하면 templateId 까지 함께 POST 해서 두레이가 템플릿 lineage 로 기록

### 신규 기능 — 메뉴/탐색
- **Shift × 2 단축키** — 400ms 이내 Shift 두 번 → ⌘K 와 동일한 CommandPalette (IntelliJ "Search Everywhere" 패턴). Shift+다른 키 조합은 자동 무효화
- **두레이 sub-tab 직접 점프** — CommandPalette 에 `두레이 — 대시보드 / 태스크 / 위키 / 캘린더 / 메신저 / AI 브리핑 / AI 보고서` 7개 직행 항목
- **사이드바 항목 순서/노출 커스텀** — 설정 > 외관 & 동작 > 사이드바 항목 섹션. 위/아래 화살표 + 노출 체크박스 + 기본값 초기화. 신규 view 추가 시 자동 append (forward-compat)
- **두레이 토큰 설정 페이지 URL 정정** — `/setting/api/token` 으로 통일

### 신규 기능 — 브리핑 UX
- **섹션 색상/순서 재조정** — 긴급(red) → 오늘 집중(blue 강화) → AI 제안(violet) → 착수 필요(amber, focus 와 명확 구분) → 오늘 일정(emerald) → 참고사항(slate)
- **멘션/답장 → 참고사항** rename. 화면 최하단으로 이동
- **시간 anchor chip + emoji prefix + 18자리 taskId mini-chip** — AI 제안 한 줄을 시각적으로 분해해 6개가 뭉뚱그려 안 읽히는 문제 해결

### 신규 기능 — 와처(Monitoring)
- **AI 생성 필터 칩 직접 편집** — 각 칩 hover 시 × 삭제, 카테고리별 입력란 + Enter/+ 로 직접 추가, "규칙 비우기" 한 번에 초기화
- **AI 없이 시작** — 빈 규칙으로 들어가서 처음부터 직접 작성 가능
- **Socket Mode 설정을 Settings 에 미러링** — 사이드바 팝업은 유지하면서 설정 > 두레이 연결 탭 하단에도 같은 UI

### 신규 기능 — Hard-delete 정책
- **모든 delete 는 hard delete** — 위키 페이지/공유 스킬에서 두레이 405 미지원 시 `[DELETED] 원래제목` 으로 rename 하던 soft-delete 폴백 제거. DELETE 실패하면 "두레이에서 직접 삭제" 안내 에러를 사용자에게 노출
- 기존 `[DELETED]` 접두사 페이지는 list 필터로 계속 가려져 backward-compat

### 디자인 시스템 / 가독성
- **v2 시맨틱 토큰 superset** — `elev/ring/wf/chart/avatar` 추가. 기존 토큰은 alias 로 유지
- **라이트 모드 P0 가독성 패치** — text-primary/secondary/tertiary 대비 강화, 호버/포커스 톤 일관성
- **다크 warmer 톤** — 차가운 push 를 줄이고 두레이 색과 자연스럽게 섞이도록
- **두레이 태그·캘린더 color-mix tint** — 외부 색 신뢰 안티패턴 제거. 사용자가 정한 색을 brand 톤으로 mix 해 dark/light 양쪽에서 합리적
- **캘린더 이벤트 폰트** — 10px → 11px, 슬롯 높이 18 → 20px

### 문서 / 기반
- **디자인 시스템 문서 패키지** — `docs/design-system/` (color-policy, theming, tokens, components/*)
- **개발자 온보딩 문서** — `docs/dev/` (architecture, conventions, domains/{ai-routing, caldav, claude-chat, dooray-bot, mcp-skills, terminal})
- **CI 게이트** — typecheck (`tsconfig.node.json` + `tsconfig.web.json`) + 커버리지 라인/스테이트먼트 70% / 함수 80% 강제
- **CI Windows runner 추가** — Issue #11 windows claude spawn(`shell:true`) 검증 포함
- **테스트 인프라** — Vitest + RTL 셋업. main 서비스(WatcherService/AIService/SocketModeClient/TerminalManager/GitService/Analytics/ClaudeChat/ConfigWatcher/DoorayClient/TaskService/SharedSkillsService/CTagPoller/AttachmentService/usage 파서/CalDAV 저장소/holidays/claude 세션), 디자인 시스템 컴포넌트, 렌더러 훅, view-level 통합, IPC 라우터 채널 정합, 멘션 파이프라인까지 700+ 테스트

### 호환성 / 버그 수정
- Issue #11 Windows claude spawn — `shell:true` 옵션
- Issue #8 worktree 외부 삭제 방어 — auto prune, removeWorktree fallback
- **typecheck 30건** 선재 오류 정리 (briefing 분류 누수 정정 type 좁히기, `'done'` deadcode 제거)
- **CTagPoller 테스트 인터벌 동기화** — 3분으로 변경된 polling 주기에 맞춰 advanceTimersByTimeAsync 도 180s 로
- **jsdom localStorage 폴리필** — Node 26 의 실험적 localStorage 가 플래그 없이 비활성이라 jsdom 25 가 빈 채로 두는 문제. `test/setup.ts` 에서 메모리 폴리필 주입해 useFontSettings/useTheme 류 23개 테스트 복구
- **AISourceMeta.probes** — AI 가 호출한 도구를 type-safe 하게 노출
- 브리핑 cross-category dedup + subject 원본 강제 + CC↔담당 누수 정정 (e80dc64)

## [1.4.1] - 안정화 + UX 개선

### 버그 수정
- **터미널 stream 자동 스크롤** — 사용자가 위로 스크롤하면 follow 일시 중단, 바닥 근처에 있을 때만 자동 follow (`ClaudeChatPane`/`AIProgressIndicator`)
- **빠른 두레이 태스크 생성** — 일부 프로젝트에서 태그 필수라 생성 실패하던 문제. `tagIdList` payload 지원 + 폼에 그룹별 태그 chip + AI 추천 추가. IPC 에러 메시지 래핑(`Error invoking remote method ...`) 제거하고 실제 메시지만 노출
- **스킬 추가 후 즉시 동기화** — 수동 작성 모드에서 `skills.save()` IPC 호출 누락. ConfigWatcher 가 `~/.claude/skills/` 도 감시. 추가 후 optimistic add 로 fs flush 지연 보정
- **다크모드 텍스트 안 보임** — `tailwind.config.js` 의 `bg.subtle` 매핑 누락. `subtle: 'var(--bg-subtle)'` 추가
- **앱 재시작 후 터미널 깨짐** — alt-screen TUI 잔재 + 미완성 ANSI 시퀀스 트림(`sanitizeForRestore`) + 복원 시 `terminal.reset()` 선행 + `fit()` 와 동일 rAF 안에서 write 실행해 80×24 기본 grid 충돌 방지
- **터미널 한글 IME 셀 폭 어긋남** — `@xterm/addon-unicode11` + `terminal.unicode.activeVersion = '11'` + 한글 폰트 fallback (Apple SD Gothic Neo / Malgun Gothic / Noto Sans Mono CJK KR)
- **IME 합성 중 Shift+Enter desync** — `e.isComposing`/keyCode 229 가드 추가 (palette 화살표·Esc 는 가드 없이 동작)
- **MCP 활성/비활성 토글이 cosmetic 이었던 문제** — Claude Code 가 `disabled` 필드를 무시했음. 비활성 시 `~/.claude.json` 의 `mcpServers` 에서 빼서 별도 키 `_claudayDisabledMcp` 로 이동
- **위키 root 페이지 자동 탐색 실패** — `/wiki/v1/wikis/{wikiId}/pages` 를 query param 일절 없이 호출해야 top-level 페이지가 반환됨 (`size=100&page=0` 만 붙이면 400). `WikiService.getTopLevelPages()` 신설
- **claude 바이너리 PATH 충돌 (배포 위험)** — 사용자 머신에 claude 가 여러 경로에 깔려있을 때 우리 PATH prepend 가 구버전을 잡아 `--include-hook-events` 미지원 에러 발생. `resolveClaudePath()` 가 `which/where` 로 항상 절대경로 반환, `enrichedClaudeEnv()` 의 PATH 순서를 prepend → append 로 변경 (사용자 PATH 우선)

### 신규 기능
- **빠른 두레이 태스크 — AI 태그 추천** — 제목·본문·AI 지시 + 가용 태그를 LLM 에 전달, 그룹별 1개 룰로 자동 선택
- **자동 동기화 (대시보드)** — 1/5/15/30분 주기 선택 가능, 설정 영속화
- **대시보드 반응형** — `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` + 헤더 wrap. `max-w-6xl` 제거
- **캘린더 AI 일정분석 sticky 헤더** 제거
- **스킬 마크다운 뷰어** — SkillEditor 에 편집/미리보기 토글
- **스킬 + MCP 다중 선택** — 선택 모드 시 카드 클릭으로 toggle, 주황 ring 강조. 일괄 삭제 / 내보내기 / 공유 / (공유 탭) 내려받기. 다중 import 도 동시 지원
- **세션 탐색기 슬래시 커맨드 팔레트** — `/` 입력 시 보유 스킬 목록, ↑↓ 탐색, Enter 로 `/{skillName}` 텍스트 삽입 (Claude Code 가 슬래시 커맨드로 인지)
- **터미널 검색** (<kbd>Cmd</kbd>+<kbd>F</kbd>) — `@xterm/addon-search` 도입. 우상단 검색바 (Enter 다음, Shift+Enter 이전, Esc 닫기)
- **터미널 세션 이름 영속화 보강** — restoreSaved 후 main 측 meta.name 에 즉시 push 해서 다음 종료에도 유지

### 위키 저장소 (스킬 / MCP 공유) — 신규
- 두레이 위키 URL을 등록하면 그 위키 root 하위(level 2) 에 `Clauday Skills` / `Clauday MCPs` 컨테이너 페이지가 자동 생성되고, 스킬·MCP 정의가 컨테이너 자식으로 저장됨
- **여러 위키 등록 + 활성 전환** — 헤더의 picker 트리거 클릭 → 등록된 위키 목록 + `+` 로 추가/관리
- **다중 선택 시 위키 타겟 선택 모달** — 등록된 위키가 2개 이상일 때 어디 올릴지 선택
- **본인 작성 페이지만 hard delete** — 두레이 API 가 서버 사이드에서 강제. 권한 없는 페이지는 명확한 에러 ("본인이 작성한 페이지만 삭제할 수 있습니다")
- **기본값으로 Clauday 위키** 자동 등록 (잠금 — 제거 불가)
- 업로드 진행률 banner — `{wikiName} 에 업로드 중 (3/5)` + 현재 항목 이름

### 기타
- 스킬 페이지 3탭(내 스킬/공유/내 저장소) → 2탭(내 스킬/공유) 으로 정리. MCP 도 동일 구조 (`로컬 / 공유`)
- 다중 선택 카드 강조: 체크박스 → 주황 outline (box-shadow ring) 으로 변경
- ESC 로 picker / shareTarget 모달 닫기
- 버튼 색상 다양화: 새로고침 secondary, 선택 활성 시 orange, 위키 추가 secondary, 공유에 올리기 primary 등 (`ai` 변형은 실제 AI 호출에만 한정)

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
