import type { DoorayChannelLog, MessengerService } from '../MessengerService'
import { extractText } from '../../watcher/WatcherService'
import type { MentionContext, ProcessedMentionLog } from './MentionDispatcher'

/** key-value 저장소 — electron-store 를 그대로 넘기거나 테스트에서 메모리로 대체한다 */
export interface KeyValueStorage {
  get(key: string, defaultValue?: unknown): unknown
  set(key: string, value: unknown): void
}

const PROCESSED_KEY = 'processedMentionIds'
const LAST_ALIVE_KEY = 'lastAliveAt'
const PROCESSED_CAP = 500

/** 처리한 멘션 logId 와 "소켓이 마지막으로 살아 있던 시각" 을 영속화한다. 앱 재시작·잠자기를 넘어 유지된다. */
export class MentionCatchUpState implements ProcessedMentionLog {
  private ids: string[]

  constructor(private storage: KeyValueStorage) {
    const saved = storage.get(PROCESSED_KEY, [])
    this.ids = Array.isArray(saved) ? saved.filter((v): v is string => typeof v === 'string') : []
  }

  has(logId: string): boolean {
    return this.ids.includes(logId)
  }

  add(logId: string): void {
    if (this.has(logId)) return
    this.ids.push(logId)
    if (this.ids.length > PROCESSED_CAP) this.ids = this.ids.slice(-PROCESSED_CAP)
    this.storage.set(PROCESSED_KEY, this.ids)
  }

  getLastAliveAt(): number | null {
    const v = this.storage.get(LAST_ALIVE_KEY, null)
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }

  setLastAliveAt(ms: number): void {
    this.storage.set(LAST_ALIVE_KEY, ms)
  }
}

export interface CatchUpDeps {
  messenger: Pick<MessengerService, 'listAllChannelsRaw' | 'fetchChannelLogs'>
  getMyMemberId: () => Promise<string | null>
  matches: (text: string) => boolean
  processed: Pick<ProcessedMentionLog, 'has'>
  now?: () => number
}

export interface CatchUpResult {
  /** 훑은 채널 수 */
  scannedChannels: number
  /** 찾은 미처리 멘션 (보낸 시각 오름차순) */
  mentions: MentionContext[]
}

/** 채널 목록의 updatedAt·글타래의 lastUpdatedAt 은 서버 시계라 약간의 여유를 둔다 */
const CLOCK_SLACK_MS = 60_000
/** 동시 조회 수 — rate limit 버킷(초당 5, 순간 20)을 마르지 않게 (메신저 API 스펙 권장 3~4) */
const CONCURRENCY = 3
const CHANNEL_FETCH_SIZE = 100
const THREAD_FETCH_SIZE = 100

/**
 * 소켓이 끊겨 있던 동안(잠자기·네트워크 단절·앱 종료) 보낸 내 `@clauday` 멘션을 찾는다(기획 §5.8).
 * Socket Mode 는 연결 중인 메시지만 전달해서, 이걸 안 하면 그 사이 멘션은 영영 처리되지 않는다.
 *
 * 범위: since 이후 갱신된 채널만 → 그 채널 최근 로그 + since 이후 갱신된 글타래.
 */
export class MentionCatchUp {
  constructor(private deps: CatchUpDeps) {}

  async find(sinceMs: number): Promise<CatchUpResult> {
    const myId = await this.deps.getMyMemberId()
    if (!myId) {
      console.warn('[MentionCatchUp] 내 멤버 ID 를 몰라 놓친 멘션을 찾지 않음')
      return { scannedChannels: 0, mentions: [] }
    }
    const threshold = sinceMs - CLOCK_SLACK_MS
    const channels = (await this.deps.messenger.listAllChannelsRaw()).filter((c) => {
      const t = c.updatedAt ? Date.parse(c.updatedAt) : NaN
      return Number.isFinite(t) && t >= threshold
    })

    const found: MentionContext[] = []
    await runLimited(channels, CONCURRENCY, async (ch) => {
      let logs: DoorayChannelLog[]
      try {
        logs = await this.deps.messenger.fetchChannelLogs(ch.id, CHANNEL_FETCH_SIZE)
      } catch (err) {
        console.warn(`[MentionCatchUp] 채널 로그 조회 실패 channelId=${ch.id}:`, err)
        return
      }
      for (const log of logs) {
        const m = this.toMention(log, ch.id, myId, sinceMs, ch.organizationId)
        if (m) found.push(m)
        const thread = log.thread as { channelId?: string; lastUpdatedAt?: number } | undefined
        if (thread?.channelId && typeof thread.lastUpdatedAt === 'number' && thread.lastUpdatedAt >= threshold) {
          try {
            const replies = await this.deps.messenger.fetchChannelLogs(thread.channelId, THREAD_FETCH_SIZE)
            for (const r of replies) {
              const tm = this.toMention(r, thread.channelId, myId, sinceMs, ch.organizationId, ch.id)
              if (tm) found.push(tm)
            }
          } catch (err) {
            console.warn(`[MentionCatchUp] 글타래 조회 실패 threadId=${thread.channelId}:`, err)
          }
        }
      }
    })

    found.sort((a, b) => Date.parse(a.sentAt || '') - Date.parse(b.sentAt || ''))
    return { scannedChannels: channels.length, mentions: found }
  }

  private toMention(
    log: DoorayChannelLog,
    channelId: string,
    myId: string,
    sinceMs: number,
    organizationId?: string,
    parentChannelId?: string
  ): MentionContext | null {
    const sentAt = log.sentAt || log.createdAt
    const sentMs = sentAt ? Date.parse(sentAt) : NaN
    if (!Number.isFinite(sentMs) || sentMs < sinceMs) return null
    if (senderIdOf(log) !== myId) return null
    if (this.deps.processed.has(log.id)) return null
    const text = extractText(log)
    if (!text || !this.deps.matches(text)) return null
    const now = this.deps.now?.() ?? Date.now()
    const channelMap: Record<string, Record<string, unknown>> = {
      [channelId]: { orgId: organizationId, ...(parentChannelId ? { type: 'thread', parentChannelId } : {}) }
    }
    return {
      channelId,
      senderId: myId,
      logId: log.id,
      text,
      sentAt,
      raw: { references: { channelMap } } as unknown as MentionContext['raw'],
      isThread: !!parentChannelId,
      parentChannelId,
      delayedMs: Math.max(0, now - sentMs)
    }
  }
}

function senderIdOf(log: DoorayChannelLog): string | undefined {
  return log.sender?.member?.organizationMemberId || log.sender?.organizationMemberId || log.creator?.member?.organizationMemberId
}

async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}
