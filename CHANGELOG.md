# Changelog

## [Unreleased] - v2.0 (feat/version-2.0 브랜치)

### 새 기능 — 터미널 작업 패널 (소스트리급 git)

사이드바의 **브랜치 작업** 메뉴를 없애고 그 기능을 **터미널 우측 패널**로 옮겼습니다. 터미널을 보면서
같은 화면에서 커밋까지 끝내기 위해서입니다. 그쪽이 따로 들고 있던 터미널 탭도 본체 탭으로 합쳐졌습니다.

패널은 상단 아이콘으로 4개 탭을 오갑니다 — **업무 · 변경사항 · 히스토리 · 브랜치**. 하는 일이
늘어서 이름을 '두레이 업무 패널' 에서 **작업 패널** 로 바꿨습니다. **왼쪽 모서리를 끌어 폭을
조절**할 수 있고(더블클릭하면 기본 폭), 폭은 저장됩니다.

대상 저장소는 기본적으로 **지금 보고 있는 터미널의 폴더**를 따라갑니다. 패널 위쪽 저장소 이름을
누르면 최근 저장소 목록과 `폴더 열기…` 가 나오고, 고르면 그 저장소로 **고정**됩니다.
`터미널 따라가기` 로 되돌립니다 — Windows 처럼 셸의 `cd` 를 추적할 수 없는 환경, 터미널을 안 연
상태, 다른 저장소를 잠깐 들여다볼 때를 위한 장치입니다.

- **변경사항** — 파일 목록(스테이징/작업 트리 분리), 행 hover 로 올리기·내리기·되돌리기, 섹션 일괄 처리,
  커밋(직전 커밋 수정 포함), 풀·푸시, 충돌 배너와 머지/리베이스 중단.
- 파일을 클릭하면 **좌우 비교 diff 가 터미널 탭으로** 열립니다. 터미널 탭과 나란히 두고 오갈 수 있고,
  같은 파일을 다시 눌러도 탭이 쌓이지 않습니다.
- **히스토리** — 색상 레인 커밋 그래프. 커밋을 펼치면 변경 파일이 나오고, 파일을 클릭하면 그 시점 diff 가
  열립니다. `모든 브랜치` 토글과 `더 보기`(50개씩) 를 제공합니다. 스태시는 히스토리에 섞이지 않습니다.
- **커밋 검색 · 필터 (IntelliJ 식)** — 검색어 한 칸 + 조건 칩(브랜치 · 작성자 · 기간 · 경로 · 코드).
  조건들은 서로 배타적이지 않고 **함께** 걸려서 "이 경로에서 저 사람이 지난주에 만진 커밋" 같은 조합이
  됩니다. 검색창에 7자 이상 hex 를 넣으면 해시로 알아듣고 그 커밋 하나만 보여줍니다. 검색어 오른쪽
  토글로 정규식(`.*`)과 대소문자 구분(`Aa`)을 켤 수 있고, 기본은 있는 그대로 찾으므로 `feat(git):`
  같은 문자열도 그대로 검색됩니다. 검색 중에는 그래프가 접힙니다 — 결과가 히스토리의 일부라
  부모 커밋이 없어 선을 이을 수 없습니다.
- **브랜치** — 브랜치 전환/생성/삭제, 워크트리 생성·열기·제거, 스태시. 워크트리를 만들면 새 터미널 탭이
  그 폴더로 열립니다.

내부적으로 자격증명 프롬프트를 차단합니다 — GUI 가 실행한 git 은 인증 창이 뜨면 영구히 멈추기 때문에,
캐시된 자격증명은 살리고 대화형 경로만 막았습니다. 원격 작업에는 2분 데드라인이 걸립니다.
한글 경로·거대 저장소(변경 1000건 초과 시 조기 중단)도 함께 다뤘습니다.

### 변경 — 저장소·브랜치·지시 문구를 프로젝트별로 정합니다

전역 값 하나로 맞추던 구조를 바꿨습니다. PC 한 대에 저장소가 10여 개, 두레이 프로젝트도
여러 개인데 브랜치 규칙과 첫 지시 문구를 하나로 강요할 수 없습니다.

- ⚙ 설정 → 워크스페이스 → **프로젝트별 규칙** 에서 프로젝트마다 **저장소(여러 개) · 브랜치 이름 ·
  첫 지시 문구**를 정합니다. 비워두면 아래 **기본값** 을 씁니다 — 각 항목에 `기본값 사용 중` 이
  표시되고, 정한 값은 `기본값으로` 버튼으로 되돌립니다.
