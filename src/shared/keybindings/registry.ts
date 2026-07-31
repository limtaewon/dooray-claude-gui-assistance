import { canonicalBinding } from './binding'

/** 단축키가 발화하는 범위. 설정 UI 의 충돌 검사 버킷이기도 하다. */
export type KeybindingScope = 'global' | 'terminal' | 'workspace'

export interface KeybindingDefinition {
  id: string
  title: string
  /** 설정 화면 그룹 제목 */
  group: string
  scope: KeybindingScope
  /** mac 기본 조합. 빈 배열이면 미할당 */
  darwin: string[]
  /** Windows/Linux 기본 조합 */
  other: string[]
  /** 셸 제어문자와 얽혀 있거나 시스템 메뉴가 소유해 변경할 수 없는 항목 */
  fixed?: boolean
  /** 설정 화면 검색 보조 */
  keywords?: string[]
  note?: string
}

/**
 * 앱 전체 단축키 정의. 여기 없는 조합은 어디서도 발화하지 않는 것이 목표이며,
 * `fixed: true` 는 아직 레지스트리로 흡수하지 않았거나 구조상 고정된 항목이다.
 */
export const KEYBINDINGS: KeybindingDefinition[] = [
  // ── 전역
  {
    id: 'global.commandPalette',
    title: '커맨드 팔레트 열기',
    group: '전역',
    scope: 'global',
    darwin: ['Mod+K'],
    other: ['Mod+K'],
    keywords: ['command', 'palette', '검색', '이동']
  },
  {
    id: 'global.quickTodo',
    title: '오늘 할 일 빠른 추가',
    group: '전역',
    scope: 'global',
    darwin: ['Mod+Slash'],
    other: ['Mod+Slash'],
    keywords: ['todo', '할일', '태스크']
  },
  {
    id: 'global.recentViews',
    title: '최근 뷰 전환',
    group: '전역',
    scope: 'global',
    darwin: ['Mod+E'],
    other: ['Mod+E'],
    keywords: ['recent', '최근', '전환']
  },
  {
    id: 'global.feedback',
    title: '피드백 보내기',
    group: '전역',
    scope: 'global',
    darwin: ['Mod+Shift+B'],
    other: ['Mod+Shift+B'],
    keywords: ['feedback', '제보', '버그']
  },

  // ── 터미널 (뷰)
  {
    id: 'terminal.newTab',
    title: '새 터미널 탭',
    group: '터미널',
    scope: 'terminal',
    darwin: ['Mod+T'],
    other: ['Mod+T'],
    keywords: ['tab', '탭']
  },
  {
    id: 'terminal.closePane',
    title: 'pane 닫기 (마지막이면 탭 닫기)',
    group: '터미널',
    scope: 'terminal',
    darwin: ['Mod+W'],
    other: ['Mod+W'],
    keywords: ['close', '닫기']
  },
  {
    id: 'terminal.splitRight',
    title: '오른쪽으로 분할',
    group: '터미널',
    scope: 'terminal',
    darwin: ['Mod+D'],
    other: ['Mod+Alt+D'],
    keywords: ['split', '분할'],
    note: 'EOF 는 Ctrl+D 로 그대로 보낼 수 있습니다'
  },
  {
    id: 'terminal.splitDown',
    title: '아래로 분할',
    group: '터미널',
    scope: 'terminal',
    darwin: ['Mod+Shift+D'],
    other: ['Mod+Shift+D'],
    keywords: ['split', '분할']
  },
  {
    id: 'terminal.focusLeft',
    title: 'pane 포커스 ←',
    group: '터미널',
    scope: 'terminal',
    darwin: ['Mod+Alt+ArrowLeft'],
    other: ['Mod+Alt+ArrowLeft'],
    keywords: ['focus', '포커스', '이동']
  },
  {
    id: 'terminal.focusRight',
    title: 'pane 포커스 →',
    group: '터미널',
    scope: 'terminal',
    darwin: ['Mod+Alt+ArrowRight'],
    other: ['Mod+Alt+ArrowRight'],
    keywords: ['focus', '포커스', '이동']
  },
  {
    id: 'terminal.focusUp',
    title: 'pane 포커스 ↑',
    group: '터미널',
    scope: 'terminal',
    darwin: ['Mod+Alt+ArrowUp'],
    other: ['Mod+Alt+ArrowUp'],
    keywords: ['focus', '포커스', '이동']
  },
  {
    id: 'terminal.focusDown',
    title: 'pane 포커스 ↓',
    group: '터미널',
    scope: 'terminal',
    darwin: ['Mod+Alt+ArrowDown'],
    other: ['Mod+Alt+ArrowDown'],
    keywords: ['focus', '포커스', '이동']
  },
  {
    id: 'terminal.toggleTaskDrawer',
    title: '두레이 태스크 드로어',
    group: '터미널',
    scope: 'terminal',
    darwin: ['Mod+Shift+T'],
    other: ['Mod+Shift+T'],
    keywords: ['task', '드로어', '두레이']
  },
  {
    id: 'terminal.search',
    title: '터미널 안에서 검색',
    group: '터미널',
    scope: 'terminal',
    darwin: ['Mod+F'],
    other: ['Mod+F'],
    fixed: true,
    keywords: ['find', '검색']
  },

  // ── 터미널 입력/편집 (셸 제어문자와 직결 — 고정)
  {
    id: 'terminal.clear',
    title: '화면 지우기',
    group: '터미널 입력',
    scope: 'terminal',
    darwin: ['Mod+K'],
    other: [],
    fixed: true,
    note: '터미널 포커스일 때만 동작합니다'
  },
  {
    id: 'terminal.lineStart',
    title: '줄 처음으로',
    group: '터미널 입력',
    scope: 'terminal',
    darwin: ['Mod+ArrowLeft'],
    other: [],
    fixed: true
  },
  {
    id: 'terminal.lineEnd',
    title: '줄 끝으로',
    group: '터미널 입력',
    scope: 'terminal',
    darwin: ['Mod+ArrowRight'],
    other: [],
    fixed: true
  },
  {
    id: 'terminal.wordBack',
    title: '한 단어 뒤로',
    group: '터미널 입력',
    scope: 'terminal',
    darwin: ['Alt+ArrowLeft'],
    other: ['Alt+ArrowLeft'],
    fixed: true
  },
  {
    id: 'terminal.wordForward',
    title: '한 단어 앞으로',
    group: '터미널 입력',
    scope: 'terminal',
    darwin: ['Alt+ArrowRight'],
    other: ['Alt+ArrowRight'],
    fixed: true
  },
  {
    id: 'terminal.copy',
    title: '복사',
    group: '터미널 입력',
    scope: 'terminal',
    darwin: ['Mod+C'],
    other: ['Mod+Shift+C'],
    fixed: true,
    note: 'Windows/Linux 의 Ctrl+C 는 SIGINT 로 남겨둡니다'
  },
  {
    id: 'terminal.paste',
    title: '붙여넣기',
    group: '터미널 입력',
    scope: 'terminal',
    darwin: ['Mod+V'],
    other: ['Mod+Shift+V'],
    fixed: true
  },
  {
    id: 'terminal.newline',
    title: '줄바꿈 (제출하지 않음)',
    group: '터미널 입력',
    scope: 'terminal',
    darwin: ['Shift+Enter'],
    other: ['Shift+Enter'],
    fixed: true
  },

  // ── 시스템 메뉴 (Electron 소유 — 변경 불가)
  {
    id: 'system.undo',
    title: '실행 취소',
    group: '시스템',
    scope: 'global',
    darwin: ['Mod+Z'],
    other: ['Mod+Z'],
    fixed: true
  },
  {
    id: 'system.redo',
    title: '다시 실행',
    group: '시스템',
    scope: 'global',
    darwin: ['Mod+Shift+Z'],
    other: ['Mod+Shift+Z'],
    fixed: true
  },
  {
    id: 'system.reload',
    title: '새로고침',
    group: '시스템',
    scope: 'global',
    darwin: ['Mod+Shift+R'],
    other: ['Mod+Shift+R'],
    fixed: true
  }
]

