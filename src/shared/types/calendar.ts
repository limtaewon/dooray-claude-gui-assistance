/** Clauday v1.5 — CalDAV + 로컬을 통합한 캘린더 도메인 타입 */

export type CalendarSource = 'caldav' | 'local' | 'holiday'

export interface UnifiedCalendar {
  source: CalendarSource
  /** caldav: 객체 URL, local: 로컬 ID */
  id: string
  name: string
  color?: string
  /** 편집/삭제 가능 여부 (local=true, caldav=v1.5 단계에서는 false) */
  writable: boolean
}

export interface UnifiedPerson {
  name?: string
  email?: string
  /** ACCEPTED / DECLINED / TENTATIVE / NEEDS-ACTION */
  partstat?: string
  /** REQ-PARTICIPANT / OPT-PARTICIPANT 등 */
  role?: string
}

export interface UnifiedAlarm {
  /** 예: -PT15M (15분 전), -P1D (하루 전) */
  trigger: string
  action?: string
  description?: string
}

export interface UnifiedEvent {
  source: CalendarSource
  /** caldav: UID, local: 로컬 ID */
  id: string
  /** UnifiedCalendar.id */
  calendarId: string
  /** caldav 객체 URL — 수정/삭제 시 필요 */
  caldavUrl?: string
  etag?: string
  summary: string
  description?: string
  location?: string
  /** ISO 8601 */
  start: string
  end: string
  allDay: boolean
  rrule?: string
  status?: string
  organizer?: UnifiedPerson
  attendees?: UnifiedPerson[]
  alarms?: UnifiedAlarm[]
  /** 외부 링크 */
  webUrl?: string
  /**
   * 일정이 처음 등록된 시점 (ISO 8601).
   *   - local: LocalEventRecord.createdAt
   *   - caldav: ICS 의 CREATED, 없으면 DTSTAMP
   *   - holiday: 미설정
   * 같은 시작시각/우선순위 안에서 등록순 타이브레이커로 사용.
   */
  createdAt?: string
}

export interface UnifiedEventCreate {
  source: CalendarSource
  calendarId: string
  summary: string
  description?: string
  location?: string
  start: string
  end: string
  allDay?: boolean
}

/**
 * 막대 드래그(이동/리사이즈)로 일정의 시각만 갱신할 때 사용.
 * UID/ATTENDEE/ALARM/RRULE 등 다른 속성은 백엔드가 보존한다.
 */
export interface UnifiedEventDateTimeUpdate {
  source: 'local' | 'caldav'
  /** local: 이벤트 ID, caldav: parsedEvent.id (UID) */
  id: string
  /** UnifiedCalendar.id — caldav 의 경우 객체 URL 식별에 사용 */
  calendarId: string
  /** caldav 의 객체 URL (수정 대상) */
  caldavUrl?: string
  etag?: string
  start: string
  end: string
  allDay: boolean
}

/**
 * 일정의 모든 속성을 수정할 때 사용 (상세 편집 모달).
 * source 에 따라 local 은 LocalEventStore, caldav 은 CalDAV 서버로 업데이트.
 */
export interface UnifiedEventUpdate {
  source: 'local' | 'caldav'
  /** local: 이벤트 ID, caldav: parsedEvent.id (UID) */
  id: string
  /** UnifiedCalendar.id — caldav 의 경우 객체 URL 식별에 사용 */
  calendarId: string
  /** caldav 의 객체 URL (수정 대상) */
  caldavUrl?: string
  etag?: string
  summary: string
  description?: string
  location?: string
  start: string
  end: string
  allDay: boolean
}

export interface UnifiedEventQuery {
  /** 비어있으면 전체 캘린더 */
  calendarIds?: string[]
  from: string
  to: string
}

export interface LocalCalendarCreate {
  name: string
  color?: string
}

export interface LocalCalendarUpdate {
  id: string
  name?: string
  color?: string
}

export interface LocalCalendar {
  id: string
  name: string
  color?: string
  createdAt: string
}
