/**
 * iCalendar (RFC 5545) 최소 파서/빌더.
 * CalDAV 통신과 로컬 캘린더 저장에서 공통으로 사용.
 */

export interface IcalPerson {
  name?: string
  email?: string
  /** ATTENDEE 의 PARTSTAT — ACCEPTED / DECLINED / TENTATIVE / NEEDS-ACTION */
  partstat?: string
  /** ATTENDEE 의 ROLE — REQ-PARTICIPANT / OPT-PARTICIPANT 등 */
  role?: string
}

export interface IcalAlarm {
  /** TRIGGER 원본 (예: -PT15M, -P1D, 20260513T090000Z) */
  trigger: string
  /** DISPLAY / EMAIL / AUDIO 등 */
  action?: string
  description?: string
}

export interface ParsedEvent {
  uid: string
  summary: string
  description?: string
  location?: string
  /** ISO 8601 */
  start: string
  end: string
  allDay: boolean
  rrule?: string
  /** CONFIRMED / TENTATIVE / CANCELLED */
  status?: string
  organizer?: IcalPerson
  attendees?: IcalPerson[]
  alarms?: IcalAlarm[]
  url?: string
  /** CREATED 가 있으면 우선, 없으면 DTSTAMP. ISO 8601. */
  createdAt?: string
}

export interface BuildICalInput {
  uid: string
  summary: string
  description?: string
  location?: string
  start: string
  end: string
  allDay?: boolean
  /** 기존 일정 갱신 시 CREATED 보존. 미지정 시 DTSTAMP(=현재 시각) 와 동일하게 기록. */
  createdAt?: string
  rrule?: string
  attendees?: IcalPerson[]
  organizer?: IcalPerson
  alarms?: IcalAlarm[]
  status?: string
  url?: string
}

