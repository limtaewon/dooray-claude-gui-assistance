import { basename, relative, sep } from 'path'
import { readLastAssistantText } from './transcriptReader'
import type { HookRoute } from '../../hooks/ClaudeHookRouter'
import type { HookEventPayload } from './HookServer'
import type { ChannelSessionStore } from './ChannelSessionStore'
import type { ResultPublisher } from './agent/ResultPublisher'
import type { MentionTurnTracker } from './agent/MentionTurnTracker'
import type { ProgressReporter } from './agent/ProgressReporter'
import { toHookResponse, type ApprovalBroker } from './agent/ApprovalBroker'
import { classifyDanger } from './agent/DangerGate'
import type { AlwaysAllowStore } from './agent/AlwaysAllowStore'

export const MENTION_HOOK_KIND = 'mention'

export interface MentionHookDeps {
  /** agentRoot 는 부팅 후 사용자 커스텀 설정으로 바뀔 수 있어 값이 아닌 thunk 로 받는다 */
  getAgentRoot: () => string
  sessions: Pick<ChannelSessionStore, 'get' | 'setClaudeSessionId' | 'markIdle'>
  publisher: Pick<ResultPublisher, 'publish'>
  turns: Pick<MentionTurnTracker, 'onPromptSubmit' | 'onStop' | 'current'>
  /** 두레이 승인 — 없으면 위험 동작도 막지 않는다 */
  approvals?: Pick<ApprovalBroker, 'request'>
  /** 두레이 승인 모드인지 (아니면 자율 — 아무것도 묻지 않는다). 설정을 바꾸면 즉시 반영되도록 thunk */
  isGateEnabled?: () => boolean
  /** "항상 승인" 기억 */
  alwaysAllow?: Pick<AlwaysAllowStore, 'has' | 'add'>
  /** 진행 메시지 단계 갱신 */
  progress?: Pick<ProgressReporter, 'onTool' | 'stop'>
  readTranscript?: (path: string) => string
}

/**
 * @clauday 멘션 채널의 claude code hook(UserPromptSubmit/Stop) 처리.
 * resolve 로 cwd → channelId 를 판별하고, 멘션이 연 턴이 끝나면 응답을 두레이로 회신한다.
 * 도구 사용 내역은 두레이에 내보내지 않는다(기획 §5.3).
 */
export class MentionHookHandler {
  private readonly deps: MentionHookDeps & { readTranscript: (path: string) => string }

  constructor(deps: MentionHookDeps) {
    this.deps = { readTranscript: readLastAssistantText, ...deps }
  }

  /**
   * PreToolUse — 진행 단계를 갱신하고, 위험 동작(DangerGate)이면 두레이 승인을 받아 결정을 돌려준다.
   * 권한 확인 없이 도는 모드라 여기서 결정하지 않으면(null) 도구는 그대로 실행된다.
   * 멘션 턴이 끝난 뒤 백그라운드로 이어진 작업도 같은 자리로 묻는다. 사람이 TUI 에 직접 친 턴은 묻지 않는다.
   */
  async decide(ev: HookEventPayload, route: HookRoute, signal: AbortSignal): Promise<Record<string, unknown> | null> {
    if (ev.event !== 'pre_tool_use') return null
    const toolName = ev.tool_name || (typeof ev.raw.tool_name === 'string' ? ev.raw.tool_name : '')
    if (!toolName) return null
    this.deps.progress?.onTool(route.id, toolName)
    if (!this.deps.approvals || !this.deps.isGateEnabled?.()) return null

    const toolInput = (ev.tool_input || (ev.raw.tool_input as Record<string, unknown> | undefined) || {}) as Record<string, unknown>
    const danger = classifyDanger(toolName, toolInput)
    if (!danger) return null
    const turn = this.deps.turns.current(route.id)
    if (!turn) return null
    if (this.deps.alwaysAllow?.has(route.id, danger.signature)) return null

    const decision = await this.deps.approvals.request({
      channelId: route.id,
      replyChannelId: turn.replyChannelId,
      organizationId: turn.organizationId,
      toolName,
      toolInput,
      reason: danger.label,
      signal
    })
    if (decision?.behavior === 'allow' && decision.always) this.deps.alwaysAllow?.add(route.id, danger.signature)
    return toHookResponse(decision)
  }

