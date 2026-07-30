/*
 * Portions adapted from Orca (https://github.com/stablyai/orca)
 * Original: src/renderer/terminal/replay-guard.ts, terminal-snapshot-replay-paint.ts (v1.4.162)
 * Copyright (c) 2026 Lovecast Inc. — MIT License
 * See THIRD-PARTY-NOTICES.md
 *
 * 변경: 두 파일의 책임(자동 응답 억제 + 모드 리셋 상수)을 Clauday 의 단일 replay.ts 로 병합.
 * Orca 소스에 직접 접근하지 못해 docs/dev/orca-absorption-notes.md §3/§9 가 서술한 동작 스펙대로
 * 재구현했다 — 완료 판정을 write 콜백 기준으로 하는 것을 포함.
 */

/**
 * 복원 순서 14단계 (ADR-v2-terminal-p2-03 §7) — 순서가 곧 계약이다. 이 상수 주석을 벗어난 순서로
 * 구현하면 함정 #1(fit 을 write 보다 먼저 하면 soft-wrap 재랩)·#2(replay 중 xterm 자동 응답 유출)가
 * 재발한다.
 *
 *  1. new Terminal({ cols: snap.cols, rows: snap.rows })
 *  2. registerLinkProvider guard monkey-patch      (ADR-05, loadAddon 전 — B-7 에서 채워짐)
 *  3. loadAddon(fit / search / serialize / unicode11 / webgl)
 *  4. terminal.open(container)
 *  5. unicode provider 활성화                      ← 모든 write 보다 먼저 (함정 #7)
 *  6. onOutput 구독 시작 — replay 중 도착분은 큐에 적재
 *  7. replayGuard.on()                             ← onData → PTY 송신 차단 (함정 #2)
 *  8. terminal.resize(snap.cols, snap.rows)        ← fit 보다 먼저 (함정 #1)
 *  9. write(REPLAY_CLEAR)                          클리어
 * 10. write(snap.serialized, callback)             파싱 완료를 콜백으로 대기
 * 11. write(POST_REPLAY_MODE_RESET + '\r\n')       모드 리셋 + PROMPT_EOL_MARK 방지
 * 12. replayGuard.off()
 * 13. fit() → window.api.terminal.resize(fitted)
 * 14. 큐잉된 라이브 출력 flush → 이후 직접 write
 */
export const REPLAY_ORDER_NOTE = 'ADR-v2-terminal-p2-03 §7 — 순서 상수 주석 참조'

/** 복원 write 직전 화면 클리어 — 스크롤백은 보존하고 화면만 지운다. */
export const REPLAY_CLEAR = '\x1b[2J\x1b[3J\x1b[H'

/**
 * 복원 write 직후 모드를 리셋한다 — 스냅샷에 커서 스타일/kitty keyboard/마우스 리포팅/bracketed
 * paste 가 켜진 채로 저장돼 있으면 새 셸 프롬프트가 그 모드를 물려받아 오동작한다.
 *  - `\x1b[0 q`               DECSCUSR: 커서 스타일 → 기본값
 *  - `\x1b[?1000l...?1015l`   마우스 리포팅 전 모드 해제
 *  - `\x1b[?2004l`            bracketed paste 해제
 *  - `\x1b[<u`                kitty keyboard protocol 스택 pop(progressive enhancement 해제)
 */
export const POST_REPLAY_MODE_RESET =
  '\x1b[0 q' +
  '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l' +
  '\x1b[?2004l' +
  '\x1b[<u'

export interface ReplayGuard {
  on(): void
  off(): void
  readonly active: boolean
}

/**
 * replay 구간 동안 xterm 의 자동 쿼리 응답(DA1/CPR 등)이 PTY 로 새는 것을 막는다 (함정 #2).
 * `terminal.onData` 콜백에서 `guard.active` 를 확인해 활성 구간의 데이터를 버려야 한다 —
 * 완료 판정은 반드시 write 콜백 기준(REPLAY_ORDER_NOTE 10~12단계)으로 off() 를 호출한다.
 */
export function createReplayGuard(): ReplayGuard {
  let active = false
  return {
    on(): void { active = true },
    off(): void { active = false },
    get active(): boolean { return active }
  }
}
