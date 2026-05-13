import Store from 'electron-store'
import { parseICal } from '../caldav/ical'

/**
 * v1.5 — Google Calendar 공개 한국 공휴일 ICS 통합.
 * 자격증명 없이 fetch, ICS 표준이라 parseICal 재사용. 7일 디스크 캐시.
 *
 * 모든 사용자에게 공통으로 노출되는 한국 공휴일 데이터.
 */

const HOLIDAY_ICS_URL = 'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics'

export const HOLIDAY_CALENDAR_ID = 'holiday-kr'
export const HOLIDAY_CALENDAR_NAME = '한국 공휴일'

interface HolidayEntry {
  uid: string
  /** ISO 8601 — 종일 이벤트라 보통 00:00:00 */
  start: string
  end: string
  name: string
}

interface DB {
  version?: number
  fetchedAt: number
  entries: HolidayEntry[]
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** 파서 변경 시 옛 캐시 무효화 위한 버전. parseICal 의 종일 DTEND 보정 적용을 위해 2 로 올림 */
const CACHE_VERSION = 2

const store = new Store<DB>({
  name: 'holidays-cache',
  defaults: { version: 0, fetchedAt: 0, entries: [] }
})

export class HolidayService {
  /** 캐시 hit 이면 즉시, 없거나 만료/구버전이면 fetch 후 반환 */
  async getHolidays(): Promise<HolidayEntry[]> {
    const version = store.get('version') ?? 0
    if (version !== CACHE_VERSION) {
      console.log('[HolidayService] 캐시 버전 불일치 → 무효화 후 재페치')
      return this.refresh()
    }
    const fetchedAt = store.get('fetchedAt')
    const entries = store.get('entries')
    if (entries.length > 0 && Date.now() - fetchedAt < CACHE_TTL_MS) return entries
    return this.refresh()
  }

  /** 강제 refetch */
  async refresh(): Promise<HolidayEntry[]> {
    try {
      const resp = await fetch(HOLIDAY_ICS_URL, { headers: { Accept: 'text/calendar' } })
      if (!resp.ok) {
        console.error('[HolidayService] fetch 실패:', resp.status)
        return store.get('entries')
      }
      const ics = await resp.text()
      const entries = this.parseAllVEvents(ics)
      store.set('version', CACHE_VERSION)
      store.set('fetchedAt', Date.now())
      store.set('entries', entries)
      console.log(`[HolidayService] ${entries.length}건 캐시 갱신 (v${CACHE_VERSION})`)
      return entries
    } catch (e) {
      console.error('[HolidayService] fetch 오류:', e)
      return store.get('entries')
    }
  }

  /** Google ICS 안 모든 VEVENT 추출 (한 VCALENDAR 안 수백 건) */
  private parseAllVEvents(ics: string): HolidayEntry[] {
    const blocks = ics.split('BEGIN:VEVENT').slice(1)
    const out: HolidayEntry[] = []
    for (const b of blocks) {
      const end = b.indexOf('END:VEVENT')
      if (end < 0) continue
      const wrapped = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT${b.slice(0, end + 'END:VEVENT'.length)}\r\nEND:VCALENDAR`
      const parsed = parseICal(wrapped)
      if (!parsed) continue
      out.push({
        uid: parsed.uid,
        start: parsed.start,
        end: parsed.end,
        name: parsed.summary
      })
    }
    return out
  }
}

export type { HolidayEntry }