- 설정한 값이 실제로 어떻게 나오는지 **바로 아래에 미리보기**로 보여줍니다
  (`feature/NEON-6793`, `다음 두레이 업무를 진행합니다: NEON/6793 …`).
- 저장소 섹션 설명을 고쳤습니다 — 더 이상 "첫 저장소로 cd" 하지 않습니다.
- 프로젝트 선택 버튼이 아이콘만 있어 무슨 버튼인지 알 수 없던 것을 이름 있는 버튼으로 바꿨습니다.

### 변경 — 업무 드롭이 폴더를 마음대로 옮기지 않습니다

업무를 터미널에 놓으면 미리 지정한 저장소로 `cd` 한 뒤 시작했습니다. 업무 하나가 저장소 하나에
대응한다는 가정인데, 실제로는 한 업무를 여러 저장소에서 동시에 고칩니다.

- **업무 드롭은 항상 그 업무 전용 워크트리에서 시작합니다.** 브랜치는 프로젝트 규칙대로 만들고
  폴더는 저장소 옆 `.<저장소>-worktrees/<브랜치>` 에 둡니다. 다른 업무가 저장소를 점유하고 있어도
  막히지 않아 여러 업무를 동시에 진행할 수 있고, 커밋·푸시는 그 워크트리에서 그대로 하면 됩니다.
  그 브랜치가 이미 어딘가에 체크아웃돼 있으면 새로 파지 않고 그 폴더를 씁니다.
  새 브랜치는 저장소의 `기본 base` → `origin/HEAD` 순으로 갈라내므로, 지금 보고 있는 다른 업무의
  브랜치 위에 얹히지 않습니다.
- **실행 중인 터미널에 놓아도 안전합니다.** 전에는 claude 가 떠 있는 pane 에 명령이 타이핑돼
  진행 중인 대화에 섞이고 엉뚱한 폴더에서 세션이 시작됐습니다. 이제 실행 중이면 새 탭을 열어
  거기서 시작합니다. 시작 위치도 알림으로 남습니다.
### 추가 — GitHub 연결 · 처음 켰을 때의 설정 안내 · 실험실

- **GitHub 연결** (⚙ 설정 → 연결 → GitHub). **앱이 토큰을 받지 않습니다** — 터미널에서
  `gh auth login` 해 둔 로그인을 그대로 씁니다. 설치 안 됨 / 로그인 안 됨 / 연결됨(계정·호스트·
  스코프)을 보여주고, 각 상태에 필요한 명령(`brew install gh`, `gh auth login`)을 눌러 복사합니다.
  `GITHUB_TOKEN` 환경변수가 키체인 로그인을 가리는 경우도 알려줍니다 — 이때는 `gh auth refresh`
  가 조용히 무시됩니다.
- **처음 켜면 설정 안내 창**이 뜹니다 — 두레이 토큰 · 두레이 도메인(실시간 수신) · 캘린더 ·
  GitHub 을 한 자리에서 연결합니다. 쓸 것만 연결하면 되고 건너뛰어도 언제든 설정에서 이어서
  할 수 있습니다. 이미 연결된 항목은 연결됨으로 표시됩니다.
- **실험실** (⚙ 설정 → 동작). **Harness Studio 는 기본 모드에서 아예 보이지 않습니다** —
  켜야 사이드바·커맨드 팔레트에 등장하고, 끄면 화면 자체가 마운트되지 않습니다.
- **읽지 않음 배지가 노랑**이 됐습니다. 다크에서 무채색이라 다른 크롬에 묻혔습니다 —
  읽지 않은 것이 있다는 건 정보라 색을 씁니다.
- 작업 패널의 프로젝트 선택은 **조회 전용**이 됐습니다. 프로젝트를 고른 뒤 정할 것들(저장소·
  브랜치 이름·첫 지시 문구)이 설정에만 있어서, 두 군데서 고르면 규칙 없는 프로젝트가 남습니다.

### 변경 — 변경사항을 IntelliJ 방식으로

- 목록이 **변경 / 버전이 없는 파일** 로만 나뉩니다. 스테이징 여부로 가르지 않으므로
  **체크해도 파일이 섹션을 옮겨 다니지 않습니다.** 한 파일은 항상 한 줄입니다.
