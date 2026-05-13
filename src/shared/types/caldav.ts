/** Clauday v1.5 — CalDAV 도메인 타입 */

export interface CalDAVCredentialStatus {
  connected: boolean
  username: string | null
}

export interface CalDAVTestResult {
  ok: boolean
  calendarCount?: number
  error?: string
}

export interface CalDAVCalendar {
  url: string
  displayName: string
  description?: string
  color?: string
  timezone?: string
}

export interface CalDAVPerson {
  name?: string
  email?: string
  partstat?: string
  role?: string
}

export interface CalDAVAlarm {
  trigger: string
  action?: string
  description?: string
}

export interface CalDAVEvent {
  uid: string
  calendarUrl: string
  /** 객체 URL (수정/삭제 식별자) */
  url: string
  etag?: string
  summary: string
  description?: string
  location?: string
  /** ISO 8601 */
  start: string
  /** ISO 8601 */
  end: string
  allDay: boolean
  rrule?: string
  status?: string
  organizer?: CalDAVPerson
  attendees?: CalDAVPerson[]
  alarms?: CalDAVAlarm[]
  /** VEVENT 자체의 URL 속성 (외부 링크) — 위 url 필드(객체 URL)와 별개 */
  webUrl?: string
}

export interface CalDAVEventCreate {
  calendarUrl: string
  summary: string
  description?: string
  location?: string
  start: string
  end: string
  allDay?: boolean
}

export interface CalDAVEventQuery {
  /** 비어있으면 전체 캘린더 */
  calendarUrls?: string[]
  /** ISO 8601 */
  from: string
  to: string
}

export interface CalDAVSaveCredentialsInput {
  username: string
  password: string
}
