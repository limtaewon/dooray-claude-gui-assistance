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
  it('추적 여부로만 가른다 — 스테이징으로 가르면 체크할 때마다 파일이 섹션을 옮겨 다닌다', () => {
    const sections = splitIntoSections([
      entry({ path: 'a.ts', area: 'staged' }),
      entry({ path: 'b.ts', area: 'unstaged' }),
      entry({ path: 'c.ts', area: 'untracked', status: 'untracked' })
    ])
    expect(sections.changes.map((e) => e.path)).toEqual(['a.ts', 'b.ts'])
    expect(sections.untracked.map((e) => e.path)).toEqual(['c.ts'])
  })

  it('한 파일이 staged·unstaged 양쪽에 걸리면 한 줄로 합친다', () => {
    const sections = splitIntoSections([
      entry({ path: 'a.ts', area: 'staged', added: 10, removed: 2 }),
      entry({ path: 'a.ts', area: 'unstaged', added: 3, removed: 1 })
    ])
    expect(sections.changes).toHaveLength(1)
    expect(sections.changes[0]).toMatchObject({ added: 13, removed: 3 })
  })

  it('새로 추가된 파일이라는 사실이 우선한다', () => {
    const sections = splitIntoSections([
      entry({ path: 'a.ts', area: 'staged', status: 'added' }),
      entry({ path: 'a.ts', area: 'unstaged', status: 'modified' })
    ])
    expect(sections.changes[0].status).toBe('added')
  })

  it('충돌은 따로 뺀다', () => {
    const sections = splitIntoSections([
      entry({ path: 'x.ts', area: 'staged', conflictKind: 'both_added' })
    ])
    expect(sections.conflicts).toHaveLength(1)
    expect(sections.changes).toHaveLength(0)
  })

  it('빈 입력', () => {
    expect(splitIntoSections([])).toEqual({ changes: [], untracked: [], conflicts: [] })
  })
})

describe('entryKey', () => {
  it('합쳐진 뒤에는 경로가 곧 한 줄이다', () => {
    expect(entryKey(entry({ path: 'src/a.ts' }))).toBe('src/a.ts')
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
