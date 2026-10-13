import type { MessengerService, DoorayChannelLog } from '../MessengerService'
import { extractText } from '../../watcher/WatcherService'
import { maskSecrets, truncateLongLines } from './agent/SecretMasker'

export interface CollectedAttachment {
  fileId: string
  fileName: string
  mimeType?: string
  /** 채널 폴더 기준 상대 경로 — 에이전트가 Read 로 열 수 있게 내려받은 경우만 */
  localPath?: string
}

export interface CollectedMessage {
  authorName: string
  authorId?: string
  text: string
  sentAt: string
  attachment?: CollectedAttachment
  /** 인용 답장이면 인용한 원문 일부 */
  quote?: string
  /** 이 메시지에 달린 글타래 답글 수 */
  threadCount?: number
}

export interface CollectedContext {
  channelId: string
  channelName: string
  /** 시간 오름차순 (오래된 → 최근, 멘션 메시지가 마지막) */
  messages: CollectedMessage[]
  /** 트리거가 된 멘션 메시지의 logId */
  mentionLogId: string
  /** 글타래 안 멘션이면 그 글타래의 원글. 부모 채널에서 못 찾으면 null */
  threadRoot?: CollectedMessage | null
  /** 글타래 안 멘션인지 */
  inThread: boolean
  /** 가린 비밀값 개수 */
  maskedSecrets: number
}

export interface CollectOptions {
  /** 글타래 안 멘션이면 부모 채널 — 원글을 찾는 데 쓴다 */
  parentChannelId?: string
  /** 첨부를 채널 폴더에 저장하고 상대 경로를 돌려준다. 없으면 파일명만 남긴다 */
  saveAttachment?: (fileId: string, fileName: string, data: Buffer) => string
}

type Messenger = Pick<MessengerService, 'fetchChannelLogs' | 'resolveMemberNames' | 'getMemberName' | 'listChannels'> &
  Partial<Pick<MessengerService, 'downloadChannelFile'>>

/** 글타래 하나에서 담을 최대 메시지 수 — 운영 채널 실측 최대 95개 */
const THREAD_FETCH_SIZE = 200
/** 원글을 찾을 부모 채널 조회 깊이. 얕게 먼저 보고 없으면 API 최대치까지 */
const ROOT_SEARCH_SIZES = [200, 1000]
/** 내려받을 이미지 수·크기 상한 — 멘션에 가까운 것부터 */
const MAX_IMAGE_DOWNLOADS = 4
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * 멘션 시점 기준 컨텍스트 수집기 (기획 §5.7).
 *  - 채널 멘션: 멘션부터 과거로 windowSize 개
 *  - 글타래 멘션: 글타래 답글 전체(멘션까지) + 부모 채널에서 찾은 **원글** — 글타래 첫 답글의 약 40% 가 원글 없이 뜻이 안 통한다
 *  - 첨부만 있는 메시지는 `[첨부: 파일명]` 으로 남기고, 이미지는 채널 폴더로 내려받아 경로를 준다
 *  - 인용 답장은 인용 원문을 함께, 비밀값은 가리고, 수천 자짜리 한 줄은 자른다
 */
export class ContextCollector {
  /** threadChannelId → 원글. 부모 채널을 다시 훑지 않도록 */
  private rootCache = new Map<string, DoorayChannelLog>()

  constructor(private messenger: Messenger) {}

  async collect(
    channelId: string,
    mentionLogId: string,
    windowSize = 50,
    channelNameOverride?: string,
    opts: CollectOptions = {}
  ): Promise<CollectedContext> {
    const inThread = !!opts.parentChannelId
    const fetchSize = inThread ? THREAD_FETCH_SIZE : Math.max(windowSize, 50)
    const logs = await this.messenger.fetchChannelLogs(channelId, fetchSize)

    // logs는 최신순 (?order=-createdAt). 멘션 위치를 찾아 그 시점부터 과거 방향으로.
    let mentionIdx = logs.findIndex((l) => l.id === mentionLogId)
    if (mentionIdx < 0) mentionIdx = 0
    const slice = inThread ? logs.slice(mentionIdx) : logs.slice(mentionIdx, mentionIdx + windowSize)

    const rootLog = inThread && opts.parentChannelId ? await this.findThreadRoot(opts.parentChannelId, channelId) : undefined

    const senderIds = new Set<string>()
    for (const log of rootLog ? [...slice, rootLog] : slice) {
      const sid = senderIdOf(log)
      if (sid) senderIds.add(sid)
    }
    await this.messenger.resolveMemberNames([...senderIds])

    const byId = new Map(logs.map((l) => [l.id, l]))
    const downloads = { left: MAX_IMAGE_DOWNLOADS }
    let maskedSecrets = 0

    const toMessage = async (log: DoorayChannelLog, ownerChannelId: string): Promise<CollectedMessage | null> => {
      const attachment = await this.collectAttachment(log, ownerChannelId, opts, downloads)
      let text = extractText(log)
      if (attachment && text === attachment.fileName) text = ''
      if (!text && !attachment) return null
      const masked = maskSecrets(truncateLongLines(text))
      maskedSecrets += masked.count
      const quote = this.quoteOf(log, byId)
      return {
        authorName: await this.authorNameOf(log),
        authorId: senderIdOf(log),
        text: masked.text,
        sentAt: log.sentAt || log.createdAt || new Date().toISOString(),
        attachment,
        quote,
        threadCount: threadCountOf(log)
      }
    }

    const messages: CollectedMessage[] = []
    for (const log of slice) {
      const m = await toMessage(log, channelId)
      if (m) messages.push(m)
    }

    let threadRoot: CollectedMessage | null | undefined
    if (inThread) threadRoot = rootLog && opts.parentChannelId ? await toMessage(rootLog, opts.parentChannelId) : null

    const channelName = channelNameOverride || (await this.resolveChannelName(channelId))

    return {
      channelId,
      channelName,
      messages: messages.reverse(),
      mentionLogId,
      threadRoot,
      inThread,
      maskedSecrets
    }
  }

