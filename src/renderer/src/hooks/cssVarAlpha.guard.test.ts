/**
 * CSS 변수 색에 불투명도 수정자를 붙이지 못하게 막는 가드.
 *
 * 왜 필요한가: Tailwind 3 은 `var(--x)` 로 정의된 색에 `/10` 을 붙이면 알파를 합성하지 못해
 * **그 유틸리티 규칙을 통째로 생성하지 않는다.** 조용히 무시되는 정도가 아니라 CSS 에 아예
 * 없다 — `bg-clauday-blue/10` 은 배경이 사라지고, `border border-clauday-blue/30` 은
 * `border` 만 남아 브라우저 기본 회색 테두리가 드러난다. hover 변형이면 반응 자체가 없다.
 *
 * 실측(v2.0): 소스 135곳에서 쓰였는데 빌드 CSS 에는 해당 규칙이 0건이었다.
 * 앱 곳곳이 "죽어 보이던" 원인.
 *
 * tint 가 필요하면 미리 정의된 **`-bg`/`-fg` 페어**를 쓴다:
 *   `bg-c-blue-bg text-c-blue-fg`, `bg-brand-dooray-bg text-brand-dooray`
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const RENDERER_SRC = join(__dirname, '..')

/** tailwind.config.js 에서 `var(--…)` 로 정의된 색 계열 — 여기에 `/N` 을 붙이면 드롭된다. */
const CSS_VAR_COLOR_PREFIXES = [
  'clauday-blue',
  'clauday-blue-light',
  'clauday-orange',
  'clauday-orange-light',
  'brand-claude',
  'brand-dooray',
  'brand-terminal',
  'brand-claude-bg',
  'brand-dooray-bg',
  'brand-terminal-bg',
  'link',
  'git-added',
  'git-deleted',
  'git-modified',
  'git-untracked',
  'bg-primary',
  'bg-surface',
  'bg-border',
  'bg-active',
  'bg-hover',
  'text-primary',
  'text-secondary',
  'text-tertiary'
]

const UTILITY_PREFIXES = ['bg', 'text', 'border', 'ring', 'from', 'to', 'via', 'fill', 'stroke', 'divide', 'outline']

/** `hover:bg-clauday-blue/10` 같은 조합을 찾는다. 변형(hover:, dark: …)도 함께 잡는다. */
const OFFENDER_RE = new RegExp(
  `(?:[a-z-]+:)*(?:${UTILITY_PREFIXES.join('|')})-(?:${CSS_VAR_COLOR_PREFIXES.join('|')})\\/\\d+`,
  'g'
)

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc)
      continue
    }
    if (/\.(tsx|ts)$/.test(entry) && !/\.test\.(tsx|ts)$/.test(entry)) acc.push(full)
  }
  return acc
}

describe('CSS 변수 색 불투명도 가드', () => {
  it('CSS 변수 색에 /N 불투명도를 붙인 클래스가 없어야 한다 (Tailwind 가 규칙을 드롭한다)', () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(RENDERER_SRC)) {
      const matches = readFileSync(file, 'utf-8').match(OFFENDER_RE)
      if (matches) {
        offenders.push(`${file.replace(RENDERER_SRC, '')}: ${[...new Set(matches)].join(', ')}`)
      }
    }
    expect(
      offenders,
      `CSS 변수 색에 불투명도 수정자를 붙였습니다 — 이 규칙들은 빌드 CSS 에 생성되지 않아 색이 사라집니다.\n` +
        `tint 가 필요하면 페어 토큰을 쓰세요: bg-c-blue-bg / bg-brand-dooray-bg / bg-bg-active\n\n` +
        offenders.join('\n')
    ).toEqual([])
  })
})
