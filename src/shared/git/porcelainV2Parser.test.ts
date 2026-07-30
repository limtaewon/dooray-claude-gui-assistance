import { describe, it, expect } from 'vitest'
import {
  StatusPorcelainParser,
  parseStatusChar,
  parseSubmoduleStatus,
  parseUnmergedLine
} from './porcelainV2Parser'
import { decodeGitCQuotedPath } from './cquotedPath'

function parseAll(lines: string[], limit = 0): StatusPorcelainParser {
  const parser = new StatusPorcelainParser()
  parser.update(lines.join('\n'), limit)
  parser.finish()
  return parser
}

describe('StatusPorcelainParser — 브랜치 메타', () => {
  it('oid/head/upstream/ab 를 같은 스트림에서 흡수한다 — 추가 git 호출을 없애는 것이 목적', () => {
    const parser = parseAll([
      '# branch.oid abc123',
      '# branch.head feature/x',
      '# branch.upstream origin/feature/x',
      '# branch.ab +3 -2'
    ])
    expect(parser.branch).toEqual({
      head: 'abc123',
      branch: 'refs/heads/feature/x',
      upstreamName: 'origin/feature/x',
      upstreamAheadBehind: { ahead: 3, behind: 2 }
    })
  })

  it('detached HEAD 는 branch 를 undefined 로 둔다 — 빈 문자열이면 렌더러가 구분하지 못한다', () => {
    const parser = parseAll(['# branch.head (detached)'])
    expect(parser.branch.branch).toBeUndefined()
  })
})

describe('StatusPorcelainParser — 변경 엔트리', () => {
  it('XY 2축을 각각 별도 엔트리로 만든다 — 같은 파일이 staged/unstaged 양쪽에 걸릴 수 있다', () => {
    // "1 MM N... 100644 100644 100644 <h> <h> src/a.ts"
    const parser = parseAll(['1 MM N... 100644 100644 100644 aaa bbb src/a.ts'])
    expect(parser.entries).toEqual([
      { path: 'src/a.ts', status: 'modified', area: 'staged' },
      { path: 'src/a.ts', status: 'modified', area: 'unstaged' }
    ])
  })

  it('한쪽만 변경되면 엔트리도 하나다', () => {
    const parser = parseAll(['1 A. N... 000000 100644 100644 000 bbb new.ts'])
    expect(parser.entries).toEqual([{ path: 'new.ts', status: 'added', area: 'staged' }])
  })

  it('rename(type-2)은 TAB 뒤가 원본 경로이고 새 경로의 공백이 보존된다', () => {
    const parser = parseAll([
      '2 R. N... 100644 100644 100644 aaa bbb R100 dir/new name.ts\tdir/old name.ts'
    ])
    expect(parser.entries).toEqual([
      {
        path: 'dir/new name.ts',
        oldPath: 'dir/old name.ts',
        status: 'renamed',
        area: 'staged'
      }
    ])
  })

  it('untracked/ignored 를 각각 분리한다', () => {
    const parser = parseAll(['? junk.log', '! node_modules/'])
    expect(parser.entries).toEqual([{ path: 'junk.log', status: 'untracked', area: 'untracked' }])
    expect(parser.ignoredPaths).toEqual(['node_modules/'])
  })

  it('한글 경로는 core.quotePath=false 로 raw 로 오지만 C-quote 도 되돌린다', () => {
    const parser = parseAll(['? 한글 파일.txt'])
    expect(parser.entries[0].path).toBe('한글 파일.txt')
    // quotePath 가 켜진 환경(numstat 등)의 8진 escape 도 복원돼야 한다
    expect(decodeGitCQuotedPath('"\\355\\225\\234\\352\\270\\200.txt"')).toBe('한글.txt')
  })

  it('충돌(u) 레코드는 파싱을 미루고 raw 라인만 모은다', () => {
    const line = 'u UU N... 100644 100644 100644 100644 a b c src/conflict.ts'
    const parser = parseAll([line])
    expect(parser.entries).toHaveLength(0)
    expect(parser.unmergedLines).toEqual([line])
    // 한도 계산에는 포함돼야 충돌 다발 머지가 상한을 우회하지 못한다
    expect(parser.statusLength).toBe(1)
  })
})

describe('StatusPorcelainParser — 증분/한도', () => {
  it('청크 경계에 걸친 줄을 이어붙인다', () => {
    const parser = new StatusPorcelainParser()
    parser.update('? part', 0)
    parser.update('ial.txt\n', 0)
    parser.finish()
    expect(parser.entries[0].path).toBe('partial.txt')
  })

  it('개행 없이 끝난 마지막 줄도 finish 에서 flush 한다', () => {
    const parser = new StatusPorcelainParser()
    parser.update('? tail.txt', 0)
    expect(parser.entries).toHaveLength(0)
    parser.finish()
    expect(parser.entries).toHaveLength(1)
  })

  it('CRLF 출력을 그대로 파싱한다', () => {
    const parser = new StatusPorcelainParser()
    parser.update('? a.txt\r\n? b.txt\r\n', 0)
    parser.finish()
    expect(parser.entries.map((e) => e.path)).toEqual(['a.txt', 'b.txt'])
  })

  it('한도를 넘으면 true 를 돌려 호출자가 git 을 끊게 한다', () => {
    const parser = new StatusPorcelainParser()
    const stop = parser.update('? a\n? b\n? c\n', 2)
    expect(stop).toBe(true)
  })

  it('limit 0 은 무제한이다', () => {
    const parser = new StatusPorcelainParser()
    expect(parser.update('? a\n? b\n? c\n', 0)).toBe(false)
  })
})

describe('parseStatusChar / parseSubmoduleStatus / parseUnmergedLine', () => {
  it('상태 문자를 매핑하고 모르는 문자는 modified 로 떨어뜨린다', () => {
    expect(parseStatusChar('A')).toBe('added')
    expect(parseStatusChar('D')).toBe('deleted')
    expect(parseStatusChar('R')).toBe('renamed')
    expect(parseStatusChar('C')).toBe('copied')
    expect(parseStatusChar('X')).toBe('modified')
  })

  it('서브모듈 필드가 S 로 시작할 때만 상태를 만든다', () => {
    expect(parseSubmoduleStatus('N...')).toBeUndefined()
    expect(parseSubmoduleStatus('SCMU')).toEqual({
      commitChanged: true,
      trackedChanges: true,
      untrackedChanges: true
    })
    expect(parseSubmoduleStatus('S...', 'M')?.commitChanged).toBe(true)
  })

  it('u 레코드의 XY 를 충돌 종류로 해석한다', () => {
    const entry = parseUnmergedLine('u DU N... 100644 100644 100644 100644 a b c gone.ts')
    expect(entry).toEqual({
      path: 'gone.ts',
      status: 'modified',
      area: 'unstaged',
      conflictKind: 'deleted_by_us'
    })
  })

  it('서브모듈 충돌(mode 160000)은 제외한다', () => {
    expect(
      parseUnmergedLine('u UU N... 160000 160000 160000 160000 a b c vendor/sub')
    ).toBeNull()
  })
})
