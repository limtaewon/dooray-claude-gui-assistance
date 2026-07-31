import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const runGit = vi.fn()
const runGitBuffer = vi.fn()
const streamGitStdout = vi.fn()

vi.mock('./scmRunner', async () => {
  const actual = await vi.importActual<typeof import('./scmRunner')>('./scmRunner')
  return {
    ...actual,
    runGit: (...args: unknown[]) => runGit(...args),
    runGitBuffer: (...args: unknown[]) => runGitBuffer(...args),
    streamGitStdout: (...args: unknown[]) => streamGitStdout(...args)
  }
})

const { GitScmService } = await import('./GitScmService')

const HASH_A = 'a'.repeat(40)
const HASH_B = 'b'.repeat(40)

/** args 로 라우팅하는 runGit 스텁. 매칭이 없으면 빈 stdout. */
function routeGit(routes: Array<[(args: string[]) => boolean, string]>): void {
  runGit.mockImplementation(async (args: string[]) => {
    for (const [matcher, stdout] of routes) {
      if (matcher(args)) return { stdout, stderr: '' }
    }
    return { stdout: '', stderr: '' }
  })
}

/** streamGitStdout 스텁 — 주어진 porcelain 출력을 한 번에 먹인다. */
function streamStatus(output: string): void {
  streamGitStdout.mockImplementation(
    async (_args: string[], _cwd: string, onChunk: (c: string) => boolean) => {
      onChunk(output)
      return { stopped: false }
    }
  )
}

let service: InstanceType<typeof GitScmService>
/** 작업 트리 파일을 읽는 경로는 fs 를 실제로 탄다 — 실 디렉터리로 검증한다. */
let repoDir: string

beforeEach(() => {
  vi.clearAllMocks()
  runGit.mockResolvedValue({ stdout: '', stderr: '' })
  streamGitStdout.mockResolvedValue({ stopped: false })
  service = new GitScmService()
  repoDir = mkdtempSync(join(tmpdir(), 'clauday-scm-'))
})

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true })
})

function writeRepoFile(relative: string, content: string | Buffer): void {
  const absolute = join(repoDir, relative)
  mkdirSync(join(absolute, '..'), { recursive: true })
  writeFileSync(absolute, content)
}

describe('status', () => {
  it('porcelain v2 를 스트리밍 파싱하고 ahead/behind 를 같은 스트림에서 얻는다', async () => {
    streamStatus(
      [
        '# branch.oid ' + HASH_A,
        '# branch.head main',
        '# branch.upstream origin/main',
        '# branch.ab +2 -1',
        '1 M. N... 100644 100644 100644 x y src/a.ts',
        '? new.txt',
        ''
      ].join('\n')
    )
    routeGit([[(a) => a[0] === 'rev-parse', '/repo/.git']])

    const result = await service.status('/repo')

    expect(result.branch).toBe('refs/heads/main')
    expect(result.head).toBe(HASH_A)
    expect(result.upstreamStatus).toEqual({
      hasUpstream: true,
      upstreamName: 'origin/main',
      ahead: 2,
      behind: 1
    })
    expect(result.entries.map((e) => e.path)).toEqual(['src/a.ts', 'new.txt'])
    // core.quotePath=false 로 한글 경로가 raw UTF-8 로 오게 한다
    expect(streamGitStdout.mock.calls[0][0]).toContain('core.quotePath=false')
    expect(streamGitStdout.mock.calls[0][0]).toContain('--untracked-files=all')
  })

  it('충돌(u) 레코드를 엔트리로 되살린다', async () => {
    streamStatus('u UU N... 100644 100644 100644 100644 x y z src/conflict.ts\n')
    const result = await service.status('/repo')
    expect(result.entries).toEqual([
      expect.objectContaining({ path: 'src/conflict.ts', conflictKind: 'both_modified' })
    ])
  })

  it('numstat 으로 staged/unstaged 라인 수를 채운다', async () => {
    streamStatus('1 MM N... 100644 100644 100644 x y src/a.ts\n')
    runGit.mockImplementation(async (args: string[]) => {
      if (args.includes('--numstat') && args.includes('--cached')) {
        return { stdout: '10\t2\tsrc/a.ts\u0000', stderr: '' }
      }
      if (args.includes('--numstat')) return { stdout: '3\t1\tsrc/a.ts\u0000', stderr: '' }
      return { stdout: '', stderr: '' }
    })

    const result = await service.status('/repo')

    expect(result.entries.find((e) => e.area === 'staged')).toMatchObject({ added: 10, removed: 2 })
    expect(result.entries.find((e) => e.area === 'unstaged')).toMatchObject({ added: 3, removed: 1 })
  })

  it('바이너리 numstat(`-`)은 라인 수를 비워둔다', async () => {
    streamStatus('1 M. N... 100644 100644 100644 x y logo.png\n')
    runGit.mockImplementation(async (args: string[]) =>
      args.includes('--numstat') && args.includes('--cached')
        ? { stdout: '-\t-\tlogo.png\u0000', stderr: '' }
        : { stdout: '', stderr: '' }
    )
    const result = await service.status('/repo')
    expect(result.entries[0].added).toBeUndefined()
  })

  it('rename numstat 경로(`dir/{old => new}/f`)를 새 경로로 정규화해 조인한다', async () => {
    streamStatus('2 R. N... 100644 100644 100644 x y R100 dir/new/f.ts\tdir/old/f.ts\n')
    runGit.mockImplementation(async (args: string[]) =>
      args.includes('--numstat') && args.includes('--cached')
        ? { stdout: '5\t5\tdir/{old => new}/f.ts\u0000', stderr: '' }
        : { stdout: '', stderr: '' }
    )
    const result = await service.status('/repo')
    expect(result.entries[0]).toMatchObject({ path: 'dir/new/f.ts', added: 5, removed: 5 })
  })

  it('numstat 이 실패해도 status 자체는 성공한다', async () => {
    streamStatus('1 M. N... 100644 100644 100644 x y src/a.ts\n')
    runGit.mockImplementation(async (args: string[]) => {
      if (args.includes('--numstat')) throw new Error('numstat 실패')
      return { stdout: '', stderr: '' }
    })
    await expect(service.status('/repo')).resolves.toMatchObject({ entries: [expect.anything()] })
  })

  it('진행 중 작업이 없으면 conflictOperation 은 none', async () => {
    streamStatus('')
    const result = await service.status('/repo')
    expect(result.conflictOperation).toBe('none')
  })
})

