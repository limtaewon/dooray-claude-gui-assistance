import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'

/**
 * 글자 크기 스케일(--app-font-scale) 정책 회귀 가드.
 *
 * 모든 font-size 류는 --app-font-scale 에 반응해야 한다 (글자만 커지고 여백은 고정).
 * raw px 폰트가 다시 들어오면 그 텍스트만 스케일을 무시하므로 이 테스트로 차단한다.
 *
 * - tsx className: text-[Npx] (raw) 금지 → text-[calc(Npx*var(--app-font-scale,1))] 만 허용
 * - index.css   : --t-N: Npx; (raw) 금지 → calc(Npx * var(--app-font-scale)) 만 허용
 * - design-system.css: font-size: Npx (raw) 금지 → calc(... var(--app-font-scale)) 만 허용
 */

const RENDERER_SRC = resolve(__dirname, '..')

function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === 'node_modules') continue
      walkTsx(p, out)
    } else if (p.endsWith('.tsx')) {
      out.push(p)
    }
  }
  return out
}

describe('font-scale 정책 가드', () => {
  it('tsx className 에 raw text-[Npx] 가 없어야 한다 (calc+var 로 래핑)', () => {
    const offenders: string[] = []
    for (const file of walkTsx(RENDERER_SRC)) {
      const src = readFileSync(file, 'utf8')
      const matches = src.match(/text-\[\d+(?:\.\d+)?px\]/g)
      if (matches) offenders.push(`${file.replace(RENDERER_SRC, '')}: ${matches.join(', ')}`)
    }
    expect(offenders, `raw px 텍스트 발견:\n${offenders.join('\n')}`).toEqual([])
  })

  it('index.css --t-* 토큰이 calc(*var(--app-font-scale)) 로 정의돼야 한다', () => {
    const css = readFileSync(join(RENDERER_SRC, 'index.css'), 'utf8')
    const rawTokens = css.match(/--t-\d+:[ \t]*\d+px;/g)
    expect(rawTokens, `스케일 미적용 토큰: ${rawTokens?.join(', ')}`).toBeNull()
    // 적어도 하나는 calc+var 형태로 존재
    expect(/--t-\d+:[ \t]*calc\(\d+px \* var\(--app-font-scale/.test(css)).toBe(true)
  })

  it('design-system.css 의 모든 font-size 가 calc(*var(--app-font-scale)) 여야 한다', () => {
    const css = readFileSync(join(RENDERER_SRC, 'design-system.css'), 'utf8')
    const rawFont = css.match(/font-size:\s*\d+px/g)
    expect(rawFont, `스케일 미적용 font-size: ${rawFont?.join(', ')}`).toBeNull()
  })

  it('html root font-size 는 16px 고정 (여백 rem 이 스케일에서 분리)', () => {
    const css = readFileSync(join(RENDERER_SRC, 'index.css'), 'utf8')
    expect(/html\s*\{\s*font-size:\s*16px;\s*\}/.test(css)).toBe(true)
  })
})
