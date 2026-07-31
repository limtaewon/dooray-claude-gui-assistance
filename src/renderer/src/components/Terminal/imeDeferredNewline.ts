/**
 * IME 조합 중 Shift/Alt+Enter 지연 전송.
 *
 * Portions adapted from Orca (https://github.com/stablyai/orca) — MIT License,
 * Copyright (c) 2026 Lovecast Inc. (`terminal-ime-deferred-newline.ts`).
 * Orca 는 패치된 xterm 의 커스텀 조합 이벤트를 쓰지만, 여기서는 stable xterm 5.5 에 맞춰
 * 표준 `compositionend` + 폴백 타이머로 재구현했다.
 *
 * 문제: 한글을 치는 도중(조합 미완료) Shift+Enter 를 누르면 개행이 먼저 PTY 에 도착하고
 * 커밋된 글자가 그 뒤에 붙어, 마지막 글자만 다음 줄로 밀려 내려간다.
 * 해결: 조합이 끝난 뒤(= 글자가 커밋된 뒤)에 개행을 보낸다.
 */

/** compositionend 가 오지 않는 입력기를 위한 안전망 — 이 시간이 지나면 그냥 보낸다. */
export const IME_DEFERRED_NEWLINE_FALLBACK_MS = 200

/** Enter 키 1회를 식별한다. Chromium 이 같은 native 이벤트를 재발행할 때 timeStamp 가 같다. */
export interface EnterIdentity {
  code: string
  timeStamp: number
}

/**
 * 조합이 끝난 뒤 `send` 를 실행한다. 조합 중이 아니면 다음 tick 에 바로 보낸다.
 * xterm 은 compositionend 직후에 커밋 글리프를 flush 하므로 한 tick 미룬다.
 */
export function sendAfterComposition(
  element: HTMLElement | null | undefined,
  send: () => void,
  options?: { fallbackMs?: number }
): void {
  if (!element) {
    window.setTimeout(send, 0)
    return
  }

  const fallbackMs = options?.fallbackMs ?? IME_DEFERRED_NEWLINE_FALLBACK_MS
  let done = false

  const finish = (): void => {
    if (done) return
    done = true
    element.removeEventListener('compositionend', finish)
    window.clearTimeout(fallbackTimer)
    window.setTimeout(send, 0)
  }

  element.addEventListener('compositionend', finish)
  const fallbackTimer = window.setTimeout(finish, fallbackMs)
}

export interface DeferredEnterSender {
  /** 조합 중 Enter — 조합 종료 후 send 를 실행하고, 뒤따를 재발행 Enter 를 흡수할 크레딧을 쌓는다. */
  defer: (enter: EnterIdentity, element: HTMLElement | null | undefined, send: () => void) => void
  /** 이미 지연 처리한 Enter 가 재발행된 것이면 true — 호출부는 무시해야 이중 개행이 안 생긴다. */
  absorb: (enter: EnterIdentity) => boolean
  clear: () => void
}

interface DeferredState {
  inFlight: number
  credits: number
}

/**
 * Chromium 은 조합을 끝내는 Enter 를 `Process`(keyCode 229) 로 한 번, 커밋 후 실제 `Enter` 로
 * 한 번 더 보낸다. 같은 native 이벤트에서 복사되므로 `code + timeStamp` 로 짝을 지어 흡수한다.
 */
export function createDeferredEnterSender(): DeferredEnterSender {
  const byCode = new Map<string, Map<number, DeferredState>>()

  const cleanUp = (enter: EnterIdentity, state: DeferredState): void => {
    if (state.inFlight > 0 || state.credits > 0) return
    const byTime = byCode.get(enter.code)
    byTime?.delete(enter.timeStamp)
    if (byTime?.size === 0) byCode.delete(enter.code)
  }

  /** 짝이 안 맞는 Enter 가 오면 그 코드의 묵은 크레딧을 버린다 — 영구 흡수 방지. */
  const dropCredits = (code: string): void => {
    const byTime = byCode.get(code)
    if (!byTime) return
    for (const [timeStamp, state] of byTime) {
      state.credits = 0
      cleanUp({ code, timeStamp }, state)
    }
  }

  return {
    defer: (enter, element, send) => {
      const byTime = byCode.get(enter.code) ?? new Map<number, DeferredState>()
      const state = byTime.get(enter.timeStamp) ?? { inFlight: 0, credits: 0 }
      state.inFlight += 1
      state.credits += 1
      byTime.set(enter.timeStamp, state)
      byCode.set(enter.code, byTime)

      sendAfterComposition(element, () => {
        state.inFlight -= 1
        cleanUp(enter, state)
        send()
      })
    },
    absorb: (enter) => {
      const state = byCode.get(enter.code)?.get(enter.timeStamp)
      if (!state || state.credits <= 0) {
        dropCredits(enter.code)
        return false
      }
      state.credits -= 1
      cleanUp(enter, state)
      return true
    },
    clear: () => {
      for (const code of [...byCode.keys()]) dropCredits(code)
    }
  }
}

/** 물리 Enter 키인지 — 조합 중에는 `e.key` 가 `Process` 라 code 로만 판별할 수 있다. */
export function isEnterCode(code: string): boolean {
  return code === 'Enter' || code === 'NumpadEnter'
}

/** 멀티라인 개행 조합(Shift+Enter / Alt+Enter)인지. Cmd/Ctrl 조합은 제외. */
export function isMultilineNewlineChord(e: {
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}): boolean {
  if (e.ctrlKey || e.metaKey) return false
  return e.shiftKey || e.altKey
}
