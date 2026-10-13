# @clauday 에이전트 강화 — 기획 (v2.1 후보)

> 상태: 기획 초안 · 2026-10-13
> 목업: `docs/mockups/agent/dooray-agent-flow.html`
> 후속: `/change-map` 접목(작업 결과를 의도별 커밋 + 근거 노트로)은 2단계로 분리

## 1. 문제

지금의 @clauday 는 **"원격 트리거 1회 + 최종 답 1회"** 다.

| 공백 | 현재 | 결과 |
|---|---|---|
| 권한 | `--dangerously-skip-permissions` 로 전부 통과 | 위험 동작을 사람이 볼 기회가 없다 |
| 진행 상황 | "작업을 시작합니다." → 최종 답 | 30분짜리 작업 동안 침묵 |
| 결과 표현 | 마크다운을 ```` ```md ```` 로 감싸 1500자에서 자름 | 줄번호 붙은 코드블록, 링크가 끊겨 클릭 불가 |
| 오회신 | 멘션 탭에서 직접 친 턴도 Stop hook 으로 두레이에 회신 | 의도치 않은 메시지 |

## 2. 목표 / 비목표

**목표**
1. **두레이 안에서 상호작용** — 위험 동작은 두레이에서 승인/거절한다.
2. **진행이 보인다** — 메시지 1개가 실시간으로 갱신된다.
3. **결과가 읽힌다** — 짧으면 카드, 길면 카드 + 요약 + 메신저용으로 조판한 글타래.
4. **사내 시스템을 아는 에이전트** — 사내 동료가 쓴다고 가정한다. 에이전트는 Drop 같은 사내 시스템을 알고, 시키면 쓰고, 연결이 안 됐으면 링크와 함께 연결 방법을 안내한다.

**비목표 (이번 버전 제외)**
- 작업 대상 저장소/워크트리 연결 — `/change-map` 접목 단계에서 재검토
- 두레이 버튼(메신저 커맨드 앱 + 사내 릴레이) — 승인 프로토콜만 공유하도록 설계해 두고 후속
- 제어 명령(`중단`/`상태`/`reset`), 채널 큐
- 타인 호출 허용 — **본인만 유지**
- 실행 방식 변경 — **TUI(PTY) 유지**. `-p` 는 2026-06-15 부터 별도 크레딧
- **Drop 자동 발행** — Clauday 가 결과를 알아서 Drop 에 올리지 않는다. 사용자가 프로젝트를 지정해 시킬 때만 에이전트가 스킬로 올린다(§5.6)

## 2.5 실사용 시나리오 — 재무서비스 운영개발 채널 실측 (2026-10-13)

개발팀↔운영팀 채널 1,000개 메시지(08-06~10-13, API 최대치)와 글타래 537개(답글 5,505개)를 **읽기 전용**으로 분석했다. 원본 덤프는 저장소에 넣지 않는다.

### 정량
| 지표 | 값 | 시사점 |
|---|---|---|
| 글타래가 달린 메시지 | 537 / 1,000 (54%) | **일은 글타래에서 한다** |
| 글타래 답글 수 | 중앙값 6~7, 11개 이상 180개, 최대 95 | 직전 50개 수집으로는 한 글타래도 다 못 담는다 |
| 첫 답글이 원글 전제("넵", 멘션 하나, 15자 미만) | 약 40% | **원글을 못 읽으면 오판** (현재 구현 그대로) |
| ```` ```sql ```` 블록 / 업무 링크 / 이미지·파일 | 211 / 574 / 507 | SQL 관례·링크 추적·첨부 수집이 입력의 핵심 |
| 키워드 | 전표 338 · 쿼리 260 · 배포 249 · 오류 164 · 확인 부탁 111 · 보정 98 | 데이터 보정·문의 조사 중심 |

