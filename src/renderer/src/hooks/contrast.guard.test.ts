/**
 * 다크 테마 토큰의 대비를 실제 값으로 계산해 검증하는 가드.
 *
 * 왜 필요한가: "표면 간 대비 최소화"는 옳은 방향이지만 값이 지나치면 최소화가 아니라 소실이다.
 * v2.0.3 에서 --bg-base 와 --bg-surface 가 1.09:1, hover 와 raised 가 완전히 같은 값이었고,
 * --text-tertiary 는 3.4:1 로 AA 미달인 채 9~10px 캡션 전반에 걸려 있었다.
 *
 * 수치는 눈으로 못 잡는다 — 토큰을 만질 때마다 여기서 잡는다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const INDEX_CSS = readFileSync(join(__dirname, '..', 'index.css'), 'utf-8')

/** [data-theme='dark'] 블록 안의 토큰만 읽는다 */
function darkTokens(): Record<string, string> {
  const start = INDEX_CSS.indexOf("[data-theme='dark'] {")
  expect(start, "index.css 에서 [data-theme='dark'] 블록을 찾지 못했습니다").toBeGreaterThan(-1)
  const block = INDEX_CSS.substring(start, INDEX_CSS.indexOf('\n}', start))
  const tokens: Record<string, string> = {}
  for (const [, name, value] of block.matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) {
    tokens[name] = value
  }
  return tokens
}

/** #RRGGBB → WCAG 상대 휘도 */
export function relativeLuminance(hex: string): number {
  const channel = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const r = channel(parseInt(hex.substring(1, 3), 16))
  const g = channel(parseInt(hex.substring(3, 5), 16))
  const b = channel(parseInt(hex.substring(5, 7), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** 두 색의 WCAG 대비비 (1~21) */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

describe('다크 토큰 대비 가드', () => {
  const tokens = darkTokens()
  const round = (n: number): number => Math.round(n * 100) / 100

  it('표면이 캔버스보다 밝다', () => {
    // 면 대비는 어차피 크게 못 낸다(여기서도 1.1 남짓) — 그래서 위계는 아래 테두리 검사가 담당한다.
    // 여기서는 방향만 지킨다: 크롬은 캔버스 위에 떠 있어야지 파묻히면 안 된다.
    expect(relativeLuminance(tokens['--bg-surface'])).toBeGreaterThan(relativeLuminance(tokens['--bg-base']))
    const ratio = contrastRatio(tokens['--bg-surface'], tokens['--bg-base'])
    expect(round(ratio), `--bg-surface 가 --bg-base 위에서 ${round(ratio)}:1`).toBeGreaterThanOrEqual(1.1)
  })

  it('테두리가 표면 위에서 보인다', () => {
    const borderOverSurface = contrastRatio(tokens['--bg-border'], tokens['--bg-surface'])
    expect(
      round(borderOverSurface),
      `--bg-border 가 --bg-surface 위에서 ${round(borderOverSurface)}:1 — 카드가 카드로 안 읽힙니다`
    ).toBeGreaterThanOrEqual(1.4)
  })

  it('hover · raised · active 가 서로 다른 값이다', () => {
    const hover = tokens['--bg-surface-hover']
    const raised = tokens['--bg-surface-raised']
    const active = tokens['--bg-active']
    expect(hover, 'hover 와 raised 가 같은 값이면 부상과 커서 위치를 구분할 수 없습니다').not.toBe(raised)
    expect(hover, 'hover 와 active 가 같은 값이면 커서 위치와 선택 확정을 구분할 수 없습니다').not.toBe(active)
    expect(raised).not.toBe(active)
  })

  it('부상 표면은 밝은 테두리를 함께 갖는다', () => {
    // 어두운 면끼리는 밝기만으로 못 띄운다 — border-light 가 그 몫을 한다
    const lightOverRaised = contrastRatio(tokens['--bg-border-light'], tokens['--bg-surface-raised'])
    expect(round(lightOverRaised)).toBeGreaterThanOrEqual(1.3)
  })

  it('본문 텍스트 3단이 표면 위에서 AA 를 넘는다', () => {
    const surface = tokens['--bg-surface']
    for (const name of ['--text-primary', '--text-secondary', '--text-tertiary']) {
      const ratio = contrastRatio(tokens[name], surface)
      expect(round(ratio), `${name} 가 표면 위에서 ${round(ratio)}:1 (AA 는 4.5:1)`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('포커스 링이 비텍스트 대비 3:1 을 넘는다', () => {
    const ringMatch = INDEX_CSS.match(/\[data-theme='dark'\][\s\S]*?--ring-focus-color:\s*(#[0-9A-Fa-f]{6})/)
    expect(ringMatch, '다크 --ring-focus-color 가 불투명 색이 아닙니다 — 반투명 링은 1.6:1 까지 떨어집니다').toBeTruthy()
    const ratio = contrastRatio(ringMatch![1], tokens['--bg-surface'])
    expect(round(ratio), `포커스 링이 표면 위에서 ${round(ratio)}:1`).toBeGreaterThanOrEqual(3)
  })

  it('포커스 링이 표면색 오프셋을 낀 2중 링이다', () => {
    // 링이 요소에 딱 붙으면 밝은 버튼 위에서 묻힌다
    const focus = INDEX_CSS.match(/\[data-theme='dark'\][\s\S]*?--ring-focus:\s*([^;]+);/)
    expect(focus![1]).toContain('var(--bg-surface)')
    expect(focus![1]).toContain('var(--ring-focus-color)')
  })
})
