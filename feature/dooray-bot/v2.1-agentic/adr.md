---
task: v2.1-agentic
domain: dooray-bot
created: 2026-10-13
status: accepted
---

# ADR — @clauday 에이전트 강화 (v2.1)

실측 근거의 원본은 `docs/planning/clauday-agent-plan.md` §3(두레이 렌더링)·§7(S0, Claude Code 2.1.296).

## ADR-v2.1-agentic-01 — 실행 방식은 TUI(PTY) 유지
- 결정: 멘션은 지금처럼 PTY 의 대화형 claude 로 처리하고, 구조화 이벤트는 hook 으로 받는다.
- 이유: `claude -p`/SDK 는 2026-06-15 부터 별도 크레딧. hook(UserPromptSubmit·PreToolUse·PermissionRequest·Stop)만으로 필요한 이벤트가 다 온다.
- 기각: stream-json(-p) 전환.

## ADR-v2.1-agentic-02 — 두레이 회신 렌더링
- 결정: 마크다운을 두레이용 평문으로 바꾼다(`DoorayFormatter`). 카드는 불변으로 다룬다. 긴 답은 `create-and-send` 로 **완료 카드를 글타래 원글**로 만들고 전문을 그 글타래에.
- 근거(실측): text 는 인라인 코드·링크·언어 코드블록만 렌더 / 카드 안은 완전 평문, 링크는 titleLink 만 / `PUT` 은 attachments 를 서버에서 지움 / `create-and-send` 는 attachments 를 원글로 받음 / 메신저 첨부 업로드는 API 토큰으로 불가.
- 결과: 진행 표시는 text 메시지 1개를 PUT 으로 갱신(카드 아님).

## ADR-v2.1-agentic-03 — 두레이 승인 (A안, 답장) · ⚠️ ADR-08 로 대체됨
- 결정: `--permission-mode acceptEdits` + 채널 폴더 `permissions.ask` 정책 + `PermissionRequest` http hook(timeout 600). `ApprovalBroker` 가 카드를 보내고 같은 채널의 내 단독 답장(승인/거절 [사유]/항상 승인)으로 결정, 570초에 명시 거절.
- 근거(실측): PermissionRequest 는 TUI 다이얼로그와 **동시에** 뜨고 먼저 온 답이 이긴다(PC 에서 답하면 hook 요청이 끊김) / 무응답이면 자동 허용 없이 다이얼로그가 남음 / `updatedPermissions` 로 돌려준 규칙은 채널 폴더 `settings.local.json` allow 에 영구 저장 / 사용자 전역 allow(`Bash(git:*)`)가 채널 세션에도 적용되지만 채널 `ask` 규칙이 이긴다.
- 결과: `writeHookSettings` 는 hooks 만 새로 쓰고 permissions.allow·deny 는 **합친다**(덮으면 "항상 승인" 이 사라짐). 사람이 TUI 에 직접 친 턴은 결정하지 않는다(그 자리 사람이 답함). 권한 모드 '자율' 은 예전 `--dangerously-skip-permissions`.
- 기각: 버튼(B안) — 클릭이 `commands/{commandId}/action` 으로 가서 커맨드 앱 + 사내 릴레이 서버가 필요. 같은 브로커의 `onReply` 자리에 입력원만 추가하면 된다.

## ADR-v2.1-agentic-04 — 진행 표시 데이터 소스 = 도구 이벤트
- 결정: PreToolUse 도구 이름을 사람이 읽는 단계("코드 확인 중", "두레이 조회 중")로 바꿔 진행 메시지에 쓴다. 세부(파일명·명령)는 내보내지 않는다(D5). 5초 스로틀, 60초 heartbeat, 승인 대기 시 "🟧 두레이 승인 대기 중".
- 근거(실측): 2.1.296 대화형 세션에 할 일 목록 도구(TodoWrite/Task*)가 노출되지 않음.
- 결과: 완료 표기가 늦게 도착한 갱신에 덮이지 않도록 `ProgressReporter.stop` 이 보내는 중인 PUT 을 기다린다.

## ADR-v2.1-agentic-05 — 사내 시스템은 개인 스킬로, Clauday 는 지도만
- 결정: 채널 폴더에 `dooray-reply`(회신 규칙)·`internal-systems`(Drop 등 사내 시스템 지도·연결 안내)만 동기화한다. 사용 정책은 사용자 개인 스킬(`~/.claude/skills`).
- 근거: Drop 은 MCP 전용(revision 잠금·멱등 키·20KB 분기·덮어쓰기 확인·호환성 검사·기본 사내 공개)이라 자동화가 무겁고, 프로젝트·공개 범위는 사람마다 다르다. 플러그인 `drop@drop` 0.4.0 은 MCP 만 있고 스킬은 없다. 연결 절차의 원본은 drop.nhncorp.com "MCP 연결 안내".

## ADR-v2.1-agentic-06 — 컨텍스트 수집
- 결정: 글타래 멘션은 글타래 답글 전체 + 부모 채널에서 `thread.channelId` 일치로 찾은 원글(200 → 1000개, 캐시). 첨부 이미지는 `file-api.dooray.com/downloads/messenger/v1/channels/{ch}/files/{id}?media=raw` 로 받아 채널 폴더 `attachments/`. 비밀값 마스킹, 2,000자 초과 줄 절단, 인용 답장 원문 포함.
- 근거(실측): 글타래 메타 API 없음(404), 글타래 로그에 원글 없음, 운영 채널 메시지 54% 에 글타래.

