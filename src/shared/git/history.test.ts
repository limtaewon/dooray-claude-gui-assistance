import { describe, it, expect, vi } from 'vitest'
import { loadGitHistory } from './history'
import type { GitHistoryExecutor } from './historyTypes'

const HEAD_OID = 'a'.repeat(40)
const UPSTREAM_OID = 'b'.repeat(40)

function logRecord(hash: string, parents = ''): string {
  return [hash, '임태원', 't@e.com', '1700000000', '1700000000', parents, '', 'subject'].join('\n')
}

/** args 패턴별 stdout 을 돌려주는 executor. 호출 인자를 그대로 기록한다. */
function makeGit(
  routes: Array<[RegExp | ((args: string[]) => boolean), string]>
): { git: GitHistoryExecutor; calls: string[][] } {
  const calls: string[][] = []
  const git: GitHistoryExecutor = async (args) => {
    calls.push(args)
    for (const [matcher, stdout] of routes) {
      const hit =
        typeof matcher === 'function' ? matcher(args) : matcher.test(args.join(' '))
      if (hit) return { stdout }
    }
    throw new Error(`unexpected: ${args.join(' ')}`)
  }
  return { git, calls }
}

describe('loadGitHistory', () => {
  it('HEAD 를 못 풀면 빈 결과를 준다 (커밋이 하나도 없는 저장소)', async () => {
    const git = vi.fn().mockRejectedValue(new Error('fatal: bad revision'))
    const result = await loadGitHistory(git, '/repo')
    expect(result).toEqual({ items: [], hasMore: false, limit: 50, skip: 0 })
  })

  it('현재 브랜치·upstream·merge-base 를 해석하고 커밋을 파싱한다', async () => {
    const { git } = makeGit([
      [(a) => a[0] === 'rev-parse' && a.includes('HEAD^{commit}'), HEAD_OID],
      [(a) => a[0] === 'symbolic-ref', 'feature/x'],
      [(a) => a[0] === 'for-each-ref', `refs/remotes/origin/feature/x\0origin/feature/x`],
      [(a) => a[0] === 'rev-parse' && a.includes('refs/remotes/origin/feature/x^{commit}'), UPSTREAM_OID],
      [(a) => a[0] === 'merge-base', HEAD_OID],
      [(a) => a[0] === 'log', logRecord(HEAD_OID)]
    ])

    const result = await loadGitHistory(git, '/repo')

    expect(result.currentRef).toEqual({
      id: 'refs/heads/feature/x',
      name: 'feature/x',
      revision: HEAD_OID,
      category: 'branches'
    })
    expect(result.remoteRef?.name).toBe('origin/feature/x')
    expect(result.mergeBase).toBe(HEAD_OID)
    expect(result.items).toHaveLength(1)
  })

  it('detached HEAD 면 currentRef 가 commits 카테고리가 된다', async () => {
    const { git } = makeGit([
      [(a) => a[0] === 'rev-parse', HEAD_OID],
      [(a) => a[0] === 'symbolic-ref', ''],
      [(a) => a[0] === 'log', logRecord(HEAD_OID)]
    ])
    const result = await loadGitHistory(git, '/repo')
    expect(result.currentRef?.category).toBe('commits')
    expect(result.remoteRef).toBeUndefined()
  })
})

