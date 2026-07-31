/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/src/components/terminal-pane/terminal-linkifier-click-priming.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: `isTerminalLinkActivation` import 를 Clauday 의 `linkActivation.ts` 로 교체한 것 외
 * 로직은 원본과 동일하다.
 */

import type { IDisposable, Terminal } from '@xterm/xterm'
import { isLinkActivationEvent } from './linkActivation'

const CAPTURE_LISTENER_OPTIONS = { capture: true } as const

interface LinkifierClickPrimer {
  _activeLine?: number
  _currentLink?: unknown
  _handleMouseMove?: (event: MouseEvent) => void
  _lastBufferCell?: unknown
}

interface TerminalCoreWithLinkifier {
  _core?: { linkifier?: LinkifierClickPrimer }
}

function primeTerminalLinkifier(terminal: Terminal, event: MouseEvent): void {
  try {
    const linkifier = (terminal as unknown as TerminalCoreWithLinkifier)._core?.linkifier
    if (!linkifier || typeof linkifier._handleMouseMove !== 'function') return
    if (!linkifier._currentLink) {
      if ('_lastBufferCell' in linkifier) linkifier._lastBufferCell = undefined
      if ('_activeLine' in linkifier) linkifier._activeLine = -1
    }
    linkifier._handleMouseMove(event)
  } catch {
    /* xterm 내부 구조가 바뀌었어도 hover 는 이후 클릭을 정상적으로 프라이밍한다 */
  }
}

/**
 * 커서가 멈춰 있는 자리에 새 링크가 그려지면(마우스 이동 없이) xterm 이 hover 상태를 갱신하지
 * 않아 첫 클릭이 씹히는 문제를 보정한다 — mousedown 캡처 시 강제로 linkifier 의 mousemove 핸들러를
 * 한 번 불러 상태를 프라이밍한다 (Cmd+클릭 3버그 모듈 ①).
 */
export function installTerminalLinkifierClickPriming(terminal: Terminal): IDisposable {
  const terminalElement = terminal.element
  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || !isLinkActivationEvent(event)) return
    primeTerminalLinkifier(terminal, event)
  }
  terminalElement?.addEventListener('mousedown', handleMouseDown, CAPTURE_LISTENER_OPTIONS)
  return {
    dispose: () => terminalElement?.removeEventListener('mousedown', handleMouseDown, CAPTURE_LISTENER_OPTIONS)
  }
}
