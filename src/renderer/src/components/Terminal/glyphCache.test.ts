/**
 * glyphCache 단위 테스트 — split 다중 pane 글자 깨짐 회귀 게이트.
 *
 * 배경: `@xterm/addon-webgl` 의 TextureAtlas 는 설정이 같은 Terminal 끼리 공유된다
 * (CharAtlasCache.acquireTextureAtlas). `Terminal.clearTextureAtlas()` 는 공유 아틀라스를 비우면서
 * 자기 렌더 모델만 다시 그리므로, 한 pane 만 비우면 나머지 pane 은 옛 UV 좌표로 비워진 아틀라스를
 * 샘플링해 글자가 조각나거나 사라진다. 아래 테스트는 "항상 전체 브로드캐스트" 계약을 고정한다.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerGlyphCacheTarget,
  clearGlyphCacheAllPanes,
  resetGlyphCacheRegistry,
  glyphCacheTargetCount
} from './glyphCache'

interface FakePane {
  calls: number
  clearTextureAtlas: () => void
}

function fakePane(onClear?: () => void): FakePane {
  const pane: FakePane = {
    calls: 0,
    clearTextureAtlas: (): void => {
      pane.calls += 1
      onClear?.()
    }
  }
  return pane
}

describe('glyphCache', () => {
  beforeEach(() => {
    resetGlyphCacheRegistry()
  })

  it('등록된 모든 pane 에 아틀라스 비우기를 브로드캐스트한다', () => {
    const panes = [fakePane(), fakePane(), fakePane()]
    panes.forEach((p) => registerGlyphCacheTarget(p))

    clearGlyphCacheAllPanes()

    // 한 pane 만 비우면 나머지 pane 이 옛 좌표로 그려 글자가 깨진다 — 전부 호출돼야 한다.
    expect(panes.map((p) => p.calls)).toEqual([1, 1, 1])
  })

  it('해제한 pane 에는 더 이상 브로드캐스트하지 않는다', () => {
    const kept = fakePane()
    const removed = fakePane()
    registerGlyphCacheTarget(kept)
    const unregister = registerGlyphCacheTarget(removed)

    unregister()
    clearGlyphCacheAllPanes()

    expect(kept.calls).toBe(1)
    expect(removed.calls).toBe(0)
    expect(glyphCacheTargetCount()).toBe(1)
  })

  it('한 pane 이 throw 해도 나머지 pane 은 계속 비운다', () => {
    const broken = fakePane(() => { throw new Error('이미 dispose 된 pane') })
    const healthy = fakePane()
    registerGlyphCacheTarget(broken)
    registerGlyphCacheTarget(healthy)

    expect(() => clearGlyphCacheAllPanes()).not.toThrow()
    expect(healthy.calls).toBe(1)
  })

  it('clearTextureAtlas 가 없는 대상(DOM 렌더러)도 건너뛰고 진행한다', () => {
    const healthy = fakePane()
    registerGlyphCacheTarget({})
    registerGlyphCacheTarget(healthy)

    expect(() => clearGlyphCacheAllPanes()).not.toThrow()
    expect(healthy.calls).toBe(1)
  })

  it('같은 pane 을 두 번 등록해도 한 번만 호출한다', () => {
    const pane = fakePane()
    registerGlyphCacheTarget(pane)
    registerGlyphCacheTarget(pane)

    clearGlyphCacheAllPanes()

    expect(pane.calls).toBe(1)
    expect(glyphCacheTargetCount()).toBe(1)
  })
})
