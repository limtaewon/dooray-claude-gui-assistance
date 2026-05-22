# Ultra Agent 온보딩 — 핸드오프

## 1. GitHub Issue → 채널 자동 송신 워크플로 설치

이 디렉토리의 `forward-issue-to-ultra.yml` 을 `.github/workflows/` 로 복사해야 합니다. (이번 PR 의 OAuth 토큰에는 `workflow` 스코프가 없어서 자동 push 불가.)

### 옵션 A: 웹 UI 로 추가 (가장 빠름)
1. https://github.com/limtaewon/dooray-claude-gui-assistance 에서 "Add file" → "Create new file"
2. 경로: `.github/workflows/forward-issue-to-ultra.yml`
3. `handoff/ultra-agent/forward-issue-to-ultra.yml` 의 내용 복사 붙여넣기
4. 직접 main 에 commit (단발 변경이면 OK) 또는 별도 PR

### 옵션 B: 로컬에서 워크플로 스코프 토큰으로 push
1. https://github.com/settings/tokens 에서 PAT 생성 시 `workflow` 스코프 체크
2. 그 토큰으로 git push
3. `mv handoff/ultra-agent/forward-issue-to-ultra.yml .github/workflows/ && git add . && git commit --amend && git push --force-with-lease`

## 2. GitHub Secret 등록 (워크플로 동작 전 필수)

https://github.com/limtaewon/dooray-claude-gui-assistance/settings/secrets/actions

- Name: `DOORAY_ULTRA_HOOK_URL`
- Value: 두레이 메신저 "울트라 에이전트[ultra]" 채널의 Incoming Hook URL

## 3. 두레이 "업무 등록 → 채널 자동 송신" 설정 (선택)

GitHub Issue 외에 두레이 태스크도 트리거하려면 두레이에서 직접 설정:

1. 대상 두레이 프로젝트 → 설정 → 업무 → 웹훅 → 웹훅 추가
2. 사용 여부: 사용 함
3. 웹훅 URL: 같은 Incoming Hook URL
4. 발송 메시지 포맷: Dooray!, 버전 v2
5. 알림 항목: ☑ 업무 등록 (다른 건 끔)

## 4. Ultra Agent VM 1회 부팅

VM 안에서:

```bash
# 레포 클론
gh repo clone limtaewon/dooray-claude-gui-assistance
cd dooray-claude-gui-assistance

# 의존성 (native 모듈 자동 rebuild)
npm install

# 빌드/테스트 정상성
npx tsc --noEmit
npm test

# Claude Code 가 본 레포의 .claude/ 를 자동 인식
# (~/.claude/ 의 글로벌 설정과 별도. 본 레포 안에서 claude 실행하면 .claude/agents/, .claude/skills/ 가 보임)

# 첫 진입
cat .agent/CLAUDE-AGENT.md
```

## 5. 운영 시작

채널에 새 메시지 (GitHub Issue/두레이 태스크/직접 멘트) 가 도착하면:
- Ultra Agent (Claude Code on VM) 가 메시지를 읽음
- `.agent/CLAUDE-AGENT.md` §3 의 표준 절차 진행
- PRD/ADR 작성 → 구현 → 테스트 → PR 생성
- 채널에 PR URL 회신
- 사용자가 검토 후 머지

## 6. 첫 회 사용 권장 패턴

처음 한 번은 *작은* 이슈 (오타 수정 / docs 줄 추가) 로 워크플로우 검증:

1. GitHub Issue 생성 → `README.md 어딘가 오타: "Clauady" → "Clauday"`
2. Ultra Agent 가 채널에 도착한 이슈 보고 → L0 작업 → 직접 패치 + PR
3. 머지

기대 시간: 약 5분 안 (작은 변경이면). 이것이 잘 돌면 더 큰 작업 점차 위임.
