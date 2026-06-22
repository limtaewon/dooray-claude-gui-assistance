# Clauday

> **두레이 × Claude Code, 한 창에서 끝내는 사내 AI 업무 비서**
>
> 아침 브리핑부터 채팅방 `@clauday` 멘션 응답까지 — 매일 두레이를 들락날락하던 시간을 한 화면에 모았습니다.

![Clauday AI 브리핑](docs/screenshots/v155-hero-briefing.png)

<p>
  <a href="https://github.com/limtaewon/dooray-claude-gui-assistance/releases/latest">
    <img alt="macOS / Windows 다운로드" src="https://img.shields.io/badge/download-macOS%20%2F%20Windows-orange?style=for-the-badge">
  </a>
  &nbsp;
  <a href="#1분-안에-감-잡기">1분 데모 보기</a> ·
  <a href="#설치--다운로드">설치 가이드</a> ·
  <a href="#기여하기">기여하기</a>
</p>

> 사내 오픈소스입니다. 안 써본 사람도 와서 깔아보고, 별로면 끄세요. 좋으면 같이 디벨롭해요. 🙂

---

## 이런 분에게 잘 맞아요

| | 페인 포인트 | Clauday 가 해주는 것 |
|---|---|---|
| 🔔 **알림 자주 놓치는 사람** | "코드리뷰 좀 봐주세요" 가 채팅 흐름에 묻혀서 사라짐 | 채팅방 와처가 자연어 룰로 잡아내고, `@clauday` 멘션은 봇이 바로 응답까지 |
| 🐣 **Claude Code 입문자** | CLI 부담스럽고 MCP/스킬 설정이 JSON 지옥 | 채팅 UI, 토글 한 번으로 MCP/스킬 ON/OFF, 이전 세션 클릭으로 resume |
| ☕ **아침마다 두레이 정리하는 사람** | 태스크·캘린더·멘션·PR 상태를 매번 일일이 확인 | AI 브리핑 한 번이면 한 화면. 외부 시스템(PR/CI)까지 직접 조회해서 본문에 인용 |
| 🤝 **팀에서 AI 설정 공유하는 사람** | 좋은 스킬/MCP 를 두레이에 글로 올려도 동료가 받아 쓰기 번거로움 | 팀 위키 한 곳이 우리 팀 AI 라이브러리. 클릭으로 올리고 클릭으로 내려받기 |

---

## 1분 안에 감 잡기

| 두레이 채팅방에서 `@clauday` | AI 브리핑 — 외부 시스템까지 조회 |
|---|---|
| ![@clauday 데모](docs/screenshots/v155-demo-clauday.png) | ![브리핑 데모](docs/screenshots/v155-demo-briefing-probes.png) |

> 두레이 채팅방에 `@clauday PR 리뷰 봐줘` 한 줄 → 봇이 PR diff 읽고 같은 채팅방에 리뷰 답글.
> AI 브리핑은 `gh pr list` 같은 셸 명령까지 직접 돌려서 진짜 PR 상태를 본문에 박아줍니다.

---

## 핵심 기능 5가지

### 1. 두레이 채팅방에서 `@clauday` 한 번이면

> **앱 안 띄운 동료도 채팅방에서 멘션 한 줄로 AI를 부릅니다.**

![@clauday 멘션 응답](docs/screenshots/v155-clauday-mention.png)

- 채팅방에서 `@clauday {지시}` → 봇이 같은 방에 답글로 응답
- **본인 토큰 멘션만 처리** — 다른 사람이 내 봇을 트리거 못 걸어요
- 멘션 직전 최대 50개 메시지 자동 수집해서 컨텍스트로 주입
- 위키 / 태스크 / PR 첨부 링크도 본문 파싱 후 같이 인입
- 채널별 작업 폴더 자동 분리 (`~/Clauday-Workspaces/agent/{channelId}/`)
- 팀에 Clauday 사용자 한 명만 있으면 채팅방 전체가 혜택을 받음

**언제 좋냐면**
- 채팅 흐름 끊고 다른 도구 꺼낼 필요 없을 때
- "이 PR 한 번만 봐줘" 같은 단발성 요청을 그 자리에서 처리

