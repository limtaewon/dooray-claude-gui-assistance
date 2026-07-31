/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/src/components/terminal-pane/terminal-link-pty-mouse-suppression.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: Orca 원본은 xterm 6.1-beta 패치 세트가 추가한 `terminal.options.mouseEventsRequireAlt`
 * (stable xterm 에는 없는 옵션 — `@xterm/xterm@5.5.0` 번들을 grep 해서 부재를 확인했다)를 토글해
 * PTY 로의 마우스 리포팅 자체를 억제한다. Clauday 는 xterm 을 패치하지 않으므로(ADR 제약 —
 * xterm 버전을 올리거나 패치하지 않는다) 그 옵션이 없다 — 대신 **DOM 이벤트 전파를 캡처 단계에서
 * 끊는** 방식으로 같은 목표를 달성한다. xterm 의 마우스 리포팅(CoreMouseService)/선택 리스너는
 * `terminal.element` 의 자식인 뷰포트/스크린 엘리먼트에 버블 단계로 붙는다 — `terminal.element`
 * 에 캡처 단계로 붙인 이 리스너가 그보다 먼저 순회되므로, 억제 대상 mousedown 은
 * `stopPropagation()` 으로 xterm 내부 리스너에 아예 도달하지 못하게 막는다. **mouseup 은 막지
 * 않는다** — xterm 의 링크 activate 판정이 mouseup 에서 일어나므로, 그것까지 막으면 이 모듈이
 * 막으려는 "이중 열림" 대신 오히려 "링크 자체가 안 열림" 회귀가 된다.
 */

import type { IDisposable, Terminal } from '@xterm/xterm'
import { isHttpLinkActivationEvent } from './linkActivation'

const CAPTURE_LISTENER_OPTIONS = { capture: true } as const

/**
 * vim/htop 등 마우스 리포팅을 켠 TUI 위에서 Cmd/Ctrl+클릭하면, xterm 이 같은 클릭을 앱(PTY 마우스
 * 시퀀스)과 링크(activate) 양쪽에 전달해 이중으로 열리는 문제를 막는다 (Cmd+클릭 3버그 모듈 ②).
 * `shouldSuppressMouseEvent` 가 true 를 반환하는 mousedown 만 전파를 끊는다 — 링크 클릭이 아닌
 * 일반 클릭/드래그는 그대로 PTY 로 전달돼야 한다.
 */
export function installTerminalLinkPtyMouseSuppression(
  terminal: Terminal,
  shouldSuppressMouseEvent: (event: MouseEvent) => boolean
): IDisposable {
  const terminalElement = terminal.element
  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || !isHttpLinkActivationEvent(event) || !shouldSuppressMouseEvent(event)) return
    event.stopPropagation()
  }
  terminalElement?.addEventListener('mousedown', handleMouseDown, CAPTURE_LISTENER_OPTIONS)
  return {
    dispose: () => terminalElement?.removeEventListener('mousedown', handleMouseDown, CAPTURE_LISTENER_OPTIONS)
  }
}
