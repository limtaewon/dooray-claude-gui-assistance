import Store from 'electron-store'
import type { LocalCalendar } from '../../shared/types/calendar'
import { buildICal, parseICal, bundleICal } from './ical'

export type { LocalCalendar }

/**
 * 로컬 캘린더는 CalDAV 와 동일하게 ICS 텍스트를 단일 source of truth 로 저장.
 * 외부 export (Google Calendar / Apple Calendar / Outlook) 시 그대로 .ics 파일로 사용 가능.
 *
 * - records[].ics 는 단일 VEVENT 를 감싼 VCALENDAR 텍스트
 * - 검색/필터는 매번 parseICal — 단순화. 일정 수가 늘면 sidecar index 추가 검토
 */
export interface LocalEventRecord {
  id: string            // = VEVENT UID
  calendarId: string
  ics: string
  createdAt: string
  updatedAt: string
}

/** UI 노출용 — UnifiedCalendarService 가 사용 */
export interface LocalEvent {
  id: string
  calendarId: string
  summary: string
  description?: string
  location?: string
  start: string
  end: string
  allDay: boolean
  /** ISO 8601, 영구 — 정렬 타이브레이커 & 상세 모달 표시 용 */
  createdAt?: string
}

interface LocalDB {
  calendars: LocalCalendar[]
  events: LocalEventRecord[]
}

const DEFAULT_CAL_ID = 'local-default'

const store = new Store<LocalDB>({
  name: 'local-calendar',
  defaults: { calendars: [], events: [] }
})

function ensureDefault(): void {
  const cals = store.get('calendars')
  if (cals.length === 0) {
    store.set('calendars', [{
      id: DEFAULT_CAL_ID,
      name: '내 일정',
      color: '#3b82f6',
      createdAt: new Date().toISOString()
    }])
  }
}
ensureDefault()

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function recordToEvent(r: LocalEventRecord): LocalEvent | null {
  const parsed = parseICal(r.ics)
  if (!parsed) return null
  return {
    id: r.id,
    calendarId: r.calendarId,
    summary: parsed.summary,
    description: parsed.description,
    location: parsed.location,
    start: parsed.start,
    end: parsed.end,
    allDay: parsed.allDay,
    // record 의 createdAt 이 권위적. ICS 의 CREATED 는 보조 (이후 외부 도구가 ICS 만 가져갈 수 있게 하기 위함).
    createdAt: r.createdAt
  }
}

export const LocalEventStore = {
  DEFAULT_CALENDAR_ID: DEFAULT_CAL_ID,

  listCalendars(): LocalCalendar[] {
    return store.get('calendars')
  },

  createCalendar(name: string, color?: string): LocalCalendar {
    const cal: LocalCalendar = {
      id: uid('lcal'),
      name,
      color,
      createdAt: new Date().toISOString()
    }
    store.set('calendars', [...store.get('calendars'), cal])
    return cal
  },

  updateCalendar(id: string, patch: { name?: string; color?: string }): void {
    store.set('calendars', store.get('calendars').map((c) => (c.id === id ? { ...c, ...patch } : c)))
  },

  deleteCalendar(id: string): void {
    if (id === DEFAULT_CAL_ID) throw new Error('기본 캘린더는 삭제할 수 없습니다.')
    store.set('calendars', store.get('calendars').filter((c) => c.id !== id))
    store.set('events', store.get('events').filter((e) => e.calendarId !== id))
  },

  listEvents(from: string, to: string, calendarIds?: string[]): LocalEvent[] {
    const fromT = new Date(from).getTime()
    const toT = new Date(to).getTime()
    const out: LocalEvent[] = []
    for (const r of store.get('events')) {
      if (calendarIds && calendarIds.length > 0 && !calendarIds.includes(r.calendarId)) continue
      const ev = recordToEvent(r)
      if (!ev) continue
      const s = new Date(ev.start).getTime()
      const e = new Date(ev.end).getTime()
      if (e < fromT || s > toT) continue
      out.push(ev)
    }
    return out
  },

  createEvent(input: Omit<LocalEvent, 'id'>): LocalEvent {
    const eventUid = uid('levt')
    const now = new Date().toISOString()
    const ics = buildICal({
      uid: eventUid,
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: input.start,
      end: input.end,
      allDay: input.allDay,
      createdAt: now
    })
    const record: LocalEventRecord = {
      id: eventUid,
      calendarId: input.calendarId,
      ics,
      createdAt: now,
      updatedAt: now
    }
    store.set('events', [...store.get('events'), record])
    return { ...input, id: eventUid, createdAt: now }
  },

  updateEvent(
    id: string,
    patch: Partial<Omit<LocalEvent, 'id' | 'calendarId'>>
  ): LocalEvent | null {
    const records = store.get('events')
    const idx = records.findIndex((r) => r.id === id)
    if (idx < 0) return null
    const current = recordToEvent(records[idx])
    if (!current) return null
    const merged: LocalEvent = { ...current, ...patch, id, calendarId: current.calendarId }
    const newIcs = buildICal({
      uid: id,
      summary: merged.summary,
      description: merged.description,
      location: merged.location,
      start: merged.start,
      end: merged.end,
      allDay: merged.allDay,
      createdAt: records[idx].createdAt
    })
    const next = [...records]
    next[idx] = { ...records[idx], ics: newIcs, updatedAt: new Date().toISOString() }
    store.set('events', next)
    return merged
  },

  deleteEvent(id: string): void {
    store.set('events', store.get('events').filter((e) => e.id !== id))
  },

  /** 캘린더 단위 ICS 내보내기 — Google/Apple/Outlook 등에 가져오기 가능한 .ics 파일 텍스트 반환 */
  exportCalendar(calendarId: string): string {
    const calendar = store.get('calendars').find((c) => c.id === calendarId)
    if (!calendar) throw new Error('캘린더를 찾을 수 없습니다.')
    const icsList = store.get('events')
      .filter((r) => r.calendarId === calendarId)
      .map((r) => r.ics)
    return bundleICal(calendar.name, icsList)
  },

  /**
   * 일정의 모든 속성을 갱신 - 상세 편집 모달용.
   * updateEvent 와 달리 undefined 필드를 기존 값으로 유지하지 않고,
   * 모든 필드를 명시적으로 새 값으로 교체.
   */
  updateEventFull(
    id: string,
    patch: {
      summary: string
      description?: string
      location?: string
      start: string
      end: string
      allDay: boolean
    }
  ): LocalEvent | null {
    const records = store.get('events')
    const idx = records.findIndex((r) => r.id === id)
    if (idx < 0) return null
    const now = new Date().toISOString()
    const newIcs = buildICal({
      uid: id,
      summary: patch.summary,
      description: patch.description,
      location: patch.location,
      start: patch.start,
      end: patch.end,
      allDay: patch.allDay,
      createdAt: records[idx].createdAt
    })
    const next = [...records]
    next[idx] = { ...records[idx], ics: newIcs, updatedAt: now }
    store.set('events', next)
    const parsed = parseICal(newIcs)
    if (!parsed) return null
    return {
      id,
      calendarId: records[idx].calendarId,
      summary: parsed.summary,
      description: parsed.description,
      location: parsed.location,
      start: parsed.start,
      end: parsed.end,
      allDay: parsed.allDay,
      createdAt: records[idx].createdAt
    }
  }
}
