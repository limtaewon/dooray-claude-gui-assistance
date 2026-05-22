---
task: feedback-to-agent
date: 2026-05-22
---

# Plan — 피드백 시스템 구현 단계

> Ultra Agent 가 본 plan 의 체크박스를 1개씩 처리. 완료된 항목은 `[x]` 로 마킹.
> 브랜치: `feat/feedback-to-agent` (Ultra 가 생성)
> 목표 PR: 단일 (Phase 1~4 모두 한 PR)
> 최종 버전: **1.6.0**

## Phase 0 — 사전 조사 (architect 단계는 본 PRD/ADR 로 대체, 추가 조사만)

- [ ] 단축키 충돌 검사:
  ```bash
  grep -rn "Cmd+Shift+B\|Cmd\\+Shift\\+B\|metaKey.*shiftKey.*'b'\|key === 'b'.*shift" src/renderer/ 2>/dev/null
  ```
  - 충돌 시 → `Cmd+Shift+F` (Feedback) 로 fallback. plan 갱신 (impl-log 에 결정 기록).
- [ ] 사이드바 위치 확인:
  ```bash
  grep -rn "Sidebar\b" src/renderer/src/components/ | head
  ```
  - "피드백" 버튼 들어갈 자리: 하단 (theme toggle 등이 있는 영역과 동거)
- [ ] 기존 `ErrorReportProvider` 의 Context shape 정독 — useErrorReport 의 `{ open }` API 그대로 유지해야 역호환.
- [ ] `ClaudeManual.tsx` 의 `SECTIONS` 배열 구조 확인 — 새 섹션 추가 위치.

## Phase 1 — main 측 (`main-process-engineer`)

### 1-1. 공유 타입
- [ ] `src/shared/types/feedback.ts` 신규:
  ```ts
  export type FeedbackCategory = 'bug' | 'feature' | 'improvement'
  export interface FeedbackPayload {
    category: FeedbackCategory
    subject: string          // 한 줄 제목
    userNote: string         // 사용자 본문
    diagnostic?: string      // bug 카테고리만. ErrorReportService.collect() 의 body
    appVersion: string       // main 에서 자동 채움
    platform: NodeJS.Platform  // main 에서 자동
    userEmail?: string       // 두레이 토큰의 본인 이메일 (있으면)
  }
  export interface FeedbackSubmitResult {
    ok: boolean
    error?: string
    /** 미설정 / 빈 환경변수 등 클라이언트 측 사유 */
    reason?: 'hook-url-missing' | 'network-error' | 'http-error'
  }
  ```

### 1-2. FeedbackService
- [ ] `src/main/feedback/FeedbackService.ts` 신규:
  - `submit(payload: FeedbackPayload): Promise<FeedbackSubmitResult>`
  - hook URL 출처: `process.env.VITE_FEEDBACK_HOOK_URL || process.env.FEEDBACK_HOOK_URL`
    > engineer 결정: Vite prefix 유지 (main 도 같은 env 참조하면 일관) vs 분리. 단순 통일 권장.
  - URL 빈 문자열 → `{ ok: false, reason: 'hook-url-missing' }` 즉시 반환
  - payload → Dooray Incoming Hook 포맷 (ADR §"페이로드 스키마")
  - `fetch(hookUrl, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(...) })`
  - 응답 비-2xx → `{ ok: false, reason: 'http-error', error: statusText }`
  - 네트워크 에러 → `{ ok: false, reason: 'network-error', error: err.message }`

### 1-3. 단위 테스트
- [ ] `src/main/feedback/FeedbackService.test.ts`:
  - `vitest-patterns` SKILL 의 fetch mock 방식 — `vi.stubGlobal('fetch', vi.fn())` 권장
  - 성공 케이스 (200) — 페이로드 검증
  - HTTP 실패 (500) — result.reason === 'http-error'
  - 네트워크 에러 — result.reason === 'network-error'
  - 환경변수 빈 문자열 — result.reason === 'hook-url-missing'
  - 카테고리별 페이로드 색상 검증 (bug=orange/feature=blue/improvement=green)
  - 오류 카테고리는 진단 attachment 포함, 그 외는 누락

### 1-4. IPC 채널
- [ ] `src/shared/types/ipc.ts` 의 `IPC_CHANNELS` 에 추가:
  ```ts
  FEEDBACK_SUBMIT: 'feedback:submit',
  ```
- [ ] `src/preload/index.ts` 의 contextBridge expose:
  ```ts
  feedback: {
    submit: (payload: FeedbackPayload): Promise<FeedbackSubmitResult> =>
      ipcRenderer.invoke(IPC_CHANNELS.FEEDBACK_SUBMIT, payload),
  },
  ```