---

### 2. 아침 한 잔 마시는 동안 오늘 할 일이 정리됩니다

> **두레이 + 외부 시스템(PR/CI/배포)까지 한 번에 fetch 해서 브리핑.**

![AI 브리핑 본문 + probes](docs/screenshots/v155-briefing-detail.png)

- **6가지 자동 분류** — 긴급 / 오늘 집중 / AI 제안 / 착수 필요 / 오늘 일정 / 참고사항
- **에이전틱 grounding** — 캘린더 일정과 todo 키워드를 보고 사용자 스킬을 따라
  - `gh pr list` 같은 셸 명령
  - `mcp__dooray-mcp__*` 같은 MCP 도구
  - `WebSearch` / `WebFetch`
  까지 LLM 이 직접 호출해 결과 URL 을 본문에 인용
- 본문 URL 은 호스트별 칩으로 자동 링크화 (`nhnent #1234`, `github org/repo`)
- 확인한 외부 출처는 `🔎 AI 가 확인한 외부 출처 N개` 디테일로 펼쳐 보기
- 일일 / 주간 보고서도 같은 에이전틱 파이프라인

**언제 좋냐면**
- 아침에 두레이 5개 탭 돌면서 컨텍스트 다시 끌어올리는 시간을 줄이고 싶을 때
- 회의 들어가기 전 "지난주 우리 팀 PR 상태 어땠지" 정리가 필요할 때

---

### 3. Claude Code 가 채팅처럼 깔끔해집니다

> **이전 세션 클릭 → 그대로 이어서 대화. TUI 안 봐도 스킬·MCP 다 됩니다.**

| 세션 사이드바 + 채팅창 | `/` 입력 → 슬래시 커맨드 팔레트 |
|---|---|
| ![Claude Code 채팅](docs/screenshots/v155-claude-chat.png) | ![슬래시 팔레트](docs/screenshots/v155-claude-chat-slash.png) |

- **이전 세션 그대로 이어서** — `claude -r` 외울 필요 없이 좌측 사이드바에서 클릭
- **AI 요약** — 세션 처음 10개 메시지 자동 요약 (Haiku). 어떤 세션인지 한눈에
- **`/` 입력하면 스킬 자동완성 팔레트** — 가진 스킬 골라서 슬래시 커맨드로 삽입
- **권한 다이얼로그 자동 통과** — MCP·스킬 호출이 중간에 멈추지 않음
- **MCP / 스킬을 GUI로 토글** — JSON 직접 만질 필요 없음. 비활성은 별도 보관함으로 격리되어 Claude Code 가 안 띄움
- 캐시 토큰 별도 표시 — 다음 turn 비용 미리 보기

**언제 좋냐면**
- CLI 의 `/resume` 으로 세션 찾기 어려울 때
- MCP 켰다 껐다 자주 하는데 매번 설정 파일 만지기 싫을 때
- 채팅 UI 가 익숙한 입문자

---

### 4. 두레이 캘린더가 진짜 캘린더처럼

> **CalDAV 자체 동기화 + 구글 캘린더 스타일 월간 뷰.**

![캘린더 월간 뷰](docs/screenshots/v155-calendar-month.png)

- 두레이 캘린더 토큰 하나로 CalDAV 직결 — 두레이 API 가 안 주는 영역까지 동기화
- **드래그로 일정 이동/리사이즈** + dot/bar 시각화 + 멀티데이 segment 분할
- **빠른 할 일 한 줄 입력** — 어디서든 <kbd>⌘/Ctrl</kbd>+<kbd>/</kbd> → 오늘 자 종일 todo 즉시 생성

  ![빠른 할 일 추가](docs/screenshots/v155-quick-todo.png)

- **표시할 캘린더 토글 + 사용자 지정 색**
- **한국 공휴일 가상 캘린더** 자동 표시
- CTag polling 3분 주기 + 429 backoff — 두레이 quota 보호

**언제 좋냐면**
- 두레이 기본 캘린더 UI 가 답답할 때
- 빨리 메모성 todo 만 던져두고 싶을 때 (앱 어디 있든 단축키 한 번)

---

### 5. 팀 위키 하나가 우리 팀 AI 라이브러리가 됩니다