- **체크박스가 곧 커밋 대상**입니다. 추적 중인 변경은 기본으로 골라져 있고, 버전이 없는 파일은
  직접 고릅니다(빌드 산출물이 딸려 들어가는 사고 방지). 고른 파일만 커밋됩니다 —
  터미널에서 따로 `git add` 해둔 파일이 묻어 올라가지 않습니다.
- 커밋 상자를 **목록 아래**로 옮기고 **`커밋` / `커밋 및 푸시`** 두 버튼을 뒀습니다.
- 탭바 오른쪽에 **분할 버튼**(오른쪽/아래)을 뒀습니다. 단축키를 모르면 분할로 가는 길이 없었습니다.

### 추가 — claude 작업 완료 알림

터미널에 맡겨두고 다른 일을 하다 보면 claude 가 언제 끝났는지 몰라 계속 들여다보게 됩니다.

- 터미널의 claude 가 **끝났거나 뭔가 물어보려고 멈추면** 데스크톱 알림이 뜹니다. 판정은
  "출력이 멎었는가" 로 합니다 — 사용자에겐 둘 다 돌아가서 봐야 하는 순간이라 굳이 가르지 않습니다.
- 알림을 누르면 그 터미널 탭으로 이동합니다. 창을 보고 있을 땐 알림 대신 **탭에 점**만 붙습니다.
- ⚙ 설정 → 동작에서 끄거나, 멈춘 것으로 볼 시간(기본 12초)을 조절할 수 있습니다.

### 변경 — 모니터링 수집을 WebSocket 하나로

폴링과 소켓 두 경로로 같은 메시지를 모으면 어느 쪽이 늦었는지에 따라 타임라인 순서가 흔들리고,
한쪽이 조용히 죽어도 다른 쪽이 가려서 문제를 늦게 압니다.

- **2분 주기 폴링을 없앴습니다.** 수집은 소켓 이벤트로만 합니다.
- **끊기면 스스로 다시 붙습니다.** 1초에서 시작해 최대 30초까지 늘어나는 간격으로 재시도하며,
  토큰은 만료를 대비해 매번 새로 받습니다. 재연결 버튼을 누를 일이 없어졌습니다.
- **다시 붙는 순간 한 번 메웁니다.** 끊겨 있던 동안의 메시지는 소켓으로 오지 않으므로,
  연결 경계에서만 채널을 훑어 타임라인에 구멍이 남지 않게 합니다.

### 변경 — 워크스페이스 기본값을 프로젝트별로

전역 `기본값` 카드(브랜치 이름·첫 지시 문구)를 없앴습니다. 프로젝트마다 값이 다른 것이 보통이라
전역 값을 고치면 다른 프로젝트가 조용히 따라 바뀌었습니다. 이제 프로젝트 카드에서 각각 정하고,
비워두면 앱 기본값(`feature/{projectCode}-{taskNumber}`)을 씁니다.

### 변경 — 읽는 매뉴얼 대신 온보딩

기능 설명을 문서로 읽는 것과 화면에서 어디를 눌러야 하는지 아는 것은 다른 일입니다.

- 사이드바 **매뉴얼**이 **온보딩**으로 바뀌었습니다. 메뉴 목록에서 하나를 고르고 `온보딩 시작` 을
  누르면 그 화면으로 옮겨간 뒤, 실제 요소를 비추며 기능을 하나씩 짚어 줍니다.
- 안내 중에는 `←` `→` 로 이동하고 `Esc` 로 멈춥니다. 본 메뉴는 표시가 남고 `다시 보기` 로 재생합니다.

- **diff 에서 변경점 이동.** diff 탭 오른쪽 위 `∧` `∨` 버튼(또는 `F7` / `Shift+F7`)으로 변경점을
  순서대로 넘기고, 지금 몇 번째인지(`3/12`)를 함께 보여줍니다.
- **작업 패널에 `브랜치 변경` 탭.** 이 브랜치가 기준에서 갈라진 뒤 바꾼 파일을 커밋한 것까지
  합쳐 보여줍니다(`변경사항` 탭은 아직 커밋 안 한 것만). 파일을 누르면 기준 대비 diff 가 열립니다.
