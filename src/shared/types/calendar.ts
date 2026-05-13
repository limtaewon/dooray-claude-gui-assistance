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
