---
id: ADR-feedback-to-agent-01
title: 피드백 송신 채널 = 두레이 Incoming Hook (built-in URL via env)
status: accepted
date: 2026-05-22
supersedes: []
domain: electron-ipc, ai-service-adjacent
---

# 피드백 송신 채널 = 두레이 Incoming Hook (built-in URL via env)

## 컨텍스트

피드백 (오류 / 기능요청 / 개선) 을 사용자가 보냈을 때 어디로 가야 하는가? 4 가지 후보:

1. 두레이 task 생성 (현 방식 — Clauday 커뮤니티 프로젝트)
2. 사용자 두레이 토큰 → 메신저 채널 직접 송신 (`MessengerService.sendMessage`)
3. **두레이 Incoming Hook URL 로 POST** (Ultra Agent 채널)
4. 자체 Relay 서버

## 결정

**옵션 3**: 빌드 시 `VITE_FEEDBACK_HOOK_URL` 환경변수로 Incoming Hook URL 을 박아두고, `FeedbackService` 가 `fetch` 로 직접 POST.

## 대안과 기각 이유

1. **두레이 task 생성 (현 방식)** — *기각*: Ultra 가 그 프로젝트 webhook 수신 안 되면 사람이 직접 봐야 함. 사이클 길어짐. 게다가 *사람 글쓰기 톤* 으로 보여 Ultra 가 "처리 대상" 인지 인식 어려움.
2. **사용자 토큰 메신저 송신** — *기각*: Ultra 입장에서 "사용자가 직접 친 메시지" 로 보임 (sender = 사용자). Ultra 의 처리 분기가 흐려짐 + 사용자 권한에 의존.
3. **자체 Relay 서버** — *기각*: 인프라 운영 비용. 작은 데스크탑 앱에 과함. 미래에 *피드백 집계 / 분류 / 통계* 필요해지면 그때 검토.

## 결과 (Consequences)

### 긍정
- Ultra 채널에 봇 메시지로 명확히 식별 (botName: "Feedback" + 카테고리별 색상 attachment)
- 빌드 시 secret 한 번 박으면 끝 — 사용자 설정 단계 없음
- 송신 코드가 단순 (fetch POST)
- forward-issue-to-ultra.yml 의 curl 패턴과 일관 (Ultra 입장에서 같은 형태로 들어옴)

### 부정 / 트레이드오프
- Hook URL 이 빌드 결과물에 들어감. 누설 시 *외부에서 채널에 도배 가능* (수신은 못 함, 송신만). 큰 사고는 아니지만 채널 청결도 영향.
- Vite 의 `VITE_` env 는 *렌더러 번들* 에 들어감. main 에서만 쓰려면 다른 방식 (`process.env.X` + electron-vite 의 main 빌드 정의) 필요.

### 모니터링
- Ultra 채널에서 `botName: "Feedback"` 일일 송신 수 트렌드
- 비정상 트래픽 (단시간 다량) 감지 시 → 빌드 식별자 + 사용자 식별자로 추적 → 필요시 URL 회전

## 환경변수 처리 — 세부

- 변수명: `VITE_FEEDBACK_HOOK_URL` (Vite 가 renderer 번들에 박지만, 우리는 main 에서 쓸 거라 사실 prefix 불필요. 통일성 위해 유지하거나 `FEEDBACK_HOOK_URL` 단순화 가능 — engineer 가 plan.md Phase 1 에서 결정).
- 개발 환경: `.env.local` (gitignored, 이미 .gitignore 에 `.env.local` 포함)
- 빌드 환경 (GitHub Actions release.yml): `env: VITE_FEEDBACK_HOOK_URL: ${{ secrets.DOORAY_ULTRA_HOOK_URL }}` step 에 주입
- 미설정 시 — 빈 문자열. FeedbackService 가 송신 거부 + 클립보드 fallback 노출.

## 페이로드 스키마

Dooray Incoming Hook 표준 (`{ botName, botIconImage, text, attachments }`):

```jsonc
{
  "botName": "Feedback",
  "botIconImage": "https://...",  // 카테고리별 아이콘 (옵션)
  "text": "[<카테고리>] <제목>",  // 예: "[🐞 오류] 브리핑 응답이 비어있음"
  "attachments": [
    {
      "title": "사용자",
      "text": "임태원 (taewon.lim@nhndooray.com) · Clauday v1.6.0 · darwin",
      "color": "#666"
    },
    {
      "title": "내용",
      "text": "<사용자 본문>",
      "color": "blue|green|orange"  // 카테고리별
    },
    // 오류 카테고리만:
    {
      "title": "진단",
      "text": "<collect 결과 — 로그 경로 + claude --version + CLI 호출 직전 argv 등>",
      "color": "red"
    },
    {
      "text": "@ultra 위 피드백 검토 후 작업 가치 있으면 브랜치 따서 PR 올려주세요. 카테고리: <카테고리>",
      "color": "green"
    }
  ]
}
```

색상 규칙:
- bug → 본문 attachment 색상 `orange`, 진단 `red`
- feature → 본문 `blue`
- improvement → 본문 `green`

## 참조

- prd.md (이 디렉토리)
- 기존 `ErrorReportService.collect()` 의 진단 데이터 형식 — `src/main/error-report/ErrorReportService.ts`
- Dooray Incoming Hook 명세 — `https://helpdesk.dooray.com/share/pages/9wWo-xwiR66BO5LGshgVTg/2900083336524592342`