describe('loadGitHistory — 조회 범위/페이지네이션 (Orca 대비 Clauday 확장)', () => {
  const base: Array<[(args: string[]) => boolean, string]> = [
    [(a) => a[0] === 'rev-parse', HEAD_OID],
    [(a) => a[0] === 'symbolic-ref', ''],
    [(a) => a[0] === 'log', logRecord(HEAD_OID)]
  ]

  it('기본은 HEAD 만 조회한다', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo')
    const logArgs = calls.find((a) => a[0] === 'log')!
    expect(logArgs).toContain(HEAD_OID)
    expect(logArgs).not.toContain('--all')
  })

  it('allBranches 면 브랜치·원격·태그를 조회한다', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', { allBranches: true })
    const logArgs = calls.find((a) => a[0] === 'log')!
    expect(logArgs).toEqual(expect.arrayContaining(['--branches', '--remotes', '--tags']))
    expect(logArgs).not.toContain(HEAD_OID)
  })

  it('--all 을 쓰지 않는다 — refs/stash 가 딸려와 스태시와 그 내부 커밋이 히스토리에 섞인다', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', { allBranches: true })
    expect(calls.find((a) => a[0] === 'log')).not.toContain('--all')
  })

  it('skip 은 --skip 으로 넘어간다 — 커서(oid)가 아니라 offset 이어야 전 브랜치 토폴로지가 유지된다', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', { skip: 50, allBranches: true })
    expect(calls.find((a) => a[0] === 'log')).toContain('--skip=50')
  })

  it('skip 0 이면 --skip 을 넣지 않는다', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', { skip: 0 })
    expect(calls.find((a) => a[0] === 'log')!.some((a) => a.startsWith('--skip'))).toBe(false)
  })

  it('limit+1 을 받아 hasMore 를 판정하고 초과분은 잘라낸다', async () => {
    const records = [logRecord('1'.repeat(40)), logRecord('2'.repeat(40)), logRecord('3'.repeat(40))]
    const { git, calls } = makeGit([
      [(a) => a[0] === 'rev-parse', HEAD_OID],
      [(a) => a[0] === 'symbolic-ref', ''],
      [(a) => a[0] === 'log', records.join('\0')]
    ])
    const result = await loadGitHistory(git, '/repo', { limit: 2 })
    expect(calls.find((a) => a[0] === 'log')).toContain('-n3')
    expect(result.items).toHaveLength(2)
    expect(result.hasMore).toBe(true)
  })

  it('limit 는 1..200 으로 클램프된다', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', { limit: 9999 })
    expect(calls.find((a) => a[0] === 'log')).toContain('-n201')
  })

  it('로그 인자 끝에 `--` 를 붙여 뒤 인자가 경로로 해석되지 않게 한다', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo')
    expect(calls.find((a) => a[0] === 'log')!.at(-1)).toBe('--')
  })
})

describe('loadGitHistory — 커밋 필터', () => {
  const base: Array<[(args: string[]) => boolean, string]> = [
    [(a) => a[0] === 'rev-parse', HEAD_OID],
    [(a) => a[0] === 'symbolic-ref', ''],
    [(a) => a[0] === 'log', logRecord(HEAD_OID)]
  ]

  it('필터가 없으면 검색 인자를 넣지 않는다', async () => {
    const { git, calls } = makeGit(base)
    const result = await loadGitHistory(git, '/repo')
    const logArgs = calls.find((a) => a[0] === 'log')!
    expect(logArgs.some((a) => a.startsWith('--grep'))).toBe(false)
    expect(result.filtered).toBeUndefined()
  })

  it('메시지 검색은 --grep 과 리터럴/대소문자무시를 함께 건다', async () => {
    const { git, calls } = makeGit(base)
    const result = await loadGitHistory(git, '/repo', { filter: { text: 'feat(git):' } })
    const logArgs = calls.find((a) => a[0] === 'log')!
    // 정규식으로 해석되면 `(` 때문에 아무것도 안 걸린다 — 리터럴이어야 한다
    expect(logArgs).toEqual(
      expect.arrayContaining(['--grep=feat(git):', '--fixed-strings', '--regexp-ignore-case'])
    )
    expect(result.filtered).toBe(true)
  })

  it('작성자 검색은 --author', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', { filter: { author: '임태원' } })
    expect(calls.find((a) => a[0] === 'log')).toContain('--author=임태원')
  })

  it('내용 검색은 pickaxe(-S) — 그 문자열이 추가·삭제된 커밋만', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', { filter: { content: 'GitScmService' } })
    expect(calls.find((a) => a[0] === 'log')).toContain('-SGitScmService')
  })

  it('경로 필터는 `--` 뒤에만 온다 — 리비전으로 오해되지 않게', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', { filter: { path: 'src/main' } })
    const logArgs = calls.find((a) => a[0] === 'log')!
    expect(logArgs.at(-1)).toBe('src/main')
    expect(logArgs.at(-2)).toBe('--')
  })

  it('여러 필터를 함께 건다', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', {
      filter: { text: 'fix', author: 'me', content: 'foo', path: 'src' }
    })
    const logArgs = calls.find((a) => a[0] === 'log')!
    expect(logArgs).toEqual(
      expect.arrayContaining(['--grep=fix', '--author=me', '-Sfoo', '--', 'src'])
    )
  })

  it('공백뿐인 값은 필터로 치지 않는다', async () => {
    const { git, calls } = makeGit(base)
    const result = await loadGitHistory(git, '/repo', { filter: { text: '   ' } })
    expect(calls.find((a) => a[0] === 'log')!.some((a) => a.startsWith('--grep'))).toBe(false)
    expect(result.filtered).toBeUndefined()
  })

  it('필터 값은 한 토큰(`--opt=value`)이라 옵션 주입이 되지 않는다', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', { filter: { text: '--upload-pack=evil' } })
    const logArgs = calls.find((a) => a[0] === 'log')!
    expect(logArgs).toContain('--grep=--upload-pack=evil')
    expect(logArgs).not.toContain('--upload-pack=evil')
  })
})

