/**
 * 터미널 글꼴.
 *
 * CJK 폴백은 어떤 선택에도 항상 뒤에 붙인다 — 한글 글리프가 없는 폰트로 떨어지면 셀 폭이 어긋나
 * "테 스 트" 처럼 벌어진다.
 */
const CJK_FALLBACK = `"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans Mono CJK KR", monospace`

export interface TerminalFontFamily {
  id: string
  label: string
  /** CJK 폴백 앞까지의 스택 */
  stack: string
  /** 설치돼 있지 않으면 뒤로 떨어진다는 안내 */
  note?: string
}

export const TERMINAL_FONT_FAMILIES: TerminalFontFamily[] = [
  {
    id: 'system',
    label: '시스템 고정폭',
    stack: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono"`,
    note: 'OS 기본 글꼴 — 내려받지 않아 가장 또렷합니다'
  },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    stack: `"JetBrains Mono"`,
    note: '웹폰트로 받아옵니다. 망이 막혀 있으면 시스템 글꼴로 떨어집니다'
  },
  { id: 'd2coding', label: 'D2Coding', stack: `D2Coding, "D2 coding"`, note: '설치돼 있어야 적용됩니다' },
  { id: 'sarasa', label: 'Sarasa Mono K', stack: `"Sarasa Mono K", "Sarasa Term K"`, note: '설치돼 있어야 적용됩니다' },
  { id: 'fira', label: 'Fira Code', stack: `"Fira Code"`, note: '설치돼 있어야 적용됩니다' },
  { id: 'cascadia', label: 'Cascadia Mono', stack: `"Cascadia Mono", "Cascadia Code"`, note: 'Windows 기본 제공' }
]

export interface TerminalFontSettings {
  familyId: string
  size: number
  /** 줄 간격 배수 */
  lineHeight: number
  /** 400 = 보통, 500 = 조금 굵게. 흐릿해 보일 때 굵기를 올리면 나아진다 */
  weight: 400 | 500 | 600
}

export const DEFAULT_TERMINAL_FONT: TerminalFontSettings = {
  familyId: 'system',
  size: 13,
  lineHeight: 1.4,
  weight: 400
}

export const TERMINAL_FONT_SIZE_RANGE = { min: 9, max: 24 } as const
export const TERMINAL_LINE_HEIGHT_RANGE = { min: 1, max: 2 } as const

/** 저장값을 안전한 범위로 다듬는다 — 잘못된 값이 들어와도 터미널이 깨지지 않아야 한다. */
export function resolveTerminalFont(saved: unknown): TerminalFontSettings {
  const input = (saved ?? {}) as Partial<TerminalFontSettings>
  const family = TERMINAL_FONT_FAMILIES.find((f) => f.id === input.familyId)
  const size = Number(input.size)
  const lineHeight = Number(input.lineHeight)
  const weight = Number(input.weight)

  return {
    familyId: family?.id ?? DEFAULT_TERMINAL_FONT.familyId,
    size: clamp(Number.isFinite(size) ? size : DEFAULT_TERMINAL_FONT.size, TERMINAL_FONT_SIZE_RANGE),
    lineHeight: Number.isFinite(lineHeight)
      ? clamp(lineHeight, TERMINAL_LINE_HEIGHT_RANGE)
      : DEFAULT_TERMINAL_FONT.lineHeight,
    weight: weight === 500 || weight === 600 ? weight : 400
  }
}

/** xterm 에 넘길 fontFamily — 고른 글꼴 + CJK 폴백. */
export function terminalFontFamily(familyId: string): string {
  const family = TERMINAL_FONT_FAMILIES.find((f) => f.id === familyId) ?? TERMINAL_FONT_FAMILIES[0]
  return `${family.stack}, ${CJK_FALLBACK}`
}

function clamp(value: number, range: { min: number; max: number }): number {
  return Math.min(Math.max(value, range.min), range.max)
}
