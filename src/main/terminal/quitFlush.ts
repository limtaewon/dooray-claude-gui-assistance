export interface QuitFlushCoordinatorOptions {
  /** before-quit 시점에 살아있는 창이 있는지 — 있으면 렌더러 응답을 기다리고, 없으면 즉시 캐시 경로. */
  hasLiveWindow: () => boolean
  /** TERMINAL_REQUEST_STATE push — 렌더러에 flush 요청 (창이 있을 때만 호출됨). */
  requestFlush: () => void
  /** 캐시(메모리에 남은 마지막 스냅샷)로 최종 저장을 수행한다. shouldPersistSnapshot 게이트는 호출부(snapshotStore) 책임. */
  persist: () => void
  /** 실제 종료 트리거. `preventDefault` 로 미뤄둔 종료를 재개한다. */
  quit: () => void
  /** 렌더러 응답 대기 타임아웃 (ms). 기본 700. */
  timeoutMs?: number
  /** 테스트 주입용 시계 — 로그 타임스탬프 용도 (로직에는 영향 없음). */
  now?: () => number
}

export interface QuitFlushCoordinator {
  /** app 의 'before-quit' 핸들러에서 호출한다. 재진입(2회차)은 무시 — preventDefault 를 다시 걸지 않는다. */
  onBeforeQuit(event: { preventDefault: () => void }): void
  /** TERMINAL_SAVE_STATE 핸들러가 저장을 마친 뒤 호출한다. 대기 중인 타이머가 있으면 취소하고 즉시 종료한다. */
  onSnapshotArrived(): void
  readonly done: boolean
}

/**
 * before-quit 700ms 핸드셰이크 — 렌더러에 스냅샷 flush 를 요청하고, 응답이 오거나 타임아웃되면
 * 종료를 재개한다. 창이 이미 없으면(darwin 에서 창 닫고 나중에 ⌘Q) 대기 없이 캐시로 저장한다
 * (ADR-v2-terminal-p2-03 §4).
 */
export function createQuitFlushCoordinator(opts: QuitFlushCoordinatorOptions): QuitFlushCoordinator {
  const timeoutMs = opts.timeoutMs ?? 700
  const now = opts.now ?? Date.now

  let done = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let awaitingFlush = false

  function finish(reason: 'response' | 'timeout'): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    awaitingFlush = false
    if (done) return
    done = true
    if (reason === 'timeout') {
      console.warn('[quitFlush] before-quit 응답 없음 — 캐시로 저장', { waitedMs: timeoutMs, at: now() })
      opts.persist()
    }
    opts.quit()
  }

  return {
    onBeforeQuit(event) {
      if (done) return // 2회차 재진입 — preventDefault 하지 않고 통과시켜 실제 종료를 허용한다.

      if (!opts.hasLiveWindow()) {
        opts.persist()
        done = true
        return
      }

      event.preventDefault()
      awaitingFlush = true
      opts.requestFlush()
      timer = setTimeout(() => finish('timeout'), timeoutMs)
    },
    onSnapshotArrived() {
      if (!awaitingFlush) return // 평상시 저장(quit 무관) — 종료 시퀀스에 영향 주지 않는다.
      finish('response')
    },
    get done() {
      return done
    }
  }
}
