import type { MessengerService } from '../../MessengerService'
import { buildCompletionCard } from './AgentCardBuilder'
import { formatElapsed, formatForDooray, isLongAnswer, splitForMessenger } from './DoorayFormatter'
import { detectQuestion, questionHint, type AgentQuestion } from './QuestionWatcher'

export const MESSAGE_PREFIX = '[Clauday]'

type Messenger = Pick<MessengerService, 'sendMessage' | 'sendCard' | 'updateMessage' | 'createThreadAndSend'>

export interface PublishRequest {
  /** 회신할 채널 — 멘션이 글타래 안이었다면 그 글타래 채널 */
  channelId: string
  /** 회신 채널이 글타래인지. 글타래 안에서는 새 글타래를 만들 수 없어 같은 자리에 이어 쓴다. */
  inThread: boolean
  organizationId?: string
  /** 에이전트의 마지막 응답(마크다운) */
  answer: string
  startedAt: number
  /** 시작 때 보낸 진행 메시지 — 끝나면 완료로 고쳐 쓴다 */
  progressLogId?: string | null
  now?: number
}

/** 채널에 남은 되묻는 회신 — 반응·답장을 기다릴 자리. 묻지 않았거나 글타래로 갔으면 null */
export interface PublishedQuestion {
  logId: string
  text: string
  question: AgentQuestion
}

/**
 * 에이전트 응답을 두레이로 보낸다.
 *  - 짧은 답: 본문 text 한 번
 *  - 긴 답(표·긴 코드·600자 초과): 완료 카드 + 전문을 메신저용으로 조판해 글타래로
 * 도구 사용 내역은 내보내지 않는다(기획 §5.3). 송신 실패는 삼키지 않고 warn 으로 남긴다.
 */
export class ResultPublisher {
  constructor(private messenger: Messenger) {}

  async publish(req: PublishRequest): Promise<PublishedQuestion | null> {
    const now = req.now ?? Date.now()
    const elapsedMs = now - req.startedAt
    const answer = req.answer.trim()
    const formatted = answer ? formatForDooray(answer) : ''

    if (!formatted) {
      // 진행 메시지가 있으면 "✅ 완료" 로 고쳐 쓰는 것으로 충분하다
      if (req.progressLogId) await this.finishProgress(req, elapsedMs)
      else await this.safeSend(req.channelId, `${MESSAGE_PREFIX} 응답 완료.`, req.organizationId)
      return null
    }

    if (!isLongAnswer(answer, formatted)) {
      // 되묻는 답이면 끝에 답하는 법(반응·@clauday 없는 답장)을 한 줄 붙인다
      const question = detectQuestion(answer)
      const chunks = splitForMessenger(question ? `${formatted}\n\n${questionHint(question)}` : formatted)
      const asked = (logId: string | null, text: string): PublishedQuestion | null => (question && logId ? { logId, text, question } : null)
      // 한 조각짜리 짧은 답은 진행 메시지 자리에 답을 고쳐 쓴다 — 턴마다 메시지가 하나 줄어든다
      if (chunks.length === 1 && req.progressLogId) {
        const text = `${MESSAGE_PREFIX} ✅ ${formatElapsed(elapsedMs)}\n${chunks[0]}`
        if (await this.replaceProgress(req, text)) return asked(req.progressLogId, text)
      }
      await this.finishProgress(req, elapsedMs)
      let lastLogId: string | null = null
      let lastText = ''
      for (const chunk of chunks) {
        lastText = withPrefix(chunk)
        lastLogId = await this.safeSend(req.channelId, lastText, req.organizationId)
      }
      return asked(lastLogId, lastText)
    }

    await this.finishProgress(req, elapsedMs)

    const chunks = splitForMessenger(formatted)
    const detailNote = req.inThread ? `아래 ${chunks.length}개` : `글타래 ${chunks.length}개`
    const card = buildCompletionCard({ answer, elapsedMs, detailNote })
    const rootText = MESSAGE_PREFIX
    const labeled = labelChunks(chunks)

    if (req.inThread) {
      await this.safeCard(req.channelId, rootText, card, req.organizationId)
      for (const c of labeled) await this.safeSend(req.channelId, c, req.organizationId)
      return null
    }

    let threadChannelId: string | null = null
    try {
      const res = await this.messenger.createThreadAndSend(req.channelId, { text: rootText, attachments: [card] }, labeled[0])
      threadChannelId = res.threadChannelId
    } catch (err) {
      console.warn(`[ResultPublisher] 글타래 생성 실패 channelId=${req.channelId}:`, err)
    }
    if (!threadChannelId) {
      // 글타래를 못 만들었으면 같은 채널에 카드와 전문을 이어 보낸다 — 응답을 잃지 않는 게 우선.
      await this.safeCard(req.channelId, rootText, card, req.organizationId)
      for (const c of labeled) await this.safeSend(req.channelId, c, req.organizationId)
      return null
    }
    for (const c of labeled.slice(1)) await this.safeSend(threadChannelId, c, req.organizationId)
    return null
  }

  private async replaceProgress(req: PublishRequest, text: string): Promise<boolean> {
    try {
      await this.messenger.updateMessage(req.channelId, req.progressLogId!, text)
      return true
    } catch (err) {
      console.warn(`[ResultPublisher] 진행 메시지에 답 쓰기 실패 — 새 메시지로 channelId=${req.channelId} logId=${req.progressLogId}:`, err)
      return false
    }
  }

  private async finishProgress(req: PublishRequest, elapsedMs: number): Promise<void> {
    if (!req.progressLogId) return
    try {
      await this.messenger.updateMessage(req.channelId, req.progressLogId, `${MESSAGE_PREFIX} ✅ 완료 · ${formatElapsed(elapsedMs)} ↓`)
    } catch (err) {
      console.warn(`[ResultPublisher] 진행 메시지 완료 처리 실패 channelId=${req.channelId} logId=${req.progressLogId}:`, err)
    }
  }

  private async safeSend(channelId: string, text: string, orgId?: string): Promise<string | null> {
    try {
      return await this.messenger.sendMessage(channelId, text, orgId)
    } catch (err) {
      console.warn(`[ResultPublisher] 송신 실패 channelId=${channelId}:`, err)
      return null
    }
  }

  private async safeCard(channelId: string, text: string, card: Parameters<Messenger['sendCard']>[2][number], orgId?: string): Promise<void> {
    try {
      await this.messenger.sendCard(channelId, text, [card], orgId)
    } catch (err) {
      console.warn(`[ResultPublisher] 카드 송신 실패 channelId=${channelId}:`, err)
    }
  }
}

/** 한 줄이면 접두어를 같은 줄에, 여러 줄이면 접두어를 첫 줄에 따로 둔다. */
export function withPrefix(text: string): string {
  return text.includes('\n') ? `${MESSAGE_PREFIX}\n${text}` : `${MESSAGE_PREFIX} ${text}`
}

function labelChunks(chunks: string[]): string[] {
  if (chunks.length <= 1) return chunks
  return chunks.map((c, i) => `(${i + 1}/${chunks.length})\n${c}`)
}
