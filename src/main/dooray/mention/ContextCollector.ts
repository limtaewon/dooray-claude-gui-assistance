import type { MessengerService, DoorayChannelLog } from '../MessengerService'
import { extractText } from '../../watcher/WatcherService'

export interface CollectedMessage {
  authorName: string
  authorId?: string
  text: string
  sentAt: string
}

export interface CollectedContext {
  channelId: string
  channelName: string
  /** 시간 오름차순 (오래된 → 최근, 멘션 메시지가 마지막) */
  messages: CollectedMessage[]
  /** 트리거가 된 멘션 메시지의 logId */
  mentionLogId: string
}

/**
 * 멘션 시점 기준 컨텍스트 수집기.
 *
 * 정책 (v1.4 초안):
 *  - thread 우선: 두레이 메신저의 reply/thread 표현이 raw에 있으면 그 thread 메시지만 모음
 *    (현재는 raw 구조 미확인 — fallback만 구현하고 thread 분기는 추후 raw dump 보고 추가)
 *  - 직전 N개 fallback: 멘션 메시지 본인을 포함해 시간 역방향 N개를 채널 로그에서 슬라이스
 *  - 멘션 이후의 메시지는 노이즈로 보고 제외
 *  - 빈 텍스트(첨부만 있는 메시지 등)는 제외
 *
 * 출력은 시간 오름차순으로 뒤집어서 프롬프트에 그대로 끼워넣을 수 있게 한다.
 */
export class ContextCollector {
  constructor(private messenger: MessengerService) {}

  async collect(
    channelId: string,
    mentionLogId: string,
    windowSize = 50,
    channelNameOverride?: string
  ): Promise<CollectedContext> {
    const fetchSize = Math.max(windowSize, 50)
    const logs = await this.messenger.fetchChannelLogs(channelId, fetchSize)

    // logs는 최신순 (?order=-createdAt). 멘션 위치를 찾아 그 시점부터 과거 방향으로 windowSize.
    let mentionIdx = logs.findIndex((l) => l.id === mentionLogId)
    if (mentionIdx < 0) mentionIdx = 0
    const slice = logs.slice(mentionIdx, mentionIdx + windowSize)

    // 발화자 이름 병렬 워밍업 (캐시에 채워두고 그 다음은 sync 조회)
    const senderIds = new Set<string>()
    for (const log of slice) {
      const sid = senderIdOf(log)
      if (sid) senderIds.add(sid)
    }
    await this.messenger.resolveMemberNames([...senderIds])

    const messages: CollectedMessage[] = []
    for (const log of slice) {
      const text = extractText(log)
      if (!text) continue
      const authorId = senderIdOf(log)
      const fallbackName =
        log.sender?.member?.name ||
        log.sender?.name ||
        log.creator?.member?.name ||
        ''
      const authorName =
        fallbackName ||
        (authorId ? await this.messenger.getMemberName(authorId) : '') ||
        '알 수 없음'
      const sentAt = log.sentAt || log.createdAt || new Date().toISOString()
      messages.push({ authorName, authorId, text, sentAt })
    }

    const channelName = channelNameOverride || (await this.resolveChannelName(channelId))

    return {
      channelId,
      channelName,
      messages: messages.reverse(),
      mentionLogId
    }
  }

  private async resolveChannelName(channelId: string): Promise<string> {
    try {
      const channels = await this.messenger.listChannels()
      const ch = channels.find((c) => c.id === channelId)
      return ch?.displayName || ch?.title || channelId
    } catch {
      return channelId
    }
  }
}

function senderIdOf(log: DoorayChannelLog): string | undefined {
  // HTTP logs API: log.sender.member.organizationMemberId (감싸진 형태)
  // 일부 케이스: log.sender.organizationMemberId (평면)
  // 보내는 측이 다른 케이스: log.creator.member.organizationMemberId
  return log.sender?.member?.organizationMemberId
    || log.sender?.organizationMemberId
    || log.creator?.member?.organizationMemberId
}
