/**
 * 소스 제어(소스트리급) 서비스 — 작업 트리 상태·스테이징·커밋·원격·스태시·히스토리·diff.
 *
 * 커맨드 형태와 방어 패턴 일부는 Orca(https://github.com/stablyai/orca — orca@1.4.162-rc.0,
 * `src/main/git/status.ts` / `remote.ts` / `checkout.ts`)에서 가져왔다.
 * Copyright (c) 2026 Lovecast Inc. — MIT License. 세부는 `THIRD-PARTY-NOTICES.md` 참조.
 *
 * 기존 `GitService` 와의 경계: 저쪽은 **워크트리 오케스트레이션**(브랜치 작업 격리), 이쪽은
 * **한 저장소 안의 변경 관리**다. 러너도 따로 쓴다(`scmRunner.ts` 주석 참조).
 */
import { readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { isSafeGitRef } from '../../shared/workspace/gitRef'
import {
  StatusPorcelainParser,
  parseUnmergedLine
} from '../../shared/git/porcelainV2Parser'
import { iterateNulDelimitedFields } from '../../shared/git/nulFields'
import { decodeGitCQuotedPath } from '../../shared/git/cquotedPath'
import { capGitStatusEntries, resolveGitStatusLimit } from '../../shared/git/statusLimit'
import { exceedsDiffRenderLimit } from '../../shared/git/largeDiffLimit'
import { loadGitHistory } from '../../shared/git/history'
import {
  isGitAuthFailure,
  normalizeGitErrorMessage,
  runPullWithDivergenceFallback
} from '../../shared/git/remoteError'
import type {
  GitConflictOperation,
  GitStatusEntry,
  GitStatusResult
} from '../../shared/git/statusTypes'
import type { GitHistoryOptions, GitHistoryResult } from '../../shared/git/historyTypes'
import type {
  GitAuthorInfo,
  GitBranchDiff,
  GitCommitDetail,
  GitCommitFileChange,
  GitCommitParams,
  GitCreateBranchParams,
  GitFileDiffContent,
  GitFileDiffParams,
  GitPullParams,
  GitPushParams,
  GitRemoteInfo,
  GitRemoteOpResult,
  GitStashEntry
} from '../../shared/git/scmTypes'
import {
  GIT_NETWORK_TIMEOUT_MS,
  GitCommandError,
  assertRelativeRepoPath,
  isFullObjectId,
  isMaxBufferOverflowError,
  literalPathspec,
  runGit,
  runGitBuffer,
  streamGitStdout
} from './scmRunner'

/** 인자 목록이 OS 명령줄 한계를 넘지 않도록 한 번에 넘길 경로 수. */
const BULK_CHUNK_SIZE = 100
/** untracked 파일 라인 카운트 상한 — 이보다 크면 세지 않는다. */
const MAX_UNTRACKED_LINE_COUNT_BYTES = 2 * 1024 * 1024
/** 라인 카운트를 시도할 untracked 파일 최대 개수. */
const MAX_UNTRACKED_LINE_COUNT_FILES = 200
/** blob 읽기 상한 — 넘으면 바이너리로 강등해 diff 실패 대신 안내를 띄운다. */
const MAX_BLOB_BYTES = 10 * 1024 * 1024

function isBinaryBuffer(buf: Buffer): boolean {
  const end = Math.min(buf.length, 8192)
  for (let i = 0; i < end; i += 1) {
    if (buf[i] === 0) return true
  }
  return false
}

/** rename numstat 경로(`dir/{old => new}/f`)를 새 경로로 정규화한다. */
function normalizeNumstatPath(path: string): string {
  const braceStart = path.indexOf('{')
  const arrow = path.indexOf(' => ', braceStart)
  if (braceStart === -1 || arrow === -1) {
    const plainArrow = path.indexOf(' => ')
    return plainArrow === -1 ? path : path.slice(plainArrow + 4)
  }
  const braceEnd = path.indexOf('}', arrow)
  if (braceEnd === -1) return path
  return path.slice(0, braceStart) + path.slice(arrow + 4, braceEnd) + path.slice(braceEnd + 1)
}

interface NumstatRow {
  added?: number
  removed?: number
}

/** `git diff -z --numstat` 출력을 경로→라인수 맵으로. 바이너리(`-`)는 undefined 로 남긴다. */
function parseNumstat(stdout: string): Map<string, NumstatRow> {
  const result = new Map<string, NumstatRow>()
  const fields = [...iterateNulDelimitedFields(stdout)]
  for (let i = 0; i < fields.length; i += 1) {
    const record = fields[i]
    if (!record.trim()) continue
    const match = record.match(/^(\d+|-)\t(\d+|-)\t([\s\S]*)$/)
    if (!match) continue
    const [, addedRaw, removedRaw, rawPath] = match
    let path = rawPath
    if (path === '') {
      // rename 은 -z 에서 경로가 NUL 로 나뉘어 old, new 두 필드로 뒤따른다.
      i += 1
      const oldPath = fields[i] ?? ''
      i += 1
      path = fields[i] ?? oldPath
    }
    const key = decodeGitCQuotedPath(normalizeNumstatPath(path))
    result.set(key, {
      added: addedRaw === '-' ? undefined : Number.parseInt(addedRaw, 10),
      removed: removedRaw === '-' ? undefined : Number.parseInt(removedRaw, 10)
    })
  }
  return result
}

/** `diff -z --name-status` 출력 → 파일 목록. R/C 는 뒤에 old·new 두 경로가 온다. */
function parseNameStatus(stdout: string, stats: Map<string, NumstatRow>): GitCommitFileChange[] {
  const files: GitCommitFileChange[] = []
  const fields = [...iterateNulDelimitedFields(stdout)].filter((f) => f !== '')
  for (let i = 0; i < fields.length; i += 1) {
    const code = fields[i]
    if (!code) continue
    const statusChar = code[0]
    if (statusChar === 'R' || statusChar === 'C') {
      const oldPath = decodeGitCQuotedPath(fields[i + 1] ?? '')
      const path = decodeGitCQuotedPath(fields[i + 2] ?? '')
      i += 2
      files.push({ path, oldPath, status: statusCharToFileStatus(statusChar), ...(stats.get(path) ?? {}) })
      continue
    }
    const path = decodeGitCQuotedPath(fields[i + 1] ?? '')
    i += 1
    if (!path) continue
    files.push({ path, status: statusCharToFileStatus(statusChar), ...(stats.get(path) ?? {}) })
  }
  return files
}

function statusCharToFileStatus(char: string): GitStatusEntry['status'] {
  switch (char) {
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    default:
      return 'modified'
  }
}

export class GitScmService {
  // ───────────────────────── 상태 ─────────────────────────

  /**
   * 작업 트리 상태. porcelain v2 를 스트리밍 파싱하고, 엔트리가 상한을 넘으면 git 을 중간에 끊는다.
   * ahead/behind 는 같은 스트림의 `# branch.ab` 에서 얻어 추가 프로세스를 띄우지 않는다.
   */
  async status(repoPath: string, options: { limit?: number } = {}): Promise<GitStatusResult> {
    const limit = resolveGitStatusLimit(options.limit)
    const parser = new StatusPorcelainParser()

    await streamGitStdout(
      [
        '-c',
        'core.quotePath=false',
        'status',
        '--porcelain=v2',
        '--branch',
        '--untracked-files=all'
      ],
      repoPath,
      (chunk) => parser.update(chunk, limit)
    )
    parser.finish()

    const conflicts = parser.unmergedLines
      .map(parseUnmergedLine)
      .filter((entry): entry is GitStatusEntry => entry !== null)

    const all = [...parser.entries, ...conflicts]
    const capped = capGitStatusEntries(all, limit, {
      statusLength: parser.statusLength
    })

    await this.attachLineStats(repoPath, capped.entries)

    const ab = parser.branch.upstreamAheadBehind
    return {
      entries: capped.entries,
      conflictOperation: await this.detectConflictOperation(repoPath),
      head: parser.branch.head,
      branch: parser.branch.branch,
      upstreamStatus: {
        hasUpstream: Boolean(parser.branch.upstreamName),
        upstreamName: parser.branch.upstreamName,
        ahead: ab?.ahead ?? 0,
        behind: ab?.behind ?? 0
      },
      didHitLimit: capped.didHitLimit,
      statusLength: capped.statusLength
    }
  }

  /** 진행 중인 merge/rebase/cherry-pick 판정 — git 을 부르지 않고 `.git` 파일 존재만 본다. */
  private async detectConflictOperation(repoPath: string): Promise<GitConflictOperation> {
    let gitDir: string
    try {
      const { stdout } = await runGit(['rev-parse', '--absolute-git-dir'], repoPath)
      gitDir = stdout.trim()
    } catch {
      return 'none'
    }
    if (!gitDir) return 'none'
    if (existsSync(join(gitDir, 'MERGE_HEAD'))) return 'merge'
    // REBASE_HEAD 는 작업이 끝나도 남아 stale 배지를 만든다 — 디렉터리 존재로 판정한다.
    if (existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))) {
      return 'rebase'
    }
    if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) return 'cherry-pick'
    if (existsSync(join(gitDir, 'REVERT_HEAD'))) return 'revert'
    return 'none'
  }

  /** 각 엔트리에 +N/-M 을 채운다. staged/unstaged 는 numstat, untracked 는 파일 개행 수. */
  private async attachLineStats(repoPath: string, entries: GitStatusEntry[]): Promise<void> {
    const numstatArgs = ['-c', 'core.quotePath=false', 'diff', '-z', '--numstat', '-M']
    const [staged, unstaged] = await Promise.all([
      runGit([...numstatArgs, '--cached'], repoPath)
        .then((r) => parseNumstat(r.stdout))
        .catch(() => new Map<string, NumstatRow>()),
      runGit(numstatArgs, repoPath)
        .then((r) => parseNumstat(r.stdout))
        .catch(() => new Map<string, NumstatRow>())
    ])

    let untrackedCounted = 0
    for (const entry of entries) {
      if (entry.area === 'staged') {
        Object.assign(entry, staged.get(entry.path) ?? {})
      } else if (entry.area === 'unstaged') {
        Object.assign(entry, unstaged.get(entry.path) ?? {})
      } else if (untrackedCounted < MAX_UNTRACKED_LINE_COUNT_FILES) {
        untrackedCounted += 1
        const added = await this.countFileLines(join(repoPath, entry.path))
        if (added !== undefined) {
          entry.added = added
          entry.removed = 0
        }
      }
    }
  }

  private async countFileLines(absolutePath: string): Promise<number | undefined> {
    try {
      const info = await stat(absolutePath)
      if (!info.isFile() || info.size > MAX_UNTRACKED_LINE_COUNT_BYTES) return undefined
      const buf = await readFile(absolutePath)
      if (isBinaryBuffer(buf)) return undefined
      if (buf.length === 0) return 0
      let lines = 0
      for (let i = 0; i < buf.length; i += 1) {
        if (buf[i] === 10) lines += 1
      }
      // 마지막 줄에 개행이 없으면 한 줄 더 있는 것이다.
      return buf[buf.length - 1] === 10 ? lines : lines + 1
    } catch {
      return undefined
    }
  }

  // ───────────────────────── 히스토리 ─────────────────────────

  async history(repoPath: string, options: GitHistoryOptions = {}): Promise<GitHistoryResult> {
    return loadGitHistory((args, cwd) => runGit(args, cwd), repoPath, options)
  }

  /** 커밋 1건의 변경 파일 목록. 첫 부모와 비교하고, root 커밋이면 diff-tree 로 처리한다. */
  async commitDetail(repoPath: string, commitOid: string): Promise<GitCommitDetail> {
    if (!isFullObjectId(commitOid)) {
      throw new Error(`유효하지 않은 커밋 id: ${commitOid}`)
    }
    const { stdout: revList } = await runGit(
      ['rev-list', '--parents', '-n', '1', '--end-of-options', commitOid],
      repoPath
    )
    const parentOid = revList.trim().split(/\s+/)[1]

    const nameStatusArgs = parentOid
      ? ['-c', 'core.quotePath=false', 'diff', '-z', '--name-status', '-M', '-C', parentOid, commitOid]
      : ['-c', 'core.quotePath=false', 'diff-tree', '--root', '--no-commit-id', '-z', '--name-status', '-r', '-M', '-C', commitOid]
    const numstatArgs = parentOid
      ? ['-c', 'core.quotePath=false', 'diff', '-z', '--numstat', '-M', '-C', parentOid, commitOid]
      : ['-c', 'core.quotePath=false', 'diff-tree', '--root', '--no-commit-id', '-z', '--numstat', '-r', '-M', '-C', commitOid]

    const [nameStatus, numstat] = await Promise.all([
      runGit(nameStatusArgs, repoPath),
      runGit(numstatArgs, repoPath).catch(() => ({ stdout: '', stderr: '' }))
    ])

    const files = parseNameStatus(nameStatus.stdout, parseNumstat(numstat.stdout))

    return { commitOid, parentOid, files }
  }

  /**
   * 최근 커밋들의 작성자 목록(빈도순). 필터 UI 가 자유 입력 대신 실제 목록에서 고르게 한다.
   * 전체 히스토리를 훑으면 큰 저장소에서 느려서 최근 N 건만 표본으로 본다.
   */
  async authors(repoPath: string, sampleSize = 2000): Promise<GitAuthorInfo[]> {
    const limit = Math.max(1, Math.min(20_000, Math.trunc(sampleSize)))
    const { stdout } = await runGit(
      ['log', '--format=%aN%x1f%aE', '-z', `-n${limit}`, '--branches', '--remotes'],
      repoPath
    )

    const byKey = new Map<string, GitAuthorInfo>()
    for (const record of iterateNulDelimitedFields(stdout)) {
      // -z 레코드 사이에 개행이 끼는 경우가 있어 앞쪽을 털어낸다.
      const [name, email] = record.replace(/^[\r\n]+/, '').split('\x1f')
      if (!name?.trim() && !email?.trim()) continue
      const key = `${name}\u0000${email}`
      const existing = byKey.get(key)
      if (existing) existing.count += 1
      else byKey.set(key, { name: name?.trim() ?? '', email: email?.trim() ?? '', count: 1 })
    }

    return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }

  /**
   * 이 브랜치가 기준(base)에서 갈라진 뒤 바꾼 파일들.
   *
   * 비교 기준은 `merge-base(base, HEAD)` 다 — base 가 그 뒤로 앞서갔더라도 그쪽 커밋이
   * '내가 바꾼 것' 으로 섞이지 않게. 오른쪽은 작업 트리라 아직 커밋 안 한 변경도 포함된다.
   */
  async branchDiff(repoPath: string, baseRef?: string): Promise<GitBranchDiff> {
    const base = baseRef?.trim() || (await this.resolveBaseRef(repoPath))
    if (!isSafeGitRef(base)) throw new Error(`유효하지 않은 기준 브랜치: ${base}`)

    const { stdout: mergeBase } = await runGit(
      ['merge-base', '--end-of-options', base, 'HEAD'],
      repoPath
    )
    const baseOid = mergeBase.trim()
    if (!isFullObjectId(baseOid)) throw new Error(`${base} 와의 공통 조상을 찾지 못했습니다`)

    const [nameStatus, numstat, headRef, ahead] = await Promise.all([
      runGit(['-c', 'core.quotePath=false', 'diff', '-z', '--name-status', '-M', '-C', baseOid], repoPath),
      runGit(['-c', 'core.quotePath=false', 'diff', '-z', '--numstat', '-M', '-C', baseOid], repoPath)
        .catch(() => ({ stdout: '', stderr: '' })),
      runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath)
        .then((r) => r.stdout.trim())
        .catch(() => ''),
      runGit(['rev-list', '--count', '--end-of-options', `${baseOid}..HEAD`], repoPath)
        .then((r) => Number.parseInt(r.stdout.trim(), 10) || 0)
        .catch(() => 0)
    ])

    return {
      baseRef: base,
      baseOid,
      headRef: headRef && headRef !== 'HEAD' ? headRef : baseOid.slice(0, 7),
      ahead,
      files: parseNameStatus(nameStatus.stdout, parseNumstat(numstat.stdout))
    }
  }

  /** 기준 브랜치 추정 — origin/HEAD → 흔한 이름 순. 네트워크는 타지 않는다. */
  private async resolveBaseRef(repoPath: string): Promise<string> {
    const head = await runGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], repoPath)
      .then((r) => r.stdout.trim())
      .catch(() => '')
    if (head) return head
    for (const candidate of ['origin/main', 'origin/master', 'main', 'master']) {
      const found = await runGit(['rev-parse', '--verify', '--quiet', candidate], repoPath)
        .then((r) => r.stdout.trim())
        .catch(() => '')
      if (found) return candidate
    }
    throw new Error('기준 브랜치를 찾지 못했습니다 (origin/HEAD·main·master 없음)')
  }

  // ───────────────────────── diff ─────────────────────────

  /** 파일 diff — Monaco 가 계산하도록 양쪽 전문을 준다. */
  async fileDiff(params: GitFileDiffParams): Promise<GitFileDiffContent> {
    const { repoPath, source } = params
    const path = assertRelativeRepoPath(params.path)
    const oldPath = params.oldPath ? assertRelativeRepoPath(params.oldPath) : path

    let original: { text: string; binary: boolean }
    let modified: { text: string; binary: boolean }

    if (source.kind === 'staged') {
      original = await this.readBlob(repoPath, 'HEAD', oldPath)
      modified = await this.readBlob(repoPath, '', path)
    } else if (source.kind === 'range') {
      if (!isFullObjectId(source.baseOid)) {
        throw new Error(`유효하지 않은 기준 커밋: ${source.baseOid}`)
      }
      original = await this.readBlob(repoPath, source.baseOid, oldPath)
      modified = await this.readWorkingFile(repoPath, path)
    } else if (source.kind === 'unstaged') {
      original = await this.readBlob(repoPath, '', oldPath)
      modified = await this.readWorkingFile(repoPath, path)
    } else {
      if (!isFullObjectId(source.commitOid)) {
        throw new Error(`유효하지 않은 커밋 id: ${source.commitOid}`)
      }
      const parent =
        source.parentOid ??
        (await runGit(['rev-list', '--parents', '-n', '1', '--end-of-options', source.commitOid], repoPath)
          .then((r) => r.stdout.trim().split(/\s+/)[1])
          .catch(() => undefined))
      original = parent
        ? await this.readBlob(repoPath, parent, oldPath)
        : { text: '', binary: false }
      modified = await this.readBlob(repoPath, source.commitOid, path)
    }

    const tooLarge = exceedsDiffRenderLimit(original.text, modified.text)
    return {
      path,
      original: tooLarge ? '' : original.text,
      modified: tooLarge ? '' : modified.text,
      originalBinary: original.binary,
      modifiedBinary: modified.binary,
      tooLarge
    }
  }

  /** `git show <rev>:<path>` — rev 가 빈 문자열이면 인덱스(`:path`)를 읽는다. */
  private async readBlob(
    repoPath: string,
    rev: string,
    path: string
  ): Promise<{ text: string; binary: boolean }> {
    // `<oid>:<path>` 는 Windows 에서도 forward slash 여야 한다.
    const spec = `${rev}:${path.replace(/\\/g, '/')}`
    try {
      const buf = await runGitBuffer(['show', '--end-of-options', spec], repoPath, {
        maxBuffer: MAX_BLOB_BYTES
      })
      if (isBinaryBuffer(buf)) return { text: '', binary: true }
      return { text: buf.toString('utf8'), binary: false }
    } catch (error) {
      // 10MB 초과는 바이너리로 강등 — diff 실패 대신 "바이너리" 표시가 낫다.
      if (isMaxBufferOverflowError(error)) return { text: '', binary: true }
      // 파일이 그 리비전에 없으면(추가/삭제) 빈 쪽으로 취급한다.
      return { text: '', binary: false }
    }
  }

  private async readWorkingFile(
    repoPath: string,
    path: string
  ): Promise<{ text: string; binary: boolean }> {
    try {
      const absolute = join(repoPath, path)
      const info = await stat(absolute)
      if (!info.isFile()) return { text: '', binary: false }
      if (info.size > MAX_BLOB_BYTES) return { text: '', binary: true }
      const buf = await readFile(absolute)
      if (isBinaryBuffer(buf)) return { text: '', binary: true }
      return { text: buf.toString('utf8'), binary: false }
    } catch {
      // 삭제된 파일
      return { text: '', binary: false }
    }
  }

  // ───────────────────────── 스테이징 ─────────────────────────

  private async runChunked(
    repoPath: string,
    paths: string[],
    build: (chunk: string[]) => string[]
  ): Promise<void> {
    const specs = paths.map((p) => literalPathspec(assertRelativeRepoPath(p)))
    for (let i = 0; i < specs.length; i += BULK_CHUNK_SIZE) {
      await runGit(build(specs.slice(i, i + BULK_CHUNK_SIZE)), repoPath)
    }
  }

  async stage(repoPath: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return
    await this.runChunked(repoPath, paths, (chunk) => ['add', '--', ...chunk])
  }

  async unstage(repoPath: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return
    await this.runChunked(repoPath, paths, (chunk) => ['restore', '--staged', '--', ...chunk])
  }

  /** 변경 되돌리기. 추적 파일은 HEAD 로 복원하고, 추적되지 않은 파일은 삭제한다. */
  async discard(repoPath: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return
    const tracked: string[] = []
    const untracked: string[] = []
    for (const raw of paths) {
      const path = assertRelativeRepoPath(raw)
      const isTracked = await runGit(
        ['ls-files', '--error-unmatch', '--', literalPathspec(path)],
        repoPath
      )
        .then(() => true)
        .catch(() => false)
      ;(isTracked ? tracked : untracked).push(path)
    }
    if (tracked.length > 0) {
      await this.runChunked(repoPath, tracked, (chunk) => [
        'restore',
        '--worktree',
        '--source=HEAD',
        '--',
        ...chunk
      ])
    }
    if (untracked.length > 0) {
      await this.runChunked(repoPath, untracked, (chunk) => ['clean', '-ffd', '--', ...chunk])
    }
  }

  // ───────────────────────── 커밋 ─────────────────────────

  async commit(params: GitCommitParams): Promise<{ ok: boolean; message: string }> {
    const message = params.message.trim()
    if (!message) return { ok: false, message: '커밋 메시지가 비어 있습니다.' }
    try {
      const { stdout } = await runGit(
        ['commit', ...(params.amend ? ['--amend'] : []), '-m', message],
        params.repoPath
      )
      return { ok: true, message: stdout.trim() }
    } catch (error) {
      // hook/GPG 실패는 stderr, "nothing to commit" 은 stdout 에 나온다.
      const detail =
        error instanceof GitCommandError
          ? error.stderr.trim() || error.stdout.trim() || error.message
          : error instanceof Error
            ? error.message
            : '커밋에 실패했습니다.'
      return { ok: false, message: detail }
    }
  }

  /** 직전 커밋 메시지 — amend 체크 시 입력창을 채운다. */
  async lastCommitMessage(repoPath: string): Promise<string> {
    try {
      const { stdout } = await runGit(['log', '-1', '--format=%B'], repoPath)
      return stdout.replace(/\n+$/, '')
    } catch {
      return ''
    }
  }

  // ───────────────────────── 원격 ─────────────────────────

  private async remoteOp(
    operation: 'push' | 'pull' | 'fetch',
    run: () => Promise<void>
  ): Promise<GitRemoteOpResult> {
    try {
      await run()
      return { ok: true, message: '' }
    } catch (error) {
      return {
        ok: false,
        message: normalizeGitErrorMessage(error, operation),
        authFailed: isGitAuthFailure(error) || undefined
      }
    }
  }

  async push(params: GitPushParams): Promise<GitRemoteOpResult> {
    const remote = params.remote ?? 'origin'
    if (!isSafeGitRef(remote)) throw new Error(`유효하지 않은 원격 이름: ${remote}`)
    if (params.branch && !isSafeGitRef(params.branch)) {
      throw new Error(`유효하지 않은 브랜치 이름: ${params.branch}`)
    }
    return this.remoteOp('push', async () => {
      await runGit(
        [
          'push',
          ...(params.forceWithLease ? ['--force-with-lease'] : []),
          ...(params.setUpstream ? ['--set-upstream'] : []),
          remote,
          params.branch ?? 'HEAD'
        ],
        params.repoPath,
        { timeoutMs: GIT_NETWORK_TIMEOUT_MS }
      )
    })
  }

  async pull(params: GitPullParams): Promise<GitRemoteOpResult> {
    const remote = params.remote
    if (remote && !isSafeGitRef(remote)) throw new Error(`유효하지 않은 원격 이름: ${remote}`)
    if (params.branch && !isSafeGitRef(params.branch)) {
      throw new Error(`유효하지 않은 브랜치 이름: ${params.branch}`)
    }
    const baseArgs = [
      ...(params.rebase ? ['--rebase'] : []),
      ...(remote ? [remote, ...(params.branch ? [params.branch] : [])] : [])
    ]
    return this.remoteOp('pull', () =>
      // git 2.27+ 는 정책이 없으면 갈라진 브랜치의 pull 을 거부한다 — merge 로 1회 재시도.
      runPullWithDivergenceFallback(baseArgs, async (effective) => {
        await runGit(['pull', ...effective], params.repoPath, {
          timeoutMs: GIT_NETWORK_TIMEOUT_MS
        })
      })
    )
  }

  async fetch(repoPath: string, remote?: string): Promise<GitRemoteOpResult> {
    if (remote && !isSafeGitRef(remote)) throw new Error(`유효하지 않은 원격 이름: ${remote}`)
    return this.remoteOp('fetch', async () => {
      await runGit(['fetch', '--prune', ...(remote ? [remote] : [])], repoPath, {
        timeoutMs: GIT_NETWORK_TIMEOUT_MS
      })
    })
  }

  async remotes(repoPath: string): Promise<GitRemoteInfo[]> {
    const { stdout } = await runGit(['remote', '-v'], repoPath)
    const byName = new Map<string, GitRemoteInfo>()
    for (const line of stdout.split(/\r?\n/)) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
      if (!match) continue
      const [, name, url, kind] = match
      const entry = byName.get(name) ?? { name, fetchUrl: '', pushUrl: '' }
      if (kind === 'fetch') entry.fetchUrl = url
      else entry.pushUrl = url
      byName.set(name, entry)
    }
    return [...byName.values()]
  }

  // ───────────────────────── 스태시 ─────────────────────────

  async stashList(repoPath: string): Promise<GitStashEntry[]> {
    const { stdout } = await runGit(
      ['stash', 'list', '--format=%gd%x00%gs%x00%at', '-z'],
      repoPath
    )
    const fields = [...iterateNulDelimitedFields(stdout)]
    const entries: GitStashEntry[] = []
    for (let i = 0; i + 2 < fields.length; i += 3) {
      const ref = fields[i]!.replace(/^\n+/, '').trim()
      if (!ref) continue
      const seconds = Number.parseInt(fields[i + 2] ?? '', 10)
      entries.push({
        ref,
        index: Number.parseInt(ref.match(/\{(\d+)\}/)?.[1] ?? '0', 10),
        message: fields[i + 1] ?? '',
        timestamp: Number.isFinite(seconds) ? seconds * 1000 : undefined
      })
    }
    return entries
  }

  async stashPush(
    repoPath: string,
    options: { message?: string; includeUntracked?: boolean } = {}
  ): Promise<void> {
    await runGit(
      [
        'stash',
        'push',
        ...(options.includeUntracked ? ['--include-untracked'] : []),
        ...(options.message?.trim() ? ['-m', options.message.trim()] : [])
      ],
      repoPath
    )
  }

  /** 스태시 적용/삭제. `ref` 는 UI 가 목록에서 돌려준 `stash@{N}` 만 허용한다. */
  async stashAction(
    repoPath: string,
    action: 'apply' | 'pop' | 'drop',
    ref: string
  ): Promise<void> {
    if (!/^stash@\{\d+\}$/.test(ref)) throw new Error(`유효하지 않은 스태시 참조: ${ref}`)
    await runGit(['stash', action, ref], repoPath)
  }

  // ───────────────────────── 브랜치 ─────────────────────────

  async createBranch(params: GitCreateBranchParams): Promise<void> {
    if (!isSafeGitRef(params.name)) throw new Error(`유효하지 않은 브랜치 이름: ${params.name}`)
    // 나머지 문법 검증은 git 에게 맡긴다 — 우리 정규식보다 정확하다.
    await runGit(['check-ref-format', '--branch', params.name], params.repoPath)

    const startPoint = params.startPoint?.trim()
    if (startPoint && startPoint.startsWith('-')) {
      throw new Error(`유효하지 않은 시작 지점: ${startPoint}`)
    }
    if (params.checkout) {
      await runGit(
        ['checkout', '-b', params.name, ...(startPoint ? [startPoint] : []), '--'],
        params.repoPath
      )
      return
    }
    await runGit(['branch', params.name, ...(startPoint ? [startPoint] : [])], params.repoPath)
  }

  async checkoutBranch(repoPath: string, branch: string): Promise<void> {
    if (!isSafeGitRef(branch)) throw new Error(`유효하지 않은 브랜치 이름: ${branch}`)
    // trailing `--` 로 pathspec 이 아님을 못박는다.
    await runGit(['checkout', branch, '--'], repoPath)
  }

  async abortOperation(repoPath: string, operation: 'merge' | 'rebase'): Promise<void> {
    await runGit([operation, '--abort'], repoPath)
  }
}

export const gitScmService = new GitScmService()
