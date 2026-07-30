/**
 * splitTree 순수 함수 회귀 테스트 (v2.0 B-4, ADR-v2-terminal-p2-02).
 */
import { describe, it, expect } from 'vitest'
import {
  splitLeaf,
  closeLeaf,
  findLeafPath,
  collectLeafIds,
  setRatioAtPath,
  quantizeRatio,
  getEqualizeWeight,
  equalizeRatios,
  neighborLeaf,
  isValidTree
} from './splitTree'
import type { SplitLeaf, SplitNode } from '@shared/types/terminal'

function leaf(leafId: string): SplitLeaf {
  return { type: 'leaf', leafId }
}

describe('splitTree', () => {
  describe('findLeafPath', () => {
    it('루트 자신이 대상이면 빈 경로', () => {
      expect(findLeafPath(leaf('a'), 'a')).toEqual([])
    })
    it('중첩된 leaf 경로를 찾는다', () => {
      const tree: SplitNode = {
        type: 'split', direction: 'row',
        first: leaf('a'),
        second: { type: 'split', direction: 'column', first: leaf('b'), second: leaf('c') }
      }
      expect(findLeafPath(tree, 'c')).toEqual(['second', 'second'])
    })
    it('없는 leafId 는 null', () => {
      expect(findLeafPath(leaf('a'), 'z')).toBeNull()
    })
  })

  describe('splitLeaf', () => {
    it('단일 leaf 를 분기로 치환 — 기존 leaf 는 first, 새 leaf 는 second', () => {
      const tree = leaf('a')
      const next = splitLeaf(tree, 'a', 'row', 'b')
      expect(next).toEqual({ type: 'split', direction: 'row', first: leaf('a'), second: leaf('b') })
    })
    it('중첩 트리 안의 leaf 를 분할해도 형제는 그대로', () => {
      const tree: SplitNode = { type: 'split', direction: 'row', first: leaf('a'), second: leaf('b') }
      const next = splitLeaf(tree, 'b', 'column', 'c')
      expect(next).toEqual({
        type: 'split', direction: 'row',
        first: leaf('a'),
        second: { type: 'split', direction: 'column', first: leaf('b'), second: leaf('c') }
      })
    })
    it('대상 leafId 를 못 찾으면 원본 참조를 그대로 반환한다', () => {
      const tree = leaf('a')
      expect(splitLeaf(tree, 'nope', 'row', 'b')).toBe(tree)
    })
    it('입력 트리를 변형하지 않는다', () => {
      const tree: SplitNode = { type: 'split', direction: 'row', first: leaf('a'), second: leaf('b') }
      const snapshot = JSON.parse(JSON.stringify(tree))
      splitLeaf(tree, 'a', 'column', 'c')
      expect(tree).toEqual(snapshot)
    })
  })

  describe('closeLeaf', () => {
    it('트리 전체가 대상 leaf 하나뿐이면 null', () => {
      expect(closeLeaf(leaf('a'), 'a')).toBeNull()
    })
    it('2분할에서 하나를 닫으면 형제가 승격된다', () => {
      const tree: SplitNode = { type: 'split', direction: 'row', first: leaf('a'), second: leaf('b') }
      expect(closeLeaf(tree, 'a')).toEqual(leaf('b'))
      expect(closeLeaf(tree, 'b')).toEqual(leaf('a'))
    })
    it('3분할(중첩)에서 가운데를 닫아도 남은 두 leaf 트리가 보존된다', () => {
      // row(a, column(b, c)) 에서 b 를 닫으면 row(a, c) 가 된다.
      const tree: SplitNode = {
        type: 'split', direction: 'row',
        first: leaf('a'),
        second: { type: 'split', direction: 'column', first: leaf('b'), second: leaf('c') }
      }
      const next = closeLeaf(tree, 'b')
      expect(next).toEqual({ type: 'split', direction: 'row', first: leaf('a'), second: leaf('c') })
      expect(collectLeafIds(next!)).toEqual(['a', 'c'])
    })
    it('없는 leafId 를 닫으려 하면 원본 참조를 그대로 반환한다', () => {
      const tree: SplitNode = { type: 'split', direction: 'row', first: leaf('a'), second: leaf('b') }
      expect(closeLeaf(tree, 'nope')).toBe(tree)
    })
    it('입력 트리를 변형하지 않는다', () => {
      const tree: SplitNode = {
        type: 'split', direction: 'row',
        first: leaf('a'),
        second: { type: 'split', direction: 'column', first: leaf('b'), second: leaf('c') }
      }
      const snapshot = JSON.parse(JSON.stringify(tree))
      closeLeaf(tree, 'b')
      expect(tree).toEqual(snapshot)
    })
  })

  describe('collectLeafIds', () => {
    it('시각적 순서(first → second)로 나열한다', () => {
      const tree: SplitNode = {
        type: 'split', direction: 'row',
        first: leaf('a'),
        second: { type: 'split', direction: 'column', first: leaf('b'), second: leaf('c') }
      }
      expect(collectLeafIds(tree)).toEqual(['a', 'b', 'c'])
    })
  })

  describe('quantizeRatio', () => {
    it('0.5 근방(±0.005)이면 undefined', () => {
      expect(quantizeRatio(0.5)).toBeUndefined()
      expect(quantizeRatio(0.503)).toBeUndefined()
      expect(quantizeRatio(0.497)).toBeUndefined()
    })
    it('그 외에는 소수 3자리로 양자화', () => {
      expect(quantizeRatio(0.6123456)).toBe(0.612)
      expect(quantizeRatio(0.33333)).toBe(0.333)
    })
    it('극단값은 5%~95% 로 clamp', () => {
      expect(quantizeRatio(0.01)).toBe(0.05)
      expect(quantizeRatio(0.99)).toBe(0.95)
    })
  })

  describe('setRatioAtPath', () => {
    it('루트 분기의 ratio 를 바꾼다(빈 경로)', () => {
      const tree: SplitNode = { type: 'split', direction: 'row', first: leaf('a'), second: leaf('b') }
      const next = setRatioAtPath(tree, [], 0.3)
      expect(next).toEqual({ ...tree, ratio: 0.3 })
    })
    it('중첩 경로의 분기 ratio 를 바꾼다', () => {
      const tree: SplitNode = {
        type: 'split', direction: 'row',
        first: leaf('a'),
        second: { type: 'split', direction: 'column', first: leaf('b'), second: leaf('c') }
      }
      const next = setRatioAtPath(tree, ['second'], 0.25) as Extract<SplitNode, { type: 'split' }>
      expect((next.second as Extract<SplitNode, { type: 'split' }>).ratio).toBe(0.25)
      // 건드리지 않은 first 는 참조가 그대로 유지된다.
      expect(next.first).toBe(tree.first)
    })
    it('경로가 분기가 아닌 leaf 를 가리키면 원본을 그대로 반환한다', () => {
      const tree: SplitNode = { type: 'split', direction: 'row', first: leaf('a'), second: leaf('b') }
      expect(setRatioAtPath(tree, ['first'], 0.4)).toBe(tree)
    })
  })

  describe('getEqualizeWeight / equalizeRatios', () => {
    it('leaf 는 가중치 1', () => {
      expect(getEqualizeWeight(leaf('a'))).toBe(1)
    })
    it('3분할 중첩 트리에서 균등 가중치로 ratio 를 재계산한다', () => {
      // row(a, column(b, c)) — a:1, column(b,c):2 → first ratio = 1/3
      const tree: SplitNode = {
        type: 'split', direction: 'row',
        first: leaf('a'),
        second: { type: 'split', direction: 'column', first: leaf('b'), second: leaf('c') }
      }
      const next = equalizeRatios(tree) as Extract<SplitNode, { type: 'split' }>
      expect(next.ratio).toBe(0.333)
      const innerRatio = (next.second as Extract<SplitNode, { type: 'split' }>).ratio
      expect(innerRatio).toBeUndefined() // b:c 는 1:1 이므로 0.5 → 생략
    })
  })

  describe('neighborLeaf', () => {
    // 2x2 그리드: row( column(a,c), column(b,d) ) — 왼쪽 위 a, 왼쪽 아래 c, 오른쪽 위 b, 오른쪽 아래 d
    const grid: SplitNode = {
      type: 'split', direction: 'row',
      first: { type: 'split', direction: 'column', first: leaf('a'), second: leaf('c') },
      second: { type: 'split', direction: 'column', first: leaf('b'), second: leaf('d') }
    }
    it('right — a → b', () => {
      expect(neighborLeaf(grid, 'a', 'right')).toBe('b')
    })
    it('down — a → c', () => {
      expect(neighborLeaf(grid, 'a', 'down')).toBe('c')
    })
    it('left — b → a', () => {
      expect(neighborLeaf(grid, 'b', 'left')).toBe('a')
    })
    it('up — d → b', () => {
      expect(neighborLeaf(grid, 'd', 'up')).toBe('b')
    })
    it('그 방향에 leaf 가 없으면 null', () => {
      expect(neighborLeaf(grid, 'a', 'up')).toBeNull()
    })
    it('존재하지 않는 fromLeafId 면 null', () => {
      expect(neighborLeaf(grid, 'nope', 'right')).toBeNull()
    })
  })

  describe('isValidTree', () => {
    it('정상 트리는 true', () => {
      const tree: SplitNode = { type: 'split', direction: 'row', first: leaf('a'), second: leaf('b') }
      expect(isValidTree(tree)).toBe(true)
    })
    it('단일 leaf 도 true', () => {
      expect(isValidTree(leaf('a'))).toBe(true)
    })
    it('알 수 없는 type', () => {
      expect(isValidTree({ type: 'bogus' } as unknown as SplitNode)).toBe(false)
    })
    it('중복 leafId', () => {
      const tree: SplitNode = { type: 'split', direction: 'row', first: leaf('a'), second: leaf('a') }
      expect(isValidTree(tree)).toBe(false)
    })
    it('범위 밖 ratio', () => {
      const tree: SplitNode = { type: 'split', direction: 'row', first: leaf('a'), second: leaf('b'), ratio: 1.5 }
      expect(isValidTree(tree)).toBe(false)
    })
    it('과도한 깊이(>8)', () => {
      let tree: SplitNode = leaf('leaf-9')
      for (let i = 8; i >= 0; i--) {
        tree = { type: 'split', direction: 'row', first: leaf(`leaf-${i}`), second: tree }
      }
      expect(isValidTree(tree)).toBe(false)
    })
    it('빈 leafId', () => {
      expect(isValidTree(leaf(''))).toBe(false)
    })
  })
})
