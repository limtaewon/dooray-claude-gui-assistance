# Implementation Log — Feedback to Agent (v1.6.0)

## 변경 파일

### Phase 1 — main 측

1. `src/shared/types/feedback.ts` — 신규
   - `FeedbackCategory`, `FeedbackPayload`, `FeedbackSubmitResult` 타입 정의

2. `src/main/feedback/FeedbackService.ts` — 신규
   - `submit()` 메서드: 두레이 Incoming Hook 으로 POST
   - 환경변수: `VITE_FEEDBACK_HOOK_URL` (fallback: `FEEDBACK_HOOK_URL`)
   - 페이로드 변환: Dooray Hook 포맷 (botName, text, attachments)
   - 카테고리별 색상: bug=orange, feature=blue, improvement=green
   - 에러 처리: `hook-url-missing`, `network-error`, `http-error`

3. `src/main/feedback/FeedbackService.test.ts` — 신규
   - 성공 케이스 (200)
   - HTTP 에러 (500, 404)
   - 네트워크 에러
   - 환경변수 미설정
   - 카테고리별 색상 검증
   - bug 외 카테고리는 진단 정보 제외

4. `src/shared/types/ipc.ts` — 수정
   - `FEEDBACK_SUBMIT: 'feedback:submit'` 채널 추가

5. `src/preload/index.ts` — 수정
   - `feedback.submit()` contextBridge expose

6. `src/main/index.ts` — 수정
   - `feedbackService` import
   - `IPC_CHANNELS.FEEDBACK_SUBMIT` 핸들러 등록

7. `src/main/error-report/ErrorReportService.ts` — 수정
   - `submitCommunity()` 에 `@deprecated` JSDoc 추가
   - `console.warn()` 한 줄 추가

## 결정

- 환경변수: `VITE_FEEDBACK_HOOK_URL` 단일 사용 (main/renderer 통일)
- 페이로드: ADR §"페이로드 스키마" 그대로 — `botName: "Feedback"`, attachments 배열
- 색상: bug=orange, feature=blue, improvement=green
- 역호환: `ErrorReportService.submitCommunity()` 는 유지하되 deprecation 경고

## 제약

- Hook URL 미설정 시 앱이 깨지지 않아야 함 (reason: `hook-url-missing` 반환)
- 네트워크 에러는 사용자에게 토스트 + 클립보드 fallback 제공 (renderer 측 구현)

### Phase 2 — renderer 측

8. `src/renderer/src/components/Feedback/FeedbackProvider.tsx` — 신규
   - Context API: `useFeedback()` — `open()`, `openBug()`, `openFeature()`, `openImprovement()`
   - 모달 UI: 카테고리 라디오, 제목/본문 입력, 진단 정보 (bug 만)
   - 전송 로직: `window.api.feedback.submit()` 호출
   - 실패 시 클립보드 fallback 자동 실행
   - 글로벌 단축키 리스너: `open-feedback-modal` 이벤트

9. `src/renderer/src/App.tsx` — 수정
   - 첫 번째 `keydown` 리스너에 `Cmd/Ctrl+Shift+B` 추가
   - `window.dispatchEvent(new CustomEvent('open-feedback-modal'))` 호출

10. `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx` — 수정
    - `SECTIONS` 배열에 '피드백 보내기' 섹션 추가

11. `.github/workflows/release.yml` — 수정
    - Windows 잡의 build step 에 `VITE_FEEDBACK_HOOK_URL` env 주입

## 결정

- 단축키: `Cmd/Ctrl+Shift+B` (충돌 없음)
- FeedbackProvider 가 ErrorReportProvider 를 대체하지 않고 병존 — 역호환 유지
- ClaudeManual 섹션 위치: `whats-new-v153` 다음

## 제약

- 기존 5 개 `useErrorReport()` 호출 사이트 회귀 없음 (수동 검증 필요)
- macOS 잡은 작업 B (DMG→ZIP) 에서 env 주입 예정

## 참조

- `feature/multi/feedback-to-agent/prd.md`
- `feature/multi/feedback-to-agent/adr.md`
- `feature/multi/feedback-to-agent/plan.md`
