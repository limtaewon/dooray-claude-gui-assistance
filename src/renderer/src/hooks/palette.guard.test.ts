/**
 * 원시 Tailwind 팔레트 클래스(`text-red-400`, `bg-emerald-500` …) 사용을 막는 가드.
 *
 * 왜 필요한가: 팔레트 클래스는 컴파일은 되지만 테마를 따르지 않는다. 라이트에서만 대비가
 * 무너지거나(다크 값을 그대로 흰 배경에 얹는 경우), `dark:` 변형을 한쪽에만 붙여 반쪽 대응이
 * 되는 식으로 조용히 어긋난다. 의미색은 `--c-*-bg` / `--c-*-fg` 페어를 써야 두 테마가 함께 간다.
 *
 * v2.0.4 시점 잔존 213곳은 아래 BASELINE 에 파일별 건수로 박아 두었다.
 * - 새 위반은 즉시 실패한다.
 * - 기존 파일을 정리해 건수가 줄면 "BASELINE 을 낮추라"고 실패한다 — 되돌아가지 않게.
 * 목표는 BASELINE 이 빈 객체가 되는 것이다.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const RENDERER_SRC = join(__dirname, '..')

const PALETTE_HUES = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'slate', 'gray', 'zinc', 'stone'
]
const UTILITY_PREFIXES = ['text', 'bg', 'border', 'from', 'to', 'via', 'ring', 'fill', 'stroke', 'decoration', 'divide', 'outline', 'shadow', 'accent', 'caret']

/** `dark:hover:bg-red-500/20` 같은 변형·불투명도 조합까지 잡는다 */
const OFFENDER_RE = new RegExp(
  `(?:[a-z-]+:)*(?:${UTILITY_PREFIXES.join('|')})-(?:${PALETTE_HUES.join('|')})-(?:50|[1-9]00)(?:\\/\\d+)?\\b`,
  'g'
)

/**
 * v2.0.4 시점의 잔존 건수. 리뷰가 지목한 BriefingPanel / DashboardView / MCPCard 는 이미 0 이다.
 * 새로 추가하지 말 것 — 줄이기만 한다.
 */
const BASELINE: Record<string, number> = {
  '/App.tsx': 1,
  '/components/AIRecommend/AIRecommendView.tsx': 3,
  '/components/Community/CommunityView.tsx': 9,
  '/components/Dooray/CalendarAssistant.tsx': 5,
  '/components/Dooray/CalendarMonthView.tsx': 17,
  '/components/Dooray/DoorayAssistant.tsx': 1,
  '/components/Dooray/DooraySetup.tsx': 2,
  '/components/Dooray/EventEditModal.tsx': 7,
  '/components/Dooray/MessengerAssistant.tsx': 6,
  '/components/Dooray/ProjectTaskView.tsx': 3,
  '/components/Dooray/QuickTodoModal.tsx': 2,
  '/components/Dooray/ReportGenerator.tsx': 1,
  '/components/Dooray/SkillQuickToggle.tsx': 23,
  '/components/Dooray/TaskAssistant.tsx': 2,
  '/components/Dooray/TaskRow.tsx': 4,
  '/components/Dooray/TeamInsights.tsx': 9,
  '/components/Dooray/WikiManager.tsx': 9,
  '/components/MentionAgent/MentionAgentView.tsx': 1,
  '/components/Monitoring/MonitoringView.tsx': 5,
  '/components/Monitoring/SocketModeBadge.tsx': 13,
  '/components/Monitoring/WatcherEditModal.tsx': 9,
  '/components/Sessions/ClaudeCodeSessionsView.tsx': 3,
  '/components/Sessions/SessionExplorer.tsx': 1,
  '/components/Settings/SettingsView.tsx': 26,
  '/components/Settings/UsageInsights.tsx': 16,
  '/components/Skills/SkillCreateModal.tsx': 3,
  '/components/Skills/SkillEditor.tsx': 4,
  '/components/Terminal/ClaudeChatPane.tsx': 9,
  '/components/Terminal/TerminalSearchBar.tsx': 1,
  '/components/Terminal/TerminalView.tsx': 3,
  '/components/Usage/UsageDashboard.tsx': 4,
  '/components/common/ErrorBoundary.tsx': 3,
  '/components/common/ImageLightbox.tsx': 2,
  '/components/common/ProjectFilter.tsx': 2,
  '/components/common/WikiStoragePicker.tsx': 4
}

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc)
      continue
    }
    if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) acc.push(full)
  }
  return acc
}

