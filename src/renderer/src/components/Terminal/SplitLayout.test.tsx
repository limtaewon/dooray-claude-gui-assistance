/**
 * SplitLayout 회귀 테스트 (v2.0 B-4).
 *
 * 핵심 검증: 트리 모양이 바뀌어도(split/close) leaf 의 host div 가 "동일 노드 참조"로
 * DOM 에 남는다 — React 재조정으로 xterm 이 리마운트되지 않는다는 기계적 증거
 * (ADR-v2-terminal-p2-02 §4, plan.md B-4 Gate 2, 함정 #8).
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import SplitLayout from './SplitLayout'
import type { SplitNode } from '@shared/types/terminal'

function makeHostRegistry(): { getHost: (leafId: string) => HTMLDivElement } {
  const hosts = new Map<string, HTMLDivElement>()
  const getHost = (leafId: string): HTMLDivElement => {
    let h = hosts.get(leafId)
    if (!h) {
      h = document.createElement('div')
      hosts.set(leafId, h)
    }
    return h
  }
  return { getHost }
}

describe('SplitLayout', () => {
  it('단일 leaf 트리는 host div 를 슬롯에 붙인다', () => {
    const { getHost } = makeHostRegistry()
    const tree: SplitNode = { type: 'leaf', leafId: 'a' }
    const { container } = render(
      <SplitLayout tree={tree} getHost={getHost} getHandle={() => null} onRatioCommit={() => {}} />
    )
    expect(container.contains(getHost('a'))).toBe(true)
  })

  it('2분할 트리는 두 leaf 의 host 를 각자 슬롯에 붙인다', () => {
    const { getHost } = makeHostRegistry()
    const tree: SplitNode = {
      type: 'split', direction: 'row',
      first: { type: 'leaf', leafId: 'a' },
      second: { type: 'leaf', leafId: 'b' }
    }
    const { container } = render(
      <SplitLayout tree={tree} getHost={getHost} getHandle={() => null} onRatioCommit={() => {}} />
    )
    expect(container.contains(getHost('a'))).toBe(true)
    expect(container.contains(getHost('b'))).toBe(true)
  })

  it('3분할 → 가운데 leaf 닫기 후에도 남은 두 pane 의 host div 가 동일 참조로 유지된다', () => {
    const { getHost } = makeHostRegistry()
    const before: SplitNode = {
      type: 'split', direction: 'row',
      first: { type: 'leaf', leafId: 'a' },
      second: {
        type: 'split', direction: 'column',
        first: { type: 'leaf', leafId: 'b' },
        second: { type: 'leaf', leafId: 'c' }
      }
    }
    const hostA = getHost('a')
    const hostC = getHost('c')

    const { rerender, container } = render(
      <SplitLayout tree={before} getHost={getHost} getHandle={() => null} onRatioCommit={() => {}} />
    )
    expect(container.contains(hostA)).toBe(true)
    expect(container.contains(hostC)).toBe(true)

    // b 를 닫음 → row(a, c). 트리 형태가 바뀌어 slot div 자체는 새로 생기지만 host 는 이사만 한다.
    const after: SplitNode = {
      type: 'split', direction: 'row',
      first: { type: 'leaf', leafId: 'a' },
      second: { type: 'leaf', leafId: 'c' }
    }
    rerender(<SplitLayout tree={after} getHost={getHost} getHandle={() => null} onRatioCommit={() => {}} />)

    expect(getHost('a')).toBe(hostA)
    expect(getHost('c')).toBe(hostC)
    expect(container.contains(hostA)).toBe(true)
    expect(container.contains(hostC)).toBe(true)
  })

  it('더블클릭하면 ratio undefined(50/50)로 커밋된다', () => {
    const { getHost } = makeHostRegistry()
    const tree: SplitNode = {
      type: 'split', direction: 'row',
      first: { type: 'leaf', leafId: 'a' },
      second: { type: 'leaf', leafId: 'b' },
      ratio: 0.7
    }
    let committed: [unknown, number | undefined] | null = null
    const { getByRole } = render(
      <SplitLayout
        tree={tree}
        getHost={getHost}
        getHandle={() => null}
        onRatioCommit={(path, ratio) => { committed = [path, ratio] }}
      />
    )
    getByRole('separator').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(committed).toEqual([[], undefined])
  })
})
