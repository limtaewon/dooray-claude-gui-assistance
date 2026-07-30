/**
 * `git status --porcelain=v2 --branch` 증분 파서.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/shared/git-status-porcelain-parser.ts`. Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: 서브모듈 내부 경로(`submoduleRoot`) 관련 필드 제거.
 *
 * 왜 증분인가: 무시되지 않은 거대 폴더가 있으면 status 출력이 V8 문자열 상한을 넘겨 프로세스를
 * 죽인다. 도착하는 청크마다 먹여서 한도를 넘는 즉시 git 을 중단할 수 있게 한다.
 * 충돌(`u`) 레코드는 파일별 후처리가 필요해 raw 라인만 모으고 호출자가 해석한다.
 */
import type { GitStatusEntry } from './statusTypes'
import { decodeGitCQuotedPath } from './cquotedPath'

export interface BranchMetadata {
  head?: string
  branch?: string
  upstreamName?: string
  upstreamAheadBehind?: { ahead: number; behind: number }
}

export type StatusPorcelainRecord =
  | { type: 'entry'; entry: GitStatusEntry }
  | { type: 'unmerged'; line: string }

export class StatusPorcelainParser {
  private carry = ''
  /** 변경 엔트리 수 — 한도는 이 값으로 잰다. */
  private count = 0

  readonly entries: GitStatusEntry[] = []
  readonly ignoredPaths: string[] = []
  /** 호출자가 비동기로 해석할 raw `u ` 라인. */
  readonly unmergedLines: string[] = []
  readonly branch: BranchMetadata = {}

  /** 한도를 넘어간 것까지 포함해 관측한 전체 엔트리 수. */
  get statusLength(): number {
    return this.count
  }

  /**
   * 디코드된 청크 하나를 먹인다. 누적 엔트리 수가 `limit` 를 넘으면 true — 호출자는 git 을
   * 중단해야 한다(limit 0 이면 무제한). 완결된 줄만 파싱하고 잘린 꼬리는 다음 청크로 넘긴다.
   */
  update(chunk: string, limit: number): boolean {
    const text = this.carry + chunk
    let start = 0
    for (;;) {
      const nl = text.indexOf('\n', start)
      if (nl === -1) break
      // Windows CRLF 출력을 위해 꼬리 \r 제거
      let end = nl
      if (end > start && text.charCodeAt(end - 1) === 13) end -= 1
      this.parseLine(text.slice(start, end))
      start = nl + 1
      if (limit !== 0 && this.count > limit) {
        this.carry = ''
        return true
      }
    }
    this.carry = text.slice(start)
    return false
  }

  /** 개행 없이 끝난 마지막 줄을 flush 한다. */
  finish(): void {
    if (this.carry.length > 0) {
      this.parseLine(this.carry)
      this.carry = ''
    }
  }

