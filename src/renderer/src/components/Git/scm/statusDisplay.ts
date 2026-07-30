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
  staged: GitStatusEntry[]
  changes: GitStatusEntry[]
  untracked: GitStatusEntry[]
  conflicts: GitStatusEntry[]
}

/** 엔트리를 화면 섹션으로 가른다. 충돌은 스테이징 가능 여부가 달라 별도 섹션으로 뺀다. */
export function splitIntoSections(entries: GitStatusEntry[]): StatusSections {
  const sections: StatusSections = { staged: [], changes: [], untracked: [], conflicts: [] }
  for (const entry of entries) {
    if (entry.conflictKind) sections.conflicts.push(entry)
    else if (entry.area === 'staged') sections.staged.push(entry)
    else if (entry.area === 'untracked') sections.untracked.push(entry)
    else sections.changes.push(entry)
  }
  return sections
}

/** 목록 안정 정렬 키 — status 갱신마다 행이 튀지 않게 경로로만 정렬한다. */
export function entryKey(entry: GitStatusEntry): string {
  return `${entry.area}:${entry.path}`
}
