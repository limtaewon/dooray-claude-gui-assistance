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

  /**
   * v2.0 B-5 보강 — 스냅샷 저장→복원 왕복 property 테스트(트리 불변식·leafId 매핑).
   * `TerminalTabSnapshot.tree`/`panes` 는 electron-store(JSON) 를 거쳐 왕복하므로, 무작위로
   * 만들어진 트리도 ①구조가 그대로 보존되고 ②collectLeafIds 와 panes 키 집합이 항상 정확히
   * 일치해야 한다(ADR-v2-terminal-p2-03 §1/§7). 결정론적 시드 PRNG 로 CI 재현성을 보장한다.
   */
  describe('저장→복원 왕복 불변식 (property)', () => {
    // mulberry32 — 외부 의존 없는 결정론적 PRNG. 시드가 같으면 항상 같은 트리가 나온다.
    function mulberry32(seed: number): () => number {
      let a = seed
      return () => {
        a |= 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }

    /** splitLeaf/closeLeaf 를 무작위로 섞어 트리를 만든다 — 항상 leaf 1개 이상 유지. */
    function buildRandomTree(rng: () => number, steps: number): SplitNode {
      let tree: SplitNode = leaf('leaf-0')
      let nextId = 1
      for (let i = 0; i < steps; i++) {
        const ids = collectLeafIds(tree)
        const targetId = ids[Math.floor(rng() * ids.length)]
        const shouldClose = ids.length > 1 && rng() < 0.3
        if (shouldClose) {
          const next = closeLeaf(tree, targetId)
          if (next) tree = next
          continue
        }
        const direction = rng() < 0.5 ? 'row' : 'column'
        tree = splitLeaf(tree, targetId, direction, `leaf-${nextId++}`)
      }
      return tree
    }

    /** TerminalView.collectSnapshot() 이 하는 것과 동일한 조립 — leaf 마다 pane 스냅샷 1개. */
    function buildPanesForTree(tree: SplitNode): Record<string, { cols: number; rows: number; serialized: string }> {
      const panes: Record<string, { cols: number; rows: number; serialized: string }> = {}
      for (const id of collectLeafIds(tree)) panes[id] = { cols: 80, rows: 24, serialized: `output-${id}` }
      return panes
    }

    // 15 스텝에서 깊이(≤8) 초과가 관측되지 않은 시드만 선택(스크립트로 사전 검증, 결정론적 고정값).
    const seeds = [1, 7, 42, 1234, 99999]

    it.each(seeds)('시드 %i — 무작위 split/close 시퀀스 뒤에도 트리 불변식(유효성·leafId 유일성)이 유지된다', (seed) => {
      const tree = buildRandomTree(mulberry32(seed), 15)
      expect(isValidTree(tree)).toBe(true)
      const ids = collectLeafIds(tree)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it.each(seeds)('시드 %i — JSON 왕복(스냅샷 저장 경로 시뮬레이션) 후에도 트리가 구조적으로 완전히 동일하다', (seed) => {
      const tree = buildRandomTree(mulberry32(seed), 15)
      const roundTripped = JSON.parse(JSON.stringify(tree)) as SplitNode
      expect(roundTripped).toEqual(tree)
      expect(collectLeafIds(roundTripped)).toEqual(collectLeafIds(tree))
      expect(isValidTree(roundTripped)).toBe(true)
    })

    it.each(seeds)('시드 %i — leafId 매핑: panes 레코드 키 집합이 왕복 전후 트리의 leaf 집합과 정확히 일치한다', (seed) => {
      const tree = buildRandomTree(mulberry32(seed), 15)
      const panes = buildPanesForTree(tree)

      const roundTrippedTree = JSON.parse(JSON.stringify(tree)) as SplitNode
      const roundTrippedPanes = JSON.parse(JSON.stringify(panes)) as typeof panes

      // orphan pane(트리에 없는 leafId) 도, 빠진 leaf(panes 에 없는 leafId) 도 없다.
      expect(Object.keys(roundTrippedPanes).sort()).toEqual(collectLeafIds(roundTrippedTree).sort())
    })

    it('닫기(closeLeaf) 를 반복해 단일 leaf 로 수렴해도 마지막까지 유효한 트리를 유지한다', () => {
      let tree = buildRandomTree(mulberry32(2024), 12)
      let ids = collectLeafIds(tree)
      while (ids.length > 1) {
        const next = closeLeaf(tree, ids[0])
        expect(next).not.toBeNull()
        tree = next!
        expect(isValidTree(tree)).toBe(true)
        ids = collectLeafIds(tree)
      }
      expect(tree.type).toBe('leaf')
    })
  })
})
