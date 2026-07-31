/**
 * 키 조합 문자열의 파싱/정규화/표기. `Mod+Shift+D` 형태를 쓰며 `Mod` 는 mac ⌘ / 그 외 Ctrl 이다.
 * main·renderer·설정 UI 가 같은 규칙을 쓰도록 shared 에 둔다.
 */

export type KeybindingPlatform = 'darwin' | 'other'

export interface ParsedBinding {
  /** 플랫폼 주 모디파이어 (mac ⌘ / win·linux Ctrl) */
  mod: boolean
  /** 물리 Control — mac 에서 ⌘ 와 구분해 지정할 때 */
  ctrl: boolean
  alt: boolean
  shift: boolean
  /** 정규화된 키 토큰 (`KeyA` 가 아니라 `A`, `ArrowLeft`, `Enter` …) */
  key: string
}

const MODIFIER_ALIASES: Record<string, keyof Omit<ParsedBinding, 'key'>> = {
  mod: 'mod',
  cmdorctrl: 'mod',
  commandorcontrol: 'mod',
  cmd: 'mod',
  command: 'mod',
  meta: 'mod',
  '⌘': 'mod',
  ctrl: 'ctrl',
  control: 'ctrl',
  '⌃': 'ctrl',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  '⌥': 'alt',
  shift: 'shift',
  '⇧': 'shift'
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  space: 'Space',
  ' ': 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  bracketleft: 'BracketLeft',
  bracketright: 'BracketRight',
  '/': 'Slash',
  slash: 'Slash',
  ',': 'Comma',
  '.': 'Period',
  '-': 'Minus',
  '=': 'Equal'
}

/** 키 토큰 정규화 — 한 글자는 대문자로, 별칭은 표준명으로. */
export function normalizeKeyToken(raw: string): string {
  const lower = raw.toLowerCase()
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower]
  if (/^f\d{1,2}$/.test(lower)) return lower.toUpperCase()
  if (raw.length === 1) return raw.toUpperCase()
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/** `Mod+Shift+D` → 구조체. 형식이 틀리면 null. */
export function parseBinding(binding: string): ParsedBinding | null {
  const parts = binding
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return null

  const result: ParsedBinding = { mod: false, ctrl: false, alt: false, shift: false, key: '' }
  for (const part of parts) {
    const mod = MODIFIER_ALIASES[part.toLowerCase()]
    if (mod) {
      result[mod] = true
      continue
    }
    if (result.key) return null // 키가 두 개 — 잘못된 조합
    result.key = normalizeKeyToken(part)
  }
  return result.key ? result : null
}

/** 구조체 → 정규화 문자열. 모디파이어 순서를 고정해 비교 가능하게 만든다. */
export function formatBindingId(parsed: ParsedBinding): string {
  const parts: string[] = []
  if (parsed.mod) parts.push('Mod')
  if (parsed.ctrl) parts.push('Ctrl')
  if (parsed.alt) parts.push('Alt')
  if (parsed.shift) parts.push('Shift')
  parts.push(parsed.key)
  return parts.join('+')
}

/** 비교용 정규화 — 같은 조합이면 같은 문자열이 된다. 파싱 실패 시 원본. */
export function canonicalBinding(binding: string): string {
  const parsed = parseBinding(binding)
  return parsed ? formatBindingId(parsed) : binding
}

/** 화면 표기용 칩 배열. mac 은 글리프, 그 외는 단어. */
export function formatBindingChips(binding: string, platform: KeybindingPlatform): string[] {
  const parsed = parseBinding(binding)
  if (!parsed) return [binding]
  const isMac = platform === 'darwin'
  const chips: string[] = []
  if (parsed.mod) chips.push(isMac ? '⌘' : 'Ctrl')
  if (parsed.ctrl) chips.push(isMac ? '⌃' : 'Ctrl')
  if (parsed.alt) chips.push(isMac ? '⌥' : 'Alt')
  if (parsed.shift) chips.push(isMac ? '⇧' : 'Shift')
  chips.push(formatKeyLabel(parsed.key))
  return chips
}

/** 한 줄 표기 — mac 은 구분자 없이 `⌘⇧D`, 그 외는 `Ctrl+Shift+D`. */
export function formatBinding(binding: string, platform: KeybindingPlatform): string {
  const chips = formatBindingChips(binding, platform)
  return chips.join(platform === 'darwin' ? '' : '+')
}

const KEY_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  BracketLeft: '[',
  BracketRight: ']',
  Slash: '/',
  Comma: ',',
  Period: '.',
  Minus: '-',
  Equal: '=',
  Escape: 'Esc',
  Space: 'Space'
}

export function formatKeyLabel(key: string): string {
  return KEY_LABELS[key] ?? key
}

/** 키 이벤트 → 바인딩 문자열. 주 모디파이어는 항상 `Mod` 로 정규화해 플랫폼 간 이식된다. */
export function bindingFromEvent(
  e: { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
  platform: KeybindingPlatform
): string | null {
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return null

  const isMac = platform === 'darwin'
  const primary = isMac ? e.metaKey : e.ctrlKey
  const secondaryCtrl = isMac ? e.ctrlKey : false

  // 비라틴 레이아웃(한글 등)에서는 e.key 가 `ㄱ` 이라 code 의 물리 키를 쓴다
  let key = e.key
  if (e.code && /^Key[A-Z]$/.test(e.code) && !/^[a-zA-Z]$/.test(key)) key = e.code.slice(3)
  else if (e.code && /^Digit\d$/.test(e.code) && !/^\d$/.test(key)) key = e.code.slice(5)

  const parsed: ParsedBinding = {
    mod: primary,
    ctrl: secondaryCtrl,
    alt: e.altKey,
    shift: e.shiftKey,
    key: normalizeKeyToken(key)
  }
  if (!parsed.key) return null
  return formatBindingId(parsed)
}

/** 키 이벤트가 이 바인딩과 일치하는지. */
export function matchesBinding(
  e: { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
  binding: string,
  platform: KeybindingPlatform
): boolean {
  const target = parseBinding(binding)
  if (!target) return false
  const actual = bindingFromEvent(e, platform)
  return actual !== null && actual === formatBindingId(target)
}
