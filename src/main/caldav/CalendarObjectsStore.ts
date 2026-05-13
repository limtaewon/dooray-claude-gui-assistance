import Store from 'electron-store'

export interface StoredObject {
  etag: string
  ics: string
}

interface DB {
  /** calendarUrl → href → { etag, ics } */
  objects: Record<string, Record<string, StoredObject>>
  /** 캘린더 메타(displayName, color 등) 캐시 */
  calendarMeta: Record<string, { displayName: string; color?: string }>
}

const store = new Store<DB>({
  name: 'caldav-objects',
  defaults: { objects: {}, calendarMeta: {} }
})

/**
 * v1.5 — CalDAV ICS 객체 영구 저장소.
 * 모든 listEvents 는 이 store 를 읽고, sync 만이 caldav 서버를 직접 호출.
 */
export const CalendarObjectsStore = {
  getCalendar(calendarUrl: string): Record<string, StoredObject> {
    return store.get('objects')[calendarUrl] ?? {}
  },

  setCalendar(calendarUrl: string, objects: Record<string, StoredObject>): void {
    const all = store.get('objects')
    all[calendarUrl] = objects
    store.set('objects', all)
  },

  upsertObject(calendarUrl: string, href: string, obj: StoredObject): void {
    const all = store.get('objects')
    if (!all[calendarUrl]) all[calendarUrl] = {}
    all[calendarUrl][href] = obj
    store.set('objects', all)
  },

  deleteObject(calendarUrl: string, href: string): void {
    const all = store.get('objects')
    if (all[calendarUrl]) {
      delete all[calendarUrl][href]
      store.set('objects', all)
    }
  },

  clearCalendar(calendarUrl: string): void {
    const all = store.get('objects')
    delete all[calendarUrl]
    store.set('objects', all)
  },

  clearAll(): void {
    store.set('objects', {})
    store.set('calendarMeta', {})
  },

  /** 캐시된 모든 객체를 평탄화하여 반환 (listEvents 가 사용) */
  getAllObjects(): Array<{ calendarUrl: string; href: string; obj: StoredObject }> {
    const all = store.get('objects')
    const out: Array<{ calendarUrl: string; href: string; obj: StoredObject }> = []
    for (const [calUrl, hrefs] of Object.entries(all)) {
      for (const [href, obj] of Object.entries(hrefs)) {
        out.push({ calendarUrl: calUrl, href, obj })
      }
    }
    return out
  },

  /** 동기화된 캘린더 URL 목록 */
  listCalendarUrls(): string[] {
    return Object.keys(store.get('objects'))
  },

  /** 모든 캘린더의 ICS 객체 총 개수 — sync 필요 여부 판단용 */
  totalObjectCount(): number {
    const all = store.get('objects')
    let total = 0
    for (const hrefs of Object.values(all)) total += Object.keys(hrefs).length
    return total
  },

  // ── 캘린더 메타 (displayName/color) — listCalendars 가 사용 ──

  setCalendarMeta(calendarUrl: string, meta: { displayName: string; color?: string }): void {
    const all = store.get('calendarMeta')
    all[calendarUrl] = meta
    store.set('calendarMeta', all)
  },

  getCalendarMeta(calendarUrl: string): { displayName: string; color?: string } | undefined {
    return store.get('calendarMeta')[calendarUrl]
  },

  getAllCalendarMeta(): Record<string, { displayName: string; color?: string }> {
    return store.get('calendarMeta')
  }
}
