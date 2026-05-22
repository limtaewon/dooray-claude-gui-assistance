# Domain — CalDAV Calendar (v1.5)

> 두레이 자체 캘린더 API 를 버리고 CalDAV (`tsdav`) 로 전환한 v1.5 의 핵심. 로컬 캘린더(`LocalEventStore`)도 같은 ICS 포맷으로 통합.

## 왜 CalDAV?

- 두레이 네이티브 캘린더 API 는 토큰 권한 변동에 취약 + reschedule 시 race
- CalDAV 는 표준 (RFC 4791) → 동일 코드가 두레이 외 캘린더에도 적용 가능
- ICS 텍스트가 단일 source of truth → 외부 export 가 그냥 .ics 파일

## 핵심 파일

- `src/main/caldav/CalDAVClient.ts` — tsdav 래퍼. `fullSync` (과거 6개월 ~ 미래 1년), `incrementalSync` (etag diff).
- `src/main/caldav/CalendarObjectsStore.ts` — ICS 영구 저장 (디스크). listEvents 의 *유일한* 소스.
- `src/main/caldav/CredentialStore.ts` — keytar 로 비밀번호 저장 (계정별).
- `src/main/caldav/LocalEventStore.ts` — 로컬 캘린더. electron-store + ICS 텍스트.
- `src/main/caldav/UnifiedCalendarService.ts` — CalDAV + Local + Holiday 통합 view. listEvents 가 모두 합침.
- `src/main/caldav/CTagPoller.ts` — 3분 주기 etag diff 폴러. 429 맞으면 5 tick skip 백오프.
- `src/main/caldav/ical.ts` — ICS 파싱/생성/datetime patch.
- `src/main/holiday/HolidayService.ts` — 한국 공휴일 시드 (calendar id = `HOLIDAY_CALENDAR_ID`).

## 데이터 흐름

```
CalDAV 서버 ─ fullSync ──▶ CalendarObjectsStore (디스크 ICS)
       │                          │
       │ etag diff                 │
       └─ incrementalSync ────────▶│
                                   │
LocalEventStore (electron-store)   │
                                   │
HolidayService                     │
                                   │
                                   ▼
                       UnifiedCalendarService.listEvents()
                                   │
                                   ▼ (IPC CALENDAR_LIST_EVENTS)
                              renderer 캘린더 UI
```

`listEvents` 는 **더 이상 CalDAV 서버를 직접 호출하지 않음**. 모든 표시는 디스크의 ICS 에서. 폴러가 백그라운드로 갱신.

## Source 라벨링

UnifiedEvent 의 id 는 `<source>:<원본id>` 형식:
- `caldav:<uid>` — CalDAV 일정
- `local:<uid>` — 사용자 직접 등록 todo
- `holiday:<uid>` — 공휴일

AI 브리핑 / UI 가 source 별 구분에 사용.

## CTagPoller 의 백오프

- 기본 주기: `POLL_INTERVAL_MS = 180_000` (3분)
- 429 응답 → `skipTicks = 5` 만큼 다음 tick 건너뜀 (= 15분 휴식)
- 두레이 quota 보호 목적

## 함정

- **all-day 이벤트**: ICS `DTSTART;VALUE=DATE:20260520` 형식. parseICal 이 `wholeDayFlag: true` + timezone-free 로 변환. UTC 변환 시도 금지.
- **재발생 이벤트 (RRULE)**: 현재 단순 처리 — 첫 발생만. 복잡 RRULE 은 추후.
- **etag diff 의 nuance**: CalDAV 서버가 etag 를 잘못 갱신하면 incrementalSync 가 누락. 의심스러우면 수동 fullSync.
- **로컬 캘린더 = 사용자 자기 의지 todo**: AI 브리핑이 캘린더 회의(caldav) 와 todo(local) 를 구분하는 이유 — 우선순위/추천 톤이 다름.

## 갱신 정책

- 새 CalDAV 기능 (예: 알림 동기화) 추가 시 본 문서 갱신
- 폴러 주기/백오프 정책 변경 시 명시