describe('commitDetail', () => {
  it('40자 hex 가 아닌 커밋 id 는 거부한다', async () => {
    await expect(service.commitDetail('/repo', '--evil')).rejects.toThrow('유효하지 않은 커밋 id')
  })

  it('첫 부모와 비교해 변경 파일과 라인 수를 낸다', async () => {
    routeGit([
      [(a) => a[0] === 'rev-list', `${HASH_A} ${HASH_B}`],
      [(a) => a.includes('--name-status'), 'M\u0000src/a.ts\u0000A\u0000src/b.ts\u0000'],
      [(a) => a.includes('--numstat'), '1\t2\tsrc/a.ts\u00009\t0\tsrc/b.ts\u0000']
    ])

    const detail = await service.commitDetail('/repo', HASH_A)

    expect(detail.parentOid).toBe(HASH_B)
    expect(detail.files).toEqual([
      { path: 'src/a.ts', status: 'modified', added: 1, removed: 2 },
      { path: 'src/b.ts', status: 'added', added: 9, removed: 0 }
    ])
  })

  it('rename 은 old/new 두 경로 필드를 소비한다', async () => {
    routeGit([
      [(a) => a[0] === 'rev-list', `${HASH_A} ${HASH_B}`],
      [(a) => a.includes('--name-status'), 'R100\u0000old.ts\u0000new.ts\u0000M\u0000other.ts\u0000']
    ])
    const detail = await service.commitDetail('/repo', HASH_A)
    expect(detail.files).toEqual([
      { path: 'new.ts', oldPath: 'old.ts', status: 'renamed' },
      { path: 'other.ts', status: 'modified' }
    ])
  })

  it('root 커밋은 diff-tree --root 로 처리한다', async () => {
    const calls: string[][] = []
    runGit.mockImplementation(async (args: string[]) => {
      calls.push(args)
      if (args[0] === 'rev-list') return { stdout: HASH_A, stderr: '' }
      return { stdout: 'A\u0000first.ts\u0000', stderr: '' }
    })
    const detail = await service.commitDetail('/repo', HASH_A)
    expect(detail.parentOid).toBeUndefined()
    expect(calls.some((a) => a.includes('diff-tree') && a.includes('--root'))).toBe(true)
  })
})