> **두레이 위키 URL 등록만 하면 그 위키 안에 자동으로 스킬/MCP 컨테이너 생성.**

| 위키 저장소 드롭다운 | 위키 추가 / 검색 |
|---|---|
| ![위키 저장소](docs/screenshots/v155-wiki-storage.png) | ![위키 추가](docs/screenshots/v155-wiki-add.png) |

- 위키 URL 등록 → 그 위키 하위에 **`Clauday Skills` / `Clauday MCPs` 컨테이너 자동 생성**
- 여러 위키 등록 가능 — 팀 위키 / 개인 위키 / 사내 공통 위키 분리해서 운영
- **다중 선택해서 한 번에 올리기 / 내려받기 / 삭제**
- 동명 항목 충돌 시 덮어쓰기 / 이름 변경 / skip 선택
- Clauday 사용자 전체 공유 풀(`공유 탭`) 과는 별도 — 팀 내부용 라이브러리

**언제 좋냐면**
- 팀 표준 스킬셋(예: 사내 코드 스타일 가이드 스킬)을 동료에게 전파하고 싶을 때
- 본인이 쓰는 MCP 묶음을 새 팀원에게 한 번에 넘기고 싶을 때

---

## 그 외에도 — 펼쳐보기

<details>
<summary><b>Harness Studio</b> — bmad 번들 시각화 & 분석</summary>

![Harness Studio](docs/screenshots/harness-studio.png)

- 에이전트 오케스트레이션 번들(reined-bmad, neon-bmad 등) import → 정적 구조 + AI 정규화
- **Flow Canvas** — react-flow 에이전트 그래프. L0~L3 레벨 토글, 역할별 노드 색상(분석가/PM/아키텍트/개발자/보안), 핸드오프 엣지
- **Dry-run** — 태스크 설명 입력하면 예상 경로·단계 추정
- **Doctor** — AI 없는 정적 정합 검사 (체인 누락, 미정의 에이전트, 고아 산출물, 게이트 불일치, 점수 결측)
- **Compare** — 두 번들 비교 (에이전트, 레벨, 게이트, 점수 diff)
- **Export** — HTML 리포트로 다운로드
- 8개 탭: Flow Canvas · Dry-run · Skills/Blocks · Gates · Artifacts · Score · Doctor · Compare
- 각 필드의 신뢰도 배지 (정적/AI/파생/없음)

**언제 좋냐면**
- 에이전트 체인 구조가 제대로 연결됐는지 시각적으로 검증하고 싶을 때
- 번들 품질(결측·불일치)을 자동으로 점검하고 리포트로 공유하고 싶을 때
- 다른 팀의 하네스와 구조를 비교해 개선 아이디어를 얻고 싶을 때

</details>

<details>
<summary><b>메신저 와처</b> — 자연어 룰로 채팅방에서 키워드 추출</summary>

![와처](docs/screenshots/v155-watcher.png)

- `@재무` 같은 비공식 호칭, 코드리뷰 요청, 멘션 추출
- 필터 룰 — allOf / anyOf / 정규식 / 제외 조합
- **실시간 모드** — 두레이 도메인만 입력하면 push 수신, 폴링 누락 0
- 폴링과 자동 병행, 메시지 해시 기반 중복 제거
- 3일 보관 후 자동 정리, CSV 내보내기

</details>

<details>
<summary><b>대시보드 + 빠른 태스크 생성</b></summary>

![대시보드](docs/screenshots/v155-dashboard.png)

- 전체 / 진행 / 등록 / 오늘 마감 / 완료 카운트
- 자연어 한 줄로 빠른 태스크 생성 — 제목 / 본문 / 태그 자동 채움
- AI 지시문 입력란 — "나는 이런 식으로 태스크를 쓴다" 규칙 고정
- 자동 동기화 1/5/15/30분 주기

</details>

<details>
<summary><b>Claude Code 터미널</b> — 한글 안 깨지고, 재시작해도 깨끗</summary>

![터미널](docs/screenshots/v155-terminal.png)

