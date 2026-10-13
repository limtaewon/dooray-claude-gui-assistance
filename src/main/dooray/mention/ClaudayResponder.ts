import type { MessengerService } from '../MessengerService'
import { formatForDooray } from './agent/DoorayFormatter'
import { MESSAGE_PREFIX, withPrefix } from './agent/ResultPublisher'
import type { SocketModeEvent } from '../socket-mode/types'

/**
 * 두레이 채널로 짧은 안내(시작·거부·지연 알림 등)를 보낸다. 작업 결과 회신은 ResultPublisher 가 맡는다.
 *
 * 송신 토큰이 봇 토큰이 아니라 사용자 본인 토큰이라 채널에는 "본인이 쓴 메시지"로 보인다.
 * 자동 송출임을 알아볼 수 있도록 [Clauday] 접두어를 붙인다.
 * 마크다운은 두레이에서 읽히는 평문으로 바꾼다 — ```md 로 감싸면 줄번호 붙은 코드블록이 되어 링크가 죽는다.
 */
export class ClaudayResponder {
  constructor(private messenger: Pick<MessengerService, 'sendMessage'>) {}

  /** 보내고 logId 를 돌려준다(실패 시 null). 진행 메시지처럼 나중에 고쳐 쓸 메시지에 쓴다. */
  async send(channelId: string, message: string, organizationId?: string): Promise<string | null> {
    const cleaned = message.trim()
    const stripped = cleaned.startsWith(MESSAGE_PREFIX) ? cleaned.slice(MESSAGE_PREFIX.length).trim() : cleaned
    try {
      return await this.messenger.sendMessage(channelId, withPrefix(formatForDooray(stripped)), organizationId)
    } catch (err) {
      console.warn(`[ClaudayResponder] 송신 실패 channelId=${channelId}:`, err)
      return null
    }
  }
}

/**
 * raw 페이로드의 references.channelMap[channelId].orgId 추출.
 * 두레이 sendMessage가 organizationId 옵션을 받기 때문에 함께 넘기면 안전.
 */
export function extractOrgId(ev: { channelId?: string; raw?: SocketModeEvent['raw'] }): string | undefined {
  if (!ev.raw || !ev.channelId) return undefined
  const raw = ev.raw as Record<string, unknown>
  const channelMap = (raw.references as Record<string, unknown> | undefined)?.channelMap as
    | Record<string, Record<string, unknown>>
    | undefined
  return channelMap?.[ev.channelId]?.orgId as string | undefined
}
