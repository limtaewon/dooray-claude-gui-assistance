import { DoorayClient } from './DoorayClient'
import type { DoorayCalendarEvent, DoorayCalendarQueryParams } from '../../shared/types/dooray'

interface DoorayListResponse<T> {
  header: { resultCode: number; isSuccessful: boolean }
  result: T[]
}

interface Calendar {
  id: string
  name: string
  type: string
}

export class CalendarService {
  private calendarsCache: { data: Calendar[]; timestamp: number } | null = null
  private static CAL_TTL = 5 * 60 * 1000 // 5분

  constructor(private client: DoorayClient) {}

  private sortEvents(events: DoorayCalendarEvent[]): DoorayCalendarEvent[] {
    return events.sort((a, b) => {
      const aStart = a.startedAt || a.startAt || ''
      const bStart = b.startedAt || b.startAt || ''
      return new Date(aStart).getTime() - new Date(bStart).getTime()
    })
  }

  async listCalendars(): Promise<Calendar[]> {
    if (this.calendarsCache && Date.now() - this.calendarsCache.timestamp < CalendarService.CAL_TTL) {
      return this.calendarsCache.data
    }
    const res = await this.client.request<DoorayListResponse<Calendar>>('/calendar/v1/calendars')
    const data = res.result || []
    this.calendarsCache = { data, timestamp: Date.now() }
    return data
  }

  private async getMyCalendarIds(): Promise<string[]> {
    const list = await this.listCalendars()
    return list.map((c) => c.id)
  }

  async getEvents(params: DoorayCalendarQueryParams): Promise<DoorayCalendarEvent[]> {
    const calendarIds = await this.getMyCalendarIds()
    if (calendarIds.length === 0) return []

    try {
      // 와일드카드 패턴으로 한 번에 조회 시도
      const calendarParam = calendarIds.join(',')
      const res = await this.client.request<DoorayListResponse<DoorayCalendarEvent>>(
        `/calendar/v1/calendars/*/events?timeMin=${encodeURIComponent(params.from)}&timeMax=${encodeURIComponent(params.to)}&calendars=${calendarParam}`,
        { timeoutMs: 12000 }
      )
      const events = res.result || []
      return this.sortEvents(events)
    } catch (wildcardErr) {
      // 와일드카드 실패 시 개별 캘린더 조회로 폴백 (전체 캘린더 대상, 병렬)
      const allEvents: DoorayCalendarEvent[] = []
      const seen = new Set<string>()
      const results = await Promise.allSettled(
        calendarIds.map((calendarId) =>
          this.client.request<DoorayListResponse<DoorayCalendarEvent>>(
            `/calendar/v1/calendars/${calendarId}/events?timeMin=${encodeURIComponent(params.from)}&timeMax=${encodeURIComponent(params.to)}&size=50`,
            { timeoutMs: 10000 }
          )
        )
      )
      let failureCount = 0
      for (const result of results) {
        if (result.status === 'fulfilled') {
          for (const ev of (result.value.result || [])) {
            if (ev.id && !seen.has(ev.id)) { seen.add(ev.id); allEvents.push(ev) }
          }
        } else {
          failureCount++
        }
      }
      // 모두 실패하면 상위 오류를 surface (UI에서 에러 표시)
      if (allEvents.length === 0 && failureCount === calendarIds.length) {
        throw new Error(`캘린더 조회 실패: ${wildcardErr instanceof Error ? wildcardErr.message : '알 수 없는 오류'}`)
      }
      return this.sortEvents(allEvents)
    }
  }
}
