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
}

export interface BuildICalInput {
  uid: string
  summary: string
  description?: string
  location?: string
  start: string
  end: string
  allDay?: boolean
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
    url: getProp(ev, 'URL')
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
  const fmt = (iso: string, isAllDay: boolean): string => {
    const d = new Date(iso)
    if (isAllDay) return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  }
  const dtstart = allDay ? `DTSTART;VALUE=DATE:${fmt(input.start, true)}` : `DTSTART:${fmt(input.start, false)}`
  const dtend = allDay ? `DTEND;VALUE=DATE:${fmt(input.end, true)}` : `DTEND:${fmt(input.end, false)}`
  const dtstamp = fmt(new Date().toISOString(), false)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clauday//CalDAV 1.5//EN',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${dtstamp}`,
    dtstart,
    dtend,
    `SUMMARY:${escapeText(input.summary)}`,
    input.location ? `LOCATION:${escapeText(input.location)}` : '',
    input.description ? `DESCRIPTION:${escapeText(input.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean)
  return lines.join('\r\n')
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
