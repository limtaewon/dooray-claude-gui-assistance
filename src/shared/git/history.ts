/**
 * 커밋 히스토리 조회 — git executor 를 주입받아 실행한다(main/테스트 공용).
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/shared/git-history.ts`. Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: ① 전 브랜치 조회(`allBranches` → `--branches --remotes --tags`) ② 페이지네이션(`--skip`) 추가.
 *   Orca 는 HEAD 만 조회하고 페이지네이션이 없다 — 소스트리급 히스토리에는 둘 다 필요하다.
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
  type GitHistoryExecutor,
  type GitHistoryItemRef,
  type GitHistoryOptions,
  type GitHistoryResult
} from './historyTypes'

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

  const { stdout } = await git(
    [
      'log',
      `--format=${GIT_HISTORY_COMMIT_FORMAT}`,
      '-z',
      '--topo-order',
      '--decorate=full',
      // 한 건 더 받아서 hasMore 를 판정한다.
      `-n${limit + 1}`,
      ...(skip > 0 ? [`--skip=${skip}`] : []),
      // `--all` 은 refs/stash 까지 포함해 스태시와 그 내부 커밋(index/untracked)이 목록에 섞인다.
      // 소스트리처럼 브랜치·원격·태그만 본다.
      ...(options.allBranches ? ['--branches', '--remotes', '--tags'] : [headOid]),
      // 뒤따르는 인자가 경로로 해석되지 않게 못박는다.
      '--'
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
    hasMore: parsed.length > limit,
    limit,
    skip
  }
}
