---
task: feedback-to-agent
domain: electron-ipc, renderer, ai-service-adjacent
created: 2026-05-22
status: accepted
target_version: 1.6.0
---

# PRD — 피드백 시스템 (오류 / 기능요청 / 개선 → Ultra Agent 즉시 전달)

## 배경 / 문제

- 현재 `ErrorReport` 는 두레이 *Clauday 커뮤니티 프로젝트* (`projectId=4312559241344624232`) 에 task 생성하고 끝. 사람이 그 task 를 보고 처리해야 함. **누가 / 언제 처리할지 사용자에게 보이지 않음**.
- **기능 추가 요청 / 개선 제안** 전용 진입점은 없음. 사용자는 두레이 DM / Slack / 멘션 봇으로 분산 신고. 추적 안 됨.
- 이제 Ultra Agent 가 채널 메시지 → PR 자동 생성 사이클을 갖췄으므로, 피드백을 **곧장 Ultra 한테 던지면** 개발 사이클이 단축되고 사용자가 PR 링크로 *진행 가시성* 을 얻음.

## 목표 (Goals)

1. **3가지 카테고리** 한 모달에서 — 🐞 오류 / ✨ 기능요청 / 💡 개선
2. **글로벌 진입점** — 어디서나 단축키 + 사이드바 하단 버튼
3. **Ultra Agent 채널 Incoming Hook 으로 즉시 송신** — 두레이 task 생성 제거
4. **카테고리별 페이로드 차등** — 오류 카테고리만 진단 정보(collect) 자동 첨부
5. **송신 실패 시 클립보드 fallback** — 두레이 메신저에 수동 붙여넣기 가능

## 비목표 (Non-goals)

- 피드백 이력 조회 UI (별도 사이클)
- 익명 제보 (작성자는 항상 본인)
- 두레이 task 즉시 폐기 (IPC `ERROR_REPORT_SUBMIT_COMMUNITY` 는 `@deprecated` 표시만, 호출 사이트 정리는 후속 사이클)

## 수락 기준 (Acceptance Criteria)

- [ ] AC1: 단축키 `Cmd+Shift+B` (Mac) / `Ctrl+Shift+B` (Win) — 앱 어느 화면에서나 모달 열림
- [ ] AC2: 사이드바 하단 새 "피드백" 버튼 — `lucide MessageSquarePlus` 아이콘 + "피드백" 라벨. 클릭 시 모달 열림
- [ ] AC3: 기존 5개 호출 사이트 (`BriefingPanel`, `DashboardView`, `ReportGenerator`, `AIRecommendView`, `StateViews onReport`) — `useErrorReport().open()` 그대로 호출 가능 (역호환 alias)
- [ ] AC4: 모달 내 **카테고리 라디오** — 🐞 오류 / ✨ 기능요청 / 💡 개선. 기본 선택 = 오류 (역호환)
- [ ] AC5: 카테고리 = 오류 → 진단 정보 (`window.api.errorReport.collect()` 결과) 자동 prefill. 사용자 메모란 별도
- [ ] AC6: 카테고리 = 기능요청 / 개선 → 진단 정보 prefill 없음. 제목 + 본문 자유 입력
- [ ] AC7: "전송" 버튼 → main 의 `FeedbackService.submit()` → Incoming Hook POST. 성공 토스트 "Ultra Agent 에 전달됐습니다"
- [ ] AC8: 송신 실패 → 토스트 "전송 실패 — 클립보드에 복사했어요. 두레이 메신저에 붙여넣어 공유하세요" + 페이로드 자동 클립보드 복사
- [ ] AC9: Hook URL 미설정 (빈 환경변수) → "전송" 버튼 비활성 + 클립보드 복사만 노출
- [ ] AC10: `ClaudeManual.tsx` SECTIONS 갱신 — "피드백" 섹션 한국어 한 줄
- [ ] AC11: `package.json` version 1.5.5 → 1.6.0
- [ ] AC12: `CHANGELOG.md` v1.6.0 항목 (피드백 시스템 도입 + 두레이 task 경로 deprecated)

## 영향 도메인

- **electron-ipc** — IPC 채널 `FEEDBACK_SUBMIT` 신규
- **renderer** — `FeedbackProvider` + 모달 + 사이드바 버튼 + 단축키
- **main** — `FeedbackService` 신규. `ErrorReportService.submitCommunity()` 는 `@deprecated`
- **빌드/릴리즈** — `VITE_FEEDBACK_HOOK_URL` 환경변수 (release.yml 에서 secret 주입)

## 리스크 / 제약

- **Incoming Hook URL 노출** — 빌드 결과물 unpack 하면 URL 보임. 데이터 *수신* 권한은 없어서 큰 위험 X. 단, *스팸 공격* 가능 (모르는 사람이 URL 알아내 채널에 도배). 완화: Ultra 측에서 sender 검증 + Clauday 빌드 식별자 추가.
- **단축키 충돌** — `Cmd+Shift+B` 가 다른 곳에서 안 쓰이는지 사전 grep 필수. 충돌 시 `Cmd+Shift+F` 로 fallback (Feedback).
- **VITE 환경변수 노출** — Vite 는 `VITE_` prefix env 를 *렌더러 번들* 에 박음. 보안 민감 데이터면 위험. Hook URL 정도는 허용 가능.
- **두레이 task 경로 deprecation** — 즉시 제거하지 않아 dead code 잔존. 1.7.0 사이클에서 정리.
- **macOS 단축키 — 글로벌 vs 앱 내** — 본 PRD 는 *앱 포커스 시* 단축키. 백그라운드 단축키 (Electron globalShortcut) 아님.

## 참조

- 호출 사이트 inventory: `src/renderer/src/components/{Dooray,AIRecommend,common}/**` 의 `useErrorReport`
- 기존 `ErrorReportService.collect()` 의 진단 정보 구조 — 그대로 재사용
- Ultra 채널 Incoming Hook secret 이름: `DOORAY_ULTRA_HOOK_URL` (이미 등록)
- 관련 ADR: `feature/multi/feedback-to-agent/adr.md` (이 디렉토리)
