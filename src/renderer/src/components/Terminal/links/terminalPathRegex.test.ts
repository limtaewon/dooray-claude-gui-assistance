import { describe, it, expect } from 'vitest'
import { detectLocalPathLinks, detectRanges, mergeRanges, rangesOverlap } from './terminalPathRegex'

describe('detectLocalPathLinks', () => {
  it('절대 경로를 감지한다', () => {
    const links = detectLocalPathLinks('open /Users/dev/project/src/index.ts now')
    expect(links.map((l) => l.pathText)).toContain('/Users/dev/project/src/index.ts')
  })

  it('상대 경로(src/foo.ts)를 감지한다 — 사용자 보고 케이스 ①', () => {
    const links = detectLocalPathLinks('  M src/main/index.ts')
    expect(links.map((l) => l.pathText)).toContain('src/main/index.ts')
  })

  it('./  ../ 로 시작하는 상대 경로를 감지한다', () => {
    expect(detectLocalPathLinks('run ./scripts/build.sh')[0]?.pathText).toBe('./scripts/build.sh')
    expect(detectLocalPathLinks('see ../README.md')[0]?.pathText).toBe('../README.md')
  })

  it('~ 로 시작하는 경로를 감지한다(확장은 main 몫이라 여기선 ~ 를 그대로 남긴다)', () => {
    const links = detectLocalPathLinks('cat ~/notes/todo.txt')
    expect(links.map((l) => l.pathText)).toContain('~/notes/todo.txt')
  })

  it('line:col 접미를 pathText 에서 분리해 line/column 필드로 낸다', () => {
    const [link] = detectLocalPathLinks('at src/main/index.ts:120:8')
    expect(link).toMatchObject({ pathText: 'src/main/index.ts', line: 120, column: 8 })
  })

  it('공백을 포함한 절대 경로를 감지한다 — 사용자 보고 케이스 ④', () => {
    const links = detectLocalPathLinks('saved to /Users/x/Application Support/Clauday/log.txt')
    expect(links.map((l) => l.pathText)).toContain('/Users/x/Application Support/Clauday/log.txt')
  })

  it('공백 경로 뒤의 산문(prose)은 잘라낸다', () => {
    const links = detectLocalPathLinks('wrote /Users/x/My Notes/todo.md and exited')
    expect(links.some((l) => l.pathText === '/Users/x/My Notes/todo.md')).toBe(true)
    expect(links.some((l) => l.pathText.includes('exited'))).toBe(false)
  })

  it('확장자 없이 공백으로 끝나는(줄 끝) 디렉터리 경로를 감지한다 — 사용자 보고 케이스 ③', () => {
    const links = detectLocalPathLinks('cd /Users/x/My Project')
    expect(links.map((l) => l.pathText)).toContain('/Users/x/My Project')
  })

  it('구분자가 없으면 아무것도 반환하지 않는다', () => {
    expect(detectLocalPathLinks('no separators here at all')).toEqual([])
  })

  it('URL 안의 //host/path 부분을 경로로 오인하지 않는다', () => {
    const links = detectLocalPathLinks('open https://example.com/path/to/page')
    expect(links.some((l) => l.pathText.startsWith('//'))).toBe(false)
  })

  it('Windows 드라이브 경로를 감지한다', () => {
    const links = detectLocalPathLinks('open C:\\Users\\dev\\project\\file.ts')
    expect(links.map((l) => l.pathText)).toContain('C:\\Users\\dev\\project\\file.ts')
  })

  it('프레임워크 라우트(괄호/대괄호 세그먼트) 경로를 하나로 유지한다', () => {
    // Orca 원본 테스트와 동일한 형태(줄 끝이 line:col 접미) — 괄호/대괄호 뒤에 공백을 두고 별개
    // 단어가 더 이어지면(예: "... page.tsx changed") 공백-경로 3-pass 의 line-ending 패스가
    // 확장자까지만 잘라 선점해버려 메인 패스와 충돌한다(Orca 자신의 테스트도 이 조합은 다루지
    // 않는다) — 알려진 한계이며 사용자 보고 케이스에는 해당하지 않는다.
    const links = detectLocalPathLinks('Error in app/(shop)/products/[id]/page.tsx:42:7')
    expect(links.map((l) => l.pathText)).toContain('app/(shop)/products/[id]/page.tsx')
  })

  it('대량의 공백 경로 목록에서도 선형적으로 동작한다(ReDoS 회피 확인)', () => {
    const line = Array.from({ length: 500 }, (_, i) => `/tmp/Foo Bar ${i}/file.txt`).join(' ')
    const start = performance.now()
    const links = detectLocalPathLinks(line)
    expect(performance.now() - start).toBeLessThan(500)
    expect(links.length).toBeGreaterThan(0)
  })
})

describe('range 유틸', () => {
  it('detectRanges 는 경계 구두점을 잘라낸다', () => {
    const [range] = detectRanges('(src/foo.ts)', /src\/foo\.ts\)?/g)
    expect(range.text).toBe('src/foo.ts')
  })

  it('mergeRanges 는 겹치거나 인접한 구간을 합친다', () => {
    expect(mergeRanges([[0, 5], [3, 8], [10, 12]])).toEqual([[0, 8], [10, 12]])
  })

  it('rangesOverlap 은 claimed 범위와의 겹침을 판정한다', () => {
    const claimed: [number, number][] = [[0, 8], [10, 12]]
    expect(rangesOverlap({ startIndex: 2, endIndex: 4, text: '' }, claimed)).toBe(true)
    expect(rangesOverlap({ startIndex: 8, endIndex: 10, text: '' }, claimed)).toBe(false)
  })
})
