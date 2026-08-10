/**
 * 글리프 아틀라스 캐시를 살아 있는 모든 pane 에 한꺼번에 비운다.
 *
 * Why: `@xterm/addon-webgl` 의 `TextureAtlas` 는 글꼴·크기·테마 설정이 같은 Terminal 끼리
 * 하나를 나눠 쓴다(CharAtlasCache.acquireTextureAtlas). Clauday 는 글꼴·테마가 전역 설정이라
 * 한 탭의 pane 들이 항상 같은 아틀라스를 공유한다. 그런데 `Terminal.clearTextureAtlas()` 는
 * 공유 아틀라스를 통째로 비우면서 **자기 렌더 모델만** 다시 그린다 — 나머지 pane 은 이미 확정한
 * 옛 UV 좌표로 비워진 아틀라스를 샘플링해 글자가 조각나거나 빈칸으로 남는다(split 다중 pane 깨짐).
 * 그래서 캐시 비우기는 반드시 전체 pane 에 브로드캐스트한다.
 */

/** 아틀라스 비우기 대상 — xterm `Terminal` 중 이 스킬만 쓴다(DOM 렌더러에는 없어 optional). */
export interface GlyphCacheTarget {
  clearTextureAtlas?: () => void
}

const livePanes = new Set<GlyphCacheTarget>()

/** pane 마운트 시 등록하고, 돌려받은 함수를 언마운트에서 호출해 해제한다. */
export function registerGlyphCacheTarget(target: GlyphCacheTarget): () => void {
  livePanes.add(target)
  return () => {
    livePanes.delete(target)
  }
}

/**
 * 등록된 모든 pane 의 글리프 아틀라스를 비우고 전체 화면을 다시 그리게 한다.
 * 실제 아틀라스 비우기는 첫 호출에서 끝나고, 나머지 호출은 각 pane 의 렌더 모델을 무효화하는
 * 역할이다 — 그래야 옛 UV 로 그려진 잔상이 남지 않는다. 한 pane 이 throw 해도 나머지는 진행한다.
 */
export function clearGlyphCacheAllPanes(): void {
  for (const pane of livePanes) {
    try {
      pane.clearTextureAtlas?.()
    } catch {
      /* DOM 렌더러 등 API 가 없거나 이미 dispose 된 pane — 나머지 pane 처리를 막지 않는다 */
    }
  }
}

/** 테스트 격리 전용 — 등록된 pane 을 모두 비운다. */
export function resetGlyphCacheRegistry(): void {
  livePanes.clear()
}

/** 테스트/진단용 — 현재 등록된 pane 수. */
export function glyphCacheTargetCount(): number {
  return livePanes.size
}
