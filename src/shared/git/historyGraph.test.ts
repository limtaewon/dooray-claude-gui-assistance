import { describe, it, expect } from 'vitest'
import {
  buildDefaultGitHistoryColorMap,
  buildGitHistoryViewModels,
  getGitHistoryItemLaneIndex,
  getGitHistoryMergeParentLaneIndex
} from './historyGraph'
import type { GitHistoryItem } from './historyTypes'

const oid = (n: string): string => n.repeat(40)

function commit(id: string, parents: string[] = [], refs: string[] = []): GitHistoryItem {
  return {
    id: oid(id),
    parentIds: parents.map(oid),
    subject: `commit ${id}`,
    message: `commit ${id}`,
    references: refs.map((r) => ({ id: r, name: r }))
  }
}

describe('buildGitHistoryViewModels — 레인 전파', () => {
  it('선형 히스토리는 레인 1개를 승계한다', () => {
    const vms = buildGitHistoryViewModels([commit('1', ['2']), commit('2', ['3']), commit('3')])
    expect(vms.map((v) => v.outputSwimlanes.length)).toEqual([1, 1, 0])
    expect(vms.every((v) => getGitHistoryItemLaneIndex(v) === 0)).toBe(true)
    // 직전 행의 output 이 다음 행의 input 이 된다
    expect(vms[1].inputSwimlanes).toEqual(vms[0].outputSwimlanes)
  })

  it('머지 커밋은 두 번째 부모로 새 레인을 연다', () => {
    const vms = buildGitHistoryViewModels([commit('1', ['2', '3']), commit('2', ['4']), commit('3', ['4'])])
    expect(vms[0].outputSwimlanes.map((n) => n.id)).toEqual([oid('2'), oid('3')])
    // 머지 부모 레인 인덱스는 출력 레인에서 찾는다
    expect(getGitHistoryMergeParentLaneIndex(vms[0], oid('3'))).toBe(1)
  })

  it('같은 커밋을 기다리던 레인들은 그 커밋 행에서 하나로 흡수된다 (머지 수렴)', () => {
    const vms = buildGitHistoryViewModels([
      commit('1', ['2', '3']),
      commit('2', ['4']),
      commit('3', ['4']),
      commit('4', ['5'])
    ])
    // 두 갈래가 모두 4를 기다리는 상태로 4번 행에 도달한다
    expect(vms[3].inputSwimlanes.map((n) => n.id)).toEqual([oid('4'), oid('4')])
    // 4를 처리하면서 첫 부모 하나로 합쳐진다
    expect(vms[3].outputSwimlanes.map((n) => n.id)).toEqual([oid('5')])
  })

  it('부모가 없는 root 커밋은 출력 레인을 만들지 않는다', () => {
    const vms = buildGitHistoryViewModels([commit('1')])
    expect(vms[0].outputSwimlanes).toEqual([])
  })

  it('입력 레인에 자기 자신이 없으면 맨 오른쪽에 새 레인을 뚫는다', () => {
    const vms = buildGitHistoryViewModels([commit('1', ['2', '3']), commit('9', ['8'])])
    // 9는 1의 부모가 아니므로 기다리는 레인이 없다
    expect(getGitHistoryItemLaneIndex(vms[1])).toBe(vms[1].inputSwimlanes.length)
  })
})

describe('buildGitHistoryViewModels — 색', () => {
  it('current/remote/base ref 에는 고정색을 준다', () => {
    const colorMap = buildDefaultGitHistoryColorMap({
      currentRef: { id: 'refs/heads/main', name: 'main', revision: oid('1') },
      remoteRef: { id: 'refs/remotes/origin/main', name: 'origin/main', revision: oid('1') },
      baseRef: { id: 'refs/heads/develop', name: 'develop', revision: oid('2') }
    })
    expect(colorMap.get('refs/heads/main')).toBe('git-graph-ref')
    expect(colorMap.get('refs/remotes/origin/main')).toBe('git-graph-remote-ref')
    expect(colorMap.get('refs/heads/develop')).toBe('git-graph-base-ref')
  })

  it('ref 색이 있으면 승계 레인이 그 색을 물려받는다', () => {
    const currentRef = { id: 'refs/heads/main', name: 'main', revision: oid('1') }
    const vms = buildGitHistoryViewModels([commit('1', ['2'], ['refs/heads/main'])], {
      colorMap: buildDefaultGitHistoryColorMap({ currentRef }),
      currentRef
    })
    expect(vms[0].outputSwimlanes[0].color).toBe('git-graph-ref')
  })

  it('ref 색이 없으면 5색을 라운드로빈으로 돈다 (옥토퍼스 머지로 레인 6개를 한 번에 연다)', () => {
    const vms = buildGitHistoryViewModels([commit('1', ['2', '3', '4', '5', '6', '7'])])
    const colors = vms[0].outputSwimlanes.map((n) => n.color)
    expect(colors).toEqual([
      'git-graph-lane-1',
      'git-graph-lane-2',
      'git-graph-lane-3',
      'git-graph-lane-4',
      'git-graph-lane-5',
      'git-graph-lane-1'
    ])
  })

  it('현재 브랜치 커밋을 HEAD 로 표시한다', () => {
    const currentRef = { id: 'refs/heads/main', name: 'main', revision: oid('1') }
    const vms = buildGitHistoryViewModels([commit('1', ['2']), commit('2')], { currentRef })
    expect(vms.map((v) => v.kind)).toEqual(['HEAD', 'node'])
  })

  it('ref 배지는 current → remote → base 순으로 정렬한다', () => {
    const currentRef = { id: 'refs/heads/main', name: 'main', revision: oid('1') }
    const remoteRef = { id: 'refs/remotes/origin/main', name: 'origin/main', revision: oid('1') }
    const vms = buildGitHistoryViewModels(
      [commit('1', ['2'], ['refs/tags/v1', 'refs/remotes/origin/main', 'refs/heads/main'])],
      { currentRef, remoteRef, colorMap: buildDefaultGitHistoryColorMap({ currentRef, remoteRef }) }
    )
    expect(vms[0].historyItem.references?.map((r) => r.id)).toEqual([
      'refs/heads/main',
      'refs/remotes/origin/main',
      'refs/tags/v1'
    ])
  })
})
