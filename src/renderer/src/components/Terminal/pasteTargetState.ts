/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/terminal/terminal-paste-target-state.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: Orca 의 paneId+leafId+transport+ptyId 4필드를 Clauday 의 탭/트리 모델에 맞춰
 * tabId+leafId+sessionId+generation 로 재구성.
 */

/**
 * 붙여넣기 시작 시점의 타겟 식별자 — 클립보드 read 는 비동기라 완료 시점엔 포커스가
 * 다른 pane 으로 옮겨가 있을 수 있다(ADR-v2-terminal-p2-02 §9). 4필드 모두 일치해야 유효하다.
 */
export interface PasteToken {
  tabId: string
  leafId: string
  sessionId: string
  generation: number
}

/** 붙여넣기 시작 시점의 스냅샷을 그대로 토큰화한다. */
export function beginPaste(current: PasteToken): PasteToken {
  return { ...current }
}

/** await 이후 "지금" 유효한 타겟(current)과 시작 시점 토큰이 4필드 모두 일치할 때만 true. */
export function isPasteTargetValid(token: PasteToken, current: PasteToken | null): boolean {
  if (!current) return false
  return (
    token.tabId === current.tabId &&
    token.leafId === current.leafId &&
    token.sessionId === current.sessionId &&
    token.generation === current.generation
  )
}
