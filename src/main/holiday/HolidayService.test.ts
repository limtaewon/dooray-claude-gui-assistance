import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})

import { HolidayService, HOLIDAY_CALENDAR_ID, HOLIDAY_CALENDAR_NAME, isPublicHoliday } from './HolidayService'

// Google 한국 공휴일 피드는 DESCRIPTION 으로 "공휴일" / "기념일\n..." 두 종류 구분.
// v1.5 #18 부터는 "공휴일" 만 노출, 기념일(식목일/어버이날 등)은 제외.
const SAMPLE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:hol-1@google.com',
  'SUMMARY:삼일절',
  'DESCRIPTION:공휴일',
  'DTSTART;VALUE=DATE:20260301',
  'DTEND;VALUE=DATE:20260302',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:hol-2@google.com',
  'SUMMARY:어린이날',
  'DESCRIPTION:공휴일',
  'DTSTART;VALUE=DATE:20260505',
  'DTEND;VALUE=DATE:20260506',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:obs-1@google.com',
  'SUMMARY:식목일',
  'DESCRIPTION:기념일\\n기념일을 숨기려면 Google Calendar 설정 > 대한민국의 휴일 캘린더로 이동하세요.',
  'DTSTART;VALUE=DATE:20260405',
  'DTEND;VALUE=DATE:20260406',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n')

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => SAMPLE_ICS
  })))
})

describe('HolidayService 상수', () => {
  it('캘린더 ID/이름 노출', () => {
    expect(HOLIDAY_CALENDAR_ID).toBe('holiday-kr')
    expect(HOLIDAY_CALENDAR_NAME).toBe('한국 공휴일')
  })
})

describe('HolidayService.refresh + getHolidays', () => {
  it('DESCRIPTION="공휴일" 인 항목만 노출 (기념일 식목일 제외)', async () => {
    const svc = new HolidayService()
    const r = await svc.refresh()
    expect(r).toHaveLength(2)
    expect(r.map((e) => e.name).sort()).toEqual(['삼일절', '어린이날'])
    expect(r.find((e) => e.name === '식목일')).toBeUndefined()
  })

  it('첫 호출 시 fetch, 두 번째는 캐시 hit', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => SAMPLE_ICS }))
    vi.stubGlobal('fetch', fetchMock)
    const svc = new HolidayService()
    await svc.getHolidays()
    const before = fetchMock.mock.calls.length
    await svc.getHolidays()
    expect(fetchMock.mock.calls.length).toBe(before)  // 캐시 hit → 추가 호출 없음
  })

  it('fetch 실패(non-ok) 시 폴백', async () => {
    // 이미 캐시가 차있을 수도 있으므로 길이만 부드럽게 검증
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => '' })))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const svc = new HolidayService()
    const r = await svc.refresh()
    expect(Array.isArray(r)).toBe(true)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  describe('isPublicHoliday', () => {
    it('"공휴일" 시작 → true', () => {
      expect(isPublicHoliday('공휴일')).toBe(true)
      expect(isPublicHoliday('공휴일 (대체)')).toBe(true)
      expect(isPublicHoliday('  공휴일  ')).toBe(true)
    })
    it('"기념일" 시작 → false', () => {
      expect(isPublicHoliday('기념일\n기념일을 숨기려면...')).toBe(false)
    })
    it('빈 값 → false (안 쉬는 날로 간주, 보수적)', () => {
      expect(isPublicHoliday(undefined)).toBe(false)
      expect(isPublicHoliday('')).toBe(false)
    })
  })

  it('fetch throw 시 안전하게 폴백', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const svc = new HolidayService()
    const r = await svc.refresh()
    expect(Array.isArray(r)).toBe(true)
    errSpy.mockRestore()
  })
})