- [ ] `src/main/index.ts` 의 핸들러 등록 — `feedbackService.submit(args)` 호출 어댑터

### 1-5. ErrorReportService deprecation
- [ ] `src/main/error-report/ErrorReportService.ts` 의 `submitCommunity()` 메서드 JSDoc 에 `@deprecated v1.6.0 이후 Feedback 으로 통합. 호출 시점에 console.warn` 표시
- [ ] 메서드 본체에 `console.warn('[ErrorReport] submitCommunity 는 deprecated. 다음 사이클에 제거 예정.')` 한 줄 추가
- [ ] IPC 채널 `ERROR_REPORT_SUBMIT_COMMUNITY` 는 유지 (호출 사이트 정리는 후속 PR)

### 1-6. impl-log
- [ ] `feature/multi/feedback-to-agent/impl-log.md` 작성 — 변경 파일 + 결정/제약/참조 3섹션

## Phase 2 — renderer 측 (`renderer-engineer`)

### 2-1. FeedbackProvider (ErrorReportProvider 대체)
- [ ] `src/renderer/src/components/Feedback/FeedbackProvider.tsx` 신규:
  - Context API: `useFeedback() → { open(initialCategory?), openBug(), openFeature(), openImprovement() }`
  - 역호환을 위해 기존 `useErrorReport()` 도 같은 Provider 가 함께 노출 — `open()` 호출 시 `openBug()` 와 동등
  - 옵션 A: 한 파일에 두 Context 모두 export
  - 옵션 B: ErrorReportProvider 를 그대로 두고 FeedbackProvider 안에서 `<ErrorReportProvider>` wrap → engineer 결정 (단순 = 옵션 A)

### 2-2. FeedbackModal
- [ ] 카테고리 라디오 — 🐞 오류 / ✨ 기능요청 / 💡 개선. 기본값: open() 인자, 없으면 'bug'
- [ ] 카테고리 변경 시 진단 정보 prefill 분기:
  - bug: `window.api.errorReport.collect()` 호출하여 body / logPath / defaultSubject 채움. 입력란에 표시 (사용자가 편집/삭제 가능)
  - feature/improvement: 진단 부분 안 보임. 제목 + 본문 자유 입력
- [ ] 입력 필드: 제목 (input, 100자 limit) / 본문 (textarea, 4000자 limit) / 사용자 메모는 본문에 통합 (별도 필드 아님 — UI 단순화)
- [ ] 버튼: "전송" (primary) / "클립보드 복사" (secondary) / "취소" (ghost)
- [ ] 송신 결과 토스트:
  - 성공 → "Ultra Agent 에 전달했어요. 처리 결과는 PR/이슈로 회신됩니다."
  - 실패 (hook-url-missing) → "Hook URL 미설정 — 클립보드에 복사했어요. 두레이 메신저에 붙여넣어 공유하세요" + 자동 복사
  - 실패 (network/http) → 같은 fallback

### 2-3. Sidebar 버튼
- [ ] `src/renderer/src/components/Sidebar/...` (정확한 파일은 Phase 0 사전조사) 에 "피드백" 버튼 — 하단
- [ ] `lucide-react` 의 `MessageSquarePlus` 아이콘
- [ ] 클릭 → `useFeedback().open()` (카테고리 기본 = bug 또는 미선택 — 모달에서 사용자가 선택)

### 2-4. 글로벌 단축키
- [ ] Phase 0 결정한 키 (`Cmd/Ctrl+Shift+B` 또는 `Cmd/Ctrl+Shift+F`)
- [ ] App.tsx 또는 새 hook `useGlobalShortcuts` — `window.addEventListener('keydown', ...)`
- [ ] 입력란 포커스 중일 때도 동작 (브라우저 default 단축키와 충돌 없도록 e.preventDefault)
- [ ] 단축키 핸들러는 `useFeedback().open()` 호출

### 2-5. ErrorReport 호출 사이트 검증
- [ ] 5개 사이트 (`BriefingPanel` / `DashboardView` / `ReportGenerator` / `AIRecommendView` / `StateViews onReport`) 그대로 빌드 통과
- [ ] 동작: `useErrorReport().open()` 호출 시 모달이 bug 카테고리로 열림 + 진단 prefill

### 2-6. 매뉴얼 갱신
- [ ] `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx` 의 `SECTIONS` 배열에 새 항목:
  ```ts
  {
    title: '피드백',
    body: `오류 / 기능 요청 / 개선 제안을 어디서나 보낼 수 있습니다.\n` +
          `• 단축키: Cmd+Shift+B (Mac) / Ctrl+Shift+B (Win)\n` +
          `• 사이드바 하단 "피드백" 버튼\n` +
          `• 카테고리: 🐞 오류 / ✨ 기능요청 / 💡 개선\n` +
          `• 보낸 내용은 Ultra Agent 채널로 즉시 전달되며, 처리 결과는 PR/이슈로 회신됩니다.`
  }
  ```