  /** cwd 가 agentRoot 하위 채널 폴더면 { kind: MENTION_HOOK_KIND, id: channelId }, 아니면 null. */
  resolve(cwd: string): HookRoute | null {
    if (!cwd) return null
    const agentRoot = this.deps.getAgentRoot()
    // 경로 경계까지 본다 — `${agentRoot}-sibling` 같은 형제 폴더를 멘션 채널('..')로 잡지 않도록
    if (!cwd.startsWith(agentRoot + sep)) return null
    const seg = relative(agentRoot, cwd).split(sep)[0]
    if (!seg || seg === '..') return null
    return { kind: MENTION_HOOK_KIND, id: seg }
  }

  async handle(ev: HookEventPayload, route: HookRoute): Promise<void> {
    const channelId = route.id

    if (ev.event === 'user_prompt_submit') {
      const prompt = typeof ev.raw.prompt === 'string' ? ev.raw.prompt : ''
      const kind = this.deps.turns.onPromptSubmit(channelId, prompt)
      if (kind === 'manual') console.log(`[MentionHook] TUI 직접 입력 턴 — 두레이 회신 안 함 channelId=${channelId}`)
      return
    }

    if (ev.event !== 'stop') return

    const transcriptPath = (ev.raw.transcript_path as string | undefined) || ''
    // transcript 파일명이 곧 claude session id (xxx.jsonl) — 다음 spawn 시 --resume에 사용
    if (transcriptPath) {
      const sid = basename(transcriptPath).replace(/\.jsonl$/, '')
      if (sid) this.deps.sessions.setClaudeSessionId(channelId, sid)
    }
    this.deps.sessions.markIdle(channelId)

    const decision = this.deps.turns.onStop(channelId)
    if (decision.kind === 'manual') return

    // claude code가 hook payload에 last_assistant_message를 직접 넣어준다 — 없으면 transcript 에서.
    let answer = extractAssistantMessage(ev.raw.last_assistant_message)
    if (!answer && transcriptPath) answer = this.deps.readTranscript(transcriptPath)

    const { turn } = decision
    // 보내는 중인 진행 갱신이 완료 표기를 덮지 않게 먼저 멈춘다
    if (!decision.followUp) await this.deps.progress?.stop(channelId)
    await this.deps.publisher.publish({
      channelId: turn.replyChannelId,
      inThread: turn.inThread,
      organizationId: turn.organizationId ?? this.deps.sessions.get(channelId)?.organizationId,
      answer,
      startedAt: turn.startedAt,
      progressLogId: turn.progressLogId
    })
  }
}

/** claude code가 hook payload에 넣어주는 last_assistant_message → 평문 텍스트.
 *  형식 후보: string / { content: [{type:'text', text}] } / { text: string } */
export function extractAssistantMessage(raw: unknown): string {
  if (!raw) return ''
  if (typeof raw === 'string') return raw.trim()
  if (typeof raw !== 'object') return ''
  const m = raw as { content?: unknown; text?: unknown; message?: unknown }
  if (typeof m.text === 'string') return m.text.trim()
  if (m.message && typeof m.message === 'object') {
    return extractAssistantMessage(m.message)
  }
  if (Array.isArray(m.content)) {
    const parts: string[] = []
    for (const b of m.content) {
      if (b && typeof b === 'object') {
        const blk = b as { type?: string; text?: unknown }
        if (blk.type === 'text' && typeof blk.text === 'string') parts.push(blk.text)
      } else if (typeof b === 'string') {
        parts.push(b)
      }
    }
    return parts.join('\n').trim()
  }
  if (typeof m.content === 'string') return m.content.trim()
  return ''
}
