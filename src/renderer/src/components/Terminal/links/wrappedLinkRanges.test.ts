import { describe, it, expect } from 'vitest'
import { createFakeBuffer } from '../../../../../../test/helpers/fakeXtermBuffer'
import {
  buildWrappedLogicalLine,
  buildHardWrappedPathLogicalLineCandidates,
  buildCandidateLogicalLines,
  dedupeLogicalLines,
  rangeForLogicalLineSpan,
  translateLineWithColumns
} from './wrappedLinkRanges'

describe('buildWrappedLogicalLine (soft wrap)', () => {
  it('isWrapped 로 이어진 행을 하나의 논리 라인으로 합친다', () => {
    const buffer = createFakeBuffer([
      { text: 'echo /Users/dev/very/long/path/that/soft-' },
      { text: 'wraps/into/this/second/row.ts', isWrapped: true }
    ])
    const logical = buildWrappedLogicalLine(buffer, 1)
    expect(logical?.text).toBe('echo /Users/dev/very/long/path/that/soft-wraps/into/this/second/row.ts')
    expect(logical?.rows).toHaveLength(2)
  })

  it('bufferLineNumber 가 wrap 블록 중간이어도 전체 블록을 반환한다', () => {
    const buffer = createFakeBuffer([
      { text: 'first ' },
      { text: 'second ', isWrapped: true },
      { text: 'third', isWrapped: true }
    ])
    const logical = buildWrappedLogicalLine(buffer, 2) // 2행(0-idx 1)에서 조회해도
    expect(logical?.text).toBe('first second third')
  })

  it('상한(200행)을 넘으면 null 을 반환한다', () => {
    const lines = Array.from({ length: 250 }, (_, i) => ({ text: `row${i}`, isWrapped: i > 0 }))
    const buffer = createFakeBuffer(lines)
    expect(buildWrappedLogicalLine(buffer, 250)).toBeNull()
  })

  it('존재하지 않는 라인은 null', () => {
    const buffer = createFakeBuffer([{ text: 'only row' }])
    expect(buildWrappedLogicalLine(buffer, 5)).toBeNull()
  })

  it('fingerprint 는 내용이 같으면 같고 달라지면 달라진다', () => {
    const bufferA = createFakeBuffer([{ text: 'same content' }])
    const bufferB = createFakeBuffer([{ text: 'same content' }])
    const bufferC = createFakeBuffer([{ text: 'different content' }])
    expect(buildWrappedLogicalLine(bufferA, 1)?.fingerprint).toBe(buildWrappedLogicalLine(bufferB, 1)?.fingerprint)
    expect(buildWrappedLogicalLine(bufferA, 1)?.fingerprint).not.toBe(buildWrappedLogicalLine(bufferC, 1)?.fingerprint)
  })
})

describe('buildHardWrappedPathLogicalLineCandidates (hard wrap — claude TUI 물리적 줄바꿈)', () => {
  it('isWrapped 플래그 없이 물리적으로 쪼개진 긴 경로를 재구성한다 — 사용자 보고 케이스 ②', () => {
    const buffer = createFakeBuffer([
      { text: 'Reading /Users/dev/projects/dooray-claude-gui-' }, // isWrapped: false (hard wrap)
      { text: 'assistance/src/main/index.ts' }
    ])
    const candidates = buildHardWrappedPathLogicalLineCandidates(buffer, 2)
    expect(
      candidates.some((c) => c.text.includes('/Users/dev/projects/dooray-claude-gui-assistance/src/main/index.ts'))
    ).toBe(true)
  })

  it('최대 20행까지만 역스캔한다', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ text: i === 0 ? '/very/' : 'aa/' }))
    const buffer = createFakeBuffer(rows)
    const candidates = buildHardWrappedPathLogicalLineCandidates(buffer, 25)
    // 21번째 이전 행(0-based 4행보다 앞)은 후보에 포함되지 않는다 — 후보 rows 수가 20을 넘지 않는다.
    for (const candidate of candidates) expect(candidate.rows.length).toBeLessThanOrEqual(20)
  })

  it('경로 문자가 아닌 줄은 시작점이 되지 않는다', () => {
    const buffer = createFakeBuffer([{ text: 'plain english sentence with no path chars' }])
    const candidates = buildHardWrappedPathLogicalLineCandidates(buffer, 1)
    expect(candidates).toEqual([])
  })

  it('문장 중간에서 경로가 다음 줄로 끊긴 경우(접미부 시작)도 잡는다', () => {
    const buffer = createFakeBuffer([
      { text: 'report saved to /Users/x/re' },
      { text: 'port.pdf for review' }
    ])
    const candidates = buildHardWrappedPathLogicalLineCandidates(buffer, 2)
    expect(candidates.some((c) => c.text.includes('/Users/x/report'))).toBe(true)
  })
})

describe('buildCandidateLogicalLines / dedupeLogicalLines', () => {
  it('hard-wrap 후보와 soft-wrap 논리 라인을 합치고 중복(fingerprint 동일)을 제거한다', () => {
    const buffer = createFakeBuffer([{ text: 'src/main/index.ts changed' }])
    const combined = buildCandidateLogicalLines(buffer, 1)
    expect(combined.length).toBeGreaterThan(0)
    const fingerprints = combined.map((l) => l.fingerprint)
    expect(new Set(fingerprints).size).toBe(fingerprints.length)
  })

  it('dedupeLogicalLines 는 순서를 유지하며 첫 항목만 남긴다', () => {
    const a = { text: 'a', rows: [], fingerprint: 'fp1' }
    const b = { text: 'b', rows: [], fingerprint: 'fp1' }
    const c = { text: 'c', rows: [], fingerprint: 'fp2' }
    expect(dedupeLogicalLines([a, b, c])).toEqual([a, c])
  })
})

describe('CJK wide-char 셀 매핑 (기존 stringIndexToCell 대체 회귀)', () => {
  it('한글이 섞인 줄에서 문자열 인덱스가 셀 좌표로 정확히 매핑된다', () => {
    const buffer = createFakeBuffer([{ text: '한글 폴더/파일.txt 확인' }], ['한', '글', '폴', '더', '파', '일', '확', '인'])
    const logical = buildWrappedLogicalLine(buffer, 1)
    expect(logical).not.toBeNull()
    const startIndex = logical!.text.indexOf('한글 폴더/파일.txt')
    const endIndex = startIndex + '한글 폴더/파일.txt'.length
    const range = rangeForLogicalLineSpan(logical!, startIndex, endIndex)
    // 한(2)글(2) 공백(1) 폴(2)더(2) /(1) 파(2)일(2) .txt(4) = 18셀 — 와이드 문자가 1셀로 잘못
    // 잡히면(예전 버그) 이 값이 문자열 길이(12)와 같아져 버렸을 것이다.
    expect(range).toEqual({ start: { x: 1, y: 1 }, end: { x: 18, y: 1 } })
  })

  it('translateLineWithColumns 는 wide 문자를 2셀로 계산한다(셀 폴백 경로)', () => {
    const buffer = createFakeBuffer([{ text: '한a' }], ['한'])
    const line = buffer.getLine(0)!
    const { text, columns } = translateLineWithColumns(line)
    expect(text).toBe('한a')
    // columns[0] = 0(한의 시작 셀), columns[1] = 2(a 는 한이 2셀을 차지한 뒤 시작), columns[2] = 3(끝)
    expect(columns).toEqual([0, 2, 3])
  })
})