describe('fileDiff', () => {
  it('staged 는 HEAD vs 인덱스를 읽는다', async () => {
    runGitBuffer.mockResolvedValue(Buffer.from('내용'))
    await service.fileDiff({ repoPath: '/repo', path: 'src/a.ts', source: { kind: 'staged' } })
    expect(runGitBuffer.mock.calls[0][0]).toContain('HEAD:src/a.ts')
    expect(runGitBuffer.mock.calls[1][0]).toContain(':src/a.ts')
  })

  it('unstaged 는 인덱스 vs 작업 파일이라 git blob 을 한 번만 읽는다', async () => {
    runGitBuffer.mockResolvedValue(Buffer.from('인덱스'))
    writeRepoFile('src/a.ts', '작업 트리 내용')

    const result = await service.fileDiff({
      repoPath: repoDir,
      path: 'src/a.ts',
      source: { kind: 'unstaged' }
    })

    expect(runGitBuffer).toHaveBeenCalledTimes(1)
    expect(result.original).toBe('인덱스')
    expect(result.modified).toBe('작업 트리 내용')
  })

  it('작업 파일이 삭제됐으면 오른쪽을 빈 문자열로 둔다', async () => {
    runGitBuffer.mockResolvedValue(Buffer.from('인덱스'))
    const result = await service.fileDiff({
      repoPath: repoDir,
      path: 'gone.ts',
      source: { kind: 'unstaged' }
    })
    expect(result.modified).toBe('')
  })

  it('작업 파일에 NUL 이 있으면 바이너리로 판정한다', async () => {
    runGitBuffer.mockResolvedValue(Buffer.from(''))
    writeRepoFile('logo.png', Buffer.from([0x89, 0x50, 0x00, 0x01]))
    const result = await service.fileDiff({
      repoPath: repoDir,
      path: 'logo.png',
      source: { kind: 'unstaged' }
    })
    expect(result.modifiedBinary).toBe(true)
    expect(result.modified).toBe('')
  })

  it('rename 은 좌측을 원본 경로로 읽는다', async () => {
    runGitBuffer.mockResolvedValue(Buffer.from('x'))
    await service.fileDiff({
      repoPath: '/repo',
      path: 'new.ts',
      oldPath: 'old.ts',
      source: { kind: 'staged' }
    })
    expect(runGitBuffer.mock.calls[0][0]).toContain('HEAD:old.ts')
  })

  it('커밋 diff 는 부모와 비교하고 옵션 주입을 막는다', async () => {
    runGitBuffer.mockResolvedValue(Buffer.from('x'))
    await service.fileDiff({
      repoPath: '/repo',
      path: 'a.ts',
      source: { kind: 'commit', commitOid: HASH_A, parentOid: HASH_B }
    })
    expect(runGitBuffer.mock.calls[0][0]).toEqual(['show', '--end-of-options', `${HASH_B}:a.ts`])
    expect(runGitBuffer.mock.calls[1][0]).toEqual(['show', '--end-of-options', `${HASH_A}:a.ts`])
  })

  it('NUL 바이트가 있으면 바이너리로 판정하고 본문을 비운다', async () => {
    runGitBuffer.mockResolvedValue(Buffer.from([0x89, 0x50, 0x00, 0x01]))
    const result = await service.fileDiff({
      repoPath: '/repo',
      path: 'logo.png',
      source: { kind: 'staged' }
    })
    expect(result.originalBinary).toBe(true)
    expect(result.original).toBe('')
  })

  it('해당 리비전에 파일이 없으면(추가/삭제) 그쪽을 빈 문자열로 둔다', async () => {
    runGitBuffer.mockRejectedValue(new Error('fatal: path does not exist'))
    const result = await service.fileDiff({
      repoPath: '/repo',
      path: 'new.ts',
      source: { kind: 'staged' }
    })
    expect(result.original).toBe('')
    expect(result.originalBinary).toBe(false)
  })

  it('저장소 밖을 가리키는 경로는 거부한다', async () => {
    await expect(
      service.fileDiff({ repoPath: '/repo', path: '../secret', source: { kind: 'staged' } })
    ).rejects.toThrow('저장소 밖')
  })

  it('절대 경로는 거부한다', async () => {
    await expect(
      service.fileDiff({ repoPath: '/repo', path: '/etc/passwd', source: { kind: 'staged' } })
    ).rejects.toThrow('절대 경로')
  })
})