### 반복 업무와 @clauday 적합도
| # | 업무 흐름 | 빈도 | 지금 걸리는 시간 | @clauday 가 할 일 | 회신 | 위험 지점 |
|---|---|---|---|---|---|---|
| A | **운영 데이터 보정(DML) 요청** — 업무의뢰 번호 + SQL + 백업 쿼리 → 실행 담당자 멘션 → "완!" | 최다 (실행 완료 글타래 70+) | 단발 수 분, 재작성 반복 시 반나절 | SQL 정적 검사(WHERE 누락·뷰 대상·중복 SET·타입 불일치), **읽기 전용 SELECT 로 영향 행수·현재값**, 백업 쿼리 생성, 채널 SQL 양식 점검 | 글타래에 "영향 N행 · 백업 블록 · 체크리스트" | **실행은 절대 안 한다** — 지정 실행 담당자만 |
| B | **문의 접수 → 원인 조사 → 우회 안내 + 개발 TASK** | 높음 (TASK 연결 글타래 60+) | 2시간~1일 | 업무·첨부·글타래를 읽고 저장소 코드(파일:라인)·DB 조회로 원인 가설, 우회 안내 문구, TASK 초안(`메뉴 > 경로 - 내용`, AS-IS/TO-BE) | "현상/원인/영향/제안" + 근거 | TASK 생성·수정은 승인 |
| C | **DDL → DBIP 상신** — 운영팀이 매번 같은 질문 3개(ERP 도? 즉시 실행? 권한?) | 15+ | 수 시간~12일 | 대문자 정규화, collation 점검, 테이블 크기 조회(대형 테이블 경고), 질문 3개를 미리 답한 상신용 텍스트 | 상신 초안 | 상신은 사람 |
| D | **긴 글타래 정리** — 요건 정제가 수일~한 달, 주제가 섞임 | 여러 날 글타래 66+ | — | 결정 사항(`=> 결론`)과 미결 질문 정리, TASK 본문 갱신안 | 요약 블록 | TASK 수정은 승인 |
| E | **채널 공지 취합** — "배포 필요한 시스템 글타래로" (44~95 답글) | 이벤트성 | 수 시간 | 응답 집계, 미응답·미완료 목록 | 중간 체크 표 | 채널 전체 공지는 승인 |
| F | **배포·핫픽스 묶음 확인** | 13+ | 30분~2시간 | 마일스톤 PR·머지 이력·동반 DML/DBIP 대조, 배포 후 에러 확인 | 체크리스트 | 재기동·머지는 승인 |
| G | **로컬 작업 공유** (실제 첫 사용, 10-13) | 1 | — | 내 PC 세션 결과를 글타래로 요약 공유 | 요약 3줄 + 링크 | Drop 게시 |
| — | 할당·검토 요청 핑 (본문 없이 멘션만 22+) | 많음 | 수 시간 | 담당 추천 정도 — 우선순위 낮음 | | 할당 변경 |

**이미 수요가 증명된 지점**: 사람들이 Claude 분석 결과를 채널에 복사해 붙이고 있다("클로드 추정", "제 클로드 답변인데"). 동시에 **LLM 오답 전례**도 있다("LLM 이 잘못 분석한 것 같은데", 존재하지 않는 버튼 안내). → 회신에 **근거(파일:라인·조회 결과) 필수**.

**놓친 실제 오류 (A 의 가치)**: 정수 컬럼에 문자열 대입 실행 오류, 같은 컬럼 중복 SET 이 그대로 "완!", 다단계 쿼리 3번째에서 실패, 뷰에 UPDATE 시도. 모두 dry-run SELECT·스키마 검사로 사전에 잡힌다.

### 채널 규칙 (봇이 지켜야 할 것 — 채널 안 실제 지시)
- 운영 DB 쓰기는 지정 실행 담당자만. 업무의뢰 상신 후에만 실행, 실행 시점은 업무의뢰 본문에
- SQL 맨 위에 업무의뢰 문서번호·제목 주석(내부통제 증적), 주석은 `--` 만
- 개발 서버에서 먼저 → 현업 확인 → 운영
- 개인정보·암복호화 컬럼은 담당자에게 알린다. 조회 결과는 **건수·마스킹 값만** 채널에
- 결재·정책·핫픽스 여부는 사람이 판단. "이 글타래는 보지 마세요" 류 지시 존중
- 멘션 최소화

### 기획에 주는 변화
1. **컨텍스트 수집이 1순위로 올라간다** (§5.7) — 원글 + 글타래 전체, 첨부 이미지, 링크(업무·위키) 추적, **비밀값 마스킹**(채널에 DB 접속 정보·API 키·테스트 계정이 평문으로 있음), 수천 자 백업 쿼리 줄 절단
2. **채널 관례는 개인/팀 스킬로** — SQL 양식, `[상황]/[AS-IS]/[TO-BE]`, `=> 결론` 같은 팀 관례는 Clauday 가 번들하지 않고 팀이 만든 스킬 또는 채널 메모(CLAUDE.md `## 메모`)로 (§5.6 원칙과 동일)
3. **위험 도구 기본값** — `mcp__mysql*__execute_*` 계열은 `permissions.deny`(운영) / 승인(개발), 두레이 업무 생성·수정, 채널 공지, Drop 게시는 승인 대상 (§5.1)
4. **발신자 구분** — 봇 회신이 내 이름으로 올라가 사람 발언과 섞인다. 카드 `authorName: Clauday` 와 일관된 머리말로 구분

## 3. 실측 근거 (2026-10-13 개인 채널 스파이크)

엔드포인트는 dooray-mcp 소스(`~/Desktop/mcp-servers/dooray-mcp/adapter/messengers/messenger.py`), 렌더링은 웹 메신저 Playwright 실측.

