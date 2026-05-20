import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})

// 모듈 캐시 무효화하기 어려우므로 매번 import 후 store 초기화는 직접 한다
import { LocalEventStore } from './LocalEventStore'

function resetStore(): void {
  // module 내부 store 를 비우려면 직접 호출
  const cals = LocalEventStore.listCalendars()
  for (const c of cals) {
    if (c.id !== LocalEventStore.DEFAULT_CALENDAR_ID) {
      try { LocalEventStore.deleteCalendar(c.id) } catch { /* ok */ }
    }
  }
  // 기본 캘린더의 이벤트만 제거 — 직접 events 비우는 API 없으므로 listEvents 후 삭제
  const evs = LocalEventStore.listEvents('1970-01-01', '2099-01-01')
  for (const e of evs) LocalEventStore.deleteEvent(e.id)
}

beforeEach(() => {
  resetStore()
})

describe('LocalEventStore — 캘린더', () => {
  it('초기에는 기본 캘린더가 존재', () => {
    const cals = LocalEventStore.listCalendars()
    expect(cals.length).toBeGreaterThanOrEqual(1)
    expect(cals.some((c) => c.id === LocalEventStore.DEFAULT_CALENDAR_ID)).toBe(true)
  })

  it('createCalendar / updateCalendar / deleteCalendar', () => {
    const cal = LocalEventStore.createCalendar('업무', '#ff0000')
    expect(cal.id).toBeTruthy()
    LocalEventStore.updateCalendar(cal.id, { name: '업무 v2' })
    const updated = LocalEventStore.listCalendars().find((c) => c.id === cal.id)!
    expect(updated.name).toBe('업무 v2')
    LocalEventStore.deleteCalendar(cal.id)
    expect(LocalEventStore.listCalendars().find((c) => c.id === cal.id)).toBeUndefined()
  })

  it('기본 캘린더는 삭제 불가', () => {
    expect(() => LocalEventStore.deleteCalendar(LocalEventStore.DEFAULT_CALENDAR_ID)).toThrow(/기본 캘린더/)
  })

  it('캘린더 삭제 시 해당 캘린더 이벤트도 삭제', () => {
    const cal = LocalEventStore.createCalendar('temp')
    LocalEventStore.createEvent({
      calendarId: cal.id,
      summary: 'x', start: '2026-05-13T09:00:00Z', end: '2026-05-13T10:00:00Z', allDay: false
    })
    LocalEventStore.deleteCalendar(cal.id)
    expect(LocalEventStore.listEvents('2026-01-01', '2026-12-31', [cal.id])).toEqual([])
  })
})