- **워크트리 정리 화면.** 작업 패널 → 브랜치 탭의 `정리…` 에서 오래 안 쓴 순으로 워크트리를 보고
  여러 개를 골라 지웁니다. 용량·마지막 사용 시각·커밋 안 된 변경 수가 함께 보입니다. 자동으로
  지우지는 않으며, 브랜치와 커밋은 남아서 같은 업무를 다시 시작하면 이어집니다.
- **어느 저장소에서 할지는 설정이 아니라 상황으로 정합니다.** 지금 터미널이 그 프로젝트의 저장소 안이면
  이동 없이 그 자리에서 시작하고, 매핑되지 않은 곳에 놓았으면 저장소가 여럿일 때 어디서 할지 묻고
  하나뿐이면 바로 그리로 이동합니다. 지정한 저장소가 없어도 지금 자리에서 그대로 시작합니다.
  업무 상세의 **터미널에서 시작** 버튼도 같은 규칙입니다.
- **저장소·브랜치 이름·첫 지시 문구를 두레이 프로젝트마다 따로** 정합니다. 저장소가 열 개가 넘는데
  전역 값 하나로 맞출 수 없었습니다.
- **첫 지시 문구를 직접 정할 수 있습니다.** `{title}` `{number}` `{project}` `{ref}` `{url}` `{body}`
  를 쓸 수 있고, 비우면 아무것도 보내지 않고 claude 만 띄웁니다.
- **이전 세션 이어가기**와 **권한 확인 건너뛰기**(`--dangerously-skip-permissions`)도 설정으로
  열었습니다.

### 수정 — 앱 곳곳의 색이 사라져 있던 문제

배경 tint·테두리·hover 색을 지정한 클래스가 **빌드 결과물에 아예 생성되지 않고 있었습니다.**
Tailwind 는 CSS 변수로 정의한 색에 `/10` 같은 불투명도를 붙이면 그 규칙을 통째로 버립니다.
소스 135곳에서 쓰였는데 컴파일된 CSS 에는 0건이었습니다 — 앱이 "죽어 보이던" 진짜 원인입니다.

- 배경이 없어지고, 테두리는 브라우저 기본 회색이 드러나고, hover 는 반응 자체가 없었습니다.
- 48개 파일을 자리 성격에 맞게 고쳤습니다 — 선택·활성 면은 무채색 면으로, 의미가 있는 곳은
  제대로 작동하는 색 짝으로.
- 눈에 띄는 것들: 캘린더 필터의 개수 배지(회색 원 → 파랑), 메신저 카드 아이콘(위계 복원),
  `두레이에서 보기` 링크(클릭 가능해 보이지 않던 것), 빈 화면의 주 버튼, 삭제 버튼(마우스를
  올려야 붉어지던 것 → 처음부터 붉게).
- 같은 실수가 다시 들어오지 못하게 검사를 추가했습니다.
- **선택된 항목이 비활성처럼 보이던 문제**도 함께 고쳤습니다. 글꼴 카드·크기 프리셋·목록에서
  고른 값의 글자가 고르지 않은 것보다 **어두웠습니다**. 선택은 이제 밝은 글자 + 진한 테두리로
  드러납니다. 회색 면으로 선택을 표시하는 건 좌측 사이드바 같은 내비게이션에만 남깁니다.

### 변경 — 설정 화면 전면 개편

가로 탭 + 제각각인 카드 더미였던 설정을 **좌측 그룹 네비 + 일관된 행 문법**으로 다시 짰습니다.

- **좌측 네비**: 연결(두레이·캘린더) / 작업(워크스페이스·단축키) / AI(모델·사용 인사이트) / 앱(외관·동작).
  '외관 & 동작' 을 둘로 나눴습니다 — 한 화면에 테마·글꼴·사이드바·시작화면·렌더러·알림이 다 있었습니다.
- **설정 검색** — 좌측 상단 검색창에서 항목 이름·설명·영문 키워드로 찾습니다(`font`, `webgl`, `단축키`).
  걸리는 섹션만 네비에 남습니다.
- **행 문법 통일** — 모든 설정 항목이 `좌: 이름 + 설명 / 우: 컨트롤` 2열입니다. 선택지가 2~4개면
  드롭다운 대신 세그먼트로 펼쳐 보여줍니다.
- **한 번에 한 섹션만 로드**합니다. 이전에는 모든 패널이 함께 마운트돼 설정을 열 때마다 두레이·
  CalDAV·사용량 IPC 가 한꺼번에 나갔습니다.
