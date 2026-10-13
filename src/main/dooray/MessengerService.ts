import { DoorayClient } from './DoorayClient'
import type { DoorayChannel } from '../../shared/types/messenger'

interface ListResponse<T> {
  header: { resultCode: number; isSuccessful: boolean; resultMessage?: string }
  result: T[]
  totalCount?: number
}

interface SingleResponse<T> {
  header: { resultCode: number; isSuccessful: boolean; resultMessage?: string }
  result: T | null
}

/** 메신저 첨부 실물 서버 — api.dooray.com 의 파일 경로는 307 로 여기를 가리킨다. */
const MESSENGER_FILE_API_URL = 'https://file-api.dooray.com/downloads'

/** 두레이 메시지 카드. 카드 안 text·value 는 평문만 렌더되고 링크는 titleLink 로만 걸린다(2026-10-13 실측). */
export interface MessengerAttachment {
  title?: string
  titleLink?: string
  text?: string
  color?: string
  authorName?: string
  authorLink?: string
  thumbUrl?: string
  fields?: Array<{ title: string; value: string; short?: boolean }>
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
  /** 보낸 사람 (두레이 메신저 실제 필드)
   *  HTTP logs API: { type:'member', member: { organizationMemberId } } 형태
   *  socket-mode/일부 응답: { organizationMemberId, name } 평면 형태
   *  둘 다 대응. */
  sender?: {
    organizationMemberId?: string
    name?: string
    type?: string
    member?: { organizationMemberId?: string; name?: string }
  }
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
  private memberNameCache: Map<string, string> = new Map()

  constructor(private client: DoorayClient) {}

  /** 멤버 ID → 이름 조회 (캐시). 실패 시 빈 문자열. */
  async getMemberName(memberId: string): Promise<string> {
    if (!memberId) return ''
    if (this.memberNameCache.has(memberId)) return this.memberNameCache.get(memberId)!
    try {
      const res = await this.client.request<{ result: { name: string } }>(
        `/common/v1/members/${memberId}`
      )
      const name = res.result?.name || ''
      this.memberNameCache.set(memberId, name)
      return name
    } catch {
      // 실패 케이스도 캐시 (계속 재시도 방지)
      this.memberNameCache.set(memberId, '')
      return ''
    }
  }

  /** 여러 멤버 ID를 병렬로 이름 조회 (내부적으로 캐시됨) */
  async resolveMemberNames(memberIds: string[]): Promise<void> {
    const unknown = memberIds.filter((id) => id && !this.memberNameCache.has(id))
    if (unknown.length === 0) return
    await Promise.allSettled(unknown.map((id) => this.getMemberName(id)))
  }

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

  /** 메시지 송신. 보낸 메시지의 logId 를 돌려준다(이후 수정·삭제용). */
  async sendMessage(channelId: string, text: string, organizationId?: string): Promise<string | null> {
    if (!text?.trim()) throw new Error('메시지가 비어있습니다')
    const body = {
      text,
      organizationId: organizationId || undefined
    }
    const res = await this.client.request<SingleResponse<{ id?: string }>>(
      `/messenger/v1/channels/${channelId}/logs`,
      { method: 'POST', body: JSON.stringify(body) }
    )
    return res.result?.id ?? null
  }

  /** attachments 카드 송신. 카드는 수정 API 로 바꿀 수 없다(PUT 시 서버에서 지워짐) — 불변으로 다룬다. */
  async sendCard(channelId: string, text: string, attachments: MessengerAttachment[], organizationId?: string): Promise<string | null> {
    const res = await this.client.request<SingleResponse<{ id?: string }>>(
      `/messenger/v1/channels/${channelId}/logs`,
      { method: 'POST', body: JSON.stringify({ text, attachments, organizationId: organizationId || undefined }) }
    )
    return res.result?.id ?? null
  }

  /** 보낸 메시지의 text 를 바꾼다. attachments 가 있던 메시지면 카드가 사라지므로 text 전용 메시지에만 쓴다. */
  async updateMessage(channelId: string, logId: string, text: string): Promise<void> {
    if (!text?.trim()) throw new Error('메시지가 비어있습니다')
    await this.client.request<SingleResponse<unknown>>(
      `/messenger/v1/channels/${channelId}/logs/${logId}`,
      { method: 'PUT', body: JSON.stringify({ text }) }
    )
  }

  /** 새 글타래를 만들고 원글(카드 가능)과 첫 답글을 보낸다. 반환 threadChannelId 로 이후 답글을 보낸다. */
  async createThreadAndSend(
    channelId: string,
    root: { text: string; attachments?: MessengerAttachment[] },
    threadText?: string
  ): Promise<{ threadChannelId: string | null }> {
    const body: Record<string, unknown> = { text: root.text }
    if (root.attachments?.length) body.attachments = root.attachments
    if (threadText) body.threadText = threadText
    const res = await this.client.request<SingleResponse<{ id?: string; channelId?: string }>>(
      `/messenger/v1/channels/${channelId}/threads/create-and-send`,
      { method: 'POST', body: JSON.stringify(body) }
    )
    return { threadChannelId: res.result?.channelId ?? null }
  }

  /** 채널 첨부 파일을 받아 Buffer 로. 실물 서버(file-api)로 곧장 요청한다(api.dooray.com 은 307 로 여기를 가리킨다). */
  async downloadChannelFile(channelId: string, fileId: string): Promise<{ mimeType: string; data: Buffer }> {
    const dataUrl = await this.client.fetchBinary(
      `${MESSENGER_FILE_API_URL}/messenger/v1/channels/${channelId}/files/${fileId}?media=raw`
    )
    const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl)
    if (!m) throw new Error(`첨부 응답 형식을 알 수 없습니다: ${fileId}`)
    const data = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8')
    return { mimeType: m[1] || 'application/octet-stream', data }
  }

  /** direct·보관 채널까지 포함한 원본 채널 목록 — 놓친 멘션 찾기처럼 모든 대화방을 훑어야 할 때만 쓴다. */
  async listAllChannelsRaw(): Promise<Array<{ id: string; type?: string; updatedAt?: string; organizationId?: string }>> {
    const res = await this.client.request<ListResponse<DoorayChannelRaw>>('/messenger/v1/channels?size=200')
    return (res.result || []).filter((c) => !c.archivedAt)
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
