import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})

import { CalendarObjectsStore } from './CalendarObjectsStore'

beforeEach(() => {
  CalendarObjectsStore.clearAll()
})

describe('CalendarObjectsStore', () => {
  it('upsertObject / getCalendar / deleteObject', () => {
    CalendarObjectsStore.upsertObject('cal1', 'href-a', { etag: 'e1', ics: 'ICS-A' })
    CalendarObjectsStore.upsertObject('cal1', 'href-b', { etag: 'e2', ics: 'ICS-B' })
    const all = CalendarObjectsStore.getCalendar('cal1')
    expect(Object.keys(all)).toEqual(['href-a', 'href-b'])
    CalendarObjectsStore.deleteObject('cal1', 'href-a')
    expect(Object.keys(CalendarObjectsStore.getCalendar('cal1'))).toEqual(['href-b'])
  })

  it('getCalendar — 없으면 빈 객체', () => {
    expect(CalendarObjectsStore.getCalendar('nope')).toEqual({})
  })

  it('setCalendar 로 전체 교체', () => {
    CalendarObjectsStore.upsertObject('cal1', 'a', { etag: '1', ics: 'A' })
    CalendarObjectsStore.setCalendar('cal1', { b: { etag: '2', ics: 'B' } })
    expect(Object.keys(CalendarObjectsStore.getCalendar('cal1'))).toEqual(['b'])
  })

  it('clearCalendar', () => {
    CalendarObjectsStore.upsertObject('cal1', 'a', { etag: '1', ics: 'A' })
    CalendarObjectsStore.clearCalendar('cal1')
    expect(CalendarObjectsStore.getCalendar('cal1')).toEqual({})
  })

  it('getAllObjects 평탄화', () => {
    CalendarObjectsStore.upsertObject('cal1', 'a', { etag: '1', ics: 'A' })
    CalendarObjectsStore.upsertObject('cal2', 'b', { etag: '2', ics: 'B' })
    const all = CalendarObjectsStore.getAllObjects()
    expect(all).toHaveLength(2)
    const urls = all.map((x) => x.calendarUrl).sort()
    expect(urls).toEqual(['cal1', 'cal2'])
  })

  it('listCalendarUrls', () => {
    CalendarObjectsStore.upsertObject('A', 'h', { etag: 'e', ics: 'i' })
    CalendarObjectsStore.upsertObject('B', 'h', { etag: 'e', ics: 'i' })
    expect(CalendarObjectsStore.listCalendarUrls().sort()).toEqual(['A', 'B'])
  })

  it('totalObjectCount', () => {
    expect(CalendarObjectsStore.totalObjectCount()).toBe(0)
    CalendarObjectsStore.upsertObject('A', 'h1', { etag: 'e', ics: 'i' })
    CalendarObjectsStore.upsertObject('A', 'h2', { etag: 'e', ics: 'i' })
    CalendarObjectsStore.upsertObject('B', 'h1', { etag: 'e', ics: 'i' })
    expect(CalendarObjectsStore.totalObjectCount()).toBe(3)
  })

  it('clearAll 은 objects + meta 모두 비움', () => {
    CalendarObjectsStore.upsertObject('A', 'h', { etag: 'e', ics: 'i' })
    CalendarObjectsStore.setCalendarMeta('A', { displayName: '캘A' })
    CalendarObjectsStore.clearAll()
    expect(CalendarObjectsStore.totalObjectCount()).toBe(0)
    expect(CalendarObjectsStore.getCalendarMeta('A')).toBeUndefined()
  })

  it('setCalendarMeta / getCalendarMeta / getAllCalendarMeta', () => {
    CalendarObjectsStore.setCalendarMeta('A', { displayName: '캘A', color: '#fff' })
    expect(CalendarObjectsStore.getCalendarMeta('A')).toEqual({ displayName: '캘A', color: '#fff' })
    expect(CalendarObjectsStore.getAllCalendarMeta()).toEqual({ A: { displayName: '캘A', color: '#fff' } })
  })

  it('deleteObject — 캘린더 없으면 no-op', () => {
    expect(() => CalendarObjectsStore.deleteObject('missing', 'h')).not.toThrow()
  })
})
