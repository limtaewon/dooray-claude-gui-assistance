import { describe, it, expect } from 'vitest'
import { diffTabId, type DiffRequest } from './DiffView'

function request(patch: Partial<DiffRequest> = {}): DiffRequest {
  return { repoPath: '/repo', path: 'src/a.ts', source: { kind: 'unstaged' }, ...patch }
}

describe('diffTabId', () => {
  it('같은 파일·같은 비교 대상이면 같은 id — 목록을 훑어도 탭이 쌓이지 않는다', () => {
    expect(diffTabId(request())).toBe(diffTabId(request()))
    // caption 은 표시용이라 id 에 영향을 주지 않는다
    expect(diffTabId(request({ caption: '스테이징됨' }))).toBe(diffTabId(request()))
  })

  it('staged 와 unstaged 는 다른 탭이다 — 같은 파일이라도 비교 대상이 다르다', () => {
    expect(diffTabId(request({ source: { kind: 'staged' } }))).not.toBe(
      diffTabId(request({ source: { kind: 'unstaged' } }))
    )
  })

  it('커밋이 다르면 다른 탭이다', () => {
    const a = diffTabId(request({ source: { kind: 'commit', commitOid: 'a'.repeat(40) } }))
    const b = diffTabId(request({ source: { kind: 'commit', commitOid: 'b'.repeat(40) } }))
    expect(a).not.toBe(b)
  })

  it('같은 커밋의 같은 파일이면 parentOid 가 달라도 같은 탭 — 부모는 파생값이다', () => {
    const withParent = diffTabId(
      request({ source: { kind: 'commit', commitOid: 'a'.repeat(40), parentOid: 'b'.repeat(40) } })
    )
    const withoutParent = diffTabId(request({ source: { kind: 'commit', commitOid: 'a'.repeat(40) } }))
    expect(withParent).toBe(withoutParent)
  })

  it('저장소가 다르면 다른 탭이다 — 워크트리 병렬 작업에서 같은 경로가 겹친다', () => {
    expect(diffTabId(request({ repoPath: '/repo-a' }))).not.toBe(
      diffTabId(request({ repoPath: '/repo-b' }))
    )
  })

  it('경로가 다르면 다른 탭이다', () => {
    expect(diffTabId(request({ path: 'src/a.ts' }))).not.toBe(diffTabId(request({ path: 'src/b.ts' })))
  })

  it('터미널 탭 id(UUID)와 충돌하지 않게 접두사를 갖는다', () => {
    expect(diffTabId(request()).startsWith('diff ')).toBe(true)
  })
})