describe('스테이징', () => {
  it('경로를 :(literal) 로 감싼다 — glob 문자가 든 파일명이 누락되지 않게', async () => {
    await service.stage('/repo', ['src/a[1].ts'])
    expect(runGit.mock.calls[0][0]).toEqual(['add', '--', ':(literal)src/a[1].ts'])
  })

  it('unstage 는 restore --staged 를 쓴다', async () => {
    await service.unstage('/repo', ['a.ts'])
    expect(runGit.mock.calls[0][0]).toEqual(['restore', '--staged', '--', ':(literal)a.ts'])
  })

  it('100개씩 끊어 보낸다 — 명령줄 길이 한계(E2BIG) 회피', async () => {
    await service.stage('/repo', Array.from({ length: 250 }, (_, i) => `f${i}.ts`))
    expect(runGit).toHaveBeenCalledTimes(3)
  })

  it('빈 목록이면 git 을 부르지 않는다', async () => {
    await service.stage('/repo', [])
    await service.unstage('/repo', [])
    await service.discard('/repo', [])
    expect(runGit).not.toHaveBeenCalled()
  })

  it('discard 는 추적 파일은 restore, 추적 안 된 파일은 clean 으로 나눠 처리한다', async () => {
    runGit.mockImplementation(async (args: string[]) => {
      if (args[0] === 'ls-files') {
        if (args.some((a) => a.includes('untracked.ts'))) throw new Error('unmatch')
        return { stdout: 'tracked.ts', stderr: '' }
      }
      return { stdout: '', stderr: '' }
    })

    await service.discard('/repo', ['tracked.ts', 'untracked.ts'])

    const commands = runGit.mock.calls.map((c) => c[0] as string[])
    expect(commands).toContainEqual([
      'restore',
      '--worktree',
      '--source=HEAD',
      '--',
      ':(literal)tracked.ts'
    ])
    expect(commands).toContainEqual(['clean', '-ffd', '--', ':(literal)untracked.ts'])
  })
})

describe('commit', () => {
  it('빈 메시지는 git 을 부르지 않고 거절한다', async () => {
    const result = await service.commit({ repoPath: '/repo', message: '   ' })
    expect(result).toEqual({ ok: false, message: '커밋 메시지가 비어 있습니다.' })
    expect(runGit).not.toHaveBeenCalled()
  })

  it('amend 는 --amend 를 붙인다', async () => {
    await service.commit({ repoPath: '/repo', message: '수정', amend: true })
    expect(runGit.mock.calls[0][0]).toEqual(['commit', '--amend', '-m', '수정'])
  })

  it('실패 사유를 stderr 에서 뽑아 돌려준다 (throw 하지 않는다)', async () => {
    const { GitCommandError } = await import('./scmRunner')
    runGit.mockRejectedValue(
      new GitCommandError('hook 실패', { stdout: '', stderr: 'pre-commit hook 실패', exitCode: 1 })
    )
    const result = await service.commit({ repoPath: '/repo', message: 'x' })
    expect(result).toEqual({ ok: false, message: 'pre-commit hook 실패' })
  })

  it('nothing to commit 은 stdout 으로 오므로 stdout 도 본다', async () => {
    const { GitCommandError } = await import('./scmRunner')
    runGit.mockRejectedValue(
      new GitCommandError('실패', { stdout: 'nothing to commit', stderr: '', exitCode: 1 })
    )
    expect((await service.commit({ repoPath: '/repo', message: 'x' })).message).toBe(
      'nothing to commit'
    )
  })
})

