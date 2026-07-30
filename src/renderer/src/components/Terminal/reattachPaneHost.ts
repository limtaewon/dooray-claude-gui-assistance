/**
 * leaf host div 를 새 슬롯으로 옮기는 안무 — split/close 로 트리 모양이 바뀌면 SplitLayout 의
 * leaf 슬롯 div 자체가 새로 생기므로, 그 안에 들어있던 xterm host 를 옮겨줘야 한다
 * (ADR-v2-terminal-p2-02 §4). 순서 고정: scrollState 캡처 → (B-6) WebGL dispose → appendChild →
 * rAF → (B-6) WebGL attach → fit → scrollState 복원.
 *
 * B-4 단계에서는 WebGL 훅이 없다 — B-6(ADR-v2-terminal-p2-04)에서 disposeWebgl/attachWebgl 을 채운다.
 */
import type { TerminalPaneHandle } from './TerminalPane'

export interface WebglRepaintHooks {
  disposeWebgl?: () => void
  attachWebgl?: () => void
}

/** host 가 이미 slot 의 자식이면 아무 것도 하지 않는다(불필요한 재부착 방지). */
export function reattachPaneHost(
  host: HTMLDivElement,
  slot: HTMLDivElement,
  handle: TerminalPaneHandle | null | undefined,
  hooks: WebglRepaintHooks = {}
): void {
  if (host.parentElement === slot) return
  const scroll = handle?.captureScrollState() ?? null
  hooks.disposeWebgl?.()
  slot.appendChild(host)
  requestAnimationFrame(() => {
    hooks.attachWebgl?.()
    handle?.fit()
    handle?.restoreScrollState(scroll)
  })
}

/** leafId 당 한 번만 생성되는 host div — xterm 이 이 안에서 open() 된다(portal attach 대상). */
export function createPaneHost(): HTMLDivElement {
  const host = document.createElement('div')
  host.style.position = 'absolute'
  host.style.inset = '0'
  host.style.width = '100%'
  host.style.height = '100%'
  return host
}
