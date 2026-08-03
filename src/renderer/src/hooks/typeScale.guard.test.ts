/**
 * 조판 하한(11px)을 지키게 하는 가드.
 *
 * 왜 필요한가: 하한이 9px 이면 대부분의 사용자는 하한 상태로 앱을 쓴다. --app-font-scale 로
 * 키울 수 있다는 건 해결이 아니다 — 기본값이 곧 대부분의 실사용 값이기 때문이다.
 * 작은 글씨와 낮은 대비는 곱해져서, 9~10px + tertiary 조합은 사실상 안 읽힌다.
 *
 * v2.0.4 에서 --t-9 / --t-10 을 폐기하고 인라인 calc(9px|10px …) 357곳을 11px 로 올렸다.
 * 이 테스트는 그게 되돌아오는 걸 막는다.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const RENDERER_SRC = join(__dirname, '..')

/** `calc(9px * var(--app-font-scale, 1))` 같은 인라인 폰트 크기 */
const SMALL_INLINE_RE = /calc\((?:9|10)px\s*\*/g
/** 폐기한 토큰이 다시 정의·사용되는 것 */
const DEAD_TOKEN_RE = /--t-(?:9|10)\b/g
/** Tailwind 임의값 폰트 크기 — text-[9px], text-[10px] */
const ARBITRARY_SMALL_RE = /text-\[(?:9|10)px\]/g

function collectFiles(dir: string, match: RegExp, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectFiles(full, match, acc)
      continue
    }
    if (match.test(entry)) acc.push(full)
  }
  return acc
}

function findOffenders(files: string[], patterns: RegExp[]): string[] {
  const offenders: string[] = []
  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    const hits = new Set<string>()
    for (const pattern of patterns) {
      const matches = content.match(new RegExp(pattern.source, 'g'))
      if (matches) matches.forEach((m) => hits.add(m))
    }
    if (hits.size > 0) offenders.push(`${file.replace(RENDERER_SRC, '')}: ${[...hits].join(', ')}`)
  }
  return offenders
}

describe('조판 하한 가드', () => {
  it('tsx 에 9~10px 폰트 크기가 없어야 한다', () => {
    const files = collectFiles(RENDERER_SRC, /\.tsx$/)
    const offenders = findOffenders(files, [SMALL_INLINE_RE, ARBITRARY_SMALL_RE])
    expect(
      offenders,
      '조판 하한은 11px 입니다. 9~10px 은 기본 배율에서 읽히지 않습니다.\n' +
        'calc(11px * var(--app-font-scale, 1)) 또는 var(--t-11) 을 쓰세요.\n\n' +
        offenders.join('\n')
    ).toEqual([])
  })

  it('CSS 에 9~10px 폰트 크기와 폐기 토큰이 없어야 한다', () => {
    const files = collectFiles(RENDERER_SRC, /\.css$/)
    const offenders = findOffenders(files, [SMALL_INLINE_RE, DEAD_TOKEN_RE])
    expect(
      offenders,
      '--t-9 / --t-10 은 v2.0.4 에서 폐기했습니다. 하한은 --t-11 입니다.\n\n' + offenders.join('\n')
    ).toEqual([])
  })
})