describe('원격', () => {
  it('push 는 upstream 설정/강제 옵션을 반영하고 네트워크 데드라인을 준다', async () => {
    await service.push({ repoPath: '/repo', setUpstream: true, forceWithLease: true, branch: 'main' })
    expect(runGit.mock.calls[0][0]).toEqual([
      'push',
      '--force-with-lease',
      '--set-upstream',
      'origin',
      'main'
    ])
    expect(runGit.mock.calls[0][2]).toMatchObject({ timeoutMs: 120_000 })
  })

  it('브랜치를 안 주면 HEAD 를 민다', async () => {
    await service.push({ repoPath: '/repo' })
    expect(runGit.mock.calls[0][0]).toEqual(['push', 'origin', 'HEAD'])
  })

  it('실패는 throw 대신 정규화된 결과로 돌려준다', async () => {
    runGit.mockRejectedValue(new Error('fatal: Authentication failed for https://me:pw@host/a.git'))
    const result = await service.push({ repoPath: '/repo' })
    expect(result.ok).toBe(false)
    expect(result.authFailed).toBe(true)
    expect(result.message).toBe('인증에 실패했습니다. 원격 자격증명을 확인하세요.')
  })

  it('원격 이름에 인젝션 후보가 오면 거부한다', async () => {
    await expect(service.push({ repoPath: '/repo', remote: '--exec=evil' })).rejects.toThrow(
      '유효하지 않은 원격 이름'
    )
  })

  it('pull 은 divergent 거부 시 --no-rebase 로 재시도한다', async () => {
    runGit
      .mockRejectedValueOnce(new Error('fatal: Need to specify how to reconcile divergent branches'))
      .mockResolvedValueOnce({ stdout: '', stderr: '' })

    const result = await service.pull({ repoPath: '/repo' })

    expect(result.ok).toBe(true)
    expect(runGit.mock.calls[1][0]).toEqual(['pull', '--no-rebase'])
  })

  it('fetch 는 --prune 을 붙인다', async () => {
    await service.fetch('/repo')
    expect(runGit.mock.calls[0][0]).toEqual(['fetch', '--prune'])
  })

  it('remote -v 를 fetch/push URL 로 접는다', async () => {
    routeGit([
      [
        (a) => a[0] === 'remote',
        'origin\thttps://host/a.git (fetch)\norigin\thttps://host/a.git (push)\nupstream\thttps://host/b.git (fetch)'
      ]
    ])
    const remotes = await service.remotes('/repo')
    expect(remotes).toEqual([
      { name: 'origin', fetchUrl: 'https://host/a.git', pushUrl: 'https://host/a.git' },
      { name: 'upstream', fetchUrl: 'https://host/b.git', pushUrl: '' }
    ])
  })
})

describe('스태시', () => {
  it('목록을 ref/메시지/시각으로 파싱한다', async () => {
    routeGit([
      [
        (a) => a[0] === 'stash' && a[1] === 'list',
        'stash@{0}\u0000WIP on main: 작업\x001700000000\u0000stash@{1}\u0000On dev: 다른 작업\x001699999999\u0000'
      ]
    ])
    const list = await service.stashList('/repo')
    expect(list).toEqual([
      { ref: 'stash@{0}', index: 0, message: 'WIP on main: 작업', timestamp: 1_700_000_000_000 },
      { ref: 'stash@{1}', index: 1, message: 'On dev: 다른 작업', timestamp: 1_699_999_999_000 }
    ])
  })

  it('메시지·untracked 옵션을 반영한다', async () => {
    await service.stashPush('/repo', { message: '임시', includeUntracked: true })
    expect(runGit.mock.calls[0][0]).toEqual([
      'stash',
      'push',
      '--include-untracked',
      '-m',
      '임시'
    ])
  })

  it('stash@{N} 형식이 아닌 ref 는 거부한다', async () => {
    await expect(service.stashAction('/repo', 'drop', 'evil; rm -rf /')).rejects.toThrow(
      '유효하지 않은 스태시 참조'
    )
  })

  it('정상 ref 는 그대로 넘긴다', async () => {
    await service.stashAction('/repo', 'pop', 'stash@{2}')
    expect(runGit.mock.calls[0][0]).toEqual(['stash', 'pop', 'stash@{2}'])
  })
})

describe('브랜치', () => {
  it('브랜치명은 자체 검증 + git check-ref-format 이중으로 본다', async () => {
    await service.createBranch({ repoPath: '/repo', name: 'feature/x' })
    expect(runGit.mock.calls[0][0]).toEqual(['check-ref-format', '--branch', 'feature/x'])
    expect(runGit.mock.calls[1][0]).toEqual(['branch', 'feature/x'])
  })

  it('checkout 옵션이면 -b 로 만들고 바로 전환한다', async () => {
    await service.createBranch({
      repoPath: '/repo',
      name: 'feature/y',
      startPoint: 'origin/main',
      checkout: true
    })
    expect(runGit.mock.calls[1][0]).toEqual(['checkout', '-b', 'feature/y', 'origin/main', '--'])
  })

  it('위험한 브랜치명은 거부한다', async () => {
    await expect(service.createBranch({ repoPath: '/repo', name: '-D' })).rejects.toThrow(
      '유효하지 않은 브랜치 이름'
    )
  })

  it('전환은 trailing `--` 로 pathspec 이 아님을 못박는다', async () => {
    await service.checkoutBranch('/repo', 'main')
    expect(runGit.mock.calls[0][0]).toEqual(['checkout', 'main', '--'])
  })

  it('merge/rebase 중단', async () => {
    await service.abortOperation('/repo', 'rebase')
    expect(runGit.mock.calls[0][0]).toEqual(['rebase', '--abort'])
  })
})

