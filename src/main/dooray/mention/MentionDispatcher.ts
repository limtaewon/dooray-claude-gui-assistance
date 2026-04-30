import type { BotService } from '../socket-mode/BotService'
import type { SocketModeEvent } from '../socket-mode/types'
import type { TaskService } from '../TaskService'

const DEFAULT_TRIGGER = 'clauday'

export interface MentionContext {
  channelId: string
  senderId: string
  logId: string
  text: string
  sentAt?: string
  raw?: SocketModeEvent['raw']
  /** raw에서 추출한 표시용 이름 (thread면 "🧵 {title}", 일반 채널이면 title) */
  channelDisplayName?: string
  /** thread sub-channel 여부 */
  isThread?: boolean
  /** 부모 채널 ID (thread만) */
  parentChannelId?: string
}

export type MentionHandler = (ctx: MentionContext) => void | Promise<void>

/**
 * 두레이 메신저 멘션(@clauday) 디스패처.
 *
 * 동작:
 *  1) BotService 이벤트 구독 (와처 디스패치와 독립적으로 두 번째 listener)
 *  2) type=='message' && text/channelId/senderId/logId 모두 있는 이벤트만 통과
 *  3) text에 @{trigger} 포함 여부 검사 (대소문자 무시, 단순 substring)
 *  4) senderId === myMemberId 체크 — 토큰 주인의 멘션만 인식
 *     (멘션 송신을 봇 토큰으로 못 하는 v1.4 제약 + 다른 사람이 트리거 못 걸게)
 *  5) 매치되면 onMention 핸들러 호출
 *
 * 디버깅:
 *  - 첫 매칭 시 raw payload를 1회 dump해 두레이 mention 마크업 형태 확인
 *  - senderId 미스매치 시 양쪽 ID 둘 다 로그에 찍어 네임스페이스 차이 즉시 발견
 */
export class MentionDispatcher {
  private myMemberId: string | null = null
  private trigger = DEFAULT_TRIGGER
  private enabled = true
  private unsubscribe: (() => void) | null = null
  private handlers: Set<MentionHandler> = new Set()

  constructor(
    private botService: BotService,
    private taskService: TaskService
  ) {}

  setTrigger(t: string): void {
    const cleaned = (t || DEFAULT_TRIGGER).trim().toLowerCase().replace(/^@/, '')
    this.trigger = cleaned || DEFAULT_TRIGGER
  }

  getTrigger(): string {
    return this.trigger
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  onMention(handler: MentionHandler): () => void {
    this.handlers.add(handler)
    return () => { this.handlers.delete(handler) }
  }

  start(): void {
    if (this.unsubscribe) return
    this.unsubscribe = this.botService.addEventListener((ev) => {
      void this.handle(ev).catch((err) =>
        console.error('[MentionDispatcher] handle 에러:', err)
      )
    })
    console.log(`[MentionDispatcher] started, trigger=@${this.trigger}, enabled=${this.enabled}`)
  }

  stop(): void {
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null }
  }

  private async ensureMyMemberId(): Promise<string | null> {
    if (this.myMemberId) return this.myMemberId
    try {
      this.myMemberId = await this.taskService.getMyMemberIdPublic()
      return this.myMemberId
    } catch (err) {
      console.error('[MentionDispatcher] getMyMemberId 실패:', err)
      return null
    }
  }

  /**
   * 매칭 조건: 텍스트의 맨 앞에 @{trigger} 가 단독 토큰으로 와야 함.
   *  - 통과:  "@clauday test", "@clauday\n뭐해줘", "  @clauday X" (앞 공백 허용)
   *  - 거부:  "안녕 @clauday", "@claudayyyy", "@claudaytest"
   * 중간/끝 위치의 멘션은 의도치 않은 대화 흐름에서 발화될 수 있어 트리거 안 함.
   */
  private matchesTrigger(text: string): boolean {
    const trimmed = text.replace(/^\s+/, '')
    const lower = trimmed.toLowerCase()
    const needle = '@' + this.trigger
    if (!lower.startsWith(needle)) return false
    const after = trimmed.charAt(needle.length)
    return after === '' || /\s/.test(after)
  }

  private async handle(ev: SocketModeEvent): Promise<void> {
    if (!this.enabled) return
    if (ev.type !== 'message') return
    if (!ev.text || !ev.channelId || !ev.senderId || !ev.logId) return
    if (!this.matchesTrigger(ev.text)) return

    const myId = await this.ensureMyMemberId()
    if (!myId) {
      console.warn('[MentionDispatcher] myMemberId 미상 — 멘션 매칭 보류')
      return
    }

    if (ev.senderId !== myId) {
      console.log(
        `[MentionDispatcher] 멘션 무시: senderId=${ev.senderId} != myMemberId=${myId} text="${ev.text.slice(0, 60)}"`
      )
      return
    }

    console.log(
      `[MentionDispatcher] 멘션 매치 channelId=${ev.channelId} logId=${ev.logId} text="${ev.text.slice(0, 80)}"`
    )

    const meta = extractChannelMeta(ev)
    const ctx: MentionContext = {
      channelId: ev.channelId,
      senderId: ev.senderId,
      logId: ev.logId,
      text: ev.text,
      sentAt: ev.sentAt,
      raw: ev.raw,
      ...meta
    }
    for (const h of this.handlers) {
      try { await h(ctx) } catch (err) { console.error('[MentionDispatcher] handler 에러:', err) }
    }
  }
}

/**
 * raw 페이로드에서 채널 표시 메타 추출.
 * 두레이 thread는 별도 channelId를 갖는 sub-channel이며 references.channelMap[id]에
 * type='thread', title, parentChannelId 가 함께 옵니다. content.threadTitle 도 백업으로 봄.
 */
function extractChannelMeta(ev: SocketModeEvent): {
  channelDisplayName?: string
  isThread: boolean
  parentChannelId?: string
} {
  const raw = ev.raw as Record<string, unknown> | undefined
  if (!raw || !ev.channelId) return { isThread: false }

  const channelMap = ((raw.references as Record<string, unknown> | undefined)?.channelMap) as
    | Record<string, Record<string, unknown>>
    | undefined
  const info = channelMap?.[ev.channelId]
  const channelLevel = (raw.channel as { type?: string } | undefined)?.type
  const infoType = info?.type as string | undefined
  const isThread = infoType === 'thread' || channelLevel === 'thread'

  const title =
    (info?.title as string | undefined) ||
    ((raw.content as Record<string, unknown> | undefined)?.threadTitle as string | undefined)
  const parentChannelId =
    (info?.parentChannelId as string | undefined) ||
    ((raw.content as Record<string, unknown> | undefined)?.parentChannelId as string | undefined)

  return {
    channelDisplayName: title ? (isThread ? `🧵 ${title}` : title) : undefined,
    isThread,
    parentChannelId
  }
}