export function parseICal(data: string): ParsedEvent | null {
  const lines = unfoldLines(data)
  const ev = extractVEvent(lines)
  if (!ev) return null
  const uid = getProp(ev, 'UID')
  const dtstart = parseDtRaw(getPropRaw(ev, 'DTSTART'))
  if (!uid || !dtstart) return null
  let dtend = parseDtRaw(getPropRaw(ev, 'DTEND'))
  // RFC 5545: 종일 이벤트의 DTEND 는 exclusive (해당 일 미포함)
  // → 내부적으로 inclusive 로 1일 빼서 저장 (UI 가 다일 막대로 잘못 그리는 것 방지)
  if (dtend && (dtstart.allDay || dtend.allDay)) {
    const d = new Date(dtend.iso)
    d.setDate(d.getDate() - 1)
    dtend = {
      iso: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T00:00:00`,
      allDay: true
    }
  }

  // ATTENDEE 여러 라인
  const attendees: IcalPerson[] = []
  for (const line of ev) {
    if (line.startsWith('ATTENDEE:') || line.startsWith('ATTENDEE;')) {
      const p = parsePersonLine(line)
      if (p) attendees.push(p)
    }
  }
  // ORGANIZER 한 라인
  const orgRaw = getPropRaw(ev, 'ORGANIZER')
  const organizer = orgRaw ? parsePersonLine(orgRaw) ?? undefined : undefined

  // VALARM 블록 (여러 개 가능)
  const alarms = extractValarms(ev)

  // CREATED 우선, fallback DTSTAMP (모든 VEVENT 는 DTSTAMP 필수)
  const createdRaw = getPropRaw(ev, 'CREATED') ?? getPropRaw(ev, 'DTSTAMP')
  const createdAt = createdRaw ? (parseDtRaw(createdRaw)?.iso) : undefined

  return {
    uid,
    summary: decodeText(getProp(ev, 'SUMMARY') ?? '(제목 없음)'),
    description: decodeTextOrUndef(getPropRaw(ev, 'DESCRIPTION')),
    location: decodeTextOrUndef(getPropRaw(ev, 'LOCATION')),
    start: dtstart.iso,
    end: dtend?.iso ?? dtstart.iso,
    allDay: dtstart.allDay || !!dtend?.allDay,
    rrule: getProp(ev, 'RRULE'),
    status: getProp(ev, 'STATUS'),
    organizer: organizer && (organizer.name || organizer.email) ? organizer : undefined,
    attendees: attendees.length > 0 ? attendees : undefined,
    alarms: alarms.length > 0 ? alarms : undefined,
    url: getProp(ev, 'URL'),
    createdAt
  }
}

/** `ATTENDEE;CN=홍길동;PARTSTAT=ACCEPTED:mailto:gildong@example.com` → 객체 */
function parsePersonLine(raw: string): IcalPerson | null {
  const colon = raw.indexOf(':')
  if (colon < 0) return null
  const head = raw.slice(0, colon) // ATTENDEE;CN=... 또는 ORGANIZER;CN=...
  const value = raw.slice(colon + 1)
  const email = value.replace(/^mailto:/i, '').trim() || undefined
  const cn = head.match(/CN=([^;:]+)/i)?.[1]
  const partstat = head.match(/PARTSTAT=([^;:]+)/i)?.[1]
  const role = head.match(/ROLE=([^;:]+)/i)?.[1]
  return {
    name: cn ? decodeText(cn) : undefined,
    email,
    partstat,
    role
  }
}

/** VALARM 블록들을 추출. ev 는 VEVENT 내부 라인들. */
function extractValarms(ev: string[]): IcalAlarm[] {
  const out: IcalAlarm[] = []
  let inside = false
  let cur: IcalAlarm | null = null
  for (const line of ev) {
    if (line === 'BEGIN:VALARM') { inside = true; cur = { trigger: '' } }
    else if (line === 'END:VALARM') {
      if (cur && cur.trigger) out.push(cur)
      inside = false; cur = null
    }
    else if (inside && cur) {
      if (line.startsWith('TRIGGER')) {
        const c = line.indexOf(':')
        if (c >= 0) cur.trigger = line.slice(c + 1)
      }
      else if (line.startsWith('ACTION:')) cur.action = line.slice('ACTION:'.length)
      else if (line.startsWith('DESCRIPTION:')) cur.description = decodeText(line.slice('DESCRIPTION:'.length))
    }
  }
  return out
}

export function buildICal(input: BuildICalInput): string {
  const allDay = !!input.allDay
  /** 시간 포함 이벤트: UTC Z 표기 (CalDAV 표준). */
  const fmtTimed = (iso: string): string => {
    const d = new Date(iso)
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  }
  /**
   * 종일 이벤트: 사용자가 의도한 "달력상 날짜" 를 보존해야 함.
   * 로컬 자정 ISO 를 UTC 로 변환한 ISO 가 들어오면 getUTCDate() 는 KST 기준 하루 빠진 값을 반환 → off-by-one.
   * 따라서 로컬 일자 (Date getter) 로 추출. dayOffset 으로 RFC 5545 의 DTEND exclusive 규칙(+1일) 적용.
   */
  const fmtAllDay = (iso: string, dayOffset = 0): string => {
    const d = new Date(iso)
    if (dayOffset !== 0) d.setDate(d.getDate() + dayOffset)
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  }
  const dtstart = allDay ? `DTSTART;VALUE=DATE:${fmtAllDay(input.start)}` : `DTSTART:${fmtTimed(input.start)}`
  // DTEND: 종일은 exclusive → 사용자 의도 종료일 + 1일
  const dtend = allDay ? `DTEND;VALUE=DATE:${fmtAllDay(input.end, 1)}` : `DTEND:${fmtTimed(input.end)}`
  const dtstamp = fmtTimed(new Date().toISOString())
  // CREATED: 신규는 DTSTAMP 와 동일, 업데이트는 입력값 보존
  const created = input.createdAt ? fmtTimed(input.createdAt) : dtstamp
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clauday//CalDAV 1.5//EN',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${dtstamp}`,
    `CREATED:${created}`,
    dtstart,
    dtend,
    `SUMMARY:${escapeText(input.summary)}`
  ]
  if (input.location) lines.push(`LOCATION:${escapeText(input.location)}`)
  if (input.description) lines.push(`DESCRIPTION:${escapeText(input.description)}`)
  if (input.status) lines.push(`STATUS:${input.status}`)
  if (input.url) lines.push(`URL:${input.url}`)
  if (input.rrule) lines.push(`RRULE:${input.rrule}`)
  if (input.organizer && (input.organizer.name || input.organizer.email)) {
    const parts: string[] = []
    if (input.organizer.name) parts.push(`CN=${escapeText(input.organizer.name)}`)
    if (input.organizer.partstat) parts.push(`PARTSTAT=${input.organizer.partstat}`)
    if (input.organizer.role) parts.push(`ROLE=${input.organizer.role}`)
    lines.push(`ORGANIZER${parts.length ? ';'+parts.join(';') : ''}:mailto:${input.organizer.email || ''}`)
  }
  if (input.attendees) {
    for (const att of input.attendees) {
      if (!att.email && !att.name) continue
      const parts: string[] = []
      if (att.name) parts.push(`CN=${escapeText(att.name)}`)
      if (att.partstat) parts.push(`PARTSTAT=${att.partstat}`)
      if (att.role) parts.push(`ROLE=${att.role}`)
      lines.push(`ATTENDEE${parts.length ? ';'+parts.join(';') : ''}:mailto:${att.email || ''}`)
    }
  }
  if (input.alarms) {
    for (const alm of input.alarms) {
      lines.push('BEGIN:VALARM')
      lines.push(`TRIGGER:${alm.trigger}`)
      if (alm.action) lines.push(`ACTION:${alm.action}`)
      if (alm.description) lines.push(`DESCRIPTION:${escapeText(alm.description)}`)
      lines.push('END:VALARM')
    }
  }
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

/** ICS 본문 앞에 섞인 비-iCalendar 텍스트(XML 태그 잔재 등)를 제거 — BEGIN:VCALENDAR 부터 반환. */
export function stripIcsPrefix(ics: string): string {
  const i = ics.indexOf('BEGIN:VCALENDAR')
  return i > 0 ? ics.slice(i) : ics
}

/**
 * VEVENT 블록 구간 [start, end) 를 찾는다. start 는 'BEGIN:VEVENT' 라인 시작 인덱스,
 * end 는 'END:VEVENT' 인덱스(미포함). 없으면 null.
 * Why: ICS 에는 VTIMEZONE 에도 DTSTART 가 있어, 전체 문자열에서 교체하면 VTIMEZONE 의 DTSTART 를
 * 먼저 건드려 일정 시각이 엉뚱한 곳에 박히고 정작 VEVENT 는 안 바뀐다(=두레이 200-무시/500의 원인).
 */
function veventRange(ics: string): { start: number; end: number } | null {
  const b = ics.indexOf('BEGIN:VEVENT')
  if (b < 0) return null
  const e = ics.indexOf('END:VEVENT', b)
  if (e < 0) return null
  return { start: b, end: e }
}

const fmtTimedUtc = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}
const fmtDate = (iso: string, dayOffset = 0): string => {
  const d = new Date(iso)
  if (dayOffset !== 0) d.setDate(d.getDate() + dayOffset)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

/**
 * VEVENT 블록의 "top-level 속성 구간"(첫 BEGIN:VALARM 이전)만 잘라 [before, region, rest] 로 나눈다.
 * VALARM 내부에도 DESCRIPTION 등이 있으므로, 편집은 이 region 안에서만 해야 알림 속성을 안 건드린다.
 */
function eventEditRegion(ics: string): { before: string; region: string; rest: string } | null {
  const r = veventRange(ics)
  if (!r) return null
  const body = ics.slice(r.start, r.end)
  const valarm = body.search(/^BEGIN:VALARM/m)
  const cut = valarm >= 0 ? valarm : body.length
  return {
    before: ics.slice(0, r.start),
    region: body.slice(0, cut),
    rest: body.slice(cut) + ics.slice(r.end)
  }
}

/** VEVENT top-level 구간에서만 단일/폴딩 속성을 교체. 없으면 BEGIN:VEVENT 직후 삽입. */
function replaceInEvent(ics: string, key: string, newLine: string, foldable = false): string {
  const seg = eventEditRegion(ics)
  if (!seg) return ics
  const tailRe = foldable ? '(?:\\r?\\n[ \\t][^\\r\\n]*)*' : ''
  const re = new RegExp(`^${key}(?:;[^:\\r\\n]*)?:[^\\r\\n]*${tailRe}`, 'm')
  let region = seg.region
  if (re.test(region)) region = region.replace(re, newLine)
  else region = region.replace(/(BEGIN:VEVENT\r?\n)/, `$1${newLine}\r\n`)
  return seg.before + region + seg.rest
}

/** VEVENT top-level 구간에서 단일 라인 속성 값을 읽는다 (없으면 undefined). */
function readInEvent(ics: string, key: string): string | undefined {
  const seg = eventEditRegion(ics)
  if (!seg) return undefined
  const m = seg.region.match(new RegExp(`^${key}(?:;[^:\\r\\n]*)?:([^\\r\\n]*)`, 'm'))
  return m ? m[1] : undefined
}

/** VEVENT top-level 구간에서만 단일 속성을 제거 (값이 빈 LOCATION/DESCRIPTION 등). */
function removeInEvent(ics: string, key: string, foldable = false): string {
  const seg = eventEditRegion(ics)
  if (!seg) return ics
  const tailRe = foldable ? '(?:\\r?\\n[ \\t][^\\r\\n]*)*' : ''
  const re = new RegExp(`^${key}(?:;[^:\\r\\n]*)?:[^\\r\\n]*${tailRe}\\r?\\n?`, 'm')
  return seg.before + seg.region.replace(re, '') + seg.rest
}

/**
 * 기존 VEVENT 의 DTSTART/DTEND/DTSTAMP 만 교체한 새 ICS 문자열을 만든다.
 * ATTENDEE/RRULE/VALARM 등 다른 필드는 그대로 보존 — 막대 드래그로 일정 시각만 변경할 때 사용.
 *
 * - allDay 면 RFC 5545 의 DTEND exclusive 규칙대로 +1일 적용
 * - 시간 이벤트는 UTC Z 표기
 * - 교체는 **VEVENT 블록 안에서만** 수행 (VTIMEZONE 의 DTSTART 오염 방지)
 */
export function patchDateTimeInIcs(ics: string, input: { start: string; end: string; allDay: boolean }): string {
  const allDay = !!input.allDay
  const dtstartLine = allDay ? `DTSTART;VALUE=DATE:${fmtDate(input.start)}` : `DTSTART:${fmtTimedUtc(input.start)}`
  const dtendLine = allDay ? `DTEND;VALUE=DATE:${fmtDate(input.end, 1)}` : `DTEND:${fmtTimedUtc(input.end)}`
  const dtstampLine = `DTSTAMP:${fmtTimedUtc(new Date().toISOString())}`

  let out = stripIcsPrefix(ics)
  out = replaceInEvent(out, 'DTSTART', dtstartLine)
  out = replaceInEvent(out, 'DTEND', dtendLine)
  out = replaceInEvent(out, 'DTSTAMP', dtstampLine)
  return out
}

/**
 * 상세 편집용 — 원본 ICS 를 보존하면서 VEVENT 의 편집 필드(SUMMARY/LOCATION/DESCRIPTION/DTSTART/DTEND/DTSTAMP)
 * 만 in-place 교체. 두레이 고유 속성(X-DOORAY-*)·VTIMEZONE·VALARM·속성 순서는 그대로 둔다.
 *
 * Why: buildICal 재구성은 X-DOORAY-* 누락으로 서버가 200 으로 받고도 반영 안 함. 구조 변경(unfold/재정렬/
 * VTIMEZONE 제거)은 500. → 라인 단위 in-place 교체가 정답이되, 반드시 **VEVENT 블록 안에서만** 교체해야
 * VTIMEZONE 의 DTSTART 를 건드리지 않는다(이전 버전이 VTIMEZONE DTSTART 를 덮어써 서버가 무시했음).
 */
export function patchEventFields(
  ics: string,
  input: { summary: string; description?: string; location?: string; start: string; end: string; allDay: boolean }
): string {
  const allDay = !!input.allDay
  const dtstartLine = allDay ? `DTSTART;VALUE=DATE:${fmtDate(input.start)}` : `DTSTART:${fmtTimedUtc(input.start)}`
  const dtendLine = allDay ? `DTEND;VALUE=DATE:${fmtDate(input.end, 1)}` : `DTEND:${fmtTimedUtc(input.end)}`
  const dtstampLine = `DTSTAMP:${fmtTimedUtc(new Date().toISOString())}`

  let out = stripIcsPrefix(ics)
  out = replaceInEvent(out, 'DTSTART', dtstartLine)
  out = replaceInEvent(out, 'DTEND', dtendLine)
  out = replaceInEvent(out, 'DTSTAMP', dtstampLine)
  out = replaceInEvent(out, 'SUMMARY', `SUMMARY:${escapeText(input.summary)}`, true)
  out = input.location
    ? replaceInEvent(out, 'LOCATION', `LOCATION:${escapeText(input.location)}`, true)
    : removeInEvent(out, 'LOCATION', true)
  out = input.description
    ? replaceInEvent(out, 'DESCRIPTION', `DESCRIPTION:${escapeText(input.description)}`, true)
    : removeInEvent(out, 'DESCRIPTION', true)

  // SEQUENCE +1 + LAST-MODIFIED 갱신 — 두레이가 "더 최신 아님"으로 PUT 을 무시(200/no-op)하지 않도록.
  // (RFC 5545: 일정 수정 시 SEQUENCE 는 증가해야 한다.) VEVENT 블록 안에서만 처리.
  const curSeq = readInEvent(out, 'SEQUENCE')
  const seq = curSeq && /^\d+$/.test(curSeq.trim()) ? parseInt(curSeq.trim(), 10) : 0
  out = replaceInEvent(out, 'SEQUENCE', `SEQUENCE:${seq + 1}`)
  out = replaceInEvent(out, 'LAST-MODIFIED', `LAST-MODIFIED:${dtstampLine.slice('DTSTAMP:'.length)}`)
  return out
}

/**
 * 여러 ICS(VCALENDAR/VEVENT 묶음)에서 VEVENT 블록만 추출해 단일 VCALENDAR 로 합산.
 * 캘린더 내보내기에 사용.
 */
export function bundleICal(calendarName: string, icsList: string[]): string {
  const vevents: string[] = []
  for (const ics of icsList) {
    const lines = unfoldLines(ics)
    let depth = 0
    let buf: string[] = []
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { depth++; buf = ['BEGIN:VEVENT']; continue }
      if (depth > 0) buf.push(line)
      if (line === 'END:VEVENT') {
        if (depth === 1) vevents.push(buf.join('\r\n'))
        depth = 0
        buf = []
      }
    }
  }
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clauday//Local Calendar 1.5//EN',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    ...vevents,
    'END:VCALENDAR'
  ].join('\r\n')
}

