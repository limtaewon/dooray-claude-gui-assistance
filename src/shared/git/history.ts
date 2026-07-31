/**
 * 커밋 히스토리 조회 — git executor 를 주입받아 실행한다(main/테스트 공용).
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/shared/git-history.ts`. Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: ① 전 브랜치 조회(`allBranches` → `--branches --remotes --tags`) ② 페이지네이션(`--skip`)
 *   ③ 커밋 필터(메시지·해시·작성자·경로·코드·기간·브랜치) 추가. Orca 는 HEAD 만 조회하고
 *   페이지네이션·필터가 없다 — 소스트리/IntelliJ 급 히스토리에는 전부 필요하다.
 *
 * ref 검증 원칙(Orca): 정규식 화이트리스트 대신 `--end-of-options` + leading-dash 거부.
 *   execFile 은 셸을 거치지 않으므로 `HEAD~1`, `main..feature` 같은 revspec 을 그대로 넘겨도 안전하다.
 */
import {
  GIT_HISTORY_COMMIT_FORMAT,
  gitHistoryRefFromFullName,
  parseGitHistoryLog,
  shortGitHash
} from './historyLogParser'
import {
  GIT_HISTORY_DEFAULT_LIMIT,
  GIT_HISTORY_MAX_LIMIT,
  hasHistoryFilter,
  type GitHistoryExecutor,
  type GitHistoryFilter,
  type GitHistoryItemRef,
  type GitHistoryOptions,
  type GitHistoryResult
} from './historyTypes'

/** 7자(git 기본 짧은 해시) 미만은 평범한 단어일 수 있어 해시로 보지 않는다. */
const HASH_CANDIDATE_PATTERN = /^[0-9a-fA-F]{7,40}$/

/**
 * 커밋 필터를 git log 인자로 옮긴다. 조건들은 서로 독립적으로 함께 걸린다.
 *
 * 기본은 `--fixed-strings`(리터럴) — 검색창에 `feat(git):` 을 쳤을 때 정규식으로 해석돼
 * 아무것도 안 걸리는 쪽이 더 놀랍다. 정규식이 필요하면 `regex` 토글로 켠다.
 * 값은 전부 `--opt=value` 한 토큰이라 옵션 주입이 되지 않는다.
 */
function historyFilterArgs(filter: GitHistoryFilter | undefined): { args: string[]; paths: string[] } {
  const args: string[] = []
  const paths: string[] = []
  if (!filter) return { args, paths }

  const text = filter.text?.trim()
  const author = filter.author?.trim()
  const content = filter.content?.trim()
  const path = filter.path?.trim()
  const since = filter.since?.trim()
  const until = filter.until?.trim()

  if (text) args.push(`--grep=${text}`)
  if (author) args.push(`--author=${author}`)
  if (text || author) {
    args.push(filter.regex ? '--extended-regexp' : '--fixed-strings')
    if (!filter.caseSensitive) args.push('--regexp-ignore-case')
  }
  // pickaxe 는 기본이 리터럴이라 위 토글과 무관하게 동작한다.
  if (content) args.push(`-S${content}`)
  if (since) args.push(`--since=${since}`)
  if (until) args.push(`--until=${until}`)
  if (path) paths.push(path)

  return { args, paths }
}

function clampHistoryLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return GIT_HISTORY_DEFAULT_LIMIT
  return Math.min(GIT_HISTORY_MAX_LIMIT, Math.max(1, Math.trunc(limit ?? GIT_HISTORY_DEFAULT_LIMIT)))
}

async function resolveCommit(
  git: GitHistoryExecutor,
  cwd: string,
  ref: string
): Promise<string | null> {
  if (!ref || ref.startsWith('-')) return null
  try {
    const { stdout } = await git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], cwd)
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function resolveSymbolicFullName(
  git: GitHistoryExecutor,
  cwd: string,
  ref: string
): Promise<string | null> {
  if (!ref || ref.startsWith('-')) return null
  try {
    const { stdout } = await git(['rev-parse', '--symbolic-full-name', '--end-of-options', ref], cwd)
    // `--verify` 는 `--end-of-options` 를 삼키지만 `--symbolic-full-name` 은 그 마커를 그대로
    // 되돌려준다. 첫 줄을 그냥 쓰면 모든 브랜치/태그가 'commits' 카테고리로 떨어진다.
    return (
      stdout
        .trim()
        .split(/\r?\n/)
        .find((line) => line && line !== '--end-of-options') ?? null
    )
  } catch {
    return null
  }
}

async function resolveCurrentRef(
  git: GitHistoryExecutor,
  cwd: string,
  headOid: string
): Promise<{ currentRef: GitHistoryItemRef; branchName: string | null }> {
  try {
    const { stdout } = await git(['symbolic-ref', '--quiet', '--short', 'HEAD'], cwd)
    const branchName = stdout.trim()
    if (branchName) {
      return {
        branchName,
        currentRef: {
          id: `refs/heads/${branchName}`,
          name: branchName,
          revision: headOid,
          category: 'branches'
        }
      }
    }
  } catch {
    // detached HEAD
  }
  return {
    branchName: null,
    currentRef: { id: headOid, name: shortGitHash(headOid), revision: headOid, category: 'commits' }
  }
}