describe('GitScmService.branchDiff', () => {
  it('merge-base 기준으로 바뀐 파일을 준다 — base 가 앞서가도 그쪽 커밋이 섞이지 않는다', async () => {
    routeGit([
      [(a) => a[0] === 'symbolic-ref', 'origin/develop'],
      [(a) => a[0] === 'merge-base', `${HASH_A}\n`],
      [(a) => a.includes('--name-status'), `M\u0000src/a.ts\u0000A\u0000src/b.ts\u0000`],
      [(a) => a.includes('--numstat'), `10\t2\tsrc/a.ts\u00005\t0\tsrc/b.ts\u0000`],
      [(a) => a.includes('--abbrev-ref'), 'feature/neon-6774'],
      [(a) => a[0] === 'rev-list', '3']
    ])

    const diff = await service.branchDiff('/repo')

    expect(diff).toMatchObject({
      baseRef: 'origin/develop',
      baseOid: HASH_A,
      headRef: 'feature/neon-6774',
      ahead: 3
    })
    expect(diff.files).toEqual([
      { path: 'src/a.ts', status: 'modified', added: 10, removed: 2 },
      { path: 'src/b.ts', status: 'added', added: 5, removed: 0 }
    ])
    // 오른쪽에 rev 를 주지 않는다 = 작업 트리까지 비교 (아직 커밋 안 한 변경 포함)
    const nameStatusCall = runGit.mock.calls.find((c) => (c[0] as string[]).includes('--name-status'))
    expect((nameStatusCall?.[0] as string[]).at(-1)).toBe(HASH_A)
  })

  it('기준 브랜치를 지정하면 그것을 쓴다', async () => {
    routeGit([
      [(a) => a[0] === 'merge-base', `${HASH_A}\n`],
      [(a) => a.includes('--abbrev-ref'), 'feature/x']
    ])

    const diff = await service.branchDiff('/repo', 'origin/release')

    expect(diff.baseRef).toBe('origin/release')
    expect(runGit.mock.calls.some((c) => (c[0] as string[]).join(' ').includes('origin/release'))).toBe(true)
  })

  it('origin/HEAD 가 없으면 흔한 이름을 찾는다', async () => {
    routeGit([
      [(a) => a[0] === 'symbolic-ref', ''],
      [(a) => a[0] === 'rev-parse' && a.includes('origin/main'), ''],
      [(a) => a[0] === 'rev-parse' && a.includes('origin/master'), HASH_B],
      [(a) => a[0] === 'merge-base', `${HASH_A}\n`],
      [(a) => a.includes('--abbrev-ref'), 'feature/x']
    ])

    expect((await service.branchDiff('/repo')).baseRef).toBe('origin/master')
  })

  it('기준을 못 찾으면 그렇게 말한다 — 조용히 빈 목록을 주지 않는다', async () => {
    routeGit([[(a) => a[0] === 'symbolic-ref', '']])
    await expect(service.branchDiff('/repo')).rejects.toThrow('기준 브랜치를 찾지 못했습니다')
  })

  it('공통 조상을 못 찾으면 실패한다', async () => {
    routeGit([
      [(a) => a[0] === 'symbolic-ref', 'origin/main'],
      [(a) => a[0] === 'merge-base', '']
    ])
    await expect(service.branchDiff('/repo')).rejects.toThrow('공통 조상')
  })
})

describe('GitScmService.fileDiff — range', () => {
  it('기준 커밋의 내용과 지금 작업 파일을 비교한다', async () => {
    writeFileSync(join(repoDir, 'a.ts'), 'now')
    routeGit([[(a) => a[0] === 'show', 'before']])
    runGitBuffer.mockResolvedValue(Buffer.from('before'))

    const diff = await service.fileDiff({
      repoPath: repoDir,
      path: 'a.ts',
      source: { kind: 'range', baseOid: HASH_A }
    })

    expect(diff.original).toBe('before')
    expect(diff.modified).toBe('now')
  })

  it('기준 커밋 id 가 온전하지 않으면 거부한다', async () => {
    await expect(
      service.fileDiff({ repoPath: repoDir, path: 'a.ts', source: { kind: 'range', baseOid: 'abc' } })
    ).rejects.toThrow('유효하지 않은 기준 커밋')
  })
})
