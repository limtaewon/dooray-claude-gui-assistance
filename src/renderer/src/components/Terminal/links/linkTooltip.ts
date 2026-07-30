/**
 * 링크 hover 툴팁 — xterm `ILink.hover`/`leave` 는 mousemove 마다 발화하므로 React state 로
 * 다루면 리렌더 폭주가 생긴다. xterm 공식 가이드(`ILink.hover` 문서)대로 `terminal.element` 안에
 * DOM 을 직접 붙이고 `xterm-hover` 클래스를 달아 마우스 이벤트가 아래 링크로 새지 않게 한다.
 */

import type { FilePathLinkTooltip } from './filePathLinkProvider'

const TOOLTIP_OFFSET_PX = 14

/** `container`(pane 루트) 안에 숨겨진 툴팁 엘리먼트를 만들고 show/hide 를 반환한다. */
export function createLinkTooltip(container: HTMLElement): FilePathLinkTooltip {
  const el = document.createElement('div')
  el.className = 'xterm-hover'
  el.style.position = 'fixed'
  el.style.zIndex = '40'
  el.style.pointerEvents = 'none'
  el.style.display = 'none'
  el.style.padding = '3px 8px'
  el.style.borderRadius = '4px'
  el.style.whiteSpace = 'nowrap'
  el.style.background = 'var(--bg-surface-raised)'
  el.style.border = '1px solid var(--bg-border)'
  el.style.color = 'var(--text-primary)'
  el.style.boxShadow = 'var(--elev-2, none)'
  container.appendChild(el)

  return {
    show: (text, event) => {
      el.textContent = text
      el.style.left = `${event.clientX + TOOLTIP_OFFSET_PX}px`
      el.style.top = `${event.clientY + TOOLTIP_OFFSET_PX}px`
      el.style.display = ''
    },
    hide: () => { el.style.display = 'none' }
  }
}