/** 사용자 오버라이드 — `actionId → 바인딩 배열`. 빈 배열은 "비활성". */
export type KeybindingOverrides = Record<string, string[]>

export const KEYBINDINGS_SETTINGS_KEY = 'keybindings'

export function findDefinition(id: string): KeybindingDefinition | undefined {
  return KEYBINDINGS.find((d) => d.id === id)
}

/** 플랫폼 기본 바인딩. */
export function defaultBindingsOf(def: KeybindingDefinition, platform: 'darwin' | 'other'): string[] {
  return platform === 'darwin' ? def.darwin : def.other
}

/** 오버라이드를 반영한 실제 바인딩. 오버라이드가 없으면 기본값. */
export function effectiveBindings(
  id: string,
  platform: 'darwin' | 'other',
  overrides: KeybindingOverrides = {}
): string[] {
  const override = overrides[id]
  if (override) return override.map(canonicalBinding)
  const def = findDefinition(id)
  return def ? defaultBindingsOf(def, platform).map(canonicalBinding) : []
}

export interface KeybindingConflict {
  binding: string
  scope: KeybindingScope
  actionIds: string[]
}

/**
 * 같은 스코프에서 같은 조합을 쓰는 액션을 찾는다. 기본값끼리의 의도적 중복은 노이즈이므로
 * **사용자가 바꾼 액션이 관련된 충돌만** 보고한다.
 */
export function findConflicts(
  platform: 'darwin' | 'other',
  overrides: KeybindingOverrides = {}
): KeybindingConflict[] {
  const buckets = new Map<string, { scope: KeybindingScope; ids: string[] }>()
  for (const def of KEYBINDINGS) {
    for (const binding of effectiveBindings(def.id, platform, overrides)) {
      const key = `${def.scope} ${binding}`
      const bucket = buckets.get(key) ?? { scope: def.scope, ids: [] }
      bucket.ids.push(def.id)
      buckets.set(key, bucket)
    }
  }

  const customized = new Set(Object.keys(overrides))
  const conflicts: KeybindingConflict[] = []
  for (const [key, { scope, ids }] of buckets) {
    if (ids.length < 2) continue
    if (customized.size > 0 && !ids.some((id) => customized.has(id))) continue
    conflicts.push({ binding: key.split(' ')[1], scope, actionIds: ids })
  }
  return conflicts
}