  /** 부모 채널 로그에서 `thread.channelId` 가 이 글타래인 메시지를 찾는다. 글타래 메타를 직접 주는 API 는 없다(실측). */
  private async findThreadRoot(parentChannelId: string, threadChannelId: string): Promise<DoorayChannelLog | undefined> {
    const cached = this.rootCache.get(threadChannelId)
    if (cached) return cached
    for (const size of ROOT_SEARCH_SIZES) {
      try {
        const logs = await this.messenger.fetchChannelLogs(parentChannelId, size)
        const root = logs.find((l) => threadChannelIdOf(l) === threadChannelId)
        if (root) {
          this.rootCache.set(threadChannelId, root)
          return root
        }
        if (logs.length < size) break
      } catch (err) {
        console.warn(`[ContextCollector] 원글 조회 실패 parent=${parentChannelId} thread=${threadChannelId}:`, err)
        break
      }
    }
    console.warn(`[ContextCollector] 원글을 찾지 못함 parent=${parentChannelId} thread=${threadChannelId}`)
    return undefined
  }

  private async collectAttachment(
    log: DoorayChannelLog,
    ownerChannelId: string,
    opts: CollectOptions,
    downloads: { left: number }
  ): Promise<CollectedAttachment | undefined> {
    const file = fileOf(log)
    if (!file) return undefined
    const att: CollectedAttachment = { fileId: file.id, fileName: file.fileName, mimeType: file.mimeType }
    const isImage = (file.mimeType || '').startsWith('image/')
    const smallEnough = !file.fileSize || file.fileSize <= MAX_IMAGE_BYTES
    if (!isImage || !smallEnough || downloads.left <= 0 || !opts.saveAttachment || !this.messenger.downloadChannelFile) {
      return att
    }
    downloads.left--
    try {
      const { data } = await this.messenger.downloadChannelFile(ownerChannelId, file.id)
      att.localPath = opts.saveAttachment(file.id, file.fileName, data)
    } catch (err) {
      console.warn(`[ContextCollector] 첨부 다운로드 실패 channelId=${ownerChannelId} fileId=${file.id}:`, err)
    }
    return att
  }

  private quoteOf(log: DoorayChannelLog, byId: Map<string, DoorayChannelLog>): string | undefined {
    const originalId = (log.originalLog as { id?: string } | undefined)?.id
    if (!originalId) return undefined
    const original = byId.get(originalId)
    if (!original) return '(인용 원문이 수집 범위 밖)'
    const text = extractText(original).replace(/\s+/g, ' ').trim()
    return text.length > 120 ? `${text.slice(0, 119)}…` : text
  }

  private async authorNameOf(log: DoorayChannelLog): Promise<string> {
    const authorId = senderIdOf(log)
    const fallbackName = log.sender?.member?.name || log.sender?.name || log.creator?.member?.name || ''
    return fallbackName || (authorId ? await this.messenger.getMemberName(authorId) : '') || '알 수 없음'
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

function threadChannelIdOf(log: DoorayChannelLog): string | undefined {
  return (log.thread as { channelId?: string } | undefined)?.channelId
}

function threadCountOf(log: DoorayChannelLog): number | undefined {
  const raw = (log.thread as { totalCount?: string | number } | undefined)?.totalCount
  const n = typeof raw === 'string' ? Number(raw) : raw
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined
}

/** `type: FILE` 메시지의 첨부 메타 (2026-10-13 실측 형식) */
function fileOf(log: DoorayChannelLog): { id: string; fileName: string; mimeType?: string; fileSize?: number } | undefined {
  const f = log.file as { id?: string; fileName?: string; title?: string; mimeType?: string; fileSize?: number } | undefined
  if (!f?.id) return undefined
  return { id: String(f.id), fileName: f.fileName || f.title || `file-${f.id}`, mimeType: f.mimeType, fileSize: f.fileSize }
}
