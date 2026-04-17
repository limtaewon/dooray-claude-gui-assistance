import { DoorayClient } from './DoorayClient'
import type { DoorayChannel } from '../../shared/types/messenger'

interface ListResponse<T> {
  header: { resultCode: number; isSuccessful: boolean; resultMessage?: string }
  result: T[]
  totalCount?: number
}

export interface DoorayChannelLog {
  id: string
  seq?: number
  type?: string
  channelId?: string
  /** 일반 메시지: text */
  text?: string
  /** 두레이 포맷: body / content */
  body?: { mimeType?: string; content?: string } | string
  content?: { mimeType?: string; content?: string } | string
  message?: string
  messageText?: string
  /** 두레이 메신저 실제 필드명 */
  sentAt?: string
  createdAt?: string
  /** 보낸 사람 (두레이 메신저 실제 필드) */
  sender?: { organizationMemberId?: string; name?: string }
  creator?: {
    type?: string
    member?: { organizationMemberId?: string; name?: string }
  }
  flags?: Record<string, unknown>
  [key: string]: unknown
}

interface DoorayChannelRaw {
  id: string
  type?: string
  title?: string
  name?: string
  displayName?: string
  unreadCount?: number
  organizationId?: string
  updatedAt?: string
  archivedAt?: string
}

/**
 * 두레이 메신저 (채널/메시지) 담당.
 * direct(1:1/그룹 direct)는 제외하고 일반 채널만 지원.
 */
export class MessengerService {
  private channelCache: { data: DoorayChannel[]; at: number } | null = null
  private static CACHE_TTL = 60 * 1000 // 1분

  constructor(private client: DoorayClient) {}

  async listChannels(force = false): Promise<DoorayChannel[]> {
    const now = Date.now()
    if (!force && this.channelCache && now - this.channelCache.at < MessengerService.CACHE_TTL) {
      return this.channelCache.data
    }

    const res = await this.client.request<ListResponse<DoorayChannelRaw>>(
      '/messenger/v1/channels?size=200'
    )
    const channels = (res.result || [])
      .filter((c) => !c.archivedAt && c.type !== 'direct')
      .map((c) => this.toChannel(c))
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))

    this.channelCache = { data: channels, at: now }
    return channels
  }

  /**
   * 채널 메시지 로그 조회. 최신순으로 size개.
   * 두레이 API는 최근순으로 반환 — 날짜 필터링은 호출 측에서 처리.
   */
  async fetchChannelLogs(channelId: string, size = 200): Promise<DoorayChannelLog[]> {
    const res = await this.client.request<ListResponse<DoorayChannelLog>>(
      `/messenger/v1/channels/${channelId}/logs?size=${size}&order=-createdAt`
    )
    return res.result || []
  }

  async sendMessage(channelId: string, text: string, organizationId?: string): Promise<void> {
    if (!text?.trim()) throw new Error('메시지가 비어있습니다')
    const body = {
      text,
      organizationId: organizationId || undefined
    }
    await this.client.request<{ header: { isSuccessful: boolean; resultMessage?: string } }>(
      `/messenger/v1/channels/${channelId}/logs`,
      { method: 'POST', body: JSON.stringify(body) }
    )
  }

  private toChannel(raw: DoorayChannelRaw): DoorayChannel {
    const displayName = raw.displayName || raw.title || raw.name || '(이름 없음)'
    return {
      id: raw.id,
      type: raw.type,
      title: raw.title || raw.name,
      displayName,
      unreadCount: raw.unreadCount,
      organizationId: raw.organizationId,
      updatedAt: raw.updatedAt
    }
  }

  clearCache(): void {
    this.channelCache = null
  }
}
