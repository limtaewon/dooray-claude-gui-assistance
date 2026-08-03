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
    id: 'tokyo-night',
    label: 'Tokyo Night',
    light: false,
    colors: {
      background: '#1A1B26',
      foreground: '#C0CAF5',
      cursor: '#C0CAF5',
      cursorAccent: '#1A1B26',
      selectionBackground: '#33467C',
      black: '#15161E',
      red: '#F7768E',
      green: '#9ECE6A',
      yellow: '#E0AF68',
      blue: '#7AA2F7',
      magenta: '#BB9AF7',
      cyan: '#7DCFFF',
      white: '#A9B1D6',
      brightBlack: '#414868',
      brightRed: '#F7768E',
      brightGreen: '#9ECE6A',
      brightYellow: '#E0AF68',
      brightBlue: '#7AA2F7',
      brightMagenta: '#BB9AF7',
      brightCyan: '#7DCFFF',
      brightWhite: '#C0CAF5'
    }
  },
  {
    id: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    light: false,
    colors: {
      background: '#1E1E2E',
      foreground: '#CDD6F4',
      cursor: '#F5E0DC',
      cursorAccent: '#1E1E2E',
      selectionBackground: '#585B70',
      black: '#45475A',
      red: '#F38BA8',
      green: '#A6E3A1',
      yellow: '#F9E2AF',
      blue: '#89B4FA',
      magenta: '#F5C2E7',
      cyan: '#94E2D5',
      white: '#BAC2DE',
      brightBlack: '#585B70',
      brightRed: '#F38BA8',
      brightGreen: '#A6E3A1',
      brightYellow: '#F9E2AF',
      brightBlue: '#89B4FA',
      brightMagenta: '#F5C2E7',
      brightCyan: '#94E2D5',
      brightWhite: '#A6ADC8'
    }
  },
  {
    id: 'gruvbox-dark',
    label: 'Gruvbox Dark',
    light: false,
    colors: {
      background: '#282828',
      foreground: '#EBDBB2',
      cursor: '#EBDBB2',
      cursorAccent: '#282828',
      selectionBackground: '#504945',
      black: '#282828',
      red: '#CC241D',
      green: '#98971A',
      yellow: '#D79921',
      blue: '#458588',
      magenta: '#B16286',
      cyan: '#689D6A',
      white: '#A89984',
      brightBlack: '#928374',
      brightRed: '#FB4934',
      brightGreen: '#B8BB26',
      brightYellow: '#FABD2F',
      brightBlue: '#83A598',
      brightMagenta: '#D3869B',
      brightCyan: '#8EC07C',
      brightWhite: '#EBDBB2'
    }
  },
  {
    id: 'monokai',
    label: 'Monokai',
    light: false,
    colors: {
      background: '#272822',
      foreground: '#F8F8F2',
      cursor: '#F8F8F0',
      cursorAccent: '#272822',
      selectionBackground: '#49483E',
      black: '#272822',
      red: '#F92672',
      green: '#A6E22E',
      yellow: '#F4BF75',
      blue: '#66D9EF',
      magenta: '#AE81FF',
      cyan: '#A1EFE4',
      white: '#F8F8F2',
      brightBlack: '#75715E',
      brightRed: '#F92672',
      brightGreen: '#A6E22E',
      brightYellow: '#F4BF75',
      brightBlue: '#66D9EF',
      brightMagenta: '#AE81FF',
      brightCyan: '#A1EFE4',
      brightWhite: '#F9F8F5'
    }
  },
  {
    id: 'ayu-dark',
    label: 'Ayu Dark',
    light: false,
    colors: {
      background: '#0B0E14',
      foreground: '#BFBDB6',
      cursor: '#E6B450',
      cursorAccent: '#0B0E14',
      selectionBackground: '#273747',
      black: '#01060E',
      red: '#EA6C73',
      green: '#91B362',
      yellow: '#F9AF4F',
      blue: '#53BDFA',
      magenta: '#FAE994',
      cyan: '#90E1C6',
      white: '#C7C7C7',
      brightBlack: '#686868',
      brightRed: '#F07178',
      brightGreen: '#C2D94C',
      brightYellow: '#FFB454',
      brightBlue: '#59C2FF',
      brightMagenta: '#FFEE99',
      brightCyan: '#95E6CB',
      brightWhite: '#FFFFFF'
    }
  },
  {
    id: 'night-owl',
    label: 'Night Owl',
    light: false,
    colors: {
      background: '#011627',
      foreground: '#D6DEEB',
      cursor: '#80A4C2',
      cursorAccent: '#011627',
      selectionBackground: '#1D3B53',
      black: '#011627',
      red: '#EF5350',
      green: '#22DA6E',
      yellow: '#ADDB67',
      blue: '#82AAFF',
      magenta: '#C792EA',
      cyan: '#21C7A8',
      white: '#FFFFFF',
      brightBlack: '#575656',
      brightRed: '#EF5350',
      brightGreen: '#22DA6E',
      brightYellow: '#FFEB95',
      brightBlue: '#82AAFF',
      brightMagenta: '#C792EA',
      brightCyan: '#7FDBCA',
      brightWhite: '#FFFFFF'
    }
  },
  {
    id: 'rose-pine',
    label: 'Rosé Pine',
    light: false,
    colors: {
      background: '#191724',
      foreground: '#E0DEF4',
      cursor: '#E0DEF4',
      cursorAccent: '#191724',
      selectionBackground: '#403D52',
      black: '#26233A',
      red: '#EB6F92',
      green: '#31748F',
      yellow: '#F6C177',
      blue: '#9CCFD8',
      magenta: '#C4A7E7',
      cyan: '#EBBCBA',
      white: '#E0DEF4',
      brightBlack: '#6E6A86',
      brightRed: '#EB6F92',
      brightGreen: '#31748F',
      brightYellow: '#F6C177',
      brightBlue: '#9CCFD8',
      brightMagenta: '#C4A7E7',
      brightCyan: '#EBBCBA',
      brightWhite: '#E0DEF4'
    }
  },
  {
    id: 'everforest-dark',
    label: 'Everforest Dark',
    light: false,
    colors: {
      background: '#2D353B',
      foreground: '#D3C6AA',
      cursor: '#D3C6AA',
      cursorAccent: '#2D353B',
      selectionBackground: '#475258',
      black: '#475258',
      red: '#E67E80',
      green: '#A7C080',
      yellow: '#DBBC7F',
      blue: '#7FBBB3',
      magenta: '#D699B6',
      cyan: '#83C092',
      white: '#D3C6AA',
      brightBlack: '#5C6A72',
      brightRed: '#E67E80',
      brightGreen: '#A7C080',
      brightYellow: '#DBBC7F',
      brightBlue: '#7FBBB3',
      brightMagenta: '#D699B6',
      brightCyan: '#83C092',
      brightWhite: '#DFDDC8'
    }
  },
  {
    id: 'vscode-dark',
    label: 'VS Code Dark+',
    light: false,
    colors: {
      background: '#1E1E1E',
      foreground: '#CCCCCC',
      cursor: '#FFFFFF',
      cursorAccent: '#1E1E1E',
      selectionBackground: '#264F78',
      black: '#000000',
      red: '#CD3131',
      green: '#0DBC79',
      yellow: '#E5E510',
      blue: '#2472C8',
      magenta: '#BC3FBC',
      cyan: '#11A8CD',
      white: '#E5E5E5',
      brightBlack: '#666666',
      brightRed: '#F14C4C',
      brightGreen: '#23D18B',
      brightYellow: '#F5F543',
      brightBlue: '#3B8EEA',
      brightMagenta: '#D670D6',
      brightCyan: '#29B8DB',
      brightWhite: '#FFFFFF'
    }
  },
  {
    id: 'snazzy',
    label: 'Snazzy',
    light: false,
    colors: {
      background: '#282A36',
      foreground: '#EFF0EB',
      cursor: '#97979B',
      cursorAccent: '#282A36',
      selectionBackground: '#4E5262',
      black: '#282A36',
      red: '#FF5C57',
      green: '#5AF78E',
      yellow: '#F3F99D',
      blue: '#57C7FF',
      magenta: '#FF6AC1',
      cyan: '#9AEDFE',
      white: '#F1F1F0',
      brightBlack: '#686868',
      brightRed: '#FF5C57',
      brightGreen: '#5AF78E',
      brightYellow: '#F3F99D',
      brightBlue: '#57C7FF',
      brightMagenta: '#FF6AC1',
      brightCyan: '#9AEDFE',
      brightWhite: '#EFF0EB'
    }
  },
  {
    id: 'catppuccin-latte',
    label: 'Catppuccin Latte',
    light: true,
    colors: {
      background: '#EFF1F5',
      foreground: '#4C4F69',
      cursor: '#DC8A78',
      cursorAccent: '#EFF1F5',
      selectionBackground: '#BCC0CC',
      black: '#5C5F77',
      red: '#D20F39',
      green: '#40A02B',
      yellow: '#DF8E1D',
      blue: '#1E66F5',
      magenta: '#EA76CB',
      cyan: '#179299',
      white: '#ACB0BE',
      brightBlack: '#6C6F85',
      brightRed: '#D20F39',
      brightGreen: '#40A02B',
      brightYellow: '#DF8E1D',
      brightBlue: '#1E66F5',
      brightMagenta: '#EA76CB',
      brightCyan: '#179299',
      brightWhite: '#BCC0CC'
    }
  },
  {
    id: 'gruvbox-light',
    label: 'Gruvbox Light',
    light: true,
    colors: {
      background: '#FBF1C7',
      foreground: '#3C3836',
      cursor: '#3C3836',
      cursorAccent: '#FBF1C7',
      selectionBackground: '#EBDBB2',
      black: '#FBF1C7',
      red: '#CC241D',
      green: '#98971A',
      yellow: '#D79921',
      blue: '#458588',
      magenta: '#B16286',
      cyan: '#689D6A',
      white: '#7C6F64',
      brightBlack: '#928374',
      brightRed: '#9D0006',
      brightGreen: '#79740E',
      brightYellow: '#B57614',
      brightBlue: '#076678',
      brightMagenta: '#8F3F71',
      brightCyan: '#427B58',
      brightWhite: '#3C3836'
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
