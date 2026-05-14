import { describe, it, expect } from 'vitest'
import { parseICal, buildICal, bundleICal } from './ical'

describe('parseICal — 기본 VEVENT', () => {
  it('UID/SUMMARY/DTSTART/DTEND 가 있으면 파싱한다', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:abc-123',
      'SUMMARY:회의',
      'DTSTART:20260513T090000Z',
      'DTEND:20260513T100000Z',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n')
    const ev = parseICal(ics)
    expect(ev).not.toBeNull()
    expect(ev!.uid).toBe('abc-123')
    expect(ev!.summary).toBe('회의')
    expect(ev!.allDay).toBe(false)
    expect(ev!.start).toBe('2026-05-13T09:00:00Z')
    expect(ev!.end).toBe('2026-05-13T10:00:00Z')
  })

  it('UID 없으면 null', () => {
    const ics = ['BEGIN:VCALENDAR','BEGIN:VEVENT','SUMMARY:x','DTSTART:20260101T000000Z','END:VEVENT','END:VCALENDAR'].join('\r\n')
    expect(parseICal(ics)).toBeNull()
  })

  it('VEVENT 없으면 null', () => {
    expect(parseICal('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toBeNull()
  })

  it('DTSTART 없으면 null', () => {
    const ics = ['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:x','SUMMARY:x','END:VEVENT','END:VCALENDAR'].join('\r\n')
    expect(parseICal(ics)).toBeNull()
  })

  it('SUMMARY 없으면 "(제목 없음)"', () => {
    const ics = ['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:x','DTSTART:20260101T000000Z','DTEND:20260101T010000Z','END:VEVENT','END:VCALENDAR'].join('\r\n')
    expect(parseICal(ics)!.summary).toBe('(제목 없음)')
  })
})

describe('parseICal — 종일 이벤트', () => {
  it('VALUE=DATE 형식이면 allDay=true', () => {
    const ics = [
      'BEGIN:VCALENDAR','BEGIN:VEVENT','UID:d1','SUMMARY:공휴일',
      'DTSTART;VALUE=DATE:20260513',
      'DTEND;VALUE=DATE:20260514',
      'END:VEVENT','END:VCALENDAR'
    ].join('\r\n')
    const ev = parseICal(ics)!
    expect(ev.allDay).toBe(true)
    expect(ev.start).toBe('2026-05-13T00:00:00')
    // DTEND 가 exclusive 이므로 5/14 → 5/13 (inclusive)
    expect(ev.end).toBe('2026-05-13T00:00:00')
  })

  it('YYYYMMDD 평문(parameter 없음)도 종일로 인식', () => {
    const ics = [
      'BEGIN:VCALENDAR','BEGIN:VEVENT','UID:d2','SUMMARY:x',
      'DTSTART:20260513',
      'END:VEVENT','END:VCALENDAR'
    ].join('\r\n')
    expect(parseICal(ics)!.allDay).toBe(true)
  })
})

describe('parseICal — ATTENDEE/ORGANIZER/ALARM/escape', () => {
  it('ATTENDEE / ORGANIZER 파싱', () => {
    const ics = [
      'BEGIN:VCALENDAR','BEGIN:VEVENT','UID:p1','SUMMARY:x',
      'DTSTART:20260101T000000Z',
      'ORGANIZER;CN=Alice:mailto:alice@example.com',
      'ATTENDEE;CN=Bob;PARTSTAT=ACCEPTED;ROLE=REQ-PARTICIPANT:mailto:bob@example.com',
      'ATTENDEE;PARTSTAT=DECLINED:mailto:carol@example.com',
      'END:VEVENT','END:VCALENDAR'
    ].join('\r\n')
    const ev = parseICal(ics)!
    expect(ev.organizer?.name).toBe('Alice')
    expect(ev.organizer?.email).toBe('alice@example.com')
    expect(ev.attendees).toHaveLength(2)
    expect(ev.attendees![0].partstat).toBe('ACCEPTED')
    expect(ev.attendees![0].role).toBe('REQ-PARTICIPANT')
    expect(ev.attendees![1].partstat).toBe('DECLINED')
  })

  it('VALARM 파싱', () => {
    const ics = [
      'BEGIN:VCALENDAR','BEGIN:VEVENT','UID:a1','SUMMARY:x',
      'DTSTART:20260101T000000Z',
      'BEGIN:VALARM','TRIGGER:-PT15M','ACTION:DISPLAY','DESCRIPTION:알림','END:VALARM',
      'END:VEVENT','END:VCALENDAR'
    ].join('\r\n')
    const ev = parseICal(ics)!
    expect(ev.alarms).toHaveLength(1)
    expect(ev.alarms![0].trigger).toBe('-PT15M')
    expect(ev.alarms![0].action).toBe('DISPLAY')
    expect(ev.alarms![0].description).toBe('알림')
  })

  it('escape 시퀀스 디코딩 (\\n, \\,, \\;, \\\\)', () => {
    const ics = [
      'BEGIN:VCALENDAR','BEGIN:VEVENT','UID:e1',
      'SUMMARY:line1\\nline2',
      'DESCRIPTION:a\\,b\\;c\\\\d',
      'DTSTART:20260101T000000Z',
      'END:VEVENT','END:VCALENDAR'
    ].join('\r\n')
    const ev = parseICal(ics)!
    expect(ev.summary).toBe('line1\nline2')
    expect(ev.description).toBe('a,b;c\\d')
  })

  it('line folding (RFC 5545) 처리', () => {
    // 두 번째 줄이 공백으로 시작 → 첫 줄에 이어붙임
    const ics = [
      'BEGIN:VCALENDAR','BEGIN:VEVENT','UID:f1',
      'SUMMARY:hello',
      ' world',
      'DTSTART:20260101T000000Z',
      'END:VEVENT','END:VCALENDAR'
    ].join('\r\n')
    const ev = parseICal(ics)!
    expect(ev.summary).toBe('helloworld')
  })
})

describe('buildICal / bundleICal', () => {
  it('buildICal 으로 만든 ICS 는 parseICal 으로 되돌릴 수 있다', () => {
    const ics = buildICal({
      uid: 'roundtrip',
      summary: '제목',
      description: '설명',
      location: '회의실 A',
      start: '2026-05-13T09:00:00Z',
      end: '2026-05-13T10:00:00Z'
    })
    const ev = parseICal(ics)!
    expect(ev.uid).toBe('roundtrip')
    expect(ev.summary).toBe('제목')
    expect(ev.description).toBe('설명')
    expect(ev.location).toBe('회의실 A')
  })

  it('allDay=true 이면 VALUE=DATE 형식으로 직렬화', () => {
    const ics = buildICal({
      uid: 'a',
      summary: 'x',
      start: '2026-05-13T00:00:00Z',
      end: '2026-05-13T00:00:00Z',
      allDay: true
    })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260513')
    expect(ics).toContain('DTEND;VALUE=DATE:20260513')
  })

  it('escape: 콤마/세미콜론/백슬래시/개행', () => {
    const ics = buildICal({
      uid: 'esc',
      summary: 'a,b;c\\d\nnext',
      start: '2026-05-13T00:00:00Z',
      end: '2026-05-13T01:00:00Z'
    })
    expect(ics).toContain('SUMMARY:a\\,b\\;c\\\\d\\nnext')
  })

  it('bundleICal 은 여러 VEVENT 를 단일 VCALENDAR 에 묶는다', () => {
    const e1 = buildICal({ uid: 'one', summary: '하나', start: '2026-05-13T00:00:00Z', end: '2026-05-13T01:00:00Z' })
    const e2 = buildICal({ uid: 'two', summary: '둘', start: '2026-05-14T00:00:00Z', end: '2026-05-14T01:00:00Z' })
    const bundled = bundleICal('내 캘린더', [e1, e2])
    expect(bundled).toContain('X-WR-CALNAME:내 캘린더')
    expect(bundled.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(bundled.match(/END:VEVENT/g)).toHaveLength(2)
  })

  it('bundleICal — VEVENT 없는 입력은 빈 캘린더', () => {
    const bundled = bundleICal('비어있음', ['BEGIN:VCALENDAR\r\nEND:VCALENDAR'])
    expect(bundled.match(/BEGIN:VEVENT/g)).toBeNull()
  })
})
