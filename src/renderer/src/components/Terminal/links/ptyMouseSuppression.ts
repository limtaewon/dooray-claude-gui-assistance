/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/src/components/terminal-pane/terminal-link-pty-mouse-suppression.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: Orca 원본은 xterm 6.1-beta 패치 세트가 추가한 `terminal.options.mouseEventsRequireAlt`
 * (stable xterm 에는 없는 옵션 — `@xterm/xterm@5.5.0` 번들을 grep 해서 부재를 확인했다)를 토글해
 * PTY 로의 마우스 리포팅 자체를 억제한다. Clauday 는 xterm 을 패치하지 않으므로(ADR 제약) 대신
 * **DOM 이벤트 전파를 끊는** 방식으로 같은 목표를 달성한다.
 *
 * 끊는 자리가 중요하다 — xterm 5.5 의 DOM 구조(`terminal.element` > `.xterm-screen` > 클릭 대상):
 *  - 링크 감지기(Linkifier)는 `.xterm-screen` 에 mousedown/mouseup 을 붙인다. mousedown 에서 "누른 링크" 를
 *    기억하고 mouseup 에서 같은 링크일 때만 activate 한다 — **mousedown 이 닿아야 링크가 열린다**.
 *  - PTY 마우스 리포팅·선택은 `terminal.element` 에 붙는다.
 * 그래서 `.xterm-screen` 에 **버블 단계**로 붙여, 먼저 등록된 Linkifier 가 mousedown 을 받은 뒤
 * `terminal.element` 로 올라가지 못하게 막는다. (예전엔 `terminal.element` 캡처 단계에서 막아 Linkifier 까지
 * 못 받아, Claude Code 처럼 마우스 리포팅을 켠 TUI 위에서 ⌘클릭이 툴팁만 뜨고 열리지 않았다 — 2026-10-13 B1.)
 * mouseup 은 막지 않는다 — activate 판정이 거기서 일어난다.
 */

import type { IDisposable, Terminal } from '@xterm/xterm'
import { isHttpLinkActivationEvent } from './linkActivation'

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
  const screenElement = terminal.element?.querySelector<HTMLElement>('.xterm-screen') ?? terminal.element
  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || !isHttpLinkActivationEvent(event) || !shouldSuppressMouseEvent(event)) return
    event.stopPropagation()
  }
  screenElement?.addEventListener('mousedown', handleMouseDown)
  return {
    dispose: () => screenElement?.removeEventListener('mousedown', handleMouseDown)
  }
}