// ──────────────────────────────────────────────────────────────────────────

function unfoldLines(s: string): string[] {
  const raw = s.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

function extractVEvent(lines: string[]): string[] | null {
  const start = lines.indexOf('BEGIN:VEVENT')
  if (start < 0) return null
  const end = lines.findIndex((l, i) => i > start && l === 'END:VEVENT')
  if (end < 0) return null
  return lines.slice(start + 1, end)
}

function getPropRaw(lines: string[], name: string): string | undefined {
  return lines.find((l) => l === name || l.startsWith(`${name}:`) || l.startsWith(`${name};`))
}

function getProp(lines: string[], name: string): string | undefined {
  const raw = getPropRaw(lines, name)
  if (!raw) return undefined
  const colon = raw.indexOf(':')
  return colon >= 0 ? raw.slice(colon + 1) : undefined
}

function decodeText(s: string): string {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function decodeTextOrUndef(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const i = raw.indexOf(':')
  if (i < 0) return undefined
  return decodeText(raw.slice(i + 1))
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function parseDtRaw(raw: string | undefined): { iso: string; allDay: boolean } | null {
  if (!raw) return null
  const colon = raw.indexOf(':')
  if (colon < 0) return null
  const head = raw.slice(0, colon)
  const value = raw.slice(colon + 1)
  const isDate = /VALUE=DATE(?!-)/i.test(head) || /^\d{8}$/.test(value)
  if (isDate) {
    const y = value.slice(0, 4), m = value.slice(4, 6), d = value.slice(6, 8)
    return { iso: `${y}-${m}-${d}T00:00:00`, allDay: true }
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/)
  if (!m) return null
  const [, Y, Mo, D, H, Mi, S, Z] = m
  return { iso: `${Y}-${Mo}-${D}T${H}:${Mi}:${S}${Z ? 'Z' : ''}`, allDay: false }
}

function pad(n: number): string { return String(n).padStart(2, '0') }
