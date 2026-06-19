import { createDAVClient } from 'tsdav'
import { CalDAVCredentialStore } from './CredentialStore'
import { CalendarObjectsStore } from './CalendarObjectsStore'
import { parseICal, buildICal, patchDateTimeInIcs } from './ical'

export interface SyncProgress {
  calendarUrl: string
  calendarName: string
  current: number
  total: number
  objectCount: number
}

export interface SyncDiff {
  added: number
  updated: number
  deleted: number
}

/** 동기화 기본 시간 범위 — 과거 6개월 ~ 미래 1년. 그 외 일정은 가져오지 않음. */
function defaultSyncRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  const to = new Date(now.getFullYear() + 1, now.getMonth(), 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

function randomUid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}@clauday`
}

function pad(n: number): string { return String(n).padStart(2, '0') }

type DAVClient = Awaited<ReturnType<typeof createDAVClient>>

/**
 * tsdav 가 캘린더의 displayName 을 string 또는 {_text}/{_cdata}/{value} 형식 객체로 줄 수 있음.
 * 두레이 응답에서 displayName 자체가 비어있거나 동일 문자열("두레이" 등) 인 경우도 있어
 * URL 마지막 segment 를 폴백 라벨로 사용해 캘린더를 구분 가능하게 만든다.
 */
function extractDisplayName(raw: unknown, url: string): string {
  // 1) 평문 string
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (s && s !== '두레이' && s !== '캘린더') return s
  }
  // 2) tsdav 가 XML 파서 결과를 객체로 감싼 경우
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    for (const key of ['_text', '_cdata', 'value', '#text', '_']) {
      const v = obj[key]
      if (typeof v === 'string' && v.trim()) {
        const s = v.trim()
        if (s !== '두레이' && s !== '캘린더') return s
      }
    }
  }
  // 3) URL 마지막 segment — `.../calendars/<user>/<calId>/` 에서 calId
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    const last = segs[segs.length - 1]
    if (last) return decodeURIComponent(last)
  } catch { /* invalid url, fallthrough */ }
  // 4) displayName 이 있긴 한데 "두레이" 같은 중복명이면 그대로라도 반환 (구분 못해도 라벨은 있음)
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return '캘린더'
}

// tsdav v2 의 fetchCalendarObjects 가 두레이 응답의 일부 필드에서 startsWith 호출하다
// 깨지는 호환성 문제 → REPORT 요청은 직접 HTTP 로 처리.
function basicAuthHeader(): string {
  const creds = CalDAVCredentialStore.load()
  if (!creds) throw new Error('자격증명 없음')
  return 'Basic ' + Buffer.from(`${creds.username}:${creds.password}`, 'utf-8').toString('base64')
}

/**
 * If-Match 헤더용 ETag 정규화 — 반드시 큰따옴표로 감싼 형태여야 한다.
 * 우리는 sync 시 etag 의 따옴표를 벗겨 저장하므로(`99e7...`), PUT 의 If-Match 에는 다시 큰따옴표를 씌운다.
 * Why: 두레이 CalDAV 는 따옴표 없는 If-Match 를 "불일치"로 보고 PUT 을 200 으로 받아주면서도
 * 본문 변경을 무시한다(=수정이 서버에 안 먹힘). 따옴표를 씌우면 정상 매칭되어 반영된다.
 */
function quoteEtag(etag?: string): string | undefined {
  if (!etag) return undefined
  const t = etag.trim()
  if (!t) return undefined
  return /^(W\/)?".*"$/.test(t) ? t : `"${t}"`
}

function fmtCalDavTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

interface MultiStatusEntry { href: string; etag?: string; calendarData?: string }

function parseMultiStatus(xml: string): MultiStatusEntry[] {
  const out: MultiStatusEntry[] = []
  const responseRegex = /<(?:[a-z0-9]+:)?response[\s>][\s\S]*?<\/(?:[a-z0-9]+:)?response>/gi
  const blocks = xml.match(responseRegex) || []
  for (const block of blocks) {
    const hrefMatch = block.match(/<(?:[a-z0-9]+:)?href[\s>]?([^<]*?)<\/(?:[a-z0-9]+:)?href>/i)
    const etagMatch = block.match(/<(?:[a-z0-9]+:)?getetag[\s>]?([^<]*?)<\/(?:[a-z0-9]+:)?getetag>/i)
    const dataMatch = block.match(/<(?:[a-z0-9]+:)?calendar-data[\s>]([\s\S]*?)<\/(?:[a-z0-9]+:)?calendar-data>/i)
    let data: string | undefined
    if (dataMatch) {
      data = dataMatch[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim()
    }
    if (hrefMatch) {
      out.push({
        href: hrefMatch[1].trim(),
        etag: etagMatch ? etagMatch[1].replace(/^["']|["']$/g, '').trim() : undefined,
        calendarData: data
      })
    }
  }
  return out
}
import type {
  CalDAVCalendar,
  CalDAVEvent,
  CalDAVEventCreate,
  CalDAVEventQuery,
  CalDAVTestResult
} from '../../shared/types/caldav'

const SERVER_URL = 'https://caldav.dooray.com'

/**
 * 두레이 CalDAV 클라이언트.
 * - 저장된 자격증명으로 lazy 연결
 * - testConnection 은 자격증명 저장 없이 임시 연결만 수행
 */
type RawCalendar = Awaited<ReturnType<DAVClient['fetchCalendars']>>[number]

const CAL_LIST_TTL_MS = 5 * 60_000 // tsdav fetchCalendars 5분 캐시

export class CalDAVClient {
  private client: DAVClient | null = null
  private connecting: Promise<DAVClient> | null = null
  private rawCalendarsCache: { ts: number; data: RawCalendar[] } | null = null
  private rawCalendarsInflight: Promise<RawCalendar[]> | null = null

  /** tsdav fetchCalendars 결과를 5분 캐시. 매 listEvents/listCalendars 호출 시 추가 HTTP 안 함. */
  private async getRawCalendars(): Promise<RawCalendar[]> {
    if (this.rawCalendarsCache && Date.now() - this.rawCalendarsCache.ts < CAL_LIST_TTL_MS) {
      return this.rawCalendarsCache.data
    }
    if (this.rawCalendarsInflight) return this.rawCalendarsInflight
    this.rawCalendarsInflight = (async () => {
      const c = await this.getClient()
      const data = await c.fetchCalendars()
      this.rawCalendarsCache = { ts: Date.now(), data }
      this.rawCalendarsInflight = null
      return data
    })()
    return this.rawCalendarsInflight
  }

  private async getClient(): Promise<DAVClient> {
    if (this.client) return this.client
    if (this.connecting) return this.connecting
    const creds = CalDAVCredentialStore.load()
    if (!creds) throw new Error('CalDAV 자격증명이 없습니다. 설정에서 연결해주세요.')
    this.connecting = (async (): Promise<DAVClient> => {
      const c = await createDAVClient({
        serverUrl: SERVER_URL,
        credentials: { username: creds.username, password: creds.password },
        authMethod: 'Basic',
        defaultAccountType: 'caldav'
      })
      this.client = c
      this.connecting = null
      return c
    })()
    return this.connecting
  }

  /** 자격증명이 바뀌었거나 연결을 끊을 때 호출. */
  invalidate(): void {
    this.client = null
    this.connecting = null
    this.rawCalendarsCache = null
    this.rawCalendarsInflight = null
    CalendarObjectsStore.clearAll()
  }

  /** 저장 없이 일회성 검증. */
  async testConnection(username: string, password: string): Promise<CalDAVTestResult> {
    try {
      const c = await createDAVClient({
        serverUrl: SERVER_URL,
        credentials: { username, password },
        authMethod: 'Basic',
        defaultAccountType: 'caldav'
      })
      const cals = await c.fetchCalendars()
      return { ok: true, calendarCount: cals.length }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : '연결 실패' }
    }
  }

  /**
   * 캘린더별 getctag 만 빠르게 PROPFIND.
   * 캘린더 컬렉션 ctag 가 바뀌면 그 안에 변경된 일정이 있다는 신호.
   */
  async fetchCalendarCTags(): Promise<Record<string, string>> {
    if (!CalDAVCredentialStore.has()) return {}
    const cals = await this.getRawCalendars()
    const auth = basicAuthHeader()
    const propfindXml = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop>
    <cs:getctag/>
  </d:prop>
</d:propfind>`
    const out: Record<string, string> = {}
    await Promise.all(cals.map(async (cal) => {
      try {
        const resp = await fetch(cal.url, {
          method: 'PROPFIND',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/xml; charset=utf-8',
            Depth: '0'
          },
          body: propfindXml
        })
        if (!resp.ok) return
        const xml = await resp.text()
        const m = xml.match(/<(?:[a-z0-9]+:)?getctag[\s>]?([^<]*)<\/(?:[a-z0-9]+:)?getctag>/i)
        if (m) out[cal.url] = m[1].trim()
      } catch (e) {
        console.error('[CalDAV ctag] fetch 실패:', cal.url, e)
      }
    }))
    return out
  }

  async listCalendars(): Promise<CalDAVCalendar[]> {
    const cals = await this.getRawCalendars()
    return cals.map((cal): CalDAVCalendar => {
      const dn = (cal as Record<string, unknown>).displayName
      const desc = (cal as Record<string, unknown>).description
      const color = (cal as Record<string, unknown>).calendarColor
      const tz = (cal as Record<string, unknown>).timezone
      return {
        url: cal.url,
        displayName: extractDisplayName(dn, cal.url),
        description: typeof desc === 'string' ? desc : undefined,
        color: typeof color === 'string' ? color : undefined,
        timezone: typeof tz === 'string' ? tz : undefined
      }
    })
  }

  async listEvents(query: CalDAVEventQuery): Promise<CalDAVEvent[]> {
    const allCalendars = await this.getRawCalendars()
    const targets = query.calendarUrls?.length
      ? allCalendars.filter((cal) => query.calendarUrls!.includes(cal.url))
      : allCalendars
    const auth = basicAuthHeader()
    const startTs = fmtCalDavTime(query.from)
    const endTs = fmtCalDavTime(query.to)

    // 1차: calendar-query REPORT — time-range 로 hrefs 만 필터
    const queryXml = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${startTs}" end="${endTs}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`

    // 캘린더별 fetch 를 병렬 처리 (Promise.all)
    const perCalendar = await Promise.all(targets.map(async (cal) => {
      const events: CalDAVEvent[] = []

      // 1) hrefs 받기
      let hrefs: string[] = []
      try {
        const resp = await fetch(cal.url, {
          method: 'REPORT',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/xml; charset=utf-8',
            Depth: '1'
          },
          body: queryXml
        })
        if (resp.ok) {
          const xml = await resp.text()
          const entries = parseMultiStatus(xml)
          hrefs = entries.map((e) => e.href).filter(Boolean)
        } else {
          console.error('[CalDAV calendar-query] failed:', cal.url, resp.status)
        }
      } catch (e) {
        console.error('[CalDAV calendar-query] error:', cal.url, e)
      }
      if (hrefs.length === 0) return events

      // 2) calendar-multiget REPORT
      const multigetXml = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  ${hrefs.map((h) => `<d:href>${escapeXml(h)}</d:href>`).join('\n  ')}
</c:calendar-multiget>`

      let dataEntries: MultiStatusEntry[] = []
      try {
        const resp = await fetch(cal.url, {
          method: 'REPORT',
          headers: {
            Authorization: auth,
            'Content-Type': 'application/xml; charset=utf-8',
            Depth: '1'
          },
          body: multigetXml
        })
        if (resp.ok) {
          const xml = await resp.text()
          dataEntries = parseMultiStatus(xml)
        } else {
          console.error('[CalDAV calendar-multiget] failed:', cal.url, resp.status)
          return events
        }
      } catch (e) {
        console.error('[CalDAV calendar-multiget] error:', cal.url, e)
        return events
      }

      for (const entry of dataEntries) {
        if (!entry.calendarData) continue
        const parsed = parseICal(entry.calendarData)
        if (!parsed) continue
        events.push({
          uid: parsed.uid,
          calendarUrl: cal.url,
          url: entry.href || '',
          etag: entry.etag,
          summary: parsed.summary,
          description: parsed.description,
          location: parsed.location,
          start: parsed.start,
          end: parsed.end,
          allDay: parsed.allDay,
          rrule: parsed.rrule
        })
      }
      console.log(`[CalDAV] ${cal.url} → ${events.length} events (hrefs=${hrefs.length}, dataEntries=${dataEntries.length})`)
      return events
    }))

    return perCalendar.flat()
  }

  async createEvent(input: CalDAVEventCreate): Promise<void> {
    const allCalendars = await this.getRawCalendars()
    const cal = allCalendars.find((x) => x.url === input.calendarUrl)
    if (!cal) throw new Error('대상 캘린더를 찾을 수 없습니다.')
    const uid = randomUid()
    const ical = buildICal({ uid, ...input })
    // tsdav 의 createCalendarObject 는 두레이 CalDAV 응답 파싱에서 `fetch failed` (issue #24) 로 깨짐.
    // listEvents/update/delete 가 모두 직접 fetch 로 동작하므로 createEvent 도 동일하게 PUT 로 통일.
    const base = cal.url.endsWith('/') ? cal.url : `${cal.url}/`
    const objectUrl = `${base}${uid}.ics`
    const auth = basicAuthHeader()
    const resp = await fetch(objectUrl, {
      method: 'PUT',
      headers: {
        Authorization: auth,
        'Content-Type': 'text/calendar; charset=utf-8',
        // 신규 생성이므로 같은 UID 의 기존 객체가 없어야 함 (서버가 지원하면 충돌 방지)
        'If-None-Match': '*'
      },
      body: ical
    })
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      throw new Error(`CalDAV 일정 생성 실패: ${resp.status} ${body.slice(0, 200)}`)
    }
    console.log('[CalDAV PUT createEvent]', objectUrl, 'status=', resp.status)
  }

  /**
   * 일정의 DTSTART/DTEND 만 갱신 — 막대 드래그(이동/리사이즈)용.
   * 기존 ICS 의 ATTENDEE/RRULE/ALARM 등을 보존하기 위해 라인 단위로 교체.
   * 두레이 CalDAV 에 PUT + If-Match (etag) 로 충돌 방지.
   * @returns 갱신된 etag (서버가 ETag 헤더로 반환). 없으면 undefined.
   */
  async updateEventDateTime(input: {
    href: string
    etag?: string
    existingIcs: string
    start: string
    end: string
    allDay: boolean
  }): Promise<{ etag?: string }> {
    const newIcs = patchDateTimeInIcs(input.existingIcs, {
      start: input.start,
      end: input.end,
      allDay: input.allDay
    })
    const absUrl = input.href.startsWith('http') ? input.href : SERVER_URL + input.href
    const auth = basicAuthHeader()
    const resp = await fetch(absUrl, {
      method: 'PUT',
      headers: {
        Authorization: auth,
        'Content-Type': 'text/calendar; charset=utf-8',
        ...(input.etag ? { 'If-Match': quoteEtag(input.etag)! } : {})
      },
      body: newIcs
    })
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      throw new Error(`CalDAV PUT 실패: ${resp.status} ${body.slice(0, 200)}`)
    }
    let newEtag = resp.headers.get('etag') ?? undefined
    // 두레이는 PUT 응답에 ETag 를 안 주는 경우가 있어 직후 GET 으로 보정 (incrementalSync 변경 감지용)
    if (!newEtag) {
      try {
        const v = await fetch(absUrl, { method: 'GET', headers: { Authorization: auth } })
        newEtag = v.headers.get('etag') ?? undefined
      } catch { /* ok */ }
    }
    console.log('[CalDAV PUT]', absUrl, 'status=', resp.status, 'newEtag=', newEtag)
    return { etag: newEtag?.replace(/^["']|["']$/g, '') }
  }

  async deleteEvent(url: string, etag?: string): Promise<void> {
    // tsdav 우회: 두레이 CalDAV 에 직접 HTTP DELETE
    // 두레이 응답의 href 는 path 만 오므로 절대 URL 로 변환
    const absUrl = url.startsWith('http') ? url : SERVER_URL + url
    const auth = basicAuthHeader()
    const resp = await fetch(absUrl, {
      method: 'DELETE',
      headers: {
        Authorization: auth,
        ...(etag ? { 'If-Match': etag } : {})
      }
    })
    if (!resp.ok && resp.status !== 404) {
      const body = await resp.text().catch(() => '')
      throw new Error(`CalDAV DELETE 실패: ${resp.status} ${body.slice(0, 200)}`)
    }
    console.log('[CalDAV DELETE]', absUrl, 'status=', resp.status)
  }

  /**
   * 일정의 모든 속성을 갱신 — 상세 편집 모달용.
   * 기존 ICS 를 파싱하여 UID/CREATED 는 보존하고, 나머지 필드를 새 값으로 교체.
   * 두레이 CalDAV 에 PUT + If-Match (etag) 로 충돌 방지.
   * @returns 갱신된 etag (서버가 ETag 헤더로 반환). 없으면 undefined.
   */
  async updateEvent(input: {
    href: string
    etag?: string
    existingIcs: string
    summary: string
    description?: string
    location?: string
    start: string
    end: string
    allDay: boolean
  }): Promise<{ etag?: string }> {
    const parsed = parseICal(input.existingIcs)
    if (!parsed) throw new Error('기존 ICS 파싱 실패')

    // 깔끔한 표준 VEVENT 로 재구성 — 두레이 고유 X-*/VTIMEZONE 을 그대로 PUT 하면 500 이 남.
    // (편집이 서버에 안 먹히던 진짜 원인은 If-Match etag 따옴표 누락이었고, 그건 quoteEtag 로 해결.)
    const newIcs = buildICal({
      uid: parsed.uid,
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: input.start,
      end: input.end,
      allDay: input.allDay,
      createdAt: parsed.createdAt,
      rrule: parsed.rrule,
      attendees: parsed.attendees,
      organizer: parsed.organizer,
      alarms: parsed.alarms,
      status: parsed.status,
      url: parsed.url
    })
    
    const absUrl = input.href.startsWith('http') ? input.href : SERVER_URL + input.href
    const auth = basicAuthHeader()
    console.log('[CalDAV PUT updateEvent] req ifMatch=', !!input.etag, 'summary=', input.summary, 'bodyLen=', newIcs.length)
    const resp = await fetch(absUrl, {
      method: 'PUT',
      headers: {
        Authorization: auth,
        'Content-Type': 'text/calendar; charset=utf-8',
        ...(input.etag ? { 'If-Match': quoteEtag(input.etag)! } : {})
      },
      body: newIcs
    })
    const respBody = await resp.text().catch(() => '')
    if (!resp.ok) {
      throw new Error(`CalDAV PUT 실패: ${resp.status} ${respBody.slice(0, 200)}`)
    }
    let newEtag = resp.headers.get('etag') ?? undefined
    console.log('[CalDAV PUT updateEvent]', absUrl, 'status=', resp.status, 'etagHdr=', newEtag, 'respBodyLen=', respBody.length)

    // 진단 + 보정: 두레이는 PUT 응답에 ETag 를 안 주는 경우가 있어, 직후 GET 으로 실제 반영 여부 확인.
    // 서버가 정상 반영했다면 GET 의 SUMMARY 가 새 값이고 새 etag 를 받는다. (안 바뀌면 서버가 PUT 을 무시한 것)
    try {
      const verify = await fetch(absUrl, { method: 'GET', headers: { Authorization: auth } })
      const vtext = await verify.text().catch(() => '')
      const vparsed = parseICal(vtext)
      const vEtag = verify.headers.get('etag') ?? undefined
      console.log('[CalDAV PUT verify] GET status=', verify.status,
        'serverSummary=', vparsed?.summary,
        'applied=', vparsed?.summary === input.summary, 'etag=', vEtag)
      // PUT 이 etag 를 안 줬으면 GET 의 etag 를 사용 (incrementalSync 가 변경을 감지하도록)
      if (!newEtag && vEtag) newEtag = vEtag
    } catch (e) {
      console.warn('[CalDAV PUT verify] GET 실패:', e)
    }
    return { etag: newEtag?.replace(/^["']|["']$/g, '') }
  }

  // ─────────────────────────────────────────────────────────────
  // v1.5 Sync — ICS 객체를 디스크에 영구 저장 (CalendarObjectsStore)
  // ─────────────────────────────────────────────────────────────

  /** 캘린더 안의 모든 href + etag 를 PROPFIND 로 받음 */
  /**
   * 두레이 CalDAV 는 PROPFIND Depth:1 로 객체 목록을 안 돌려줌(컬렉션 자체만 반환).
   * → calendar-query REPORT 로 VEVENT 의 href + etag 만 받음.
   * time-range 로 합리적 시간 범위만 가져옴 (디폴트 6개월 전 ~ 1년 후).
   */
  private async fetchHrefMap(calendarUrl: string, auth: string, range?: { from: string; to: string }): Promise<Map<string, string>> {
    const r = range ?? defaultSyncRange()
    const timeRangeXml = `<c:time-range start="${fmtCalDavTime(r.from)}" end="${fmtCalDavTime(r.to)}"/>`
    const queryXml = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/></d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        ${timeRangeXml}
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`
    const resp = await fetch(calendarUrl, {
      method: 'REPORT',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/xml; charset=utf-8',
        Depth: '1'
      },
      body: queryXml
    })
    console.log('[CalDAV calendar-query]', calendarUrl, 'status=', resp.status)
    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      console.error('[CalDAV calendar-query] 실패 body:', body.slice(0, 300))
      throw new Error(`calendar-query failed: ${resp.status}`)
    }
    const xml = await resp.text()
    const entries = parseMultiStatus(xml)
    console.log('[CalDAV calendar-query] entries:', entries.length, 'body_len=', xml.length)
    const map = new Map<string, string>()
    let skipped = 0
    for (const e of entries) {
      if (!e.href || e.href.endsWith('/')) { skipped++; continue }
      // etag 없어도 일단 href 만이라도 사용 (multiget 에서 etag 다시 받음)
      map.set(e.href, e.etag || '')
    }
    console.log('[CalDAV calendar-query] map size:', map.size, 'skipped:', skipped)
    return map
  }

  /** hrefs 묶음에 대한 ICS 본문을 한 번에 받기 */
  private async multigetObjects(calendarUrl: string, hrefs: string[], auth: string): Promise<MultiStatusEntry[]> {
    if (hrefs.length === 0) return []
    const multigetXml = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  ${hrefs.map((h) => `<d:href>${escapeXml(h)}</d:href>`).join('\n  ')}
</c:calendar-multiget>`
    const resp = await fetch(calendarUrl, {
      method: 'REPORT',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/xml; charset=utf-8',
        Depth: '1'
      },
      body: multigetXml
    })
    if (!resp.ok) throw new Error(`multiget failed: ${resp.status}`)
    const xml = await resp.text()
    return parseMultiStatus(xml)
  }

  /** 캘린더 하나 전체 동기화 — 기존 캐시 무관하게 새로 전부 받음 */
  async fullSyncCalendar(calendarUrl: string): Promise<number> {
    const auth = basicAuthHeader()
    console.log('[CalDAV fullSync] start:', calendarUrl)
    const hrefMap = await this.fetchHrefMap(calendarUrl, auth)
    const hrefs = Array.from(hrefMap.keys())
    console.log('[CalDAV fullSync] hrefs:', calendarUrl, hrefs.length)
    if (hrefs.length === 0) {
      CalendarObjectsStore.setCalendar(calendarUrl, {})
      return 0
    }
    const CHUNK = 100
    const objects: Record<string, { etag: string; ics: string }> = {}
    for (let i = 0; i < hrefs.length; i += CHUNK) {
      const slice = hrefs.slice(i, i + CHUNK)
      const entries = await this.multigetObjects(calendarUrl, slice, auth)
      console.log('[CalDAV fullSync] multiget chunk:', calendarUrl, 'slice=', slice.length, 'entries=', entries.length)
      for (const entry of entries) {
        if (!entry.href || !entry.calendarData) continue
        objects[entry.href] = {
          etag: entry.etag || hrefMap.get(entry.href) || '',
          ics: entry.calendarData
        }
      }
    }
    CalendarObjectsStore.setCalendar(calendarUrl, objects)
    console.log('[CalDAV fullSync] saved:', calendarUrl, Object.keys(objects).length)
    return Object.keys(objects).length
  }

  /** 모든 캘린더 전체 동기화 — 진행률 callback (병렬, 동시 4개 제한) */
  async fullSyncAll(onProgress?: (p: SyncProgress) => void): Promise<{ totalObjects: number }> {
    if (!CalDAVCredentialStore.has()) throw new Error('자격증명이 없습니다.')
    const cals = await this.getRawCalendars()
    console.log('[CalDAV fullSyncAll] 시작 — 캘린더', cals.length, '개 (동시 4개)')
    // 캘린더 메타도 같이 캐싱
    for (const cal of cals) {
      const dn = (cal as Record<string, unknown>).displayName
      const color = (cal as Record<string, unknown>).calendarColor
      CalendarObjectsStore.setCalendarMeta(cal.url, {
        displayName: extractDisplayName(dn, cal.url),
        color: typeof color === 'string' ? color : undefined
      })
    }

    const CONCURRENCY = 4
    let totalObjects = 0
    let completed = 0
    const queue = cals.slice()
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const cal = queue.shift()
        if (!cal) return
        const dn = (cal as Record<string, unknown>).displayName
        const calName = extractDisplayName(dn, cal.url)
        let count = 0
        try {
          count = await this.fullSyncCalendar(cal.url)
          totalObjects += count
        } catch (e) {
          console.error('[CalDAV fullSync] 실패:', cal.url, e)
        }
        completed++
        onProgress?.({
          calendarUrl: cal.url,
          calendarName: calName,
          current: completed,
          total: cals.length,
          objectCount: count
        })
      }
    })
    await Promise.all(workers)
    return { totalObjects }
  }

  /** 캘린더 하나 incremental sync — etag 비교로 변경분만 fetch (배치 write). skipHrefs 는 최근 삭제된 항목 부활 방지 */
  async incrementalSyncCalendar(calendarUrl: string, skipHrefs?: Set<string>): Promise<SyncDiff> {
    const auth = basicAuthHeader()
    const serverMap = await this.fetchHrefMap(calendarUrl, auth)
    const cached = CalendarObjectsStore.getCalendar(calendarUrl)

    const toFetch: string[] = []
    const toDelete: string[] = []
    for (const [href, etag] of serverMap) {
      if (skipHrefs?.has(href)) continue  // 최근 삭제 — 부활 방지
      if (!cached[href] || cached[href].etag !== etag) toFetch.push(href)
    }
    for (const href of Object.keys(cached)) {
      if (!serverMap.has(href)) toDelete.push(href)
    }

    // 진단: 서버 href 수 vs 캐시 href 수 — 불일치가 sync 문제의 1차 단서
    console.log(`[CalDAV incrementalSyncCalendar] ${calendarUrl.slice(-50)} serverHrefs=${serverMap.size} cachedHrefs=${Object.keys(cached).length} toFetch=${toFetch.length} toDelete=${toDelete.length}`)

    // 대량 삭제 가드 — time-range 밖 옛 캐시가 다 삭제로 분류되는 케이스 보호
    if (toDelete.length > 1000) {
      console.warn(`[CalDAV incrementalSync] ${calendarUrl} 삭제 대상 ${toDelete.length}건 → 옛 캐시 흔적으로 판단, 중단`)
      return { added: 0, updated: 0, deleted: 0 }
    }

    // 메모리에서 변경 누적 후 한 번에 store.set (디스크 write 1회)
    const next = { ...cached }
    for (const href of toDelete) delete next[href]

    let added = 0, updated = 0
    if (toFetch.length > 0) {
      const CHUNK = 100
      for (let i = 0; i < toFetch.length; i += CHUNK) {
        const slice = toFetch.slice(i, i + CHUNK)
        try {
          const entries = await this.multigetObjects(calendarUrl, slice, auth)
          for (const entry of entries) {
            if (!entry.href || !entry.calendarData) continue
            const isNew = !cached[entry.href]
            next[entry.href] = {
              etag: entry.etag || serverMap.get(entry.href) || '',
              ics: entry.calendarData
            }
            if (isNew) added++; else updated++
          }
        } catch (e) {
          console.error('[CalDAV incrementalSync] multiget 실패:', calendarUrl, e)
        }
      }
    }

    if (toDelete.length > 0 || added > 0 || updated > 0) {
      CalendarObjectsStore.setCalendar(calendarUrl, next)
    }
    return { added, updated, deleted: toDelete.length }
  }

  /**
   * 모든 캘린더 incremental sync. skipHrefs — 최근 삭제 grace 동안 무시.
   *
   * 호출 시마다 rawCalendarsCache 를 무효화해 tsdav 에 새 PROPFIND 를 강제함.
   * 이유: 사용자가 두레이에서 새 캘린더를 구독/추가한 경우, 5분 캐시가 남아있으면
   * 새 캘린더가 sync 대상에 포함되지 않아 일정이 영원히 안 보이는 증상이 생김.
   * incremental sync 는 이미 180초 간격이므로 매 tick 마다 캘린더 목록도 새로 받는 게 안전.
   */
  async incrementalSyncAll(skipHrefs?: Set<string>): Promise<{ added: number; updated: number; deleted: number; anyChange: boolean }> {
    if (!CalDAVCredentialStore.has()) return { added: 0, updated: 0, deleted: 0, anyChange: false }

    // 캐시 무효화 — 새로 추가된 공유/구독 캘린더를 매 sync 때 반영
    this.rawCalendarsCache = null

    const cals = await this.getRawCalendars()
    console.log(`[CalDAV incrementalSyncAll] 시작 — 캘린더 ${cals.length}개`)

    // 캘린더 메타 갱신 (sync 안 했어도 캘린더 목록은 항상 최신 유지)
    for (const cal of cals) {
      const dn = (cal as Record<string, unknown>).displayName
      const color = (cal as Record<string, unknown>).calendarColor
      CalendarObjectsStore.setCalendarMeta(cal.url, {
        displayName: extractDisplayName(dn, cal.url),
        color: typeof color === 'string' ? color : undefined
      })
    }
    const results = await Promise.all(cals.map(async (cal) => {
      const dn = (cal as Record<string, unknown>).displayName
      const calName = extractDisplayName(dn, cal.url)
      try {
        const diff = await this.incrementalSyncCalendar(cal.url, skipHrefs)
        // 변화가 있을 때만 로그 — 조용한 no-change tick 은 spam 방지
        if (diff.added > 0 || diff.updated > 0 || diff.deleted > 0) {
          console.log(`[CalDAV incrementalSync] "${calName}" added=${diff.added} updated=${diff.updated} deleted=${diff.deleted}`)
        } else {
          console.log(`[CalDAV incrementalSync] "${calName}" — 변경 없음 (서버 href 수: 캐시와 동일)`)
        }
        return diff
      } catch (e) {
        console.error(`[CalDAV incrementalSync] "${calName}" 실패:`, e)
        return { added: 0, updated: 0, deleted: 0 }
      }
    }))
    const totals = results.reduce((acc, r) => ({
      added: acc.added + r.added,
      updated: acc.updated + r.updated,
      deleted: acc.deleted + r.deleted
    }), { added: 0, updated: 0, deleted: 0 })
    console.log(`[CalDAV incrementalSyncAll] 완료 — 총 added=${totals.added} updated=${totals.updated} deleted=${totals.deleted}`)
    return { ...totals, anyChange: totals.added + totals.updated + totals.deleted > 0 }
  }
}

// iCal 파서/빌더는 ./ical 로 분리 (로컬 캘린더 저장과 공용)
