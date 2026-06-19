import { describe, it, expect } from 'vitest'
import { eventToFormValues, formValuesToUpdate } from './EventEditModal'
import type { UnifiedEvent } from '../../../../shared/types/calendar'

// ─────────────────────────────────────────────────────────────
// EventEditModal 순수 로직 단위 테스트
//   - eventToFormValues: UnifiedEvent → 폼 초기값 변환
//   - formValuesToUpdate: 폼 값 → UnifiedEventUpdate 변환
// ─────────────────────────────────────────────────────────────

const baseEvent: UnifiedEvent = {
  source: 'local',
  id: 'evt-001',
  calendarId: 'cal-local',
  summary: '팀 회의',
  description: '주간 동기화',
  location: '3층 회의실',
  start: '2026-06-19T10:00:00.000Z',
  end: '2026-06-19T11:00:00.000Z',
  allDay: false
}

const allDayEvent: UnifiedEvent = {
  ...baseEvent,
  id: 'evt-002',
  summary: '연차',
  start: '2026-06-20T00:00:00.000Z',
  end: '2026-06-20T23:59:59.000Z',
  allDay: true,
  description: undefined,
  location: undefined
}

const caldavEvent: UnifiedEvent = {
  ...baseEvent,
  source: 'caldav',
  id: 'uid-abc',
  calendarId: 'https://caldav.example.com/cal/abc',
  caldavUrl: 'https://caldav.example.com/cal/abc/uid-abc.ics',
  etag: '"abc123"'
}

describe('eventToFormValues', () => {
  it('시간 이벤트를 datetime-local 형식으로 변환', () => {
    const vals = eventToFormValues(baseEvent)
    expect(vals.summary).toBe('팀 회의')
    expect(vals.allDay).toBe(false)
    expect(vals.location).toBe('3층 회의실')
    expect(vals.description).toBe('주간 동기화')
    // datetime-local 형식: YYYY-MM-DDTHH:mm
    expect(vals.startValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(vals.endValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('종일 이벤트를 date 형식(YYYY-MM-DD)으로 변환', () => {
    const vals = eventToFormValues(allDayEvent)
    expect(vals.allDay).toBe(true)
    expect(vals.summary).toBe('연차')
    // date 형식: YYYY-MM-DD (T 없음)
    expect(vals.startValue).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(vals.endValue).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('description/location 이 undefined 이면 빈 문자열 반환', () => {
    const vals = eventToFormValues(allDayEvent)
    expect(vals.description).toBe('')
    expect(vals.location).toBe('')
  })
})

describe('formValuesToUpdate', () => {
  it('시간 이벤트 폼 값을 UnifiedEventUpdate 로 변환', () => {
    const vals = eventToFormValues(baseEvent)
    const update = formValuesToUpdate(baseEvent, vals)
    expect(update.source).toBe('local')
    expect(update.id).toBe('evt-001')
    expect(update.calendarId).toBe('cal-local')
    expect(update.summary).toBe('팀 회의')
    expect(update.allDay).toBe(false)
    // ISO 8601 포맷 검증
    expect(new Date(update.start).toString()).not.toBe('Invalid Date')
    expect(new Date(update.end).toString()).not.toBe('Invalid Date')
  })

  it('종일 이벤트는 allDay=true, start=T00:00:00 ISO', () => {
    const vals = eventToFormValues(allDayEvent)
    const update = formValuesToUpdate(allDayEvent, vals)
    expect(update.allDay).toBe(true)
    const startD = new Date(update.start)
    expect(startD.getHours()).toBe(0)
    expect(startD.getMinutes()).toBe(0)
  })

  it('caldav 이벤트의 caldavUrl/etag 가 그대로 전달됨', () => {
    const vals = eventToFormValues(caldavEvent)
    const update = formValuesToUpdate(caldavEvent, vals)
    expect(update.source).toBe('caldav')
    expect(update.caldavUrl).toBe('https://caldav.example.com/cal/abc/uid-abc.ics')
    expect(update.etag).toBe('"abc123"')
  })

  it('빈 description/location 은 undefined 로 변환 (불필요 필드 전송 방지)', () => {
    const vals = { ...eventToFormValues(baseEvent), description: '  ', location: '' }
    const update = formValuesToUpdate(baseEvent, vals)
    expect(update.description).toBeUndefined()
    expect(update.location).toBeUndefined()
  })

  it('summary 가 trim 처리됨', () => {
    const vals = { ...eventToFormValues(baseEvent), summary: '  미팅  ' }
    const update = formValuesToUpdate(baseEvent, vals)
    expect(update.summary).toBe('미팅')
  })
})