- 저장은 그대로 즉시 저장이고, "저장됨" 표시는 없앴습니다 — 컨트롤 자체가 상태를 보여줍니다.

### 수정 — 좁은 패널에서 드롭다운이 깨지던 문제

- **터미널 렌더러 드롭다운을 탭바에서 없앴습니다.** 진단용 설정이 상시 노출돼 있어 작업 패널을
  줄이면 탭바를 밀어 덜컹거렸고, 열면 메뉴가 잘렸습니다. ⚙ 설정 → 외관 & 동작 → 터미널 렌더러
  한 곳으로 모았습니다. WebGL 을 못 쓰면 자동으로 DOM 으로 폴백하고 토스트로 알립니다.
- **프로젝트 선택(⚙) 메뉴가 잘리던 문제**를 고쳤습니다. 패널 안에 그리던 것을 화면 기준으로
  띄우도록 바꿔, 패널이 좁아도 잘리지 않고 화면 밖으로 나가면 안쪽으로 붙습니다. 아래 공간이
  모자라면 위로 뒤집힙니다. 버튼 위치도 자기 줄에서 헤더 아이콘으로 옮겼습니다.

### 변경 — 사이드바 터미널 아이콘에 색상 부여

터미널만 무채색이라 밋밋했습니다. 터미널은 이제 두 도메인(두레이 업무 + git)이 만나는 앱의 중심
화면이라 세 번째 식별색을 줬습니다 — **초록**(셸 프롬프트의 관습색). Claude 주황 / 두레이 파랑과
섞이지 않습니다.

### 새 기능 — 메뉴별 온보딩

비어 있는 화면이 &lsquo;없음&rsquo; 대신 **여기서 무엇을 할 수 있는지**를 보여줍니다. 두레이·모니터링·에이전트·
터미널·Harness Studio·커뮤니티·MCP·스킬·AI 추천·Claude 채팅·사용량, 그리고 소스 제어 각 탭에 적용했습니다.
드래그&드롭처럼 발견이 어려운 기능을 이 자리에서 알립니다.


### 새 기능 — 터미널 우측 두레이 업무 패널 (⌘⇧T)

터미널이 곧 작업 화면입니다. 평소처럼 쓰다가 우측 패널에서 업무를 꺼내 쓰는 구조입니다.

- **설정에서 고른 프로젝트의 내 업무만** 표시됩니다. ⚙ 설정 → 워크스페이스 → 두레이 프로젝트(또는 패널 상단)에서 선택하며, 고르기 전에는 비어 있습니다 — 수백 건이 쏟아지지 않습니다.
- 업무 카드는 `프로젝트/번호 → 제목 → 상태` 3단으로 표시되고, `내 업무 / 전체 / 완료` 필터와 검색을 제공합니다.
- **카드를 터미널에 끌어다 놓으면** 매핑된 저장소로 `cd` 한 뒤 claude 가 실행되며 업무 내용을 첫 지시로 전달합니다. 한 번 작업한 업무는 `세션 연결됨` 배지가 붙고, 다시 놓으면 `claude --resume` 으로 이전 대화를 이어갑니다(프롬프트 재입력 없음).
- **카드 클릭 → 상세 오버레이** — 본문·댓글을 넓게 읽고 그 자리에서 `터미널에서 시작`·`업무 번호 복사`·`프롬프트 복사`·댓글 작성을 합니다.
- 워크트리 생성은 이 패널의 책임이 아닙니다 — 같은 드로어의 **브랜치** 탭이 담당합니다.
- ⚙ 설정 → **워크스페이스** 에서 프로젝트 선택과 저장소(드롭 시 `cd` 대상)를 관리합니다.

### 개선 — 사이드바 · 터미널 탭 이름

- **사이드바 아이콘 + 이름 표시** — 기본이 이름까지 보이는 확장 상태이고, 맨 아래 `접기` 버튼으로 아이콘만 보기로 전환합니다(상태 저장).
- **터미널 탭 이름 자동 지정 (Warp 식)** — 셸/프로그램이 바꾸는 창 제목을 받아 탭 이름이 따라 바뀝니다(`npm`, `vi`, 작업 폴더명 등). 탭을 더블클릭해 직접 이름을 정하면 그때부터 자동 갱신을 멈춥니다.

### 변경 — 다크 테마 색감 개편