- 적절한 위치 (기존 AI 관련 섹션 근처) 에 배치.

### 2-7. impl-log
- [ ] `feature/multi/feedback-to-agent/impl-log.md` 에 renderer 작업 append

## Phase 3 — 빌드 / CI 설정

### 3-1. release.yml 갱신
- [ ] 빌드 step (`npm run dist`) 의 env 블록에 추가:
  ```yaml
  env:
    VITE_FEEDBACK_HOOK_URL: ${{ secrets.DOORAY_ULTRA_HOOK_URL }}
  ```
- [ ] Windows 잡과 macOS 잡 *둘 다*
- [ ] (작업 B 와 충돌 가능 — Mac DMG→ZIP 작업이 같은 파일 만지므로 *순서 합의*: 작업 B 먼저 머지 권장)

### 3-2. CI yml (없으면 skip)
- 본 PR 의 변경은 src/main + src/renderer + shared 만 — CI (test/typecheck) 가 통과해야

## Phase 4 — Test Engineer (`test-engineer`)

- [ ] FeedbackService 단위 (Phase 1-3 에 동봉됐는지 검증, 안 됐으면 보강)
- [ ] FeedbackModal 의 카테고리 분기 — 가능하면 RTL 로, 어려우면 qa-report 의 "수동 시나리오"
- [ ] 기존 5개 호출 사이트 — 회귀 없음 (manual smoke test 만이라도)
- [ ] qa-report.md verdict: PASS / RETURN / BLOCK

## Phase 5 — Integrator

- [ ] `.agent/wiki/decisions-log.md` 1줄 추가:
  ```
  - 2026-05-22 — [피드백 시스템](feature/multi/feedback-to-agent/adr.md) — 오류/기능요청/개선 → Ultra Incoming Hook 직결. 두레이 task 경로 deprecated. electron-ipc, renderer.
  ```
- [ ] `.agent/wiki/domain-electron-ipc.md` §"공용 IPC 도메인 한눈에" 의 묶음 카테고리에 "Feedback" 추가
- [ ] `package.json` version `1.5.5` → **`1.6.0`**
- [ ] `CHANGELOG.md` 항목:
  ```md
  ## v1.6.0 — 2026-05-22

  ### 추가
  - 피드백 시스템 — 오류/기능요청/개선을 어디서나 보낼 수 있는 통합 UI (단축키 Cmd+Shift+B + 사이드바). Ultra Agent 채널로 즉시 전달.

  ### 변경
  - 기존 "오류 리포트 → 두레이 커뮤니티 task 생성" 경로 deprecated. 다음 사이클에서 제거.
  ```
- [ ] 품질 게이트: `npx tsc --noEmit` / `npm test` / `npm run build`
- [ ] PR 생성:
  - title: `feat(feedback): Ultra Agent 직결 피드백 시스템 (오류/기능요청/개선)`
  - base: main, head: feat/feedback-to-agent
  - body: PRD/ADR/impl-log/qa-report 링크 + 수동 검증 시나리오
- [ ] 채널에 PR URL 회신 (1줄)

## 의존성 / 순서

- 작업 B (Mac DMG→ZIP) 와 같은 PR 인 `release.yml` 을 만짐. **B 먼저 머지 권장**. 충돌 시 rebase.
- A 단독 진행 가능 (B 가 없어도 빌드 자체는 동작 — 단지 dmg 가 실패할 뿐)

## 결정 사항

- 단축키: Phase 0 충돌 검사 후 확정. 기본은 `Cmd+Shift+B`.
- ErrorReport 호환: 옵션 A (한 Provider 가 두 Context 노출) 권장.

## 제약

- main 직접 push 금지
- `--no-verify` / `--force` 금지
- 기존 5개 호출 사이트 회귀 0 — vitest 가 못 잡으니 *수동 smoke* 필수
- VITE_FEEDBACK_HOOK_URL 빈 값에서도 앱이 *깨지지 않아야* 함 (UX: 클립보드 fallback)

## 참조

- `feature/multi/feedback-to-agent/prd.md`
- `feature/multi/feedback-to-agent/adr.md`
- `.agent/wiki/domain-electron-ipc.md` (IPC 추가 패턴)
- `.claude/skills/vitest-patterns/SKILL.md` (fetch mock)
- `.claude/skills/commit-protocol/SKILL.md` (DOD 게이트)