describe('loadGitHistory — 필터 조합 (IntelliJ 식 독립 조건)', () => {
  const base: Array<[(args: string[]) => boolean, string]> = [
    [(a) => a[0] === 'rev-parse', HEAD_OID],
    [(a) => a[0] === 'symbolic-ref', ''],
    [(a) => a[0] === 'log', logRecord(HEAD_OID)]
  ]

  it('기간 필터는 --since / --until', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', { filter: { since: '2026-07-01', until: '2026-07-31' } })
    const logArgs = calls.find((a) => a[0] === 'log')!
    expect(logArgs).toEqual(expect.arrayContaining(['--since=2026-07-01', '--until=2026-07-31']))
  })

  it('정규식 토글을 켜면 --extended-regexp, 끄면 --fixed-strings', async () => {
    const on = makeGit(base)
    await loadGitHistory(on.git, '/repo', { filter: { text: 'fix.*', regex: true } })
    expect(on.calls.find((a) => a[0] === 'log')).toContain('--extended-regexp')

    const off = makeGit(base)
    await loadGitHistory(off.git, '/repo', { filter: { text: 'fix.*' } })
    expect(off.calls.find((a) => a[0] === 'log')).toContain('--fixed-strings')
  })

  it('대소문자 구분을 켜면 --regexp-ignore-case 를 빼고, 기본은 무시한다', async () => {
    const sensitive = makeGit(base)
    await loadGitHistory(sensitive.git, '/repo', { filter: { text: 'Fix', caseSensitive: true } })
    expect(sensitive.calls.find((a) => a[0] === 'log')).not.toContain('--regexp-ignore-case')

    const insensitive = makeGit(base)
    await loadGitHistory(insensitive.git, '/repo', { filter: { text: 'Fix' } })
    expect(insensitive.calls.find((a) => a[0] === 'log')).toContain('--regexp-ignore-case')
  })

  it('특정 브랜치 필터는 전 브랜치 설정보다 우선한다', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', { allBranches: true, filter: { branch: 'develop' } })
    const logArgs = calls.find((a) => a[0] === 'log')!
    expect(logArgs).toContain('develop')
    expect(logArgs).not.toContain('--branches')
  })

  it('브랜치 필터도 leading dash 는 거부한다', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', { filter: { branch: '--exec=evil' } })
    expect(calls.find((a) => a[0] === 'log')).not.toContain('--exec=evil')
  })

  it('조건들이 서로를 밀어내지 않고 함께 걸린다', async () => {
    const { git, calls } = makeGit(base)
    await loadGitHistory(git, '/repo', {
      filter: { text: 'fix', author: 'me', path: 'src', content: 'foo', since: '어제' }
    })
    const logArgs = calls.find((a) => a[0] === 'log')!
    expect(logArgs).toEqual(
      expect.arrayContaining(['--grep=fix', '--author=me', '-Sfoo', '--since=어제', '--', 'src'])
    )
  })
})

describe('loadGitHistory — 텍스트 또는 해시', () => {
  const HASH = 'abc1234'

  it('7자 이상 hex 가 실제 커밋이면 그 커밋 하나만 보여준다', async () => {
    const { git, calls } = makeGit([
      [(a) => a[0] === 'rev-parse' && a.includes('HEAD^{commit}'), HEAD_OID],
      [(a) => a[0] === 'symbolic-ref', ''],
      [(a) => a[0] === 'rev-parse' && a.includes(`${HASH}^{commit}`), UPSTREAM_OID],
      [(a) => a[0] === 'log', logRecord(UPSTREAM_OID)]
    ])

    const result = await loadGitHistory(git, '/repo', { filter: { text: HASH } })

    const logArgs = calls.find((a) => a[0] === 'log')!
    expect(logArgs).toContain('-n1')
    expect(logArgs).toContain(UPSTREAM_OID)
    // 해시로 특정했으면 메시지 검색은 걸지 않는다
    expect(logArgs.some((a) => a.startsWith('--grep'))).toBe(false)
    expect(result.hasMore).toBe(false)
  })

  it('hex 라도 그런 커밋이 없으면 평범한 메시지 검색으로 떨어진다', async () => {
    const { git, calls } = makeGit([
      [(a) => a[0] === 'rev-parse' && a.includes('HEAD^{commit}'), HEAD_OID],
      [(a) => a[0] === 'symbolic-ref', ''],
      [(a) => a[0] === 'log', logRecord(HEAD_OID)]
    ])
    await loadGitHistory(git, '/repo', { filter: { text: 'deadbeef' } })
    expect(calls.find((a) => a[0] === 'log')).toContain('--grep=deadbeef')
  })

  it('6자 이하 hex 는 해시로 보지 않는다 — 평범한 단어일 수 있다', async () => {
    const { git, calls } = makeGit([
      [(a) => a[0] === 'rev-parse', HEAD_OID],
      [(a) => a[0] === 'symbolic-ref', ''],
      [(a) => a[0] === 'log', logRecord(HEAD_OID)]
    ])
    await loadGitHistory(git, '/repo', { filter: { text: 'added' } })
    expect(calls.find((a) => a[0] === 'log')).toContain('--grep=added')
  })
})

