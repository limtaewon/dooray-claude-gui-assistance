/**
 * 파일 상태의 표시용 글자·색·정렬 규칙.
 *
 * Portions ported from Orca (https://github.com/stablyai/orca) — orca@1.4.162-rc.0,
 * `src/renderer/src/components/right-sidebar/status-display.ts` 와 `source-control-entry-actions.ts`.
 * Copyright (c) 2026 Lovecast Inc. — MIT License.
 * 변경: 색을 Clauday 테마 토큰(`--git-*`)으로 교체, 서브모듈 내부 엔트리 분기 제거.
 */
import type { GitStatusEntry } from '@shared/git/statusTypes'

/** 목록 오른쪽에 붙는 한 글자 배지. */
export const STATUS_LABELS: Record<GitStatusEntry['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: 'U'
}

export const STATUS_COLORS: Record<GitStatusEntry['status'], string> = {
  modified: 'text-git-modified',
  added: 'text-git-added',
  deleted: 'text-git-deleted',
  renamed: 'text-git-modified',
  copied: 'text-git-modified',
  untracked: 'text-git-untracked'
}

export const CONFLICT_LABELS: Record<NonNullable<GitStatusEntry['conflictKind']>, string> = {
  both_modified: '양쪽 수정',
  both_added: '양쪽 추가',
  both_deleted: '양쪽 삭제',
  added_by_us: '우리가 추가',
  added_by_them: '상대가 추가',
  deleted_by_us: '우리가 삭제',
  deleted_by_them: '상대가 삭제'
}

/** 경로에서 파일명만. 디렉터리는 별도로 흐리게 보여준다. */
export function splitPath(path: string): { dir: string; name: string } {
  const index = path.lastIndexOf('/')
  return index === -1
    ? { dir: '', name: path }
    : { dir: path.slice(0, index + 1), name: path.slice(index + 1) }
}

/**
 * 미해결 충돌 파일에는 스테이징을 열지 않는다 — `git add` 가 충돌의 유일한 신호인
 * `u` 레코드를 지워버려서, 사용자가 해결했다고 착각한 채로 커밋하게 된다.
 */
export function canStage(entry: GitStatusEntry): boolean {
  return entry.area !== 'staged' && !entry.conflictKind
}

export function canUnstage(entry: GitStatusEntry): boolean {
  return entry.area === 'staged'
}

export function canDiscard(entry: GitStatusEntry): boolean {
  return !entry.conflictKind && (entry.area === 'unstaged' || entry.area === 'untracked')
}

export interface StatusSections {
  /** 추적 중인 파일의 변경 — 스테이징 여부와 무관하게 **한 파일 한 줄** */
  changes: GitStatusEntry[]
  /** git 이 아직 모르는 파일 */
  untracked: GitStatusEntry[]
  conflicts: GitStatusEntry[]
}

/**
 * 엔트리를 화면 섹션으로 가른다 — 기준은 **추적 여부**이지 스테이징이 아니다.
 *
 * 스테이징으로 가르면 체크할 때마다 파일이 섹션을 옮겨 다녀 목록이 출렁인다. 커밋 대상 선택은
 * 체크박스가 맡고, 목록은 "무엇이 바뀌었나" 만 보여준다(IntelliJ 의 변경/버전 없는 파일과 같은 구분).
 * 같은 파일이 staged·unstaged 양쪽에 걸리면 한 줄로 합친다.
 */
export function splitIntoSections(entries: GitStatusEntry[]): StatusSections {
  const conflicts: GitStatusEntry[] = []
  const untracked: GitStatusEntry[] = []
  const byPath = new Map<string, GitStatusEntry>()

  for (const entry of entries) {
    if (entry.conflictKind) {
      conflicts.push(entry)
      continue
    }
    if (entry.area === 'untracked') {
      untracked.push(entry)
      continue
    }
    const existing = byPath.get(entry.path)
    if (!existing) {
      byPath.set(entry.path, { ...entry })
      continue
    }
    // 합칠 때: 새로 추가된 파일이라는 사실(added)이 우선, 수치는 양쪽을 더해 HEAD 대비로 본다.
    byPath.set(entry.path, {
      ...existing,
      status: existing.status === 'added' || entry.status === 'added' ? 'added' : existing.status,
      added: sumStat(existing.added, entry.added),
      removed: sumStat(existing.removed, entry.removed)
    })
  }

  return { changes: [...byPath.values()], untracked, conflicts }
}

function sumStat(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined && b === undefined) return undefined
  return (a ?? 0) + (b ?? 0)
}

/** 목록 안정 키 — 합쳐진 뒤에는 경로가 곧 한 줄이다. */
export function entryKey(entry: GitStatusEntry): string {
  return entry.path
}
