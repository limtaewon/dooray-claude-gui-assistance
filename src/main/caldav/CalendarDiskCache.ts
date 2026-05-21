import Store from 'electron-store'
import type { UnifiedEvent } from '../../shared/types/calendar'

interface EventsCacheEntry {
  ts: number
  data: UnifiedEvent[]
}

interface CTagEntry {
  ctag: string
  checkedAt: number
}

interface DiskDB {
  /** key = "from|to" ISO range */
  events: Record<string, EventsCacheEntry>
  /** key = calendar URL */
  ctags: Record<string, CTagEntry>
}

const store = new Store<DiskDB>({
  name: 'calendar-cache',
  defaults: { events: {}, ctags: {} }
})

/**
 * v1.5 디스크 캐시 — 앱 재시작 후에도 즉시 일정 표시 + stale-while-revalidate.
 * - events: range 별 UnifiedEvent[] 캐시
 * - ctags: 캘린더별 마지막 본 ctag (변경 감지용)
 */
export const CalendarDiskCache = {
  getEvents(cacheKey: string): EventsCacheEntry | undefined {
    return store.get('events')[cacheKey]
  },

  setEvents(cacheKey: string, entry: EventsCacheEntry): void {
    const events = store.get('events')
    events[cacheKey] = entry
    store.set('events', events)
  },

  invalidateAllEvents(): void {
    store.set('events', {})
  },

  getCTag(calendarUrl: string): CTagEntry | undefined {
    return store.get('ctags')[calendarUrl]
  },

  setCTag(calendarUrl: string, ctag: string): void {
    const ctags = store.get('ctags')
    ctags[calendarUrl] = { ctag, checkedAt: Date.now() }
    store.set('ctags', ctags)
  },

  clearCTags(): void {
    store.set('ctags', {})
  },

  /** 자격증명 변경/연결 해제 시 호출 */
  clearAll(): void {
    store.set('events', {})
    store.set('ctags', {})
  }
}