| 표현 | 결과 |
|---|---|
| text 본문 | 인라인 코드·맨 URL·`[텍스트](url)`·이모지만 렌더. 헤더/굵게/리스트/표는 평문. ```` ```lang ```` 은 코드블록 |
| `attachments` 카드 | 색 막대 · `title`+`titleLink` · `authorName` · `thumbUrl` · `fields`(short=2열) 렌더. **카드 안 text 는 완전 평문**(링크·인라인코드 불가) |
| `PUT /channels/{ch}/logs/{id}` | text 만 갱신. **attachments 는 서버에서 `[]` 로 지워진다** → 카드는 불변으로 다룬다 |
| `POST /channels/{ch}/threads/create-and-send` | `{text, threadText}` → `threadChannelId`. 글타래 답글은 그 채널로 POST |
| 멘션 | `[@이름](dooray://{tenantId}/members/{memberId} "member")` 렌더 |
| 버튼 `actions` | 렌더되지만 클릭 시 `commands/{commandId}/action` — 개인 토큰 메시지는 commandId 가 없어 500 |
| 파일 첨부 | **API 토큰으로는 불가** — 공개 메신저 API 에 업로드 경로 없음(dooray-mcp 도 드라이브·업무·위키만), 추정 경로 4개 실패. 웹 클라이언트 업로드는 세션 쿠키 기반 내부 API. 대안: 두레이 드라이브 업로드 후 링크 · Drop 링크 · 이미지는 카드 `thumbUrl`/`imageUrl` 로 URL 표시 |

## 4. 사용자 흐름

```
[나]       @clauday 지난주 장애 로그 정리해서 리포트로 만들어줘
[진행]     🤖 Clauday 작업 중 · 0:42                       ← text 1개를 PUT 으로 갱신
           ✅ 채널 대화 수집
           ⏳ 로그 분석 중 · 10/6~10/12 ERROR 추출
           ⬜ 리포트 작성
[승인카드] 🟧 승인 요청 — Bash                              ← 카드(불변)
           명령: rm -rf ./tmp/cache      작업 폴더: agent/353…
           답장: 승인 · 거절 [사유] · 항상 승인   (10분 후 자동 거절)
[나]       승인
[승인카드] → 후속 text: ✅ 승인됨 (0:18)
[진행]     ✅ 완료 · 3:12 ↓
[완료카드] 🟩 장애 로그 주간 리포트
           요약 3줄 · 필드: 소요 3:12 / 상세 글타래 →
  └ 글타래  메신저용으로 다시 조판한 전문 (주제별 메시지)
[나]       @clauday 이거 drop 재무서비스개발팀 에 올려줘      ← 사용자가 프로젝트를 지정
[완료카드] 🟦 Drop 발행 — weekly-incident-1013.html  (title → 파일 URL)
           필드: 프로젝트 재무서비스개발팀 / 공개 범위 사내 공개 ⚠️
```

## 5. 설계

### 5.1 권한 모델 — `PermissionRequest` hook

Claude Code 공식 문서 확인(hooks / permissions / permission-modes).

- 실행: `claude --permission-mode acceptEdits` (작업 폴더 내 편집은 자동), `--dangerously-skip-permissions` 제거
- 채널 폴더 `.claude/settings.local.json` 에 정책 주입
  - `permissions.allow` — 읽기 계열(Read/Glob/Grep/WebSearch/WebFetch), 안전한 Bash(`git status *`, `ls *` …), 두레이 MCP 조회 도구
  - `permissions.deny` — 절대 금지(`Bash(git push --force *)`, 작업 폴더 밖 쓰기, **운영 DB 쓰기 MCP 도구** 등)
  - **`permissions.ask`** — 사용자 전역 allow(`Bash(git:*)` 등)를 이기고 승인으로 끌어온다(P0 실측). 예: `Bash(git push *)`, `Bash(gh pr merge *)`, 두레이 쓰기 MCP 도구
  - 승인 대상 예 — 개발 DB 쓰기, 두레이 업무 생성·수정, 채널 공지(@Channel), Drop 게시, 서버 재기동·커넥터 재시작 (§2.5)
  - 나머지는 프롬프트 대상 → **`PermissionRequest` http hook** (`timeout: 600`)
- `PermissionRequest` 는 *프롬프트가 뜨려는 순간에만* 발화 → allow 규칙에 걸린 호출은 두레이로 오지 않는다
- 응답: `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"|"deny", "message"?, "updatedPermissions"?}}}`
  - `항상 승인` → `updatedPermissions` 로 `permission_suggestions` 를 `localSettings` 에 추가
  - 거절 사유 → `message` 로 Claude 에게 전달
- 정책 프리셋(설정 UI): `신중`(Bash 전부 승인) / `균형`(기본) / `자율`(현행 bypass, 경고 표시)

### 5.2 승인 브로커 (`ApprovalBroker`)

```
PermissionRequest hook ──HTTP(대기)──▶ HookServer(sync 경로) ─▶ ApprovalBroker.request()
                                                              ├─ 승인 카드 송신 + OS 알림
                                                              ├─ Socket Mode 로 내 답장 대기
                                                              └─ resolve → hook 응답 반환
```

- 채널당 대기 1건(Claude 는 순차 호출). 대기 중 그 채널의 **내 메시지**가 `승인|ㅇㅋ|ok` / `거절 [사유]|no` / `항상 승인` 이면 판정, 그 외 메시지는 일반 대화로 흘림
- 판정 후 카드 아래 결과 text(`✅ 승인됨` / `⛔ 거절됨: 사유` / `⏰ 시간 초과 — 거절`)
- 타임아웃은 **브로커가 hook timeout(600s)보다 먼저(570s) 명시적 deny** 를 돌려 "응답 없음 = 거절" 을 보장 (문서상 타임아웃 시 동작 미확정이라 의존하지 않는다)
- 입력 경로는 인터페이스로 분리(`ApprovalInput`) — 후속 버튼 릴레이는 같은 브로커에 입력원만 추가

### 5.3 진행 중계 (`ProgressReporter`)

- 턴 시작 시 진행 text 1개 송신, logId 보관 → 이후 **PUT 으로 갱신**
- 소스: `TodoWrite`(PostToolUse, todos 전체) 체크리스트 + 경과 시간. 없으면 경과 시간만
- **도구 사용 내역은 두레이에 내보내지 않는다** (진행·완료·글타래 모두). 기존 `— 사용 도구: …` 꼬리말도 제거
- 갱신 스로틀 ≥ 3초 · 내용 동일 시 생략 (rate limit 5 req/s, 버킷 20)
- 종료 시 `✅ 완료 · 3:12 ↓` / `⚠️ 중단됨` 으로 확정

### 5.4 결과 전달 (`ResultPublisher` + `DoorayFormatter`)

**DoorayFormatter (순수 함수)** — 마크다운 → 두레이 text
- ```` ```md ```` 감싸기 **폐기**
- 헤더 → `▍헤더`, 리스트 → `• `, 굵게/기울임 기호 제거, 링크·인라인코드·코드펜스(언어 지정) 유지
- 표 → 행마다 짧은 블록(`핵심값 · 부가값` 줄 + 설명 줄)으로 풀어 쓴다

**전달 정책**
| 응답 | 채널 | 글타래 |
|---|---|---|
| 짧음 (≤ 600자, 표·긴 코드 없음) | 완료 카드 + 본문 text | — |
| 김 / 표 포함 | 완료 카드 + 요약 3줄 | 메신저용으로 조판한 전문 |

- 요약 3줄: 응답 첫 문단/헤더에서 추출 (추가 AI 호출 없음)
- **글타래 가독성 규칙** (목업 ⑥): 한 메시지 = 한 주제(`▍제목`), 항목 하나 = 짧은 줄 2~3개 블록, 블록 사이 빈 줄, 맨 앞 줄에 핵심 값(시각·수치), 식별자는 인라인 코드. 좁은 글타래 폭에서 단어 중간이 꺾이지 않도록 줄을 짧게 유지
- 근본은 후처리보다 **에이전트가 처음부터 메신저용으로 쓰는 것** — 쓰는 규칙을 에이전트 기본 지식(§5.6)에 넣고, Formatter 는 안전망으로 둔다

### 5.5 선결 수정

- **턴 출처 태깅**: 멘션이 연 턴만 두레이로 회신. TUI 직접 입력 턴은 `UserPromptSubmit` 으로 감지해 회신 생략
- **busy 경쟁**: `checkBusy`~`markBusy` 사이 await 제거 (선점 후 수집)

### 5.6 에이전트 기본 지식 — "사내 시스템은 각자 만든 스킬로 쓴다"

사내 동료가 각자 Clauday 를 설치해 쓴다고 가정한다. **사용 방식(어느 프로젝트에, 어떤 공개 범위로, 어떤 파일명으로)은 사람마다 다르므로 Clauday 가 정하지 않는다.** 각자 개인 스킬(`~/.claude/skills/` — 사용자 범위라 채널 폴더 세션에서도 로드됨)로 만들어 두고 쓰는 방식이라는 것을 에이전트가 알고 있게 한다.

Clauday 가 채널 폴더에 넣는 것(`.claude/skills/`, spawn 시 버전 비교 후 동기화)은 **Clauday 자신의 일**만:

| 스킬 | 내용 |
|---|---|
| `dooray-reply` | 두레이 채널 에이전트라는 맥락, 메신저 렌더링 규칙(§3) 안에서 쓰는 법, 글타래 가독성 규칙 |
| `internal-systems` | 사내 시스템 지도 — "이런 요청엔 이 시스템, 연결은 여기" + 링크. 사용 정책은 담지 않는다 |

**`internal-systems` 의 Drop 항목** (요지)
- Drop = 사내 정적 HTML 호스팅, https://drop.nhncorp.com
- "drop 에 올려줘" 류 요청이 오면
  1. **사용자의 Drop 스킬이 있으면 그것을 따른다** (프로젝트·공개 범위·파일명은 그 스킬이 정한다)
  2. Drop MCP 가 없으면 올리지 않고 연결 방법을 안내 — drop.nhncorp.com 첫 화면 "MCP 연결 안내" 절차: `/plugin marketplace add https://drop.nhncorp.com/plugins/marketplace.json` → `/plugin install drop@drop` → `/mcp` 에서 drop → Authenticate. 2026-10-07 이전 발급 PAT 는 텍스트만 업로드 가능
  3. MCP 는 있는데 개인 스킬이 없으면, 이번 요청은 **프로젝트를 되물어** 처리하고(짐작 금지, 공개 범위 고지) **"자주 쓰면 내 Drop 스킬로 만들어 두라"** 고 권한다
- 플러그인 `drop@drop` 0.4.0 은 MCP 연결만 있고 스킬은 없다(2026-10-13 확인) — 쓰기 규칙은 MCP 서버 instructions 가 정본

**개인 스킬 템플릿 (선택)** — Clauday 스킬 화면에 "Drop 발행 스킬" 템플릿을 둔다. 사용자는 프로젝트·공개 범위·파일명 규칙만 채워 `~/.claude/skills/` 에 저장. 템플릿 본문에는 Drop MCP 계약상 지켜야 할 것만 둔다: 덮어쓰지 않기(새 경로), 20KB 경계, 외부 리소스 금지, `items[].url` 공유, `baseRevision`·`idempotencyKey`.

### 5.7 컨텍스트 수집 — 현황과 보강

**현황** (`ContextCollector.ts`, `index.ts:445`)
- 멘션이 온 채널의 최신 로그 `max(N,50)`개를 받아, 멘션 메시지부터 과거로 **N개(기본 50, 멘션 포함)**. 설정 키 `doorayMentionTrigger.windowSize` — UI 없음, 앱 재시작해야 반영
- 멘션 **이후** 메시지, **텍스트 없는 메시지(첨부만)** 는 버린다. 첨부 파일명·이미지는 컨텍스트에 안 들어간다
- **글타래 안 멘션**: 글타래는 별도 channelId 라 그 글타래 답글만 읽는다. **원글(부모 메시지)은 글타래 로그에 없다**(2026-10-13 실측: T5 글타래 로그 = 답글 1건뿐) → 글타래를 연 질문 자체를 에이전트가 못 본다
- **채널 멘션**: 채널 메시지에 달린 글타래 내용은 읽지 않는다 (채널 로그엔 원글 + `thread.channelId` 만)
- 멘션 메시지를 못 찾으면(`mentionIdx<0`) 최신 위치부터 잘라 멘션 이후 메시지가 섞일 수 있다
- 같은 세션에 재멘션하면 매번 N개를 새로 담아 `tasks/{logId}.md` 로 넘긴다 — 겹치는 대화가 반복 주입된다

**보강 (운영개발 채널 실측으로 우선순위 상향 — §2.5)**
1. **멘션 위치별 수집 범위**
   - 글타래 안 멘션 → `references.channelMap[ch].parentChannelId` 로 부모 채널에서 `thread.channelId == ch` 인 **원글** + **글타래 전체**(최대 100)
   - 채널 원글에 멘션 → 그 메시지 + 달린 글타래 전체
   - 채널 일반 멘션 → 현행(직전 N개), 글타래가 달린 메시지는 답글 수 표시
2. **주제 블록 자르기** — 긴 글타래는 주제가 섞인다. 멘션 직전 구간을 우선하고, 오래된 앞부분은 요약 대상으로 표시
3. **첨부** — 텍스트 없는 메시지도 `[첨부: 파일명]` 으로 남긴다. 이미지 다운로드(비전 입력)는 API 가능 여부 S0 확인 후
4. **링크 추적 힌트** — 업무·위키 URL(도메인 nhnent/nhncorp 혼재 정규화)을 목록으로 뽑아 프롬프트에 넣고, 내용은 에이전트가 두레이 MCP 로 읽게 한다
5. **비밀값 마스킹** — 비밀번호·토큰·접속 문자열 패턴을 `tasks/{logId}.md` 에 쓰기 전에 가린다
6. **긴 줄 절단** — 한 줄 2,000자 초과(백업 INSERT 등)는 앞부분만 남기고 `…(N자 생략)`
7. **재멘션 증분** — 직전 수집 이후 메시지만
8. 설정 UI 에 수집 개수 노출 + 재시작 없이 반영

### 5.8 노트북 슬립 / 오프라인

@clauday 는 **내 노트북의 Clauday 가 소켓으로 받고 내 PC 의 Claude Code 로 처리**한다. 슬립·종료·오프라인이면 처리할 수 없다 — 이건 구조상 한계로 받아들인다(상시 서버 실행은 별개 제품, 비목표).

문제는 지금 **슬립 중 멘션이 영구 유실**된다는 점이다. Socket Mode 는 연결 중인 메시지만 전달하고, 메신저 와처(`WatcherService`)에는 재연결 catch-up 이 있지만 멘션 경로엔 없다. 폰에서 `@clauday` 를 보내 두면 깨어나도 아무 일도 없다.

1. **재연결 catch-up (필수)** — 소켓 재연결 · `powerMonitor` `resume` 시
   - 마지막 연결 끊김 시각 이후 `updatedAt` 이 갱신된 채널만 골라(채널 목록 1회) 최신 로그를 훑고, **내가 보낸 미처리 `@clauday` 멘션**을 찾는다(처리한 logId 를 저장해 중복 방지)
   - 글타래는 부모 채널 로그의 `thread.lastUpdatedAt` 으로 갱신된 글타래만 추가 조회
   - 찾은 멘션은 진행 메시지에 `⏰ 노트북이 깨어나 {N}분 늦게 시작합니다` 를 붙여 처리
   - **오래된 멘션(기본 3시간 초과)은 실행하지 않고 안내만** 한다 — 상황이 바뀌었을 수 있다. "답장으로 실행 확인" 은 답장 대기 장치가 필요해 S4 승인 브로커와 함께 붙인다
   - rate limit 대비: 채널 조회 동시 3개, 429 백오프 (스펙 권장)
2. **깨어 있기 (기본 켬)** — 대표 사용 상황은 "외출 중, 노트북은 **충전 중 + 덮개 열림**" (2026-10-13 사용자 확인)
   - 이 상태의 macOS 는 대개 시스템이 잠들지 않고 **화면만 꺼진다** (사용자 노트북 실측: AC `sleep 0`, `displaysleep 10`). 그런데 화면이 꺼진 동안 **App Nap** 이 보이지 않는 앱의 타이머를 늦춰 소켓 ping(30초)이 밀리면 연결이 끊길 수 있다. 지금 Clauday 는 아무 전원 assertion 도 잡지 않는다
   - 봇이 켜져 있고 **전원 연결 중이면** `powerSaveBlocker('prevent-app-suspension')` 를 잡는다(App Nap + 유휴 잠자기 방지, 화면 꺼짐은 허용). `powerMonitor` `on-ac`/`on-battery` 로 켜고 끈다 — 배터리로 바뀌면 해제(`sleep 1` 설정 존중)
   - 설정 화면·봇 배지에 "깨어 있기 중" 표시, 끄는 토글 제공
   - 덮개를 닫으면 이것으로도 잠든다(클램쉘 모드 제외) — 설명에 명시
   - 실측 과제: 화면 잠금 + 화면 꺼짐 30분 뒤 폰에서 `@clauday` → 처리되는지, 소켓 끊김 로그 유무
   - 비교: 같은 조건에서 launchd 예약 `claude -p`(매일 7:01·12:01)는 잘 돈다 — 시스템은 깨어 있다는 뜻. 차이는 @clauday 가 **수 시간 살아 있어야 하는 소켓**으로 이벤트를 받는다는 점. 실패 지점은 claude 실행이 아니라 수신 쪽
3. **소켓 연결 이력 기록** — 지금은 콘솔에만 찍혀 끊김을 사후 확인할 수 없다. `userData/logs/bot-socket.log`(JSONL)에 연결·끊김(코드·사유)·재연결·catch-up 결과를 남기고, 설정 화면에 "최근 24시간 연결 끊김 N회" 표시
4. **상태 가시성** — 두레이에서 보낸 멘션이 처리되지 않을 때 사용자가 알 방법이 없다. 멘션을 받은 즉시 진행 메시지(§5.3)가 뜨므로 "진행 메시지가 안 뜨면 노트북이 꺼져 있는 것" 이라는 걸 온보딩/`dooray-reply` 안내에 적는다

## 6. 모듈 / 변경 지점

| 위치 | 변경 |
|---|---|
| `dooray/MessengerService.ts` | `updateMessage` · `deleteMessage` · `createThreadAndSend` · `sendCard(attachments)` · tenantId 캐시 |
| `dooray/mention/MentionCatchUp.ts` (신규) | 재연결·resume 시 미처리 멘션 수집, 처리 logId 저장, 오래된 멘션 확인 (§5.8) |
| `index.ts` | `powerMonitor` resume 연결, 잠자기 방지 토글 (§5.8) |
| `dooray/mention/ContextCollector.ts` | 글타래 원글 포함 · 첨부 표시 · 재멘션 증분 (§5.7) |
| `dooray/mention/HookServer.ts` | `permission_request` 는 결정 응답을 기다리는 **동기 경로** (나머지는 현행 즉시 200) |
| `hooks/ClaudeHookRouter.ts` | `decide(ev): Promise<HookDecision \| null>` 추가 |
| `claude/claudeDirSetup.ts` | `permissions` 정책 + `PermissionRequest`/`UserPromptSubmit` hook 주입, matcher 확장 |
| `dooray/mention/MentionTerminalSpawner.ts` | `--permission-mode acceptEdits` |
| 신규 `dooray/mention/agent/` | `ApprovalBroker` · `ProgressReporter` · `ResultPublisher` · `DoorayFormatter` · `AgentCardBuilder` |
| 신규 `resources/agent-skills/` | `dooray-reply` · `internal-systems` 스킬 원본 + 채널 폴더 동기화(`AgentWorkspaceManager`) |
| 스킬 화면 | "Drop 발행 스킬" 개인 템플릿 (선택) |
| `shared/types/` | `AgentPolicy`, `ApprovalRequest`, 카드 타입 |
| 설정 UI | 에이전트 섹션: 승인 프리셋 · 번들 스킬 상태(버전) |
| 온보딩 | `tours.ts` 에이전트 단계(승인 답장 방법) |

## 7. P0 검증 — 결과 (2026-10-13, Claude Code 2.1.296 실측)

임시 hook 수신 서버 + PTY 로 띄운 claude TUI(`--permission-mode acceptEdits`)로 확인. ⚠ 시험 경로를 `/tmp` 에 두면 Claude Code 가 임시 폴더 쓰기를 자동 허용해 프롬프트가 안 뜬다 — 재현은 홈 아래 경로로.

| # | 항목 | 결과 | 설계 반영 |
|---|---|---|---|
| 1 | `PermissionRequest` 무응답·타임아웃 | **TUI 다이얼로그가 hook 대기와 동시에 뜬다.** hook 이 끝내 응답 없으면 다이얼로그가 그대로 남는다(자동 허용 없음). `Notification(permission_prompt)` 은 약 6초 뒤 발화 | 브로커가 570초에 명시 deny 를 돌려 "무응답 = 거절" 보장. 다이얼로그는 사람이 TUI 에서도 답할 수 있는 안전망 |
| 2 | TUI 로컬 응답과 경합 | **먼저 온 답이 이긴다.** TUI 에서 승인하면 도구가 바로 실행되고, 대기 중이던 hook HTTP 요청은 **끊긴다**(서버 쪽 쓰기 시 Broken pipe) | HookServer 가 요청 소켓 `close` 를 감지 → 브로커가 승인 카드 후속 text `🖥 PC 에서 처리됨` 으로 마감, 대기 해제 |
| 3 | TodoWrite payload | **2.1.296 에는 TodoWrite 도구가 없다**(에이전트 응답: "이 세션엔 TodoWrite 도구가 없어") | 진행 체크리스트 소스를 Task 계열 도구로 — S2 착수 시 도구 이름·payload 재확인. 없으면 경과 시간 + 단계 문구만 |
| 4 | 자기 멘션 푸시 | 미확인 — 사용자 기기에서 관찰 필요 | OS 알림(MentionNotifier)을 기본으로 |
| 5 | `항상 승인` | `permission_suggestions` 를 `updatedPermissions` 로 돌려주면 **채널 폴더 `settings.local.json` allow 에 규칙이 영구 추가**됨 | 그대로 사용. 규칙이 쌓이는 파일 = 채널 폴더 |
| 6 | `acceptEdits` 의 작업 폴더 밖 쓰기 | **프롬프트 대상** (제안: `addDirectories`) | 폴더 밖 쓰기는 자동으로 승인 흐름에 들어온다 |
| 7 | 채널 폴더 스킬 로드 | ✅ `.claude/skills/` 스킬 로드 확인 | 번들 스킬 배포 방식 확정 |
| 8 | 메신저 첨부 다운로드 | ✅ `GET https://file-api.dooray.com/downloads/messenger/v1/channels/{ch}/files/{fileId}?media=raw` (api.dooray.com 은 307 로 여기를 가리킴 — **리다이렉트 시 인증 헤더 재첨부 필요**). 메시지는 `type: FILE`, `file.id`·`mimeType`·`thumbsJson` | 스크린샷을 비전 입력으로 넘길 수 있다 (§5.7-3) |
| 9 | 글타래 → 원글 | 글타래 채널 메타 API 없음(404). 부모 채널 로그에서 `thread.channelId` 일치 검색만 가능, 1회 최대 1,000개 | `threadChannelId → 원글` 캐시, 못 찾으면 회신에 "원글을 찾지 못함" 명시 |
| + | **사용자 전역 allow 규칙 누수** | 사용자 `~/.claude/settings.local.json` 의 `Bash(git:*)`·`Bash(gh:*)`·`Bash(curl:*)` 등이 채널 세션에도 적용돼 승인 없이 통과 | 채널 폴더에 **`permissions.ask` 규칙**(`Bash(git push *)` 등)을 넣으면 전역 allow 보다 우선해 프롬프트가 뜬다 — **실측 확인** (ask 규칙 매치 시 `permission_suggestions` 는 null) |
| + | 거절 사유 전달 | `decision.message` 가 Claude 에게 그대로 전달("두레이에서 거절됨: …") | 그대로 사용 |
| + | 인용 답장 | 메시지 `type: REPLY` + `originalLog.id` 로 원문 참조 | 컨텍스트 수집 시 인용 원문을 함께 넣는다 |

## 8. 진행 현황 (feat/version-2.1.0)

| 단계 | 상태 | 비고 |
|---|---|---|
| S0 | ✅ 2026-10-13 | §7 |
| S1 | ✅ 구현 | DoorayFormatter · 완료 카드 · 긴 답 글타래(카드 = 글타래 원글, 실측 확인) · 턴 출처 태깅 · 컨텍스트 1~6 · busy 선점 |
| S2 | 🟡 일부 | 슬립 catch-up · 깨어 있기 · 소켓 이력 ✅ / 진행 메시지는 시작·완료 2단계만(작업 중 갱신은 TodoWrite 부재로 데이터 소스 재선정 후) |
| S3 | ⬜ | 번들 스킬 |
| S4 | ⬜ | 승인 브로커 — 그때까지 `--dangerously-skip-permissions` 유지 |

## 8-1. 단계 계획

| 단계 | 내용 | 독립 출시 |
|---|---|---|
| S0 | P0 검증 | — |
| S1 | DoorayFormatter + 완료 카드 + 글타래 조판 + 턴 출처 태깅 + **컨텍스트 수집 1~6**(원글·글타래 전체·첨부 표시·링크 힌트·마스킹·긴 줄 절단) | ✅ (형식 깨짐 + 원글 누락 동시 해소) |
| S2 | ProgressReporter + **슬립 catch-up · 깨어 있기**(§5.8-1·2) | ✅ |
| S3 | 번들 스킬(`dooray-reply` · `internal-systems`) + 동기화 + 컨텍스트 수집 7~8 | ✅ |
| S4 | 권한 정책 + ApprovalBroker + 설정 프리셋 + 온보딩 | ✅ |

## 9. 함께 고칠 버그

### B1. 터미널 ⌘클릭 파일 링크 — 툴팁은 뜨는데 클릭해도 안 열림 (2026-10-13 보고 · ✅ 수정)

- **확정 원인**: `ptyMouseSuppression.ts` 가 `terminal.element` 캡처 단계에서 mousedown 을 끊어 `.xterm-screen` 의 Linkifier 가 "누른 링크" 를 기억하지 못함 → mouseup activate 판정 실패. `.xterm-screen` 버블 단계로 옮겨 해결(아래 가설은 기록으로 남김).

- **증상**: Claude Code TUI 출력 속 상대 경로(`docs/mockups/agent/dooray-agent-flow.html`)에 ⌘ hover 하면 절대경로 툴팁은 정상 표시, ⌘클릭 시 파일 탭이 열리지 않는다.
- **정상인 부분**: 경로 해석·존재 검증(`resolveFileLinkCandidates`) — 툴팁에 절대경로가 나온다는 건 link 가 등록됐다는 뜻.
- **가설**: 화면에 `Jump to bottom (click)` 이 보이는 상태 = Claude Code TUI 가 **마우스 트래킹(DECSET 1000/1002/1006)** 을 켠 상태. xterm 이 mousedown/up 을 PTY 로 보내면서 linkifier 의 `activate` 가 호출되지 않는 것으로 추정. hover 는 xterm 내부 처리라 툴팁만 산다.
- **확인 방법**: 같은 경로를 일반 셸(`echo docs/...`)에서 ⌘클릭 → 열리면 가설 확정. TUI 안에서 `terminal.modes.mouseTrackingMode` 값 로깅.
- **수정 방향 후보**: 마우스 트래킹 중이라도 ⌘(meta) 가 눌린 클릭은 PTY 로 보내지 않고 링크 활성화로 가로챈다 (`filePathLinkProvider.ts` `activate` / `TerminalPane.tsx` 마우스 이벤트 캡처 단계). URL 링크(`addon-web-links`)도 같은 증상인지 함께 확인.
- **관련 코드**: `src/renderer/src/components/Terminal/links/filePathLinkProvider.ts:108`, `TerminalView.tsx:1055` (`handleTerminalPathOpen`), v2.0.6 커밋 `7bcf2c3`.

## 10. 리스크

- **Rate limit** — 진행 갱신 + 카드 + 글타래가 겹치면 버킷 소진. 송신 큐 1개로 직렬화 + 429 백오프
- **Drop 공개 범위** — 프로젝트 기본이 사내 공개. 개인 스킬이 없을 때 에이전트는 공개 범위를 반드시 고지한다
- **안내 표류** — Drop 연결 절차가 바뀌면 `internal-systems` 안내가 틀린다. 확인 기준일과 출처(drop.nhncorp.com MCP 연결 안내)를 적고, 앱 업데이트로 갱신한다
- **승인 피로** — 프롬프트가 잦으면 결국 `자율` 로 간다. `항상 승인` 이 규칙으로 누적되게 해 같은 질문을 반복하지 않는다
- **오답 신뢰** — 채널에 LLM 오답 전례가 있다. `dooray-reply` 에 "근거(파일:라인·조회 결과) 없는 단정 금지" 를 넣는다
- **비밀값 재유출** — 채널에 평문 비밀값이 있다. 수집 단계 마스킹 + 회신 단계에서도 재인용 금지
- **채널 메시지 오인** — 대기 중 "승인" 이 일반 대화일 수 있다. 판정 키워드는 단독 메시지만 인정