- **캔버스(터미널)만 가장 어둡고, 사이드바·패널·카드는 한 톤 밝게** 떠 있도록 표면 위계를 다시 잡았고, 푸른 기 없는 중성 회색조로 통일했습니다.
- 컬러는 상태 칩과 AI 액션에만 남기고 나머지는 회색조 위계로 표현합니다. 주 버튼은 그라디언트에서 **밝은 면 + 어두운 글자**로 바뀌었습니다.
- 카드·모달의 여백과 라운드를 키웠습니다. 터미널 배경도 앱 캔버스와 같은 톤으로 통일했습니다(기존에는 터미널만 남색).
- 두레이 댓글이 HTML 원문(`<div style=...>`, `&nbsp;`)으로 보이던 문제를 고쳤습니다 — 본문과 같은 방식으로 렌더링합니다.

### 새 기능 — 단축키 설정 (⚙ 설정 → 단축키)

- **앱의 모든 단축키를 한 화면에서 확인** — 그룹별 전체 목록, 액션명·키 조합 검색, `변경됨`/`충돌` 필터를 제공합니다.
- **커스텀 리바인딩** — 키 조합을 클릭하고 새 조합을 누르면 바로 적용됩니다(Esc 취소). 같은 범위에서 이미 쓰는 조합이면 어떤 기능과 겹치는지 경고합니다. 행별·전체 기본값 복원을 지원합니다.
- **한글 레이아웃에서도 정상 캡처** — 입력기가 켜져 있어도 물리 키를 기준으로 조합을 인식합니다. mac 에서 잡은 `⌘⇧D` 는 Windows 에서 `Ctrl+Shift+D` 로 자동 대응됩니다.
- 셸 제어문자(줄 처음/끝 이동, 복사·붙여넣기 등)와 시스템 메뉴 항목은 자물쇠로 표시되며 변경 대상에서 제외됩니다.

### 버그 수정 (단축키)

- **터미널에서 `⌘K` 가 두 번 발화하던 문제 수정** — 화면 지우기와 커맨드 팔레트가 동시에 실행되던 것을, 앞 단계가 처리한 키는 전역 단축키가 다시 잡지 않도록 고쳤습니다.

### 내부
- Windows 호환 수복(Workstream A)을 위한 공용 유틸 6종 신설 — `claudeProjects`(claude 프로젝트 디렉터리 인코딩/조회), `env`(PATH 보강), `claudeBin`(claude 바이너리 해석/spawn 옵션), `atomicWrite`(원자적 파일 쓰기), `paths`(홈 확장/경로 비교), `filename`(스킬 파일명 정제). 아직 소비처 교체 전이라 사용자 가시 동작 변경은 없음.
- claude CLI 가 `~/.claude/projects` 아래 디렉터리명을 만드는 실제 규칙(NFC 정규화 → 비영숫자 치환 → 200자 캡+해시)을 리버스엔지니어링으로 확정. 기존 `/`→`-` 추정 규칙과 `-`→`/` 역치환은 다수의 실경로(점·공백·한글·대시 포함 경로)에서 이미 어긋나 있었음.

### 버그 수정 (Windows 호환 수복 — Workstream A-1/A-3/MCP)

