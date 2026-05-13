import { BrowserWindow } from 'electron'
import type {
  UnifiedCalendar,
  UnifiedEvent,
  UnifiedEventCreate,
  UnifiedEventQuery
} from '../../shared/types/calendar'
import { CalDAVClient, type SyncProgress } from './CalDAVClient'
import { CalDAVCredentialStore } from './CredentialStore'
import { LocalEventStore } from './LocalEventStore'
import { CalendarObjectsStore } from './CalendarObjectsStore'
import { parseICal } from './ical'
import { HolidayService, HOLIDAY_CALENDAR_ID, HOLIDAY_CALENDAR_NAME } from '../holiday/HolidayService'

/**
 * v1.5 통합 캘린더 서비스 — ObjectsStore 기반.
 *
 * listEvents 는 더 이상 CalDAV 서버를 직접 호출하지 않음:
 *   - 모든 ICS 는 CalendarObjectsStore (디스크 영구 저장)에 있음
 *   - listEvents 는 store 에서 ICS 파싱 → 메모리 캐시 → range/calendar 필터만 수행
 *
 * 서버 호출은 동기화 시점에만:
 *   - fullSync: 자격증명 첫 저장 시 (전체 받아오기)
 *   - incrementalSync: poller 가 30~60초 주기로 etag diff 만 fetch
 */
export class UnifiedCalendarService {
  /** 모든 ICS 를 한 번 파싱한 결과 — sync 시 invalidate */
  private parsedCache: UnifiedEvent[] | null = null
  /** 캘린더 메타 캐시 */
  private calendarsCache: UnifiedCalendar[] | null = null
  /** 자동 fullSync 진행 중 플래그 (중복 트리거 방지) */
  private autoSyncInflight = false
  /** 마지막 자동 시도 시각 — 0개 결과로 끝나도 일정 시간 재시도 안 함 (무한 루프 방지) */
  private autoSyncLastAttempt = 0
  private static AUTO_SYNC_COOLDOWN_MS = 60_000
  /** 최근 삭제한 href — 60초 안엔 incrementalSync 에서 무시 (두레이 캐시로 인한 부활 방지) */
  private recentlyDeleted = new Map<string, number>()
  private static RECENT_DELETE_GRACE_MS = 60_000

  constructor(private readonly caldav: CalDAVClient, private readonly holiday: HolidayService) {}

  /** ICS 캐시가 비어있고 자격증명 있으면 백그라운드 fullSync 1회 트리거 */
  private maybeAutoSync(): void {
    if (this.autoSyncInflight) return
    if (Date.now() - this.autoSyncLastAttempt < UnifiedCalendarService.AUTO_SYNC_COOLDOWN_MS) return
    if (!CalDAVCredentialStore.has()) return
    if (CalendarObjectsStore.totalObjectCount() > 0) return
    this.autoSyncInflight = true
    this.autoSyncLastAttempt = Date.now()
    console.log('[UnifiedCalendarService] 자동 fullSync 트리거 (ICS 캐시 0건)')
    this.fullSync()
      .then((r) => console.log('[UnifiedCalendarService] 자동 fullSync 완료:', r))
      .catch((e) => console.error('[UnifiedCalendarService] 자동 fullSync 실패:', e))
      .finally(() => { this.autoSyncInflight = false })
  }

  invalidateCache(): void {
    this.parsedCache = null
    this.calendarsCache = null
  }

  emitUpdate(): void {
    const wins = BrowserWindow.getAllWindows()
    console.log('[emitUpdate] sending caldav-updated to', wins.length, 'window(s)')
    for (const w of wins) {
      if (!w.isDestroyed()) w.webContents.send('caldav-updated')
    }
  }

