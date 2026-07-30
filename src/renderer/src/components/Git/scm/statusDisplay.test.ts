import { describe, it, expect } from 'vitest'
import type { GitStatusEntry } from '@shared/git/statusTypes'
import {
  STATUS_LABELS,
  canDiscard,
  canStage,
  canUnstage,
  entryKey,
  splitIntoSections,
  splitPath
} from './statusDisplay'

function entry(patch: Partial<GitStatusEntry> = {}): GitStatusEntry {
  return { path: 'src/a.ts', status: 'modified', area: 'unstaged', ...patch }
}

describe('splitPath', () => {
  it('디렉터리와 파일명을 나눈다', () => {
    expect(splitPath('src/components/A.tsx')).toEqual({ dir: 'src/components/', name: 'A.tsx' })
  })

  it('루트 파일은 dir 이 비어 있다', () => {
    expect(splitPath('README.md')).toEqual({ dir: '', name: 'README.md' })
  })
})

describe('행 액션 가능 여부', () => {
  it('스테이징 안 된 변경은 올릴 수 있다', () => {
    expect(canStage(entry())).toBe(true)
    expect(canStage(entry({ area: 'untracked' }))).toBe(true)
    expect(canStage(entry({ area: 'staged' }))).toBe(false)
  })

  it('미해결 충돌 파일에는 스테이징을 열지 않는다 — git add 가 충돌 신호를 지워버린다', () => {
    expect(canStage(entry({ conflictKind: 'both_modified' }))).toBe(false)
  })

  it('스테이징된 것만 내릴 수 있다', () => {
    expect(canUnstage(entry({ area: 'staged' }))).toBe(true)
    expect(canUnstage(entry())).toBe(false)
  })

  it('되돌리기는 작업 트리 쪽 변경에만, 충돌 파일에는 열지 않는다', () => {
    expect(canDiscard(entry())).toBe(true)
    expect(canDiscard(entry({ area: 'untracked' }))).toBe(true)
    expect(canDiscard(entry({ area: 'staged' }))).toBe(false)
    expect(canDiscard(entry({ conflictKind: 'both_deleted' }))).toBe(false)
  })
})

describe('splitIntoSections', () => {
  it('충돌 · 스테이징 · 변경 · 추적안됨으로 가른다', () => {
    const sections = splitIntoSections([
      entry({ path: 'staged.ts', area: 'staged' }),
      entry({ path: 'changed.ts' }),
      entry({ path: 'new.ts', area: 'untracked', status: 'untracked' }),
      entry({ path: 'conflict.ts', conflictKind: 'both_modified' })
    ])
    expect(sections.staged.map((e) => e.path)).toEqual(['staged.ts'])
    expect(sections.changes.map((e) => e.path)).toEqual(['changed.ts'])
    expect(sections.untracked.map((e) => e.path)).toEqual(['new.ts'])
    expect(sections.conflicts.map((e) => e.path)).toEqual(['conflict.ts'])
  })

  it('충돌은 area 와 무관하게 충돌 섹션으로 간다 — 스테이징 규칙이 다르다', () => {
    const sections = splitIntoSections([entry({ area: 'staged', conflictKind: 'both_added' })])
    expect(sections.staged).toHaveLength(0)
    expect(sections.conflicts).toHaveLength(1)
  })

  it('빈 입력도 네 섹션을 모두 돌려준다', () => {
    expect(splitIntoSections([])).toEqual({ staged: [], changes: [], untracked: [], conflicts: [] })
  })
})

describe('entryKey', () => {
  it('같은 파일이 staged/unstaged 양쪽에 있어도 키가 겹치지 않는다', () => {
    expect(entryKey(entry({ area: 'staged' }))).not.toBe(entryKey(entry({ area: 'unstaged' })))
  })
})

describe('STATUS_LABELS', () => {
  it('모든 상태에 한 글자 배지가 있다', () => {
    const statuses: GitStatusEntry['status'][] = [
      'modified', 'added', 'deleted', 'renamed', 'copied', 'untracked'
    ]
    for (const status of statuses) {
      expect(STATUS_LABELS[status]).toHaveLength(1)
    }
  })
})