- **Windows 에서 세션 목록/이어하기가 아예 뜨지 않던 결함 수정** — cwd → 프로젝트 디렉터리 조회가 `/`→`-` 치환만 하던 것을 실제 claude 인코딩 규칙(NFC 정규화 → 비영숫자 치환 → 200자 캡+해시)에 맞춰 통일. mac 에서도 세션 목록의 프로젝트 라벨이 존재하지 않는 경로로 잘못 표시되던 문제(예: `.../dooray/claude/gui/assistance`)가 실제 경로 기준으로 함께 고쳐졌습니다.
- **공백 포함 설치 경로에서 claude 실행 실패 수정** — claude 채팅/브리핑·보고서 생성/CLI 정보 조회 5곳의 실행 방식을 통일해 Windows 의 `C:\Program Files\...` 같은 경로에서도 정상 동작합니다.
- **긴 한글 응답이 스트리밍 중 깨지던 문제 수정** — 응답 청크 경계에서 멀티바이트 문자가 잘려 `�` 로 표시되던 문제를 고쳤습니다.
- **CLI Info 패널이 Windows 에서 항상 비어있던 결함 수정**.
- **두레이 위키에서 받은 스킬 저장 실패 수정** — 위키 제목에 `:`, `/` 등 Windows 에서 파일명으로 쓸 수 없는 문자가 있으면 저장 전 자동으로 안전한 이름으로 정제합니다(단일/다중 내려받기 모두). 정제되어 원래 제목과 파일명이 달라진 경우 실제 저장된 이름을 토스트로 안내합니다. 스킬 삭제 시 빈 디렉터리가 남아 같은 이름으로 재저장할 때 꼬이던 문제도 함께 정리했습니다.
- **스킬 다중 삭제가 일부만 실패해도 조용히 넘어가던 문제 수정** — 성공/실패 건수를 각각 토스트로 안내합니다.
- **스킬/커맨드가 하나도 없는 신규 사용자에서 변경 감지가 죽어있던 문제 수정**.
- **MCP `npx` 기반 서버가 Windows 에서 등록해도 뜨지 않던 문제 수정** — 저장 시 자동으로 `cmd /c` 로 감싸 등록합니다(비활성화/재활성화를 반복해도 중복으로 감싸지 않음). MCP 서버 추가/편집 폼에서도 Windows 에서 `npx`/`uvx` 계열 커맨드를 입력하면 저장 시 자동 변환된다는 안내 문구가 표시됩니다.
- `~/.claude.json`(MCP 설정) 쓰기를 원자적 쓰기로 전환 — 쓰기 도중 앱이 죽거나 디스크가 차도 파일이 잘리지 않습니다.

### 개선

- **글자 크기 설정이 실제로 글자를 키움** — 기존에는 글자 크기 스케일이 일부 텍스트(rem 기반)에만 적용되고 화면에 박힌 px 텍스트(메뉴·라벨·버튼 등 ~700곳)와 공용 컴포넌트는 무시해, "확대만 되고 글자는 안 커진다"는 체감이 있었습니다. 이제 모든 font-size(Tailwind named 유틸 + arbitrary px + `--t-*` 토큰 + `.ds-*` 컴포넌트)가 `--app-font-scale` 에 반응합니다. **여백·레이아웃·아이콘은 그대로 두고 글자만 커지도록** root font-size 를 16px 로 고정하고 스케일을 font-size 속성에만 적용. scale=1 에서는 이전과 픽셀 단위로 동일. (터미널 글자와 일부 차트/플로우 다이어그램의 inline font-size 는 제외)
- **터미널 세션 종료 통지** — 셸이 죽어도 탭이 아무 반응 없이 남아있던 문제를 고쳤습니다. 이제 PTY 가 종료되면 pane 에 `세션이 종료되었습니다 (exit N)` 오버레이가 뜨고 그 pane 의 입력이 막힙니다. 스크롤/선택/복사는 계속 가능하고, 오버레이는 자동으로 사라지지 않습니다(직접 닫기 전까지 로그 보존). 탭을 직접 닫거나 앱을 종료할 때는 뜨지 않습니다.
- **터미널 검색 고도화 (⌘F)** — 매치 카운트(`3/47`, 1000건 이상은 `>999`)와 `Aa`(대소문자)·`.*`(정규식)·`\b`(단어 단위) 토글이 추가됐습니다. 잘못된 정규식을 입력해도 터미널은 죽지 않고 검색바에 오류만 표시됩니다. 우측 오버뷰 룰러에 매치 위치가 마커로 표시됩니다.
- **터미널 탭 드래그 순서 변경** — 탭을 12px 이상 끌면 순서를 바꿀 수 있습니다(더블클릭 이름 변경과 충돌하지 않도록 임계값을 둠). 탭을 닫으면 최근 사용한 탭이 우선 활성화됩니다. 재배치한 순서는 아래 영속화 v2 스냅샷에 그대로 포함되어 재시작 후에도 완전히 유지됩니다.
- **터미널 Split Pane** — `⌘D`/`⌘⇧D` 로 탭 하나 안에서 화면을 오른쪽/아래로 나눌 수 있습니다. 분할은 항상 새 셸 세션을 엽니다(현재 pane 의 작업 폴더 상속). `⌥⌘←↑↓→` 로 pane 사이 포커스 이동, `⌘W` 는 포커스된 pane → (마지막이면) 탭 순으로 닫습니다. pane 경계를 드래그해 크기를 조절하고 더블클릭하면 50/50 으로 복귀합니다 — 드래그 중에는 화면만 부드럽게 움직이고 실제 터미널 크기는 손을 뗀 순간 한 번만 반영되어 vim 같은 화면 전체 프로그램이 매 프레임 다시 그려지지 않습니다. 탭 라벨에 분할 pane 수(`⫿2`)가 표시됩니다. 분할·닫기·탭 전환 어디서도 스크롤백은 유지됩니다.
- **터미널 영속화 v2 — 화면까지 통째로 복원** — 이제 탭 구성뿐 아니라 **화면 내용(스크롤백·커서 위치·색상)** 이 저장되어 재시작 후 그대로 복원됩니다(탭 최대 20개). 창을 닫고 한참 있다가 완전히 종료해도(예: macOS 에서 창만 닫고 나중에 `⌘Q`) 스크롤백이 사라지지 않던 문제를 구조적으로 해결했습니다.
- **터미널 WebGL 렌더러 + 전환 토글** — 긴 로그·TUI 재그리기가 GPU 가속으로 부드러워집니다. 화면이 깨지거나 GPU 문제가 의심되면 탭바 우측(또는 ⚙ 설정 → 외관 & 동작)에서 DOM 렌더러로 즉시 전환할 수 있습니다. WebGL 초기화가 자동으로 실패하면 앱이 알아서 DOM 으로 폴백하고 라벨에 `(폴백)` 이 표시됩니다.
- **터미널 경로 Cmd+클릭 재작성** — "Cmd+클릭으로 경로가 안 열린다"는 신고를 계기로 링크 인식을 다시 만들었습니다. 이제 **상대 경로**, **공백 포함 경로**, **확장자 없는 폴더**, `Makefile`/`Dockerfile` 같은 **무확장자 파일**, claude 출력처럼 **줄바꿈으로 잘린 긴 경로**까지 인식하고, 실제로 존재하는 경로만 밑줄이 그어집니다. `파일.ts:120:8` 처럼 줄 번호가 붙으면 툴팁에 표시됩니다. vim 등 마우스 모드가 켜진 프로그램 위에서 Cmd+클릭해도 이중으로 열리지 않습니다.
- **한글/이모지 폭 보정** — ZWJ 로 합쳐진 이모지(👨‍👩‍👧‍👦 등)가 복원된 화면에서도 깨지지 않고 정확한 폭으로 표시됩니다.

