import { CalDAVCredentialStore } from './CredentialStore'
import type { UnifiedCalendarService } from './UnifiedCalendarService'

// 3분 — 두레이 quota 와 calendar-query REPORT 부담을 줄임.
// 즉시성이 필요한 경로(CRUD 직후, 수동 새로고침)는 별도로 트리거하므로 polling 은 백업 역할.
const POLL_INTERVAL_MS = 180_000
// 429 한 번 맞으면 다음 N tick 동안 스킵 — 두레이 quota 회복 시간 확보
const BACKOFF_TICKS_ON_429 = 5

/**
 * v1.5 — Incremental Sync Poller.
 * 주기적으로 etag diff 만 fetch → 변경된 ICS 만 ObjectsStore 에 반영 → renderer 알림.
 * (이전 CTagPoller 의 발전형 — ctag 체크 대신 직접 etag diff 가 더 정확)
 */
export class CTagPoller {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private skipTicks = 0

  constructor(private readonly service: UnifiedCalendarService) {}

  start(): void {
    if (this.timer) return
    // 즉시 한 번 + 이후 주기
    this.tick()
    this.timer = setInterval(() => this.tick(), POLL_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  private async tick(): Promise<void> {
    if (this.running) return
    if (!CalDAVCredentialStore.has()) return
    if (this.skipTicks > 0) {
      this.skipTicks--
      console.log(`[Sync] tick skip (429 backoff 남은 ${this.skipTicks} tick)`)
      return
    }
    this.running = true
    try {
      const { anyChange } = await this.service.incrementalSync()
      if (anyChange) console.log('[Sync] incremental: 변경 감지 → 캐시 갱신')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('429')) {
        this.skipTicks = BACKOFF_TICKS_ON_429
        console.warn(`[Sync] 429 — 다음 ${BACKOFF_TICKS_ON_429} tick (≈${(BACKOFF_TICKS_ON_429 * POLL_INTERVAL_MS / 60000) | 0}분) 동안 polling 중단`)
      } else {
        console.error('[Sync] tick 실패:', e)
      }
    } finally {
      this.running = false
    }
  }
}
