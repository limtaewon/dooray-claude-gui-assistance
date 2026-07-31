/**
 * 터미널 뷰 단축키 테이블 (v2.0 B-4, ADR-v2-terminal-p2-02 §8).
 *
 * `{ id, mac, win, action }` 형태의 테이블 상수로 선언해 Workstream D-1 의 단축키 레지스트리가
 * 그대로 흡수할 수 있게 한다(PRD 비목표 — 레지스트리 자체는 D-1 소관, 여기선 테이블만).
 * 단축키는 `TerminalView` 가 `active` prop 이 true 일 때만 순회한다.
 */

export type TerminalShortcutId =
  | 'splitRight'
  | 'splitDown'
  | 'focusLeft'
  | 'focusRight'
  | 'focusUp'
  | 'focusDown'
  | 'closePane'
  | 'newTab'
  | 'toggleTaskDrawer'

/** 단축키 판정에 필요한 최소 필드 — KeyboardEvent 를 그대로 넘겨도 되지만 테스트에선 리터럴로 구성. */
export interface ShortcutKeyState {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export interface TerminalShortcutBinding {
  id: TerminalShortcutId
  /** macOS 표시용 라벨(매뉴얼/힌트) */
  macLabel: string
  /** Windows/Linux 표시용 라벨 */
  winLabel: string
  /** macOS 판정 — Cmd 계열 */
  matchesMac: (e: ShortcutKeyState) => boolean
  /** Windows/Linux 판정 — Ctrl 계열 */
  matchesWin: (e: ShortcutKeyState) => boolean
}

function isPlainKey(e: ShortcutKeyState, key: string, meta: boolean, ctrl: boolean, shift: boolean, alt: boolean): boolean {
  return e.key.toLowerCase() === key.toLowerCase() && e.metaKey === meta && e.ctrlKey === ctrl && e.shiftKey === shift && e.altKey === alt
}

/**
 * v2.0 B-4 단축키 테이블. ⌘D 는 xterm 의 EOF(Ctrl+D)와 겹치지 않도록 앱이 먼저 가로챈다
 * (ADR-02 §8) — EOF 는 Ctrl+D 그대로 유지된다. Windows/Linux 는 Ctrl+D 를 분할에 배정하지 않고
 * Ctrl+Alt+D/Ctrl+Shift+D 를 쓴다.
 */
export const TERMINAL_SHORTCUTS: TerminalShortcutBinding[] = [
  {
    id: 'splitRight',
    macLabel: '⌘D',
    winLabel: 'Ctrl+Alt+D',
    matchesMac: (e) => isPlainKey(e, 'd', true, false, false, false),
    matchesWin: (e) => isPlainKey(e, 'd', false, true, false, true)
  },
  {
    id: 'splitDown',
    macLabel: '⌘⇧D',
    winLabel: 'Ctrl+Shift+D',
    matchesMac: (e) => isPlainKey(e, 'd', true, false, true, false),
    matchesWin: (e) => isPlainKey(e, 'd', false, true, true, false)
  },
  {
    id: 'focusLeft',
    macLabel: '⌥⌘←',
    winLabel: 'Ctrl+Alt+←',
    matchesMac: (e) => isPlainKey(e, 'ArrowLeft', true, false, false, true),
    matchesWin: (e) => isPlainKey(e, 'ArrowLeft', false, true, false, true)
  },
  {
    id: 'focusRight',
    macLabel: '⌥⌘→',
    winLabel: 'Ctrl+Alt+→',
    matchesMac: (e) => isPlainKey(e, 'ArrowRight', true, false, false, true),
    matchesWin: (e) => isPlainKey(e, 'ArrowRight', false, true, false, true)
  },
  {
    id: 'focusUp',
    macLabel: '⌥⌘↑',
    winLabel: 'Ctrl+Alt+↑',
    matchesMac: (e) => isPlainKey(e, 'ArrowUp', true, false, false, true),
    matchesWin: (e) => isPlainKey(e, 'ArrowUp', false, true, false, true)
  },
  {
    id: 'focusDown',
    macLabel: '⌥⌘↓',
    winLabel: 'Ctrl+Alt+↓',
    matchesMac: (e) => isPlainKey(e, 'ArrowDown', true, false, false, true),
    matchesWin: (e) => isPlainKey(e, 'ArrowDown', false, true, false, true)
  },
  {
    id: 'closePane',
    macLabel: '⌘W',
    winLabel: 'Ctrl+W',
    matchesMac: (e) => isPlainKey(e, 'w', true, false, false, false),
    matchesWin: (e) => isPlainKey(e, 'w', false, true, false, false)
  },
  {
    id: 'newTab',
    macLabel: '⌘T',
    winLabel: 'Ctrl+T',
    matchesMac: (e) => isPlainKey(e, 't', true, false, false, false),
    matchesWin: (e) => isPlainKey(e, 't', false, true, false, false)
  },
  {
    // v2.0 — 작업 패널 토글 (업무 / 변경사항 / 히스토리 / 브랜치)
    id: 'toggleTaskDrawer',
    macLabel: '⌘⇧T',
    winLabel: 'Ctrl+Shift+T',
    matchesMac: (e) => isPlainKey(e, 't', true, false, true, false),
    matchesWin: (e) => isPlainKey(e, 't', false, true, true, false)
  }
]

/** isMac 여부에 맞춰 바인딩이 이 키 이벤트와 일치하는지 판정하는 순수 함수. */
export function matchShortcut(e: ShortcutKeyState, binding: TerminalShortcutBinding, isMac: boolean): boolean {
  return isMac ? binding.matchesMac(e) : binding.matchesWin(e)
}

/**
 * v2.0 D — 사용자 오버라이드가 있는 액션은 레지스트리 조합을 먼저 본다. 오버라이드가 없으면
 * 아래 기본 테이블로 폴백한다(레지스트리 기본값과 동일한 조합이라 결과가 같다).
 */
export function resolveShortcutWithOverrides(
  e: ShortcutKeyState & { code?: string },
  isMac: boolean,
  matches: (e: ShortcutKeyState & { code?: string }, actionId: string) => boolean
): TerminalShortcutId | null {
  for (const binding of TERMINAL_SHORTCUTS) {
    if (matches(e, `terminal.${binding.id}`)) return binding.id
  }
  return resolveShortcut(e, isMac)
}

/** 테이블을 순회해 일치하는 첫 바인딩의 id 를 반환한다. 없으면 null. */
export function resolveShortcut(e: ShortcutKeyState, isMac: boolean): TerminalShortcutId | null {
  for (const binding of TERMINAL_SHORTCUTS) {
    if (matchShortcut(e, binding, isMac)) return binding.id
  }
  return null
}