- 폴더 선택 / 다중 탭 (<kbd>⌘/Ctrl</kbd>+<kbd>T</kbd>, <kbd>⌘/Ctrl</kbd>+<kbd>W</kbd>)
- 일반 쉘로도 사용 가능 — Claude Code 전용 아님
- 내장 검색 (<kbd>⌘/Ctrl</kbd>+<kbd>F</kbd>)
- 로그인 셸로 실행 — `.zprofile` / `.bash_profile` 자동 로드
- 한글 IME 셀 폭 정확히 계산 (Unicode 11)
- 세션 이름 영속화 + 재시작 시 alt-screen 잔재 자동 정리

</details>

<details>
<summary><b>MCP 서버 GUI 관리</b> — JSON 직접 만질 일 없음</summary>

![MCP 로컬](docs/screenshots/v155-mcp-local.png)

- 서버 추가 / 토글 / 편집 GUI — 경로·env·인자 입력 폼
- 활성/비활성 토글이 실제 동작 — 비활성은 별도 보관함으로 격리, Claude Code 가 안 띄움
- 다중 선택 + 일괄 삭제 / 내보내기 / 공유
- JSON 다중 import — `mcpServers` 형식 또는 단순 객체 둘 다 허용

</details>

<details>
<summary><b>기능별 AI 도구 선택</b> — 브리핑/보고서가 어떤 MCP·스킬을 쓸지 결정</summary>

![AI 설정](docs/screenshots/v155-ai-settings.png)

- 기능마다 사용할 MCP 서버 토글 + 사용자 스킬 ON/OFF
- 스킬은 미리보기 / 내보내기 / 가져오기 가능
- 브리핑·보고서 · 메신저 작성·요약 등 각각 별도로 구성

</details>

<details>
<summary><b>브랜치 병렬 작업</b> — 워크트리로 여러 브랜치 동시에</summary>

![워크트리](docs/screenshots/v155-worktree.png)

- 브랜치당 워크트리 자동 분리
- 동시 세션 + 진행 상태 모니터링
- 좌측 워크트리 리스트, 상단 탭으로 세션 전환

</details>

<details>
<summary><b>사용량 대시보드</b> — 이번 달 얼마 썼지</summary>

![사용량](docs/screenshots/v155-usage.png)

- 총 비용 / 일 평균 / 총 토큰 / API 호출 / 캐시 히트율 / 활성 일수
- 일별 토큰 / 비용 추이, 모델별 비율
- 시간별 사용 패턴 — 피크 시간대 자동 식별
- 24h / 7d / 30d 토글
- 기능별 호출 횟수·응답 시간·👍/👎 피드백 집계

</details>

<details>
<summary><b>AI 추천</b> — 사내 AI 공유글 중 지금 내가 쓰면 좋은 것</summary>

| 추천 목록 | AI 분석 결과 |
|---|---|
| ![추천 목록](docs/screenshots/v155-recommend-list.png) | ![분석 결과](docs/screenshots/v155-recommend-detail.png) |

- 사내 AI 공유 프로젝트 게시글 흡수
- 내 환경(스킬·MCP·기술 스택) 과 비교 후 분류
  - **즉시 도입 가치 있음**
  - **참고할만한 사례**
  - **이미 보유**

</details>

<details>
<summary><b>커뮤니티</b> — Clauday 사용자 모임</summary>

![커뮤니티](docs/screenshots/v155-community.png)

- 글 / 댓글 / 제목 검색
- 개선 문의, 버전 업데이트 공지, 자유 글

</details>

<details>
<summary><b>오류 리포트</b> — 한 번에 제보</summary>

AI 호출 실패 시 토스트에 🐞 버튼. 클릭하면 진단 정보(Claude CLI 버전, 호출 인자, stdout/stderr 첫 부분) 자동 수집 →
- 🌐 **커뮤니티 채널 게시** — 같은 문제 다른 사용자도 보고 워크어라운드 공유
- 📋 **클립보드 복사** — 두레이 메신저에 직접 붙여넣기

</details>

<details>
<summary><b>탐색 / 단축키</b></summary>

![커맨드 팔레트](docs/screenshots/v155-command-palette.png)

