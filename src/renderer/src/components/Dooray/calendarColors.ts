import type { UnifiedCalendar } from '../../../../shared/types/calendar'

export interface ColorStyle {
  barBg: string
  barText: string
  softBg: string
  softText: string
  dotBg: string
}

/** 사용자 선택 가능한 12색 팔레트 (Google Calendar 스타일 인기색) */
export const COLOR_PALETTE: string[] = [
  '#7986cb', // lavender
  '#33b679', // sage
  '#8e24aa', // grape
  '#e67c73', // flamingo
  '#f6bf26', // banana
  '#f4511e', // tangerine
  '#039be5', // peacock
  '#616161', // graphite
  '#3f51b5', // blueberry
  '#0b8043', // basil
  '#d50000', // tomato
  '#ec4899'  // pink
]

export function normalizeHex(input: string): string | null {
  let s = input.trim()
  if (!s) return null
  if (!s.startsWith('#')) s = '#' + s
  // #RGB → #RRGGBB
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1], g = s[2], b = s[3]
    s = `#${r}${r}${g}${g}${b}${b}`
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
  return null
}

const HEX6_RE = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/

function isHex(s?: string | null): s is string {
  return !!s && HEX6_RE.test(s)
}

function hashIndex(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h) % COLOR_PALETTE.length
}

/**
 * 캘린더 색상 결정 — 1순위: 사용자 지정 override, 2순위: 서버 색(CalDAV calendar-color),
 * 3순위: 캘린더 ID 해시 → 팔레트.
 */
export function resolveCalendarHex(
  calId: string,
  calendars: UnifiedCalendar[] | null | undefined,
  overrides?: Record<string, string> | null
): string {
  const ov = overrides?.[calId]
  if (isHex(ov)) return ov.slice(0, 7)
  const meta = calendars?.find((c) => c.id === calId)
  if (isHex(meta?.color)) return (meta!.color as string).slice(0, 7)
  return COLOR_PALETTE[hashIndex(calId)]
}

export function styleFromHex(hex: string): ColorStyle {
  return {
    barBg: hex,
    barText: '#ffffff',
    softBg: `${hex}26`, // ~15% alpha
    softText: hex,
    dotBg: hex
  }
}

export function colorStyleFor(
  calId: string,
  calendars: UnifiedCalendar[],
  overrides?: Record<string, string> | null
): ColorStyle {
  return styleFromHex(resolveCalendarHex(calId, calendars, overrides))
}
