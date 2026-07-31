/**
 * 터미널 색 테마.
 *
 * 앱 테마(크롬)와 분리한다 — 터미널은 하루 종일 보는 표면이라 취향이 갈리고, 밝은 앱에
 * 어두운 터미널을 쓰는 조합도 흔하다. 앱 테마를 바꾼다고 터미널 색까지 따라가면 그 조합을 못 만든다.
 */
export interface TerminalThemeColors {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface TerminalTheme {
  id: string
  label: string
  /** 밝은 배경인지 — 목록에서 어두운 것과 갈라 보여준다 */
  light: boolean
  colors: TerminalThemeColors
}

export const TERMINAL_THEMES: TerminalTheme[] = [
  {
    id: 'clauday',
    label: 'Clauday',
    light: false,
    colors: {
      background: '#202429',
      foreground: '#E8E8EA',
      cursor: '#E8E8EA',
      cursorAccent: '#202429',
      selectionBackground: '#FFFFFF26',
      black: '#202429',
      red: '#EF4444',
      green: '#22C55E',
      yellow: '#FB923C',
      blue: '#3B82F6',
      magenta: '#A855F7',
      cyan: '#06B6D4',
      white: '#F9FAFB',
      brightBlack: '#9CA3AF',
      brightRed: '#FCA5A5',
      brightGreen: '#86EFAC',
      brightYellow: '#FDBA74',
      brightBlue: '#93C5FD',
      brightMagenta: '#D8B4FE',
      brightCyan: '#67E8F9',
      brightWhite: '#FFFFFF'
    }
  },
  {
    id: 'one-dark',
    label: 'One Dark',
    light: false,
    colors: {
      background: '#282C34',
      foreground: '#ABB2BF',
      cursor: '#528BFF',
      cursorAccent: '#282C34',
      selectionBackground: '#3E4451',
      black: '#282C34',
      red: '#E06C75',
      green: '#98C379',
      yellow: '#E5C07B',
      blue: '#61AFEF',
      magenta: '#C678DD',
      cyan: '#56B6C2',
      white: '#ABB2BF',
      brightBlack: '#5C6370',
      brightRed: '#E06C75',
      brightGreen: '#98C379',
      brightYellow: '#E5C07B',
      brightBlue: '#61AFEF',
      brightMagenta: '#C678DD',
      brightCyan: '#56B6C2',
      brightWhite: '#FFFFFF'
    }
  },
  {
    id: 'dracula',
    label: 'Dracula',
    light: false,
    colors: {
      background: '#282A36',
      foreground: '#F8F8F2',
      cursor: '#F8F8F2',
      cursorAccent: '#282A36',
      selectionBackground: '#44475A',
      black: '#21222C',
      red: '#FF5555',
      green: '#50FA7B',
      yellow: '#F1FA8C',
      blue: '#BD93F9',
      magenta: '#FF79C6',
      cyan: '#8BE9FD',
      white: '#F8F8F2',
      brightBlack: '#6272A4',
      brightRed: '#FF6E6E',
      brightGreen: '#69FF94',
      brightYellow: '#FFFFA5',
      brightBlue: '#D6ACFF',
      brightMagenta: '#FF92DF',
      brightCyan: '#A4FFFF',
      brightWhite: '#FFFFFF'
    }
  },
  {
    id: 'nord',
    label: 'Nord',
    light: false,
    colors: {
      background: '#2E3440',
      foreground: '#D8DEE9',
      cursor: '#D8DEE9',
      cursorAccent: '#2E3440',
      selectionBackground: '#434C5E',
      black: '#3B4252',
      red: '#BF616A',
      green: '#A3BE8C',
      yellow: '#EBCB8B',
      blue: '#81A1C1',
      magenta: '#B48EAD',
      cyan: '#88C0D0',
      white: '#E5E9F0',
      brightBlack: '#4C566A',
      brightRed: '#BF616A',
      brightGreen: '#A3BE8C',
      brightYellow: '#EBCB8B',
      brightBlue: '#81A1C1',
      brightMagenta: '#B48EAD',
      brightCyan: '#8FBCBB',
      brightWhite: '#ECEFF4'
    }
  },
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    light: false,
    colors: {
      background: '#002B36',
      foreground: '#839496',
      cursor: '#93A1A1',
      cursorAccent: '#002B36',
      selectionBackground: '#073642',
      black: '#073642',
      red: '#DC322F',
      green: '#859900',
      yellow: '#B58900',
      blue: '#268BD2',
      magenta: '#D33682',
      cyan: '#2AA198',
      white: '#EEE8D5',
      brightBlack: '#586E75',
      brightRed: '#CB4B16',
      brightGreen: '#586E75',
      brightYellow: '#657B83',
      brightBlue: '#839496',
      brightMagenta: '#6C71C4',
      brightCyan: '#93A1A1',
      brightWhite: '#FDF6E3'
    }
  },
  {
    id: 'github-light',
    label: 'GitHub Light',
    light: true,
    colors: {
      background: '#FFFFFF',
      foreground: '#24292F',
      cursor: '#24292F',
      cursorAccent: '#FFFFFF',
      selectionBackground: '#0969DA33',
      black: '#24292F',
      red: '#CF222E',
      green: '#116329',
      yellow: '#4D2D00',
      blue: '#0969DA',
      magenta: '#8250DF',
      cyan: '#1B7C83',
      white: '#6E7781',
      brightBlack: '#57606A',
      brightRed: '#A40E26',
      brightGreen: '#1A7F37',
      brightYellow: '#633C01',
      brightBlue: '#218BFF',
      brightMagenta: '#A475F9',
      brightCyan: '#3192AA',
      brightWhite: '#8C959F'
    }
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    light: true,
    colors: {
      background: '#FDF6E3',
      foreground: '#657B83',
      cursor: '#586E75',
      cursorAccent: '#FDF6E3',
      selectionBackground: '#EEE8D5',
      black: '#073642',
      red: '#DC322F',
      green: '#859900',
      yellow: '#B58900',
      blue: '#268BD2',
      magenta: '#D33682',
      cyan: '#2AA198',
      white: '#EEE8D5',
      brightBlack: '#002B36',
      brightRed: '#CB4B16',
      brightGreen: '#586E75',
      brightYellow: '#657B83',
      brightBlue: '#839496',
      brightMagenta: '#6C71C4',
      brightCyan: '#93A1A1',
      brightWhite: '#FDF6E3'
    }
  }
]

export const DEFAULT_TERMINAL_THEME_ID = 'clauday'

/** id 로 테마를 찾는다. 모르는 값(옛 설정·오타)이면 기본값 — 터미널이 검은 화면이 되면 안 된다. */
export function resolveTerminalTheme(id: string | null | undefined): TerminalTheme {
  return (
    TERMINAL_THEMES.find((theme) => theme.id === id) ??
    TERMINAL_THEMES.find((theme) => theme.id === DEFAULT_TERMINAL_THEME_ID)!
  )
}