describe('loadGitHistory — ref 검증 (Orca 방식: 정규식 대신 --end-of-options)', () => {
  it('revspec(`HEAD~1`)을 그대로 baseRef 로 넘긴다 — isSafeGitRef 로 막던 것이 여기서 풀린다', async () => {
    const { git, calls } = makeGit([
      [(a) => a[0] === 'rev-parse' && a.includes('HEAD^{commit}'), HEAD_OID],
      [(a) => a[0] === 'symbolic-ref', ''],
      [(a) => a[0] === 'rev-parse' && a.includes('HEAD~1^{commit}'), UPSTREAM_OID],
      [(a) => a[0] === 'rev-parse' && a.includes('--symbolic-full-name'), '--end-of-options\nHEAD~1'],
      [(a) => a[0] === 'log', logRecord(HEAD_OID)]
    ])
    const result = await loadGitHistory(git, '/repo', { baseRef: 'HEAD~1' })
    expect(result.baseRef?.revision).toBe(UPSTREAM_OID)
    // 모든 rev-parse 호출이 --end-of-options 로 옵션 주입을 막아야 한다
    for (const call of calls.filter((a) => a[0] === 'rev-parse')) {
      expect(call).toContain('--end-of-options')
    }
  })

  it('--symbolic-full-name 이 되돌려주는 마커 줄을 건너뛴다 — 안 그러면 모든 ref 가 commits 로 떨어진다', async () => {
    const { git } = makeGit([
      [(a) => a[0] === 'rev-parse' && a.includes('HEAD^{commit}'), HEAD_OID],
      [(a) => a[0] === 'symbolic-ref', ''],
      [(a) => a[0] === 'rev-parse' && a.includes('develop^{commit}'), UPSTREAM_OID],
      [
        (a) => a[0] === 'rev-parse' && a.includes('--symbolic-full-name'),
        '--end-of-options\nrefs/heads/develop'
      ],
      [(a) => a[0] === 'log', logRecord(HEAD_OID)]
    ])
    const result = await loadGitHistory(git, '/repo', { baseRef: 'develop' })
    expect(result.baseRef?.category).toBe('branches')
    expect(result.baseRef?.name).toBe('develop')
  })

  it('leading dash 로 시작하는 ref 는 거부한다 (옵션 주입 방지)', async () => {
    const { git, calls } = makeGit([
      [(a) => a[0] === 'rev-parse', HEAD_OID],
      [(a) => a[0] === 'symbolic-ref', ''],
      [(a) => a[0] === 'log', logRecord(HEAD_OID)]
    ])
    const result = await loadGitHistory(git, '/repo', { baseRef: '--upload-pack=evil' })
    expect(result.baseRef).toBeUndefined()
    expect(calls.some((a) => a.includes('--upload-pack=evil'))).toBe(false)
  })

  it('baseRef 가 현재/upstream 과 같으면 별도 배지를 만들지 않는다', async () => {
    const { git } = makeGit([
      [(a) => a[0] === 'rev-parse' && a.includes('HEAD^{commit}'), HEAD_OID],
      [(a) => a[0] === 'symbolic-ref', 'main'],
      [(a) => a[0] === 'for-each-ref', ''],
      [(a) => a[0] === 'rev-parse' && a.includes('main^{commit}'), HEAD_OID],
      [(a) => a[0] === 'rev-parse' && a.includes('--symbolic-full-name'), 'refs/heads/main'],
      [(a) => a[0] === 'log', logRecord(HEAD_OID)]
    ])
    const result = await loadGitHistory(git, '/repo', { baseRef: 'main' })
    expect(result.baseRef).toBeUndefined()
  })
})
