/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/terminal/terminal-serialize-absolute-cursor.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: Orca 소스에 직접 접근하지 못해 docs/dev/orca-absorption-notes.md §3-2 가 서술한 동작
 * 스펙(SerializeAddon 결과 뒤에 절대 CUP 접미를 붙여 상대 커서 복원의 wrap-pending 오차를 바로잡음)을
 * Clauday 의 xterm 5.5 stable API 기준으로 재구현. Orca 원본은 xterm 6.1-beta 대상이라 API 표면이 다르다.
 */

import type { Terminal } from '@xterm/xterm'
import type { SerializeAddon, ISerializeOptions } from '@xterm/addon-serialize'

/** CUP(Cursor Position) — 1-based 행/열로 커서를 절대 이동시킨다. */
function absoluteCup(row: number, col: number): string {
  return `\x1b[${row};${col}H`
}

/**
 * SerializeAddon 결과 뒤에 절대 CUP 시퀀스를 덧붙인다 (ADR-v2-terminal-p2-03 §8, 함정 #3).
 * `SerializeAddon.serialize()` 는 커서를 상대 이동으로 복원하므로 wrap-pending 상태(줄 끝에서
 * 다음 글자를 기다리는 상태)에서 한 칸 어긋난다 — 절대 위치를 명시해 이 오차를 덮어쓴다.
 * 행/열은 `terminal.buffer.active.cursorY/cursorX`(뷰포트 기준, 0-based)를 1-based 로 환산한다.
 */
export function serializeWithAbsoluteCursor(
  terminal: Terminal,
  addon: SerializeAddon,
  options?: ISerializeOptions
): string {
  const base = addon.serialize(options)
  const buf = terminal.buffer.active
  const row = buf.cursorY + 1
  const col = buf.cursorX + 1
  return base + absoluteCup(row, col)
}
