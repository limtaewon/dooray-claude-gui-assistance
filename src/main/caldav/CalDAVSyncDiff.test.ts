/**
 * CalDAV incrementalSyncCalendar — sync-diff 로직 단위 테스트.
 *
 * 목적: 서버에 새 href 가 추가됐을 때 반드시 fetch → store 저장 → added=1 이 되는지 검증.
 * CalDAVClient 는 fetch/tsdav 등 외부 IO 가 많아 핵심 diff 로직만 순수 함수로 분리하여 검증.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// electron-store 는 인메모리로 교체
vi.mock('electron-store', async () => {
  const { MemElectronStore } = await import('../../../test/mocks/electron-store')
  return { default: MemElectronStore }
})

// CalDAVCredentialStore.load() — basicAuthHeader 내부에서 사용
vi.mock('./CredentialStore', () => ({
  CalDAVCredentialStore: {
    has: () => true,
    load: () => ({ username: 'user', password: 'pass' })
  }
}))

import { CalendarObjectsStore } from './CalendarObjectsStore'
import { CalDAVClient } from './CalDAVClient'

// CalDAVClient 의 private 헬퍼/필드를 테스트에서 직접 조작하기 위해 any 로 노출.
// (prod 코드의 private 가시성은 그대로 두고 테스트 쪽에서만 우회)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeClient(): any {
  return new CalDAVClient()
}

const CAL_URL = 'https://caldav.dooray.com/caldav/v2/user@example.com/'
const SAMPLE_ICS = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:evt-1\nSUMMARY:새 일정\nDTSTART:20260619T090000Z\nDTEND:20260619T100000Z\nEND:VEVENT\nEND:VCALENDAR`

beforeEach(() => {
  CalendarObjectsStore.clearAll()
})

describe('incrementalSyncCalendar — sync-diff 로직', () => {
  it('서버에 새 href 가 생기면 added=1 이 되고 store 에 저장된다', async () => {
    const client = makeClient()
    const newHref = `${CAL_URL}evt-1.ics`

    // fetchHrefMap: 서버가 newHref 1개를 반환 (캐시에는 없음)
    client.fetchHrefMap = vi.fn().mockResolvedValue(new Map([[newHref, 'etag-v1']]))
    // multigetObjects: ICS 본문 반환
    client.multigetObjects = vi.fn().mockResolvedValue([
      { href: newHref, etag: 'etag-v1', calendarData: SAMPLE_ICS }
    ])

    const diff = await client.incrementalSyncCalendar(CAL_URL)

    expect(diff.added).toBe(1)
    expect(diff.updated).toBe(0)
    expect(diff.deleted).toBe(0)

    // store 에 저장됐는지 확인
    const stored = CalendarObjectsStore.getCalendar(CAL_URL)
    expect(stored[newHref]).toBeDefined()
    expect(stored[newHref].etag).toBe('etag-v1')
    expect(stored[newHref].ics).toBe(SAMPLE_ICS)
  })

  it('etag 가 바뀐 href 는 updated=1 이 된다', async () => {
    const client = makeClient()
    const href = `${CAL_URL}evt-2.ics`
    // 미리 캐시에 넣기
    CalendarObjectsStore.upsertObject(CAL_URL, href, { etag: 'old-etag', ics: SAMPLE_ICS })

    const updatedIcs = SAMPLE_ICS.replace('새 일정', '수정된 일정')
    client.fetchHrefMap = vi.fn().mockResolvedValue(new Map([[href, 'new-etag']]))
    client.multigetObjects = vi.fn().mockResolvedValue([
      { href, etag: 'new-etag', calendarData: updatedIcs }
    ])

    const diff = await client.incrementalSyncCalendar(CAL_URL)

    expect(diff.added).toBe(0)
    expect(diff.updated).toBe(1)
    expect(diff.deleted).toBe(0)

    const stored = CalendarObjectsStore.getCalendar(CAL_URL)
    expect(stored[href].etag).toBe('new-etag')
    expect(stored[href].ics).toBe(updatedIcs)
  })

  it('캐시에 있는데 서버에서 사라진 href 는 deleted=1 이 되고 store 에서 제거된다', async () => {
    const client = makeClient()
    const href = `${CAL_URL}evt-3.ics`
    CalendarObjectsStore.upsertObject(CAL_URL, href, { etag: 'e1', ics: SAMPLE_ICS })

    // 서버는 이 href 를 더 이상 반환하지 않음
    client.fetchHrefMap = vi.fn().mockResolvedValue(new Map())
    client.multigetObjects = vi.fn().mockResolvedValue([])

    const diff = await client.incrementalSyncCalendar(CAL_URL)

    expect(diff.added).toBe(0)
    expect(diff.updated).toBe(0)
    expect(diff.deleted).toBe(1)

    const stored = CalendarObjectsStore.getCalendar(CAL_URL)
    expect(stored[href]).toBeUndefined()
  })

  it('etag 동일한 href 는 toFetch 에 포함되지 않아 multiget 호출이 없다', async () => {
    const client = makeClient()
    const href = `${CAL_URL}evt-4.ics`
    CalendarObjectsStore.upsertObject(CAL_URL, href, { etag: 'same-etag', ics: SAMPLE_ICS })

    client.fetchHrefMap = vi.fn().mockResolvedValue(new Map([[href, 'same-etag']]))
    client.multigetObjects = vi.fn().mockResolvedValue([])

    const diff = await client.incrementalSyncCalendar(CAL_URL)

    expect(diff.added).toBe(0)
    expect(diff.updated).toBe(0)
    expect(diff.deleted).toBe(0)
    // multiget 은 호출되지 않아야 함 (fetch 없음)
    expect(client.multigetObjects).not.toHaveBeenCalled()
  })

  it('skipHrefs 에 포함된 href 는 toFetch 에 포함되지 않는다 (최근 삭제 부활 방지)', async () => {
    const client = makeClient()
    const href = `${CAL_URL}evt-5.ics`

    // 서버에는 있지만 방금 삭제한 항목 — skip
    client.fetchHrefMap = vi.fn().mockResolvedValue(new Map([[href, 'etag-v1']]))
    client.multigetObjects = vi.fn().mockResolvedValue([
      { href, etag: 'etag-v1', calendarData: SAMPLE_ICS }
    ])

    const skipHrefs = new Set([href])
    const diff = await client.incrementalSyncCalendar(CAL_URL, skipHrefs)

    expect(diff.added).toBe(0)
    expect(client.multigetObjects).not.toHaveBeenCalled()
  })

  it('대량 삭제 가드 — toDelete > 1000 이면 아무것도 안 하고 0 반환', async () => {
    const client = makeClient()
    // 캐시에 1001개 넣기
    const objects: Record<string, { etag: string; ics: string }> = {}
    for (let i = 0; i < 1001; i++) {
      objects[`${CAL_URL}evt-${i}.ics`] = { etag: `e${i}`, ics: SAMPLE_ICS }
    }
    CalendarObjectsStore.setCalendar(CAL_URL, objects)

    // 서버는 0개 반환 → 전체가 toDelete 로 분류
    client.fetchHrefMap = vi.fn().mockResolvedValue(new Map())
    client.multigetObjects = vi.fn()

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const diff = await client.incrementalSyncCalendar(CAL_URL)

    expect(diff.added).toBe(0)
    expect(diff.updated).toBe(0)
    expect(diff.deleted).toBe(0)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('삭제 대상'))
    // store 는 그대로 — 1001개 유지
    expect(Object.keys(CalendarObjectsStore.getCalendar(CAL_URL))).toHaveLength(1001)
    warnSpy.mockRestore()
  })
})

describe('incrementalSyncAll — 캐시 무효화 및 요약 로그', () => {
  it('sync 시작 시 rawCalendarsCache 가 무효화되어 getRawCalendars 가 재호출된다', async () => {
    const client = makeClient()

    // getRawCalendars 내부의 tsdav fetchCalendars 를 mock
    let fetchCount = 0
    // private 필드 강제 주입
    client.rawCalendarsCache = { ts: Date.now(), data: [{ url: CAL_URL }] }

    client.fetchHrefMap = vi.fn().mockResolvedValue(new Map())
    client.multigetObjects = vi.fn().mockResolvedValue([])

    // getClient mock → fetchCalendars 호출 카운트 확인
    const fetchCalendars = vi.fn().mockResolvedValue([{ url: CAL_URL }])
    client.getClient = vi.fn().mockResolvedValue({ fetchCalendars })

    await client.incrementalSyncAll()

    // rawCalendarsCache 무효화 → getClient().fetchCalendars() 호출됨
    expect(fetchCalendars).toHaveBeenCalledTimes(1)
    fetchCount++
    expect(fetchCount).toBe(1)
  })

  it('변경 없는 캘린더는 anyChange=false 반환', async () => {
    const client = makeClient()
    const href = `${CAL_URL}evt-1.ics`
    CalendarObjectsStore.upsertObject(CAL_URL, href, { etag: 'e1', ics: SAMPLE_ICS })

    client.rawCalendarsCache = null
    client.getClient = vi.fn().mockResolvedValue({
      fetchCalendars: vi.fn().mockResolvedValue([{ url: CAL_URL }])
    })
    client.fetchHrefMap = vi.fn().mockResolvedValue(new Map([[href, 'e1']]))
    client.multigetObjects = vi.fn().mockResolvedValue([])

    const result = await client.incrementalSyncAll()

    expect(result.anyChange).toBe(false)
    expect(result.added).toBe(0)
  })

  it('새 이벤트 추가 시 anyChange=true, added=1 반환', async () => {
    const client = makeClient()
    const href = `${CAL_URL}new-event.ics`

    client.rawCalendarsCache = null
    client.getClient = vi.fn().mockResolvedValue({
      fetchCalendars: vi.fn().mockResolvedValue([{ url: CAL_URL }])
    })
    client.fetchHrefMap = vi.fn().mockResolvedValue(new Map([[href, 'etag-new']]))
    client.multigetObjects = vi.fn().mockResolvedValue([
      { href, etag: 'etag-new', calendarData: SAMPLE_ICS }
    ])

    const result = await client.incrementalSyncAll()

    expect(result.anyChange).toBe(true)
    expect(result.added).toBe(1)
  })
})
