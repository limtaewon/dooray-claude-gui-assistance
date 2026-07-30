/**
 * 앱 재시작 후 복원 시 터미널이 깨져 보이는 문제 방지용 sanitizer.
 *
 * Why: pty 의 raw 출력에는 (a) TUI 앱(vim/htop/claude TUI)이 alternate screen
 * 으로 들어갔다 나오면서 누적한 화면 redraw, (b) 청크 경계에서 끊긴 미완성
 * ANSI escape sequence 가 섞여있다. 그대로 xterm.write 하면 화면이 난잡하다.
 *
 * 전략:
 *  1) alternate-screen exit (`\x1b[?1049l` / `?47l` / `?1047l`) 이 있으면 마지막
 *     exit 이후 출력만 남긴다 — TUI 가 끝난 시점 이후의 정상 셸 출력만 복원.
 *  2) 끝부분이 미완성 ESC 시퀀스로 잘렸으면 그 부분만 잘라낸다.
 *
 * `snapshotStore.migrateLegacySessions()`(v2 마이그레이션 1회 읽기 경로)가 유일한 소비처다
 * (ADR-v2-terminal-p2-03 §10 — 원래는 TerminalManager 내부 private 함수였으나 마이그레이션
 * 전용으로 분리했다. 레거시 export 경로는 M-A-4 에서 정리되어 이 함수만 남았다).
 */
export function sanitizeForRestore(raw: string): string {
  const altExit = /\x1b\[\?(?:1049|47|1047)l/g
  let lastEnd = -1
  let m: RegExpExecArray | null
  while ((m = altExit.exec(raw)) !== null) lastEnd = m.index + m[0].length
  let out = lastEnd >= 0 ? raw.slice(lastEnd) : raw

  const lastEsc = out.lastIndexOf('\x1b')
  if (lastEsc >= 0) {
    const trail = out.slice(lastEsc)
    // 정상 종결: CSI/SGR 등은 `@`-`~` (0x40-0x7E) 로 끝, OSC 는 BEL(\x07) 또는 ST 로 끝.
    const finalized = /[\x40-\x7E]/.test(trail.slice(2)) || trail.includes('\x07')
    if (!finalized) out = out.slice(0, lastEsc)
  }
  return out
}