- <kbd>⌘K</kbd> 또는 <kbd>Shift</kbd>×2 — 커맨드 팔레트 (IntelliJ Search Everywhere 패턴)
- 두레이 sub-tab 직행 — 팔레트에서 `두레이 — 대시보드 / 태스크 / 위키 / 캘린더 / 메신저 / AI 브리핑 / AI 보고서` 바로 점프
- 사이드바 항목 순서/노출 커스텀 (설정 → 외관 & 동작)
- <kbd>⌘E</kbd> 최근 뷰 / <kbd>⌘F</kbd> 터미널 검색

</details>

---

## 기능별 AI 모델 라우팅

| 기능 | 용도 | 모델 |
|---|---|---|
| 메신저 요약 · 빠른 태스크 생성 · 세션 요약 | 짧은 문장, 자동 채우기 | **Haiku** |
| AI 브리핑 · 위키 분석 · 메신저 작성 | 여러 소스 통합, 구조화 | **Sonnet** |
| AI 추천 · Claude Code 설계 / 리팩터링 | 복잡한 설계·추론 | **Opus** |

설정에서 기능별로 바꿀 수 있습니다.

---

## 설치 / 다운로드

### 다운로드

[GitHub Releases](https://github.com/limtaewon/dooray-claude-gui-assistance/releases/latest) 에서 OS에 맞는 파일을 받으세요.

| OS | 파일 |
|---|---|
| macOS (Apple Silicon / Intel) | `Clauday-{버전}.dmg` |
| Windows | `Clauday Setup {버전}.exe` |

### 처음 켤 때 — 두 가지만 준비

1. **Claude Code CLI 로그인 상태** — 터미널에서 `claude` 한 번 실행해서 로그인 완료된 상태
2. **두레이 API 토큰** — 두레이 → [개인 설정 → API 토큰](https://nhnent.dooray.com/setting/api/token) → 발급
   - 캘린더까지 쓰려면 **CalDAV 토큰** 도 같이 발급

앱 첫 실행 시 토큰 입력 화면에서 한 번 넣으면 끝 (OS 키체인 보관).

### macOS 실행 차단 해제

서명 미적용 빌드인 경우:

1. Clauday 실행 → 차단 대화상자 **확인**
2. 시스템 설정 → 개인정보 보호 및 보안
3. 맨 아래 "Clauday 차단됨" 안내 옆 **그래도 열기**
4. 패스워드 입력 후 다시 실행

---

## 개발자용

```bash
npm install     # postinstall 에서 node-pty / keytar 자동 리빌드
npm run dev     # electron-vite dev
npm run build
```

```bash
npm run dist       # macOS dmg
npm run dist:win   # Windows exe
npm run dist:all   # macOS + Windows
```

빌드 결과물은 `release/`.

### 릴리즈

태그 푸시 트리거. main 머지만으로는 릴리즈 안 됨.

```bash
git tag v1.5.5
git push origin v1.5.5
```

### Windows — 자동

`.github/workflows/release.yml` 이 태그 push(`vX.Y.Z`) 시 자동으로 Windows exe 빌드 + GitHub Release 첨부.

### macOS — 수동 (로컬 빌드 후 업로드)

Apple Developer 인증서 부재로 GitHub Actions 의 macOS runner 에서 dmg 빌드가 실패 (codesign 권한 충돌). macOS 빌드는 매 릴리즈마다 로컬 Mac 에서:

```bash
# 1. 태그 체크아웃
git fetch --tags
git checkout v<버전>

# 2. 빌드 (로컬 keychain 으로 ad-hoc 서명 자동)
npm install
npm run dist

# 3. release/Clauday-<버전>.dmg 생성 확인 후 업로드
gh release upload v<버전> release/*.dmg
# 또는 GitHub Release UI 에서 드래그 업로드
```

> 정식 Apple Developer 인증서 도입 시 본 절차 제거 가능. 관련 ADR: `feature/mac-build/local-build-manual/adr.md`

---

## 기여하기

이슈 / PR 환영합니다. 앱 안의 **커뮤니티** 탭에서도 사내 사용자 모임 진행 중이에요.

버그 발견하면 — AI 호출 실패는 토스트의 🐞 **오류 리포트** 버튼이 진단 정보 자동 수집해서 한 번에 제보해 줍니다.