## ADR-v2.1-agentic-07 — 외출 중 동작
- 결정: 봇 연결 + 전원 연결 시 `powerSaveBlocker('prevent-app-suspension')`(배터리면 해제). 생존 시각을 1분마다 저장하고 소켓 ACTIVE 시 그 이후 갱신된 채널·글타래에서 내 미처리 멘션을 찾아 실행(처리 logId 500개 기록으로 중복 방지). 3시간 초과는 안내만. 소켓 이력을 `userData/logs/bot-socket.log`(JSONL)에.
- 근거: 사용자 노트북 AC `sleep 0` — 충전 중엔 시스템이 안 자고 화면만 꺼진다. 위험은 App Nap 의 ping 지연. launchd `claude -p` 예약 작업은 같은 조건에서 잘 돈다(시스템은 깨어 있음).

## ADR-v2.1-agentic-08 — 권한 확인 없이 실행 + 위험 동작만 PreToolUse 승인 (ADR-03 대체)
- 계기(실기 확인 2026-10-13): acceptEdits + PermissionRequest 구조에서 `mdfind`·`wc`·`shasum` 같은 읽기 명령까지 승인 카드가 연달아 떴다. 백그라운드 하위 에이전트의 권한 요청은 메인 턴이 끝난 뒤라 두레이로 안 가고 PC 다이얼로그에만 남아 "멈춤" 으로 보였다.
- 결정: claude 는 항상 `--dangerously-skip-permissions`. 멘션 채널 PreToolUse http hook(timeout 600)을 **동기**로 받아 `DangerGate.classifyDanger` 에 걸리는 것만 `ApprovalBroker` 로 두레이 승인, 결과를 `permissionDecision` allow/deny 로 돌려준다. 나머지는 즉시 `{}`.
- 근거: 공식 문서 — PreToolUse 의 deny 는 bypassPermissions/skip 모드에서도 도구를 막는다. 타임아웃된 PreToolUse 는 막지 않으므로 브로커가 570초에 명시 거절. 카드를 못 보내면 거절(결정을 비우면 위험 동작이 그냥 실행된다).
- "항상 승인" 은 Claude Code 설정 파일이 아니라 `AlwaysAllowStore`(채널별 서명)에 기억한다. 판정을 앱이 하므로 권한 모드 변경이 이미 떠 있는 claude 에도 즉시 적용된다.
- 멘션 턴이 끝나도 사람이 TUI 에 직접 치기 전까지 채널은 "멘션 소유" 로 남는다(`MentionTurnTracker.last`) — 백그라운드 작업의 위험 동작 승인과 뒤늦은 응답이 같은 자리로 간다.
- 결과: `DEFAULT_MENTION_POLICY`·PermissionRequest hook·acceptEdits 분기 삭제. 예전 빌드가 채널 폴더에 넣은 `permissions.ask` 는 다음 멘션 때 걷어 낸다.

## ADR-v2.1-agentic-09 — 승인 입력은 반응(이모지), 버튼은 쓰지 않는다
- 계기(2차 실기 2026-10-14): Drop 업로드 1건에 승인 카드 4장·메시지 22개. 사용자가 버튼 승인을 원함.
- 실측: 버튼 클릭은 웹 클라이언트가 **카드의 `commandId`·`appId`** 로 `POST /messenger/v1/api/commands/{commandId}/action` 을 부른다. 값이 없거나 가짜면 두레이 500(HTML), 실제 앱이면 채널 미등록 시 `INTEGRATION_COMMAND_NOT_REGISTERED_IN_CHANNEL_ERROR`, 등록 시 두레이가 앱 **requestUrl** 로 전달(실패하면 클릭한 사람에게만 오류 토스트). 앱의 Request URL 은 두레이 서버가 health-check 로 직접 호출해 통과해야 저장된다. **어느 경우도 채널·메시지에 흔적이 남지 않는다.**
- 결정: Clauday 는 설치형으로 각자 PC 가 기준이라 두레이가 닿는 상시 서버(requestUrl)를 둘 수 없다 → 버튼 불가. 메시지 `reactions[{value, memberIds}]` 를 REST 로 읽을 수 있으므로 **카드에 내가 누른 ✅(승인)·❌(거절)·👌(항상 승인)** 를 3초 주기로 확인한다(답장도 유지). 판정 뒤 카드를 지우고 결과 한 줄만 남긴다.
- 함께: "항상 승인" 은 MCP 쓰기를 서버·분류 단위로 기억(Drop 여러 단계가 한 작업), Drop 은 실제 공개·삭제 단계만 승인, 카드 문구는 기술 값(멱등 키·해시·세션 id) 대신 사람 말, 짧은 답은 진행 메시지에 고쳐 쓴다.
- 기각: 커맨드 앱 + 공용 중계 서버(설치형·로컬 원칙 위배), Clauday 안에 두레이 웹을 띄워 클릭 요청 가로채기(폰에서 안 됨).