  private parseLine(line: string): void {
    if (!line) return

    if (line.startsWith('# branch.oid ')) {
      this.branch.head = line.slice('# branch.oid '.length).trim()
      return
    }
    if (line.startsWith('# branch.head ')) {
      const branchHead = line.slice('# branch.head '.length).trim()
      // '' 가 아니라 undefined 로 둬야 렌더러가 detached HEAD 를 명시적으로 구분한다.
      this.branch.branch =
        branchHead && branchHead !== '(detached)' ? `refs/heads/${branchHead}` : undefined
      return
    }
    if (line.startsWith('# branch.upstream ')) {
      this.branch.upstreamName = line.slice('# branch.upstream '.length).trim() || undefined
      return
    }
    if (line.startsWith('# branch.ab ')) {
      const match = line.match(/^# branch\.ab \+(\d+) -(\d+)$/)
      if (match) {
        this.branch.upstreamAheadBehind = {
          ahead: Number.parseInt(match[1], 10),
          behind: Number.parseInt(match[2], 10)
        }
      }
      return
    }
    if (line.startsWith('1 ') || line.startsWith('2 ')) {
      this.parseChangedEntry(line)
      return
    }
    if (line.startsWith('? ')) {
      this.push({
        path: decodeGitCQuotedPath(line.slice(2)),
        status: 'untracked',
        area: 'untracked'
      })
      return
    }
    if (line.startsWith('! ')) {
      this.ignoredPaths.push(decodeGitCQuotedPath(line.slice(2)))
      return
    }
    if (line.startsWith('u ')) {
      this.count += 1
      this.unmergedLines.push(line)
    }
  }

  private parseChangedEntry(line: string): void {
    // "1 XY sub mH mI mW hH path" 또는 "2 XY sub mH mI mW hH X<score> path\torigPath"
    const parts = line.split(' ')
    const xy = parts[1]
    const indexStatus = xy[0]
    const worktreeStatus = xy[1]

    if (line.startsWith('2 ')) {
      // type-2 는 고정 9필드 뒤가 새 경로, TAB 뒤가 원본 경로. 공백을 보존해야 경로 키가 맞는다.
      const tabParts = line.split('\t')
      const path = decodeGitCQuotedPath(tabParts[0].split(' ').slice(9).join(' '))
      const oldPath = decodeGitCQuotedPath(tabParts.slice(1).join('\t'))
      if (indexStatus !== '.') {
        this.push({
          path,
          status: parseStatusChar(indexStatus),
          area: 'staged',
          oldPath,
          ...submoduleStatusField(parts[2], indexStatus)
        })
      }
      if (worktreeStatus !== '.') {
        this.push({
          path,
          status: parseStatusChar(worktreeStatus),
          area: 'unstaged',
          oldPath,
          ...submoduleStatusField(parts[2], worktreeStatus)
        })
      }
      return
    }

    const path = decodeGitCQuotedPath(parts.slice(8).join(' '))
    if (indexStatus !== '.') {
      this.push({
        path,
        status: parseStatusChar(indexStatus),
        area: 'staged',
        ...submoduleStatusField(parts[2], indexStatus)
      })
    }
    if (worktreeStatus !== '.') {
      this.push({
        path,
        status: parseStatusChar(worktreeStatus),
        area: 'unstaged',
        ...submoduleStatusField(parts[2], worktreeStatus)
      })
    }
  }

  private push(entry: GitStatusEntry): void {
    this.count += 1
    this.entries.push(entry)
  }
}

export function parseStatusChar(char: string): GitStatusEntry['status'] {
  switch (char) {
    case 'M':
      return 'modified'
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

export function parseSubmoduleStatus(
  submoduleField: string | undefined,
  statusChar = '.'
): GitStatusEntry['submodule'] {
  if (!submoduleField?.startsWith('S')) return undefined
  return {
    commitChanged: submoduleField[1] === 'C' || (submoduleField === 'S...' && statusChar === 'M'),
    trackedChanges: submoduleField[2] === 'M',
    untrackedChanges: submoduleField[3] === 'U'
  }
}

function submoduleStatusField(
  submoduleField: string | undefined,
  statusChar: string
): { submodule: GitStatusEntry['submodule'] } | Record<string, never> {
  const submodule = parseSubmoduleStatus(submoduleField, statusChar)
  return submodule ? { submodule } : {}
}

/** 충돌(`u`) 레코드 한 줄을 엔트리로 해석한다. 서브모듈 충돌(mode 160000)은 제외한다. */
export function parseUnmergedLine(line: string): GitStatusEntry | null {
  // "u XY sub m1 m2 m3 mW h1 h2 h3 path" — 공백 구분, 경로는 10번째 필드부터
  const parts = line.split(' ')
  if (parts.length < 11) return null
  const xy = parts[1]
  if (parts[3] === '160000' || parts[4] === '160000' || parts[5] === '160000') return null
  const path = decodeGitCQuotedPath(parts.slice(10).join(' '))
  if (!path) return null
  return { path, status: 'modified', area: 'unstaged', conflictKind: parseConflictKind(xy) }
}

function parseConflictKind(xy: string): GitStatusEntry['conflictKind'] {
  switch (xy) {
    case 'UU':
      return 'both_modified'
    case 'AA':
      return 'both_added'
    case 'DD':
      return 'both_deleted'
    case 'AU':
      return 'added_by_us'
    case 'UA':
      return 'added_by_them'
    case 'DU':
      return 'deleted_by_us'
    case 'UD':
      return 'deleted_by_them'
    default:
      return 'both_modified'
  }
}