async function resolveUpstreamRef(
  git: GitHistoryExecutor,
  cwd: string,
  branchName: string | null
): Promise<GitHistoryItemRef | undefined> {
  if (!branchName) return undefined
  try {
    const { stdout } = await git(
      ['for-each-ref', '--format=%(upstream)%00%(upstream:short)', `refs/heads/${branchName}`],
      cwd
    )
    const [fullName, shortName] = stdout.split('\0')
    const upstreamRef = fullName?.trim()
    const upstreamShortName = shortName?.trim()
    if (!upstreamRef || !upstreamShortName) return undefined
    // %(upstream:objectname) 은 git 버전마다 없어서 rev-parse 로 따로 푼다.
    const oid = await resolveCommit(git, cwd, upstreamRef)
    return oid ? gitHistoryRefFromFullName(upstreamRef, upstreamShortName, oid) : undefined
  } catch {
    return undefined
  }
}

async function resolveNamedRef(
  git: GitHistoryExecutor,
  cwd: string,
  ref: string | null | undefined
): Promise<GitHistoryItemRef | undefined> {
  const normalized = ref?.trim()
  if (!normalized || normalized.startsWith('-')) return undefined
  const [revision, fullName] = await Promise.all([
    resolveCommit(git, cwd, normalized),
    resolveSymbolicFullName(git, cwd, normalized)
  ])
  return revision ? gitHistoryRefFromFullName(fullName, normalized, revision) : undefined
}

export async function loadGitHistory(
  git: GitHistoryExecutor,
  cwd: string,
  options: GitHistoryOptions = {}
): Promise<GitHistoryResult> {
  const limit = clampHistoryLimit(options.limit)
  const skip = Number.isFinite(options.skip) ? Math.max(0, Math.trunc(options.skip ?? 0)) : 0
  const headOid = await resolveCommit(git, cwd, 'HEAD')
  if (!headOid) {
    return { items: [], hasMore: false, limit, skip }
  }

  const { currentRef, branchName } = await resolveCurrentRef(git, cwd, headOid)
  const [remoteRef, rawBaseRef] = await Promise.all([
    resolveUpstreamRef(git, cwd, branchName),
    resolveNamedRef(git, cwd, options.baseRef)
  ])

  const baseRef =
    rawBaseRef && rawBaseRef.id !== remoteRef?.id && rawBaseRef.id !== currentRef.id
      ? rawBaseRef
      : undefined

  let mergeBase: string | undefined
  if (remoteRef?.revision && currentRef.revision && remoteRef.revision !== currentRef.revision) {
    try {
      const { stdout } = await git(['merge-base', currentRef.revision, remoteRef.revision], cwd)
      mergeBase = stdout.trim() || undefined
    } catch {
      mergeBase = undefined
    }
  }

  // 검색어가 짧은 해시 형태이고 실제 커밋이면 그 커밋 하나만 보여준다 (IntelliJ 의 "텍스트 또는 해시").
  const rawText = options.filter?.text?.trim() ?? ''
  const hashOid = HASH_CANDIDATE_PATTERN.test(rawText)
    ? await resolveCommit(git, cwd, rawText)
    : null

  const effectiveFilter = hashOid ? { ...options.filter, text: undefined } : options.filter
  const { args: filterArgs, paths: filterPaths } = historyFilterArgs(effectiveFilter)

  // 조회 범위: 해시 지정 > 특정 브랜치 > 전 브랜치 > HEAD.
  // `--all` 은 refs/stash 까지 포함해 스태시와 그 내부 커밋(index/untracked)이 섞이므로 쓰지 않는다.
  const branchFilter = options.filter?.branch?.trim()
  const revisions = hashOid
    ? [hashOid]
    : branchFilter && !branchFilter.startsWith('-')
      ? [branchFilter]
      : options.allBranches
        ? ['--branches', '--remotes', '--tags']
        : [headOid]

  const { stdout } = await git(
    [
      'log',
      `--format=${GIT_HISTORY_COMMIT_FORMAT}`,
      '-z',
      '--topo-order',
      '--decorate=full',
      // 해시로 특정한 경우엔 그 커밋 하나만. 아니면 한 건 더 받아 hasMore 를 판정한다.
      hashOid ? '-n1' : `-n${limit + 1}`,
      ...(skip > 0 && !hashOid ? [`--skip=${skip}`] : []),
      ...filterArgs,
      ...revisions,
      // 뒤따르는 인자가 경로로 해석되지 않게 못박는다. 경로 필터는 이 뒤에만 온다.
      '--',
      ...filterPaths
    ],
    cwd
  )

  const parsed = parseGitHistoryLog(stdout)
  const items = parsed.slice(0, limit)

  return {
    items,
    currentRef,
    remoteRef,
    baseRef,
    mergeBase,
    hasMore: hashOid ? false : parsed.length > limit,
    limit,
    skip,
    filtered: hasHistoryFilter(options.filter) || undefined
  }
}
