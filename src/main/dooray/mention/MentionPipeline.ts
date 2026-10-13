import type { MentionContext } from './MentionDispatcher'
import type { ContextCollector } from './ContextCollector'
import type { AgentWorkspaceManager } from './AgentWorkspaceManager'
import type { MentionTerminalSpawner } from './MentionTerminalSpawner'
import type { ClaudayResponder } from './ClaudayResponder'
import type { ChannelSessionStore } from './ChannelSessionStore'
import type { MentionTurnTracker } from './agent/MentionTurnTracker'
import type { ProgressReporter } from './agent/ProgressReporter'
import { buildPromptFromContext, extractUserRequest } from './promptBuilder'
import { extractOrgId } from './ClaudayResponder'

/** 이보다 오래된 멘션은 늦게 발견돼도 자동 실행하지 않는다 — 상황이 바뀌었을 수 있다(기획 §5.8) */
export const STALE_MENTION_MS = 3 * 60 * 60 * 1000
/** 이보다 늦게 시작하면 진행 메시지에 지연을 밝힌다 */
const DELAY_NOTICE_MS = 60 * 1000

export interface MentionPipelineDeps {
  spawner: Pick<MentionTerminalSpawner, 'tryReserve' | 'release' | 'dispatch'>
  collector: Pick<ContextCollector, 'collect'>
  workspace: Pick<AgentWorkspaceManager, 'ensureChannel' | 'writeTaskPrompt' | 'saveAttachment'>
  responder: Pick<ClaudayResponder, 'send'>
  sessions: Pick<ChannelSessionStore, 'get' | 'set'>
  turns: Pick<MentionTurnTracker, 'begin' | 'setProgressLogId' | 'cancel'>
  /** 진행 메시지를 작업 단계에 맞춰 고쳐 쓴다 */
  progress?: Pick<ProgressReporter, 'start'>
  getWindowSize: () => number
  getTrigger: () => string
  /** OS 알림 + 렌더러 배지 */
  onReceived: (info: { channelId: string; channelName: string; text: string; logId: string; sentAt?: string }) => void
  now?: () => number
}

/**
 * @clauday 멘션 하나를 처리한다: 선점 → 컨텍스트 수집 → 프롬프트 파일 → 진행 메시지 → claude 입력.
 * 실시간 멘션과 놓친 멘션 찾기(catch-up)가 같은 경로를 탄다.
 */
export class MentionPipeline {
  constructor(private deps: MentionPipelineDeps) {}

  async handle(ctx: MentionContext): Promise<void> {
    const orgId = extractOrgId(ctx)
    const now = this.deps.now?.() ?? Date.now()

    if (ctx.delayedMs !== undefined && ctx.delayedMs > STALE_MENTION_MS) {
      const hours = Math.floor(ctx.delayedMs / 3_600_000)
      await this.deps.responder.send(
        ctx.channelId,
        `⏰ ${hours}시간 전 요청을 지금 확인했습니다 (노트북이 꺼져 있었습니다). 상황이 바뀌었을 수 있어 자동으로 실행하지 않았습니다 — 필요하면 다시 멘션해 주세요.`,
        orgId
      )
      console.log(`[Mention] 오래된 멘션 실행 안 함 channelId=${ctx.channelId} logId=${ctx.logId} delayed=${hours}h`)
      return
    }

    // 동시 작업 차단 — 확인과 선점을 한 번에 해 수집(await) 중 들어온 같은 채널 멘션도 막는다.
    const reserve = this.deps.spawner.tryReserve(ctx.channelId)
    if (!reserve.ok) {
      const minutes = Math.max(1, Math.floor(reserve.sinceMs / 60000))
      await this.deps.responder.send(ctx.channelId, `이전 작업이 아직 진행 중입니다 (시작 ${minutes}분 전). 끝나면 다시 호출해주세요.`, orgId)
      console.log(`[Mention] busy 거부 channelId=${ctx.channelId} since=${minutes}m`)
      return
    }

    try {
      const collected = await this.deps.collector.collect(ctx.channelId, ctx.logId, this.deps.getWindowSize(), ctx.channelDisplayName, {
        parentChannelId: ctx.isThread ? ctx.parentChannelId : undefined,
        saveAttachment: (fileId, fileName, data) => this.deps.workspace.saveAttachment(ctx.channelId, fileId, fileName, data)
      })
      const ws = this.deps.workspace.ensureChannel(ctx.channelId, collected.channelName)
      const promptRelPath = this.deps.workspace.writeTaskPrompt(ctx.channelId, ctx.logId, buildPromptFromContext(collected))

      this.deps.onReceived({ channelId: ctx.channelId, channelName: collected.channelName, text: ctx.text, logId: ctx.logId, sentAt: ctx.sentAt })

      // 회신 자리를 먼저 기억해 둔다 — claude 가 진행 메시지 송신보다 빨리 끝나도 Stop 에서 찾을 수 있게.
      this.deps.turns.begin(ctx.channelId, {
        logId: ctx.logId,
        replyChannelId: ctx.channelId,
        inThread: !!ctx.isThread,
        organizationId: orgId,
        progressLogId: null,
        startedAt: now
      })
      const delayNote =
        ctx.delayedMs !== undefined && ctx.delayedMs > DELAY_NOTICE_MS
          ? ` (⏰ 노트북이 깨어나 ${Math.round(ctx.delayedMs / 60000)}분 늦게 시작)`
          : ''
      const progressLogId = await this.deps.responder.send(ctx.channelId, `⏳ 작업을 시작합니다${delayNote}`, orgId)
      this.deps.turns.setProgressLogId(ctx.channelId, progressLogId)
      this.deps.progress?.start(ctx.channelId, { replyChannelId: ctx.channelId, progressLogId, startedAt: now })

      // organizationId 를 세션에 저장 (Stop hook 회신 때 재사용)
      this.deps.sessions.set(ctx.channelId, this.deps.sessions.get(ctx.channelId)?.tabId || '', collected.channelName, orgId)

      const result = await this.deps.spawner.dispatch({
        channelId: ctx.channelId,
        channelName: collected.channelName,
        channelDir: ws.channelDir,
        promptRelPath,
        userRequest: extractUserRequest(ctx.text, this.deps.getTrigger())
      })
      // dispatch 가 set 을 또 호출하니 orgId 가 누락되지 않게 한 번 더 보강
      const cur = this.deps.sessions.get(ctx.channelId)
      if (cur && !cur.organizationId && orgId) this.deps.sessions.set(ctx.channelId, cur.tabId, cur.channelName, orgId)
      console.log(
        `[Mention] dispatch 완료 channelId=${ctx.channelId} logId=${ctx.logId} tabId=${result.tabId} reused=${result.reused} ` +
          `messages=${collected.messages.length} thread=${collected.inThread} root=${collected.threadRoot ? 'Y' : 'N'} masked=${collected.maskedSecrets}`
      )
    } catch (err) {
      this.deps.spawner.release(ctx.channelId)
      this.deps.turns.cancel(ctx.channelId)
      console.error(`[Mention] 파이프라인 실패 channelId=${ctx.channelId} logId=${ctx.logId}:`, err)
      await this.deps.responder.send(ctx.channelId, '⚠️ 작업을 시작하지 못했습니다. Clauday 앱 로그를 확인해 주세요.', orgId)
    }
  }
}
