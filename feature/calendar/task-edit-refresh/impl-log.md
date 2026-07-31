# impl-log

agent: renderer-engineer
date: 2026-06-19

## 작업 개요

Calendar 두 가지 기능 구현:
1. 새로고침 버튼이 서버 동기화(fullSync)를 실제로 수행하도록 수정
2. 일정 클릭 편집 모달(EventEditModal) 신규 구현 + 달력/목록 뷰 연동

---

## 변경 파일

### 신규 파일

- `src/renderer/src/components/Dooray/EventEditModal.tsx`
  - ds/Modal 기반 일정 편집 모달
  - 제목/시작·종료 일시(종일 토글)/위치/설명 편집 가능
  - `formValuesToUpdate`: 폼 값 → `UnifiedEventUpdate` 변환 (caldavUrl/etag 보존)
  - `eventToFormValues`: `UnifiedEvent` → 폼 초기값 변환 (allDay 여부로 date/datetime-local 포맷 분기)
  - 공휴일(holiday) 읽기 전용 안내 표시
  - 저장: `window.api.calendar.updateEvent`, 삭제: `window.api.calendar.deleteEvent`

- `src/renderer/src/components/Dooray/EventEditModal.test.ts`
  - `eventToFormValues` / `formValuesToUpdate` 8개 단위 테스트 (모두 PASS)

### 수정 파일

- `src/renderer/src/components/Dooray/CalendarAssistant.tsx`
  - line 1-9: `EventEditModal`, `UnifiedEvent` import 추가
  - `syncing` state, `unifiedEventsMap` (Map<compositeId, UnifiedEvent>) state 추가
  - `editingEvent` state 추가 (목록 뷰 편집 모달 트리거)
  - `loadEvents`: 원본 UnifiedEvent 를 `source:id` compositeId 로 맵핑하여 `unifiedEventsMap` 구축
  - `handleRefresh` 추가: `window.api.caldav.fullSync()` → `loadEvents()` 순서로 호출; 스피너는 `syncing` state 로 제어
  - 새로고침 버튼: `onClick={loadEvents}` → `onClick={handleRefresh}`, disabled/spinner 조건에 `syncing` 추가
  - 장기 이벤트 카드 + 날짜별 이벤트 카드에 `onClick={() => unified && setEditingEvent(unified)}` 추가
  - 컴포넌트 말미에 `<EventEditModal>` 렌더

- `src/renderer/src/components/Dooray/CalendarMonthView.tsx`
  - `EventEditModal` import 추가
  - `editingEvent` state 추가
  - 상세 모달 타이틀에 "편집" 버튼 추가 (클릭 시 상세 모달 닫고 편집 모달 열기)
  - 컴포넌트 말미에 `<EventEditModal>` 렌더

- `src/renderer/src/components/ClaudeManual/ClaudeManual.tsx`
  - 캘린더 섹션: 새로고침 → 서버 동기화 설명 추가, 일정 클릭 편집 설명 추가
  - v1.5 변경사항: 일정 클릭 편집, 새로고침 서버 동기화 항목 추가

---

## 설계 결정

### Task 1: 새로고침 = fullSync
`incrementalSync` 가 아닌 `fullSync` 를 택한 이유:
- 사용자가 명시적으로 🔄 누르는 것은 "지금 당장 서버 최신 상태를 가져오라"는 의도
- 배경 poller(CTagPoller)는 이미 `incrementalSync`(3분 주기)를 돌리고 있어 차별화 필요
- `fullSync`는 etag/CTag 무시하고 모든 객체를 재검증 — 누락 이벤트 복구에 유리

### Task 2: caldavUrl/etag 보존
`loadEvents`에서 `DoorayCalendarEvent` 매핑 시 `caldavUrl`/`etag` 가 DROP 되는 것이 핵심 문제.
해결: `unifiedEventsMap` (`Map<source:id, UnifiedEvent>`) 을 별도 유지해 편집 모달에 원본 전달.

---

## 빌드 결과

```
npm run build → ✓ built in 2.19s (3개 번들 모두 성공)
vitest run EventEditModal.test.ts → 8/8 PASS
```
