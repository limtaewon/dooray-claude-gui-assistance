import { describe, it, expect } from 'vitest'
import { parsePathLineColumn } from './lineColumn'

describe('parsePathLineColumn', () => {
  it('경로만 있으면 line/column 이 null', () => {
    expect(parsePathLineColumn('src/foo.ts')).toEqual({ pathText: 'src/foo.ts', line: null, column: null })
  })

  it('line:col 접미를 분리한다', () => {
    expect(parsePathLineColumn('src/foo.ts:120:8')).toEqual({ pathText: 'src/foo.ts', line: 120, column: 8 })
  })

  it('line 만 있어도 분리한다', () => {
    expect(parsePathLineColumn('src/foo.ts:120')).toEqual({ pathText: 'src/foo.ts', line: 120, column: null })
  })

  it('line < 1 은 거부한다 (:0)', () => {
    expect(parsePathLineColumn('src/foo.ts:0')).toBeNull()
  })

  it('col < 1 은 거부한다 (:1:0)', () => {
    expect(parsePathLineColumn('src/foo.ts:1:0')).toBeNull()
  })

  it('음수 line 은 애초에 \\d+ 에 안 걸려 통째로 pathText 가 된다 (:-1)', () => {
    // `-1` 은 `\d+` 로 매치되지 않으므로 콜론까지 pathText 에 포함된다 — 별도 링크 후보로 취급되지 않는다.
    expect(parsePathLineColumn('src/foo.ts:-1')).toEqual({ pathText: 'src/foo.ts:-1', line: null, column: null })
  })

  it('bare root(/, ~/, C:/) 는 거부한다', () => {
    expect(parsePathLineColumn('/')).toBeNull()
    expect(parsePathLineColumn('~/')).toBeNull()
    expect(parsePathLineColumn('C:/')).toBeNull()
    expect(parsePathLineColumn('C:\\')).toBeNull()
  })

  it('상대 루트(./  ../)도 거부한다', () => {
    expect(parsePathLineColumn('./')).toBeNull()
    expect(parsePathLineColumn('../')).toBeNull()
  })

  it('실제 세그먼트가 있는 디렉터리는 trailing separator 를 유지한다', () => {
    expect(parsePathLineColumn('/Users/x/Downloads/')).toEqual({
      pathText: '/Users/x/Downloads/',
      line: null,
      column: null
    })
  })

  it('빈 문자열은 거부한다', () => {
    expect(parsePathLineColumn('')).toBeNull()
  })
})