describe('LocalEventStore — 이벤트 CRUD', () => {
  it('createEvent → listEvents 에 노출', () => {
    const e = LocalEventStore.createEvent({
      calendarId: LocalEventStore.DEFAULT_CALENDAR_ID,
      summary: '회의', description: '주간 보고',
      location: '회의실 A',
      start: '2026-05-13T09:00:00Z', end: '2026-05-13T10:00:00Z',
      allDay: false
    })
    expect(e.id).toBeTruthy()
    const list = LocalEventStore.listEvents('2026-05-01', '2026-05-31')
    expect(list).toHaveLength(1)
    expect(list[0].summary).toBe('회의')
    expect(list[0].location).toBe('회의실 A')
  })

  it('listEvents — calendarIds 필터', () => {
    const c1 = LocalEventStore.createCalendar('a')
    LocalEventStore.createEvent({
      calendarId: c1.id, summary: 'in', start: '2026-05-13T09:00:00Z', end: '2026-05-13T10:00:00Z', allDay: false
    })
    LocalEventStore.createEvent({
      calendarId: LocalEventStore.DEFAULT_CALENDAR_ID, summary: 'out',
      start: '2026-05-13T09:00:00Z', end: '2026-05-13T10:00:00Z', allDay: false
    })
    const r = LocalEventStore.listEvents('2026-05-01', '2026-05-31', [c1.id])
    expect(r).toHaveLength(1)
    expect(r[0].summary).toBe('in')
  })

  it('listEvents — 범위 밖 이벤트 제외', () => {
    LocalEventStore.createEvent({
      calendarId: LocalEventStore.DEFAULT_CALENDAR_ID, summary: 'far',
      start: '2030-01-01T09:00:00Z', end: '2030-01-01T10:00:00Z', allDay: false
    })
    expect(LocalEventStore.listEvents('2026-01-01', '2026-12-31')).toHaveLength(0)
  })

  it('updateEvent', () => {
    const e = LocalEventStore.createEvent({
      calendarId: LocalEventStore.DEFAULT_CALENDAR_ID, summary: 'old',
      start: '2026-05-13T09:00:00Z', end: '2026-05-13T10:00:00Z', allDay: false
    })
    const updated = LocalEventStore.updateEvent(e.id, { summary: 'new', location: 'X' })
    expect(updated!.summary).toBe('new')
    expect(updated!.location).toBe('X')
    const list = LocalEventStore.listEvents('2026-05-01', '2026-05-31')
    expect(list[0].summary).toBe('new')
  })

  it('updateEvent — 없는 id 면 null', () => {
    expect(LocalEventStore.updateEvent('missing', { summary: 'x' })).toBeNull()
  })

  it('updateEvent — start/end 변경 시 createdAt 은 보존된다 (막대 드래그 시나리오)', () => {
    const e = LocalEventStore.createEvent({
      calendarId: LocalEventStore.DEFAULT_CALENDAR_ID, summary: '리뷰',
      start: '2026-05-13T09:00:00Z', end: '2026-05-13T10:00:00Z', allDay: false
    })
    const origCreatedAt = e.createdAt
    expect(origCreatedAt).toBeTruthy()
    const updated = LocalEventStore.updateEvent(e.id, {
      start: '2026-05-20T09:00:00Z',
      end: '2026-05-20T10:00:00Z'
    })
    expect(updated!.start).toBe('2026-05-20T09:00:00Z')
    // createdAt 은 그대로
    expect(updated!.createdAt).toBe(origCreatedAt)
  })

  it('deleteEvent', () => {
    const e = LocalEventStore.createEvent({
      calendarId: LocalEventStore.DEFAULT_CALENDAR_ID, summary: 'x',
      start: '2026-05-13T09:00:00Z', end: '2026-05-13T10:00:00Z', allDay: false
    })
    LocalEventStore.deleteEvent(e.id)
    expect(LocalEventStore.listEvents('2026-05-01', '2026-05-31')).toEqual([])
  })

  it('종일 이벤트', () => {
    const e = LocalEventStore.createEvent({
      calendarId: LocalEventStore.DEFAULT_CALENDAR_ID, summary: '휴가',
      start: '2026-05-13T00:00:00Z', end: '2026-05-13T00:00:00Z', allDay: true
    })
    const list = LocalEventStore.listEvents('2026-05-01', '2026-05-31')
    expect(list.find((x) => x.id === e.id)?.allDay).toBe(true)
  })
})

describe('LocalEventStore — exportCalendar', () => {
  it('VCALENDAR 텍스트 반환', () => {
    LocalEventStore.createEvent({
      calendarId: LocalEventStore.DEFAULT_CALENDAR_ID, summary: '회의',
      start: '2026-05-13T09:00:00Z', end: '2026-05-13T10:00:00Z', allDay: false
    })
    const ics = LocalEventStore.exportCalendar(LocalEventStore.DEFAULT_CALENDAR_ID)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:회의')
    expect(ics).toContain('X-WR-CALNAME')
  })

  it('없는 캘린더 throw', () => {
    expect(() => LocalEventStore.exportCalendar('missing')).toThrow(/찾을 수 없/)
  })
})