## [1.7.1] - 터미널 스크롤 고정 회귀 수정

### 버그 수정

- **터미널 자동 스크롤** — Claude 가 출력 중일 때 위로 스크롤해 과거 내용을 읽고 있어도 새 출력이 올 때마다 강제로 바닥으로 끌려가던 v1.7.0 회귀를 수정. 이제 바닥에 있을 때만 새 출력을 따라 내려가고(auto-follow), 위로 올려둔 상태면 그 위치를 유지합니다.

## [1.7.0] - Harness Studio (bmad 하네스 시각화 · Dry-run · 편집)

bmad 계열 하네스(reined-bmad·neon-bmad 등)를 가져와 에이전트 구조·레벨 체인·게이트·산출물을 시각화하고, 태스크 흐름을 실행 전에 미리보고(Dry-run), 직접 편집까지 할 수 있는 도구.

### 편집(저작) 모드 (기본 OFF — 켜기 전까지 기존 동작 그대로)

- **편집 모드 토글** — 켜면 구조화 필드 폼 + 원본 파일 에디터로 하네스를 수정.
- **구조화 필드 폼** — 에이전트 모델/도구 등 frontmatter 기반 필드를 폼으로 편집(AI 해석값은 원본/AI 편집으로 안내).
- **원본 파일 에디터** — 번들의 `.md`/`.sh` 를 Monaco 에디터로 직접 편집(`.sh` 는 경고 표시).
- **AI 편집** — 자연어 명령(예: "보안 검토자를 opus로") → AI 가 변경안(diff) 제시 → 2단계 승인.
- **Draft → diff → 적용** — 편집은 draft 에 쌓이고, diff 확인 후 **명시적으로 '파일에 적용'**(자동 쓰기 없음). 적용 시 자동 백업.
- **백업/복원** — 적용 전 원본 백업, 백업 목록에서 복원 가능.
- 안전장치 — 번들 폴더 밖 쓰기 차단(경로 게이트·심링크 해소), `.sh` 비실행, 외부 변경 충돌(STALE) 시 적용 거부, 적용 후 자동 재정규화.

### 분석·시각화 (정적 스캔 + AI 정규화)

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