  emitSyncProgress(p: SyncProgress | { stage: 'start' | 'complete' | 'error'; message?: string }): void {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('caldav-sync-progress', p)
    }
  }

  getCalDAVClient(): CalDAVClient {
    return this.caldav
  }

  // ─────────────────────────────────────────────────────────────
  // 캘린더 메타
  // ─────────────────────────────────────────────────────────────

  async listCalendars(): Promise<UnifiedCalendar[]> {
    this.maybeAutoSync()
    if (this.calendarsCache) return this.calendarsCache
    const out: UnifiedCalendar[] = []
    for (const c of LocalEventStore.listCalendars()) {
      out.push({
        source: 'local',
        id: c.id,
        name: c.name,
        color: c.color,
        writable: true
      })
    }

    // CalDAV 메타 — ObjectsStore 비어있으면 두레이 직접 호출해서 메타만 즉시 받아옴 (fallback)
    let meta = CalendarObjectsStore.getAllCalendarMeta()
    if (Object.keys(meta).length === 0 && CalDAVCredentialStore.has()) {
      try {
        const caldavCals = await this.caldav.listCalendars()
        for (const c of caldavCals) {
          CalendarObjectsStore.setCalendarMeta(c.url, { displayName: c.displayName, color: c.color })
        }
        meta = CalendarObjectsStore.getAllCalendarMeta()
      } catch (e) {
        console.error('[UnifiedCalendarService] caldav 메타 fallback 실패:', e)
      }
    }
    for (const [url, m] of Object.entries(meta)) {
      out.push({
        source: 'caldav',
        id: url,
        name: m.displayName,
        color: m.color,
        writable: true
      })
    }
    // 공휴일 — 한국 가상 캘린더 (보라색)
    out.push({
      source: 'holiday',
      id: HOLIDAY_CALENDAR_ID,
      name: HOLIDAY_CALENDAR_NAME,
      color: '#a78bfa',
      writable: false
    })
    this.calendarsCache = out
    return out
  }

  // ─────────────────────────────────────────────────────────────
  // 이벤트 — ObjectsStore 기반
  // ─────────────────────────────────────────────────────────────

  /** ObjectsStore + LocalEventStore 의 전체 이벤트를 한 번에 파싱 후 메모리 캐시 */
  private buildParsedCache(): UnifiedEvent[] {
    const out: UnifiedEvent[] = []

    // CalDAV
    const allObjects = CalendarObjectsStore.getAllObjects()
    console.log('[buildParsedCache] objects count:', allObjects.length)
    for (const { calendarUrl, href, obj } of allObjects) {
      const parsed = parseICal(obj.ics)
      if (!parsed) continue
      out.push({
        source: 'caldav',
        id: parsed.uid,
        calendarId: calendarUrl,
        caldavUrl: href,
        etag: obj.etag,
        summary: parsed.summary,
        description: parsed.description,
        location: parsed.location,
        start: parsed.start,
        end: parsed.end,
        allDay: parsed.allDay,
        rrule: parsed.rrule,
        status: parsed.status,
        organizer: parsed.organizer,
        attendees: parsed.attendees,
        alarms: parsed.alarms,
        webUrl: parsed.url
      })
    }

    return out
  }

  async listEvents(query: UnifiedEventQuery): Promise<UnifiedEvent[]> {
    // 캐시 비었으면 백그라운드 fullSync 트리거 (즉시 반환, sync 끝나면 caldav-updated 이벤트로 reload)
    this.maybeAutoSync()
    if (!this.parsedCache) {
      console.log('[listEvents] parsedCache null → rebuild')
      this.parsedCache = this.buildParsedCache()
    } else {
      console.log('[listEvents] parsedCache hit, count:', this.parsedCache.length)
    }

    // 공휴일 — 시간 범위 안 일정을 매 호출 시 합산 (이미 캐시된 디스크 데이터라 빠름)
    const holidayEvents = await this.collectHolidays(query.from, query.to)
    const fromMs = new Date(query.from).getTime()
    const toMs = new Date(query.to).getTime()

    // 로컬 이벤트는 매번 store 에서 조회 (작고 가벼움 — local create 시 즉시 반영)
    const local = LocalEventStore.listEvents(query.from, query.to).map((e): UnifiedEvent => ({
      source: 'local',
      id: e.id,
      calendarId: e.calendarId,
      summary: e.summary,
      description: e.description,
      location: e.location,
      start: e.start,
      end: e.end,
      allDay: e.allDay
    }))

    // CalDAV 는 메모리 캐시에서 range 필터
    const caldav = this.parsedCache.filter((e) => {
      const s = new Date(e.start).getTime()
      const en = new Date(e.end).getTime()
      return en >= fromMs && s <= toMs
    })

    const merged = [...local, ...caldav, ...holidayEvents]
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

    return this.applyFilter(merged, query.calendarIds)
  }

  private applyFilter(events: UnifiedEvent[], calendarIds?: string[]): UnifiedEvent[] {
    if (!calendarIds || calendarIds.length === 0) return events
    const set = new Set(calendarIds)
    // 공휴일은 필터 무시 — 항상 표시 (사용자 끌 수 없음)
    return events.filter((e) => e.source === 'holiday' || set.has(e.calendarId))
  }

  /** 한국 공휴일 중 범위 안 일정을 UnifiedEvent 로 변환 */
  private async collectHolidays(from: string, to: string): Promise<UnifiedEvent[]> {
    const fromMs = new Date(from).getTime()
    const toMs = new Date(to).getTime()
    const out: UnifiedEvent[] = []
    try {
      const entries = await this.holiday.getHolidays()
      for (const h of entries) {
        const s = new Date(h.start).getTime()
        const en = new Date(h.end).getTime()
        if (en < fromMs || s > toMs) continue
        out.push({
          source: 'holiday',
          id: h.uid,
          calendarId: HOLIDAY_CALENDAR_ID,
          summary: h.name,
          start: h.start,
          end: h.end,
          allDay: true
        })
      }
    } catch (e) {
      console.error('[UnifiedCalendarService] 공휴일 collect 실패:', e)
    }
    return out
  }

  // ─────────────────────────────────────────────────────────────
  // 동기화 트리거
  // ─────────────────────────────────────────────────────────────

  async fullSync(): Promise<{ totalObjects: number }> {
    if (!CalDAVCredentialStore.has()) throw new Error('자격증명이 없습니다.')
    this.emitSyncProgress({ stage: 'start' })
    try {
      const result = await this.caldav.fullSyncAll((p) => this.emitSyncProgress(p))
      this.parsedCache = null
      this.calendarsCache = null
      this.emitSyncProgress({ stage: 'complete' })
      this.emitUpdate()
      return result
    } catch (e) {
      this.emitSyncProgress({ stage: 'error', message: e instanceof Error ? e.message : '동기화 실패' })
      throw e
    }
  }

  async incrementalSync(): Promise<{ anyChange: boolean }> {
    if (!CalDAVCredentialStore.has()) return { anyChange: false }
    // 최근 삭제 grace 만료된 항목 정리 + 현재 살아있는 skip set 구성
    const now = Date.now()
    const skipHrefs = new Set<string>()
    for (const [href, ts] of this.recentlyDeleted) {
      if (now - ts > UnifiedCalendarService.RECENT_DELETE_GRACE_MS) this.recentlyDeleted.delete(href)
      else skipHrefs.add(href)
    }
    const r = await this.caldav.incrementalSyncAll(skipHrefs.size > 0 ? skipHrefs : undefined)
    if (r.anyChange) {
      this.parsedCache = null
      this.emitUpdate()
    }
    return { anyChange: r.anyChange }
  }

  // ─────────────────────────────────────────────────────────────
  // 이벤트 CRUD
  // ─────────────────────────────────────────────────────────────

  async createEvent(input: UnifiedEventCreate): Promise<UnifiedEvent> {
    this.parsedCache = null
    if (input.source === 'local') {
      const e = LocalEventStore.createEvent({
        calendarId: input.calendarId,
        summary: input.summary,
        description: input.description,
        location: input.location,
        start: input.start,
        end: input.end,
        allDay: !!input.allDay
      })
      return {
        source: 'local',
        id: e.id,
        calendarId: e.calendarId,
        summary: e.summary,
        description: e.description,
        location: e.location,
        start: e.start,
        end: e.end,
        allDay: e.allDay
      }
    }
    await this.caldav.createEvent({
      calendarUrl: input.calendarId,
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: input.start,
      end: input.end,
      allDay: !!input.allDay
    })
    // 신규 객체를 곧바로 반영하려면 incremental sync 트리거
    this.incrementalSync().catch(() => { /* 백그라운드 */ })
    return {
      source: 'caldav',
      id: '',
      calendarId: input.calendarId,
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: input.start,
      end: input.end,
      allDay: !!input.allDay
    }
  }

  async deleteEvent(ev: { source: 'local' | 'caldav'; id: string; calendarId?: string; caldavUrl?: string; etag?: string }): Promise<void> {
    console.log('[deleteEvent] start, parsedCache:', this.parsedCache ? `EXISTS(${this.parsedCache.length})` : 'null')
    this.parsedCache = null
    console.log('[deleteEvent] after invalidate, parsedCache:', this.parsedCache ? 'EXISTS' : 'null')
    if (ev.source === 'local') {
      LocalEventStore.deleteEvent(ev.id)
      this.emitUpdate()
      return
    }
    if (!ev.caldavUrl) throw new Error('CalDAV 이벤트 삭제에 URL이 필요합니다.')
    await this.caldav.deleteEvent(ev.caldavUrl, ev.etag)
    // 부활 방지 — 60초 안엔 incrementalSync 에서 이 href 무시
    this.recentlyDeleted.set(ev.caldavUrl, Date.now())
    // 서버 삭제 성공 → 디스크 ObjectsStore 에서도 즉시 제거
    if (ev.calendarId) {
      const beforeCal = CalendarObjectsStore.getCalendar(ev.calendarId)
      const had = !!beforeCal[ev.caldavUrl]
      CalendarObjectsStore.deleteObject(ev.calendarId, ev.caldavUrl)
      const afterCal = CalendarObjectsStore.getCalendar(ev.calendarId)
      const stillHas = !!afterCal[ev.caldavUrl]
      console.log(`[Unified delete] calendarId=${ev.calendarId.slice(-20)} href=${ev.caldavUrl.slice(-40)} had=${had} stillHas=${stillHas}`)
    } else {
      console.warn('[Unified delete] calendarId 누락 — ObjectsStore 제거 못 함')
    }
    // ⚠ ObjectsStore 변경 후 한 번 더 invalidate — await caldav.deleteEvent 중에
    //   다른 listEvents 호출이 parsedCache 를 옛 데이터로 다시 빌드했을 수 있음 (race)
    this.parsedCache = null
    this.emitUpdate()
    // 두레이는 DELETE 직후에도 calendar-query 에 해당 href 를 잠시 더 반환함(서버 캐시).
    // 즉시 incrementalSync 하면 "방금 지운" 객체가 부활하므로 호출하지 않음.
  }
}
