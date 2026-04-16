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
  constructor(private client: DoorayClient) {}

  private sortEvents(events: DoorayCalendarEvent[]): DoorayCalendarEvent[] {
    return events.sort((a, b) => {
      const aStart = a.startedAt || a.startAt || ''
      const bStart = b.startedAt || b.startAt || ''
      return new Date(aStart).getTime() - new Date(bStart).getTime()
    })
  }

  async listCalendars(): Promise<Calendar[]> {
    try {
      const res = await this.client.request<DoorayListResponse<Calendar>>('/calendar/v1/calendars')
      return res.result || []
    } catch { return [] }
  }

  private async getMyCalendarIds(): Promise<string[]> {
    try {
      const res = await this.client.request<DoorayListResponse<Calendar>>(
        '/calendar/v1/calendars'
      )
      return (res.result || []).map((c) => c.id)
    } catch {
      return []
    }
  }

  async getEvents(params: DoorayCalendarQueryParams): Promise<DoorayCalendarEvent[]> {
    const calendarIds = await this.getMyCalendarIds()
    if (calendarIds.length === 0) return []

    try {
      // 와일드카드 패턴으로 한 번에 조회 시도
      const calendarParam = calendarIds.join(',')
      const res = await this.client.request<DoorayListResponse<DoorayCalendarEvent>>(
        `/calendar/v1/calendars/*/events?timeMin=${encodeURIComponent(params.from)}&timeMax=${encodeURIComponent(params.to)}&calendars=${calendarParam}`
      )
      const events = res.result || []
      return this.sortEvents(events)
    } catch {
      // 와일드카드 실패 시 개별 캘린더 조회로 폴백
      const allEvents: DoorayCalendarEvent[] = []
      const results = await Promise.allSettled(
        calendarIds.slice(0, 5).map((calendarId) =>
          this.client.request<DoorayListResponse<DoorayCalendarEvent>>(
            `/calendar/v1/calendars/${calendarId}/events?timeMin=${encodeURIComponent(params.from)}&timeMax=${encodeURIComponent(params.to)}&size=50`
          )
        )
      )
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allEvents.push(...(result.value.result || []))
        }
      }
      return this.sortEvents(allEvents)
    }
  }
}
