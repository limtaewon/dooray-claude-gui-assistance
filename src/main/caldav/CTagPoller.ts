import { CalDAVCredentialStore } from './CredentialStore'
import type { UnifiedCalendarService } from './UnifiedCalendarService'

const POLL_INTERVAL_MS = 45_000 // 45초 — 너무 잦으면 부담, 너무 길면 늦음

/**
 * v1.5 — Incremental Sync Poller.
 * 주기적으로 etag diff 만 fetch → 변경된 ICS 만 ObjectsStore 에 반영 → renderer 알림.
 * (이전 CTagPoller 의 발전형 — ctag 체크 대신 직접 etag diff 가 더 정확)
 */
export class CTagPoller {
  private timer: NodeJS.Timeout | null = null
  private running = false

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
    this.running = true
    try {
      const { anyChange } = await this.service.incrementalSync()
      if (anyChange) console.log('[Sync] incremental: 변경 감지 → 캐시 갱신')
    } catch (e) {
      console.error('[Sync] tick 실패:', e)
    } finally {
      this.running = false
    }
  }
}