/** BASELINE 키는 POSIX 구분자로 적혀 있다 — Windows 의 `\` 를 맞춰 주지 않으면 전부 매칭에 실패한다. */
function toKey(file: string): string {
  return file.replace(RENDERER_SRC, '').replace(/\\/g, '/')
}

function countByFile(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const file of collectSourceFiles(RENDERER_SRC)) {
    const matches = readFileSync(file, 'utf-8').match(OFFENDER_RE)
    if (matches) counts[toKey(file)] = matches.length
  }
  return counts
}

describe('원시 Tailwind 팔레트 가드', () => {
  const counts = countByFile()

  it('BASELINE 에 없는 파일에는 팔레트 클래스가 없어야 한다', () => {
    const added = Object.keys(counts).filter((f) => !(f in BASELINE))
    expect(
      added,
      '원시 팔레트 클래스는 테마를 따르지 않습니다. 의미색은 --c-*-bg / --c-*-fg 페어를,\n' +
        '크롬은 bg-* / text-* 무채색 토큰을 쓰세요.\n\n' +
        added.map((f) => `${f}: ${counts[f]}곳`).join('\n')
    ).toEqual([])
  })

  it('BASELINE 파일의 건수가 늘지 않아야 한다', () => {
    const grown = Object.entries(counts)
      .filter(([file, n]) => file in BASELINE && n > BASELINE[file])
      .map(([file, n]) => `${file}: ${BASELINE[file]} → ${n}`)
    expect(grown, '기존 파일에 팔레트 클래스를 더 추가했습니다.\n\n' + grown.join('\n')).toEqual([])
  })

  it('정리된 만큼 BASELINE 도 낮춰야 한다', () => {
    const stale = Object.entries(BASELINE)
      .filter(([file, n]) => (counts[file] ?? 0) < n)
      .map(([file, n]) => `${file}: ${n} → ${counts[file] ?? 0}`)
    expect(
      stale,
      '팔레트 클래스를 정리했으면 BASELINE 도 함께 낮춰 주세요 (0 이면 항목 삭제).\n' +
        '이 값이 그대로면 다시 늘어나도 가드가 안 잡습니다.\n\n' +
        stale.join('\n')
    ).toEqual([])
  })
})

/**
 * `clauday-blue` 는 **이름이 거짓말을 하는 토큰**이다.
 *
 * v2.0 에서 다크 크롬을 무채색화하면서 `--accent-blue` 가 회색(#76767C)이 됐고,
 * `clauday-blue` Tailwind 유틸이 그걸 가리킨다. 이름만 보고 "파랑"인 줄 알고 쓰면
 * 다크에서 색이 조용히 사라진다 — v2.0.4 이전에 캘린더의 오늘 날짜, 커뮤니티 아이콘,
 * 저장·생성 버튼 85곳이 이 함정에 걸려 회색 덩어리로 나왔다.
 *
 * 대신 쓸 것:
 * - 도메인 식별색 → `brand-claude` / `brand-dooray` / `brand-terminal`
 * - 상태·정보색 → `c-blue-fg` / `c-blue-solid`
 * - 주 버튼 → `ds-btn primary` (`--btn-primary-bg`)
 * - 크롬(회색이 의도) → `bg-*` / `text-*` 무채색 토큰을 **이름 그대로** 쓴다
 *
 * `clauday-orange` 는 다크에서도 주황이라 색이 사라지지 않으므로 여기서 막지 않는다.
 * 다만 새 코드에서는 `brand-claude` 를 쓰는 편이 의도가 분명하다.
 */
describe('이름이 오해를 부르는 토큰 가드', () => {
  const MISLEADING_RE = /(?:[a-z-]+:)*(?:text|bg|border|border-[lrtb]|ring|from|to|via|fill|stroke|accent|divide|outline)-clauday-blue(?:-light)?\b|var\(--clauday-blue\)/g

  it('clauday-blue 를 직접 쓰지 않는다 (다크에서 회색이 된다)', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(RENDERER_SRC)) {
      const matches = readFileSync(file, 'utf-8').match(MISLEADING_RE)
      if (matches) offenders.push(`${toKey(file)}: ${[...new Set(matches)].join(', ')}`)
    }
    expect(
      offenders,
      'clauday-blue 는 다크에서 회색으로 중성화되는 크롬 토큰입니다 — 이름과 달리 파랑이 아닙니다.\n' +
        '도메인색은 brand-*, 상태색은 c-blue-*, 주 버튼은 ds-btn primary 를 쓰세요.\n' +
        '회색이 의도라면 bg-* / text-* 무채색 토큰을 이름 그대로 쓰세요.\n\n' +
        offenders.join('\n')
    ).toEqual([])
  })
})
