import { describe, it, expect } from 'vitest'
import { detectBareFilenameLinks } from './bareFileLink'
import { detectLocalPathLinks, mergeRanges } from './terminalPathRegex'

function bareLinks(lineText: string): ReturnType<typeof detectBareFilenameLinks> {
  const local = detectLocalPathLinks(lineText)
  const claimed = mergeRanges(local.map(({ startIndex, endIndex }): [number, number] => [startIndex, endIndex]))
  return detectBareFilenameLinks(lineText, claimed)
}

describe('detectBareFilenameLinks', () => {
  it('ls 스타일 출력의 각 토큰을 후보로 낸다', () => {
    const links = bareLinks('CLAUDE.md package.json pnpm-lock.yaml README.md')
    expect(links.map((l) => l.displayText)).toEqual(['CLAUDE.md', 'package.json', 'pnpm-lock.yaml', 'README.md'])
  })

  it('무확장자 프로젝트 파일(Makefile 등)을 인식한다 — 확장자 화이트리스트 폐기, G15', () => {
    const links = bareLinks('Makefile Dockerfile LICENSE Gemfile')
    expect(links.map((l) => l.displayText).sort()).toEqual(['Dockerfile', 'Gemfile', 'LICENSE', 'Makefile'])
  })

  it('숫자만/플래그/점만 있는 토큰은 후보에서 제외한다', () => {
    expect(bareLinks('42 100 .. . -v --verbose')).toEqual([])
  })

  it('trailing 구두점을 잘라낸다', () => {
    const links = bareLinks('found package.json, pnpm-lock.yaml.')
    expect(links.map((l) => l.displayText)).toEqual(['package.json', 'pnpm-lock.yaml'])
  })

  it('구분자 경로에 이미 포함된 토큰은 중복 링크하지 않는다', () => {
    const links = bareLinks('edited ./src/file.ts')
    expect(links).toEqual([])
  })

  it('무확장자·화이트리스트에 없는 임의 단어는 링크가 되지 않는다', () => {
    expect(bareLinks('hello world foo bar')).toEqual([])
  })
})
